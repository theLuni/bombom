/**
 * Полный прогон запуска игры в эмуляции DOM: main.js -> мир -> игра -> интерфейс -> кадры.
 * Требует: npm i --no-save jsdom
 * Запуск: node tools/boot-check.mjs
 */
import { register } from 'node:module';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

register(new URL('./three-stub-hooks.mjs', import.meta.url));

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function fake2d() {
  const grad = { addColorStop() {} };
  return {
    fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, font: '', textAlign: '', textBaseline: '',
    fillRect() {}, clearRect() {}, strokeRect() {}, beginPath() {}, closePath() {}, arc() {}, moveTo() {},
    lineTo() {}, stroke() {}, fill() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
    fillText() {}, measureText: () => ({ width: 8 }),
    createRadialGradient: () => grad, createLinearGradient: () => grad,
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)) }), putImageData() {},
  };
}

const dom = new JSDOM(html, { url: 'http://localhost:5173/', pretendToBeVisual: true });
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = function (kind) {
  if (kind === '2d') return fake2d();
  return null;
};
window.HTMLCanvasElement.prototype.requestPointerLock = function () { window.document.pointerLockElement = this; };
window.document.exitPointerLock = function () { window.document.pointerLockElement = null; };
window.confirm = () => false;

globalThis.window = window;
globalThis.document = window.document;
globalThis.EventTarget = window.EventTarget;
globalThis.Event = window.Event;
globalThis.CustomEvent = window.CustomEvent;
globalThis.HTMLElement = window.HTMLElement;
globalThis.HTMLCanvasElement = window.HTMLCanvasElement;
globalThis.Image = window.Image;
globalThis.localStorage = window.localStorage;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
try { Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true }); } catch (e) {}

const problems = [];
const log = (...a) => console.log(...a);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

window.addEventListener('error', (e) => problems.push('window error: ' + e.message));
window.addEventListener('unhandledrejection', (e) => problems.push('unhandled rejection: ' + (e.reason && e.reason.message)));

/* ---------- 1. Запуск игры ---------- */
await import('../src/main.js');
await wait(400);

const boot = window.document.getElementById('boot-error');
if (boot && boot.classList.contains('on')) problems.push('Экран ошибки: ' + boot.textContent.slice(0, 300));
const B = window.BOMBOM;
if (!B) problems.push('main.js не выставил window.BOMBOM');
else {
  log(`Мир собран: коллайдеров ${B.physics.boxes.length}, точек закладки ${B.world.sites.length}, спавнов игрока ${B.world.playerSpawns.length}, врагов ${B.world.enemySpawns.length}`);
  const rendererCalls = B.engine.renderer.calls;
  if (rendererCalls.render < 5) problems.push(`Рендер не вызывается (кадров: ${rendererCalls.render})`);
  else log(`Кадров отрисовано за 0.4 с: ${rendererCalls.render} (основная сцена + оружие), clearDepth: ${rendererCalls.clearDepth}`);
  if (B.engine.viewScene.children.length < 3) problems.push('Сцена оружия пуста');
  if (!B.engine.scene.children.length) problems.push('Основная сцена пуста');
  if (B.engine.viewCamera.children.length === 0) problems.push('Модель оружия не прикреплена к камере оружия');
}

/* ---------- 2. Старт операции и проверка кадра ---------- */
const game = window.__game;
window.document.querySelector('#menu .btn.primary').click();
await wait(500);
log(`После старта: состояние=${game.state}, врагов=${game.bots.length}, HUD включён=${window.document.getElementById('hud').classList.contains('on')}`);
if (game.state === 'idle') problems.push('Операция не запустилась по кнопке');
if (!game.bots.length) problems.push('Боты не заспавнились');
if (!window.document.getElementById('hud').classList.contains('on')) problems.push('HUD не показан');

/* ---------- 3. Движение, прицел, стрельба, перезарядка ---------- */
game.state = 'live';
const startPos = game.player.pos.clone();

function key(type, code) {
  window.document.dispatchEvent(new window.KeyboardEvent(type, { code, bubbles: true }));
}
key('keydown', 'KeyW');
await wait(900);
key('keyup', 'KeyW');
const moved = game.player.pos.distanceTo(startPos);
log(`Игрок прошёл ${moved.toFixed(2)} м по W (скорость ~4.4 м/с)`);
if (moved < 1.5) problems.push('Игрок не двигается по нажатию W');

// стрельба
game.player.giveWeapon('rifle_ak');
game.player.switchTo('primary', true);
const ammoBefore = game.player.state.ammo;
window.document.dispatchEvent(new window.MouseEvent('mousedown', { button: 0, bubbles: true }));
await wait(120);
window.document.dispatchEvent(new window.MouseEvent('mouseup', { button: 0, bubbles: true }));
const shots = ammoBefore - game.player.state.ammo;
log(`Выстрелов за нажатие: ${shots} (патронов ${ammoBefore} -> ${game.player.state.ammo}), эффектов: искр=${game.effects.sparks.parts.filter((p) => p.alive).length}`);
if (shots <= 0) problems.push('Оружие не стреляет по ЛКМ');

// перезарядка
game.player.state.ammo = 2;
const reloaded = game.player.state.startReload(game.time, game.mods, 1);
game.player.viewModel.startReload(reloaded);
await wait(300);
log(`Перезарядка запущена на ${reloaded.toFixed(2)} с, патронов сейчас: ${game.player.state.ammo}, идёт: ${game.player.state.reloading}`);

// прыжок
key('keydown', 'Space');
await wait(80);
key('keyup', 'Space');
await wait(300);
log(`После прыжка игрок на высоте ${game.player.pos.y.toFixed(2)} м, onGround=${game.player.onGround}`);

/* ---------- 4. Боты: патрулирование и бой ---------- */
game.state = 'live';
const before = game.bots.map((b) => b.pos.clone());
await wait(2500);
let movedBots = 0;
game.bots.forEach((b, i) => { if (b.pos.distanceTo(before[i]) > 1) movedBots++; });
log(`Ботов сдвинулось за 2.5 с: ${movedBots} из ${game.bots.length}`);
if (game.bots.length && movedBots === 0) problems.push('Боты не двигаются');

// телепортируем игрока к боту и проверим урон
const target = game.bots.find((b) => !b.dead);
if (target) {
  game.player.spawnProtection = 0;
  game.player.pos.set(target.pos.x, 0, target.pos.z + 9);
  const hpBefore = game.player.health;
  for (let i = 0; i < 180; i++) {
    target.lastSeen = game.player.pos.clone().setY(1.3);
    target.alertTimer = 5;
    target.seeTimer = 2;
    target.aimError = 0.2;
    target.shootAt(game.player.pos.clone().setY(1.3));
  }
  log(`Бот нанёс игроку ${(hpBefore - game.player.health).toFixed(0)} урона за 180 выстрелов`);
  if (game.player.health >= hpBefore) problems.push('Боты не наносят урон');
}

/* ---------- 5. Бомба, разминирование, конец раунда ---------- */
game.player.health = 100;
game.bomb = null;
game.plantBomb(game.bots[0], game.world.siteCenter('A'));
const bombShot = !!game.bomb && game.bomb.planted;
log(`Бомба заложена: ${bombShot}, точка ${game.bomb && game.bomb.site}`);
if (!bombShot) problems.push('plantBomb не работает');
// телепорт к бомбе и разминирование
game.player.pos.set(game.bomb.pos.x, 0, game.bomb.pos.z + 1);
game.player.health = 100;
key('keydown', 'KeyE');
const t0 = Date.now();
while (!game.lastRoundSummary && Date.now() - t0 < 9000) await wait(100);
key('keyup', 'KeyE');
log(`Итог раунда: ${game.lastRoundSummary ? `${game.lastRoundSummary.result} — ${game.lastRoundSummary.reason}` : 'нет'}`);
if (!game.lastRoundSummary || game.lastRoundSummary.result !== 'win') problems.push('Разминирование не приводит к победе');

/* ---------- 6. Оверлеи поверх живой игры ---------- */
for (const id of ['skills', 'buy', 'arsenal']) {
  try {
    if (id === 'skills') B.ui.openSkillTree();
    if (id === 'buy') B.ui.openBuy();
    if (id === 'arsenal') B.ui.openArsenal();
    await wait(60);
    const dom = B.ui.overlayEl;
    if (!dom) problems.push(`Оверлей ${id} не открылся`);
    B.ui.closeOverlay();
    await wait(30);
  } catch (e) {
    problems.push(`Оверлей ${id}: ${e.message}`);
  }
}
log(`Свободных очков навыка в мете: ${B.game.meta.skillPoints}, уровень ${B.game.meta.level}, опыт ${Math.round(B.game.meta.xp)}`);

/* ---------- 7. Проверка отсутствия ошибок ---------- */
const jsErrors = window.__errors || [];
if (jsErrors.length) problems.push('Ошибки JS: ' + jsErrors.slice(0, 3).join(' | '));
log(`Ошибок JS за прогон: ${jsErrors.length}, ошибок в проблемах: ${problems.length}`);

log('\n' + (problems.length ? 'ПРОБЛЕМЫ:\n - ' + problems.join('\n - ') : 'ОК: игра запускается и играет без ошибок'));
process.exit(problems.length ? 1 : 0);
