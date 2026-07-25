export function AsanaIcon({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      {/* Why: monochrome Asana three-dot mark so it matches other provider icons. */}
      <circle cx="12" cy="5.5" r="3.2" />
      <circle cx="5.8" cy="16.2" r="3.2" />
      <circle cx="18.2" cy="16.2" r="3.2" />
    </svg>
  )
}
