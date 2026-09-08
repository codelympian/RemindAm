import { Show, SignInButton, SignUpButton, UserButton } from '@clerk/nextjs';
import Link from 'next/link';

export default function HomePage(): React.JSX.Element {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <span className="text-lg font-bold text-primary">RemindAm</span>
        <nav className="flex items-center gap-3">
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button className="rounded-lg px-4 py-2 text-sm font-medium hover:bg-accent">
                Sign in
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
                Sign up
              </button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <Link href="/status" className="text-sm font-medium hover:underline">
              Status
            </Link>
            <UserButton />
          </Show>
        </nav>
      </header>

      <main className="mx-auto flex max-w-3xl flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <span className="rounded-full bg-primary/10 px-4 py-1 text-sm font-medium text-primary">
          Your daily sales assistant
        </span>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Know exactly who to follow up with today.
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          RemindAm helps you find the customers and leads most likely to buy — and tells you who to
          contact today.
        </p>
        <div className="flex gap-3">
          <Show when="signed-out">
            <SignUpButton mode="modal">
              <button className="rounded-lg bg-primary px-5 py-2.5 font-medium text-primary-foreground hover:opacity-90">
                Get started
              </button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <Link
              href="/status"
              className="rounded-lg bg-primary px-5 py-2.5 font-medium text-primary-foreground hover:opacity-90"
            >
              Go to app
            </Link>
          </Show>
          <Link
            href="/status"
            className="rounded-lg border px-5 py-2.5 font-medium hover:bg-accent"
          >
            System status
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">
          Phase 1 · Authentication is live. Onboarding and dashboard arrive in later phases.
        </p>
      </main>
    </div>
  );
}
