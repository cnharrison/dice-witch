import type { GeometryDescriptorV4 } from "@dice-witch/dice-v4-model";
import { OrthographicCamera } from "three";

export function createThreeOrthographicCameraV4(
  descriptor: GeometryDescriptorV4,
  aspect: number,
): OrthographicCamera {
  if (!Number.isFinite(aspect) || aspect <= 0) {
    throw new Error("Three.js V4 camera aspect is invalid");
  }
  const halfHeight =
    descriptor.camera.orthographicHeight / (2 * Math.min(aspect, 1));
  const camera = new OrthographicCamera(
    -halfHeight * aspect,
    halfHeight * aspect,
    halfHeight,
    -halfHeight,
    0.1,
    100,
  );
  camera.position.set(...descriptor.camera.position);
  camera.up.set(...descriptor.camera.up);
  camera.lookAt(...descriptor.camera.target);
  camera.updateProjectionMatrix();
  return camera;
}
