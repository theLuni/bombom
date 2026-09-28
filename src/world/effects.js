/**
 * Визуальные эффекты: частицы, следы пуль, трассеры, дым, огонь, взрывы, вспышки.
 * Всё на пулах, чтобы не нагружать сборщик мусора.
 */
import * as THREE from 'three';

/* ------------------------- текстуры частиц ------------------------- */

export function softCircleTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, inner);
  g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function holeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);
  const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 17);
  g.addColorStop(0, 'rgba(10,8,6,0.95)');
  g.addColorStop(0.55, 'rgba(30,24,18,0.75)');
  g.addColorStop(1, 'rgba(60,50,40,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(32, 32, 22, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(220,215,205,0.28)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + Math.random();
    ctx.beginPath();
    ctx.moveTo(32 + Math.cos(a) * 8, 32 + Math.sin(a) * 8);
    ctx.lineTo(32 + Math.cos(a) * (16 + Math.random() * 9), 32 + Math.sin(a) * (16 + Math.random() * 9));
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function smokeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(228,228,228,0.95)');
  g.addColorStop(0.5, 'rgba(205,205,208,0.6)');
  g.addColorStop(1, 'rgba(190,190,195,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------- пул частиц ------------------------- */

class ParticlePool {
  constructor(scene, count, texture, additive) {
    this.count = count;
    this.cursor = 0;
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      side: THREE.DoubleSide,
      alphaTest: 0.002,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = count;
    scene.add(this.mesh);
    this.parts = new Array(count).fill(null).map(() => ({
      alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(),
      size: 1, sizeVel: 0, life: 0, maxLife: 1, color: new THREE.Color(1, 1, 1),
      gravity: 0, drag: 0, sticky: false, rot: 0, rotVel: 0,
    }));
    const c = new THREE.Color(1, 1, 1);
    for (let i = 0; i < count; i++) this.mesh.setColorAt(i, c);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  }

  spawn(opts) {
    const idx = this.cursor;
    this.cursor = (this.cursor + 1) % this.count;
    const p = this.parts[idx];
    p.alive = true;
    p.pos.copy(opts.pos);
    p.vel.copy(opts.vel || new THREE.Vector3());
    p.size = opts.size ?? 0.2;
    p.sizeVel = opts.sizeVel ?? 0;
    p.maxLife = opts.life ?? 0.6;
    p.life = p.maxLife;
    p.color.set(opts.color ?? 0xffffff);
    p.gravity = opts.gravity ?? 0;
    p.drag = opts.drag ?? 2.2;
    p.sticky = !!opts.sticky;
    p.rot = Math.random() * Math.PI * 2;
    p.rotVel = (Math.random() - 0.5) * 3;
    return p;
  }

  update(dt, camera) {
    const cam = camera;
    for (let i = 0; i < this.count; i++) {
      const p = this.parts[i];
      if (!p.alive) {
        this.mesh.setMatrixAt(i, this._hidden);
        continue;
      }
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        this.mesh.setMatrixAt(i, this._hidden);
        continue;
      }
      if (!p.sticky) {
        p.vel.y -= p.gravity * dt;
        const d = Math.max(0, 1 - p.drag * dt);
        p.vel.multiplyScalar(d);
        p.pos.addScaledVector(p.vel, dt);
      }
      p.size = Math.max(0.001, p.size + p.sizeVel * dt);
      p.rot += p.rotVel * dt;
      const t = p.life / p.maxLife;
      const scale = p.size * (0.35 + 0.65 * Math.min(1, t * 2.2));
      this._q.copy(cam.quaternion);
      this._s.set(scale, scale, scale);
      // поворот вокруг оси взгляда для «живости»
      const rz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), p.rot);
      this._q.multiply(rz);
      this._m.compose(p.pos, this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/* ------------------------- дым и огонь ------------------------- */

class SmokeVolume {
  constructor(scene, pos, duration, radius = 4.4) {
    this.pos = pos.clone();
    this.radius = radius;
    this.duration = duration;
    this.age = 0;
    this.done = false;
    this.group = new THREE.Group();
    const tex = smokeTexture();
    this.puffs = [];
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, side: THREE.DoubleSide, color: 0xdadadd })
      );
      m.userData.offset = new THREE.Vector3((Math.random() - 0.5) * radius * 0.8, Math.random() * radius * 0.55 - 0.4, (Math.random() - 0.5) * radius * 0.8);
      m.userData.spin = Math.random() * Math.PI * 2;
      m.userData.spinVel = (Math.random() - 0.5) * 0.5;
      m.userData.scale = radius * (0.9 + Math.random() * 0.55);
      this.group.add(m);
      this.puffs.push(m);
    }
    this.group.position.copy(pos);
    scene.add(this.group);
  }
  update(dt, camera) {
    this.age += dt;
    const grow = Math.min(1, this.age / 1.1);
    const fade = this.age > this.duration - 1.6 ? Math.max(0, (this.duration - this.age) / 1.6) : 1;
    for (const m of this.puffs) {
      m.quaternion.copy(camera.quaternion);
      m.rotateZ(m.userData.spin + this.age * m.userData.spinVel);
      const s = m.userData.scale * grow;
      m.scale.set(s, s, s);
      m.position.copy(m.userData.offset).multiplyScalar(0.85 + grow * 0.3);
      m.material.opacity = 0.62 * fade * grow;
    }
    if (this.age >= this.duration) this.done = true;
  }
  dispose(scene) {
    scene.remove(this.group);
    for (const m of this.puffs) { m.material.map?.dispose?.(); m.material.dispose(); m.geometry.dispose(); }
  }
  /** Плотность дыма между двумя точками (0..1). */
  densityBetween(a, b, samples = 6) {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    if (len < 0.1) return 0;
    const step = d.clone().divideScalar(len);
    let hits = 0;
    for (let i = 1; i < samples; i++) {
      const t = (i / samples) * len;
      const p = a.clone().addScaledVector(step, t);
      if (p.distanceTo(this.pos) < this.radius) hits++;
    }
    return hits / (samples - 1);
  }
}

class FireZone {
  constructor(scene, pos, duration = 9, radius = 2.7) {
    this.pos = pos.clone();
    this.radius = radius;
    this.duration = duration;
    this.age = 0;
    this.done = false;
    this.group = new THREE.Group();
    this.flames = [];
    const tex = softCircleTexture('rgba(255,225,140,1)', 'rgba(255,80,0,0)');
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 })
      );
      m.userData.phase = Math.random() * Math.PI * 2;
      m.userData.r = Math.random() * radius * 0.85;
      m.userData.a = Math.random() * Math.PI * 2;
      m.userData.s = 1.0 + Math.random() * 0.9;
      this.group.add(m);
      this.flames.push(m);
    }
    this.group.position.copy(pos);
    scene.add(this.group);
  }
  update(dt, camera) {
    this.age += dt;
    for (const m of this.flames) {
      m.quaternion.copy(camera.quaternion);
      const t = this.age * 6 + m.userData.phase;
      m.position.set(Math.cos(m.userData.a) * m.userData.r, 0.35 + Math.sin(t * 0.8) * 0.28, Math.sin(m.userData.a) * m.userData.r);
      const s = m.userData.s * (0.75 + Math.sin(t) * 0.22);
      m.scale.set(s, s * 1.35, s);
      m.material.opacity = Math.max(0, 0.85 - this.age * 0.03);
    }
    if (this.age >= this.duration) this.done = true;
  }
  dispose(scene) {
    scene.remove(this.group);
    for (const m of this.flames) { m.material.dispose(); m.geometry.dispose(); }
  }
  contains(p) {
    return Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < this.radius && p.y < this.pos.y + 2.4;
  }
}

/* ------------------------- менеджер эффектов ------------------------- */

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.sparks = new ParticlePool(scene, 420, softCircleTexture(), true);
    this.dust = new ParticlePool(scene, 200, softCircleTexture('rgba(210,200,180,0.9)', 'rgba(180,170,150,0)'), false);
    this.smokes = [];
    this.fires = [];
    this.tracers = [];
    this._tracerPool = [];
    this._lightPool = [];
    this._tracerMat = new THREE.MeshBasicMaterial({ color: 0xffd88a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    this._tracerGeo = new THREE.BoxGeometry(1, 0.035, 0.035);
    this._tracerGeo.translate(0.5, 0, 0);
    this._muzzleGeo = new THREE.PlaneGeometry(1, 1);
    this._muzzleTex = softCircleTexture('rgba(255,240,190,1)', 'rgba(255,140,40,0)');
    // следы от пуль
    this.decalMat = new THREE.MeshBasicMaterial({ map: holeTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, opacity: 0.9 });
    this.decals = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), this.decalMat, 90);
    this.decals.frustumCulled = false;
    this.decals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this._hide = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < 90; i++) this.decals.setMatrixAt(i, this._hide);
    this._decalCursor = 0;
    scene.add(this.decals);
    this._q = new THREE.Quaternion();
    this._up = new THREE.Vector3(0, 0, 1);
    this._xAxis = new THREE.Vector3(1, 0, 0);
    this._tmp = new THREE.Vector3();
    this.time = 0;
  }

  /** След от пули + пыль. */
  impact(point, normal, material = 'wall') {
    const q = new THREE.Quaternion().setFromUnitVectors(this._up, normal);
    const size = material === 'metal' ? 0.14 : 0.22;
    const m = new THREE.Matrix4();
    m.compose(
      this._tmp.copy(point).addScaledVector(normal, 0.012),
      q,
      new THREE.Vector3(size, size, size)
    );
    // случайный поворот в плоскости
    const spin = new THREE.Matrix4().makeRotationZ(Math.random() * Math.PI * 2);
    m.multiply(spin);
    this.decals.setMatrixAt(this._decalCursor, m);
    this.decals.instanceMatrix.needsUpdate = true;
    this._decalCursor = (this._decalCursor + 1) % 90;

    const color = material === 'metal' ? 0xffe6a8 : material === 'crate' ? 0xd8b98a : 0xd9d2c4;
    for (let i = 0; i < (material === 'metal' ? 8 : 5); i++) {
      const vel = normal.clone().multiplyScalar(1.6 + Math.random() * 2.4)
        .add(new THREE.Vector3((Math.random() - 0.5) * 2.6, (Math.random() - 0.5) * 2.6, (Math.random() - 0.5) * 2.6));
      this.sparks.spawn({
        pos: point, vel, size: 0.075 + Math.random() * 0.07, life: 0.22 + Math.random() * 0.22,
        color: material === 'metal' ? 0xffd070 : color, gravity: 7.5, drag: 3.4,
      });
    }
    for (let i = 0; i < 4; i++) {
      const vel = normal.clone().multiplyScalar(0.7 + Math.random() * 1.3)
        .add(new THREE.Vector3((Math.random() - 0.5) * 1.4, Math.random() * 1.2, (Math.random() - 0.5) * 1.4));
      this.dust.spawn({
        pos: point, vel, size: 0.5 + Math.random() * 0.5, sizeVel: 0.9, life: 0.5 + Math.random() * 0.4,
        color: color, drag: 2.4, gravity: 0.6,
      });
    }
  }

  blood(point, dir, amount = 5) {
    for (let i = 0; i < amount; i++) {
      const vel = dir.clone().multiplyScalar(1 + Math.random() * 3)
        .add(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3));
      this.dust.spawn({
        pos: point, vel, size: 0.16 + Math.random() * 0.2, sizeVel: 0.35, life: 0.45 + Math.random() * 0.35,
        color: 0x8e1010, gravity: 8, drag: 2.4,
      });
    }
  }

  tracer(from, to, color = 0xffd88a) {
    let mesh = this._tracerPool.find((t) => t.age > 0.075);
    if (!mesh) {
      if (this._tracerPool.length < 26) {
        mesh = new THREE.Mesh(this._tracerGeo, this._tracerMat.clone());
        this.scene.add(mesh);
        this._tracerPool.push(mesh);
      } else {
        mesh = this._tracerPool[0];
      }
    }
    mesh.position.copy(from);
    // геометрия трассера вытянута по +X, поэтому направляем ось X вдоль выстрела
    const dir = this._tmp.subVectors(to, from);
    const len = dir.length();
    if (len < 1e-4) return;
    dir.divideScalar(len);
    mesh.quaternion.setFromUnitVectors(this._xAxis, dir);
    mesh.scale.set(len, 1, 1);
    mesh.material.opacity = 0.9;
    mesh.material.color.set(color);
    mesh.age = 0;
    mesh.visible = true;
  }

  muzzleFlash(pos, dir, scale = 1) {
    for (let i = 0; i < 4; i++) {
      const vel = dir.clone().multiplyScalar(3 + Math.random() * 5)
        .add(new THREE.Vector3((Math.random() - 0.5) * 3.2, (Math.random() - 0.5) * 3.2, (Math.random() - 0.5) * 3.2));
      this.sparks.spawn({
        pos, vel, size: 0.14 * scale + Math.random() * 0.12, sizeVel: -0.25, life: 0.05 + Math.random() * 0.06,
        color: 0xffcf7a, drag: 1.2,
      });
    }
    this.dust.spawn({ pos, vel: dir.clone().multiplyScalar(1.4), size: 0.55 * scale, sizeVel: 2.6, life: 0.14, color: 0xd8cfae, drag: 1.4 });
    this.flash(pos, 0xffd08a, 1.6 * scale, 0.045);
  }

  flash(pos, color = 0xffffff, intensity = 2, life = 0.1) {
    let light = this._lightPool.find((l) => !l.userData.busy);
    if (!light) {
      if (this._lightPool.length >= 3) light = this._lightPool[0];
      else {
        light = new THREE.PointLight(color, 0, 22, 2);
        this.scene.add(light);
        this._lightPool.push(light);
      }
    }
    light.userData.busy = true;
    light.userData.until = this.time + life;
    light.userData.peak = intensity;
    light.position.copy(pos);
    light.color.set(color);
    light.intensity = intensity;
  }

  explode(pos, radius = 6, color = 0xffb45a) {
    for (let i = 0; i < 42; i++) {
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).normalize();
      const speed = 4 + Math.random() * 13;
      this.sparks.spawn({
        pos, vel: dir.multiplyScalar(speed), size: 0.2 + Math.random() * 0.35, sizeVel: -0.4,
        life: 0.3 + Math.random() * 0.75, color: i % 3 === 0 ? 0xfff0c0 : color, gravity: 9, drag: 1.9,
      });
    }
    for (let i = 0; i < 22; i++) {
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.6, Math.random() - 0.5).normalize();
      this.dust.spawn({
        pos, vel: dir.multiplyScalar(2 + Math.random() * 6), size: 1.4 + Math.random() * 1.6, sizeVel: 3.4,
        life: 0.9 + Math.random() * 0.9, color: 0x9a8f7a, gravity: 0.4, drag: 1.5,
      });
    }
    // сфера вспышки
    const geo = new THREE.SphereGeometry(1, 12, 10);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const sphere = new THREE.Mesh(geo, mat);
    sphere.position.copy(pos);
    sphere.scale.setScalar(0.6);
    this.scene.add(sphere);
    this._booms = this._booms || [];
    this._booms.push({ mesh: sphere, age: 0, radius });
    this.flash(pos, 0xffb060, 14, 0.32);
  }

  smoke(pos, duration = 18, radius = 4.4) {
    const s = new SmokeVolume(this.scene, new THREE.Vector3(pos.x, Math.max(0.4, pos.y), pos.z), duration, radius);
    this.smokes.push(s);
    return s;
  }

  fire(pos, duration = 9, radius = 2.7) {
    const f = new FireZone(this.scene, new THREE.Vector3(pos.x, Math.max(0, pos.y), pos.z), duration, radius);
    this.fires.push(f);
    return f;
  }

  /** Проверка: перекрывает ли дым линию огня. */
  smokeBlocked(a, b) {
    for (const s of this.smokes) {
      if (s.done) continue;
      if (s.age < 0.4 || s.age > s.duration - 0.6) continue;
      if (s.densityBetween(a, b) > 0.3) return true;
    }
    return false;
  }

  update(dt, camera) {
    this.time += dt;
    this.sparks.update(dt, camera);
    this.dust.update(dt, camera);
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i];
      s.update(dt, camera);
      if (s.done) { s.dispose(this.scene); this.smokes.splice(i, 1); }
    }
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.update(dt, camera);
      if (f.done) { f.dispose(this.scene); this.fires.splice(i, 1); }
    }
    for (const t of this._tracerPool) {
      if (t.age === undefined) continue;
      t.age += dt;
      t.material.opacity = Math.max(0, 0.9 - t.age * 11);
      if (t.material.opacity <= 0) t.visible = false;
    }
    if (this._booms) {
      for (let i = this._booms.length - 1; i >= 0; i--) {
        const b = this._booms[i];
        b.age += dt;
        const t = b.age / 0.4;
        b.mesh.scale.setScalar(0.6 + t * b.radius * 0.75);
        b.mesh.material.opacity = Math.max(0, 0.9 * (1 - t));
        if (t >= 1) {
          this.scene.remove(b.mesh);
          b.mesh.geometry.dispose();
          b.mesh.material.dispose();
          this._booms.splice(i, 1);
        }
      }
    }
    for (const l of this._lightPool) {
      if (l.userData.busy && this.time > l.userData.until) {
        l.userData.busy = false;
        l.intensity = 0;
      } else if (l.userData.busy) {
        const k = Math.max(0, (l.userData.until - this.time) / 0.09);
        l.intensity = l.userData.peak * Math.min(1, k);
      }
    }
  }

  /** Огонь, который наносит урон в точке (для геймплея). */
  fireDamageAt(pos) {
    for (const f of this.fires) {
      if (!f.done && f.contains(pos)) return true;
    }
    return false;
  }

  reset() {
    for (const s of this.smokes) s.dispose(this.scene);
    for (const f of this.fires) f.dispose(this.scene);
    this.smokes.length = 0;
    this.fires.length = 0;
    for (const p of this.sparks.parts) p.alive = false;
    for (const p of this.dust.parts) p.alive = false;
    for (const t of this._tracerPool) { t.age = 1; t.visible = false; }
    for (let i = 0; i < 90; i++) this.decals.setMatrixAt(i, this._hide);
    this.decals.instanceMatrix.needsUpdate = true;
  }
}
