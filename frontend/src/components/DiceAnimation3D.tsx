import * as React from 'react';
import * as THREE from 'three';
import { DiceInfo } from '@/hooks/useDiceValidation';
import { useEffect, useRef } from 'react';

interface DiceAnimation3DProps {
  className?: string;
  diceInfo?: DiceInfo | null;
}

export const DiceAnimation3D: React.FC<DiceAnimation3DProps> = ({ className = "", diceInfo = null }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const diceObjectsRef = useRef<THREE.Mesh[]>([]);
  const previousDiceGroupsRef = useRef<{diceSize: number, numberOfDice: number}[]>([]);
  const smokeParticlesRef = useRef<THREE.Points[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const renderer = useRef<THREE.WebGLRenderer | null>(null);

  const createSmokeEffect = (position: THREE.Vector3) => {
    if (!sceneRef.current) return;

    const particleCount = 30;
    const particles = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      particles[i3] = position.x + (Math.random() - 0.5) * 0.5;
      particles[i3 + 1] = position.y + (Math.random() - 0.5) * 0.5;
      particles[i3 + 2] = position.z + (Math.random() - 0.5) * 0.5;

      sizes[i] = Math.random() * 0.2 + 0.1;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(particles, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const smokeTexture = new THREE.TextureLoader().load('/smoke.png');

    const material = new THREE.PointsMaterial({
      size: 0.5,
      map: smokeTexture,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.8,
      color: 0xcccccc
    });

    const smokeParticles = new THREE.Points(geometry, material);
    smokeParticles.userData = {
      createdAt: Date.now(),
      velocity: Array(particleCount).fill(0).map(() => new THREE.Vector3(
        (Math.random() - 0.5) * 0.02,
        Math.random() * 0.05,
        (Math.random() - 0.5) * 0.02
      )),
      lifetime: 1000
    };

    sceneRef.current.add(smokeParticles);
    smokeParticlesRef.current.push(smokeParticles);

    setTimeout(() => {
      if (!sceneRef.current) return;

      const index = smokeParticlesRef.current.indexOf(smokeParticles);
      if (index !== -1) {
        smokeParticlesRef.current.splice(index, 1);
        sceneRef.current.remove(smokeParticles);
        geometry.dispose();
        material.dispose();
      }
    }, smokeParticles.userData.lifetime);
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
        bounceCounter: 0,
        diceType: 4
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
        bounceCounter: 0,
        diceType: 6
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
        bounceCounter: 0,
        diceType: 8
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
        bounceCounter: 0,
        diceType: 10
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
        bounceCounter: 0,
        diceType: 12
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
        bounceCounter: 0,
        diceType: 20
      };

      return mesh;
    };

    if (diceInfo && diceInfo.diceGroups && diceInfo.diceGroups.length > 0) {
      diceInfo.diceGroups.forEach(group => {
        let createDice;
        switch (group.diceSize) {
          case 4: createDice = createD4; break;
          case 6: createDice = createD6; break;
          case 8: createDice = createD8; break;
          case 10: createDice = createD10; break;
          case 12: createDice = createD12; break;
          case 20: createDice = createD20; break;
          default: createDice = createD6;
        }

        for (let i = 0; i < group.numberOfDice; i++) {
          const dice = createDice();
          dice.userData.diceType = group.diceSize;
          sceneRef.current.add(dice);
          diceObjectsRef.current.push(dice);
        }
      });
      previousDiceGroupsRef.current = [...diceInfo.diceGroups];
    }

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
      diceObjectsRef.current.forEach(dice => {
        const data = dice.userData;

        if (data.velocity) {
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

              if (Math.abs(data.angularVelocity.x) < 0.002 &&
                  Math.abs(data.angularVelocity.y) < 0.002 &&
                  Math.abs(data.angularVelocity.z) < 0.002) {
                data.settled = true;
              }
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
            data.velocity = new THREE.Vector3(
              (Math.random() - 0.5) * 0.05,
              -0.05 - Math.random() * 0.05,
              (Math.random() - 0.5) * 0.05
            );
            data.bounceCounter = 0;
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
        }
      });

      smokeParticlesRef.current.forEach(smoke => {
        const positions = smoke.geometry.attributes.position.array;
        const velocities = smoke.userData.velocity;
        const elapsed = Date.now() - smoke.userData.createdAt;
        const progress = Math.min(elapsed / smoke.userData.lifetime, 1);

        if (smoke.material instanceof THREE.PointsMaterial) {
          smoke.material.opacity = 0.8 * (1 - progress);
        }

        for (let i = 0; i < velocities.length; i++) {
          const i3 = i * 3;
          positions[i3] += velocities[i].x;
          positions[i3 + 1] += velocities[i].y;
          positions[i3 + 2] += velocities[i].z;
        }

        smoke.geometry.attributes.position.needsUpdate = true;
      });

      if (renderer.current && sceneRef.current) {
        renderer.current.render(sceneRef.current, camera);
      }

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
        dice.geometry.dispose();
        if (Array.isArray(dice.material)) {
          dice.material.forEach(material => material.dispose());
        } else {
          dice.material.dispose();
        }
      });

      diceObjectsRef.current = [];

      smokeParticlesRef.current.forEach(smoke => {
        if (sceneRef.current) {
          sceneRef.current.remove(smoke);
        }
        smoke.geometry.dispose();
        if (smoke.material instanceof THREE.Material) {
          smoke.material.dispose();
        }
      });

      smokeParticlesRef.current = [];

      if (sceneRef.current) {
        sceneRef.current.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.geometry.dispose();
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
    if (!sceneRef.current) return;

    if (!diceInfo || !diceInfo.diceGroups || diceInfo.diceGroups.length === 0) {
      diceObjectsRef.current.forEach(dice => {
        createSmokeEffect(dice.position.clone());
        sceneRef.current?.remove(dice);

        dice.geometry.dispose();
        if (Array.isArray(dice.material)) {
          dice.material.forEach(material => material.dispose());
        } else {
          dice.material.dispose();
        }
      });

      diceObjectsRef.current = [];
      previousDiceGroupsRef.current = [];
      return;
    }

    const diceToRemove = [];
    const diceToKeep = [];

    const currentTypeMap = new Map();
    diceInfo.diceGroups.forEach(group => {
      currentTypeMap.set(group.diceSize, (currentTypeMap.get(group.diceSize) || 0) + group.numberOfDice);
    });

    diceObjectsRef.current.forEach(dice => {
      const type = dice.userData.diceType;
      if (!type) {
        diceToKeep.push(dice);
        return;
      }

      if (currentTypeMap.has(type) && currentTypeMap.get(type) > 0) {
        diceToKeep.push(dice);
        currentTypeMap.set(type, currentTypeMap.get(type) - 1);
      } else {
        diceToRemove.push(dice);
      }
    });

    diceToRemove.forEach(dice => {
      createSmokeEffect(dice.position.clone());
      sceneRef.current?.remove(dice);

      dice.geometry.dispose();
      if (Array.isArray(dice.material)) {
        dice.material.forEach(material => material.dispose());
      } else {
        dice.material.dispose();
      }
    });

    diceObjectsRef.current = diceToKeep;

    diceInfo.diceGroups.forEach(group => {
      const currentCount = diceObjectsRef.current.filter(
        dice => dice.userData.diceType === group.diceSize
      ).length;

      const neededCount = group.numberOfDice;

      if (neededCount > currentCount) {
        for (let i = 0; i < (neededCount - currentCount); i++) {
          let dice;
          switch (group.diceSize) {
            case 4: dice = createD4(); break;
            case 6: dice = createD6(); break;
            case 8: dice = createD8(); break;
            case 10: dice = createD10(); break;
            case 12: dice = createD12(); break;
            case 20: dice = createD20(); break;
            default: dice = createD6();
          }

          dice.userData.diceType = group.diceSize;
          sceneRef.current.add(dice);
          diceObjectsRef.current.push(dice);
        }
      }
    });

    previousDiceGroupsRef.current = diceInfo.diceGroups ? [...diceInfo.diceGroups] : [];

  }, [diceInfo]);

  return (
    <div
      ref={containerRef}
      className={`w-full h-full ${className}`}
      style={{ position: 'relative' }}
    />
  );
};
