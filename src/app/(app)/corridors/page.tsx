import { currentUser, can } from '@/lib/auth';
import { listCorridors, listBanks, currencies } from '@/lib/services/reference';
import { PageHead, Section } from '@/components/ui';
import { CorridorTable, NewCorridorForm, RouteFinder } from '@/components/client';

export const metadata = { title: 'Routing corridors' };

export default async function Corridors() {
  const user = (await currentUser())!;
  const [rows, banks, ccys] = await Promise.all([listCorridors(), listBanks(), currencies()]);
  const admin = can.manageStructure(user.role);
  return (
    <>
      <PageHead title="Routing corridors" sub="Directed bank-to-bank transfer paths with their cost and latency. Transfers may chain up to three corridors." />
      <CorridorTable rows={rows as any} canEdit={admin} />
      <Section title="Route finder"><div className="panel panel-pad"><RouteFinder banks={banks as any} currencies={ccys as any} /></div></Section>
      {admin && <Section title="Add corridor"><details className="disclose"><summary>New corridor</summary><div className="body"><NewCorridorForm banks={banks as any} currencies={ccys as any} /></div></details></Section>}
    </>
  );
}
