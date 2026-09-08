import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';
import type { UserProfile } from '@remindam/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function fetchProfile(): Promise<UserProfile | null> {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) return null;

  try {
    const res = await fetch(`${API_URL}/api/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as UserProfile;
  } catch {
    return null;
  }
}

export default async function AccountPage(): Promise<React.JSX.Element> {
  const profile = await fetchProfile();
  const displayName =
    [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || '—';

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Your account</h1>
        <p className="text-sm text-muted-foreground">
          Synchronized from Clerk into the RemindAm database on your first
          authenticated request.
        </p>
      </div>

      {profile ? (
        <dl className="space-y-3 rounded-xl border bg-card p-6">
          <DetailRow label="Name" value={displayName} />
          <DetailRow label="Email" value={profile.email} />
          <DetailRow label="Database ID" value={profile.id} mono />
          <DetailRow label="Clerk ID" value={profile.clerkUserId} mono />
          <DetailRow
            label="Member since"
            value={new Date(profile.createdAt).toLocaleString()}
          />
        </dl>
      ) : (
        <div className="rounded-xl border bg-card p-6">
          <p className="text-sm text-destructive">
            Could not load your profile from {API_URL}/api/me. Make sure the
            backend is running with <code>npm run dev:backend</code>.
          </p>
        </div>
      )}

      <Link href="/" className="text-sm font-medium text-primary hover:underline">
        ← Back home
      </Link>
    </main>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="font-medium">{label}</dt>
      <dd className={`text-sm text-muted-foreground ${mono ? 'font-mono' : ''}`}>
        {value}
      </dd>
    </div>
  );
}
