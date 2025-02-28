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
          className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none w-auto min-w-[200%]"
        >
          <span className="font-fraktur text-fuchsia-500 text-[12rem] font-bold" style={{
            textShadow: '4px 4px 8px rgba(0,0,0,0.95)',
          }}>
            Dice Witch
          </span>
        </div>
      )}
    </div>
  );
};
