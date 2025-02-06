export function D12Icon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 600 600" className={className} fill="currentColor">
      <style>
        {`.outline { stroke: currentColor; fill: none; stroke-width: 6px; stroke-miterlimit: 10; }`}
      </style>
      <path className="outline" d="M300 50l-192.7 140 73.6 226.5h238.2l73.6-226.5z"/>
      <path className="outline" d="M107.3 190L300 550l192.7-360M300 50v500"/>
      <path className="outline" d="M107.3 190l73.6 226.5L300 550l119.1-133.5 73.6-226.5"/>
    </svg>
  );
}