/** Placeholder for a section whose module is not built yet (FR-034). */
export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <section aria-labelledby="page-title" className="space-y-2">
      <h1 id="page-title" className="text-2xl font-semibold">
        {title}
      </h1>
      <p className="font-medium">Coming soon</p>
      <p className="text-muted-foreground">{description}</p>
    </section>
  );
}
