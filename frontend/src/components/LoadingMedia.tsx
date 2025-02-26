import React, { useRef, useEffect } from 'react';

interface LoadingMediaProps {
  staticImage: string;
  loadingVideo: string;
  isLoading: boolean;
  alt: string;
  className?: string;
  blendMode?: 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'color-dodge' | 'color-burn' | 'hard-light' | 'soft-light' | 'difference' | 'exclusion' | 'hue' | 'saturation' | 'color' | 'luminosity';
  filter?: string;
}

export const LoadingMedia: React.FC<LoadingMediaProps> = ({
  staticImage,
  loadingVideo,
  isLoading,
  alt,
  className = "",
  blendMode = "normal",
  filter = "",
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      if (isLoading) {
        videoRef.current.currentTime = 0;
        videoRef.current.play().catch(err => {
          console.error('Error playing video:', err);
        });
      } else {
        videoRef.current.pause();
      }
    }
  }, [isLoading]);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;

    // Create canvas overlay for the pointillistic effect
    let canvas = container.querySelector('canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.className = 'absolute top-0 left-0 w-full h-full pointer-events-none z-10 opacity-40';
      container.appendChild(canvas);
    }

    const updateCanvas = () => {
      if (!canvas) return;

      const width = container.clientWidth;
      const height = container.clientHeight;

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, width, height);

      const dotSize = 2;
      const spacing = 12;

      for (let x = 0; x < width; x += spacing) {
        for (let y = 0; y < height; y += spacing) {
          const offsetX = Math.random() * spacing * 0.7;
          const offsetY = Math.random() * spacing * 0.7;

          const radius = Math.random() * dotSize + 0.5;

          ctx.globalAlpha = Math.random() * 0.2 + 0.05;

          ctx.fillStyle = '#000000';

          if (Math.random() > 0.3) {
            ctx.beginPath();
            ctx.arc(x + offsetX, y + offsetY, radius, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    };

    updateCanvas();
    window.addEventListener('resize', updateCanvas);

    return () => {
      window.removeEventListener('resize', updateCanvas);
    };
  }, []);

  const bwOverlayStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'black',
    mixBlendMode: 'saturation',
    zIndex: 15,
    opacity: 1,
  };

  const bwImageStyle: React.CSSProperties = {
    filter: 'grayscale(100%) contrast(0.8) brightness(0.6) opacity(0.7) blur(0.5px)',
    mixBlendMode: blendMode as React.CSSProperties['mixBlendMode'],
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Static image shown when not loading */}
      <img
        src={staticImage}
        alt={alt}
        style={bwImageStyle}
        className={`w-full h-auto transition-opacity duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
      />

      {/* Video shown when loading */}
      <video
        ref={videoRef}
        src={loadingVideo}
        loop
        muted
        playsInline
        style={bwImageStyle}
        className={`absolute top-0 left-0 w-full h-full object-cover transition-opacity duration-300 ${isLoading ? 'opacity-100' : 'opacity-0'}`}
      />

      <div style={bwOverlayStyle}></div>
    </div>
  );
};
