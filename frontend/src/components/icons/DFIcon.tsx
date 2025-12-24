import * as React from "react";

export function DFIcon({ className, darkMode = true }: { className?: string; darkMode?: boolean }) {
  const color = darkMode ? "White" : "black";

  return (
    <svg viewBox="0 0 127 127" className={className}>
      <g transform="translate(0,-169.99998)">
        {/* Cube shape (same as D6) */}
        <path
          stroke={color}
          fill={color}
          d="m 82.21267,173.7285 -62.067264,21.1408 -0.285486,0.85646 -0.419127,0.13718 0.04573,58.02197 0.18955,0.5984 26.659307,37.94443 0.477605,-0.15964 0.768784,0.5158 61.538625,-25.22337 0.64613,-0.96387 v -55.47233 l -0.31292,-0.20535 0.11647,-0.39305 -26.17742,-36.41168 z m -0.05697,2.22005 24.94123,34.69296 -31.936361,12.39483 -27.577849,10.70259 -19.076093,-27.96761 -6.39236,-9.37263 z m -60.629083,23.28319 1.104543,1.61939 23.517178,34.47913 v 53.19949 L 21.570115,253.5472 Z m 86.159873,13.41445 v 53.25388 l -59.457107,24.3706 v -54.54961 z"
        />
        {/* Plus/Minus symbol on the front face */}
        <g transform="translate(45, 235)" stroke={darkMode ? "black" : "white"} fill={darkMode ? "black" : "white"}>
          {/* Plus sign */}
          <rect x="8" y="0" width="4" height="14" />
          <rect x="2" y="5" width="16" height="4" />
          {/* Minus sign below */}
          <rect x="2" y="20" width="16" height="4" />
        </g>
      </g>
    </svg>
  );
}
