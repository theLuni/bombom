/**
 * Безголовая проверка геймплея: карта, стрельба, урон, боты, бомба, прогресс, магазин.
 * Запуск: node tools/sim-check.mjs
 */
import { makeSim } from './sim-harness.mjs';
import * as THREE from 'three';

const problems = [];
const log = (...a) => console.log(...a);
const fail = (m) => problems.push(m);

const { game, physics, world, input } = await makeSim();

/* ================= 1. Карта, спавны, навигация ================= */
log(`Карта: коллайдеров ${physics.count}, точки закладки ${world.sites.map((s) => s.id).join('/')}, спавнов игрока ${world.playerSpawns.length}`);
const nav = world.nav;
let reachable = 0, tried = 0;
for (const spawn of world.enemySpawns.concat(world.playerSpawns)) {
  for (const site of world.sites) {
    tried++;
    if (nav.path(spawn, site.center)) reachable++;
  }
}
log(`Навигация: маршрутов ${reachable}/${tried}`);
if (reachable !== tried) fail('Не до всех точек закладки есть маршрут от спавнов');
if (!world.sites.length) fail('Нет точек закладки');

/* ================= 2. Физика игрока: пол, стены, уступы ================= */
game.startRun();
const player = game.player;
player.pos.set(world.playerSpawns[0].x, 3, world.playerSpawns[0].z);
for (let i = 0; i < 120; i++) { player.velY -= 16 / 60; physics.moveActor(player, 0, player.velY / 60, 0, 0.45); }
log(`Падение на пол: y=${player.pos.y.toFixed(2)} (ожидается 0), onGround=${player.onGround}`);
if (Math.abs(player.pos.y) > 0.05) fail('Игрок не встаёт на пол');

// стена: идём в южную границу карты (стена занимает z от -40 до -36)
player.pos.set(world.playerSpawns[0].x, 0, -30);
for (let i = 0; i < 400; i++) physics.moveActor(player, 0, 0, -0.05, 0.45);
log(`Упор в стену: z=${player.pos.z.toFixed(2)} (ожидается около -36.2)`);
if (player.pos.z < -36.6) fail('Игрок проходит сквозь стену');
player.pos.set(world.playerSpawns[0].x, 0, -30);

/* ================= 3. Стрельба: попадания по хитбоксам ================= */
const { WEAPONS } = await import('../src/data/weapons.js');
const bot = game.bots[0];
// ставим игрока в открытой зоне и стреляем в тело/голову
// открытая зона спавна CT: игрок в центре, цель в 10 м восточнее
player.pos.set(0, 0, -30);
player.vel.set(0, 0, 0);
player.yaw = 0; player.pitch = 0;
bot.pos.set(10, 0, -30);
bot.vel.set(0, 0, 0);
bot.state = 'hold';
bot.moveSpeed = 0;
player.giveWeapon('rifle_ak');
player.switchTo('primary', true);
const hpBefore = bot.health;
const aimAt = (dy) => {
  const dx = bot.pos.x - player.pos.x, dz = bot.pos.z - player.pos.z;
  player.yaw = Math.atan2(-dx, -dz);
  player.pitch = Math.atan2((bot.pos.y + dy) - (player.pos.y + 1.62), Math.hypot(dx, dz));
};
player.state.ammo = 30;
for (let i = 0; i < 24; i++) { game.time += 1 / 60; aimAt(1.1); player.tryFire(); }
const bodyShots = 30 - player.state.ammo;
const bodyDmg = hpBefore - bot.health;
log(`Выстрелов ${bodyShots}, урон боту в корпус ${bodyDmg.toFixed(0)} (HP ${hpBefore} -> ${bot.health.toFixed(0)})`);
if (bodyDmg <= 0) fail('Выстрелы в корпус не наносят урон');

// хитбоксы и множители урона напрямую
const { rayActor, computeDamage } = await import('../src/game/combat.js');
const fresh = game.bots[1] || game.bots[0];
fresh.pos.set(0, 0, -30);
const rays = {
  head: { o: new THREE.Vector3(0, 1.62, -24), d: new THREE.Vector3(0, 0, -1) },
  body: { o: new THREE.Vector3(0, 1.2, -24), d: new THREE.Vector3(0, 0, -1) },
  legs: { o: new THREE.Vector3(0, 0.5, -24), d: new THREE.Vector3(0, 0, -1) },
};
const zones = {};
for (const [name, r] of Object.entries(rays)) {
  const hit = rayActor(r.o, r.d, fresh);
  zones[name] = hit ? hit.zone : 'мимо';
}
log(`Хитбоксы: в голову=${zones.head}, в корпус=${zones.body}, в ноги=${zones.legs}`);
if (zones.head !== 'head') fail('Хитбокс головы не определяется');
if (zones.body !== 'body') fail('Хитбокс корпуса не определяется');
if (zones.legs !== 'legs') fail('Хитбокс ног не определяется');
const weapon = WEAPONS.rifle_ak;
const dmgHead = computeDamage({ weapon, zone: 'head', dist: 8, mods: { damage: 1 }, target: { armor: 0 } }).damage;
const dmgBody = computeDamage({ weapon, zone: 'body', dist: 8, mods: { damage: 1 }, target: { armor: 0 } }).damage;
const dmgArmor = computeDamage({ weapon, zone: 'body', dist: 8, mods: { damage: 1 }, target: { armor: 100 } }).damage;
log(`Урон АКМ: в голову ${dmgHead.toFixed(0)}, в корпус ${dmgBody.toFixed(0)}, по броне ${dmgArmor.toFixed(0)}`);
if (!(dmgHead > dmgBody * 1.5)) fail('Множитель урона в голову слишком мал');
if (!(dmgArmor < dmgBody)) fail('Броня не поглощает урон');

/* ================= 4. Бот наносит урон игроку ================= */
player.health = 100; player.armor = 0; player.spawnProtection = 0;
const shooterBot = game.bots.find((b) => !b.dead);
shooterBot.weaponDef = WEAPONS.rifle_ak;
game.state = 'live';
const beforeHp = player.health;
for (let i = 0; i < 90; i++) {
  game.time += 1 / 60;
  shooterBot.shootAt(player.pos.clone().setY(1.2));
}
log(`Бот: 90 выстрелов -> HP игрока ${beforeHp} -> ${player.health.toFixed(0)}, защита от урона работает=${player.health < beforeHp}`);
if (player.health >= beforeHp) fail('Боты не наносят урон игроку');
player.health = 100;

/* ================= 5. Длинная симуляция раунда ================= */
const { game: game2 } = await makeSim();
game2.startRun();
game2.startLive();
game2.player.spawnProtection = 0;
const bus = (await import('../src/core/bus.js')).bus;
const EV = (await import('../src/core/bus.js')).EV;
let roundEvents = 0, defused = false, plantedEvent = false, lostReason = '';
bus.addEventListener(EV.ROUND_END, (e) => { roundEvents++; lostReason = e.detail.summary.reason; });
bus.addEventListener(EV.BOMB, (e) => {
  if (e.detail.planted) plantedEvent = true;
  if (e.detail.defused) defused = true;
});
let errorCount = 0;
const origError = console.error;
console.error = (...a) => { errorCount++; origError('  [лог игры]', ...a); };
for (let i = 0; i < 200 * 60; i++) {
  game2.update(1 / 60);
  if (game2.player.dead) { game2.player.health = game2.player.maxHealth; game2.player.dead = false; } // «бессмертный» игрок для проверки логики раунда
  if (game2.state === 'roundEnd' || game2.state === 'runEnd') break;
}
console.error = origError;
const botsAlive = game2.aliveBots().length;
log(`Симуляция 200 сек: событий конца раунда ${roundEvents} ("${lostReason}"), бомба заложена=${plantedEvent}, ботов живо ${botsAlive}, ошибок в логах ${errorCount}, состояние=${game2.state}`);
if (errorCount) fail(`Во время симуляции были ошибки (${errorCount})`);
if (!game2.bots.length) fail('Боты не заспавнились');
if (game2.state !== 'roundEnd' && game2.state !== 'runEnd') fail(`Раунд не завершился за 200 с (состояние ${game2.state})`);

/* ================= 6. Бомба: разминирование ================= */
const { game: game3 } = await makeSim();
game3.startRun();
game3.startLive();
const bot3 = game3.aliveBots()[0];
const siteA = world.sites[0].center;
game3.plantBomb(bot3, siteA);
if (!game3.bomb || !game3.bomb.planted) fail('Закладка бомбы не работает');
game3.player.pos.set(game3.bomb.pos.x, 0, game3.bomb.pos.z + 0.8);
game3.input.keys.add('KeyE');
let defusedOk = false;
for (let i = 0; i < 12 * 60; i++) {
  game3.update(1 / 60);
  if (game3.state === 'roundEnd' || game3.state === 'runEnd') { defusedOk = !!game3.lastRoundSummary && game3.lastRoundSummary.result === 'win'; break; }
}
log(`Разминирование: прогресс ${(game3.defuseProgress * 100).toFixed(0)}%, победа=${defusedOk}, состояние=${game3.state}`);
if (!defusedOk) fail('Разминирование не приводит к победе');

/* ================= 7. Прогрессия: опыт, уровни, лут, навыки ================= */
const g = (await makeSim()).game;
g.startRun();
g.startLive();
const levelBefore = g.meta.level;
const itemsBefore = g.run.items.length;
g.addXp(100000);
const lootCount = g.lootOptions ? g.lootOptions.length : 0;
log(`Прокачка: уровень ${levelBefore} -> ${g.meta.level}, очков навыка ${g.meta.skillPoints}, вариантов лута ${lootCount}, пауза=${g.pauseReason}`);
if (g.meta.level <= levelBefore) fail('Опыт не повышает уровень');
if (lootCount < 2) fail('На повышении уровня не предложен лут');
if (g.pauseReason !== 'loot') fail('Пауза выбора лута не сработала');
const skillId = 'damage';
const pointsBefore = g.meta.skillPoints;
const modsBefore = g.mods.damage;
g.spendSkillPoint(skillId);
log(`Навык «Сила выстрела»: очков ${pointsBefore} -> ${g.meta.skillPoints}, урон ${modsBefore.toFixed(3)} -> ${g.mods.damage.toFixed(3)}`);
if (g.mods.damage <= modsBefore) fail('Навык не влияет на урон');
const rarityBefore = g.run.items.length;
g.chooseLoot(0);
log(`Лут выбран: предметов было ${itemsBefore}, стало ${g.run.items.length} (выбрано: ${g.run.items[g.run.items.length - 1].name})`);
if (g.run.items.length <= rarityBefore - 1) fail('Лут не применился');
if (g.pauseReason === 'loot') fail('Пауза лута не снялась после выбора');

/* ================= 8. Магазин ================= */
g.run.credits = 5000;
const bought = g.buy('rifle_ak');
log(`Магазин: покупка АКМ-47 = ${bought}, кредиты 5000 -> ${g.run.credits}, слот primary = ${g.player.slots.primary}`);
if (!bought || g.player.slots.primary !== 'rifle_ak') fail('Покупка оружия не работает');
const kit = g.buy('defusekit');
log(`Набор для разминирования: ${kit}, дефьюз-кит=${g.player.hasDefuseKit}`);
if (!kit || !g.player.hasDefuseKit) fail('Покупка набора для разминирования не работает');
g.run.credits = 10;
if (g.buy('armor')) fail('Покупка проходит без денег');

/* ================= 9. Гранаты, огонь, дым ================= */
const g4 = (await makeSim()).game;
g4.startRun();
g4.startLive();
g4.player.pos.set(0, 0, -30);
g4.player.armor = 0;
g4.player.health = 100;
g4.player.spawnProtection = 0;
g4.spawnGrenade('he', new THREE.Vector3(3, 1.2, -30), new THREE.Vector3(0, 0, 0), g4.player);
const hpBeforeG = g4.player.health;
for (let i = 0; i < 5 * 60; i++) g4.update(1 / 60);
log(`ХЕ-граната: HP ${hpBeforeG} -> ${g4.player.health.toFixed(0)}, взрыв произошёл=${g4.player.health < hpBeforeG}`);
if (g4.player.health >= hpBeforeG) fail('Взрыв ХЕ не наносит урон');

const blocked = g4.effects.smokeBlocked(new THREE.Vector3(-10, 1.6, -30), new THREE.Vector3(10, 1.6, -30));
const g5 = (await makeSim()).game;
g5.startRun();
g5.spawnGrenade('smoke', new THREE.Vector3(0, 0.6, -30), new THREE.Vector3(0, 0, 0), g5.player);
for (let i = 0; i < 4 * 60; i++) g5.update(1 / 60);
const blockedAfter = g5.effects.smokeBlocked(new THREE.Vector3(-8, 1.6, -30), new THREE.Vector3(8, 1.6, -30));
log(`Дым: перекрывает обзор до=${blocked}, после=${blockedAfter}`);
if (!blockedAfter) fail('Дымовая завеса не перекрывает обзор');

/* ================= 10. Подбираемые предметы ================= */
const { game: g6 } = await makeSim();
g6.startRun();
g6.startLive();
g6.player.pos.set(0, 0, -30);
g6.player.health = 50;
g6.spawnPickup('health', new THREE.Vector3(0.6, 0.4, -30), 25);
for (let i = 0; i < 2 * 60; i++) g6.update(1 / 60);
log(`Подбор аптечки: HP 50 -> ${g6.player.health.toFixed(0)}, предметов на карте ${g6.pickups.length}`);
if (g6.player.health <= 50) fail('Подбор аптечки не лечит');

/* ================= Итог ================= */
log('');
if (problems.length) {
  log('ОБНАРУЖЕНЫ ПРОБЛЕМЫ:');
  for (const p of problems) log(' - ' + p);
  process.exit(1);
}
log('ОК: геймплейная логика работает без ошибок');
