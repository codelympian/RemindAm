import Link from 'next/link';

export default function HomePage(): JSX.Element {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 px-6 text-center">
      <span className="rounded-full bg-primary/10 px-4 py-1 text-sm font-medium text-primary">
        RemindAm
      </span>
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
        Know exactly who to follow up with today.
      </h1>
      <p className="max-w-xl text-lg text-muted-foreground">
        RemindAm helps you find the customers and leads most likely to buy — and tells you who to
        contact today.
      </p>
      <div className="flex gap-3">
        <span className="rounded-lg bg-primary px-5 py-2.5 font-medium text-primary-foreground">
          Get started
        </span>
        <Link href="/status" className="rounded-lg border px-5 py-2.5 font-medium hover:bg-accent">
          System status
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        Phase 0 foundation. Marketing site and auth arrive in later phases.
      </p>
    </main>
  );
}
