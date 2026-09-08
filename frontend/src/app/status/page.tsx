import type { HealthStatus } from '@remindam/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function fetchHealth(): Promise<HealthStatus | null> {
  try {
    const res = await fetch(`${API_URL}/api/health`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as HealthStatus;
  } catch {
    return null;
  }
}

export default async function StatusPage(): Promise<React.JSX.Element> {
  const health = await fetchHealth();
  const reachable = health !== null;
  const dbUp = health?.database === 'up';

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">System status</h1>
        <p className="text-sm text-muted-foreground">
          Live check of the RemindAm backend and database connection.
        </p>
      </div>

      <div className="space-y-3 rounded-xl border bg-card p-6">
        <StatusRow label="Backend API" ok={reachable} okText="Reachable" badText="Unreachable" />
        <StatusRow
          label="Database"
          ok={reachable && dbUp}
          okText="Connected"
          badText={reachable ? 'Down' : 'Unknown'}
        />
        {health && (
          <p className="pt-2 text-xs text-muted-foreground">
            Reported {health.timestamp} by {health.service}
          </p>
        )}
        {!reachable && (
          <p className="pt-2 text-xs text-destructive">
            Could not reach {API_URL}/api/health. Start the backend with{' '}
            <code>npm run dev:backend</code>.
          </p>
        )}
      </div>
    </main>
  );
}

function StatusRow({
  label,
  ok,
  okText,
  badText,
}: {
  label: string;
  ok: boolean;
  okText: string;
  badText: string;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between">
      <span className="font-medium">{label}</span>
      <span
        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${
          ok ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'
        }`}
      >
        <span className={`h-2 w-2 rounded-full ${ok ? 'bg-primary' : 'bg-destructive'}`} />
        {ok ? okText : badText}
      </span>
    </div>
  );
}
