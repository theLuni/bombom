/**
 * Бот-противник: восприятие, навигация по сетке, бой, закладка бомбы, оборона точки.
 */
import * as THREE from 'three';
import { WEAPONS } from '../data/weapons.js';
import { WeaponState, applySpread } from '../weapons/weapon.js';
import { audio } from '../core/audio.js';
import { bus, EV } from '../core/bus.js';
import { resolveShot } from './combat.js';

const BOT_NAMES = [
  'Дым', 'Коготь', 'Скала', 'Вихрь', 'Пепел', 'Сойка', 'Топор', 'Гюрза',
  'Клык', 'Сталь', 'Шаман', 'Рысь', 'Эхо', 'Гром', 'Ворон', 'Скиф',
];
const BOSS_NAMES = ['Титан', 'Молох', 'Голиаф', 'Цербер', 'Вулкан'];

let botCounter = 0;

const TMP_A = new THREE.Vector3();
const TMP_B = new THREE.Vector3();
const TMP_C = new THREE.Vector3();

export class Bot {
  constructor(game, spawnPos, opts = {}) {
    this.game = game;
    this.id = ++botCounter;
    this.name = (opts.boss ? BOSS_NAMES : BOT_NAMES)[Math.floor(Math.random() * (opts.boss ? BOSS_NAMES : BOT_NAMES).length)];
    if (opts.boss) this.name += '-Лидер';
    this.team = 'T';
    this.pos = spawnPos.clone();
    this.pos.y = 0;
    this.vel = new THREE.Vector3();
    this.velY = 0;
    this.radius = 0.36 * (opts.boss ? 1.22 : 1);
    this.height = 1.78 * (opts.boss ? 1.22 : 1);
    this.scale = opts.boss ? 1.22 : 1;
    this.crouch = false;
    this.dead = false;
    this.deadTimer = 0;
    this.boss = !!opts.boss;
    this.maxHealth = opts.health ?? 100;
    this.health = this.maxHealth;
    this.armor = opts.armor ?? 0;

    // сложность
    this.skill = {
      accuracy: opts.accuracy ?? 0.5,
      reaction: opts.reaction ?? 0.42,
      aggression: opts.aggression ?? 0.6,
    };
    this.weaponId = opts.weapon || 'smg_mp5';
    this.weapon = WEAPONS[this.weaponId];
    this.weaponState = new WeaponState(this.weapon);

    this.state = 'advance';
    this.path = [];
    this.pathTimer = 0;
    this.siteTarget = opts.site || 'A';
    this.plantTimer = 0;
    this.planting = false;
    this.aimError = 1;
    this.seeTimer = 0;
    this.lostTimer = 0;
    this.lastSeen = null;
    this.alertTimer = 0;
    this.noiseTarget = null;
    this.repositionTimer = 0;
    this.strafeDir = Math.random() > 0.5 ? 1 : -1;
    this.strafeTimer = 0;
    this.shootDelay = 0;
    this.burst = 0;
    this.burstPause = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.moveSpeed = (this.boss ? 3.9 : 4.15) * (opts.speed || 1);
    this.deathRot = 0;
    this.hitFlash = 0;
    this.blind = 0;
    this.killer = null;

    this.group = new THREE.Group();
    this.buildMesh();
    this.group.position.copy(this.pos);
    this.game.scene.add(this.group);
    this.nav = game.world.nav;

    // куда идти при обороне после закладки
    this.defendPoint = null;
  }

  /* ---------------- модель ---------------- */

  buildMesh() {
    const s = this.scale;
    const bodyColor = this.boss ? 0x5c2b7a : 0x7a4436;
    const vestColor = this.boss ? 0x2c1440 : 0x2f2a26;
    const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.78, metalness: 0.1 });
    const vestMat = new THREE.MeshStandardMaterial({ color: vestColor, roughness: 0.7, metalness: this.boss ? 0.4 : 0.1 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xb98b63, roughness: 0.85 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x22242a, roughness: 0.8 });
    if (this.boss) {
      bodyMat.emissive = new THREE.Color(0x2a0b3a);
      vestMat.emissive = new THREE.Color(0x22063a);
    }
    this.materials = [bodyMat, vestMat, skinMat, darkMat];

    const add = (geo, mat, x, y, z, parent = this.group) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x * s, y * s, z * s);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };

    this.torso = add(new THREE.BoxGeometry(0.52, 0.62, 0.3), bodyMat, 0, 1.28, 0);
    add(new THREE.BoxGeometry(0.56, 0.4, 0.34), vestMat, 0, 1.32, 0); // бронежилет
    this.head = add(new THREE.BoxGeometry(0.24, 0.26, 0.24), bodyMat, 0, 1.72, 0);
    add(new THREE.BoxGeometry(0.3, 0.14, 0.3), darkMat, 0, 1.84, 0); // шлем
    this.armL = add(new THREE.BoxGeometry(0.14, 0.5, 0.16), bodyMat, -0.33, 1.3, 0);
    this.armR = add(new THREE.BoxGeometry(0.14, 0.5, 0.16), bodyMat, 0.33, 1.3, 0);
    add(new THREE.BoxGeometry(0.18, 0.3, 0.34), new THREE.MeshStandardMaterial({ color: this.boss ? 0x4a2060 : 0x3a3129, roughness: 0.85 }), -0.14, 0.62, 0); // нога
    add(new THREE.BoxGeometry(0.18, 0.3, 0.34), new THREE.MeshStandardMaterial({ color: this.boss ? 0x4a2060 : 0x3a3129, roughness: 0.85 }), 0.14, 0.62, 0);
    add(new THREE.BoxGeometry(0.2, 0.45, 0.24), darkMat, -0.14, 0.24, 0);
    add(new THREE.BoxGeometry(0.2, 0.45, 0.24), darkMat, 0.14, 0.24, 0);
    // «руки» вперёд — поза с оружием
    this.armL.rotation.x = -1.15;
    this.armR.rotation.x = -1.15;
    this.armL.position.set(-0.24 * s, 1.32 * s, -0.18 * s);
    this.armR.position.set(0.24 * s, 1.32 * s, -0.18 * s);

    // оружие
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.5, metalness: 0.7 });
    this.gun = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, this.weapon.cls === 'sniper' ? 0.9 : 0.55), gunMat);
    body.castShadow = true;
    this.gun.add(body);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.4, 8), gunMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = -0.45;
    this.gun.add(barrel);
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, 0, -0.68);
    this.gun.add(this.muzzle);
    this.gun.position.set(0.1 * s, 1.32 * s, -0.34 * s);
    this.group.add(this.gun);
    this.group.userData.bot = this;
  }

  dispose() {
    this.game.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
  }

  /* ---------------- восприятие ---------------- */

  eyePos(out = TMP_A) {
    return out.set(this.pos.x, this.pos.y + 1.55 * this.scale - (this.crouch ? 0.4 : 0), this.pos.z);
  }

  forward(out = TMP_B) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  perceive(dt, player) {
    if (player.dead) { this.seeTimer = 0; return false; }
    if (this.blind > 0) {
      // ослеплён: не видит игрока, но палит наугад
      this.seeTimer = 0;
      this.aimError = 1;
      return false;
    }
    const eye = this.eyePos(TMP_A);
    const target = TMP_B.set(player.pos.x, player.pos.y + (player.crouchAmount > 0.5 ? 1.0 : 1.5), player.pos.z);
    const toTarget = TMP_C.subVectors(target, eye);
    const dist = toTarget.length();
    // чем «короче» оружие, тем меньше дистанция боя
    const weaponRange = (this.weapon.range || 40) * 1.5;
    const maxRange = Math.min(70, weaponRange) * (1 + (this.skill.accuracy - 0.5) * 0.4);
    if (dist > maxRange) return false;

    const dir = toTarget.clone().divideScalar(dist);
    const fwd = this.forward(new THREE.Vector3());
    const dot = fwd.dot(dir);
    const fov = this.alertTimer > 0 ? 0.1 : Math.cos(THREE.MathUtils.degToRad(62));
    if (dot < fov) return false;

    if (this.game.physics.raycast(eye, dir, dist - 0.4, ['decor'])) return false;
    if (this.game.effects.smokeBlocked(eye, target)) return false;
    // «заметность»: призрак-навык снижает радиус обнаружения
    const stealth = 1 - (this.game.mods.ghost || 0) + (this.game.player.spawnProtection > 0 ? 0.9 : 0);
    if (dist > maxRange * (1 - stealth * 0.25)) return false;

    this.seeTimer += dt;
    this.lostTimer = 0;
    this.lastSeen = target.clone();
    this.alertTimer = 6;
    return this.seeTimer > this.skill.reaction * (this.game.mods.ghost ? 1 + this.game.mods.ghost : 1);
  }

  hearNoise(x, z, radius, type = 'shot') {
    if (this.dead) return;
    const dist = Math.hypot(x - this.pos.x, z - this.pos.z);
    const effective = radius * (this.game.mods.noise ?? 1);
    if (dist > effective) return;
    const p = new THREE.Vector3(x, 0, z);
    if (type === 'explosion') this.alertTimer = Math.max(this.alertTimer, 5);
    if (this.state === 'advance' || this.state === 'defend') {
      this.noiseTarget = p;
      if (dist < effective * 0.35) this.alertTimer = Math.max(this.alertTimer, 4);
    }
  }

  /* ---------------- поведение ---------------- */

  setDestination(target) {
    this.pathTimer = 0;
    this.path = this.nav.path(this.pos, target) || [];
    this.pathIndex = 0;
  }

  moveTowards(dt, point, speedMul = 1, allowStrafe = false) {
    const dx = point.x - this.pos.x;
    const dz = point.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.35) return true;
    const nx = dx / dist, nz = dz / dist;
    let mx = nx, mz = nz;
    if (allowStrafe && this.strafeTimer > 0) {
      mx = nx * 0.75 + (-nz) * this.strafeDir * 0.7;
      mz = nz * 0.75 + (nx) * this.strafeDir * 0.7;
      const l = Math.hypot(mx, mz) || 1;
      mx /= l; mz /= l;
    }
    const speed = this.moveSpeed * speedMul * (this.crouch ? 0.5 : 1);
    const accel = this.onGround ? 32 : 8;
    this.vel.x += (mx * speed - this.vel.x) * Math.min(1, accel * dt / speed);
    this.vel.z += (mz * speed - this.vel.z) * Math.min(1, accel * dt / speed);
    return false;
  }

  stopMove(dt, factor = 6) {
    this.vel.x += (0 - this.vel.x) * Math.min(1, factor * dt);
    this.vel.z += (0 - this.vel.z) * Math.min(1, factor * dt);
  }

  aimAt(dt, point, aimSpeed = 7) {
    const dx = point.x - this.pos.x;
    const dz = point.z - this.pos.z;
    const dy = point.y - (this.pos.y + 1.55 * this.scale);
    const targetYaw = Math.atan2(-dx, -dz);
    const targetPitch = Math.atan2(dy, Math.hypot(dx, dz));
    let diff = targetYaw - this.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.yaw += diff * Math.min(1, aimSpeed * dt);
    this.pitch += (targetPitch - this.pitch) * Math.min(1, aimSpeed * dt);
  }

  shootAt(target) {
    const time = this.game.time;
    const st = this.weaponState;
    if (!st.canFire(time)) return;
    if (st.ammo <= 0) {
      st.finishReload();
      if (st.reserve !== Infinity) st.reserve = this.weapon.reserve;
      st.ammo = this.weapon.mag;
      audio.reload(1);
      return;
    }
    const dist = this.pos.distanceTo(target);
    const eye = this.eyePos(new THREE.Vector3());
    const dir = new THREE.Vector3().subVectors(target, eye).normalize();
    const skillSpread = (1.25 - this.skill.accuracy * 0.85) * (this.boss ? 0.6 : 1);
    const spread = (skillSpread + dist * 0.12) * (0.5 + this.aimError * 0.8) * (this.weapon.cls === 'sniper' ? 0.45 : 1);

    const ctx = this.game.combatContext(this, 'T');
    audio.shot(this.weapon.cls, dist, this.pos.x, this.pos.z);
    resolveShot(ctx, eye, dir, {
      weapon: this.weapon,
      spread,
      mods: { damage: this.boss ? 1.15 : 1, armorPen: 0.05 },
      applySpreadFn: (d, s) => applySpread(d, s),
      tracerColor: 0xff9a5a,
      showTracer: Math.random() < 0.75,
      maxDist: 120,
      audio,
      distForAudio: dist,
    });
    st.consume();
    st.cycle(time, {});
    this.game.effects.muzzleFlash(this.muzzle.getWorldPosition(new THREE.Vector3()), this.forward(new THREE.Vector3()).negate(), 0.85);
    this.game.engine.addShake(0.04 / (1 + dist * 0.1));
    this.burst++;
    if (this.weapon.auto) {
      if (this.burst > 4 + Math.floor(Math.random() * 5)) this.burstPause = 0.25 + Math.random() * 0.45;
    } else {
      this.burstPause = 0.22 + Math.random() * 0.5;
    }
    this.game.emitNoise(this.pos.x, this.pos.z, 40 * (this.game.mods.noise ?? 1), 'shot');
  }

  /** Куда идти: к точке закладки, к шуму или к игроку. */
  pickDestination() {
    const game = this.game;
    if (game.bomb && game.bomb.planted) {
      if (!this.defendPoint || Math.random() < 0.25) {
        this.defendPoint = game.bomb ? this.nav.randomPointAround(game.bomb.pos, 11) : null;
      }
      return this.defendPoint;
    }
    if (this.noiseTarget) return this.noiseTarget;
    const site = game.world.siteCenter(this.siteTarget);
    return site;
  }

  update(dt, player) {
    if (this.dead) {
      this.deadTimer += dt;
      // падение
      this.deathRot = Math.min(Math.PI / 2 * 0.96, this.deathRot + dt * 4.2);
      this.group.rotation.x = -this.deathRot;
      this.group.position.copy(this.pos);
      if (this.deadTimer > 2.6) {
        this.group.position.y = -Math.min(1.4, (this.deadTimer - 2.6) * 0.6);
      }
      return;
    }

    const game = this.game;
    const time = game.time;
    const canSee = this.perceive(dt, player);
    if (!canSee) {
      this.seeTimer = Math.max(0, this.seeTimer - dt * 0.6);
      this.aimError = Math.min(1, this.aimError + dt * 0.8);
    } else {
      this.aimError = Math.max(0.16, this.aimError - dt * 0.6);
    }
    if (this.alertTimer > 0) this.alertTimer -= dt;
    if (this.strafeTimer > 0) this.strafeTimer -= dt;
    if (this.repositionTimer > 0) this.repositionTimer -= dt;
    if (this.burstPause > 0) this.burstPause -= dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;

    const distToPlayer = this.pos.distanceTo(player.pos);
    const engaged = canSee && !player.dead;

    // ---- выбор состояния ----
    if (engaged) {
      this.state = 'engage';
    } else if (this.state === 'engage') {
      this.lostTimer += dt;
      this.state = this.lostTimer > 2.2 ? (game.bomb && game.bomb.planted ? 'defend' : 'advance') : 'hold';
    } else if (this.state === 'hold') {
      this.state = 'advance';
    } else if (game.bomb && game.bomb.planted && this.state !== 'defend') {
      this.state = 'defend';
      this.defendPoint = null;
    }

    // ---- действия по состоянию ----
    switch (this.state) {
      case 'engage': {
        this.aimAt(dt, this.lastSeen || player.pos, 9 + this.skill.accuracy * 6);
        const idealDist = this.weapon.cls === 'shotgun' ? 7 : this.weapon.cls === 'sniper' ? 30 : 14;
        const tooClose = distToPlayer < idealDist * 0.55;
        const tooFar = distToPlayer > idealDist * 1.9 && this.weapon.cls !== 'sniper';
        if (tooClose && this.skill.aggression < 0.9) {
          // отходим
          const away = TMP_A.set(this.pos.x * 2 - player.pos.x, 0, this.pos.z * 2 - player.pos.z);
          this.moveTowards(dt, away, 0.85);
        } else if (tooFar) {
          this.moveTowards(dt, player.pos, 0.9);
        } else {
          if (this.strafeTimer <= 0) {
            this.strafeTimer = 0.7 + Math.random() * 1.1;
            this.strafeDir = Math.random() > 0.5 ? 1 : -1;
          }
          this.moveTowards(dt, this.pos.clone().add(this.forward(new THREE.Vector3()).multiplyScalar(2)), 0.55, true);
        }
        if (this.burstPause <= 0 && this.aimError < 0.62) {
          const aimQuality = Math.abs(this.angleToPoint(this.lastSeen || player.pos));
          if (aimQuality < 0.16) this.shootAt(this.lastSeen ? this.lastSeen.clone().setY(player.pos.y + 1.3) : player.pos.clone().setY(player.pos.y + 1.3));
        }
        break;
      }
      case 'advance':
      case 'defend': {
        const dest = this.pickDestination();
        this.pathTimer -= dt;
        if (this.pathTimer <= 0 || !this.path.length) {
          this.pathTimer = 0.7 + Math.random() * 0.6;
          this.path = this.nav.path(this.pos, dest) || [];
          this.pathIndex = 0;
        }
        let target = dest;
        if (this.path.length) {
          while (this.path.length > 1 && Math.hypot(this.path[0].x - this.pos.x, this.path[0].z - this.pos.z) < 1.2) this.path.shift();
          target = this.path[0];
        }
        this.aimAt(dt, TMP_A.set(target.x, this.pos.y + 1.2, target.z), 4.5);
        const arrived = this.moveTowards(dt, target, this.alertTimer > 0 ? 1.08 : 0.94);

        // достигли точки закладки и игрок не мешает — ставим бомбу
        const site = game.world.siteCenter(this.siteTarget);
        const atSite = Math.hypot(this.pos.x - site.x, this.pos.z - site.z) < 7;
        if ((!game.bomb || !game.bomb.planted) && atSite && distToPlayer > 12 && game.roundLive()) {
          this.planting = true;
          this.plantTimer += dt;
          this.stopMove(dt, 8);
          game.onBotPlanting(this, this.plantTimer);
          if (this.plantTimer > 3.4) {
            this.planting = false;
            game.plantBomb(this, site);
          }
        } else {
          if (this.planting) game.onBotPlanting(this, 0, true);
          this.planting = false;
          this.plantTimer = 0;
        }
        if (arrived && !this.path.length) this.pathTimer = 0;
        break;
      }
      case 'hold': {
        const last = this.lastSeen || player.pos;
        this.aimAt(dt, last, 6);
        this.stopMove(dt, 5);
        break;
      }
      default:
        this.stopMove(dt, 4);
    }

    // гравитация и столкновения
    this.velY -= 16 * dt;
    const res = game.physics.moveActor(this, this.vel.x * dt, this.velY * dt, this.vel.z * dt, 0.45);
    if (res.blockedXZ && Math.random() < 0.06) {
      this.pathTimer = 0;
      this.path = [];
    }
    if (this.onGround) this.velY = 0;

    this.weaponState.update(time);

    // подсветка при попадании
    if (this.materials) {
      const flashOn = this.hitFlash > 0;
      this.materials[0].emissive.setHex(flashOn ? 0x7a1414 : (this.boss ? 0x2a0b3a : 0x000000));
      this.materials[1].emissive.setHex(flashOn ? 0x5a0f0f : (this.boss ? 0x22063a : 0x000000));
    }

    // анимация ходьбы + поворот модели
    const speed = Math.hypot(this.vel.x, this.vel.z);
    this.group.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.group.rotation.y = this.yaw;
    const walkPhase = time * (7 + speed * 0.8);
    const amp = Math.min(0.5, speed * 0.13);
    if (this.torso) {
      this.group.position.y = this.pos.y + Math.abs(Math.sin(walkPhase)) * amp * 0.12;
      this.torso.rotation.y = Math.sin(walkPhase) * 0.08;
    }
    if (this.gun) this.gun.rotation.x = this.pitch * 0.9;
  }

  angleToPoint(point) {
    const dx = point.x - this.pos.x;
    const dz = point.z - this.pos.z;
    const targetYaw = Math.atan2(-dx, -dz);
    let diff = targetYaw - this.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return diff;
  }

  /* ---------------- урон ---------------- */

  takeDamage(amount, zone, point, weapon, killer = null) {
    if (this.dead) return 0;
    const dmg = amount;
    this.health -= dmg;
    this.killer = killer || this.killer;
    this.hitFlash = 0.12;
    this.alertTimer = 6;
    this.seeTimer = Math.max(this.seeTimer, 0.2);
    if (!this.lastSeen) this.lastSeen = this.game.player.pos.clone().setY(this.game.player.pos.y + 1.3);
    // сбивается с прицела при попадании
    this.aimError = Math.min(1, this.aimError + 0.35);
    if (this.health <= 0) this.die(zone, point, weapon, killer);
    return dmg;
  }

  die(zone, point, weapon, killer = null) {
    if (this.dead) return;
    this.dead = true;
    this.health = 0;
    this.planting = false;
    this.killer = killer;
    if (this.game.plantingBot === this) this.game.plantingBot = null;
    audio.death();
    bus.emit(EV.BOT_DEATH, { bot: this, zone, point, weapon, killer });
  }
}
