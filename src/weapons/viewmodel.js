/**
 * Low-poly модели оружия для вида от первого лица + анимации (отдача, покачивание, перезарядка, прицеливание).
 */
import * as THREE from 'three';

const M = {
  polymer: () => new THREE.MeshStandardMaterial({ color: 0x24262b, roughness: 0.72, metalness: 0.18 }),
  polymer2: () => new THREE.MeshStandardMaterial({ color: 0x35383e, roughness: 0.65, metalness: 0.25 }),
  metal: () => new THREE.MeshStandardMaterial({ color: 0x3d4147, roughness: 0.38, metalness: 0.85 }),
  metalDark: () => new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.42, metalness: 0.8 }),
  wood: () => new THREE.MeshStandardMaterial({ color: 0x6d4526, roughness: 0.8, metalness: 0.05 }),
  tan: () => new THREE.MeshStandardMaterial({ color: 0x9a8455, roughness: 0.8, metalness: 0.1 }),
  glow: (c = 0x63e0ff) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 2.4, roughness: 0.3 }),
  glove: () => new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.9 }),
  glove2: () => new THREE.MeshStandardMaterial({ color: 0x2f2a26, roughness: 0.9 }),
};

function box(w, h, d, mat, x = 0, y = 0, z = 0, group) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  group.add(m);
  return m;
}

function cyl(r1, r2, h, mat, x = 0, y = 0, z = 0, group, seg = 10, axisZ = true) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat);
  if (axisZ) m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  group.add(m);
  return m;
}

const cache = new Map();

/** Собирает модель по стилю оружия. Оружие смотрит в -Z. */
function build(style) {
  if (cache.has(style)) return cache.get(style).clone(true);
  const g = new THREE.Group();
  const polymer = M.polymer(), polymer2 = M.polymer2(), metal = M.metal(), metalDark = M.metalDark();
  const wood = M.wood(), glove = M.glove(), glove2 = M.glove2();
  let muzzleZ = -0.5;
  const extras = {};

  switch (style) {
    case 'pistol': {
      box(0.055, 0.085, 0.24, metal, 0, 0, -0.06, g);
      box(0.05, 0.05, 0.06, metalDark, 0, -0.02, -0.2, g);
      const grip = box(0.045, 0.14, 0.06, polymer, 0, -0.1, 0.05, g);
      grip.rotation.x = -0.18;
      box(0.02, 0.03, 0.05, metalDark, 0, 0.055, -0.13, g);
      box(0.05, 0.045, 0.045, glove, 0.005, -0.062, -0.045, g);
      muzzleZ = -0.19;
      break;
    }
    case 'deagle': {
      box(0.06, 0.095, 0.3, metal, 0, 0, -0.08, g);
      box(0.03, 0.03, 0.3, metalDark, 0, 0.062, -0.09, g);
      const grip = box(0.05, 0.15, 0.07, polymer2, 0, -0.11, 0.06, g);
      grip.rotation.x = -0.2;
      box(0.052, 0.05, 0.05, glove, 0.004, -0.07, -0.05, g);
      muzzleZ = -0.24;
      break;
    }
    case 'revolver': {
      box(0.05, 0.06, 0.3, metal, 0, 0.01, -0.09, g);
      cyl(0.038, 0.038, 0.09, metalDark, 0, 0.005, -0.03, g);
      const grip = box(0.05, 0.15, 0.06, wood, 0, -0.1, 0.05, g);
      grip.rotation.x = -0.28;
      box(0.05, 0.05, 0.05, glove, 0.004, -0.07, -0.05, g);
      muzzleZ = -0.25;
      break;
    }
    case 'smg': {
      box(0.06, 0.1, 0.42, polymer, 0, 0, -0.06, g);
      box(0.045, 0.045, 0.3, metal, 0, 0.012, -0.3, g);
      box(0.05, 0.16, 0.07, metalDark, 0, -0.13, -0.05, g);
      box(0.05, 0.06, 0.14, polymer2, 0, -0.05, 0.12, g);
      box(0.04, 0.03, 0.12, metal, 0, 0.062, -0.12, g);
      box(0.05, 0.06, 0.06, glove, 0.01, -0.08, -0.16, g);
      box(0.05, 0.05, 0.05, glove2, -0.005, -0.09, 0.03, g);
      muzzleZ = -0.47;
      break;
    }
    case 'p90': {
      box(0.08, 0.14, 0.42, polymer2, 0, 0.01, -0.08, g);
      box(0.06, 0.05, 0.2, polymer, 0, 0.1, -0.05, g);
      box(0.05, 0.14, 0.06, polymer, 0, -0.09, -0.2, g);
      box(0.055, 0.05, 0.05, glove, 0.01, -0.05, -0.1, g);
      box(0.05, 0.05, 0.05, glove2, 0, -0.05, 0.02, g);
      muzzleZ = -0.3;
      break;
    }
    case 'vector': {
      box(0.065, 0.11, 0.4, polymer2, 0, 0, -0.06, g);
      box(0.055, 0.2, 0.07, polymer, 0, -0.15, -0.02, g);
      box(0.04, 0.04, 0.16, metalDark, 0, 0.008, -0.3, g);
      box(0.05, 0.06, 0.12, polymer, 0, -0.045, 0.13, g);
      box(0.05, 0.05, 0.06, glove, 0.01, -0.09, -0.14, g);
      muzzleZ = -0.4;
      break;
    }
    case 'ak': {
      box(0.06, 0.11, 0.46, metalDark, 0, 0, -0.1, g);
      box(0.055, 0.075, 0.26, wood, 0, -0.035, -0.36, g);
      box(0.05, 0.16, 0.1, metalDark, 0, -0.12, -0.02, g);
      const mag = box(0.045, 0.22, 0.1, metal, 0, -0.16, -0.12, g);
      mag.rotation.x = 0.22;
      extras.mag = mag;
      box(0.05, 0.08, 0.24, wood, 0, -0.01, 0.2, g);
      cyl(0.016, 0.016, 0.42, metal, 0, 0.03, -0.6, g);
      box(0.03, 0.035, 0.07, metalDark, 0, 0.08, -0.36, g);
      box(0.055, 0.06, 0.07, glove, 0.01, -0.1, -0.3, g);
      box(0.05, 0.05, 0.05, glove2, -0.005, -0.1, 0.05, g);
      muzzleZ = -0.82;
      break;
    }
    case 'm4': {
      box(0.06, 0.11, 0.44, polymer2, 0, 0, -0.1, g);
      box(0.06, 0.07, 0.3, polymer, 0, -0.03, -0.36, g);
      const mag = box(0.045, 0.2, 0.09, metal, 0, -0.14, -0.1, g);
      mag.rotation.x = 0.1;
      extras.mag = mag;
      box(0.05, 0.12, 0.08, polymer, 0, -0.08, 0.03, g);
      box(0.055, 0.08, 0.24, polymer2, 0, 0, 0.2, g);
      cyl(0.014, 0.014, 0.42, metalDark, 0, 0.028, -0.6, g);
      box(0.035, 0.03, 0.2, metal, 0, 0.075, -0.16, g);
      box(0.03, 0.05, 0.03, metalDark, 0, 0.11, -0.28, g);
      box(0.055, 0.06, 0.07, glove, 0.01, -0.1, -0.32, g);
      box(0.05, 0.05, 0.05, glove2, -0.005, -0.09, 0.02, g);
      muzzleZ = -0.8;
      break;
    }
    case 'aug': {
      box(0.07, 0.13, 0.46, polymer2, 0, 0, -0.1, g);
      box(0.05, 0.16, 0.1, polymer, 0, -0.12, -0.02, g);
      const mag = box(0.05, 0.2, 0.09, metalDark, 0, -0.13, -0.16, g);
      extras.mag = mag;
      cyl(0.02, 0.02, 0.3, metalDark, 0, 0.03, -0.38, g);
      const scope = cyl(0.035, 0.035, 0.22, metal, 0, 0.11, -0.1, g);
      box(0.05, 0.05, 0.05, glove, 0.01, -0.11, -0.02, g);
      box(0.05, 0.05, 0.05, glove2, -0.005, -0.11, 0.06, g);
      extras.scope = scope;
      muzzleZ = -0.55;
      break;
    }
    case 'scar': {
      box(0.065, 0.12, 0.48, M.tan(), 0, 0, -0.1, g);
      const mag = box(0.05, 0.22, 0.1, metalDark, 0, -0.15, -0.1, g);
      extras.mag = mag;
      box(0.055, 0.08, 0.24, M.tan(), 0, -0.01, 0.2, g);
      cyl(0.016, 0.016, 0.44, metal, 0, 0.028, -0.62, g);
      box(0.035, 0.035, 0.26, metal, 0, 0.075, -0.18, g);
      box(0.055, 0.06, 0.07, glove, 0.01, -0.1, -0.3, g);
      box(0.05, 0.05, 0.05, glove2, -0.005, -0.1, 0.03, g);
      muzzleZ = -0.84;
      break;
    }
    case 'awm': {
      box(0.06, 0.12, 0.6, polymer2, 0, 0, -0.1, g);
      box(0.05, 0.14, 0.2, polymer, 0, -0.09, 0.18, g);
      box(0.06, 0.1, 0.24, polymer, 0, -0.02, -0.42, g);
      cyl(0.017, 0.017, 0.6, metalDark, 0, 0.028, -0.88, g);
      const scope = cyl(0.042, 0.042, 0.34, metal, 0, 0.135, -0.12, g);
      cyl(0.05, 0.05, 0.05, metalDark, 0, 0.135, -0.3, g);
      extras.scope = scope;
      box(0.045, 0.13, 0.08, metalDark, 0, -0.1, -0.02, g);
      const mag = box(0.05, 0.14, 0.1, metal, 0, -0.12, -0.16, g);
      extras.mag = mag;
      box(0.055, 0.06, 0.07, glove, 0.01, -0.1, -0.36, g);
      box(0.05, 0.05, 0.05, glove2, -0.005, -0.1, 0.06, g);
      muzzleZ = -1.18;
      break;
    }
    case 'gauss': {
      box(0.075, 0.14, 0.56, polymer2, 0, 0, -0.1, g);
      const coil = cyl(0.035, 0.035, 0.5, M.glow(0x63e0ff), 0, 0.02, -0.5, g);
      for (let i = 0; i < 4; i++) cyl(0.06, 0.06, 0.03, metal, 0, 0.02, -0.32 - i * 0.12, g);
      box(0.05, 0.14, 0.09, metalDark, 0, -0.11, -0.05, g);
      const scope = cyl(0.04, 0.04, 0.3, metal, 0, 0.13, -0.1, g);
      extras.scope = scope;
      extras.glow = coil;
      box(0.055, 0.06, 0.07, glove, 0.01, -0.1, -0.32, g);
      box(0.05, 0.05, 0.05, glove2, -0.005, -0.1, 0.04, g);
      muzzleZ = -0.95;
      break;
    }
    case 'pump': {
      box(0.07, 0.12, 0.5, metalDark, 0, 0, -0.1, g);
      cyl(0.022, 0.022, 0.6, metal, 0, 0.028, -0.6, g);
      cyl(0.026, 0.026, 0.5, metalDark, 0, -0.05, -0.55, g);
      const pump = box(0.06, 0.07, 0.16, wood, 0, -0.05, -0.42, g);
      extras.pump = pump;
      box(0.055, 0.09, 0.26, wood, 0, -0.01, 0.2, g);
      box(0.055, 0.06, 0.07, glove, 0.01, -0.08, -0.42, g);
      box(0.05, 0.05, 0.05, glove2, -0.005, -0.09, 0.03, g);
      muzzleZ = -0.92;
      break;
    }
    case 'auto_shotgun': {
      box(0.07, 0.13, 0.46, polymer2, 0, 0, -0.1, g);
      cyl(0.024, 0.024, 0.44, metalDark, 0, 0.03, -0.5, g);
      const drum = cyl(0.075, 0.075, 0.09, metal, 0, -0.1, -0.14, g, 14, false);
      extras.mag = drum;
      box(0.055, 0.09, 0.22, polymer, 0, -0.01, 0.18, g);
      box(0.055, 0.06, 0.07, glove, 0.01, -0.09, -0.34, g);
      box(0.05, 0.05, 0.05, glove2, -0.005, -0.1, 0.03, g);
      muzzleZ = -0.74;
      break;
    }
    case 'plasma': {
      box(0.08, 0.14, 0.46, polymer2, 0, 0, -0.08, g);
      const core = cyl(0.045, 0.045, 0.34, M.glow(0xff7a2e), 0, 0.02, -0.44, g);
      cyl(0.06, 0.06, 0.06, metal, 0, 0.02, -0.62, g);
      box(0.05, 0.16, 0.1, metalDark, 0, -0.12, -0.02, g);
      box(0.055, 0.09, 0.22, polymer, 0, -0.01, 0.18, g);
      extras.glow = core;
      box(0.055, 0.06, 0.07, glove, 0.01, -0.1, -0.26, g);
      box(0.05, 0.05, 0.05, glove2, -0.005, -0.1, 0.04, g);
      muzzleZ = -0.7;
      break;
    }
    case 'minigun': {
      box(0.14, 0.16, 0.4, metalDark, 0, -0.02, -0.05, g);
      const barrels = new THREE.Group();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        cyl(0.016, 0.016, 0.7, metal, Math.cos(a) * 0.045, Math.sin(a) * 0.045, -0.62, barrels);
      }
      barrels.position.y = 0.03;
      g.add(barrels);
      extras.barrels = barrels;
      cyl(0.075, 0.075, 0.08, metalDark, 0, 0.03, -0.34, g);
      box(0.08, 0.14, 0.16, metal, 0, -0.14, -0.05, g);
      box(0.06, 0.07, 0.08, glove, 0.06, -0.12, -0.3, g);
      box(0.06, 0.07, 0.08, glove2, -0.06, -0.12, -0.05, g);
      muzzleZ = -1.0;
      break;
    }
    case 'grenade_he':
    case 'grenade_smoke':
    case 'grenade_flash':
    case 'grenade_fire':
    case 'grenade_decoy': {
      const colors = { grenade_he: 0x3f4a35, grenade_smoke: 0x6a6c70, grenade_flash: 0xb9b39c, grenade_fire: 0x8c3a1e, grenade_decoy: 0x4a5a7a };
      const bodyMat = new THREE.MeshStandardMaterial({ color: colors[style] || 0x3f4a35, roughness: 0.75, metalness: 0.35 });
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 10), bodyMat);
      ball.position.set(0, 0.02, -0.12);
      g.add(ball);
      cyl(0.02, 0.02, 0.06, metal, 0, 0.1, -0.12, g, 8, false);
      box(0.05, 0.012, 0.05, metal, 0.03, 0.1, -0.12, g);
      box(0.055, 0.09, 0.06, glove, -0.005, -0.06, -0.08, g);
      muzzleZ = -0.12;
      break;
    }
    case 'knife': {
      box(0.012, 0.05, 0.28, metal, 0, 0.01, -0.2, g);
      box(0.02, 0.055, 0.05, metalDark, 0, 0.01, -0.05, g);
      box(0.028, 0.04, 0.13, polymer, 0, -0.005, 0.06, g);
      box(0.05, 0.05, 0.06, glove, 0.005, -0.02, 0.04, g);
      muzzleZ = -0.35;
      break;
    }
    default: {
      box(0.06, 0.11, 0.5, polymer2, 0, 0, -0.1, g);
      muzzleZ = -0.6;
    }
  }

  // общие настройки
  g.traverse((o) => {
    if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; }
  });
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.03, muzzleZ);
  muzzle.name = 'muzzle';
  g.add(muzzle);
  // имена вместо userData: clone() сериализует userData и теряет ссылки на объекты
  if (extras.mag) extras.mag.name = 'extras_mag';
  if (extras.barrels) extras.barrels.name = 'extras_barrels';
  if (extras.scope) extras.scope.name = 'extras_scope';
  if (extras.glow) extras.glow.name = 'extras_glow';
  if (extras.pump) extras.pump.name = 'extras_pump';
  g.userData.style = style;
  cache.set(style, g);
  return g.clone(true);
}

/** Позиция «дула» в локальных координатах модели. */
export function muzzleLocal(model) {
  const found = model.getObjectByName('muzzle');
  return found ? found.position : new THREE.Vector3(0, 0.03, -0.6);
}

export class ViewModel {
  /** camera — отдельная камера сцены оружия (engine.viewCamera). */
  constructor(camera) {
    this.camera = camera;
    this.root = new THREE.Group();
    this.root.position.set(0.22, -0.2, -0.42);
    camera.add(this.root);
    this.model = null;
    this.weapon = null;
    this.muzzleRoot = null;
    this.muzzleLight = new THREE.PointLight(0xffcf8a, 0, 9, 2);
    this.muzzleLight.position.set(0.2, -0.1, -0.9);
    camera.add(this.muzzleLight);
    this.muzzleSprite = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false })
    );
    this.muzzleSprite.position.set(0.22, -0.16, -0.95);
    this.muzzleSprite.renderOrder = 5;
    camera.add(this.muzzleSprite);

    this.bob = { t: 0, amp: 0 };
    this.sway = { x: 0, y: 0 };
    this.recoil = { pos: 0, rot: 0, side: 0 };
    this.reloadT = 0;
    this.reloadDur = 1;
    this.deployT = 0;
    this.adsT = 0;
    this.adsAmount = 0;
    this.inspectT = 0;
    this.basePosition = new THREE.Vector3(0.22, -0.2, -0.42);
    this.adsPosition = new THREE.Vector3(0, -0.075, -0.26);
    this.muzzleFlashT = 0;
    this.barrelSpin = 0;
  }

  setWeapon(def) {
    if (this.weapon && this.weapon.id === def.id) return;
    if (this.model) this.root.remove(this.model);
    this.weapon = def;
    this.model = build(def.buildStyle || 'rifle');
    this.root.add(this.model);
    this.deployT = 0.42;
    this.reloadT = 0;
    this.adsT = 0;
    this.muzzleRoot = this.model.getObjectByName('muzzle') || null;
    this.scopeAmount = (def.buildStyle === 'awm' || def.buildStyle === 'gauss') ? 1 : (def.buildStyle === 'aug' ? 0.4 : 0);
    this.minigun = this.model.getObjectByName('extras_barrels') || null;
    this.mag = this.model.getObjectByName('extras_mag') || null;
  }

  fire(recoilKick = 1) {
    this.recoil.pos = Math.min(0.09, this.recoil.pos + 0.028 * recoilKick);
    this.recoil.rot = Math.min(0.32, this.recoil.rot + 0.07 * recoilKick);
    this.recoil.side = (Math.random() - 0.5) * 0.02 * recoilKick;
    this.muzzleFlashT = 0.05;
    this.muzzleLight.intensity = 6;
    this.muzzleSprite.material.opacity = 0.9;
    this.muzzleSprite.material.rotation = Math.random() * Math.PI;
    if (this.muzzleRoot) {
      const s = 0.7 + Math.random() * 0.7;
      this.muzzleSprite.position.set(0.24 + (Math.random() - 0.5) * 0.05, -0.14, -0.75);
      this.muzzleSprite.scale.set(s, s, s);
    }
  }

  startReload(duration) {
    this.reloadT = duration;
    this.reloadDur = duration;
  }

  setAds(on) { this.adsTarget = on ? 1 : 0; }

  update(dt, params) {
    const { moving = 0, speed = 0, onGround = true, mouse = { dx: 0, dy: 0 }, rotating = false } = params || {};
    // покачивание
    this.bob.amp += ((onGround && moving > 0.1 ? 1 : 0) * Math.min(1, speed / 4.5) - this.bob.amp) * Math.min(1, dt * 6);
    this.bob.t += dt * (6 + speed * 1.6);
    const bobX = Math.sin(this.bob.t) * 0.022 * this.bob.amp;
    const bobY = Math.abs(Math.cos(this.bob.t)) * 0.016 * this.bob.amp;

    // инерция мыши
    const targetSwayX = THREE.MathUtils.clamp(-mouse.dx * 0.0016, -0.045, 0.045);
    const targetSwayY = THREE.MathUtils.clamp(mouse.dy * 0.0016, -0.04, 0.04);
    this.sway.x += (targetSwayX - this.sway.x) * Math.min(1, dt * 8);
    this.sway.y += (targetSwayY - this.sway.y) * Math.min(1, dt * 8);

    // отдача
    this.recoil.pos += (0 - this.recoil.pos) * Math.min(1, dt * 12);
    this.recoil.rot += (0 - this.recoil.rot) * Math.min(1, dt * 10);
    this.recoil.side += (0 - this.recoil.side) * Math.min(1, dt * 10);

    // прицеливание
    const adsTarget = this.adsTarget || 0;
    this.adsAmount += (adsTarget - this.adsAmount) * Math.min(1, dt * 12);

    // перезарядка
    let reloadOffset = 0, reloadRot = 0;
    if (this.reloadT > 0) {
      this.reloadT = Math.max(0, this.reloadT - dt);
      const p = 1 - this.reloadT / this.reloadDur;
      const curve = Math.sin(Math.min(1, p * 1.15) * Math.PI);
      reloadOffset = -curve * 0.22;
      reloadRot = curve * 0.65;
      if (this.mag) {
        const magOut = p < 0.45 ? p / 0.45 : Math.max(0, (0.75 - p) / 0.3);
        this.mag.position.y = (this.mag.userData.y0 ?? (this.mag.userData.y0 = this.mag.position.y)) - magOut * 0.42;
        this.mag.rotation.z = magOut * 0.5;
      }
    } else if (this.mag && this.mag.userData.y0 !== undefined) {
      this.mag.position.y = this.mag.userData.y0;
      this.mag.rotation.z = 0;
    }

    // появление оружия
    let deploy = 0;
    if (this.deployT > 0) {
      this.deployT = Math.max(0, this.deployT - dt);
      const p = 1 - this.deployT / 0.42;
      deploy = (1 - Math.pow(p, 0.5)) * 1;
    }

    // вращение стволов минигана
    if (this.minigun && this.barrelSpin !== 0) {
      this.minigun.rotation.z += this.barrelSpin * dt;
      this.barrelSpin = Math.max(0, this.barrelSpin - dt * 14);
    }

    const pos = this.basePosition.clone().lerp(this.adsPosition, this.adsAmount);
    const scale = 1 - this.adsAmount * (1 - (this.scopeAmount ? 0.75 : 0.85));
    this.root.position.set(
      pos.x + bobX + this.sway.x + this.recoil.side,
      pos.y + bobY + this.sway.y - deploy * 0.4 - reloadOffset,
      pos.z + this.recoil.pos
    );
    this.root.rotation.set(
      this.recoil.rot + reloadRot - deploy * 0.7,
      -this.sway.x * 1.6,
      this.sway.x * 0.6 + (rotating ? 0.12 : 0)
    );
    this.root.scale.setScalar(scale);

    // вспышка выстрела
    if (this.muzzleFlashT > 0) {
      this.muzzleFlashT -= dt;
      this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 120);
      this.muzzleSprite.material.opacity = Math.max(0, this.muzzleFlashT / 0.05 * 0.9);
    } else {
      this.muzzleLight.intensity = 0;
      this.muzzleSprite.material.opacity = 0;
    }
  }
}
