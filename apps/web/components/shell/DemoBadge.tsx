/** Persistent marker on every signed-in screen of the demo environment (FR-035). */
export function DemoBadge() {
  return (
    <p id="demo-badge" className="bg-demo px-4 py-1 text-center text-xs font-medium text-white">
      <span className="font-bold">Demo</span> environment — synthetic data only
    </p>
  );
}
