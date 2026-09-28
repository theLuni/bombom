/**
 * Безголовая обвязка: заглушки DOM/канваса + сборка карты и игры.
 * Используется скриптами проверки (tools/*-check.mjs), браузер не нужен.
 */
import * as THREE from 'three';

export function installStubs() {
  if (typeof globalThis.document === 'undefined') {
    const makeCtx = () => {
      const grad = { addColorStop() {} };
      return {
        canvas: null, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1,
        font: '', textAlign: '', textBaseline: '', lineCap: '', lineJoin: '',
        fillRect() {}, clearRect() {}, strokeRect() {}, beginPath() {}, closePath() {},
        arc() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, save() {}, restore() {},
        translate() {}, rotate() {}, scale() {}, fillText() {}, strokeText() {},
        quadraticCurveTo() {}, bezierCurveTo() {}, ellipse() {}, setLineDash() {},
        createRadialGradient: () => grad, createLinearGradient: () => grad,
        getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h }),
        putImageData() {},
      };
    };
    globalThis.document = {
      createElement(tag) {
        if (tag === 'canvas') {
          return { width: 1, height: 1, style: {}, getContext: () => makeCtx(), addEventListener() {}, removeEventListener() {} };
        }
        return { style: {}, appendChild() {}, addEventListener() {}, removeEventListener() {}, classList: { add() {}, remove() {} } };
      },
      getElementById: () => null,
      addEventListener() {}, removeEventListener() {},
      pointerLockElement: null,
    };
  }
  if (typeof globalThis.window === 'undefined') {
    globalThis.window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} };
  }
  if (typeof globalThis.localStorage === 'undefined') {
    const store = new Map();
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
    };
  }
  if (typeof globalThis.requestAnimationFrame === 'undefined') globalThis.requestAnimationFrame = () => 0;
}

/** Ввод без DOM: эмулирует клавиатуру/мышь для игрового цикла. */
export class FakeInput {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { dx: 0, dy: 0, left: false, right: false, wheel: 0, leftClick: false, rightClick: false };
    this.actions = new Map();
    this.move = { x: 0, z: 0 };
  }
  press(code) { this.keys.add(code); this.pressed.add(code); }
  release(code) { this.keys.delete(code); }
  isDown(code) { return this.keys.has(code); }
  wasPressed(code) { return this.pressed.has(code); }
  endFrame() { this.pressed.clear(); this.mouse.leftClick = false; this.mouse.rightClick = false; this.mouse.dx = 0; this.mouse.dy = 0; }
  takeMouse() { return { dx: this.mouse.dx, dy: this.mouse.dy, wheel: this.mouse.wheel }; }
  axis() { return { x: this.move.x, z: this.move.z }; }
  onAction(code, fn) { this.actions.set(code, fn); }
  requestLock() {} exitLock() {}
}

/** Собирает мир и игру на пустой сцене (без рендера). */
export async function makeSim({ scene, camera } = {}) {
  installStubs();
  const { Physics } = await import('../src/core/physics.js');
  const { Effects } = await import('../src/world/effects.js');
  const { buildMap } = await import('../src/world/map.js');
  const { Game } = await import('../src/game/game.js');

  const sc = scene || new THREE.Scene();
  const cam = camera || new THREE.PerspectiveCamera(90, 16 / 9, 0.05, 400);
  const physics = new Physics();
  const effects = new Effects(sc);
  const world = buildMap(sc, physics);
  const engine = {
    scene: sc, camera: cam, viewScene: new THREE.Scene(), viewCamera: cam,
    addShake() {}, setShadows() {}, update() {}, renderMain() {}, renderOverlay() {},
    particles: null,
  };
  const input = new FakeInput();
  const game = new Game({ engine, input, effects, physics, world, camera: cam, scene: sc, canvas: null });
  return { THREE, scene: sc, camera: cam, physics, effects, world, engine, input, game };
}

export class AutoPlayer {
  constructor(game, input, physics, world) {
    this.game = game;
    this.input = input;
    this.physics = physics;
    this.world = world || game.world;
    this.target = null;
    this.path = null;
    this.goal = null;
    this.navTimer = 0;
    this.throwTimer = 4;
    this.stats = { shots: 0, kills: 0, defuses: 0, rounds: 0, grenades: 0, dashes: 0 };
  }

  aimAt(point, dt, speed = 14) {
    const p = this.game.player;
    const eye = p.eyePosition(new THREE.Vector3());
    const dx = point.x - eye.x, dz = point.z - eye.z;
    const wantYaw = Math.atan2(-dx, -dz);
    const wantPitch = Math.atan2(point.y - eye.y, Math.hypot(dx, dz));
    const lerp = Math.min(1, dt * speed);
    let dy = wantYaw - p.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    p.yaw += dy * lerp;
    p.pitch += (wantPitch - p.pitch) * lerp;
  }

  pickTarget() {
    const p = this.game.player;
    const eye = p.eyePosition(new THREE.Vector3());
    let best = null, bestD = 1e9;
    for (const bot of this.game.aliveBots()) {
      let aimY = null;
      for (const dy of [1.35, 0.95, 1.62]) {
        const bp = bot.pos.clone().setY(bot.pos.y + dy);
        if (this.physics.lineOfSight(eye, bp)) { aimY = dy; break; }
      }
      if (aimY === null) continue;
      const d = Math.hypot(bot.pos.x - eye.x, bot.pos.z - eye.z);
      if (d < bestD) { bestD = d; best = bot; best.aimY = aimY; }
    }
    this.target = best;
    return best;
  }

  nearestBot() {
    const p = this.game.player;
    let best = null, bestD = 1e9;
    for (const bot of this.game.aliveBots()) {
      const d = Math.hypot(bot.pos.x - p.pos.x, bot.pos.z - p.pos.z);
      if (d < bestD) { bestD = d; best = bot; }
    }
    return best;
  }

  /** Идёт к точке по маршруту навигационной сетки. */
  goto(point, dt, stopAt = 1.6) {
    const p = this.game.player;
    const input = this.input;
    this.navTimer -= dt;
    const needReplan = !this.goal || this.navTimer <= 0 || this.goal.distanceToSquared(point) > 9 || !this.path;
    if (needReplan) {
      this.path = this.world.nav.path(p.pos, point) || null;
      this.goal = point.clone();
      this.navTimer = 1.4;
    }
    const dist = Math.hypot(point.x - p.pos.x, point.z - p.pos.z);
    if (dist <= stopAt) { input.move.z = 0; return true; }
    let wp = point;
    while (this.path && this.path.length) {
      const first = this.path[0];
      if (Math.hypot(first.x - p.pos.x, first.z - p.pos.z) < 1.5) this.path.shift();
      else break;
    }
    if (this.path && this.path.length) wp = this.path[0];
    this.aimAt(new THREE.Vector3(wp.x, p.pos.y + 1.62, wp.z), dt, 6);
    input.move.z = 1;
    return false;
  }

  step(dt) {
    const g = this.game;
    const p = g.player;
    const input = this.input;
    input.move.x = 0; input.move.z = 0;
    input.mouse.left = false;
    this.navTimer -= 0;

    if (g.pauseReason === 'loot') { g.chooseLoot(0); input.endFrame(); return; }
    if (p.dead) { input.endFrame(); return; }

    // покупки в начале раунда
    if (g.state === 'buy') {
      const credits = g.run.credits;
      if (!p.hasDefuseKit && credits > 900) g.buy('defusekit');
      if (credits > 1200) g.buy('armor');
      if (credits > 3200 && p.slots.primary !== 'rifle_ak' && p.slots.primary !== 'rifle_m4') g.buy('rifle_ak');
      if (g.buyTimer > 0.3) { input.endFrame(); return; }
    }

    this.throwTimer -= dt;
    const bombsPlanted = !!(g.bomb && g.bomb.planted);
    const visible = this.pickTarget();

    if (visible) {
      const bp = visible.pos.clone().setY(visible.pos.y + (visible.aimY || 1.2) + (Math.random() < 0.25 ? 0.25 : 0));
      this.aimAt(bp, dt, 16);
      const st = p.state;
      if (st && st.ammo <= 0 && !st.reloading) p.beginReload();
      else if (st && !st.reloading && !p.dead) {
        const before = st.ammo;
        input.mouse.left = true;
        p.tryFire();
        if (st.ammo < before) this.stats.shots++;
      }
      const d = Math.hypot(visible.pos.x - p.pos.x, visible.pos.z - p.pos.z);
      if (d > 22) { this.goto(visible.pos.clone().setY(0), dt, 14); }
      else if (d < 8) { input.move.x = Math.sin(g.time * 1.3) * 0.8; input.move.z = -0.5; }
      else { input.move.x = Math.sin(g.time * 1.7) * 0.9; }
      // гранаты по скоплению врагов
      if (this.throwTimer <= 0 && p.grenades.he > 0 && d > 10 && d < 30) {
        p.selectGrenade('he');
        input.mouse.left = true;
        if (p.throwGrenade()) this.stats.grenades++;
        p.switchTo('primary', true);
        this.throwTimer = 12 + Math.random() * 8;
      }
    } else if (bombsPlanted) {
      const d = Math.hypot(g.bomb.pos.x - p.pos.x, g.bomb.pos.z - p.pos.z);
      if (d < 1.5) { this.aimAt(new THREE.Vector3(g.bomb.pos.x, 0.2, g.bomb.pos.z), dt); input.press('KeyE'); }
      else { input.release('KeyE'); this.goto(new THREE.Vector3(g.bomb.pos.x, 0, g.bomb.pos.z), dt, 1.2); }
    } else {
      const hunt = this.nearestBot();
      if (hunt) this.goto(hunt.pos.clone().setY(0), dt, 12);
      else {
        const sites = g.world.sites;
        let best = null, bestD = 1e9;
        for (const s of sites) {
          const d = Math.hypot(s.center.x - p.pos.x, s.center.z - p.pos.z);
          if (d < bestD) { bestD = d; best = s; }
        }
        if (best) this.goto(best.center.clone().setY(0), dt, 8);
      }
      const st = p.state;
      if (st && st.ammo < st.def.mag * 0.4 && !st.reloading) p.beginReload();
    }

    if (p.health < p.maxHealth * 0.5 && p.medicCd <= 0) input.press('KeyF');
    input.endFrame();
  }
}
