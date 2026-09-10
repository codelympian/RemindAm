import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell/app-shell';
import { WorkspaceError } from '@/components/workspace-error';
import { loadWorkspace } from '@/lib/workspace';

/**
 * Protected layout for every authenticated app route. Resolves the workspace
 * once on the server (deduped via React `cache()`), sends users with no business
 * to onboarding, surfaces load failures, and otherwise renders the app shell
 * around the page. The route group `(app)` adds this chrome without changing any
 * URLs.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.JSX.Element> {
  const workspace = await loadWorkspace();

  if (workspace.status === 'empty') {
    redirect('/onboarding');
  }

  if (workspace.status === 'error') {
    return (
      <WorkspaceError
        kind={workspace.kind}
        httpStatus={workspace.httpStatus}
        detail={workspace.detail}
      />
    );
  }

  return (
    <AppShell active={workspace.active} businesses={workspace.businesses}>
      {children}
    </AppShell>
  );
}
