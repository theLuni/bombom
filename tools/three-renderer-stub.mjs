/**
 * Реальный three.js + заглушка WebGLRenderer (для тестов без GPU).
 */
export * from 'three';
import * as THREE from 'three';

export class WebGLRenderer {
  constructor(params = {}) {
    this.domElement = params.canvas || null;
    this.shadowMap = { enabled: false, type: THREE.PCFSoftShadowMap };
    this.capabilities = { isWebGL2: true, maxTextures: 16 };
    this.info = { render: { calls: 0, triangles: 0 } };
    this.toneMapping = THREE.ACESFilmicToneMapping;
    this.toneMappingExposure = 1;
    this.outputColorSpace = THREE.SRGBColorSpace;
    this.autoClear = false;
    this.calls = { render: 0, clear: 0, clearDepth: 0 };
  }
  setPixelRatio() {}
  setSize() {}
  setClearColor() {}
  render(scene, camera) {
    if (!scene || !camera) throw new Error('render() без сцены или камеры');
    this.calls.render++;
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    // обходим граф: это ловит ошибки в геометрии/материалах
    let objects = 0;
    scene.traverse((o) => { objects++; });
    if (objects === 0) throw new Error('Пустая сцена при рендере');
    this.lastScene = scene;
    this.lastCamera = camera;
  }
  clear() { this.calls.clear++; }
  clearDepth() { this.calls.clearDepth++; }
  getContext() { return null; }
  dispose() {}
  compile() {}
  setAnimationLoop() {}
}
