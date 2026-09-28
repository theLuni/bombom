/**
 * Магазин раунда (покупка за кредиты внутри забега — как в CS, но с RPG-лутом).
 */
export const SHOP_GEAR = [
  { id: 'armor', name: 'Бронежилет + шлем', price: 650, icon: '🛡️', desc: '+100 брони (гасит 50% урона)' },
  { id: 'medkit', name: 'Аптечка', price: 950, icon: '💊', desc: 'Мгновенно +50 здоровья (макс. 150)' },
  { id: 'defusekit', name: 'Набор сапёра', price: 450, icon: '🔧', desc: 'Разминирование в 2 раза быстрее' },
  { id: 'ammo', name: 'Полный боезапас', price: 150, icon: '📦', desc: 'Восстанавливает патроны всего арсенала' },
  { id: 'nade_he', name: 'Осколочная граната', price: 300, icon: '💥', desc: 'Урон 90 в радиусе, осколки через стены' },
  { id: 'nade_smoke', name: 'Дымовая граната', price: 300, icon: '🌫️', desc: 'Плотная завеса на 18 сек — рвёт линию огня ботов' },
  { id: 'nade_flash', name: 'Слепящая граната', price: 200, icon: '⚡', desc: 'Ослепляет врагов на 3.5 сек' },
  { id: 'nade_fire', name: 'Зажигательная', price: 500, icon: '🔥', desc: 'Лужа огня: 22 урона/сек, держит проход' },
  { id: 'nade_decoy', name: 'Ложная цель', price: 100, icon: '📢', desc: 'Отвлекает ботов звуком на 12 сек' },
];

export const GEAR_BY_ID = Object.fromEntries(SHOP_GEAR.map((g) => [g.id, g]));

export const ROUND_REWARD = 3200;     // за победу в раунде
export const ROUND_LOSS_REWARD = 1600; // утешительные
export const KILL_REWARD = 350;
export const HEADSHOT_BONUS = 120;
export const PLANT_REWARD = 400;
export const DEFUSE_REWARD = 450;
export const XP_KILL = 34;
export const XP_HEADSHOT = 20;
export const XP_ROUND_WIN = 140;
export const XP_ROUND_LOSS = 60;
export const XP_PLANT = 45;
export const XP_DEFUSE = 55;
