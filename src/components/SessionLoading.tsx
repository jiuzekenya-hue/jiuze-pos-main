export default function SessionLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex items-center gap-2 text-ink-muted text-sm">
        <span className="h-2 w-2 rounded-full bg-market-400 animate-pulse" aria-hidden="true" />
        Checking session…
      </div>
    </div>
  )
}
