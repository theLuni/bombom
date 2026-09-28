/**
 * Планировка карты «de_БОМБОМ».
 * Сетка 20x20 клеток по 4 метра (80x80 метров), тайловый формат — легко правится и проверяется тестами.
 *
 * Легенда:
 *   #  стена (бетон, 5 м)          =  низкая стена (1.2 м, стрелять поверх)
 *   .  пол                         C  деревянный ящик (1.35 м, можно запрыгнуть)
 *   B  бочка (1.1 м)               T  морской контейнер (3.6 м, полное укрытие)
 *   A  зона закладки A             X  зона закладки B
 *   p  спавн игрока (CT)           e  спавн врагов (T)
 */
export const CELL = 4;
export const MAP_SIZE = 80;
export const ORIGIN = { x: -40, z: -40 };

export const TILE_MAP = [
  '####################', // r0  (z -40..-36)
  '#..................#', // r1  спавн CT
  '#......p....p......#', // r2  спавн игрока
  '#..C.....C.....C...#', // r3  укрытия на спавне CT
  '##..#...#..#...#..##', // r4  разделитель (проходы: полосы, комнаты, мид)
  '##..#.C.#..#.C.#..##', // r5  западный/восточный «склад»
  '##.....B#..#B.....##', // r6  двери складов
  '##..#.C.#..#.C.#..##', // r7  подход к точкам
  '##...XXX....AAA...##', // r8  ТОЧКА B (запад) и ТОЧКА A (восток)
  '##..#XCX.T..ACA#..##', // r9  точки + контейнер в миде
  '##..#####..#####..##', // r10 северные стены точек
  '##..#.C.#C.#.C.#..##', // r11 полосы + мид
  '##....B......B....##', // r12 общий холл (фланг)
  '##..#.T.#..#.T.#..##', // r13 полосы + контейнеры
  '##..#...#..#...#..##', // r14 разделитель у спавна T
  '#..................#', // r15 спавн T
  '#..C...........C...#', // r16 укрытия на спавне T
  '#....e.e..e.e.e....#', // r17 спавны врагов
  '#..................#', // r18
  '####################', // r19 (z 36..40)
];

export const SPAWN_TILE_PLAYER = 'p';
export const SPAWN_TILE_ENEMY = 'e';
export const SITE_TILES = { A: 'A', B: 'X' };

export const TILE_META = {
  '#': { type: 'wall', h: 5, mat: 'concrete', tag: 'wall' },
  '=': { type: 'box', h: 1.2, mat: 'concrete', tag: 'lowwall' },
  C: { type: 'box', h: 1.35, mat: 'crate', tag: 'crate', size: 3.2 },
  B: { type: 'barrel', h: 1.15, mat: 'metal', tag: 'barrel' },
  T: { type: 'box', h: 3.6, mat: 'container', tag: 'container', size: 3.8 },
};

export function cellCenter(col, row) {
  return { x: ORIGIN.x + col * CELL + CELL / 2, z: ORIGIN.z + row * CELL + CELL / 2 };
}

export function tileAt(col, row) {
  if (row < 0 || row >= TILE_MAP.length) return '#';
  const r = TILE_MAP[row];
  if (col < 0 || col >= r.length) return '#';
  return r[col];
}

export function rows() { return TILE_MAP.length; }
export function cols() { return TILE_MAP[0].length; }

export function validate() {
  const c = cols();
  TILE_MAP.forEach((r, i) => {
    if (r.length !== c) throw new Error(`Строка ${i} карты имеет длину ${r.length}, ожидалось ${c}`);
  });
  return true;
}

/** Точки спавна по типу тайла. */
export function spawnPoints(tile) {
  const out = [];
  for (let r = 0; r < rows(); r++) {
    for (let c = 0; c < cols(); c++) {
      if (tileAt(c, r) === tile) {
        const p = cellCenter(c, r);
        out.push({ x: p.x, z: p.z });
      }
    }
  }
  return out;
}

/** Зоны закладки (центр + радиус) по тайлам A/X. */
export function siteZones() {
  const zones = {};
  for (const [id, tile] of Object.entries(SITE_TILES)) {
    const cells = [];
    for (let r = 0; r < rows(); r++) {
      for (let c = 0; c < cols(); c++) if (tileAt(c, r) === tile) cells.push({ c, r });
    }
    if (!cells.length) continue;
    const cx = cells.reduce((s, p) => s + p.c, 0) / cells.length;
    const cz = cells.reduce((s, p) => s + p.r, 0) / cells.length;
    const center = cellCenter(cx, cz);
    const radius = Math.max(...cells.map((p) => Math.hypot(p.c - cx, p.r - cz))) * CELL + CELL * 0.9;
    zones[id] = { id, center, radius, cells };
  }
  return zones;
}

/**
 * Прямоугольники стен/объектов: жадное слияние клеток одного типа.
 * Возвращает список {tile, x, z, w, d, h, mat, tag, collide}.
 */
export function layoutSpecs() {
  validate();
  const R = rows(), C = cols();
  const used = new Uint8Array(R * C);
  const specs = [];
  const at = (c, r) => tileAt(c, r);

  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      const t = at(c, r);
      if (!TILE_META[t]) continue;
      if (used[r * C + c]) continue;
      // расширяем по X
      let w = 1;
      while (c + w < C && at(c + w, r) === t && !used[r * C + c + w]) w++;
      // расширяем по Z, если весь отрезок совпадает
      let d = 1;
      let canGrow = true;
      while (r + d < R && canGrow) {
        for (let k = 0; k < w; k++) {
          if (at(c + k, r + d) !== t || used[(r + d) * C + c + k]) { canGrow = false; break; }
        }
        if (canGrow) d++;
      }
      for (let dz = 0; dz < d; dz++) for (let dx = 0; dx < w; dx++) used[(r + dz) * C + c + dx] = 1;

      const meta = TILE_META[t];
      const center = cellCenter(c + (w - 1) / 2, r + (d - 1) / 2);
      const outer = r === 0 || r === R - 1 || c === 0 || c === C - 1;
      specs.push({
        tile: t,
        x: center.x,
        z: center.z,
        w: w * CELL,
        d: d * CELL,
        h: outer && t === '#' ? 11 : meta.h,
        mat: meta.mat,
        tag: meta.tag,
        collide: true,
      });
    }
  }
  return specs;
}

/** Полный список препятствий для физики/навигации (без визуала). */
export function collisionSpecs() {
  return layoutSpecs().filter((s) => s.collide);
}

export const MAP_META = {
  name: 'de_БОМБОМ',
  size: MAP_SIZE,
  sites: ['A', 'B'],
};
