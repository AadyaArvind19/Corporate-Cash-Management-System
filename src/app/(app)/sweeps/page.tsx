
import Link from 'next/link';
import { currentUser, can } from '@/lib/auth';
import { planSweeps } from '@/lib/services/sweeps';
import { PageHead, Section } from '@/components/ui';
import { ExecutePanel, type PlanRow } from '@/components/client';

export const metadata = { title: 'Sweeps' };

export default async function Sweeps() {
  const user = (await currentUser())!;

  const rows = (await planSweeps(user.corpId)) as unknown as PlanRow[];


  return (
    <>
      <PageHead
        title="Sweep plan"
        sub="Surplus above each account's minimum reserve moves to the treasury account over the cheapest corridor; accounts below reserve are topped up from treasury."
      >
        <Link className="btn secondary" href="/sweeps/history">
          Transfer history
        </Link>
      </PageHead>

      <ExecutePanel
        rows={rows}
        canExecute={can.operate(user.role)}
      />

      <Section title="How the plan is built">
        <p className="note" style={{ maxWidth: 820 }}>
          Fees are paid from the sending account, so the amount moved is
          reduced to keep the account at or above its minimum reserve after
          fees. Funding never takes the treasury account below its own
          reserve; shortfalls are served largest first. Rates are the latest
          recorded quotes. Execution recalculates the plan under a lock,
          so stale screens cannot move more cash than is available.
        </p>
      </Section>
    </>
  );
}
