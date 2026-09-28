/**
 * Разрешение выстрелов: попадания в хитбоксы, урон, броня, пробитие, эффекты.
 */
import * as THREE from 'three';
import { headMultiplier } from '../weapons/weapon.js';

const _v = new THREE.Vector3();

/** Хитбоксы актора (голова/корпус/ноги) в мировых координатах. */
export function actorHitboxes(actor) {
  const scale = actor.scale || 1;
  const crouch = !!actor.crouch;
  const eye = (crouch ? 1.18 : 1.62) * scale;
  const p = actor.pos;
  return {
    head: { type: 'sphere', c: [p.x, p.y + eye, p.z], r: 0.185 * scale },
    body: {
      type: 'box',
      min: [p.x - 0.3 * scale, p.y + 0.92 * scale, p.z - 0.24 * scale],
      max: [p.x + 0.3 * scale, p.y + eye - 0.12, p.z + 0.24 * scale],
    },
    legs: {
      type: 'box',
      min: [p.x - 0.26 * scale, p.y, p.z - 0.22 * scale],
      max: [p.x + 0.26 * scale, p.y + 0.92 * scale, p.z + 0.22 * scale],
    },
  };
}

function raySphere(ox, oy, oz, dx, dy, dz, c, r) {
  const lx = ox - c[0], ly = oy - c[1], lz = oz - c[2];
  const b = lx * dx + ly * dy + lz * dz;
  const cc = lx * lx + ly * ly + lz * lz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : (-b + Math.sqrt(disc) >= 0 ? 0 : -1);
}

function rayBox(ox, oy, oz, dx, dy, dz, min, max) {
  let tmin = -Infinity, tmax = Infinity;
  const o = [ox, oy, oz], d = [dx, dy, dz];
  for (let i = 0; i < 3; i++) {
    const inv = 1 / (d[i] || 1e-9);
    let t1 = (min[i] - o[i]) * inv;
    let t2 = (max[i] - o[i]) * inv;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  if (tmax < 0) return -1;
  return tmin >= 0 ? tmin : 0;
}

/** Ближайшее попадание луча в актора. */
export function rayActor(origin, dir, actor, maxDist = 200) {
  const hb = actorHitboxes(actor);
  const hits = [];
  const tHead = raySphere(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, hb.head.c, hb.head.r);
  if (tHead >= 0 && tHead <= maxDist) hits.push({ t: tHead, zone: 'head' });
  const tBody = rayBox(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, hb.body.min, hb.body.max);
  if (tBody >= 0 && tBody <= maxDist) hits.push({ t: tBody, zone: 'body' });
  const tLegs = rayBox(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, hb.legs.min, hb.legs.max);
  if (tLegs >= 0 && tLegs <= maxDist) hits.push({ t: tLegs, zone: 'legs' });
  if (!hits.length) return null;
  hits.sort((a, b) => a.t - b.t);
  return hits[0];
}

/**
 * Расчёт урона с учётом дистанции, зоны, брони и модификаторов стрелка.
 */
export function computeDamage({ weapon, zone, dist, mods = {}, target }) {
  let dmg = weapon.dmg;
  if (weapon.range && dist > weapon.range) dmg *= (weapon.falloff ?? 0.6);
  if (zone === 'head') dmg *= headMultiplier(weapon, mods);
  else if (zone === 'legs') dmg *= 0.72;
  dmg *= (mods.damage || 1);
  let armorAbsorbed = 0;
  if (target.armor > 0 && zone !== 'legs') {
    const pen = Math.min(1, (weapon.armorPen || 0) + (mods.armorPen || 0));
    const absorbFactor = Math.min(0.85, 0.5 * (1 - pen) + (mods.kevlarArmor || 0) / 100);
    armorAbsorbed = dmg * absorbFactor;
    dmg -= armorAbsorbed;
  }
  return { damage: Math.max(1, dmg), armorDamage: armorAbsorbed * 1.8 };
}

/**
 * Полное разрешение выстрела.
 * ctx: { physics, effects, actors, shooter, isPlayer, applyDamage(hit), ignoreActor }
 */
export function resolveShot(ctx, origin, dir, options = {}) {
  const {
    weapon, spread = 0, mods = {}, maxDist = 220, pierce = 0,
    applySpreadFn, tracerColor = 0xffd88a, showTracer = true, ignore = null,
    explosionRadius = 0, explosiveDamage = 0, audio = null, distForAudio = 0,
  } = options;

  let d = { x: dir.x, y: dir.y, z: dir.z };
  if (spread > 0 && applySpreadFn) d = applySpreadFn(d, spread);

  const o = new THREE.Vector3(origin.x, origin.y, origin.z);
  const dvec = new THREE.Vector3(d.x, d.y, d.z).normalize();

  let remainingPierce = pierce;
  let travelled = 0;
  const results = [];
  let endPoint = o.clone().addScaledVector(dvec, maxDist);

  for (let iter = 0; iter < 8; iter++) {
    const envHit = ctx.physics.raycast(o, dvec, maxDist - travelled);
    const envDist = envHit ? envHit.dist : Infinity;

    let bestActor = null, bestT = Infinity, bestZone = null;
    for (const actor of ctx.actors) {
      if (!actor || actor.dead || actor === ignore) continue;
      if (actor.team && ctx.shooterTeam && actor.team === ctx.shooterTeam && !ctx.friendlyFire) continue;
      const hit = rayActor(o, dvec, actor, Math.min(envDist, maxDist - travelled));
      if (hit && hit.t < bestT) { bestT = hit.t; bestActor = actor; bestZone = hit.zone; }
    }

    if (bestActor && bestT <= envDist) {
      const point = o.clone().addScaledVector(dvec, bestT);
      results.push({ actor: bestActor, zone: bestZone, point, dist: travelled + bestT });
      ctx.onActorHit(bestActor, bestZone, point, travelled + bestT, weapon);
      if (remainingPierce > 0 && bestActor.team && ctx.shooterTeam) {
        remainingPierce--;
        o.copy(point).addScaledVector(dvec, 0.05);
        travelled += bestT + 0.05;
        continue;
      }
      endPoint = point;
      break;
    } else if (envHit) {
      endPoint = envHit.point.clone();
      ctx.effects.impact(envHit.point, envHit.normal, envHit.box.meta.material);
      if (audio) audio.hit(envHit.box.meta.material, distForAudio, envHit.point.x, envHit.point.z);
      break;
    } else {
      endPoint = o.clone().addScaledVector(dvec, maxDist - travelled);
      break;
    }
  }

  if (showTracer) ctx.effects.tracer(o.clone().set(origin.x, origin.y, origin.z), endPoint, tracerColor);
  if (explosionRadius > 0) {
    ctx.effects.explode(endPoint, explosionRadius, 0xffb45a);
    ctx.applySplash(endPoint, explosionRadius, explosiveDamage, weapon);
  }
  return { endPoint, results };
}

/** Урон по площади с проверкой прямой видимости. */
export function applyExplosion(ctx, center, radius, damage, weapon = null, falloffPower = 1.6, ownerActor = null) {
  const victims = [];
  for (const actor of ctx.actors) {
    if (!actor || actor.dead) continue;
    const d = _v.set(actor.pos.x, actor.pos.y + 0.9, actor.pos.z).distanceTo(center);
    if (d > radius) continue;
    const eye = new THREE.Vector3(actor.pos.x, actor.pos.y + 1.4, actor.pos.z);
    const blocked = !ctx.physics.lineOfSight(center, eye);
    const scale = blocked ? 0.35 : 1;
    // собственный взрыв задевает владельца слабее (как в CS)
    const selfMul = ownerActor && actor === ownerActor ? 0.55 : 1;
    const dmg = damage * Math.pow(1 - d / radius, falloffPower) * scale * selfMul;
    if (dmg <= 1) continue;
    victims.push({ actor, damage: dmg, dist: d });
  }
  victims.sort((a, b) => a.dist - b.dist);
  for (const v of victims) {
    ctx.onActorHit(v.actor, 'body', new THREE.Vector3(v.actor.pos.x, v.actor.pos.y + 1, v.actor.pos.z), v.dist, weapon, { splash: true, damageOverride: v.damage });
  }
  return victims;
}
