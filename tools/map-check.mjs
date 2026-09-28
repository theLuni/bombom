/**
 * Проверка карты: геометрия, связность навигации, расстояния от спавнов до точек.
 * Запуск: node tools/map-check.mjs
 */
import { TILE_MAP, layoutSpecs, spawnPoints, siteZones, validate, CELL, ORIGIN, MAP_SIZE } from '../src/world/layout.js';
import { Physics } from '../src/core/physics.js';
import { NavGrid } from '../src/world/nav.js';
import * as THREE from 'three';

validate();
console.log('Размер карты:', TILE_MAP[0].length, 'x', TILE_MAP.length, 'клеток =', (TILE_MAP[0].length * CELL), 'x', (TILE_MAP.length * CELL), 'м');
console.log(TILE_MAP.join('\n'));

const stats = {};
for (const row of TILE_MAP) for (const ch of row) stats[ch] = (stats[ch] || 0) + 1;
console.log('Тайлы:', stats);

const physics = new Physics();
const specs = layoutSpecs();
for (const s of specs) {
  physics.addBox(
    new THREE.Vector3(s.x - s.w / 2, 0, s.z - s.d / 2),
    new THREE.Vector3(s.x + s.w / 2, s.h, s.z + s.d / 2),
    { material: 'wall', tag: s.tag }
  );
}
console.log('Коллайдеров:', physics.boxes.length, '(спеков:', specs.length + ')');

const nav = new NavGrid({ minX: ORIGIN.x + 1, maxX: ORIGIN.x + MAP_SIZE - 1, minZ: ORIGIN.z + 1, maxZ: ORIGIN.z + MAP_SIZE - 1 }, 2);
nav.build(physics);
let blockedCount = 0;
for (const b of nav.blocked) blockedCount += b;
console.log('Навигация:', nav.cols, 'x', nav.rows, 'занято клеток:', blockedCount, `(${((blockedCount / nav.blocked.length) * 100).toFixed(0)}%)`);

// визуализация проходимости
let art = '';
for (let r = 0; r < nav.rows; r++) {
  let line = '';
  for (let c = 0; c < nav.cols; c++) line += nav.blocked[nav.idx(c, r)] ? '█' : '·';
  art += line + '\n';
}
console.log(art);

const zones = siteZones();
console.log('Точки закладки:', Object.entries(zones).map(([id, z]) => `${id} @ (${z.center.x.toFixed(0)}, ${z.center.z.toFixed(0)}) r=${z.radius.toFixed(1)}`).join('  |  '));

const playerSpawns = spawnPoints('p');
const enemySpawns = spawnPoints('e');
console.log('Спавнов игрока:', playerSpawns.length, 'врагов:', enemySpawns.length);

let fails = 0;
for (const [id, zone] of Object.entries(zones)) {
  const target = new THREE.Vector3(zone.center.x, 0, zone.center.z);
  for (const s of playerSpawns) {
    const path = nav.path(new THREE.Vector3(s.x, 0, s.z), target);
    const len = path.reduce((acc, p, i) => acc + (i ? p.distanceTo(path[i - 1]) : 0), 0);
    if (!path.length) { console.log(`ОШИБКА: игрок ${s.x},${s.z} не может дойти до ${id}`); fails++; }
    else console.log(`Игрок (${s.x},${s.z}) -> точка ${id}: путь ${path.length} точек, ${len.toFixed(0)} м`);
  }
  for (const s of enemySpawns) {
    const path = nav.path(new THREE.Vector3(s.x, 0, s.z), target);
    const len = path.reduce((acc, p, i) => acc + (i ? p.distanceTo(path[i - 1]) : 0), 0);
    if (!path.length) { console.log(`ОШИБКА: враг ${s.x},${s.z} не может дойти до ${id}`); fails++; }
    else console.log(`Враг (${s.x},${s.z}) -> точка ${id}: путь ${path.length} точек, ${len.toFixed(0)} м`);
  }
}
// взаимная доступность спавнов
for (const a of playerSpawns) {
  for (const b of enemySpawns) {
    if (!nav.path(new THREE.Vector3(a.x, 0, a.z), new THREE.Vector3(b.x, 0, b.z)).length) {
      console.log(`ОШИБКА: нет пути со спавна CT (${a.x},${a.z}) на спавн T (${b.x},${b.z})`);
      fails++;
    }
  }
}
console.log(fails === 0 ? 'ОК: карта связная, все пути найдены' : `ПРОВАЛ: ${fails} проблем`);
process.exit(fails === 0 ? 0 : 1);
