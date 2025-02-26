import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { DiceInfo } from '@/hooks/useDiceValidation';

interface DiceAnimation3DProps {
  className?: string;
  diceInfo?: DiceInfo | null;
}

export const DiceAnimation3D: React.FC<DiceAnimation3DProps> = ({ className = "", diceInfo = null }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!containerRef.current) return;
    
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.background.alpha = 0;
    
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    const container = containerRef.current;
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);
    
    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 5, 10);
    camera.lookAt(0, 0, 0);
    
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 10, 7.5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);
    
    const planeGeometry = new THREE.PlaneGeometry(20, 20);
    const planeMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x333333, 
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide
    });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -2;
    plane.receiveShadow = true;
    scene.add(plane);
    
    const diceObjects: THREE.Mesh[] = [];
    
    const createD4 = () => {
      const geometry = new THREE.TetrahedronGeometry(1);
      const material = new THREE.MeshStandardMaterial({
        color: 0xdddddd,
        roughness: 0.4,
        metalness: 0.2
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      
      mesh.position.set(
        (Math.random() - 0.5) * 8,
        Math.random() * 5 + 3,
        (Math.random() - 0.5) * 8
      );
      mesh.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );
      
      mesh.userData = {
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.05,
          -0.05 - Math.random() * 0.05,
          (Math.random() - 0.5) * 0.05
        ),
        angularVelocity: new THREE.Vector3(
          Math.random() * 0.05,
          Math.random() * 0.05,
          Math.random() * 0.05
        ),
        bounceCounter: 0
      };
      
      return mesh;
    };
    
    const createD6 = () => {
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      const material = new THREE.MeshStandardMaterial({
        color: 0xdddddd,
        roughness: 0.4,
        metalness: 0.2
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      
      mesh.position.set(
        (Math.random() - 0.5) * 8,
        Math.random() * 5 + 3,
        (Math.random() - 0.5) * 8
      );
      mesh.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );
      
      mesh.userData = {
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.05,
          -0.05 - Math.random() * 0.05,
          (Math.random() - 0.5) * 0.05
        ),
        angularVelocity: new THREE.Vector3(
          Math.random() * 0.05,
          Math.random() * 0.05,
          Math.random() * 0.05
        ),
        bounceCounter: 0
      };
      
      return mesh;
    };
    
    const createD8 = () => {
      const geometry = new THREE.OctahedronGeometry(1);
      const material = new THREE.MeshStandardMaterial({
        color: 0xdddddd,
        roughness: 0.4,
        metalness: 0.2
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      
      mesh.position.set(
        (Math.random() - 0.5) * 8,
        Math.random() * 5 + 3,
        (Math.random() - 0.5) * 8
      );
      mesh.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );
      
      mesh.userData = {
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.05,
          -0.05 - Math.random() * 0.05,
          (Math.random() - 0.5) * 0.05
        ),
        angularVelocity: new THREE.Vector3(
          Math.random() * 0.05,
          Math.random() * 0.05,
          Math.random() * 0.05
        ),
        bounceCounter: 0
      };
      
      return mesh;
    };
    
    const createD10 = () => {
      const vertices = [];
      const radius = 1;
      
      const pentagonalFaceVertices = [];
      const topPentagonY = 0.3;
      const bottomPentagonY = -0.3;
      
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        
        pentagonalFaceVertices.push(new THREE.Vector3(x, topPentagonY, z));
        pentagonalFaceVertices.push(new THREE.Vector3(x, bottomPentagonY, z));
      }
      
      const topPoint = new THREE.Vector3(0, radius, 0);
      const bottomPoint = new THREE.Vector3(0, -radius, 0);
      
      const geometry = new THREE.BufferGeometry();
      
      for (let i = 0; i < 5; i++) {
        const i1 = i * 2;
        const i2 = ((i + 1) % 5) * 2;
        
        vertices.push(...topPoint.toArray());
        vertices.push(...pentagonalFaceVertices[i1].toArray());
        vertices.push(...pentagonalFaceVertices[i2].toArray());
        
        vertices.push(...bottomPoint.toArray());
        vertices.push(...pentagonalFaceVertices[i2 + 1].toArray());
        vertices.push(...pentagonalFaceVertices[i1 + 1].toArray());
        
        vertices.push(...pentagonalFaceVertices[i1].toArray());
        vertices.push(...pentagonalFaceVertices[i1 + 1].toArray());
        vertices.push(...pentagonalFaceVertices[i2 + 1].toArray());
        
        vertices.push(...pentagonalFaceVertices[i1].toArray());
        vertices.push(...pentagonalFaceVertices[i2 + 1].toArray());
        vertices.push(...pentagonalFaceVertices[i2].toArray());
      }
      
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.computeVertexNormals();
      
      const material = new THREE.MeshStandardMaterial({
        color: 0xdddddd,
        roughness: 0.4,
        metalness: 0.2
      });
      
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      
      mesh.position.set(
        (Math.random() - 0.5) * 8,
        Math.random() * 5 + 3,
        (Math.random() - 0.5) * 8
      );
      mesh.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );
      
      mesh.userData = {
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.05,
          -0.05 - Math.random() * 0.05,
          (Math.random() - 0.5) * 0.05
        ),
        angularVelocity: new THREE.Vector3(
          Math.random() * 0.05,
          Math.random() * 0.05,
          Math.random() * 0.05
        ),
        bounceCounter: 0
      };
      
      return mesh;
    };
    
    const createD12 = () => {
      const geometry = new THREE.DodecahedronGeometry(1);
      const material = new THREE.MeshStandardMaterial({
        color: 0xdddddd,
        roughness: 0.4,
        metalness: 0.2
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      
      mesh.position.set(
        (Math.random() - 0.5) * 8,
        Math.random() * 5 + 3,
        (Math.random() - 0.5) * 8
      );
      mesh.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );
      
      mesh.userData = {
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.05,
          -0.05 - Math.random() * 0.05,
          (Math.random() - 0.5) * 0.05
        ),
        angularVelocity: new THREE.Vector3(
          Math.random() * 0.05,
          Math.random() * 0.05,
          Math.random() * 0.05
        ),
        bounceCounter: 0
      };
      
      return mesh;
    };
    
    const createD20 = () => {
      const geometry = new THREE.IcosahedronGeometry(1);
      const material = new THREE.MeshStandardMaterial({
        color: 0xdddddd,
        roughness: 0.4,
        metalness: 0.2
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      
      mesh.position.set(
        (Math.random() - 0.5) * 8,
        Math.random() * 5 + 3,
        (Math.random() - 0.5) * 8
      );
      mesh.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );
      
      mesh.userData = {
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.05,
          -0.05 - Math.random() * 0.05,
          (Math.random() - 0.5) * 0.05
        ),
        angularVelocity: new THREE.Vector3(
          Math.random() * 0.05,
          Math.random() * 0.05,
          Math.random() * 0.05
        ),
        bounceCounter: 0
      };
      
      return mesh;
    };
    
    const getDiceCreatorBySize = (size: number) => {
      switch (size) {
        case 4: return createD4;
        case 6: return createD6;
        case 8: return createD8;
        case 10: return createD10;
        case 12: return createD12;
        case 20: return createD20;
        default: return createD6;
      }
    };
    
    if (diceInfo && diceInfo.diceGroups && diceInfo.diceGroups.length > 0) {
      diceInfo.diceGroups.forEach(group => {
        const createDice = getDiceCreatorBySize(group.diceSize);
        for (let i = 0; i < group.numberOfDice; i++) {
          const dice = createDice();
          scene.add(dice);
          diceObjects.push(dice);
        }
      });
    } else {
      const diceCount = 10;
      const diceTypes = [createD4, createD6, createD8, createD10, createD12, createD20];
      
      for (let i = 0; i < diceCount; i++) {
        const createDice = diceTypes[Math.floor(Math.random() * diceTypes.length)];
        const dice = createDice();
        scene.add(dice);
        diceObjects.push(dice);
      }
    }
    
    const handleResize = () => {
      if (!containerRef.current) return;
      
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      
      renderer.setSize(width, height);
    };
    
    window.addEventListener('resize', handleResize);
    
    const animate = () => {
      diceObjects.forEach(dice => {
        const data = dice.userData;
        
        data.velocity.y -= 0.002;
        
        dice.position.x += data.velocity.x;
        dice.position.y += data.velocity.y;
        dice.position.z += data.velocity.z;
        
        dice.rotation.x += data.angularVelocity.x;
        dice.rotation.y += data.angularVelocity.y;
        dice.rotation.z += data.angularVelocity.z;
        
        if (dice.position.y < -1 && data.velocity.y < 0) {
          data.velocity.y = -data.velocity.y * 0.6;
          data.velocity.x *= 0.8;
          data.velocity.z *= 0.8;
          
          dice.position.y = -1;
          
          data.angularVelocity.multiplyScalar(0.9);
          
          data.bounceCounter++;
          
          if (data.bounceCounter > 3 && Math.abs(data.velocity.y) < 0.03) {
            data.velocity.set(0, 0, 0);
            data.angularVelocity.multiplyScalar(0.3);
          }
        }
        
        const wallLimit = 9;
        if (Math.abs(dice.position.x) > wallLimit) {
          data.velocity.x = -data.velocity.x * 0.8;
          dice.position.x = Math.sign(dice.position.x) * wallLimit;
        }
        
        if (Math.abs(dice.position.z) > wallLimit) {
          data.velocity.z = -data.velocity.z * 0.8;
          dice.position.z = Math.sign(dice.position.z) * wallLimit;
        }
        
        if (dice.position.y < -10) {
          dice.position.set(
            (Math.random() - 0.5) * 8,
            Math.random() * 5 + 6,
            (Math.random() - 0.5) * 8
          );
          dice.userData.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.05,
            -0.05 - Math.random() * 0.05,
            (Math.random() - 0.5) * 0.05
          );
          dice.userData.bounceCounter = 0;
        }
        
        if (Math.random() < 0.01 && data.bounceCounter > 3) {
          data.velocity.y = 0.1 + Math.random() * 0.1;
          data.velocity.x = (Math.random() - 0.5) * 0.05;
          data.velocity.z = (Math.random() - 0.5) * 0.05;
          data.angularVelocity.x = Math.random() * 0.05;
          data.angularVelocity.y = Math.random() * 0.05;
          data.angularVelocity.z = Math.random() * 0.05;
          data.bounceCounter = 0;
        }
      });
      
      renderer.render(scene, camera);
      const animationId = requestAnimationFrame(animate);
      
      return animationId;
    };
    
    const animationId = animate();
    
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);
      if (renderer.domElement && containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
      
      diceObjects.forEach(dice => {
        dice.geometry.dispose();
        if (Array.isArray(dice.material)) {
          dice.material.forEach(material => material.dispose());
        } else {
          dice.material.dispose();
        }
      });
    };
  }, [diceInfo]);
  
  return (
    <div 
      ref={containerRef} 
      className={`w-full h-full ${className}`}
      style={{ position: 'relative' }}
    />
  );
};
