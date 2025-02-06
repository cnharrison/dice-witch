export function D4Icon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 600 600" className={className} fill="currentColor">
      <style>
        {`.outline { stroke: currentColor; fill: none; stroke-width: 6px; stroke-miterlimit: 10; }`}
      </style>
      <path className="outline" d="M300 50L50 500h500L300 50zm0 120.4L466.9 470H133.1L300 170.4z"/>
      <path className="outline" d="M300 470V170.4L133.1 470h333.8L300 170.4"/>
    </svg>
  );
}