/**
 * Состояние оружия: патроны, перезарядка, темп стрельбы, разброс, отдача.
 */
import { HEAD_MUL } from '../data/weapons.js';

export class WeaponState {
  constructor(def) {
    this.def = def;
    this.ammo = def.mag === Infinity ? Infinity : def.mag;
    this.reserve = def.reserve === Infinity ? Infinity : def.reserve;
    this.nextShot = 0;
    this.reloading = false;
    this.reloadEnd = 0;
    this.reloadStart = 0;
    this.recoilAccum = 0;
    this.shotsInBurst = 0;
    this.lastShotAt = -99;
  }

  get magSize() { return this.def.mag === Infinity ? Infinity : this.def.mag; }

  interval(mods = {}) {
    const rpm = this.def.rpm * (mods.fireRate || 1);
    return 60 / rpm;
  }

  canFire(time) {
    if (this.reloading) return false;
    if (time < this.nextShot) return false;
    return true;
  }

  needsReload() {
    return this.ammo <= 0 && this.reserve > 0 && this.def.mag !== Infinity;
  }

  /** Начать перезарядку. Возвращает длительность или 0, если нельзя. */
  startReload(time, mods = {}, extraSpeed = 1) {
    if (this.reloading) return 0;
    if (this.def.mag === Infinity) return 0;
    if (this.ammo >= this.magSize) return 0;
    if (this.reserve <= 0) return 0;
    const dur = Math.max(0.35, this.def.reload * (mods.reloadSpeed || 1) * extraSpeed);
    this.reloading = true;
    this.reloadStart = time;
    this.reloadEnd = time + dur;
    return dur;
  }

  finishReload() {
    if (!this.reloading) return;
    const need = this.magSize - this.ammo;
    const take = this.reserve === Infinity ? need : Math.min(need, this.reserve);
    this.ammo += take;
    if (this.reserve !== Infinity) this.reserve -= take;
    this.reloading = false;
  }

  update(time) {
    if (this.reloading && time >= this.reloadEnd) this.finishReload();
    // затухание накопленной отдачи
    this.recoilAccum = Math.max(0, this.recoilAccum - (time - (this._lastUpdate ?? time)) * 3.2);
    this._lastUpdate = time;
  }

  consume(mods = {}) {
    if (this.ammo !== Infinity) this.ammo--;
    this.recoilAccum = Math.min(6, this.recoilAccum + this.def.recoil * 0.32);
    this.shotsInBurst++;
  }

  cycle(time, mods = {}) {
    this.nextShot = time + this.interval(mods);
    this.lastShotAt = time;
  }

  resetBurst() { this.shotsInBurst = 0; }

  /** Текущий разброс в градусах. */
  spread(moveFactor = 0, airborne = false, crouch = false, ads = false, mods = {}, itemSpread = 1) {
    const d = this.def;
    let s = d.spread;
    s += (d.moveSpread || 0) * moveFactor;
    s += this.recoilAccum * 1.35;
    if (airborne) s += 3.4;
    if (crouch) s *= 0.72;
    if (ads) s *= 0.42;
    s *= (mods.spread || 1) * itemSpread;
    return Math.max(0.02, s);
  }
}

export function headMultiplier(def, mods = {}) {
  return (HEAD_MUL[def.cls] || 2) * (mods.headshot || 1);
}

/** Разброс направления внутри конуса. */
export function applySpread(dir, spreadDeg, rand = Math.random) {
  if (spreadDeg <= 0.0001) return dir;
  const rad = (spreadDeg * Math.PI) / 180;
  // равномерно по диску
  const r = rad * Math.sqrt(rand());
  const theta = rand() * Math.PI * 2;
  // ортонормальный базис
  const up = Math.abs(dir.y) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const rx = up.y * dir.z - up.z * dir.y;
  const ry = up.z * dir.x - up.x * dir.z;
  const rz = up.x * dir.y - up.y * dir.x;
  const rl = Math.hypot(rx, ry, rz) || 1;
  const bx = rx / rl, by = ry / rl, bz = rz / rl;
  const cx = by * dir.z - bz * dir.y;
  const cy = bz * dir.x - bx * dir.z;
  const cz = bx * dir.y - by * dir.x;
  const dx = dir.x + (bx * Math.cos(theta) + cx * Math.sin(theta)) * r;
  const dy = dir.y + (by * Math.cos(theta) + cy * Math.sin(theta)) * r;
  const dz = dir.z + (bz * Math.cos(theta) + cz * Math.sin(theta)) * r;
  const l = Math.hypot(dx, dy, dz) || 1;
  return { x: dx / l, y: dy / l, z: dz / l };
}
