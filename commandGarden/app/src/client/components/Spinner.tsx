export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-4">
      <span className="loading loading-spinner loading-md" />
      {label && <span className="text-sm opacity-60">{label}</span>}
    </div>
  );
}
