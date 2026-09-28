/**
 * Полный автопрогон операции: раунды, потери жизней, босс, бомба, лут, навыки, магазин.
 * Запуск: node tools/autoplay-check.mjs [максимум раундов]
 */
import { makeSim, AutoPlayer } from './sim-harness.mjs';
import * as THREE from 'three';

const maxRounds = Number(process.argv[2] || 12);
const { game, input, world, physics } = await makeSim();
const { bus, EV } = await import('../src/core/bus.js');
const { WEAPONS } = await import('../src/data/weapons.js');

const problems = [];
const log = (...a) => console.log(...a);

const stats = {
  rounds: 0, wins: 0, loses: 0, plants: 0, defuses: 0, explosions: 0, levelUps: 0,
  shops: 0, skills: 0, loot: 0, bossKills: 0, kills: 0, headshots: 0, maxRoundTime: 0, livesLost: 0,
};
let lastSummary = null;
let summaryPending = false;

bus.addEventListener(EV.ROUND_END, (e) => { lastSummary = e.detail.summary; summaryPending = true; });
bus.addEventListener(EV.BOMB, (e) => {
  if (e.detail.exploded) stats.explosions++;
  if (e.detail.defused) stats.defuses++;
});
bus.addEventListener(EV.LEVEL_UP, () => stats.levelUps++);
bus.addEventListener(EV.BOT_DEATH, (e) => { if (e.detail.bot && e.detail.bot.boss) stats.bossKills++; else stats.kills++; });

game.startRun();
const auto = new AutoPlayer(game, input, physics, world);
const dt = 1 / 30;
let guard = 0;
let roundStart = 0;
let prevRound = 0;
let plantCounted = false;
const maxSteps = 200000;

while (guard++ < maxSteps) {
  if (game.roundNumber !== prevRound) {
    if (prevRound !== 0) stats.maxRoundTime = Math.max(stats.maxRoundTime, game.time - roundStart);
    roundStart = game.time;
    prevRound = game.roundNumber;
    plantCounted = false;
    // покупки в начале раунда
    if (game.state === 'buy') {
      if (!game.player.hasDefuseKit && game.run.credits > 900) { game.buy('defusekit'); stats.shops++; }
      if (game.run.credits > 1800 && !game.player.armor) { game.buy('armor'); stats.shops++; }
      const prim = game.player.slots.primary;
      if (game.run.credits > 3200 && prim !== 'rifle_ak' && prim !== 'rifle_scar') { game.buy('rifle_ak'); stats.shops++; }
    }
  }
  if (game.roundNumber > maxRounds) break;
  if (game.state === 'idle' || game.state === 'runEnd') break;

  // тратим очки навыков
  if (!game.pauseReason && game.meta.skillPoints > 0 && Math.random() < 0.01) {
    const ids = ['damage', 'fireRate', 'spread', 'vitality', 'regen', 'reloadSpeed', 'moveSpeed', 'armor', 'headshot', 'pierce', 'grenadeDamage'];
    if (game.spendSkillPoint(ids[Math.floor(Math.random() * ids.length)])) stats.skills++;
  }

  if (summaryPending && game.state === 'roundEnd') {
    summaryPending = false;
    stats.rounds++;
    if (lastSummary.result === 'win') stats.wins++;
    else { stats.loses++; stats.livesLost++; }
    if (game.bomb && game.bomb.planted && !plantCounted) { /* закладка уже учтена */ }
    if (game.state !== 'runEnd' && game.run.lives > 0) { game.nextRound(); game.startLive(); }
    lastSummary = null;
    continue;
  }

  auto.step(dt);
  game.update(dt);
  if (game.bomb && game.bomb.planted && !plantCounted) { plantCounted = true; stats.plants++; }
  if (game.state === 'live' && game.run.lives <= 0) break;
}

stats.maxRoundTime = Math.max(stats.maxRoundTime, game.time - roundStart);
const summary = game.lastRoundSummary;
log(`Раундов: ${stats.rounds} (побед ${stats.wins}, поражений ${stats.loses}), финал: ${game.state}`);
log(`Бомба: закладок ${stats.plants}, разминирований ${stats.defuses}, взрывов ${stats.explosions}`);
log(`Убийств: ${stats.kills}, тяжёлых ботов убито: ${stats.bossKills}`);
log(`Прокачка: уровень ${game.meta.level}, опыт ${Math.round(game.meta.xp)}, очков навыков вложено ${stats.skills}, осталось ${game.meta.skillPoints}`);
log(`Лут: предметов в сборке ${game.run.items.length}, повышений уровня ${stats.levelUps}, покупок в магазине ${stats.shops}`);
log(`Жизни: ${game.run.lives}/${game.run.maxLives}, кредиты ${Math.round(game.run.credits)}, максимальный раунд ${stats.maxRoundTime.toFixed(0)} с`);
log(`Автопилот: выстрелов ${auto.stats.shots}, гранат ${auto.stats.grenades}, шагов симуляции ${guard}`);
log(`Модификаторы: урон x${game.mods.damage.toFixed(3)}, скорострельность x${game.mods.fireRate.toFixed(3)}, разброс x${game.mods.spread.toFixed(3)}, макс. HP ${game.mods.maxHealth}`);
if (summary) log(`Последний раунд: ${summary.result} — ${summary.reason}`);

if (stats.rounds < 2) problems.push(`Пройдено слишком мало раундов: ${stats.rounds}`);
if (game.meta.level < 2) problems.push(`Игрок не получил ни одного уровня: ${game.meta.level}`);
if (stats.levelUps + stats.kills + stats.bossKills + stats.plants + stats.wins === 0) {
  problems.push('За весь прогон не случилось ни одного игрового события (убийства, закладки, победы)');
}
if (guard >= maxSteps) problems.push('Прогон не завершился за отведённое число шагов');
if (game.state === 'live') problems.push('Прогон закончился в активном раунде');
if (game.player.health <= 0 && game.state === 'live') problems.push('Игрок мёртв, но раунд идёт');

log('');
if (problems.length) {
  log('ОБНАРУЖЕНЫ ПРОБЛЕМЫ:');
  for (const p of problems) log(' - ' + p);
  process.exit(1);
}
log('ОК: полный прогон операции прошёл без сбоев');
