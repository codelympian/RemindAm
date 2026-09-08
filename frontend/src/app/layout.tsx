import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RemindAm — Your daily sales assistant',
  description: 'Know exactly who to follow up with today.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): JSX.Element {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
