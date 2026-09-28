/**
 * RPG-лут: выпадает при повышении уровня. Редкость влияет на силу эффекта.
 * Временные эффекты живут в забеге; постоянные — до конца забега.
 */
export const RARITIES = [
  { id: 'common', name: 'Обычное', weight: 58, mul: 1.0, cls: 'common' },
  { id: 'rare', name: 'Редкое', weight: 27, mul: 1.5, cls: 'rare' },
  { id: 'epic', name: 'Эпическое', weight: 11, mul: 2.2, cls: 'epic' },
  { id: 'legend', name: 'Легендарное', weight: 4, mul: 3.2, cls: 'legend' },
];

export const RARITY_BY_ID = Object.fromEntries(RARITIES.map((r) => [r.id, r]));

/**
 * kind:
 *  heal      — мгновенно лечит
 *  timed     — временный бафф (buff: id, dur)
 *  permanent — на весь забег
 *  instant   — деньги / патроны / гранаты
 */
export const ITEMS = [
  { id: 'medkit', name: 'Полевая аптечка', icon: '💊', kind: 'heal', value: 35,
    desc: (v) => `Мгновенно восстанавливает ${v} HP.` },
  { id: 'regen', name: 'Нанорегенерация', icon: '🧬', kind: 'timed', buff: 'regen', dur: 16,
    desc: (v) => `Восстанавливает ${Math.round(v)} HP/сек в течение 16 секунд.` },
  { id: 'adrenaline', name: 'Адреналин', icon: '💉', kind: 'timed', buff: 'speed', dur: 45,
    desc: (v) => `+${Math.round(8 + v * 6)}% скорости на 45 секунд.` },
  { id: 'berserk', name: 'Ярость берсерка', icon: '🔥', kind: 'timed', buff: 'berserk', dur: 35,
    desc: (v) => `+${Math.round(12 + v * 10)}% урона на 35 секунд.` },
  { id: 'precision', name: 'Тактический прицел', icon: '🎯', kind: 'timed', buff: 'precise', dur: 60,
    desc: (v) => `+${Math.round(8 + v * 6)}% урона и -${Math.round(10 + v * 8)}% разброса на 60 секунд.` },
  { id: 'kevlar', name: 'Кевларовые вставки', icon: '🛡️', kind: 'instant', value: 60,
    desc: (v) => `+${Math.round(v)} брони.` },
  { id: 'hp', name: 'Титановая пластина', icon: '❤️', kind: 'permanent', value: 15,
    desc: (v) => `+${Math.round(v)} к максимальному здоровью на всю операцию.` },
  { id: 'reload', name: 'Быстросъёмные магазины', icon: '🔄', kind: 'permanent', value: 0.07,
    desc: (v) => `-${Math.round(v * 100)}% к времени перезарядки до конца операции.` },
  { id: 'ammo', name: 'Ящик патронов', icon: '📦', kind: 'instant', value: 1,
    desc: () => 'Полный боезапас всего арсенала + 2 гранаты.' },
  { id: 'nades', name: 'Подсумок гранат', icon: '🧨', kind: 'instant', value: 2,
    desc: () => '+2 осколочные гранаты и +1 дымовая.' },
  { id: 'credits', name: 'Найденный конверт', icon: '💰', kind: 'instant', value: 900,
    desc: (v) => `+$${Math.round(v)} кредитов.` },
  { id: 'dash', name: 'Экзо-ботинки', icon: '👟', kind: 'permanent', value: 0.12,
    desc: (v) => `-${Math.round(v * 100)}% к перезарядке рывка и +4% скорости.` },
  { id: 'crit', name: 'Критические ядра', icon: '⭐', kind: 'permanent', value: 0.05,
    desc: (v) => `+${Math.round(v * 100)}% к урону в голову.` },
  { id: 'lifesteal', name: 'Вампирский контур', icon: '🩸', kind: 'permanent', value: 0.04,
    desc: (v) => `Возвращает ${(v * 100).toFixed(1)}% нанесённого урона в здоровье.` },
  { id: 'xp', name: 'Флешка данных', icon: '💾', kind: 'permanent', value: 0.15,
    desc: (v) => `+${Math.round(v * 100)}% опыта до конца операции.` },
];

export function rollRarity(rng = Math.random) {
  const total = RARITIES.reduce((s, r) => s + r.weight, 0);
  let roll = rng() * total;
  for (const r of RARITIES) {
    roll -= r.weight;
    if (roll <= 0) return r;
  }
  return RARITIES[0];
}

/** Случайный лут: 1 предмет + редкость (иногда 2 предмета за уровень). */
export function rollLoot(rng = Math.random, count = 1) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const rarity = rollRarity(rng);
    const item = ITEMS[(rng() * ITEMS.length) | 0];
    out.push({ item, rarity, value: item.value * rarity.mul });
  }
  return out;
}
