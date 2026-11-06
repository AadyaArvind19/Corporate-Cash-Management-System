import { NextRequest, NextResponse } from 'next/server';
import { ZodError, ZodTypeAny, z } from 'zod';
import { currentUser, CurrentUser, Role } from './auth';

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

type Ctx<P> = { req: NextRequest; user: CurrentUser; params: P };

/** Maps PostgreSQL errors to clear, safe client messages. */
function mapDbError(e: any): ApiError | null {
  if (!e || typeof e.code !== 'string') return null;
  const c = e.constraint as string | undefined;
  switch (e.code) {
    case '23505': return new ApiError(409, c === 'uq_one_treasury_per_corp'
      ? 'This corporation already has an open treasury account'
      : c?.startsWith('uq_users') ? 'That username or email is already in use'
      : 'A record with the same unique value already exists', 'DUPLICATE');
    case '23503': return new ApiError(409, String(e.detail ?? '').includes('is still referenced')
      ? 'This record is referenced by other records and cannot be removed; deactivate or close it instead'
      : 'A referenced record does not exist or belongs to another corporation', 'REFERENCE');
    case '23514': return new ApiError(422, ({
      ck_closed_requires_zero: 'An account can only be closed when its balance is zero',
      ck_balance_nonneg: 'Balance cannot be negative',
      ck_corridor_banks: 'A corridor must connect two different banks',
      ck_rate_distinct: 'Base and quote currency must differ'
    } as Record<string, string>)[c ?? ''] ?? `Value rejected by database rule ${c ?? ''}`.trim(), 'CHECK');
    case '23502': return new ApiError(422, 'A required value is missing', 'NULL');
    case '22P02': case '22003': case '22007': return new ApiError(422, 'A value has an invalid format', 'FORMAT');
    case '23000': return new ApiError(409, e.message, 'IMMUTABLE');
    case '42501': return new ApiError(403, e.message, 'FORBIDDEN');
    case 'P0002': return new ApiError(422, e.message, 'NOT_ELIGIBLE');
    case 'P0001': return new ApiError(422, e.message, 'RULE');
    default: return null;
  }
}

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const msg = (r.error as ZodError).issues.map((i) => `${i.path.join('.') || 'value'}: ${i.message}`).join('; ');
    throw new ApiError(400, msg, 'VALIDATION');
  }
  return r.data;
}

export async function readJson(req: NextRequest): Promise<unknown> {
  try { return await req.json(); } catch { throw new ApiError(400, 'Request body must be valid JSON', 'VALIDATION'); }
}

export function ipOf(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
}

/**
 * Wraps a Route Handler with authentication, role authorisation, same-origin protection for
 * state-changing calls and uniform error responses.
 */
export function route<P = Record<string, string>>(
  opts: { roles?: Role[]; public?: boolean },
  fn: (ctx: Ctx<P>) => Promise<unknown>
) {
  return async (req: NextRequest, ctx: { params: Promise<P> }) => {
    try {
      if (!['GET', 'HEAD'].includes(req.method)) {
        const origin = req.headers.get('origin');
        if (origin && new URL(origin).host !== req.headers.get('host')) throw new ApiError(403, 'Cross-origin request rejected');
      }
      let user: CurrentUser | null = null;
      if (!opts.public) {
        user = await currentUser();
        if (!user) throw new ApiError(401, 'Authentication required');
        if (opts.roles && !opts.roles.includes(user.role)) throw new ApiError(403, 'Your role is not permitted to perform this action');
      }
      const params = (ctx ? await ctx.params : {}) as P;
      const out = await fn({ req, user: user as CurrentUser, params });
      return out instanceof NextResponse ? out : NextResponse.json(out ?? { ok: true });
    } catch (e: any) {
      const mapped = e instanceof ApiError ? e : mapDbError(e);
      if (mapped) return NextResponse.json({ error: mapped.message, code: mapped.code }, { status: mapped.status });
      console.error('[api] unexpected error', e);
      return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
    }
  };
}

export const id = z.coerce.number().int().positive();
export const money = z.string().regex(/^\d{1,16}(\.\d{1,2})?$/, 'Enter an amount with up to 2 decimals');
