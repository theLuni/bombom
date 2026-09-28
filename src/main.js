/**
 * BOMBOM — точка входа: сборка мира, игровой цикл, связка систем.
 */
import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { Physics } from './core/physics.js';
import { Input } from './core/input.js';
import { audio } from './core/audio.js';
import { Effects } from './world/effects.js';
import { buildMap } from './world/map.js';
import { Game } from './game/game.js';
import { UI } from './ui/ui.js';
import { bus, EV } from './core/bus.js';

const bootErr = document.getElementById('boot-error');
function fatal(e) {
  console.error(e);
  bootErr.hidden = false;
  bootErr.classList.add('on');
  bootErr.textContent = 'Ошибка запуска BOMBOM:\n\n' + (e && e.stack ? e.stack : String(e)) +
    '\n\nПроверьте, что браузер поддерживает WebGL2.';
}
window.addEventListener('error', (e) => fatal(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => fatal(e.reason));

try {
  const canvas = document.getElementById('game');
  const engine = new Engine(canvas);
  const input = new Input(canvas);
  const physics = new Physics();
  const effects = new Effects(engine.scene);
  const world = buildMap(engine.scene, physics);

  const game = new Game({
    engine, input, effects, physics, world,
    camera: engine.camera, scene: engine.scene, canvas,
  });
  const ui = new UI(game, input, canvas);

  // меню: обзорная камера над картой
  engine.camera.position.set(6, 26, -46);
  engine.camera.rotation.set(-0.42, 0.12, 0);
  engine.camera.fov = 70;
  engine.camera.updateProjectionMatrix();

  // звук включается по первому действию пользователя
  const unlockAudio = () => {
    audio.init();
    audio.setVolume(game.settings.volume);
    audio.resume();
    window.removeEventListener('pointerdown', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
  };
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);

  canvas.addEventListener('click', () => {
    if (game.state !== 'idle' && !ui.activeOverlay) input.requestLock();
  });
  input.onLockChange = (locked) => {
    if (!locked && game.state !== 'idle' && !ui.activeOverlay && !game.player.dead) {
      ui.togglePause();
    }
  };

  // клавиша броска гранаты (когда выбрана граната) — ЛКМ
  bus.on(EV.WEAPON_CHANGED, () => { /* HUD обновится сам */ });

  let last = performance.now();
  let acc = 0;
  const MAX_DT = 1 / 30;

  let loopErrors = 0;
  function frame(now) {
    try {
      const dtRaw = Math.min(0.25, (now - last) / 1000);
      last = now;
      acc += dtRaw;
      let steps = 0;
      while (acc > MAX_DT && steps < 3) {
        step(MAX_DT);
        acc -= MAX_DT;
        steps++;
      }
      engine.renderMain();
      engine.renderOverlay(engine.viewScene, engine.viewCamera);
    } catch (e) {
      loopErrors++;
      console.error('Кадр упал:', e);
      if (loopErrors === 1) fatal(e);
      if (loopErrors > 60) return; // прекращаем цикл, если игра стабильно падает
    }
    requestAnimationFrame(frame);
  }

  function step(dt) {
    if (game.state !== 'idle') {
      game.update(dt);
    } else {
      // медленное вращение камеры в меню
      engine.camera.rotation.y += dt * 0.04;
    }
    engine.update(dt);
    ui.update(dt);
    input.endFrame();
  }

  // отладочный доступ (используется автотестами и консолью браузера)
  window.BOMBOM = { game, engine, ui, input, world, physics, effects };
  window.__game = game;
  window.__errors = [];
  window.addEventListener('error', (e) => { window.__errors.push(String(e.message)); });

  // финальная проверка сборки
  ui.refreshPersistent();
  requestAnimationFrame(frame);
  console.info('%cBOMBOM готов: карта de_БОМБОМ загружена', 'color:#ffb02e');
} catch (e) {
  fatal(e);
}
