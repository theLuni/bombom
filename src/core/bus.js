/**
 * Глобальная шина событий: развязывает игровую логику и интерфейс.
 */
class Bus extends EventTarget {
  emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }
  on(name, fn) {
    const handler = (e) => fn(e.detail);
    this.addEventListener(name, handler);
    return () => this.removeEventListener(name, handler);
  }
}

export const bus = new Bus();

export const EV = {
  HIT: 'hit',                 // попадание игрока по врагу
  DAMAGE_TAKEN: 'damage-taken',
  KILL: 'kill',
  HEADSHOT: 'headshot',
  ENEMY_SHOT: 'enemy-shot',
  RELOAD: 'reload',
  WEAPON_CHANGED: 'weapon-changed',
  AMMO: 'ammo',
  ROUND_START: 'round-start',
  ROUND_END: 'round-end',
  GAME_OVER: 'game-over',
  STATE: 'state',             // изменение игрового состояния (от HUD)
  XP: 'xp',
  LEVEL_UP: 'level-up',
  LOOT: 'loot',
  TOAST: 'toast',
  FLASH: 'flash',
  PROMPT: 'prompt',
  SCORE: 'score',
  BOT_SPAWN: 'bot-spawn',
  BOT_DEATH: 'bot-death',
  BOMB: 'bomb',
  SHAKE: 'shake',
  ABILITY: 'ability',
  OBJECTIVE: 'objective',
};
