export function Spinner({ label = 'Running…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-base-content/70" role="status">
      <span className="loading loading-spinner loading-md" />
      <span>{label}</span>
    </div>
  );
}
