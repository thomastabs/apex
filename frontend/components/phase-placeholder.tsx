export function PhasePlaceholder({
  phase,
  title,
  description,
}: {
  phase: string;
  title: string;
  description: string;
}) {
  return (
    <section className="px-8 py-10">
      <div className="max-w-5xl">
        <div className="mb-2 text-sm font-bold uppercase tracking-[0.1em] text-violet-400">
          {phase}
        </div>
        <h1 className="text-4xl font-bold tracking-normal text-white">{title}</h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-neutral-500">{description}</p>
        <div className="mt-8 rounded-md border border-neutral-800 bg-[#1f1f21] p-6 text-sm text-neutral-500">
          This route is ready for the migrated workflow UI. The shell, sidebar, top phase navigation,
          React Query providers, session store, and API clients are already mounted.
        </div>
      </div>
    </section>
  );
}
