import * as React from 'react';

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <div
      className={`rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 shadow-sm ${className ?? ''}`}
    >
      {children}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-zinc-300">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-zinc-500">{hint}</span> : null}
    </label>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={`h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${className ?? ''}`}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export function Alert({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="rounded-md border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-300">
      {children}
    </div>
  );
}

export function Splash({ label }: { label: string }): JSX.Element {
  return (
    <main className="flex min-h-screen items-center justify-center text-sm text-zinc-500">
      {label}
    </main>
  );
}

/** Map an unknown thrown value (ApiError-shaped) to a user-facing message. */
export function errorMessage(e: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const err = e as { status?: number; title?: string; detail?: string } | null;
  return err?.detail ?? err?.title ?? fallback;
}
