import { redirect } from 'next/navigation';
import { currentUser, can } from '@/lib/auth';
import { listSubsidiaries, listBanks } from '@/lib/services/reference';
import { PageHead } from '@/components/ui';
import { StructurePanel } from '@/components/client';

export const metadata = { title: 'Entities & banks' };

export default async function Structure() {
  const user = (await currentUser())!;
  if (!can.manageStructure(user.role)) redirect('/overview');
  const [subs, banks] = await Promise.all([listSubsidiaries(user.corpId), listBanks()]);
  return (
    <>
      <PageHead title="Entities & banks" sub="Legal entities of the corporation and the bank directory shared by all accounts and corridors." />
      <StructurePanel subs={subs as any} banks={banks as any} />
    </>
  );
}
