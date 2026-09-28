/**
 * Гранаты: физика полёта, отскоки, эффекты (урон, дым, слепота, огонь, ложная цель).
 */
import * as THREE from 'three';
import { audio } from '../core/audio.js';
import { bus, EV } from '../core/bus.js';
import { applyExplosion } from './combat.js';

const COLORS = { he: 0x3f4a35, smoke: 0x6a6c70, flash: 0xb9b39c, fire: 0x8c3a1e, decoy: 0x4a5a7a };

export class Grenade {
  constructor(game, type, pos, vel, owner) {
    this.game = game;
    this.type = type;
    this.owner = owner;
    this.pos = pos.clone();
    this.vel = vel.clone();
    this.radius = 0.09;
    this.fuse = { he: 1.7, flash: 1.35, smoke: 1.4, fire: 1.5, decoy: 12 }[type] ?? 2;
    this.age = 0;
    this.done = false;
    this.resting = false;
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.085, 12, 10),
      new THREE.MeshStandardMaterial({ color: COLORS[type] || 0x3f4a35, roughness: 0.6, metalness: 0.5 })
    );
    this.mesh.castShadow = true;
    this.mesh.position.copy(this.pos);
    game.scene.add(this.mesh);
    this.spin = new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    this.decoyTimer = 0;
  }

  explode() {
    const g = this.game;
    // 'GRENADE' как «команда» — взрыв задевает всех, включая владельца
    const ctx = g.combatContext(this.owner || null, 'GRENADE');
    const dmg = 96 * (g.mods.grenadeDamage || 1);
    audio.explosion(0, this.pos.x, this.pos.z);
    g.engine.addShake(1.2 / (1 + this.pos.distanceTo(g.player.pos) * 0.06));
    g.effects.explode(this.pos, 7, 0xffb45a);
    applyExplosion(ctx, this.pos, 7, dmg, { dmg: dmg }, 1.6, this.owner);
    g.emitNoise(this.pos.x, this.pos.z, 65, 'explosion');
    if (this.type === 'flash') {
      g.flashAt(this.pos);
      g.effects.explode(this.pos, 2.5, 0xffffff);
    }
    this.done = true;
  }

  landing() {
    const g = this.game;
    if (this.type === 'smoke') {
      g.effects.smoke(this.pos, 18, 4.4);
      audio.hit('wall', 0);
      this.done = true;
    } else if (this.type === 'fire') {
      g.effects.fire(this.pos, 10, 2.8);
      audio.explosion(0, this.pos.x, this.pos.z);
      g.effects.explode(this.pos, 3, 0xff7a2e);
      this.done = true;
    } else if (this.type === 'he') {
      this.explode();
    } else if (this.type === 'flash') {
      this.explode();
    } else if (this.type === 'decoy') {
      this.resting = true;
    }
  }

  update(dt) {
    if (this.done) return;
    this.age += dt;
    const g = this.game;

    if (!this.resting) {
      this.vel.y -= 17 * dt;
      const step = this.vel.clone().multiplyScalar(dt);
      const dist = step.length();
      if (dist > 0.0001) {
        const dir = step.clone().divideScalar(dist);
        const hit = g.physics.raycast(this.pos, dir, dist + this.radius, []);
        if (hit && hit.dist <= dist + this.radius) {
          // отскок
          this.pos.copy(hit.point).addScaledVector(dir, -this.radius * 1.02);
          const n = hit.normal;
          const dot = this.vel.dot(n);
          this.vel.addScaledVector(n, -1.55 * dot);
          this.vel.multiplyScalar(0.55);
          const speed = this.vel.length();
          if (speed < 1.4) {
            this.vel.set(0, 0, 0);
            this.landing();
          } else {
            audio.hit(hit.box.meta.material === 'metal' ? 'metal' : 'wall', this.pos.distanceTo(g.player.pos), this.pos.x, this.pos.z);
          }
        } else {
          this.pos.add(step);
        }
      }
      if (this.pos.y < 0.08) {
        this.pos.y = 0.08;
        this.vel.y = Math.abs(this.vel.y) * 0.35;
        this.vel.x *= 0.6;
        this.vel.z *= 0.6;
        if (Math.abs(this.vel.y) < 1 && Math.hypot(this.vel.x, this.vel.z) < 1.2) {
          this.vel.set(0, 0, 0);
          this.landing();
        }
      }
    }

    if (this.type === 'decoy') {
      this.decoyTimer -= dt;
      if (this.decoyTimer <= 0) {
        this.decoyTimer = 1.1 + Math.random() * 0.6;
        g.emitNoise(this.pos.x, this.pos.z, 55, 'shot');
        audio.shot('pistol', this.pos.distanceTo(g.player.pos), this.pos.x, this.pos.z);
      }
    } else if (!this.done && this.age > this.fuse) {
      this.explode();
    }

    this.mesh.position.copy(this.pos);
    this.mesh.rotation.x += this.spin.x * dt;
    this.mesh.rotation.y += this.spin.y * dt;
    this.mesh.rotation.z += this.spin.z * dt;
    if (this.type === 'he' && !this.done && this.age > this.fuse - 0.9) {
      const k = Math.sin(this.age * 30) > 0 ? 1.5 : 1;
      this.mesh.material.emissive = new THREE.Color(0xff2a2a).multiplyScalar(k * 0.4);
    }
    if (this.type === 'decoy' && this.age > this.fuse) this.done = true;
  }

  dispose() {
    this.game.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
