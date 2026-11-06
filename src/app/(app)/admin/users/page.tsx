import { redirect } from 'next/navigation';
import { currentUser, can } from '@/lib/auth';
import { listUsers } from '@/lib/services/users';
import { PageHead, Section } from '@/components/ui';
import { UsersPanel, NewUserForm } from '@/components/client';

export const metadata = { title: 'Users' };

export default async function Users() {
  const user = (await currentUser())!;
  if (!can.manageUsers(user.role)) redirect('/overview');
  const users = await listUsers(user.corpId);
  return (
    <>
      <PageHead title="Users" sub="Administrators manage entities and users; treasurers execute sweeps and post balances; analysts have read-only access." />
      <UsersPanel users={users as any} selfId={user.userId} />
      <Section title="Add user"><div className="panel panel-pad"><NewUserForm /></div></Section>
    </>
  );
}
