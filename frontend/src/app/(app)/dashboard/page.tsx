import { loadWorkspace } from '@/lib/workspace';

/**
 * Landing screen after onboarding. The app layout has already resolved and
 * guarded the workspace; we re-read it from the request-level cache (no extra
 * backend call) to greet the user by their active business.
 */
export default async function DashboardPage(): Promise<React.JSX.Element | null> {
  const workspace = await loadWorkspace();
  // The layout handles the empty/error cases before this page renders.
  if (workspace.status !== 'ready') return null;

  const { active } = workspace;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome to {active.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          {active.industry ? `${active.industry} · ` : ''}Your workspace is
          ready.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-6">
        <h2 className="font-semibold">Your daily follow-up list is coming</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Customers, sales and the “who to contact today” recommendations arrive
          in the next phases. Your business is set up and ready for them.
        </p>
      </div>
    </div>
  );
}
