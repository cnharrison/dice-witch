import * as React from 'react';
import * as THREE from 'three';
import { DiceInfo } from '@/hooks/useDiceValidation';
import { useEffect, useRef } from 'react';

interface DiceAnimation3DProps {
  className?: string;
  diceInfo?: DiceInfo | null;
  diceToRemove?: {diceSize: number, count: number}[];
  diceColors?: Record<number, string>;
}

export const DiceAnimation3D: React.FC<DiceAnimation3DProps> = ({
  className = "",
  diceInfo = null,
  diceToRemove = [],
  diceColors = {}
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const diceObjectsRef = useRef<THREE.Mesh[]>([]);
  const smokeParticlesRef = useRef<THREE.Points[]>([]);
  const previousDiceGroupsRef = useRef<any[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const renderer = useRef<THREE.WebGLRenderer | null>(null);
  const diceInfoRef = useRef(diceInfo);

  useEffect(() => {
    diceInfoRef.current = diceInfo;
  }, [diceInfo]);

  const diceColorsRef = useRef(diceColors);
  useEffect(() => {
    diceColorsRef.current = diceColors;
  }, [diceColors]);

  const createSmokeEffect = (position) => {
    const particleCount = 20;
    const particleGeometry = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      const radius = 0.5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      particlePositions[i3] = position.x + radius * Math.sin(phi) * Math.cos(theta);
      particlePositions[i3 + 1] = position.y + radius * Math.sin(phi) * Math.sin(theta);
      particlePositions[i3 + 2] = position.z + radius * Math.cos(phi);
    }
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMaterial = new THREE.PointsMaterial({
      color: 0xcccccc,
      size: 0.15,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    });
    const smoke = new THREE.Points(particleGeometry, particleMaterial);
    smoke.position.copy(position);
    smoke.userData = {
      createdAt: Date.now(),
      lifetime: 1000 + Math.random() * 500,
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 0.02,
        0.02 + Math.random() * 0.01,
        (Math.random() - 0.5) * 0.02
      )
    };
    if (sceneRef.current) {
      sceneRef.current.add(smoke);
      smokeParticlesRef.current.push(smoke);
    }
    return smoke;
  };

  const createD4 = (color = 0xff00ff) => {
    const geometry = new THREE.TetrahedronGeometry(1);
    const material = new THREE.MeshStandardMaterial({
      color: color,
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
      bounceCounter: 0,
      diceType: 4
    };
    return mesh;
  };

  const createD6 = (color = 0xff00ff) => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({
      color: color,
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
      bounceCounter: 0,
      diceType: 6
    };
    return mesh;
  };

  const createD8 = (color = 0xff00ff) => {
    const geometry = new THREE.OctahedronGeometry(1);
    const material = new THREE.MeshStandardMaterial({
      color: color,
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
      bounceCounter: 0,
      diceType: 8
    };
    return mesh;
  };

  const createD10 = (color = 0xff00ff) => {
    const radius = 0.8;
    const height = 1.2;
    const geometry = new THREE.BufferGeometry();

    const vertices = [];

    vertices.push(0, height/2, 0);

    vertices.push(0, -height/2, 0);

    for (let i = 0; i < 5; i++) {
      const angle = (Math.PI * 2 / 5) * i;
      vertices.push(
        Math.cos(angle) * radius,
        0,
        Math.sin(angle) * radius
      );
    }

    const indices = [];

    for (let i = 0; i < 5; i++) {
      const current = i + 2;
      const next = i < 4 ? current + 1 : 2;
      indices.push(0, current, next);
    }

    for (let i = 0; i < 5; i++) {
      const current = i + 2;
      const next = i < 4 ? current + 1 : 2;
      indices.push(1, next, current);
    }

    geometry.setIndex(indices);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      color: color,
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
      bounceCounter: 0,
      diceType: 10
    };
    return mesh;
  };

  const createD12 = (color = 0xff00ff) => {
    const geometry = new THREE.DodecahedronGeometry(1);
    const material = new THREE.MeshStandardMaterial({
      color: color,
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
      bounceCounter: 0,
      diceType: 12
    };
    return mesh;
  };

  const createD20 = (color = 0xff00ff) => {
    const geometry = new THREE.IcosahedronGeometry(1);
    const material = new THREE.MeshStandardMaterial({
      color: color,
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
      bounceCounter: 0,
      diceType: 20
    };
    return mesh;
  };

  const createSphere = (color = 0xff00ff) => {
    const geometry = new THREE.SphereGeometry(1, 32, 32);
    const material = new THREE.MeshStandardMaterial({
      color: color,
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
      bounceCounter: 0,
      diceType: 0
    };
    return mesh;
  };

  const createDie = (sides: number) => {
    // Use provided color or generate a random one
    const diceColor = diceColorsRef.current[sides] && typeof diceColorsRef.current[sides] === 'string'
      ? parseInt(diceColorsRef.current[sides].replace('#', '0x'), 16)
      : Math.random() * 0xffffff;

    let dice;
    switch (sides) {
      case 4: dice = createD4(diceColor); break;
      case 6: dice = createD6(diceColor); break;
      case 8: dice = createD8(diceColor); break;
      case 10: dice = createD10(diceColor); break;
      case 12: dice = createD12(diceColor); break;
      case 20: dice = createD20(diceColor); break;
      default: dice = createSphere(diceColor);
    }
    dice.userData.diceType = sides;
    const angle = Math.random() * Math.PI * 2;
    const radius = 3 + Math.random();
    dice.position.set(
      Math.cos(angle) * radius,
      1.5 + Math.random(),
      Math.sin(angle) * radius
    );
    dice.userData.velocity = new THREE.Vector3(
      -dice.position.x * 0.05,
      -0.5 - Math.random() * 0.3,
      -dice.position.z * 0.05
    );
    dice.userData.angularVelocity = new THREE.Vector3(
      (Math.random() - 0.5) * 0.1,
      (Math.random() - 0.5) * 0.1,
      (Math.random() - 0.5) * 0.1
    );
    return dice;
  };

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x000000);
    scene.background.alpha = 0;

    const rendererInstance = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.current = rendererInstance;
    const container = containerRef.current;
    rendererInstance.setSize(container.clientWidth, container.clientHeight);
    rendererInstance.setPixelRatio(window.devicePixelRatio);
    rendererInstance.setClearColor(0x000000, 0);
    rendererInstance.shadowMap.enabled = true;
    container.appendChild(rendererInstance.domElement);

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 5, 10);
    camera.lookAt(0, 0, 0);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 10, 7.5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    const handleResize = () => {
      if (!containerRef.current) return;

      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;

      camera.aspect = width / height;
      camera.updateProjectionMatrix();

      renderer.current.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    const animate = () => {
      if (!renderer.current || !sceneRef.current) return;

      const now = Date.now();

      for (let i = smokeParticlesRef.current.length - 1; i >= 0; i--) {
        const smoke = smokeParticlesRef.current[i];
        const elapsed = now - smoke.userData.createdAt;
        if (elapsed >= smoke.userData.lifetime) {
          sceneRef.current.remove(smoke);
          if (smoke.geometry) smoke.geometry.dispose();
          if (smoke.material) {
            if (Array.isArray(smoke.material)) {
              smoke.material.forEach(m => m.dispose());
            } else {
              smoke.material.dispose();
            }
          }
          smokeParticlesRef.current.splice(i, 1);
        } else {
          const opacity = 0.8 * (1 - elapsed / smoke.userData.lifetime);
          if (smoke.material instanceof THREE.PointsMaterial) {
            smoke.material.opacity = opacity;
          }
          smoke.scale.set(
            1 + elapsed / smoke.userData.lifetime * 0.5,
            1 + elapsed / smoke.userData.lifetime * 0.5,
            1 + elapsed / smoke.userData.lifetime * 0.5
          );
          smoke.position.y += smoke.userData.velocity.y;
          smoke.position.x += smoke.userData.velocity.x;
          smoke.position.z += smoke.userData.velocity.z;
        }
      }

      const gravity = new THREE.Vector3(0, -0.03, 0);
      const floorY = -1.5;
      const boundaryX = 3.0;
      const boundaryZ = 3.0;

      for (let i = 0; i < diceObjectsRef.current.length; i++) {
        const diceA = diceObjectsRef.current[i];
        if (!diceA) continue;

        for (let j = i + 1; j < diceObjectsRef.current.length; j++) {
          const diceB = diceObjectsRef.current[j];
          if (!diceB) continue;

          const distance = diceA.position.distanceTo(diceB.position);
          const minDistance = 1.2;

          if (distance < minDistance) {
            const normal = new THREE.Vector3()
              .subVectors(diceA.position, diceB.position)
              .normalize();

            const correction = (minDistance - distance) / 2;
            diceA.position.add(normal.clone().multiplyScalar(correction));
            diceB.position.add(normal.clone().multiplyScalar(-correction));

            const velA = diceA.userData.velocity || new THREE.Vector3();
            const velB = diceB.userData.velocity || new THREE.Vector3();
            const relativeVelocity = new THREE.Vector3().subVectors(velA, velB);

            const impulseStrength = normal.dot(relativeVelocity) * 0.8;
            const impulse = normal.clone().multiplyScalar(impulseStrength);

            if (diceA.userData.velocity && diceB.userData.velocity) {
              diceA.userData.velocity.sub(impulse);
              diceB.userData.velocity.add(impulse);

              diceA.userData.angularVelocity.add(new THREE.Vector3(
                (Math.random() - 0.5) * 0.03,
                (Math.random() - 0.5) * 0.03,
                (Math.random() - 0.5) * 0.03
              ));

              diceB.userData.angularVelocity.add(new THREE.Vector3(
                (Math.random() - 0.5) * 0.03,
                (Math.random() - 0.5) * 0.03,
                (Math.random() - 0.5) * 0.03
              ));
            }
          }
        }
      }

      diceObjectsRef.current.forEach(dice => {
        if (!dice) return;

        if (!dice.userData.velocity) {
          dice.userData.velocity = new THREE.Vector3(0, 0, 0);
        }
        if (!dice.userData.angularVelocity) {
          dice.userData.angularVelocity = new THREE.Vector3(
            Math.random() * 0.02 - 0.01,
            Math.random() * 0.02 - 0.01,
            Math.random() * 0.02 - 0.01
          );
        }
        dice.userData.velocity.add(gravity);
        dice.position.add(dice.userData.velocity);
        dice.rotation.x += dice.userData.angularVelocity.x;
        dice.rotation.y += dice.userData.angularVelocity.y;
        dice.rotation.z += dice.userData.angularVelocity.z;
        if (dice.position.y < floorY + 0.5) {
          dice.position.y = floorY + 0.5;
          if (Math.abs(dice.userData.velocity.y) > 0.01) {
            dice.userData.velocity.y = -dice.userData.velocity.y * 0.5;

            dice.userData.angularVelocity.multiplyScalar(0.85);
            dice.userData.velocity.x *= 0.92;
            dice.userData.velocity.z *= 0.92;
          } else {
            dice.userData.velocity.y = 0;
            dice.userData.velocity.x *= 0.92;
            dice.userData.velocity.z *= 0.92;
            dice.userData.angularVelocity.multiplyScalar(0.92);
          }
        }
        if (Math.abs(dice.position.x) > boundaryX) {
          dice.position.x = Math.sign(dice.position.x) * boundaryX;
          dice.userData.velocity.x = -dice.userData.velocity.x * 0.5;
        }
        if (Math.abs(dice.position.z) > boundaryZ) {
          dice.position.z = Math.sign(dice.position.z) * boundaryZ;
          dice.userData.velocity.z = -dice.userData.velocity.z * 0.5;
        }
      });

      renderer.current.render(sceneRef.current, camera);
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    const animationId = animate();
    animationFrameRef.current = animationId;

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (renderer.current && renderer.current.domElement && containerRef.current) {
        containerRef.current.removeChild(renderer.current.domElement);
      }

      diceObjectsRef.current.forEach(dice => {
        if (sceneRef.current) {
          sceneRef.current.remove(dice);
        }
        if (dice.geometry) {
          dice.geometry.dispose();
        }
        if (Array.isArray(dice.material)) {
          dice.material.forEach(material => material.dispose());
        } else if (dice.material) {
          dice.material.dispose();
        }
      });

      diceObjectsRef.current = [];

      smokeParticlesRef.current.forEach(smoke => {
        if (sceneRef.current) {
          sceneRef.current.remove(smoke);
        }
        if (smoke.geometry) {
          smoke.geometry.dispose();
        }
        if (smoke.material instanceof THREE.Material) {
          smoke.material.dispose();
        }
      });

      smokeParticlesRef.current = [];

      if (sceneRef.current) {
        sceneRef.current.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            if (object.geometry) {
              object.geometry.dispose();
            }
            if (Array.isArray(object.material)) {
              object.material.forEach(material => material.dispose());
            } else if (object.material) {
              object.material.dispose();
            }
          }
        });
        sceneRef.current = null;
      }

      if (renderer.current) {
        renderer.current.dispose();
        renderer.current = null;
      }
    };
  }, []);

  useEffect(() => {
    diceInfoRef.current = diceInfo;
    if (!sceneRef.current || !diceInfoRef.current) return;
    if (!diceInfoRef.current.diceGroups || diceInfoRef.current.diceGroups.length === 0) {
      diceObjectsRef.current.forEach(dice => {
        createSmokeEffect(dice.position);
        sceneRef.current?.remove(dice);
        if (dice.geometry) dice.geometry.dispose();
        if (Array.isArray(dice.material)) {
          dice.material.forEach(m => m.dispose());
        } else if (dice.material) {
          dice.material.dispose();
        }
      });
      diceObjectsRef.current = [];
      previousDiceGroupsRef.current = [];
      return;
    }
    const currentDiceMap = new Map();
    diceInfoRef.current.diceGroups.forEach(group => {
      currentDiceMap.set(group.diceSize, (currentDiceMap.get(group.diceSize) || 0) + group.numberOfDice);
    });
    const existingDiceByType = new Map();
    diceObjectsRef.current.forEach(die => {
      if (die.userData.diceType) {
        const type = die.userData.diceType;
        existingDiceByType.set(type, (existingDiceByType.get(type) || 0) + 1);
      }
    });
    const diceToRemove = [];
    diceObjectsRef.current.forEach(die => {
      const type = die.userData.diceType;
      if (!type) return;
      const currentCount = currentDiceMap.get(type) || 0;
      const existingCount = existingDiceByType.get(type) || 0;
      if (existingCount > currentCount) {
        diceToRemove.push(die);
        existingDiceByType.set(type, existingCount - 1);
      }
    });
    diceToRemove.forEach(die => {
      createSmokeEffect(die.position);
      sceneRef.current?.remove(die);
      if (die.geometry) die.geometry.dispose();
      if (Array.isArray(die.material)) {
        die.material.forEach(m => m.dispose());
      } else if (die.material) {
        die.material.dispose();
      }
      const index = diceObjectsRef.current.indexOf(die);
      if (index !== -1) {
        diceObjectsRef.current.splice(index, 1);
      }
    });
    diceInfoRef.current.diceGroups.forEach(group => {
      const type = group.diceSize;
      const currentCount = currentDiceMap.get(type) || 0;
      const existingCount = existingDiceByType.get(type) || 0;
      if (currentCount > existingCount) {
        for (let i = 0; i < (currentCount - existingCount); i++) {
          const die = createDie(type);
          sceneRef.current.add(die);
          diceObjectsRef.current.push(die);
        }
      }
    });
    previousDiceGroupsRef.current = [...diceInfoRef.current.diceGroups];
  }, [diceInfo]);

  useEffect(() => {
    if (!sceneRef.current || diceToRemove.length === 0) return;
    diceToRemove.forEach(({ diceSize, count }) => {
      const diceOfType = diceObjectsRef.current.filter(
        die => die.userData.diceType === diceSize
      );
      const diceToRemoveWithSmoke = diceOfType.slice(0, count);
      diceToRemoveWithSmoke.forEach(die => {
        createSmokeEffect(die.position);
        sceneRef.current?.remove(die);
        if (die.geometry) die.geometry.dispose();
        if (Array.isArray(die.material)) {
          die.material.forEach(m => m.dispose());
        } else if (die.material) {
          die.material.dispose();
        }
        const index = diceObjectsRef.current.indexOf(die);
        if (index !== -1) {
          diceObjectsRef.current.splice(index, 1);
        }
      });
    });
  }, [diceToRemove]);

  return (
    <div
      ref={containerRef}
      className={`w-full h-full ${className} isolate`}
      style={{ position: 'relative' }}
    />
  );
};
