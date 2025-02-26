import React, { useRef, useEffect, useState } from 'react';

interface LoadingMediaProps {
  staticImage: string;
  loadingVideo: string;
  isLoading: boolean;
  alt: string;
  className?: string;
  blendMode?: 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'color-dodge' | 'color-burn' | 'hard-light' | 'soft-light' | 'difference' | 'exclusion' | 'hue' | 'saturation' | 'color' | 'luminosity';
  filter?: string;
  hideText?: boolean;
}

export const LoadingMedia: React.FC<LoadingMediaProps> = ({
  staticImage,
  loadingVideo,
  isLoading,
  alt,
  className = "",
  blendMode = "normal",
  filter = "",
  hideText = false,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [videoEnded, setVideoEnded] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isLoading) {
      setVideoEnded(false);

      video.currentTime = 0;

      video.play().catch(() => {});

      const handleEnded = () => {
        setVideoEnded(true);
      };

      video.addEventListener('ended', handleEnded);

      return () => {
        video.removeEventListener('ended', handleEnded);
      };
    } else {
      video.pause();
      setVideoEnded(false);
    }
  }, [isLoading]);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;

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

  const bwImageStyle: React.CSSProperties = {
    filter: 'grayscale(100%)',
    mixBlendMode: blendMode as React.CSSProperties['mixBlendMode'],
  };

  const bwOverlayStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'transparent',
    zIndex: 15,
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative w-full aspect-square overflow-hidden rounded-full">
        <img
          src={staticImage}
          alt={alt}
          style={bwImageStyle}
          className={`w-full h-full object-cover transition-opacity duration-300 ${isLoading && !videoEnded ? 'opacity-0' : 'opacity-100'}`}
        />

        <video
          ref={videoRef}
          src={loadingVideo}
          muted
          playsInline
          controls={false}
          autoPlay={isLoading}
          loop
          disablePictureInPicture
          disableRemotePlayback
          style={{
            ...bwImageStyle,
            pointerEvents: 'none'
          }}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${isLoading && !videoEnded ? 'opacity-100' : 'opacity-0'}`}
        />
      </div>

      {!hideText && (
        <div
          className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none"
          style={{ width: 'auto', minWidth: '200%' }}
        >
          <span style={{
            fontFamily: 'UnifrakturMaguntia, serif',
            color: '#ff00ff',
            fontSize: '12rem',
            textShadow: '4px 4px 8px rgba(0,0,0,0.95)',
            fontWeight: 'bold',
            letterSpacing: '0.05em',
            whiteSpace: 'nowrap',
            display: 'block',
            textAlign: 'center',
            width: '100%',
          }}>
            Dice Witch
          </span>
        </div>
      )}
    </div>
  );
};
