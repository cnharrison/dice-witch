export function SparkleLoadingIndicator({
  label,
  className = "",
}: {
  label: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={`grid place-items-center ${className}`}
    >
      <svg
        data-loading-glyph="sparkles"
        viewBox="0 0 72 48"
        className="h-12 w-[4.5rem]"
        aria-hidden="true"
      >
        <path
          className="dice-witch-sparkle dice-witch-sparkle-one"
          fill="#ff00ff"
          d="M20 3c1.2 10.6 6.4 15.8 17 17-10.6 1.2-15.8 6.4-17 17-1.2-10.6-6.4-15.8-17-17 10.6-1.2 15.8-6.4 17-17Z"
        />
        <path
          className="dice-witch-sparkle dice-witch-sparkle-two"
          fill="#9b5cff"
          d="M51 16c.7 6.4 3.9 9.6 10.3 10.3C54.9 27 51.7 30.2 51 36.6c-.7-6.4-3.9-9.6-10.3-10.3C47.1 25.6 50.3 22.4 51 16Z"
        />
        <path
          className="dice-witch-sparkle dice-witch-sparkle-three"
          fill="#04c9df"
          d="M39 34c.4 3.7 2.3 5.6 6 6-3.7.4-5.6 2.3-6 6-.4-3.7-2.3-5.6-6-6 3.7-.4 5.6-2.3 6-6Z"
        />
      </svg>
      <span className="sr-only">{label}</span>
    </div>
  );
}
