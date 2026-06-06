import { formatPaise, PLANS } from '@rm07/core';

/**
 * Placeholder landing surface for the scaffold. The locked marketing/dashboard UI is
 * componentised from the canonical HTML mockups in the dashboard ticket (UI/UX Web brief).
 */
export default function HomePage() {
  const paidPlans = [PLANS.basic, PLANS.pro, PLANS.elite];
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-6 py-16">
      <header className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-widest text-brand">
          Roshan Mishra 07
        </p>
        <h1 className="text-3xl font-bold">Quant Terminal</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          One terminal for multiple brokers, with AI Mode beside every stock. Built for the
          Indian markets. Operated by Ananta Fintech Global LLP.
        </p>
      </header>

      <section aria-label="Plans" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {paidPlans.map((plan) => (
          <article
            key={plan.id}
            className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
          >
            <h2 className="font-semibold">{plan.displayName}</h2>
            <p className="mt-1 text-2xl font-bold">
              {formatPaise(plan.pricing.monthlyPaise)}
              <span className="text-sm font-normal text-zinc-500">/mo</span>
            </p>
          </article>
        ))}
      </section>

      <footer className="text-xs text-zinc-500">
        Not a stockbroker. Never holds client funds or securities. Past performance and computed
        targets are not indicative of future returns.
      </footer>
    </main>
  );
}
