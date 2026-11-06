'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Item = { href: string; label: string };
export function Nav({ groups }: { groups: { title: string; items: Item[] }[] }) {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Main">
      {groups.map((g) => (
        <div key={g.title}>
          <div className="group">{g.title}</div>
          {g.items.map((i) => (
            <Link key={i.href} href={i.href} aria-current={path === i.href || path.startsWith(i.href + '/') ? 'page' : undefined}>{i.label}</Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
