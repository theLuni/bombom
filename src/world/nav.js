/**
 * Навигационная сетка для ботов: BFS-поля расстояний + следование по градиенту.
 */
import * as THREE from 'three';

export class NavGrid {
  constructor(bounds = { minX: -46, maxX: 46, minZ: -46, maxZ: 46 }, cell = 2) {
    this.bounds = bounds;
    this.cell = cell;
    this.cols = Math.ceil((bounds.maxX - bounds.minX) / cell);
    this.rows = Math.ceil((bounds.maxZ - bounds.minZ) / cell);
    this.blocked = new Uint8Array(this.cols * this.rows);
    this._cache = new Map();
  }

  idx(cx, cz) { return cz * this.cols + cx; }

  inBounds(cx, cz) { return cx >= 0 && cz >= 0 && cx < this.cols && cz < this.rows; }

  worldToCell(x, z) {
    return {
      cx: Math.min(this.cols - 1, Math.max(0, Math.floor((x - this.bounds.minX) / this.cell))),
      cz: Math.min(this.rows - 1, Math.max(0, Math.floor((z - this.bounds.minZ) / this.cell))),
    };
  }

  cellToWorld(cx, cz) {
    return {
      x: this.bounds.minX + (cx + 0.5) * this.cell,
      z: this.bounds.minZ + (cz + 0.5) * this.cell,
    };
  }

  /** Разметка проходимости по физическим коллайдерам. */
  build(physics) {
    const probe = new THREE.Vector3();
    for (let cz = 0; cz < this.rows; cz++) {
      for (let cx = 0; cx < this.cols; cx++) {
        const w = this.cellToWorld(cx, cz);
        probe.set(w.x, 0.06, w.z);
        // столбы и прочий мелкий декор не считаем препятствием: их можно обойти
        const hit = physics.blocked(probe, 0.55, 1.65, ['pole', 'decor']);
        this.blocked[this.idx(cx, cz)] = hit ? 1 : 0;
      }
    }
    this._cache.clear();
  }

  /** Ближайшая свободная клетка к точке (обход по расширяющемуся кольцу). */
  nearestFree(x, z, maxCells = 8) {
    const { cx, cz } = this.worldToCell(x, z);
    if (!this.blocked[this.idx(cx, cz)]) return { cx, cz };
    for (let r = 1; r <= maxCells; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const nx = cx + dx, nz = cz + dz;
          if (!this.inBounds(nx, nz)) continue;
          if (!this.blocked[this.idx(nx, nz)]) return { cx: nx, cz: nz };
        }
      }
    }
    return null;
  }

  /** Поле расстояний (в клетках) от целевой точки. */
  fieldFor(targetPos, maxDist = 400) {
    // если цель стоит на укрытии — считаем от ближайшей свободной клетки
    const t = this.nearestFree(targetPos.x, targetPos.z) || this.worldToCell(targetPos.x, targetPos.z);
    const key = this.idx(t.cx, t.cz);
    if (this._cache.has(key)) return this._cache.get(key);
    const field = new Float32Array(this.cols * this.rows).fill(Infinity);
    const queue = new Int32Array(this.cols * this.rows);
    let head = 0, tail = 0;
    const start = key;
    field[start] = 0;
    queue[tail++] = start;
    while (head < tail) {
      const cur = queue[head++];
      const cx = cur % this.cols;
      const cz = (cur / this.cols) | 0;
      const d = field[cur];
      if (d > maxDist) continue;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0) continue;
          const nx = cx + dx, nz = cz + dz;
          if (!this.inBounds(nx, nz)) continue;
          const ni = this.idx(nx, nz);
          if (this.blocked[ni]) continue;
          if (dx !== 0 && dz !== 0) {
            // не режем углы по диагонали
            if (this.blocked[this.idx(cx + dx, cz)] || this.blocked[this.idx(cx, cz + dz)]) continue;
          }
          const nd = d + (dx !== 0 && dz !== 0 ? 1.4142 : 1);
          if (nd < field[ni]) {
            field[ni] = nd;
            queue[tail++] = ni;
          }
        }
      }
    }
    if (this._cache.size > 24) this._cache.clear();
    this._cache.set(key, field);
    return field;
  }

  /** Путь (список точек) от from до to. */
  path(from, to, maxSteps = 400) {
    const field = this.fieldFor(to);
    let { cx, cz } = this.worldToCell(from.x, from.z);
    let cur = this.idx(cx, cz);
    if (this.blocked[cur] || !isFinite(field[cur])) {
      // ищем ближайшую свободную клетку
      let found = false;
      for (let r = 1; r <= 4 && !found; r++) {
        for (let dz = -r; dz <= r && !found; dz++) {
          for (let dx = -r; dx <= r && !found; dx++) {
            const nx = cx + dx, nz = cz + dz;
            if (!this.inBounds(nx, nz)) continue;
            const ni = this.idx(nx, nz);
            if (!this.blocked[ni] && isFinite(field[ni])) { cur = ni; found = true; }
          }
        }
      }
      if (!found) return [];
      cx = cur % this.cols; cz = (cur / this.cols) | 0;
    }
    const pts = [];
    let steps = 0;
    let d = field[cur];
    while (d > 0 && steps++ < maxSteps) {
      let bestIdx = -1, bestD = d;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0) continue;
          const nx = cx + dx, nz = cz + dz;
          if (!this.inBounds(nx, nz)) continue;
          const ni = this.idx(nx, nz);
          if (this.blocked[ni]) continue;
          if (dx !== 0 && dz !== 0 && (this.blocked[this.idx(cx + dx, cz)] || this.blocked[this.idx(cx, cz + dz)])) continue;
          if (field[ni] < bestD) { bestD = field[ni]; bestIdx = ni; }
        }
      }
      if (bestIdx < 0) break;
      cur = bestIdx;
      cx = cur % this.cols; cz = (cur / this.cols) | 0;
      const w = this.cellToWorld(cx, cz);
      // сглаживаем: точки только каждые 2 клетки
      if (steps % 2 === 0) pts.push(new THREE.Vector3(w.x, 0, w.z));
      d = bestD;
    }
    const end = new THREE.Vector3(to.x, 0, to.z);
    if (!pts.length || pts[pts.length - 1].distanceTo(end) > this.cell) pts.push(end);
    return pts;
  }

  /** Есть ли вообще путь до цели. */
  reachable(from, to) {
    const field = this.fieldFor(to);
    const { cx, cz } = this.worldToCell(from.x, from.z);
    return isFinite(field[this.idx(cx, cz)]);
  }

  /** Случайная свободная точка в радиусе от центра. */
  randomPointAround(center, radius, rng = Math.random, tries = 24) {
    for (let i = 0; i < tries; i++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * radius;
      const x = center.x + Math.cos(a) * r;
      const z = center.z + Math.sin(a) * r;
      const { cx, cz } = this.worldToCell(x, z);
      if (this.inBounds(cx, cz) && !this.blocked[this.idx(cx, cz)]) {
        const w = this.cellToWorld(cx, cz);
        return new THREE.Vector3(w.x, 0, w.z);
      }
    }
    return center.clone();
  }
}
