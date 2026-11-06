import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { LoginForm } from '@/components/client';

export const metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await currentUser()) redirect('/overview');
  return (
    <div className="login-wrap">
      <div className="login-art">
        <strong style={{ letterSpacing: '.04em' }}>CORPORATE CASH MANAGEMENT</strong>
        <div>
          <h1>One view of cash across every bank, currency and subsidiary.</h1>
          <p style={{ marginTop: 14 }}>Monitor reserve positions, route surplus funds to the central treasury account at the lowest transfer cost, and keep every movement on an auditable ledger.</p>
        </div>
        <small>Authorised users only. Activity is logged.</small>
      </div>
      <div className="login-form">
        <div style={{ width: '100%', maxWidth: 340 }}>
          <h2>Sign in</h2>
          <p className="muted">Use the credentials issued by your administrator.</p>
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
