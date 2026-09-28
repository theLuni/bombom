/**
 * Проверка интерфейса и API three.js в эмуляции DOM (jsdom).
 * Требует: npm i --no-save jsdom
 * Запуск: node tools/ui-check.mjs
 */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function fake2d() {
  const grad = { addColorStop() {} };
  return {
    fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, font: '', textAlign: '', textBaseline: '',
    fillRect() {}, clearRect() {}, strokeRect() {}, beginPath() {}, closePath() {}, arc() {}, moveTo() {},
    lineTo() {}, stroke() {}, fill() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
    fillText() {}, measureText: () => ({ width: 10 }),
    createRadialGradient: () => grad, createLinearGradient: () => grad,
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {},
  };
}

const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true });
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = function (kind) {
  if (kind === '2d') return fake2d();
  if (kind === 'webgl2' || kind === 'webgl') return null;
  return null;
};
window.HTMLCanvasElement.prototype.requestPointerLock = function () {};
window.document.exitPointerLock = function () {};
globalThis.window = window;
globalThis.EventTarget = window.EventTarget;
globalThis.Event = window.Event;
globalThis.CustomEvent = window.CustomEvent;
globalThis.document = window.document;
try { Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true }); } catch (e) {}
globalThis.HTMLElement = window.HTMLElement;
globalThis.HTMLCanvasElement = window.HTMLCanvasElement;
globalThis.Image = window.Image;
globalThis.localStorage = window.localStorage;
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.confirm = () => false;

const problems = [];
const log = (...a) => console.log(...a);

/* ---------- 1. Проверка API three.js, которое использует игра ---------- */
const THREE = await import('three');
const apiUsage = [
  'WebGLRenderer', 'Scene', 'PerspectiveCamera', 'Fog', 'HemisphereLight', 'DirectionalLight',
  'AmbientLight', 'PointLight', 'Mesh', 'Group', 'Object3D', 'BoxGeometry', 'PlaneGeometry',
  'SphereGeometry', 'CylinderGeometry', 'TorusGeometry', 'MeshStandardMaterial', 'MeshBasicMaterial',
  'InstancedMesh', 'CanvasTexture', 'Vector3', 'Quaternion', 'Matrix4', 'Color', 'MathUtils',
  'ACESFilmicToneMapping', 'PCFSoftShadowMap', 'SRGBColorSpace', 'RepeatWrapping', 'ClampToEdgeWrapping',
  'BackSide', 'DoubleSide', 'AdditiveBlending', 'NormalBlending', 'DynamicDrawUsage', 'Clock',
];
for (const name of apiUsage) {
  if (THREE[name] === undefined) problems.push(`three.js: отсутствует API ${name}`);
}
const probe = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial(), 4);
if (!probe.setColorAt || !probe.setMatrixAt) problems.push('three.js: InstancedMesh без setColorAt/setMatrixAt');
if (typeof new THREE.Scene().traverse !== 'function') problems.push('three.js: Scene.traverse отсутствует');
log(`API three.js (${apiUsage.length} проверок): ок`);

/* ---------- 2. Заглушка игры для UI ---------- */
const { bus, EV } = await import('../src/core/bus.js');
const { UI } = await import('../src/ui/ui.js');
const { WEAPONS } = await import('../src/data/weapons.js');
const { buildModifiers } = await import('../src/data/skills.js');

function makeFakeGame() {
  const skills = { damage: 2, vitality: 1 };
  const game = {
    time: 0,
    state: 'buy',
    pauseReason: null,
    roundNumber: 3,
    buyTimer: 8,
    roundTimer: 90,
    bomb: null,
    bots: [],
    lootOptions: null,
    settings: { sensitivity: 1, volume: 0.7, fov: 90, shadows: true },
    mods: buildModifiers(skills),
    meta: {
      level: 7, xp: 40, skillPoints: 3, skills,
      stats: { kills: 42, headshots: 11, deaths: 3, rounds: 8, roundsWon: 5, runs: 2, levelUps: 6, bestRound: 6 },
      settings: { sensitivity: 1, volume: 0.7, fov: 90, shadows: true },
    },
    run: {
      credits: 4200, lives: 2, maxLives: 3, kills: 12, headshots: 3, deaths: 1, roundsWon: 2, rounds: 3,
      damageDealt: 1800, items: [{ id: 'hp', name: 'Титановая пластина', rarity: 'epic', desc: '+15 HP' }],
      buffs: {}, bonusHp: 0, reloadMul: 1, critBonus: 0, lifesteal: 0, dashCd: 0, xpBonus: 0, armorBonus: 0,
      defuseKit: false, regenUntil: 0, regenRate: 0, berserkStacks: 0, berserkUntil: 0,
    },
    player: {
      pos: { x: 0, y: 0, z: -30 }, health: 78, armor: 45, dead: false, crouch: false, onGround: true,
      grenades: { he: 1, smoke: 1, flash: 0, fire: 0, decoy: 0 }, grenadeType: null, dashCd: 0, medicCd: 3.2,
      speedFactor: 0.3, spawnProtection: 0, slots: { primary: 'rifle_ak', secondary: 'pistol_std', melee: 'knife' },
      current: 'primary', yaw: 1.2, pitch: 0, state: { spread: () => 1.5, ammo: 24, reserve: 120, reloading: false },
      weaponDef: WEAPONS.rifle_ak, viewModel: { adsAmount: 0 },
      eyePosition: () => new THREE.Vector3(0, 1.6, -30),
    },
    engine: { setShadows() {} },
    physics: { lineOfSight: () => true },
    world: { whichSite: () => 'A' },
    aliveBots: () => game.bots.filter((b) => !b.dead),
    buffValue: () => 0,
    itemSpreadMul: () => 1,
    isFrozen: () => game.state === 'buy',
    startRun() { game.state = 'buy'; game.roundNumber = 1; },
    nextRound() { game.roundNumber++; game.state = 'buy'; },
    buy() { return true; },
    spendSkillPoint(id) { game.meta.skills[id] = (game.meta.skills[id] || 0) + 1; game.meta.skillPoints--; return true; },
    chooseLoot() { game.lootOptions = null; game.pauseReason = null; },
    saveMeta() {},
    runEnd() { game.state = 'idle'; },
  };
  // боты-заглушки для миникарты
  for (let i = 0; i < 4; i++) {
    game.bots.push({ dead: false, boss: i === 0, name: `Бот${i}`, pos: new THREE.Vector3(i * 8 - 12, 0, 12), game, weaponState: { lastShotAt: -10 }, lastShotAt: -10 });
  }
  return game;
}

const game = makeFakeGame();
const root = window.document.getElementById('ui');
if (!root) problems.push('index.html: нет контейнера #ui');
const input = {
  requestLock() {}, exitLock() {},
  onAction() {}, isDown: () => false, wasPressed: () => false, endFrame() {},
  takeMouse: () => ({ dx: 0, dy: 0 }), axis: () => ({ x: 0, z: 0 }), mouse: {},
};
const ui = new UI(game, input, { requestPointerLock() {} });
log('UI создан, HUD в DOM:', !!window.document.querySelector('#hud .hud-top'), ', меню:', !!window.document.querySelector('#menu'));

/* ---------- 3. Прогон всех экранов ---------- */
const check = (label, fn) => {
  try { fn(); log(`  ✓ ${label}`); }
  catch (e) { problems.push(`${label}: ${e.message}`); log(`  ✗ ${label}: ${e.message}`); }
};

check('меню → старт операции', () => {
  window.document.querySelector('#menu .btn.primary').click();
  if (!game.started) game.startRun();
});
check('дерево навыков', () => ui.openSkillTree());
check('магазин', () => { ui.openBuy(); });
check('арсенал', () => ui.openArsenal());
check('управление', () => ui.openControls());
check('настройки', () => ui.openSettings());
check('отчёт по операции', () => ui.toggleStats());
check('пауза', () => ui.togglePause());
check('закрытие оверлея', () => ui.closeOverlay());

// события боя
const events = [
  [EV.HIT, { damage: 37, zone: 'head', killed: false, x: 640, y: 320, botName: 'Тест' }],
  [EV.HIT, { damage: 120, zone: 'body', killed: true, x: 700, y: 300, botName: 'Тест' }],
  [EV.KILL, { bot: { name: 'Тест' }, headshot: true, round: 3 }],
  [EV.BOT_DEATH, { bot: { name: 'Тест' }, zone: 'head' }],
  [EV.TOAST, { text: 'Проверка', kind: 'epic' }],
  [EV.LEVEL_UP, { level: 8, points: 4 }],
  [EV.FLASH, { duration: 2, power: 1 }],
  [EV.DAMAGE_TAKEN, { amount: 20, zone: 'body', health: 58 }],
  [EV.PROMPT, { text: 'Разминирование', progress: 0.4 }],
  [EV.BOMB, { planting: true, progress: 0.5, site: 'A' }],
  [EV.BOMB, { planted: true, site: 'A', timer: 33.2 }],
  [EV.ROUND_START, { round: 4, maxRounds: 20, credits: 3200, enemies: 5 }],
  [EV.OBJECTIVE, { text: 'Задача' }],
];
check('события боя (хитмаркер, киллфид, тосты, бомба)', () => {
  for (const [name, payload] of events) bus.emit(name, payload);
});
check('выбор лута', () => {
  game.lootOptions = [{ item: { icon: '💊', name: 'Аптечка', desc: () => '+35 HP' }, rarity: { id: 'rare', name: 'Редкое', cls: 'rare' }, value: 52 }];
  bus.emit(EV.LOOT, { options: game.lootOptions });
  bus.emit(EV.LOOT, { options: null });
});
check('итоги раунда (победа)', () => {
  bus.emit(EV.ROUND_END, { summary: { result: 'win', reason: 'Все враги мертвы', reward: 3200, round: 3, kills: 12, credits: 7400, lives: 2, maxLives: 3, xp: 60, level: 7 } });
  ui.closeOverlay();
});
check('итоги раунда (поражение с жизнями)', () => {
  bus.emit(EV.ROUND_END, { summary: { result: 'lose', reason: 'Бомба взорвалась', reward: 1600, round: 4, kills: 14, credits: 9000, lives: 1, maxLives: 3, xp: 20, level: 7 } });
  ui.closeOverlay();
});
check('финал операции', () => {
  bus.emit(EV.GAME_OVER, {
    reason: 'Бомба взорвалась', round: 5,
    stats: { kills: 20, headshots: 6, deaths: 4, roundsWon: 3, damage: 4200, credits: 1500, level: 8, items: [{ name: 'Аптечка', rarity: 'rare' }] },
  });
  ui.closeOverlay();
});

/* ---------- 4. Прогон кадров HUD во всех состояниях ---------- */
check('кадры HUD (buy/live/bomb/смерть/меню)', () => {
  for (const st of ['buy', 'live', 'roundEnd', 'runEnd', 'idle']) {
    game.state = st;
    for (let i = 0; i < 20; i++) {
      game.time += 1 / 60;
      game.buyTimer -= 1 / 60;
      game.roundTimer -= 1 / 60;
      ui.update(1 / 60);
    }
    if (st === 'live') {
      game.bomb = { planted: true, site: 'B', pos: new THREE.Vector3(0, 0, 0), timer: 12.5 };
      for (let i = 0; i < 10; i++) ui.update(1 / 60);
      game.bomb.timer = 4.2;
      for (let i = 0; i < 10; i++) ui.update(1 / 60);
      game.bomb = null;
      game.player.dead = true;
      ui.update(1 / 60);
      game.player.dead = false;
      game.player.weaponDef = null;
      ui.update(1 / 60);
      game.player.weaponDef = WEAPONS.sniper_awm;
      game.player.viewModel.adsAmount = 1;
      ui.update(1 / 60);
      ui.update(1 / 60);
    }
  }
});
check('миникарта отрисовывается', () => ui.drawMinimap());

/* ---------- 5. Проверка ключевых DOM-элементов ---------- */
const requiredSelectors = [
  '#hud', '#menu', '.hud-top', '.hud-bl', '.hud-br', '.hud-bc', '.minimap-wrap canvas',
  '.killfeed', '.crosshair', '.hitmarker', '.dmg-layer', '.scope', '.prompt', '.toasts',
];
for (const sel of requiredSelectors) {
  if (!window.document.querySelector(sel)) problems.push(`HUD: не найден элемент ${sel}`);
}
const cssVars = ['--accent', '--txt', '--panel'];
const sheet = window.document.querySelector('link[rel=stylesheet]');
log('CSS подключён через', sheet ? sheet.getAttribute('href') : 'инлайн/нет ссылки');

log('\n' + (problems.length ? 'ПРОБЛЕМЫ:\n - ' + problems.join('\n - ') : 'ОК: интерфейс и событийная логика работают'));
process.exit(problems.length ? 1 : 0);
