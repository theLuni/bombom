/**
 * Обёртка над Three.js: рендерер, сцена, свет, камера, тряска.
 */
import * as THREE from 'three';
import { skyTexture } from './textures.js';

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = false;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xb9c3c6, 55, 210);

    this.camera = new THREE.PerspectiveCamera(90, 1, 0.05, 500);

    // ---- небо ----
    const skyGeo = new THREE.SphereGeometry(300, 24, 16);
    const skyMat = new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false });
    this.sky = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.sky);

    // ---- свет ----
    this.hemi = new THREE.HemisphereLight(0xcfe2ff, 0x6b6152, 0.75);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff2dc, 1.55);
    this.sun.position.set(46, 74, 32);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const d = 62;
    this.sun.shadow.camera.left = -d;
    this.sun.shadow.camera.right = d;
    this.sun.shadow.camera.top = d;
    this.sun.shadow.camera.bottom = -d;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 220;
    this.sun.shadow.bias = -0.0009;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.ambient = new THREE.AmbientLight(0xffffff, 0.16);
    this.scene.add(this.ambient);

    // ---- отдельная сцена для модели оружия (рендерится поверх, чтобы не пробивалась сквозь стены) ----
    this.viewScene = new THREE.Scene();
    this.viewCamera = new THREE.PerspectiveCamera(72, 1, 0.01, 8);
    this.viewScene.add(this.viewCamera);
    this.viewScene.add(new THREE.AmbientLight(0xffffff, 1.05));
    const keyLight = new THREE.DirectionalLight(0xfff0d8, 1.5);
    keyLight.position.set(0.6, 1.4, 1.2);
    this.viewScene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x9fc4ff, 0.55);
    rimLight.position.set(-1.2, -0.5, -0.8);
    this.viewScene.add(rimLight);

    // ---- камера от первого лица ----
    this.fovBase = 90;
    this.shake = { amp: 0, t: 0 };
    this._shakeOffset = new THREE.Vector3();

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.viewCamera) {
      this.viewCamera.aspect = w / h;
      this.viewCamera.updateProjectionMatrix();
    }
  }

  setShadows(on) {
    this.renderer.shadowMap.enabled = on;
    this.sun.castShadow = on;
    this.scene.traverse((o) => {
      if (o.isMesh) o.material && (o.material.needsUpdate = true);
    });
  }

  addShake(amp) {
    this.shake.amp = Math.min(2.2, this.shake.amp + amp);
  }

  update(dt) {
    if (this.shake.amp > 0) {
      this.shake.amp = Math.max(0, this.shake.amp - dt * 3.4);
      this.shake.t += dt * 34;
      const a = this.shake.amp * 0.012;
      this._shakeOffset.set(
        Math.sin(this.shake.t * 1.7) * a,
        Math.cos(this.shake.t * 2.3) * a,
        Math.sin(this.shake.t * 0.9) * a * 0.5
      );
    } else {
      this._shakeOffset.set(0, 0, 0);
    }
    // тряска применяется к камере (игрок выставляет её заново каждый кадр)
    this.camera.position.add(this._shakeOffset);
    this.camera.rotation.z += this._shakeOffset.x * 1.6;
    // солнце следует за игроком — тени всегда рядом
    const p = this.camera.position;
    this.sun.position.set(p.x + 46, 74, p.z + 32);
    this.sun.target.position.set(p.x, 0, p.z);
    this.sun.target.updateMatrixWorld();
  }

  renderMain() {
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
  }

  renderOverlay(scene, camera) {
    this.renderer.clearDepth();
    this.renderer.render(scene, camera);
  }
}
