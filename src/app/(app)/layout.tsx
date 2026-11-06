import { redirect } from 'next/navigation';
import { currentUser, can } from '@/lib/auth';
import { Nav } from '@/components/nav';
import { LogoutButton } from '@/components/client';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect('/login');
  const groups = [
    { title: 'Cash', items: [{ href: '/overview', label: 'Overview' }, { href: '/accounts', label: 'Accounts' }, { href: '/sweeps', label: 'Sweeps' }] },
    { title: 'Market & network', items: [{ href: '/rates', label: 'Exchange rates' }, { href: '/corridors', label: 'Routing corridors' }] },
    { title: 'Analysis', items: [{ href: '/reports', label: 'Reports' }] },
    ...(can.manageUsers(user.role)
      ? [{ title: 'Administration', items: [{ href: '/admin/users', label: 'Users' }, { href: '/admin/structure', label: 'Entities & banks' }, { href: '/admin/audit', label: 'Audit log' }] }]
      : [])
  ];
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand"><strong>Corporate Cash Management</strong><span>{user.corpName}</span></div>
        <Nav groups={groups} />
        <div className="who">
          <div>{user.fullName}</div>
          <div className="role">{user.role.charAt(0) + user.role.slice(1).toLowerCase()} · {user.baseCurrency}</div>
          <LogoutButton />
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
