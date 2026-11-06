import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Corporate Cash Management', template: '%s · Corporate Cash Management' },
  description: 'Multi-currency liquidity monitoring and sweeping to a central treasury account.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
