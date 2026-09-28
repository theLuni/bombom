/**
 * Ядро игры: раунды, цели, бомба, враги, урон, кредиты, опыт, лут.
 */
import * as THREE from 'three';
import { bus, EV } from '../core/bus.js';
import { audio } from '../core/audio.js';
import { WEAPONS } from '../data/weapons.js';
import { buildModifiers, xpForLevel, SKILLS_BY_ID, maxHealthForSkill } from '../data/skills.js';
import {
  ROUND_REWARD, ROUND_LOSS_REWARD, KILL_REWARD, HEADSHOT_BONUS, PLANT_REWARD, DEFUSE_REWARD,
  XP_KILL, XP_HEADSHOT, XP_ROUND_WIN, XP_ROUND_LOSS, XP_PLANT, XP_DEFUSE, GEAR_BY_ID,
} from '../data/shop.js';
import { rollLoot, ITEMS } from '../data/items.js';
import { Player } from './player.js';
import { Bot } from './bot.js';
import { Grenade } from './grenades.js';
import { Pickup } from './pickups.js';
import { computeDamage, applyExplosion } from './combat.js';
import { loadMeta, saveMeta } from '../meta.js';

const BUY_TIME = 11;
const ROUND_TIME = 135;
const BOMB_TIME = 40;
const DEFUSE_TIME = 6;
const MAX_ROUNDS = 20;

export class Game {
  constructor({ engine, input, effects, physics, world, camera, scene, canvas }) {
    this.engine = engine;
    this.input = input;
    this.effects = effects;
    this.physics = physics;
    this.world = world;
    this.camera = camera;
    this.scene = scene;
    this.canvas = canvas;
    this.time = 0;
    this.state = 'idle';
    this.pauseReason = null;
    this.roundNumber = 0;
    this.buyTimer = 0;
    this.roundTimer = 0;
    this.roundEndTimer = 0;
    this.bots = [];
    this.grenades = [];
    this.pickups = [];
    this.bomb = null;
    this.plantingBot = null;
    this.defuseProgress = 0;
    this.fireTick = 0;
    this._pendingLoot = [];
    this.lootOptions = null;
    this.lastRoundSummary = null;
    this.meta = loadMeta();
    this.settings = this.meta.settings;
    this.run = this.newRun();
    this.player = new Player(this, camera, input, effects);
    this.recomputeMods();
    this.debug = false;

    bus.on(EV.BOT_DEATH, (info) => this.onBotDeath(info));
  }

  /* ================= прогрессия ================= */

  newRun() {
    return {
      credits: 1900,
      lives: 3,
      maxLives: 3,
      kills: 0,
      deaths: 0,
      roundsWon: 0,
      rounds: 0,
      headshots: 0,
      damageDealt: 0,
      items: [],
      buffs: {},
      bonusHp: 0,
      reloadMul: 1,
      critBonus: 0,
      lifesteal: 0,
      dashCd: 0,
      xpBonus: 0,
      armorBonus: 0,
      defuseKit: false,
      regenUntil: 0,
      regenRate: 0,
      berserkStacks: 0,
      berserkUntil: 0,
      startedAt: Date.now(),
    };
  }

  recomputeMods() {
    const base = buildModifiers(this.meta.skills);
    const r = this.run;
    const berserk = (r.berserkUntil > this.time ? r.berserkStacks * base.berserk : 0);
    this.mods = {
      ...base,
      maxHealth: base.maxHealth + r.bonusHp,
      reloadSpeed: base.reloadSpeed * r.reloadMul,
      headshot: base.headshot + r.critBonus,
      lifesteal: r.lifesteal,
      dashCooldown: Math.max(1.2, base.dashCooldown - r.dashCd),
      damage: base.damage * (1 + this.buffValue('berserk') + berserk),
      spread: base.spread * (1 + this.buffValue('preciseSpread')),
    };
  }

  buffValue(id) {
    let v = 0;
    const now = this.time;
    for (const key of Object.keys(this.run.buffs)) {
      const b = this.run.buffs[key];
      if (b.buff === id && b.until > now) v += b.value;
    }
    return v;
  }

  addBuff(buff, value, duration) {
    this.run.buffs[`${buff}_${Math.random().toString(36).slice(2, 7)}`] = { buff, value, until: this.time + duration };
    this.recomputeMods();
  }

  itemSpreadMul() {
    return 1 - Math.min(0.5, this.buffValue('precise'));
  }

  addXp(amount) {
    const gain = Math.max(1, Math.round(amount * (1 + this.run.xpBonus)));
    this.meta.xp += gain;
    bus.emit(EV.XP, { gain, xp: this.meta.xp, level: this.meta.level });
    let leveled = 0;
    while (this.meta.xp >= xpForLevel(this.meta.level)) {
      this.meta.xp -= xpForLevel(this.meta.level);
      this.meta.level++;
      this.meta.skillPoints++;
      leveled++;
      this._pendingLoot.push(this.meta.level);
    }
    if (leveled) {
      this.meta.stats.levelUps++;
      audio.levelUp();
      this.recomputeMods();
      bus.emit(EV.LEVEL_UP, { level: this.meta.level, points: this.meta.skillPoints });
      this.saveMeta();
      if (this.roundActive) this.queueLoot();
    }
  }

  saveMeta() {
    this.meta.settings = this.settings;
    saveMeta(this.meta);
  }

  /* ================= лут ================= */

  queueLoot() {
    if (this.lootOptions) return;
    const options = rollLoot(Math.random, 3);
    this.lootOptions = options;
    this.pauseReason = 'loot';
    bus.emit(EV.LOOT, { options });
  }

  chooseLoot(index) {
    if (!this.lootOptions) return;
    const opt = this.lootOptions[index];
    if (!opt) return;
    this.applyItem(opt.item, opt.rarity, opt.value);
    this.run.items.push({ id: opt.item.id, name: opt.item.name, rarity: opt.rarity.id, desc: opt.item.desc(opt.value) });
    this.lootOptions = null;
    this.pauseReason = null;
    bus.emit(EV.LOOT, { options: null });
  }

  applyItem(item, rarity, value) {
    const p = this.player;
    switch (item.kind) {
      case 'heal':
        p.heal(value);
        break;
      case 'timed':
        this.addBuff(item.buff, value, item.dur);
        bus.emit(EV.TOAST, { text: `${item.icon} ${item.name}: бафф активен ${item.dur} сек`, kind: rarity.id });
        break;
      case 'instant':
        if (item.id === 'credits') { this.run.credits += value; bus.emit(EV.SCORE, { run: this.run }); }
        else if (item.id === 'kevlar') { p.armor = Math.min(100, p.armor + value); }
        else if (item.id === 'ammo') { p.refillAmmo(); p.grenades.he = (p.grenades.he || 0) + 2; }
        else if (item.id === 'nades') { p.grenades.he += 2; p.grenades.smoke += 1; }
        bus.emit(EV.TOAST, { text: `${item.icon} ${item.name}`, kind: rarity.id });
        break;
      case 'permanent':
        if (item.id === 'hp') this.run.bonusHp += value;
        else if (item.id === 'reload') this.run.reloadMul *= (1 - value);
        else if (item.id === 'dash') { this.run.dashCd += value * 4; p.heal(0); }
        else if (item.id === 'crit') this.run.critBonus += value;
        else if (item.id === 'lifesteal') this.run.lifesteal += value;
        else if (item.id === 'xp') this.run.xpBonus += value;
        bus.emit(EV.TOAST, { text: `${item.icon} ${item.name} — на всю операцию`, kind: rarity.id });
        break;
    }
    this.recomputeMods();
    if (item.kind === 'heal') this.player.heal(0);
    if (this.mods.maxHealth > this.player.health && item.id === 'hp') this.player.health = Math.min(this.mods.maxHealth, this.player.health + value);
    audio.levelUp();
    bus.emit(EV.STATE, { player: this.player, run: this.run });
  }

  spendSkillPoint(skillId) {
    const skill = SKILLS_BY_ID[skillId];
    if (!skill) return false;
    const cur = this.meta.skills[skillId] || 0;
    if (this.meta.skillPoints <= 0 || cur >= skill.max) { audio.error(); return false; }
    if (skill.req && (this.meta.skills[skill.req] || 0) < 1) { audio.error(); bus.emit(EV.TOAST, { text: 'Сначала откройте предыдущий навык', kind: 'plain' }); return false; }
    this.meta.skills[skillId] = cur + 1;
    this.meta.skillPoints--;
    this.recomputeMods();
    this.saveMeta();
    audio.click();
    bus.emit(EV.STATE, { player: this.player, run: this.run, meta: this.meta });
    return true;
  }

  /* ================= раунды ================= */

  startRun() {
    this.run = this.newRun();
    this.roundNumber = 0;
    this.meta.stats.runs++;
    this.recomputeMods();
    this.player.slots = { primary: null, secondary: 'pistol_std', melee: 'knife' };
    this.player.states.clear();
    this.player.giveWeapon('pistol_std', 'secondary');
    this.player.grenades = { he: 1, smoke: 1, flash: 0, fire: 0, decoy: 0 };
    this.player.health = this.mods.maxHealth;
    this.player.armor = 40 + (this.mods.startArmor || 0);
    this.saveMeta();
    bus.emit(EV.SCORE, { run: this.run });
    this.nextRound();
  }

  nextRound() {
    this.roundNumber++;
    this.clearRound();
    this.player.resetForRound(this.world.playerSpawns[0]);
    this.player.refillAmmo();
    this.player.grenades.he = Math.max(this.player.grenades.he, 1);
    this.player.grenades.smoke = Math.max(this.player.grenades.smoke, 1);
    this.spawnBots();
    this.state = 'buy';
    this.buyTimer = BUY_TIME;
    this.roundTimer = ROUND_TIME;
    this.roundActive = true;
    this.run.rounds++;
    this.defuseProgress = 0;
    this.recomputeMods();
    bus.emit(EV.ROUND_START, {
      round: this.roundNumber,
      maxRounds: MAX_ROUNDS,
      credits: this.run.credits,
      enemies: this.bots.length,
    });
    bus.emit(EV.STATE, { player: this.player, run: this.run, meta: this.meta });
  }

  clearRound() {
    for (const b of this.bots) b.dispose();
    this.bots = [];
    for (const g of this.grenades) g.dispose();
    this.grenades = [];
    for (const p of this.pickups) p.dispose();
    this.pickups = [];
    this.bomb = null;
    this.plantingBot = null;
    this.effects.reset();
    this.player.dead = false;
  }

  spawnBots() {
    const r = this.roundNumber;
    const count = Math.min(7, 2 + Math.floor(r * 0.8));
    const boss = r % 5 === 0 && r > 0;
    const accuracy = Math.min(0.88, 0.42 + r * 0.022);
    const reaction = Math.max(0.22, 0.5 - r * 0.012);
    const health = 100 + (r - 1) * 7;
    const weapons = ['pistol_std', 'pistol_deagle', 'smg_mp5', 'shotgun_pump', 'rifle_ak', 'rifle_m4', 'smg_p90', 'rifle_scar', 'sniper_awm'];
    // оружие врагов улучшается с раундами
    const maxW = Math.min(weapons.length - 1, Math.floor(r / 2));
    const spawns = this.world.enemySpawns;
    const primarySite = Math.random() < 0.7 ? 'A' : 'B';
    for (let i = 0; i < count; i++) {
      const base = spawns[i % spawns.length];
      const pos = new THREE.Vector3(base.x + (Math.random() - 0.5) * 3, 0, base.z + (Math.random() - 0.5) * 3);
      const wIdx = Math.floor(Math.random() * (maxW + 1));
      const bot = new Bot(this, pos, {
        site: Math.random() < 0.85 ? primarySite : (primarySite === 'A' ? 'B' : 'A'),
        health,
        armor: 20 + r * 3,
        accuracy,
        reaction,
        aggression: 0.45 + Math.random() * 0.5,
        weapon: weapons[wIdx],
      });
      bot.takeDamage = bot.takeDamage.bind(bot);
      this.bots.push(bot);
      bus.emit(EV.BOT_SPAWN, { bot });
    }
    if (boss) {
      const base = spawns[0];
      const pos = new THREE.Vector3(base.x, 0, base.z + 2);
      const b = new Bot(this, pos, {
        site: 'A', boss: true, health: 380 + r * 26, armor: 120, accuracy: Math.min(0.8, accuracy + 0.1),
        reaction: reaction * 1.2, aggression: 0.9, weapon: 'heavy_minigun',
      });
      this.bots.push(b);
      bus.emit(EV.BOT_SPAWN, { bot: b });
      bus.emit(EV.TOAST, { text: '⚔️ На карте тяжёлый боевик!', kind: 'legend' });
      audio.bossRoar();
    }
  }

  startLive() {
    this.state = 'live';
    audio.beep(false);
    bus.emit(EV.OBJECTIVE, { text: 'Уничтожьте всех террористов или разминируйте бомбу' });
    bus.emit(EV.STATE, { player: this.player, run: this.run, meta: this.meta });
  }

  isFrozen() {
    return this.state === 'buy' || !!this.pauseReason;
  }

  canShoot() {
    return this.state === 'live' && !this.pauseReason && !this.player.dead;
  }

  roundLive() { return this.state === 'live'; }

  aliveBots() { return this.bots.filter((b) => !b.dead); }

  /* ================= бомба ================= */

  onBotPlanting(bot, progress, cancel = false) {
    if (cancel) {
      if (this.plantingBot === bot) this.plantingBot = null;
      return;
    }
    if (this.plantingBot !== bot) {
      this.plantingBot = bot;
      bus.emit(EV.TOAST, { text: '⚠️ Террористы ставят бомбу!', kind: 'epic' });
      audio.beep(true);
    }
    bus.emit(EV.BOMB, { planting: true, progress: Math.min(1, progress / 3.4), site: bot.siteTarget });
  }

  plantBomb(bot, sitePos) {
    if (this.bomb && this.bomb.planted) return;
    this.bomb = {
      planted: true,
      site: bot.siteTarget,
      pos: sitePos.clone(),
      timer: BOMB_TIME,
      beepAt: BOMB_TIME,
    };
    this.plantingBot = null;
    audio.plantDone();
    this.run.credits += PLANT_REWARD;
    bus.emit(EV.BOMB, { planted: true, site: this.bomb.site, timer: BOMB_TIME });
    bus.emit(EV.OBJECTIVE, { text: `Бомба заложена на точке ${this.bomb.site}! Разминируйте её (клавиша E)` });
    bus.emit(EV.TOAST, { text: `💣 Бомба заложена на точке ${this.bomb.site}!`, kind: 'legend' });
    // обороняющиеся занимают позиции
    for (const b of this.aliveBots()) {
      b.state = 'defend';
      b.defendPoint = null;
      b.path = [];
      b.pathTimer = 0;
    }
  }

  defuseTick(dt) {
    const p = this.player;
    if (!this.bomb || !this.bomb.planted || p.dead || this.state !== 'live') return;
    const dist = Math.hypot(p.pos.x - this.bomb.pos.x, p.pos.z - this.bomb.pos.z);
    const near = dist < 2.2;
    const holding = near && this.input.isDown('KeyE');
    if (holding) {
      const speed = (p.hasDefuseKit ? 2 : 1) * (this.mods.defuseSpeed || 1);
      this.defuseProgress += (dt * speed) / DEFUSE_TIME;
      if (Math.random() < dt * 6) audio.plantLoop();
      if (this.defuseProgress >= 1) {
        this.defuseProgress = 1;
        audio.defuseDone();
        this.run.credits += DEFUSE_REWARD;
        this.addXp(XP_DEFUSE);
        bus.emit(EV.BOMB, { defused: true });
        this.endRound('win', 'Бомба разминирована!');
      }
    } else {
      this.defuseProgress = Math.max(0, this.defuseProgress - dt * 0.35);
    }
    bus.emit(EV.PROMPT, near ? { text: 'Удерживайте E — разминирование', progress: this.defuseProgress, key: 'E' } : null);
  }

  flashAt(pos) {
    const p = this.player;
    const eye = p.eyePosition(new THREE.Vector3());
    const dist = eye.distanceTo(pos);
    if (dist > 26) return;
    const to = new THREE.Vector3().subVectors(pos, eye).normalize();
    const look = p.aimDirection(new THREE.Vector3());
    const dot = look.dot(to);
    if (dot < -0.2) return;
    if (!this.physics.lineOfSight(eye, pos)) return;
    const power = Math.min(1, (1 - dist / 26) * (0.4 + 0.6 * Math.max(0, dot)));
    const blindTime = 1.4 + power * 4.2;
    bus.emit(EV.FLASH, { duration: blindTime, power });
    audio.beep(true);
    for (const bot of this.aliveBots()) {
      const bd = bot.pos.distanceTo(pos);
      if (bd < 24 && this.physics.lineOfSight(bot.eyePos(new THREE.Vector3()), pos)) {
        bot.blind = Math.max(bot.blind || 0, 1.2 + Math.min(3, bd / 9));
        bot.alertTimer = 0;
        bot.seeTimer = 0;
      }
    }
  }

  /* ================= урон ================= */

  actors() {
    return [this.player, ...this.bots.filter((b) => !b.dead)];
  }

  combatContext(shooter, team) {
    const shooterTeam = team || (shooter ? shooter.team : 'CT');
    return {
      physics: this.physics,
      effects: this.effects,
      actors: this.actors(),
      shooterTeam,
      friendlyFire: false,
      onActorHit: (actor, zone, point, dist, weapon, opts = {}) =>
        this.onActorHit(actor, zone, point, dist, weapon, opts, shooter, shooterTeam),
      applySplash: (center, radius, damage, weapon) => {
        const ctx = this.combatContext(shooter, shooterTeam);
        return applyExplosion(ctx, center, radius, damage, weapon);
      },
    };
  }

  onActorHit(target, zone, point, dist, weapon, opts, shooter, shooterTeam) {
    if (!target || target.dead) return;
    if (target.team === shooterTeam) return;
    let damage, armorDamage;
    if (opts.damageOverride) {
      damage = opts.damageOverride * (shooter === this.player || !shooter ? 1 : 0.8);
      armorDamage = damage * 0.25;
    } else {
      const mods = shooter === this.player ? this.mods : { damage: 0.8, armorPen: 0.05 };
      const res = computeDamage({ weapon, zone, dist, mods, target });
      damage = res.damage;
      armorDamage = res.armorDamage;
    }

    const dir = new THREE.Vector3(point.x - (shooter ? shooter.pos.x : point.x), 0.6, point.z - (shooter ? shooter.pos.z : point.z)).normalize();
    this.effects.blood(point, dir, zone === 'head' ? 8 : 5);

    if (target === this.player) {
      target.takeDamage(damage, zone, shooter);
      return;
    }

    const before = target.health;
    target.armor = Math.max(0, (target.armor || 0) - armorDamage);
    target.takeDamage(damage, zone, point, weapon, shooter);

    if (shooter === this.player) {
      this.run.damageDealt += Math.min(damage, before);
      if (this.mods.lifesteal > 0) this.player.heal(this.mods.lifesteal * damage, true);
      const killed = target.dead;
      const screen = this.projectToScreen(point);
      bus.emit(EV.HIT, {
        damage: Math.round(damage), zone, killed, x: screen.x, y: screen.y,
        botName: target.name,
      });
      if (!killed) audio.hitmarker(zone === 'head');
      if (this.mods.berserk > 0) {
        this.run.berserkStacks = Math.min(5, (this.run.berserkUntil > this.time ? this.run.berserkStacks : 0) + 1);
        this.run.berserkUntil = this.time + 5;
        this.recomputeMods();
      }
    }
  }

  projectToScreen(point) {
    const v = point.clone().project(this.camera);
    return {
      x: (v.x * 0.5 + 0.5) * window.innerWidth,
      y: (-v.y * 0.5 + 0.5) * window.innerHeight,
      visible: v.z < 1,
    };
  }

  onBotDeath({ bot, zone }) {
    const headshot = zone === 'head';
    this.run.kills++;
    if (headshot) this.run.headshots++;
    this.meta.stats.kills++;
    if (headshot) this.meta.stats.headshots++;
    this.run.credits += KILL_REWARD + (headshot ? HEADSHOT_BONUS : 0);
    this.addXp(XP_KILL + (headshot ? XP_HEADSHOT : 0));
    audio.hitmarker(true);
    bus.emit(EV.KILL, { bot, headshot, round: this.roundNumber });
    bus.emit(EV.SCORE, { run: this.run });
    // дроп
    const roll = Math.random();
    if (bot.boss) {
      this.spawnPickup('credits', bot.pos, 900);
      this.spawnPickup('health', bot.pos, 60);
      this.spawnPickup('grenade', bot.pos, 2);
    } else if (roll < 0.22) this.spawnPickup('health', bot.pos, 35);
    else if (roll < 0.45) this.spawnPickup('ammo', bot.pos, 1);
    else if (roll < 0.62) this.spawnPickup('credits', bot.pos, 250);
    else if (roll < 0.72) this.spawnPickup('grenade', bot.pos, 1);
    if (this.aliveBots().length === 0 && this.state === 'live') {
      if (this.bomb && this.bomb.planted) {
        bus.emit(EV.OBJECTIVE, { text: 'Все враги мертвы — разминируйте бомбу!' });
        bus.emit(EV.TOAST, { text: 'Все враги мертвы — бомба ещё тикает!', kind: 'epic' });
      } else {
        this.endRound('win', 'Все террористы уничтожены');
      }
    }
  }

  onPlayerDeath() {
    this.run.deaths++;
    this.meta.stats.deaths++;
    bus.emit(EV.TOAST, { text: 'Вы погибли', kind: 'plain' });
    if (this.state === 'live') {
      if (this.bomb && this.bomb.planted) {
        bus.emit(EV.OBJECTIVE, { text: 'Бомба заложена, вы мертвы — раунд проигран' });
      }
      this.endRound('lose', this.bomb && this.bomb.planted ? 'Вы погибли, бомба взорвётся' : 'Вы погибли');
    }
  }

  endRound(result, reason) {
    if (this.state === 'roundEnd' || this.state === 'runEnd') return;
    this.state = 'roundEnd';
    this.plantingBot = null;
    const win = result === 'win';
    this.run.roundsWon += win ? 1 : 0;
    const reward = win ? ROUND_REWARD : ROUND_LOSS_REWARD;
    this.run.credits += reward;
    this.addXp(win ? XP_ROUND_WIN : XP_ROUND_LOSS);
    this.meta.stats.rounds++;
    if (win) this.meta.stats.roundsWon++;
    this.lastRoundSummary = {
      result, reason, reward, round: this.roundNumber,
      kills: this.run.kills, credits: this.run.credits,
      lives: this.run.lives, maxLives: this.run.maxLives,
      xp: this.meta.xp, level: this.meta.level,
      survived: win,
    };
    if (win) audio.win(); else audio.lose();
    this.saveMeta();
    bus.emit(EV.ROUND_END, { summary: this.lastRoundSummary });
    bus.emit(EV.SCORE, { run: this.run });

    if (!win) {
      this.run.lives -= 1;
      if (this.run.lives <= 0) {
        // жизни кончились — операция завершена, прогресс мета-уровня сохраняется
        this.runEnd(reason);
      } else {
        bus.emit(EV.TOAST, { text: `Потеряна жизнь! Осталось: ${this.run.lives}`, kind: 'legend' });
      }
    } else if (this.roundNumber >= MAX_ROUNDS) {
      this.runEnd('Операция завершена — все раунды пройдены!');
    }
  }

  runEnd(reason) {
    this.state = 'runEnd';
    this.roundActive = false;
    this.runActive = false;
    this.meta.stats.bestRound = Math.max(this.meta.stats.bestRound || 0, this.roundNumber);
    this.saveMeta();
    bus.emit(EV.GAME_OVER, {
      reason,
      round: this.roundNumber,
      stats: {
        kills: this.run.kills, headshots: this.run.headshots, deaths: this.run.deaths,
        roundsWon: this.run.roundsWon, damage: Math.round(this.run.damageDealt),
        credits: this.run.credits, level: this.meta.level, items: this.run.items,
      },
    });
  }

  /* ================= прочее ================= */

  spawnPickup(type, pos, value) {
    this.pickups.push(new Pickup(this, type, pos, value));
  }

  spawnGrenade(type, pos, vel, owner) {
    this.grenades.push(new Grenade(this, type, pos, vel, owner));
  }

  emitNoise(x, z, radius, type) {
    for (const bot of this.bots) bot.hearNoise(x, z, radius, type);
  }

  buy(itemId) {
    const gear = GEAR_BY_ID[itemId];
    const p = this.player;
    let price = 0;
    if (gear) price = gear.price;
    else if (WEAPONS[itemId]) price = WEAPONS[itemId].price;
    else return false;
    if (this.state !== 'buy' && this.time - (this._roundStartTime || 0) > 25) {
      bus.emit(EV.TOAST, { text: 'Покупки доступны только в фазе закупки', kind: 'plain' });
      audio.error();
      return false;
    }
    if (WEAPONS[itemId] && this.meta.level < WEAPONS[itemId].unlock) {
      bus.emit(EV.TOAST, { text: `Откроется на ${WEAPONS[itemId].unlock} уровне`, kind: 'plain' });
      audio.error();
      return false;
    }
    if (this.run.credits < price) {
      bus.emit(EV.TOAST, { text: 'Недостаточно кредитов', kind: 'plain' });
      audio.error();
      return false;
    }
    this.run.credits -= price;

    if (WEAPONS[itemId]) {
      p.giveWeapon(itemId);
      bus.emit(EV.TOAST, { text: `Куплено: ${WEAPONS[itemId].name}`, kind: WEAPONS[itemId].rarity });
    } else {
      switch (itemId) {
        case 'armor': p.armor = Math.min(100, p.armor + 100); p.hasHelmet = true; break;
        case 'medkit': p.heal(50); break;
        case 'defusekit': p.hasDefuseKit = true; this.run.defuseKit = true; break;
        case 'ammo': p.refillAmmo(); break;
        case 'nade_he': p.grenades.he++; break;
        case 'nade_smoke': p.grenades.smoke++; break;
        case 'nade_flash': p.grenades.flash++; break;
        case 'nade_fire': p.grenades.fire++; break;
        case 'nade_decoy': p.grenades.decoy++; break;
      }
      bus.emit(EV.TOAST, { text: `Куплено: ${gear.name}`, kind: 'rare' });
    }
    audio.pickup(true);
    bus.emit(EV.SCORE, { run: this.run });
    bus.emit(EV.STATE, { player: p, run: this.run });
    return true;
  }

  /* ================= обновление ================= */

  update(dt) {
    if (this.pauseReason === 'loot' || this.pauseReason === 'menu' || this.pauseReason === 'pause') {
      // мир замирает, но эффекты продолжают жить, чтобы картинка не «застывала» слишком резко
      this.effects.update(dt * 0.15, this.camera);
      return;
    }
    this.time += dt;

    if (this.state === 'buy') {
      this.buyTimer -= dt;
      if (this.buyTimer <= 0) {
        this._roundStartTime = this.time;
        this.startLive();
      }
    }

    if (this.state === 'live') {
      if (!(this.bomb && this.bomb.planted)) {
        this.roundTimer -= dt;
        if (this.roundTimer <= 0) {
          this.roundTimer = 0;
          this.endRound('win', 'Время вышло — террористы не заложили бомбу');
        } else if (this.roundTimer < 20 && Math.floor(this.roundTimer) !== this._lastBeep) {
          this._lastBeep = Math.floor(this.roundTimer);
          if (this._lastBeep <= 10) audio.beep(true);
        }
      } else {
        const b = this.bomb;
        b.timer -= dt;
        if (b.timer <= b.beepAt - 1) {
          b.beepAt = Math.floor(b.timer);
          audio.beep(b.timer < 10);
        }
        if (b.timer <= 0) {
          audio.explosion(0, b.pos.x, b.pos.z);
          this.effects.explode(b.pos, 24, 0xffb45a);
          this.engine.addShake(2.2);
          bus.emit(EV.BOMB, { exploded: true });
          this.endRound('lose', 'Бомба взорвалась');
          return;
        }
        bus.emit(EV.BOMB, { planted: true, site: b.site, timer: Math.max(0, b.timer) });
      }
    }

    // игрок
    this.player.update(dt, this.input);

    // боты
    const frozen = this.state === 'buy';
    for (const bot of this.bots) {
      if (frozen) {
        bot.group.position.copy(bot.pos);
        continue;
      }
      if (bot.blind > 0) bot.blind -= dt;
      bot.update(dt, this.player);
    }
    // уборка трупов
    for (let i = this.bots.length - 1; i >= 0; i--) {
      const b = this.bots[i];
      if (b.dead && b.deadTimer > 5) { b.dispose(); this.bots.splice(i, 1); }
    }

    // гранаты и подбираемые предметы
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.update(dt);
      if (g.done) { g.dispose(); this.grenades.splice(i, 1); }
    }
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.update(dt);
      if (p.done) this.pickups.splice(i, 1);
    }

    // огонь наносит урон
    this.fireTick += dt;
    if (this.fireTick > 0.3) {
      this.fireTick = 0;
      for (const actor of this.actors()) {
        if (this.effects.fireDamageAt(new THREE.Vector3(actor.pos.x, actor.pos.y + 0.9, actor.pos.z))) {
          if (actor === this.player) this.player.takeDamage(7, 'body', null, true);
          else actor.takeDamage(7, 'body', actor.pos.clone(), null, null);
        }
      }
    }

    // разминирование
    this.defuseTick(dt);
    if (!this.bomb || !this.bomb.planted) {
      const p = this.player;
      const nearSite = this.world.whichSite(p.pos);
      if (nearSite) bus.emit(EV.PROMPT, { text: `Точка ${nearSite} — удерживайте позицию`, progress: 0, key: null });
    }

    this.effects.update(dt, this.camera);
    audio.updateListener(this.camera.position, new THREE.Vector3(-Math.sin(this.player.yaw), 0, -Math.cos(this.player.yaw)));

    if (this.time % 1 < dt) this.recomputeMods();
  }
}

export { WEAPONS, ITEMS, maxHealthForSkill, xpForLevel };
