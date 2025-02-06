export function D8Icon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 600 600" className={className} fill="currentColor">
      <style>
        {`.outline { stroke: currentColor; fill: none; stroke-width: 6px; stroke-miterlimit: 10; }`}
      </style>
      <path className="outline" d="M300 50L50 300l250 250 250-250z"/>
      <path className="outline" d="M300 50v500M50 300h500"/>
    </svg>
  );
}