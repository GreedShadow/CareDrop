export function Progress({ value = 0, className = "" }) {
  return (
    <div className={`relative h-3 w-full overflow-hidden rounded-full bg-slate-200 ${className}`}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-rose-400 via-pink-400 to-sky-400 transition-all"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}
