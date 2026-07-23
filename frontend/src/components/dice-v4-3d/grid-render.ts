import { OrthographicCamera, Scene, type WebGLRenderer } from "three";
import type { ThreeDiceGridResourcesV4 } from "./grid-resources";

export type ThreeDiceGridRenderContextV4 = {
  diceScene: Scene;
  iconScene: Scene;
  camera: OrthographicCamera;
};

export function createThreeDiceGridRenderContextV4(): ThreeDiceGridRenderContextV4 {
  return {
    diceScene: new Scene(),
    iconScene: new Scene(),
    camera: new OrthographicCamera(),
  };
}

export type ThreeDiceGridRenderOptionsV4 = {
  width?: number;
  height?: number;
  showModifierIcons?: boolean;
};

export function renderThreeDiceGridV4(
  renderer: WebGLRenderer,
  resources: ThreeDiceGridResourcesV4,
  context: ThreeDiceGridRenderContextV4,
  options: ThreeDiceGridRenderOptionsV4 = {},
): void {
  const width = options.width ?? resources.layout.width;
  const height = options.height ?? resources.layout.height;
  renderer.setScissorTest(false);
  renderer.setClearColor(0x00_00_00, 0);
  renderer.setViewport(0, 0, width, height);
  renderer.clear();
  renderer.setScissorTest(true);
  renderer.autoClear = false;

  for (const {
    cell,
    presentationViewport,
    group,
    camera,
    lighting,
  } of resources.entries) {
    const viewport = presentationViewport ?? cell.viewport;
    renderer.setViewport(
      viewport.x,
      viewport.y,
      viewport.width,
      viewport.height,
    );
    renderer.setScissor(
      viewport.x,
      viewport.y,
      viewport.width,
      viewport.height,
    );
    context.camera.copy(camera);
    context.diceScene.add(lighting.group, group);
    try {
      renderer.render(context.diceScene, context.camera);
    } finally {
      context.diceScene.remove(lighting.group, group);
    }
  }

  renderer.autoClear = true;
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, width, height);
  const modifierIcons = resources.modifierIcons;
  if (modifierIcons !== null && options.showModifierIcons !== false) {
    context.iconScene.add(modifierIcons.mesh);
    renderer.autoClear = false;
    try {
      renderer.render(context.iconScene, modifierIcons.camera);
    } finally {
      renderer.autoClear = true;
      context.iconScene.remove(modifierIcons.mesh);
    }
  }
}

export function disposeThreeDiceGridRenderContextV4(
  context: ThreeDiceGridRenderContextV4,
): void {
  context.diceScene.clear();
  context.iconScene.clear();
}
