export function D10Icon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 600 600" className={className} fill="currentColor">
      <style>
        {`.outline { stroke: currentColor; fill: none; stroke-width: 6px; stroke-miterlimit: 10; }`}
      </style>
      <path className="outline" d="M300 50l-250 175v150l250 175 250-175V225z"/>
      <path className="outline" d="M50 225l250-175 250 175M300 50v500"/>
    </svg>
  );
}