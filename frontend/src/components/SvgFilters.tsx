import React from 'react';

export const SvgFilters: React.FC = () => {
  return (
    <svg width="0" height="0" className="hidden">
      <filter id="noise">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.65"
          numOctaves="3"
          stitchTiles="stitch"
          result="noise"
        />
        <feColorMatrix
          type="matrix"
          values="1 0 0 0 0
                 0 1 0 0 0
                 0 0 1 0 0
                 0 0 0 0.05 0"
          result="coloredNoise"
        />
        <feComposite
          operator="in"
          in="SourceGraphic"
          in2="coloredNoise"
          result="noisyImage"
        />
        <feBlend
          in="SourceGraphic"
          in2="noisyImage"
          mode="multiply"
          result="blend"
        />
        <fePointLight x="125" y="125" z="60" result="light" />
        <feComposite
          in="blend"
          in2="SourceGraphic"
          operator="arithmetic"
          k1="0.5"
          k2="0.5"
          k3="0.5"
          k4="0"
          result="composite"
        />
      </filter>

      <filter id="pointillism">
        <feTurbulence
          type="turbulence"
          baseFrequency="0.03"
          numOctaves="2"
          seed="5"
          result="turbulence"
        />

        <feDisplacementMap
          in="SourceGraphic"
          in2="turbulence"
          scale="15"
          xChannelSelector="R"
          yChannelSelector="G"
          result="displaced"
        />

        <feColorMatrix
          type="matrix"
          values="0.33 0.33 0.33 0 0
                  0.33 0.33 0.33 0 0
                  0.33 0.33 0.33 0 0
                  0 0 0 0.7 0"
          in="displaced"
          result="grayscale"
        />

        <feGaussianBlur
          stdDeviation="0.7"
          in="grayscale"
          result="blurred"
        />

        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.1"
          numOctaves="3"
          seed="10"
          result="noise2"
        />

        <feConvolveMatrix
          order="3"
          kernelMatrix="1 0 0
                       0 -2 0
                       0 0 1"
          edgeMode="duplicate"
          in="blurred"
          result="edges"
        />

        <feComposite
          in="edges"
          in2="noise2"
          operator="arithmetic"
          k1="0.5"
          k2="0.3"
          k3="0.1"
          k4="0"
          result="final"
        />

        <feComponentTransfer in="final" result="final-contrast">
          <feFuncR type="linear" slope="1.5" intercept="-0.3"/>
          <feFuncG type="linear" slope="1.5" intercept="-0.3"/>
          <feFuncB type="linear" slope="1.5" intercept="-0.3"/>
        </feComponentTransfer>
      </filter>
    </svg>
  );
};
