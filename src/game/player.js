/**
 * Игрок: вид от первого лица, движение, стрельба, способности, инвентарь.
 */
import * as THREE from 'three';
import { WeaponState, applySpread } from '../weapons/weapon.js';
import { ViewModel } from '../weapons/viewmodel.js';
import { WEAPONS } from '../data/weapons.js';
import { audio } from '../core/audio.js';
import { bus, EV } from '../core/bus.js';
import { resolveShot } from './combat.js';

const EYE = 1.62;
const CROUCH_EYE = 1.2;
const RADIUS = 0.36;
const HEIGHT = 1.78;

export class Player {
  constructor(game, camera, input, effects) {
    this.game = game;
    this.camera = camera;
    this.input = input;
    this.effects = effects;
    this.pos = new THREE.Vector3(0, 0, -30);
    this.vel = new THREE.Vector3();
    this.velY = 0;
    this.onGround = true;
    this.radius = RADIUS;
    this.height = HEIGHT;
    this.yaw = Math.PI;
    this.pitch = 0;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.aimPunch = 0;
    this.roll = 0;
    this.crouch = false;
    this.crouchAmount = 0;
    this.dead = false;
    this.team = 'CT';
    this.health = 100;
    this.armor = 0;
    this.armorMax = 100;
    this.hasHelmet = false;
    this.hasDefuseKit = false;
    this.slots = { primary: null, secondary: 'pistol_std', melee: 'knife' };
    this.current = 'secondary';
    this.lastWeapon = 'primary';
    this.states = new Map();
    this.grenades = { he: 0, smoke: 0, flash: 0, fire: 0, decoy: 0 };
    this.grenadeType = null;
    this.grenadeHold = 0;
    this.dashCd = 0;
    this.dashTime = 0;
    this.medicCd = 0;
    this.secondWindUsed = false;
    this.footAccum = 0;
    this.landImpulse = 0;
    this.speedFactor = 0;
    this.viewModel = new ViewModel((game.engine && game.engine.viewCamera) || camera);
    this.knifeSwing = 0;
    this.spawnProtection = 0;
    this.forceAds = false;
    this.kills = 0;
    this._tmpV = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this.setupWeapon('secondary');
  }

  /* ---------------- инвентарь ---------------- */

  get mods() { return this.game.mods; }
  get maxHealth() { return this.mods.maxHealth; }
  get run() { return this.game.run; }
  get time() { return this.game.time; }

  stateFor(id) {
    if (!this.states.has(id)) this.states.set(id, new WeaponState(WEAPONS[id]));
    return this.states.get(id);
  }

  get weaponId() {
    if (this.current === 'grenade') return null;
    return this.slots[this.current];
  }

  get weaponDef() {
    const id = this.weaponId;
    return id ? WEAPONS[id] : null;
  }

  get state() {
    const id = this.weaponId;
    return id ? this.stateFor(id) : null;
  }

  giveWeapon(id, slotOverride = null) {
    const def = WEAPONS[id];
    if (!def) return;
    const slot = slotOverride || (def.slot === 1 ? 'primary' : def.slot === 2 ? 'secondary' : 'melee');
    this.slots[slot] = id;
    if (!this.states.has(id)) this.states.set(id, new WeaponState(def));
    else {
      const st = this.states.get(id);
      st.ammo = def.mag === Infinity ? Infinity : def.mag;
      if (def.reserve !== Infinity) st.reserve = def.reserve;
      st.reloading = false;
    }
    if (this.current !== slot && slot !== 'melee') this.current = slot;
    this.setupWeapon(this.current);
  }

  refillAmmo() {
    for (const [id, st] of this.states) {
      const def = WEAPONS[id];
      if (!def) continue;
      st.ammo = def.mag === Infinity ? Infinity : def.mag;
      if (def.reserve !== Infinity) st.reserve = def.reserve;
      st.reloading = false;
    }
    bus.emit(EV.AMMO, { state: this.state });
  }

  setupWeapon(slot) {
    if (slot === 'grenade') {
      this.viewModel.setWeapon({ id: `grenade_${this.grenadeType}`, buildStyle: `grenade_${this.grenadeType || 'he'}` });
      return;
    }
    const id = this.slots[slot];
    if (!id) return;
    this.viewModel.setWeapon(WEAPONS[id]);
    bus.emit(EV.WEAPON_CHANGED, { weapon: WEAPONS[id], slot });
  }

  switchTo(slot, force = false) {
    if (!force) {
      if (slot === 'grenade' && !this.grenadeType) return;
      if (slot !== 'grenade' && slot !== 'melee' && !this.slots[slot]) return;
      if (this.current === slot && !force) return;
    }
    if (this.current !== 'grenade') this.lastWeapon = this.current;
    this.current = slot;
    this.setupWeapon(slot);
    const def = this.weaponDef;
    audio.reload(2);
  }

  selectGrenade(type) {
    const count = this.grenades[type] || 0;
    if (count <= 0) { audio.error(); bus.emit(EV.TOAST, { text: 'Нет гранат этого типа', kind: 'plain' }); return; }
    this.grenadeType = type;
    this.current = 'grenade';
    this.setupWeapon('grenade');
  }

  /* ---------------- жизненный цикл раунда ---------------- */

  resetForRound(spawn) {
    this.pos.copy(spawn);
    this.pos.y = 0;
    this.vel.set(0, 0, 0);
    this.velY = 0;
    this.dead = false;
    this.health = this.mods.maxHealth;
    this.armor = Math.min(100 + (this.run?.armorBonus || 0), this.mods.startArmor + (this.run?.armorBonus || 0));
    this.hasDefuseKit = !!this.run?.defuseKit;
    this.secondWindUsed = false;
    this.dashCd = 0;
    this.medicCd = 0;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.aimPunch = 0;
    this.spawnProtection = 2;
    this.current = this.slots.primary ? 'primary' : 'secondary';
    this.setupWeapon(this.current);
    if (this.current !== 'grenade') this.lastWeapon = this.current;
    this.yaw = Math.atan2(-spawn.x, -spawn.z) + Math.PI; // смотрим в центр карты
    this.pitch = 0;
    bus.emit(EV.STATE, { player: this });
  }

  heal(amount, silent = false) {
    const max = this.mods.maxHealth;
    const before = this.health;
    this.health = Math.min(max, this.health + amount);
    if (!silent && this.health > before) bus.emit(EV.TOAST, { text: `+${Math.round(this.health - before)} HP`, kind: 'plain' });
    bus.emit(EV.STATE, { player: this });
  }

  /* ---------------- движение ---------------- */

  update(dt, input) {
    const time = this.game.time;

    if (this.spawnProtection > 0) this.spawnProtection -= dt;
    if (this.dashCd > 0) this.dashCd -= dt;
    if (this.medicCd > 0) this.medicCd -= dt;
    if (this.dashTime > 0) this.dashTime -= dt;

    // сброс состояния после смерти — камера падает
    if (this.dead) {
      this.velY -= 16 * dt;
      this.game.physics.moveActor(this, this.vel.x * dt, this.velY * dt, this.vel.z * dt);
      const targetEye = Math.max(0.35, this.pos.y + 0.45);
      this.camera.position.set(this.pos.x, targetEye, this.pos.z);
      this.roll += (1.2 - this.roll) * Math.min(1, dt * 3);
      this.camera.rotation.set(this.pitch, this.yaw, this.roll);
      this.viewModel.update(dt, {});
      return;
    }

    const frozen = this.game.isFrozen();

    /* ---- мышь ---- */
    const sens = 0.0022 * (this.game.settings.sensitivity || 1);
    const mouse = input.takeMouse();
    if (!frozen) {
      this.yaw -= mouse.dx * sens * (this.adsAmount() > 0.5 ? 0.55 : 1);
      this.pitch -= mouse.dy * sens * (this.adsAmount() > 0.5 ? 0.55 : 1);
      this.pitch = THREE.MathUtils.clamp(this.pitch, -Math.PI / 2 + 0.02, Math.PI / 2 - 0.02);
    }

    /* ---- прицеливание ---- */
    const def = this.weaponDef;
    const canAds = !!(def && def.adsZoom);
    const wantAds = canAds && input.mouse.right && !frozen;
    this.viewModel.setAds(wantAds);

    /* ---- ввод движения ---- */
    const axis = frozen ? { x: 0, z: 0 } : input.axis();
    this.crouch = !frozen && (input.isDown('ControlLeft') || input.isDown('ControlRight') || input.isDown('KeyC'));
    this.crouchAmount += ((this.crouch ? 1 : 0) - this.crouchAmount) * Math.min(1, dt * 9);

    const forward = this._tmpV.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wish = new THREE.Vector3()
      .addScaledVector(forward, axis.z)
      .addScaledVector(right, axis.x);
    const wishLen = wish.length();
    if (wishLen > 0) wish.divideScalar(wishLen);

    let speed = 4.45 * this.mods.moveSpeed * (def ? def.moveSpeedMul : 1);
    if (this.crouch) speed *= 0.46;
    if (this.viewModel.adsAmount > 0.5) speed *= 0.55;
    if (frozen) speed = 0;
    const buffSpeed = this.game.buffValue('speed');
    speed *= 1 + buffSpeed;

    const accel = this.onGround ? 62 : 16;
    const targetVx = wish.x * speed, targetVz = wish.z * speed;
    this.vel.x += (targetVx - this.vel.x) * Math.min(1, accel * dt / Math.max(1, speed));
    this.vel.z += (targetVz - this.vel.z) * Math.min(1, accel * dt / Math.max(1, speed));

    // рывок
    if (this.dashTime > 0) {
      const dir = wish.lengthSq() > 0 ? wish : forward.clone();
      this.vel.x += dir.x * 26 * dt * 4;
      this.vel.z += dir.z * 26 * dt * 4;
      this.viewModel.root.rotation.z = -0.1;
    }

    /* ---- прыжок ---- */
    if (input.isDown('Space') && this.onGround && !frozen) {
      this.velY = 7.25 * Math.sqrt(this.mods.jump);
      this.onGround = false;
      audio.footstep(0.5);
    }
    this.velY -= 16 * dt;
    if (this.velY < -42) this.velY = -42;

    const prevY = this.pos.y;
    const res = this.game.physics.moveActor(this, this.vel.x * dt, this.velY * dt, this.vel.z * dt, 0.45);
    if (res.landedOn && prevY - this.pos.y > 0.15) {
      const fall = Math.max(0, this._fallStart ? this._fallStart - this.pos.y : 0);
      this.landImpulse = 1;
      audio.footstep(0.6);
      if (this.velY < -12) this.takeDamage(Math.min(28, (Math.abs(this.velY) - 12) * 2.4), 'legs', null, true);
      this.velY = 0;
    }
    this._fallStart = this.pos.y;
    if (this.pos.y < -8) { // страховка от вылета под карту
      this.pos.set(this.game.world.playerSpawns[0].x, 0.2, this.game.world.playerSpawns[0].z);
      this.vel.set(0, 0, 0);
      this.velY = 0;
    }

    /* ---- шаги ---- */
    const horizSpeed = Math.hypot(this.vel.x, this.vel.z);
    this.speedFactor = Math.min(1, horizSpeed / 4.45);
    if (this.onGround && horizSpeed > 0.9) {
      this.footAccum += horizSpeed * dt;
      const stride = this.crouch ? 2.6 : 1.85;
      if (this.footAccum > stride) {
        this.footAccum = 0;
        audio.footstep(this.crouch ? 0.16 : 0.32 * (0.6 + this.speedFactor));
      }
    }

    /* ---- физика оружия и стрельба ---- */
    for (const st of this.states.values()) st.update(time);

    const wdef = this.weaponDef;
    if (wdef && !frozen && this.game.canShoot()) {
      const st = this.state;
      if (this.current === 'grenade') {
        if (input.mouse.leftClick) this.throwGrenade();
      } else if (wdef.cls === 'knife') {
        if (input.mouse.leftClick) this.meleeAttack();
      } else {
        const wantsFire = wdef.auto ? input.mouse.left : input.mouse.leftClick;
        if (wantsFire) this.tryFire();
        if (input.wasPressed('KeyR')) this.beginReload();
        if (st.needsReload() && st.reserve > 0) this.beginReload();
      }
    }

    /* ---- способности ---- */
    if (!frozen && input.wasPressed('ShiftLeft')) this.dash();
    if (!frozen && input.wasPressed('KeyF')) this.useMedic();

    /* ---- выбор снаряжения ---- */
    if (input.wasPressed('Digit1')) this.switchTo('primary');
    if (input.wasPressed('Digit2')) this.switchTo('secondary');
    if (input.wasPressed('Digit3')) this.switchTo('melee');
    if (input.wasPressed('Digit4')) this.selectGrenade('he');
    if (input.wasPressed('Digit5')) this.selectGrenade('smoke');
    if (input.wasPressed('Digit6')) this.selectGrenade('flash');
    if (input.wasPressed('Digit7')) this.selectGrenade('fire');
    if (input.wasPressed('KeyQ')) {
      const other = this.current === 'primary' ? 'secondary' : 'primary';
      this.switchTo(other);
    }

    /* ---- камера ---- */
    const recoilRecover = Math.min(1, dt * 9);
    this.recoilPitch += (0 - this.recoilPitch) * recoilRecover;
    this.recoilYaw += (0 - this.recoilYaw) * recoilRecover;
    this.aimPunch += (0 - this.aimPunch) * Math.min(1, dt * 4);

    const strafe = axis.x;
    const targetRoll = -strafe * 0.022 + (this.viewModel.adsAmount > 0.5 ? 0 : 0);
    this.roll += (targetRoll - this.roll) * Math.min(1, dt * 6);
    const bobY = Math.sin(this.viewModel.bob.t * 2) * 0.012 * this.viewModel.bob.amp;

    const eye = EYE - this.crouchAmount * (EYE - CROUCH_EYE);
    this.camera.position.set(this.pos.x, this.pos.y + eye + bobY - this.landImpulse * 0.06, this.pos.z);
    this.landImpulse = Math.max(0, this.landImpulse - dt * 4);
    const punchX = (Math.random() - 0.5) * this.aimPunch * 0.04;
    const punchY = (Math.random() - 0.5) * this.aimPunch * 0.04;
    this.camera.rotation.set(
      this.pitch + this.recoilPitch + this.aimPunch * 0.02 + punchX,
      this.yaw + this.recoilYaw + punchY,
      this.roll
    );

    // FOV / зум
    const baseFov = this.game.settings.fov || 90;
    let fov = baseFov;
    if (wdef && wdef.adsZoom) {
      fov = baseFov / (1 + (wdef.adsZoom - 1) * this.viewModel.adsAmount);
    }
    this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 14);
    this.camera.updateProjectionMatrix();

    this.viewModel.update(dt, {
      moving: axis.z !== 0 || axis.x !== 0 ? 1 : 0,
      speed: horizSpeed,
      onGround: this.onGround,
      mouse,
      rotating: false,
    });

    // регенерация
    if (!this.dead && this.mods.regen > 0 && this.health < this.mods.maxHealth) {
      const since = time - (this._lastDamageAt ?? -99);
      if (since > 5) this.heal(this.mods.regen * dt, true);
    }
    if (!this.dead && this.run && this.run.regenUntil > time) {
      this.heal((this.run.regenRate || 0) * dt, true);
    }
  }

  adsAmount() { return this.viewModel.adsAmount; }

  /* ---------------- стрельба ---------------- */

  eyePosition(out = new THREE.Vector3()) {
    const eye = EYE - this.crouchAmount * (EYE - CROUCH_EYE);
    return out.set(this.pos.x, this.pos.y + eye, this.pos.z);
  }

  aimDirection(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    // согласовано с THREE.Euler 'YXZ' (камера смотрит в -Z)
    out.set(-Math.sin(this.yaw) * cp, sp, -Math.cos(this.yaw) * cp);
    return out.normalize();
  }

  tryFire() {
    const def = this.weaponDef;
    const st = this.state;
    const time = this.game.time;
    if (!def || !st) return;
    if (!st.canFire(time)) return;
    if (st.ammo <= 0) {
      if (st.reserve > 0) this.beginReload();
      else { audio.dryFire(); st.nextShot = time + 0.35; }
      return;
    }

    const airborne = !this.onGround;
    const spread = st.spread(this.speedFactor, airborne, this.crouch, this.viewModel.adsAmount > 0.5, this.mods, this.game.itemSpreadMul());
    const origin = this.eyePosition(new THREE.Vector3());
    const dir = this.aimDirection(new THREE.Vector3());
    const pellets = def.pellets || 1;

    const cam = this.game.combatContext(this);
    for (let i = 0; i < pellets; i++) {
      resolveShot(cam, origin, dir, {
        weapon: def,
        spread,
        mods: this.mods,
        maxDist: 220,
        pierce: (def.pierce || 0) + (this.run?.pierce || 0),
        applySpreadFn: (d, s) => applySpread(d, s),
        tracerColor: (def.buildStyle === 'gauss' || def.buildStyle === 'plasma') ? 0x8ce8ff : 0xffd88a,
        showTracer: i === 0 || pellets < 5,
        explosionRadius: def.explosive ? 2.4 : 0,
        explosiveDamage: def.explosive || 0,
        audio,
      });
    }

    st.consume(this.mods);
    st.cycle(time, this.mods);
    // отдача
    const kick = def.recoil * 0.011 * (this.viewModel.adsAmount > 0.5 ? 0.62 : 1);
    this.recoilPitch += kick * 0.85;
    this.recoilYaw += (Math.random() - 0.5) * kick * 0.6;
    this.viewModel.fire(def.recoil);
    this.game.engine.addShake(def.recoil * 0.09);
    audio.shot(def.cls, 0);
    bus.emit(EV.AMMO, { state: st });
    bus.emit(EV.ENEMY_SHOT, { byPlayer: true, x: this.pos.x, z: this.pos.z, cls: def.cls, volume: 1 });
  }

  beginReload() {
    const st = this.state;
    if (!st) return;
    const dur = st.startReload(this.game.time, this.mods, this.run?.reloadMul || 1);
    if (dur > 0) {
      audio.reload(0);
      this.viewModel.startReload(dur);
      bus.emit(EV.RELOAD, { duration: dur, weapon: this.weaponDef });
    }
  }

  meleeAttack() {
    const def = this.weaponDef;
    const time = this.game.time;
    if (!def || time < (this._nextMelee || 0)) return;
    this._nextMelee = time + 60 / def.rpm;
    this.viewModel.fire(1.4);
    audio.shot('knife', 0);
    const origin = this.eyePosition(new THREE.Vector3());
    const dir = this.aimDirection(new THREE.Vector3());
    const cam = this.game.combatContext(this);
    let hit = false;
    for (const actor of cam.actors) {
      if (actor === this || actor.dead || actor.team === this.team) continue;
      const d = new THREE.Vector3(actor.pos.x - this.pos.x, 0, actor.pos.z - this.pos.z);
      const dist = d.length();
      if (dist > 2.3) continue;
      d.divideScalar(dist || 1);
      if (d.dot(new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))) < 0.5) continue;
      cam.onActorHit(actor, 'body', new THREE.Vector3(actor.pos.x, actor.pos.y + 1.2, actor.pos.z), dist, def);
      hit = true;
      break;
    }
    if (!hit) this.effects.impact(origin.clone().addScaledVector(dir, 1.6), dir.clone().negate(), 'wall');
  }

  throwGrenade() {
    const type = this.grenadeType;
    if (!type || (this.grenades[type] || 0) <= 0) return;
    this.grenades[type]--;
    const origin = this.eyePosition(new THREE.Vector3());
    const dir = this.aimDirection(new THREE.Vector3());
    const start = origin.clone().addScaledVector(dir, 0.5);
    const vel = dir.clone().multiplyScalar(20);
    vel.y += 3.2;
    this.game.spawnGrenade(type, start, vel, this);
    audio.pickup(false);
    bus.emit(EV.TOAST, { text: `Граната брошена: ${GRENADE_NAMES[type]}`, kind: 'plain' });
    if (this.grenades[type] <= 0) {
      this.grenadeType = null;
      this.switchTo(this.slots.primary ? 'primary' : 'secondary', true);
    }
    bus.emit(EV.STATE, { player: this });
  }

  dash() {
    if (this.dashCd > 0) { audio.error(); return; }
    this.dashCd = Math.max(1.2, this.mods.dashCooldown - (this.run?.dashCd || 0));
    this.dashTime = 0.22;
    const wish = this.input.axis();
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const dir = new THREE.Vector3().addScaledVector(forward, wish.z).addScaledVector(right, wish.x);
    if (dir.lengthSq() < 0.01) dir.copy(forward);
    dir.normalize();
    this.vel.x = dir.x * 15;
    this.vel.z = dir.z * 15;
    this.spawnProtection = Math.max(this.spawnProtection, 0.32);
    audio.dash();
    this.game.engine.addShake(0.35);
    bus.emit(EV.ABILITY, { id: 'dash', cooldown: this.dashCd });
  }

  useMedic() {
    const heal = this.mods.medicHeal;
    if (this.medicCd > 0) { audio.error(); bus.emit(EV.TOAST, { text: 'Аптечка ещё не готова', kind: 'plain' }); return; }
    if (this.health >= this.mods.maxHealth) { bus.emit(EV.TOAST, { text: 'Здоровье полное', kind: 'plain' }); return; }
    this.medicCd = this.mods.medicCooldown;
    this.heal(Math.max(18, heal));
    audio.heal();
    bus.emit(EV.ABILITY, { id: 'medic', cooldown: this.medicCd });
  }

  /* ---------------- урон ---------------- */

  takeDamage(amount, zone = 'body', attacker = null, silent = false) {
    if (this.dead || this.spawnProtection > 0) return;
    this.health -= amount;
    this._lastDamageAt = this.game.time;
    if (!silent) {
      this.aimPunch = Math.min(1, this.aimPunch + Math.min(0.55, amount / 60));
      this.game.engine.addShake(Math.min(0.7, amount / 55));
      audio.hurt();
      bus.emit(EV.DAMAGE_TAKEN, { amount, zone, attacker, health: this.health });
    }
    if (this.health <= 0) {
      if (this.mods.secondWind > 0 && !this.secondWindUsed) {
        this.secondWindUsed = true;
        this.health = this.mods.secondWind;
        this.spawnProtection = 1.2;
        bus.emit(EV.TOAST, { text: '«Второе дыхание» спасло вас!', kind: 'legend' });
        audio.levelUp();
        bus.emit(EV.STATE, { player: this });
        return;
      }
      this.die(attacker);
    } else {
      bus.emit(EV.STATE, { player: this });
    }
  }

  die(attacker) {
    if (this.dead) return;
    this.dead = true;
    this.health = 0;
    this.velY = 2;
    audio.death();
    bus.emit(EV.STATE, { player: this });
    this.game.onPlayerDeath(attacker);
  }
}

export const GRENADE_NAMES = {
  he: 'осколочная',
  smoke: 'дымовая',
  flash: 'слепящая',
  fire: 'зажигательная',
  decoy: 'ложная цель',
};
