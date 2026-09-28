/**
 * Простая AABB-физика (движение со скольжением, шаг по ступенькам) + трассировка лучей.
 * Уровни собираются только из боксов — это быстро и предсказуемо.
 */
import * as THREE from 'three';

const EPS = 1e-4;

export class Physics {
  /** Сколько коллайдеров зарегистрировано. */
  get count() { return this.boxes.length; }
  constructor() {
    this.boxes = [];        // {min:Vector3, max:Vector3, meta:{solid, material, tag}}
    this.bounds = { min: -200, max: 200, top: 200 };
  }

  addBox(min, max, meta = {}) {
    const box = {
      min: new THREE.Vector3(Math.min(min.x, max.x), Math.min(min.y, max.y), Math.min(min.z, max.z)),
      max: new THREE.Vector3(Math.max(min.x, max.x), Math.max(min.y, max.y), Math.max(min.z, max.z)),
      meta: { solid: true, material: 'concrete', tag: 'wall', ...meta },
    };
    this.boxes.push(box);
    return box;
  }

  /** Тело актора как AABB. */
  actorBox(pos, radius, height) {
    return {
      min: new THREE.Vector3(pos.x - radius, pos.y, pos.z - radius),
      max: new THREE.Vector3(pos.x + radius, pos.y + height, pos.z + radius),
    };
  }

  overlaps(a, b) {
    return a.min.x < b.max.x - EPS && a.max.x > b.min.x + EPS &&
      a.min.y < b.max.y - EPS && a.max.y > b.min.y + EPS &&
      a.min.z < b.max.z - EPS && a.max.z > b.min.z + EPS;
  }

  /** Проверка «есть ли препятствие в позиции». */
  blocked(pos, radius, height, ignoreTags = []) {
    const b = this.actorBox(pos, radius, height);
    for (const box of this.boxes) {
      if (!box.meta.solid) continue;
      if (ignoreTags.includes(box.meta.tag)) continue;
      if (this.overlaps(b, box)) return box;
    }
    return null;
  }

  /**
   * Движение со скольжением по осям. pos изменяется на месте.
   * stepHeight — максимальная высота, на которую актор может «зашагнуть».
   */
  moveActor(actor, dx, dy, dz, stepHeight = 0.42) {
    const { pos, radius, height } = actor;
    let landedOn = null;
    let blockedXZ = false;

    // --- X ---
    if (dx !== 0) {
      const before = pos.clone();
      pos.x += dx;
      const hit = this.blocked(pos, radius, height);
      if (hit) {
        if (this._tryStep(actor, hit, stepHeight)) {
          // поднялись на ступеньку
        } else {
          pos.copy(before);
          const step = this._stepUp(actor, Math.sign(dx), 0, stepHeight);
          if (!step) blockedXZ = true;
        }
      }
    }

    // --- Z ---
    if (dz !== 0) {
      const before = pos.clone();
      pos.z += dz;
      const hit = this.blocked(pos, radius, height);
      if (hit) {
        if (this._tryStep(actor, hit, stepHeight)) {
          // ок
        } else {
          pos.copy(before);
          const step = this._stepUp(actor, 0, Math.sign(dz), stepHeight);
          if (!step) blockedXZ = true;
        }
      }
    }

    // --- Y ---
    const prevY = pos.y;
    pos.y += dy;
    const vHit = this.blocked(pos, radius, height);
    if (vHit) {
      if (dy <= 0) {
        pos.y = vHit.max.y + EPS;
        landedOn = vHit;
        if (actor.velY !== undefined) actor.velY = 0;
        actor.onGround = true;
      } else {
        pos.y = prevY;
        if (actor.velY !== undefined) actor.velY = 0;
      }
    } else if (pos.y <= 0.0005) {
      pos.y = 0;
      if (actor.velY !== undefined && actor.velY <= 0) actor.velY = 0;
      actor.onGround = true;
    } else if (dy < 0) {
      actor.onGround = false;
    }
    actor.blockedXZ = blockedXZ;
    return { landedOn, blockedXZ };
  }

  /** Пытается подняться на верх препятствия, если это ступенька. */
  _tryStep(actor, hit, stepHeight) {
    const { pos } = actor;
    const rise = hit.max.y - pos.y;
    if (rise <= 0 || rise > stepHeight) return false;
    const test = pos.clone();
    test.y = hit.max.y + EPS;
    if (this.blocked(test, actor.radius, actor.height)) return false;
    pos.y = test.y;
    actor.onGround = true;
    return true;
  }

  _stepUp(actor, sx, sz, stepHeight) {
    const { pos } = actor;
    const test = pos.clone();
    test.y += stepHeight;
    if (this.blocked(test, actor.radius, actor.height)) return false;
    const ahead = test.clone();
    ahead.x += sx * 0.12;
    ahead.z += sz * 0.12;
    if (this.blocked(ahead, actor.radius, actor.height)) return false;
    // есть ли под нами опора?
    const ground = ahead.clone();
    ground.y -= stepHeight + 0.02;
    const support = this.blocked(ground, actor.radius, 0.06);
    if (support) {
      pos.copy(ahead);
      pos.y = support.max.y + EPS;
      actor.onGround = true;
      return true;
    }
    return false;
  }

  /**
   * Трассировка луча по боксам (slab method).
   * Возвращает {dist, point, normal, box} или null.
   */
  raycast(origin, dir, maxDist = 200, ignoreTags = []) {
    let best = null;
    const o = [origin.x, origin.y, origin.z];
    const d = [dir.x, dir.y, dir.z];
    const inv = [1 / (d[0] || 1e-9), 1 / (d[1] || 1e-9), 1 / (d[2] || 1e-9)];

    for (const box of this.boxes) {
      if (!box.meta.solid) continue;
      if (ignoreTags.length && ignoreTags.includes(box.meta.tag)) continue;
      const mn = [box.min.x, box.min.y, box.min.z];
      const mx = [box.max.x, box.max.y, box.max.z];
      let tmin = -Infinity, tmax = Infinity, axis = -1, normalSign = 0;

      for (let i = 0; i < 3; i++) {
        let t1 = (mn[i] - o[i]) * inv[i];
        let t2 = (mx[i] - o[i]) * inv[i];
        let near = Math.min(t1, t2);
        let far = Math.max(t1, t2);
        if (near > tmin) {
          tmin = near;
          axis = i;
          // если ближе плоскость min — нормаль смотрит против направления луча
          normalSign = (t1 <= t2 ? -1 : 1) * Math.sign(d[i] || 1);
        }
        if (far < tmax) tmax = far;
        if (tmin > tmax) break;
      }
      if (tmin > tmax || tmax < 0 || tmin > maxDist) continue;
      const t = tmin < 0 ? 0 : tmin;
      if (!best || t < best.dist) {
        const point = new THREE.Vector3(o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t);
        const normal = new THREE.Vector3();
        if (axis >= 0) normal.setComponent(axis, normalSign); else normal.set(0, 1, 0);
        best = { dist: t, point, normal, box };
      }
    }
    return best;
  }

  /** Есть ли прямая видимость между точками (по окружению). */
  lineOfSight(a, b, ignoreTags = []) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const dist = dir.length();
    if (dist < 1e-4) return true;
    dir.divideScalar(dist);
    const hit = this.raycast(a, dir, dist - 0.05, ignoreTags);
    return !hit;
  }

  /** Высота пола под точкой (для снарядов/гранат). */
  floorAt(x, z, fromY = 60) {
    const origin = new THREE.Vector3(x, fromY, z);
    const hit = this.raycast(origin, new THREE.Vector3(0, -1, 0), 200);
    return hit ? hit.point.y : 0;
  }
}
