import type { LucideIcon } from 'lucide-react';

/**
 * Honest placeholder for an app section whose feature ships in a later phase.
 * Intentionally not fake: no mock data and no controls that pretend to work —
 * just a clear statement of what will live here and when. The nav route works
 * (§17) even before its feature exists.
 */
export function PlaceholderScreen({
  title,
  description,
  phase,
  icon: Icon,
}: {
  title: string;
  description: string;
  phase: string;
  icon: LucideIcon;
}): React.JSX.Element {
  return (
    <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="h-7 w-7" aria-hidden="true" />
      </span>
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      <span className="rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
        Coming in {phase}
      </span>
    </section>
  );
}
