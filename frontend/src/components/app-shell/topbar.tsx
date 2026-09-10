'use client';

import { UserButton } from '@clerk/nextjs';
import { Bell, Menu, Search } from 'lucide-react';
import Link from 'next/link';
import { useActiveBusiness } from './business-context';
import { BusinessSwitcher } from './business-switcher';

/**
 * Shell top bar (§17): the active business (or a switcher when there are
 * several), search and notifications, and the Clerk user menu. Search and
 * notifications arrive in later phases, so they are rendered present but
 * disabled — honestly inert rather than faked. `onMenuClick` opens the mobile
 * navigation drawer.
 */
export function Topbar({
  onMenuClick,
}: {
  onMenuClick: () => void;
}): React.JSX.Element {
  const { active, businesses } = useActiveBusiness();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur lg:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Open navigation"
        className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      {businesses.length > 1 ? (
        <BusinessSwitcher businesses={businesses} activeId={active.id} />
      ) : (
        <span className="max-w-[12rem] truncate text-sm font-semibold">
          {active.name}
        </span>
      )}

      <div className="relative ml-auto hidden items-center md:flex">
        <Search
          className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="search"
          disabled
          placeholder="Search — coming soon"
          aria-label="Search (coming soon)"
          className="w-56 cursor-not-allowed rounded-lg border bg-muted/40 py-2 pl-9 pr-3 text-sm text-muted-foreground placeholder:text-muted-foreground"
        />
      </div>

      <button
        type="button"
        disabled
        title="Notifications — coming soon"
        aria-label="Notifications (coming soon)"
        className="ml-auto cursor-not-allowed rounded-lg p-2 text-muted-foreground md:ml-0"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
      </button>

      <Link
        href="/account"
        className="hidden text-sm font-medium text-muted-foreground hover:text-foreground sm:block"
      >
        Account
      </Link>

      <UserButton />
    </header>
  );
}
