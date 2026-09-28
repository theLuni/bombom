/**
 * Дерево навыков RPG (мета-прогрессия): 3 ветки, по 6 навыков.
 * Каждый навык — до 5 уровней; эффекты складываются в "модификаторы" игрока.
 */
export const BRANCHES = [
  { id: 'assault', name: 'Штурм', icon: '🩸', color: '#ff8a5a' },
  { id: 'tech', name: 'Техника', icon: '⚙️', color: '#5ad0ff' },
  { id: 'scout', name: 'Разведка', icon: '🌀', color: '#7cff8f' },
];

export const SKILLS = [
  // ---- Штурм ----
  { id: 'damage', branch: 'assault', name: 'Сила выстрела', max: 5, icon: '💥',
    desc: (l) => `+${l * 4}% урона от всего оружия.`, tier: 1 },
  { id: 'armorPen', branch: 'assault', name: 'Бронебойные', max: 5, icon: '🎯',
    desc: (l) => `+${l * 6}% пробития брони.`, tier: 2, req: 'damage' },
  { id: 'headshot', branch: 'assault', name: 'В яблочко', max: 5, icon: '☠️',
    desc: (l) => `+${l * 8}% урона в голову.`, tier: 3, req: 'armorPen' },
  { id: 'fireRate', branch: 'assault', name: 'Скорый палец', max: 5, icon: '⚡',
    desc: (l) => `+${l * 3}% скорости стрельбы.`, tier: 3, req: 'armorPen' },
  { id: 'recoilCtrl', branch: 'assault', name: 'Контроль отдачи', max: 5, icon: '🫸',
    desc: (l) => `-${l * 9}% разброса и отдачи.`, tier: 4, req: 'fireRate' },
  { id: 'berserk', branch: 'assault', name: 'Ярость', max: 3, icon: '🔥',
    desc: (l) => `Убийство даёт +${l * 7}% урона на 5 сек (складывается до 5 раз).`, tier: 5, req: 'headshot' },

  // ---- Техника ----
  { id: 'vitality', branch: 'tech', name: 'Живучесть', max: 5, icon: '❤️',
    desc: (l) => `+${l * 10} максимального здоровья.`, tier: 1 },
  { id: 'survivor', branch: 'tech', name: 'Регенерация', max: 5, icon: '✚',
    desc: (l) => `Вне боя восстанавливает ${(l * 1.2).toFixed(1)} HP/сек.`, tier: 2, req: 'vitality' },
  { id: 'kevlar', branch: 'tech', name: 'Кевлар', max: 5, icon: '🛡️',
    desc: (l) => `Броня поглощает на ${l * 6}% больше урона и +${l * 8} стартовой брони.`, tier: 2, req: 'vitality' },
  { id: 'fastReload', branch: 'tech', name: 'Быстрая перезарядка', max: 5, icon: '🔄',
    desc: (l) => `-${l * 10}% времени перезарядки.`, tier: 3, req: 'kevlar' },
  { id: 'engineering', branch: 'tech', name: 'Инженерия', max: 5, icon: '🧨',
    desc: (l) => `+${l * 20}% урона гранат и +${l * 2}% скорости разминирования.`, tier: 4, req: 'fastReload' },
  { id: 'secondWind', branch: 'tech', name: 'Второе дыхание', max: 3, icon: '💠',
    desc: (l) => `Раз в раунд при смерти остаётся ${l * 20} HP вместо гибели.`, tier: 5, req: 'fastReload' },

  // ---- Разведка ----
  { id: 'speed', branch: 'scout', name: 'Легкие ноги', max: 5, icon: '🏃',
    desc: (l) => `+${l * 3}% скорости передвижения.`, tier: 1 },
  { id: 'agility', branch: 'scout', name: 'Акробатика', max: 5, icon: '🤸',
    desc: (l) => `+${l * 9}% высоты и скорости прыжка, меньше урона от падения.`, tier: 2, req: 'speed' },
  { id: 'stealth', branch: 'scout', name: 'Тихий шаг', max: 5, icon: '👣',
    desc: (l) => `-${l * 16}% радиуса шума для врагов.`, tier: 2, req: 'speed' },
  { id: 'dash', branch: 'scout', name: 'Рывок', max: 5, icon: '💨',
    desc: (l) => `Перезарядка рывка: ${(6.5 - l * 0.7).toFixed(1)} сек. Рывок даёт краткую неуязвимость.`, tier: 3, req: 'agility' },
  { id: 'medic', branch: 'scout', name: 'Аптечка', max: 5, icon: '🧰',
    desc: (l) => `Клавиша F лечит ${15 + l * 15} HP (перезарядка ${Math.max(6, 30 - l * 4)} сек).`, tier: 4, req: 'dash' },
  { id: 'ghost', branch: 'scout', name: 'Призрак', max: 3, icon: '👻',
    desc: (l) => `Боты замечают вас на ${l * 12}% позже; после убийства — 2 сек невидимости для их ИИ.`, tier: 5, req: 'stealth' },
];

export const SKILLS_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

export function xpForLevel(level) {
  return Math.round(120 + (level - 1) * 95 + Math.pow(level - 1, 2) * 14);
}

export function maxHealthForSkill(levels) {
  return 100 + (levels.vitality || 0) * 10;
}

/** Сводка модификаторов игрока из мета-навыков. */
export function buildModifiers(levels) {
  const L = (id) => levels[id] || 0;
  return {
    damage: 1 + L('damage') * 0.04,
    armorPen: L('armorPen') * 0.06,
    headshot: 1 + L('headshot') * 0.08,
    fireRate: 1 + L('fireRate') * 0.03,
    spread: 1 - L('recoilCtrl') * 0.09,
    berserk: L('berserk') * 0.07,
    maxHealth: maxHealthForSkill(levels),
    regen: L('survivor') * 1.2,
    kevlarArmor: L('kevlar') * 6,
    startArmor: L('kevlar') * 8,
    reloadSpeed: 1 - L('fastReload') * 0.1,
    grenadeDamage: 1 + L('engineering') * 0.2,
    defuseSpeed: 1 + L('engineering') * 0.02,
    secondWind: L('secondWind') * 20,
    moveSpeed: 1 + L('speed') * 0.03,
    jump: 1 + L('agility') * 0.09,
    noise: 1 - L('stealth') * 0.16,
    dashCooldown: 6.5 - L('dash') * 0.7,
    medicHeal: 15 + L('medic') * 15,
    medicCooldown: Math.max(6, 30 - L('medic') * 4),
    ghost: L('ghost') * 0.12,
  };
}
