/**
 * Арсенал. Классы оружия влияют на разброс, отдачу, бронепробитие и точность ботов.
 */
export const HEAD_MUL = { pistol: 2.6, smg: 1.9, rifle: 2.0, shotgun: 1.25, sniper: 2.4, knife: 1.0 };

export const RARITY_NAMES = { common: 'обычное', rare: 'редкое', epic: 'эпическое', legend: 'легендарное' };

export const WEAPONS = {
  knife: {
    id: 'knife', name: 'Боевой нож', cls: 'knife', slot: 3, rarity: 'common', price: 0, unlock: 1,
    dmg: 58, rpm: 130, auto: false, mag: Infinity, reserve: Infinity, reload: 0,
    spread: 0, moveSpread: 0, range: 2.3, falloff: 1, pellets: 1, armorPen: 0.9,
    moveSpeedMul: 1.06, recoil: 0.4, buildStyle: 'knife',
    desc: 'Тихо, быстро, без патронов. В спину — смертельно.',
  },
  pistol_std: {
    id: 'pistol_std', name: 'Удар-9', cls: 'pistol', slot: 2, rarity: 'common', price: 0, unlock: 1,
    dmg: 27, rpm: 420, auto: false, mag: 20, reserve: 100, reload: 1.5,
    spread: 0.6, moveSpread: 2.2, range: 26, falloff: 0.62, pellets: 1, armorPen: 0.42,
    moveSpeedMul: 1.03, recoil: 1.0, buildStyle: 'pistol',
    desc: 'Стартовый пистолет. Никогда не подводит — и никогда не удивляет.',
  },
  pistol_deagle: {
    id: 'pistol_deagle', name: 'Магнум-50', cls: 'pistol', slot: 2, rarity: 'rare', price: 950, unlock: 1,
    dmg: 63, rpm: 240, auto: false, mag: 7, reserve: 35, reload: 2.15,
    spread: 1.3, moveSpread: 5.4, range: 34, falloff: 0.7, pellets: 1, armorPen: 0.72,
    moveSpeedMul: 1.0, recoil: 2.4, buildStyle: 'deagle',
    desc: 'Один выстрел — минус голова. Награда за терпение.',
  },
  pistol_revolver: {
    id: 'pistol_revolver', name: 'Кольт «Ангел»', cls: 'pistol', slot: 2, rarity: 'epic', price: 2600, unlock: 5,
    dmg: 82, rpm: 170, auto: false, mag: 6, reserve: 30, reload: 2.5,
    spread: 0.9, moveSpread: 4.6, range: 40, falloff: 0.78, pellets: 1, armorPen: 0.82,
    moveSpeedMul: 1.01, recoil: 2.8, buildStyle: 'revolver',
    desc: 'Ковбойский аргумент. Пробивает и броню, и самоуверенность.',
  },
  smg_mp5: {
    id: 'smg_mp5', name: 'Шершень-5', cls: 'smg', slot: 1, rarity: 'rare', price: 1650, unlock: 2,
    dmg: 25, rpm: 760, auto: true, mag: 30, reserve: 150, reload: 1.85,
    spread: 0.72, moveSpread: 1.1, range: 26, falloff: 0.6, pellets: 1, armorPen: 0.35,
    moveSpeedMul: 1.0, recoil: 1.1, buildStyle: 'smg',
    desc: 'Дешёвый улей. Поливает свинцом в упор и в дыму.',
  },
  smg_p90: {
    id: 'smg_p90', name: 'Стикс-90', cls: 'smg', slot: 1, rarity: 'epic', price: 2950, unlock: 4,
    dmg: 22, rpm: 920, auto: true, mag: 50, reserve: 200, reload: 2.35,
    spread: 0.6, moveSpread: 1.35, range: 30, falloff: 0.65, pellets: 1, armorPen: 0.48,
    moveSpeedMul: 1.0, recoil: 1.0, buildStyle: 'p90',
    desc: 'Пятьдесят патронов на недовольных. Идеально для рывка.',
  },
  smg_vector: {
    id: 'smg_vector', name: 'Вектор-45', cls: 'smg', slot: 1, rarity: 'legend', price: 3700, unlock: 8,
    dmg: 29, rpm: 1120, auto: true, mag: 25, reserve: 175, reload: 1.7,
    spread: 0.58, moveSpread: 1.2, range: 28, falloff: 0.68, pellets: 1, armorPen: 0.5,
    moveSpeedMul: 1.02, recoil: 0.9, buildStyle: 'vector',
    desc: 'Машина для переработки врагов в статистику.',
  },
  rifle_ak: {
    id: 'rifle_ak', name: 'АКМ-47', cls: 'rifle', slot: 1, rarity: 'rare', price: 2750, unlock: 1,
    dmg: 37, rpm: 610, auto: true, mag: 30, reserve: 150, reload: 2.4,
    spread: 0.55, moveSpread: 3.6, range: 42, falloff: 0.78, pellets: 1, armorPen: 0.72,
    moveSpeedMul: 0.96, recoil: 1.9, buildStyle: 'ak',
    desc: 'Легенда. Три пули в грудь — и вопрос закрыт.',
  },
  rifle_m4: {
    id: 'rifle_m4', name: 'М4-Кобра', cls: 'rifle', slot: 1, rarity: 'rare', price: 3100, unlock: 2,
    dmg: 33, rpm: 680, auto: true, mag: 30, reserve: 180, reload: 2.15,
    spread: 0.42, moveSpread: 3.0, range: 46, falloff: 0.8, pellets: 1, armorPen: 0.68,
    moveSpeedMul: 0.98, recoil: 1.35, buildStyle: 'm4',
    desc: 'Стабильная точность. Для тех, кто стреляет, а не молится.',
  },
  rifle_aug: {
    id: 'rifle_aug', name: 'Авгур-77', cls: 'rifle', slot: 1, rarity: 'epic', price: 3950, unlock: 6,
    dmg: 34, rpm: 720, auto: true, mag: 30, reserve: 180, reload: 2.3,
    spread: 0.4, moveSpread: 2.6, range: 50, falloff: 0.84, pellets: 1, armorPen: 0.7,
    moveSpeedMul: 0.97, recoil: 1.3, buildStyle: 'aug', adsZoom: 1.7,
    desc: 'Встроенная оптика: прицельный огонь на средней дистанции.',
  },
  rifle_scar: {
    id: 'rifle_scar', name: 'Скарабей-17', cls: 'rifle', slot: 1, rarity: 'epic', price: 4500, unlock: 7,
    dmg: 45, rpm: 520, auto: true, mag: 25, reserve: 150, reload: 2.55,
    spread: 0.5, moveSpread: 3.4, range: 48, falloff: 0.82, pellets: 1, armorPen: 0.78,
    moveSpeedMul: 0.95, recoil: 2.1, buildStyle: 'scar',
    desc: 'Тяжёлый калибр. Два попадания — и ты уже собираешь лут.',
  },
  sniper_awm: {
    id: 'sniper_awm', name: 'Дальний-АВМ', cls: 'sniper', slot: 1, rarity: 'legend', price: 5300, unlock: 9,
    dmg: 148, rpm: 46, auto: false, mag: 5, reserve: 30, reload: 3.1,
    spread: 1.1, moveSpread: 9, range: 90, falloff: 0.95, pellets: 1, armorPen: 0.95,
    moveSpeedMul: 0.9, recoil: 3.2, buildStyle: 'awm', adsZoom: 3.0, boltAction: true,
    desc: 'Один патрон — одно удалённое из раунда тело.',
  },
  sniper_gauss: {
    id: 'sniper_gauss', name: 'Гаусс-Хищник', cls: 'sniper', slot: 1, rarity: 'legend', price: 12500, unlock: 14,
    dmg: 185, rpm: 42, auto: false, mag: 6, reserve: 36, reload: 3.4,
    spread: 0.35, moveSpread: 7, range: 130, falloff: 1.0, pellets: 1, armorPen: 1.0, pierce: 3,
    moveSpeedMul: 0.9, recoil: 2.6, buildStyle: 'gauss', adsZoom: 4.0, boltAction: true,
    desc: 'Рельсотрон. Прошивает трёх врагов и стену за ними.',
  },
  shotgun_pump: {
    id: 'shotgun_pump', name: 'Дробовик-12', cls: 'shotgun', slot: 1, rarity: 'rare', price: 2150, unlock: 3,
    dmg: 17, rpm: 78, auto: false, mag: 6, reserve: 40, reload: 3.0,
    spread: 4.6, moveSpread: 1.4, range: 15, falloff: 0.22, pellets: 9, armorPen: 0.2,
    moveSpeedMul: 0.98, recoil: 3.0, buildStyle: 'pump',
    desc: 'Ближний бой. В коридоре — король.',
  },
  shotgun_auto: {
    id: 'shotgun_auto', name: 'Авто-Дробовик-20', cls: 'shotgun', slot: 1, rarity: 'epic', price: 4900, unlock: 8,
    dmg: 15, rpm: 230, auto: true, mag: 10, reserve: 50, reload: 3.6,
    spread: 5.0, moveSpread: 1.6, range: 16, falloff: 0.26, pellets: 7, armorPen: 0.24,
    moveSpeedMul: 0.96, recoil: 2.4, buildStyle: 'auto_shotgun',
    desc: 'Мясорубка для узких коридоров и толп.',
  },
  shotgun_plasma: {
    id: 'shotgun_plasma', name: 'Плазма-разряд', cls: 'shotgun', slot: 1, rarity: 'legend', price: 9900, unlock: 12,
    dmg: 27, rpm: 95, auto: false, mag: 8, reserve: 48, reload: 3.2,
    spread: 3.4, moveSpread: 1.2, range: 22, falloff: 0.4, pellets: 6, armorPen: 0.6, explosive: 12,
    moveSpeedMul: 0.97, recoil: 2.6, buildStyle: 'plasma',
    desc: 'Сгустки перегретой плазмы. Взрываются при попадании.',
  },
  heavy_minigun: {
    id: 'heavy_minigun', name: 'Шквал-6', cls: 'rifle', slot: 1, rarity: 'legend', price: 15500, unlock: 16,
    dmg: 24, rpm: 1400, auto: true, mag: 120, reserve: 360, reload: 6.0,
    spread: 1.5, moveSpread: 5.6, range: 40, falloff: 0.7, pellets: 1, armorPen: 0.6,
    moveSpeedMul: 0.82, recoil: 2.6, buildStyle: 'minigun',
    desc: 'Ты не целишься. Ты просто перестаёшь оставлять пространство.',
  },
};

export const WEAPON_ORDER = Object.keys(WEAPONS);

export function weaponList() {
  return WEAPON_ORDER.map((id) => WEAPONS[id]);
}

export function classSpreadMul(cls) {
  return { pistol: 1, smg: 1, rifle: 1, shotgun: 1, sniper: 1, knife: 0 }[cls] ?? 1;
}

/** Оружие, доступное для покупки на данном уровне (мета-прогрессия). */
export function isUnlocked(weaponId, level) {
  const w = WEAPONS[weaponId];
  return !!w && level >= (w.unlock || 1);
}
