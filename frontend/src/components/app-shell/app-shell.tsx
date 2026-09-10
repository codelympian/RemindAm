'use client';

import { X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import type { BusinessSummary } from '@remindam/shared';
import { BusinessProvider } from './business-context';
import { SidebarNav } from './sidebar-nav';
import { Topbar } from './topbar';

/**
 * The authenticated application shell (§17): a fixed sidebar on desktop, a
 * slide-over drawer on mobile, and a sticky top bar — wrapping every app route.
 * Business context (resolved and validated on the server) is provided here so
 * descendants can read the active business without re-fetching.
 */
export function AppShell({
  active,
  businesses,
  children,
}: {
  active: BusinessSummary;
  businesses: BusinessSummary[];
  children: React.ReactNode;
}): React.JSX.Element {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <BusinessProvider value={{ active, businesses }}>
      <div className="flex min-h-screen">
        {/* Desktop sidebar */}
        <aside className="hidden w-64 shrink-0 flex-col border-r bg-card lg:flex">
          <div className="flex h-16 items-center px-6">
            <Link href="/dashboard" className="text-lg font-bold text-primary">
              RemindAm
            </Link>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-4">
            <SidebarNav />
          </div>
        </aside>

        {/* Mobile navigation drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => setMobileOpen(false)}
              className="absolute inset-0 bg-foreground/40"
            />
            <aside className="absolute left-0 top-0 flex h-full w-72 max-w-[80%] flex-col border-r bg-card shadow-xl">
              <div className="flex h-16 items-center justify-between px-6">
                <Link
                  href="/dashboard"
                  onClick={() => setMobileOpen(false)}
                  className="text-lg font-bold text-primary"
                >
                  RemindAm
                </Link>
                <button
                  type="button"
                  aria-label="Close navigation"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-3 pb-4">
                <SidebarNav onNavigate={() => setMobileOpen(false)} />
              </div>
            </aside>
          </div>
        )}

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar onMenuClick={() => setMobileOpen(true)} />
          <main className="flex flex-1 flex-col px-4 py-6 lg:px-8">
            {children}
          </main>
        </div>
      </div>
    </BusinessProvider>
  );
}
