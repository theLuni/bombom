/**
 * Сборка карты: меши, коллайдеры, навигация.
 */
import * as THREE from 'three';
import { Materials, groundTexture, siteMarkerTexture } from '../core/textures.js';
import { NavGrid } from './nav.js';
import {
  CELL, MAP_SIZE, ORIGIN, layoutSpecs, spawnPoints, siteZones, TILE_MAP, rows, cols, cellCenter, tileAt, validate, MAP_META,
} from './layout.js';

/** Масштабирование UV боковой геометрии, чтобы текстура не растягивалась. */
function scaleBoxUV(geo, w, h, d, tileSize = 2.6) {
  const uv = geo.attributes.uv;
  const su = [d / tileSize, d / tileSize, w / tileSize, w / tileSize, w / tileSize, w / tileSize];
  const sv = [h / tileSize, h / tileSize, d / tileSize, d / tileSize, h / tileSize, h / tileSize];
  for (let face = 0; face < 6; face++) {
    for (let i = 0; i < 4; i++) {
      const idx = face * 4 + i;
      uv.setXY(idx, uv.getX(idx) * su[face], uv.getY(idx) * sv[face]);
    }
  }
  uv.needsUpdate = true;
  return geo;
}

function makeFloor(width, depth, cx, cz, y, matFactory, repeat) {
  const geo = new THREE.PlaneGeometry(width, depth);
  geo.rotateX(-Math.PI / 2);
  const mat = matFactory();
  const mesh = new THREE.Mesh(geo, mat);
  if (mat.map) {
    mat.map = mat.map.clone();
    mat.map.needsUpdate = true;
    mat.map.repeat.set(repeat, repeat);
    mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping;
  }
  mesh.position.set(cx, y, cz);
  mesh.receiveShadow = true;
  return mesh;
}

export function buildMap(scene, physics) {
  validate();
  const group = new THREE.Group();
  group.name = 'map';
  scene.add(group);

  const matCache = new Map();
  const getMat = (name) => {
    if (!matCache.has(name)) {
      const m = {
        concrete: Materials.concreteWall(),
        crate: Materials.crate(),
        metal: Materials.metal(),
        container: Materials.metalDark(),
        tile: Materials.tile(),
        crateGreen: Materials.crateGreen(),
      }[name] || Materials.concreteWall();
      matCache.set(name, m);
    }
    return matCache.get(name);
  };

  /* ---------- пол ---------- */
  const groundPlane = makeFloor(MAP_SIZE + 6, MAP_SIZE + 6, 0, 0, 0, () => Materials.sand(), (MAP_SIZE + 6) / 5);
  group.add(groundPlane);
  const outer = makeFloor(420, 420, 0, 0, -0.06, () => Materials.ground(), 420 / 9);
  group.add(outer);
  // бетонная «подушка» под всей зоной боя
  const padGeo = new THREE.BoxGeometry(MAP_SIZE + 1, 0.4, MAP_SIZE + 1);
  const pad = new THREE.Mesh(padGeo, getMat('concrete'));
  scaleBoxUV(padGeo, MAP_SIZE, 0.4, MAP_SIZE, 4);
  pad.position.y = -0.2;
  pad.receiveShadow = true;
  group.add(pad);

  /* ---------- стены и объекты ---------- */
  const specs = layoutSpecs();
  for (const s of specs) {
    const geo = new THREE.BoxGeometry(s.w, s.h, s.d);
    scaleBoxUV(geo, s.w, s.h, s.d, s.tag === 'wall' ? 3.2 : 2.2);
    const mesh = new THREE.Mesh(geo, getMat(s.mat));
    mesh.position.set(s.x, s.h / 2, s.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    physics.addBox(
      new THREE.Vector3(s.x - s.w / 2, 0, s.z - s.d / 2),
      new THREE.Vector3(s.x + s.w / 2, s.h, s.z + s.d / 2),
      { material: s.tag === 'crate' ? 'crate' : s.tag === 'container' || s.tag === 'barrel' ? 'metal' : 'wall', tag: s.tag }
    );
    // мелкие детали: рёбра контейнеров и ящиков
    if (s.tag === 'container') {
      for (const dx of [-1, 1]) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.14, s.h * 0.98, s.d * 0.98), getMat('metal'));
        strip.position.set(s.x + dx * (s.w / 2 - 0.07), s.h / 2, s.z);
        group.add(strip);
      }
    }
  }

  /* ---------- бочки ---------- */
  for (let r = 0; r < rows(); r++) {
    for (let c = 0; c < cols(); c++) {
      if (tileAt(c, r) !== 'B') continue;
      const p = cellCenter(c, r);
      const geo = new THREE.CylinderGeometry(0.52, 0.52, 1.15, 14);
      const barrel = new THREE.Mesh(geo, getMat('metal'));
      barrel.position.set(p.x, 0.575, p.z);
      barrel.castShadow = true;
      barrel.receiveShadow = true;
      group.add(barrel);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.53, 0.05, 6, 16), getMat('container'));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(p.x, 0.78, p.z);
      group.add(ring);
      physics.addBox(
        new THREE.Vector3(p.x - 0.55, 0, p.z - 0.55),
        new THREE.Vector3(p.x + 0.55, 1.15, p.z + 0.55),
        { material: 'metal', tag: 'barrel' }
      );
    }
  }

  /* ---------- навигация (до меток: центр точки должен встать на свободную клетку) ---------- */
  const nav = new NavGrid({ minX: ORIGIN.x + 1, maxX: ORIGIN.x + MAP_SIZE - 1, minZ: ORIGIN.z + 1, maxZ: ORIGIN.z + MAP_SIZE - 1 }, 2);
  nav.build(physics);

  /* ---------- метки точек закладки ---------- */
  const zones = siteZones();
  const sites = [];
  for (const [id, zone] of Object.entries(zones)) {
    // центр точки закладки не должен попадать внутрь ящика/бочки
    const free = nav.nearestFree(zone.center.x, zone.center.z, 8);
    if (free) {
      const w = nav.cellToWorld(free.cx, free.cz);
      zone.center = { x: w.x, z: w.z };
    }
    const tex = new THREE.CanvasTexture(siteMarkerTexture(id, id === 'A' ? '#ffb02e' : '#35d0ff'));
    tex.colorSpace = THREE.SRGBColorSpace;
    const size = zone.radius * 2.3;
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.95, polygonOffset: true, polygonOffsetFactor: -3 })
    );
    decal.rotation.x = -Math.PI / 2;
    decal.position.set(zone.center.x, 0.02, zone.center.z);
    group.add(decal);
    const glow = new THREE.PointLight(id === 'A' ? 0xffb02e : 0x35d0ff, 0.6, 16, 2);
    glow.position.set(zone.center.x, 2.4, zone.center.z);
    group.add(glow);
    sites.push({ id, center: new THREE.Vector3(zone.center.x, 0, zone.center.z), radius: zone.radius, glow });
  }

  /* ---------- фонарные столбы (атмосфера) ---------- */
  const poleMat = Materials.pure(0x4a4f56, { roughness: 0.7, metalness: 0.6 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe0a8 });
  const polePositions = [
    [-30, -22], [30, -22], [-30, 22], [30, 22], [0, -34], [0, 30], [-14, -6], [14, -6],
  ];
  for (const [x, z] of polePositions) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 7.5, 8), poleMat);
    pole.position.set(x, 3.75, z);
    pole.castShadow = true;
    group.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.22, 0.6), lampMat);
    head.position.set(x + 0.6, 7.4, z);
    group.add(head);
    physics.addBox(new THREE.Vector3(x - 0.2, 0, z - 0.2), new THREE.Vector3(x + 0.2, 7.5, z + 0.2), { material: 'metal', tag: 'pole', decor: true });
  }

  /* ---------- ящики-декор (мешки, поддоны) ---------- */
  const sandbagMat = Materials.pure(0x9c8e6c, { roughness: 1 });
  const rnd = mulberry(1337);
  for (let i = 0; i < 26; i++) {
    const c = 2 + Math.floor(rnd() * (cols() - 4));
    const r = 5 + Math.floor(rnd() * (rows() - 7));
    const t = tileAt(c, r);
    if (t !== '.' && t !== 'A' && t !== 'X') continue;
    const p = cellCenter(c, r);
    const bag = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.42, 0.7), sandbagMat);
    bag.position.set(p.x + (rnd() - 0.5) * 2.6, 0.21, p.z + (rnd() - 0.5) * 2.6);
    bag.rotation.y = rnd() * Math.PI;
    bag.castShadow = true;
    bag.receiveShadow = true;
    group.add(bag);
  }

  const playerSpawns = spawnPoints('p').map((p) => new THREE.Vector3(p.x, 0, p.z));
  const enemySpawns = spawnPoints('e').map((p) => new THREE.Vector3(p.x, 0, p.z));

  return {
    group,
    nav,
    sites,
    meta: MAP_META,
    playerSpawns,
    enemySpawns,
    bounds: { minX: ORIGIN.x, maxX: ORIGIN.x + MAP_SIZE, minZ: ORIGIN.z, maxZ: ORIGIN.z + MAP_SIZE },
    siteCenter(id) {
      const s = sites.find((x) => x.id === id);
      return s ? s.center : new THREE.Vector3();
    },
    inSite(pos, id) {
      const s = sites.find((x) => x.id === id);
      if (!s) return false;
      return Math.hypot(pos.x - s.center.x, pos.z - s.center.z) <= s.radius;
    },
    whichSite(pos) {
      for (const s of sites) if (Math.hypot(pos.x - s.center.x, pos.z - s.center.z) <= s.radius) return s.id;
      return null;
    },
  };
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export { CELL, TILE_MAP, groundTexture };
