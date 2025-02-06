export function D6Icon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 600 600" className={className} fill="currentColor">
      <style>
        {`.outline { stroke: currentColor; fill: none; stroke-width: 6px; stroke-miterlimit: 10; }`}
      </style>
      <path className="outline" d="M150 75h300v450H150z"/>
      <path className="outline" d="M150 75l150-45 150 45M150 525l150 45 150-45M450 75v450"/>
    </svg>
  );
}