import React, { useEffect, useRef } from 'react';

interface DiceAnimationProps {
  className?: string;
}

export const DiceAnimation: React.FC<DiceAnimationProps> = ({ className = "" }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Set canvas dimensions
    const updateCanvasSize = () => {
      if (!canvas.parentElement) return;
      canvas.width = canvas.parentElement.clientWidth;
      canvas.height = canvas.parentElement.clientHeight;
    };
    
    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    
    // Dice animation properties
    type Dice = {
      x: number;
      y: number;
      size: number;
      rotation: number;
      rotationX: number;
      rotationY: number;
      rotationSpeed: number;
      rotationXSpeed: number;
      rotationYSpeed: number;
      xSpeed: number;
      ySpeed: number;
      type: 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20';
      opacity: number;
      zIndex: number;
      scale: number;
      scaleSpeed: number;
    };
    
    const diceTypes = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];
    const dice: Dice[] = [];
    
    // Create 10-15 random dice
    const diceCount = Math.floor(Math.random() * 6) + 10;
    for (let i = 0; i < diceCount; i++) {
      dice.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 30 + 20,
        rotation: Math.random() * Math.PI * 2,
        rotationX: Math.random() * Math.PI * 2,
        rotationY: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.1,
        rotationXSpeed: (Math.random() - 0.5) * 0.05,
        rotationYSpeed: (Math.random() - 0.5) * 0.05,
        xSpeed: (Math.random() - 0.5) * 2,
        ySpeed: (Math.random() - 0.5) * 2,
        type: diceTypes[Math.floor(Math.random() * diceTypes.length)] as Dice['type'],
        opacity: Math.random() * 0.4 + 0.1,
        zIndex: Math.random(),
        scale: 0.7 + Math.random() * 0.6,
        scaleSpeed: (Math.random() - 0.5) * 0.01,
      });
    }
    
    // Create 3D effects with gradients and shadows
    const create3DEffect = (ctx: CanvasRenderingContext2D, dice: Dice) => {
      const lightAngle = dice.rotationX * 0.5;
      const baseColor = 90 + Math.sin(dice.rotationY) * 20;
      const highlight = Math.min(baseColor + 60, 255);
      const shadow = Math.max(baseColor - 60, 20);
      
      // Create gradient based on rotation to simulate lighting
      const gradient = ctx.createLinearGradient(
        -dice.size / 2, -dice.size / 2,
        dice.size / 2, dice.size / 2
      );
      
      gradient.addColorStop(0, `rgb(${highlight}, ${highlight}, ${highlight})`);
      gradient.addColorStop(1, `rgb(${shadow}, ${shadow}, ${shadow})`);
      
      return gradient;
    };
    
    // Adjust shape drawing for 3D perspective
    const adjustForPerspective = (ctx: CanvasRenderingContext2D, dice: Dice) => {
      // Scale based on simulated z-position to create depth
      const perspectiveScale = 0.5 + Math.sin(dice.rotationX) * 0.2 + Math.cos(dice.rotationY) * 0.2;
      ctx.scale(perspectiveScale * dice.scale, perspectiveScale * dice.scale);
      
      // Apply shadow for 3D effect
      ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
      ctx.shadowBlur = dice.size * 0.15;
      ctx.shadowOffsetX = Math.cos(dice.rotationX) * dice.size * 0.1;
      ctx.shadowOffsetY = Math.sin(dice.rotationY) * dice.size * 0.1;
    };
    
    // Simple shapes to represent different dice
    const drawDice = (ctx: CanvasRenderingContext2D, dice: Dice) => {
      ctx.save();
      ctx.translate(dice.x, dice.y);
      ctx.rotate(dice.rotation);
      ctx.globalAlpha = dice.opacity;
      
      // Apply 3D perspective transformations
      adjustForPerspective(ctx, dice);
      
      // Create 3D gradient fill
      ctx.fillStyle = create3DEffect(ctx, dice);
      
      // Apply 3D stroke
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(20, 20, 20, 0.7)';
      
      switch (dice.type) {
        case 'd4':
          // 3D Tetrahedron (simplified as a triangle with shading)
          ctx.beginPath();
          ctx.moveTo(0, -dice.size / 2);
          ctx.lineTo(-dice.size / 2, dice.size / 2);
          ctx.lineTo(dice.size / 2, dice.size / 2);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          
          // Add an edge line to enhance 3D effect
          ctx.beginPath();
          ctx.moveTo(-dice.size / 4, dice.size / 4);
          ctx.lineTo(dice.size / 4, dice.size / 4);
          ctx.stroke();
          break;
          
        case 'd6':
          // 3D Cube (drawn as a square with perspective hints)
          ctx.fillRect(-dice.size / 2, -dice.size / 2, dice.size, dice.size);
          ctx.strokeRect(-dice.size / 2, -dice.size / 2, dice.size, dice.size);
          
          // Add additional lines to suggest cube edges
          if (Math.sin(dice.rotationX) > 0) {
            ctx.beginPath();
            ctx.moveTo(-dice.size / 2, -dice.size / 2);
            ctx.lineTo(-dice.size / 4, -dice.size / 4);
            ctx.moveTo(dice.size / 2, -dice.size / 2);
            ctx.lineTo(dice.size / 4, -dice.size / 4);
            ctx.moveTo(-dice.size / 2, dice.size / 2);
            ctx.lineTo(-dice.size / 4, dice.size / 4);
            ctx.moveTo(dice.size / 2, dice.size / 2);
            ctx.lineTo(dice.size / 4, dice.size / 4);
            ctx.stroke();
          }
          break;
          
        case 'd8':
          // 3D Octahedron (simplified as a diamond with shading)
          ctx.beginPath();
          ctx.moveTo(0, -dice.size / 2);
          ctx.lineTo(dice.size / 2, 0);
          ctx.lineTo(0, dice.size / 2);
          ctx.lineTo(-dice.size / 2, 0);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          
          // Add cross lines for 3D effect
          if (Math.cos(dice.rotationY) > 0) {
            ctx.beginPath();
            ctx.moveTo(0, -dice.size / 4);
            ctx.lineTo(0, dice.size / 4);
            ctx.stroke();
          }
          break;
          
        case 'd10':
          // 3D Decahedron (simplified as a pentagon with shading)
          ctx.beginPath();
          for (let i = 0; i < 5; i++) {
            const angle = (i * 2 * Math.PI / 5) - Math.PI / 2;
            const x = Math.cos(angle) * dice.size / 2;
            const y = Math.sin(angle) * dice.size / 2;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          
          // Add internal star pattern
          if (Math.sin(dice.rotationX + dice.rotationY) > 0) {
            ctx.beginPath();
            for (let i = 0; i < 5; i++) {
              const angle = (i * 2 * Math.PI / 5) - Math.PI / 2;
              const x = Math.cos(angle) * dice.size / 4;
              const y = Math.sin(angle) * dice.size / 4;
              ctx.lineTo(x, y);
              ctx.lineTo(Math.cos(angle + Math.PI/5) * dice.size / 2.5, 
                        Math.sin(angle + Math.PI/5) * dice.size / 2.5);
            }
            ctx.stroke();
          }
          break;
          
        case 'd12':
          // 3D Dodecahedron (simplified as a hexagon with shading)
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const angle = i * 2 * Math.PI / 6;
            const x = Math.cos(angle) * dice.size / 2;
            const y = Math.sin(angle) * dice.size / 2;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          
          // Add internal structure to enhance 3D
          if (Math.cos(dice.rotationX) > 0) {
            ctx.beginPath();
            for (let i = 0; i < 3; i++) {
              const angle = i * 2 * Math.PI / 3;
              ctx.moveTo(0, 0);
              ctx.lineTo(Math.cos(angle) * dice.size / 2, Math.sin(angle) * dice.size / 2);
            }
            ctx.stroke();
          }
          break;
          
        case 'd20':
          // 3D Icosahedron (simplified as an octagon with shading)
          ctx.beginPath();
          for (let i = 0; i < 8; i++) {
            const angle = i * 2 * Math.PI / 8;
            const x = Math.cos(angle) * dice.size / 2;
            const y = Math.sin(angle) * dice.size / 2;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          
          // Add internal triangular facets
          if (Math.sin(dice.rotationY) > 0) {
            ctx.beginPath();
            for (let i = 0; i < 4; i++) {
              const angle = i * Math.PI / 2 + Math.PI / 8;
              ctx.moveTo(0, 0);
              ctx.lineTo(Math.cos(angle) * dice.size / 2, Math.sin(angle) * dice.size / 2);
            }
            ctx.stroke();
          }
          break;
      }
      
      ctx.restore();
    };
    
    // Animation loop
    let animationFrame: number;
    
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Sort dice by z-index to handle overlapping correctly
      dice.sort((a, b) => a.zIndex - b.zIndex);
      
      // Update and draw dice
      for (const die of dice) {
        // Update position and rotation
        die.x += die.xSpeed;
        die.y += die.ySpeed;
        die.rotation += die.rotationSpeed;
        die.rotationX += die.rotationXSpeed;
        die.rotationY += die.rotationYSpeed;
        die.scale += die.scaleSpeed;
        
        // Keep scale within bounds
        if (die.scale < 0.5 || die.scale > 1.3) {
          die.scaleSpeed *= -1;
        }
        
        // Bounce off walls
        if (die.x < 0 || die.x > canvas.width) die.xSpeed *= -1;
        if (die.y < 0 || die.y > canvas.height) die.ySpeed *= -1;
        
        // Periodically update z-index for more dynamic overlapping
        if (Math.random() < 0.01) {
          die.zIndex = Math.random();
        }
        
        // Draw the die
        drawDice(ctx, die);
      }
      
      animationFrame = requestAnimationFrame(animate);
    };
    
    animate();
    
    return () => {
      window.removeEventListener('resize', updateCanvasSize);
      cancelAnimationFrame(animationFrame);
    };
  }, []);
  
  return (
    <canvas 
      ref={canvasRef} 
      className={`absolute inset-0 pointer-events-none ${className}`}
    />
  );
};
