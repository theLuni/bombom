/**
 * Выпадающие предметы: аптечка, патроны, деньги. Подбираются при подходе.
 */
import * as THREE from 'three';
import { audio } from '../core/audio.js';
import { bus, EV } from '../core/bus.js';

const STYLE = {
  health: { color: 0x35d07a, label: '+35 HP', icon: '💊' },
  armor: { color: 0x4aa8ff, label: '+50 брони', icon: '🛡️' },
  ammo: { color: 0xffb02e, label: 'Боезапас', icon: '📦' },
  credits: { color: 0x9a6bff, label: 'Кредиты', icon: '💰' },
  grenade: { color: 0xff7a2e, label: 'Граната', icon: '💥' },
};

export class Pickup {
  constructor(game, type, pos, value = 0) {
    this.game = game;
    this.type = type;
    this.value = value;
    this.pos = new THREE.Vector3(pos.x, Math.max(0.4, pos.y + 0.35), pos.z);
    this.age = 0;
    this.done = false;
    const style = STYLE[type] || STYLE.health;
    this.group = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.34, 0.34),
      new THREE.MeshStandardMaterial({ color: style.color, emissive: style.color, emissiveIntensity: 0.55, roughness: 0.4, metalness: 0.3 })
    );
    core.castShadow = true;
    this.group.add(core);
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.9),
      new THREE.MeshBasicMaterial({ color: style.color, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = -0.2;
    this.group.add(halo);
    this.group.position.copy(this.pos);
    this.core = core;
    game.scene.add(this.group);
  }

  update(dt) {
    if (this.done) return;
    this.age += dt;
    this.core.position.y = Math.sin(this.age * 2.4) * 0.09;
    this.core.rotation.y += dt * 1.6;
    this.core.rotation.x += dt * 0.7;
    const p = this.game.player;
    if (!p.dead && this.pos.distanceTo(new THREE.Vector3(p.pos.x, this.pos.y, p.pos.z)) < 1.5) this.collect();
    if (this.age > 45) { this.done = true; this.dispose(); }
  }

  collect() {
    if (this.done) return;
    this.done = true;
    const g = this.game;
    const p = g.player;
    const style = STYLE[this.type];
    switch (this.type) {
      case 'health': p.heal(this.value || 35); break;
      case 'armor':
        p.armor = Math.min(100, p.armor + (this.value || 50));
        bus.emit(EV.STATE, { player: p });
        break;
      case 'ammo': p.refillAmmo(); break;
      case 'credits':
        g.run.credits += this.value || 250;
        bus.emit(EV.SCORE, { run: g.run });
        break;
      case 'grenade': {
        const t = ['he', 'smoke', 'flash'][Math.floor(Math.random() * 3)];
        p.grenades[t] = (p.grenades[t] || 0) + 1;
        bus.emit(EV.STATE, { player: p });
        break;
      }
    }
    audio.pickup(this.type === 'credits');
    bus.emit(EV.TOAST, { text: `${style.icon} Подобрано: ${style.label}`, kind: this.type === 'credits' ? 'epic' : 'plain' });
    this.dispose();
  }

  dispose() {
    this.game.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); }
    });
  }
}
