/**
 * Мета-прогрессия: уровень, опыт, навыки, статистика, настройки (localStorage).
 */
const KEY = 'bombom_meta_v2';

export function defaultMeta() {
  return {
    version: 2,
    level: 1,
    xp: 0,
    skillPoints: 2,
    skills: {},
    stats: { kills: 0, headshots: 0, deaths: 0, rounds: 0, roundsWon: 0, runs: 0, levelUps: 0, bestRound: 0 },
    settings: { sensitivity: 1, volume: 0.7, fov: 90, shadows: true, quality: 'high' },
  };
}

export function loadMeta() {
  const def = defaultMeta();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return def;
    const parsed = JSON.parse(raw);
    return {
      ...def,
      ...parsed,
      stats: { ...def.stats, ...(parsed.stats || {}) },
      settings: { ...def.settings, ...(parsed.settings || {}) },
      skills: { ...(parsed.skills || {}) },
    };
  } catch (e) {
    console.warn('Не удалось загрузить прогресс:', e);
    return def;
  }
}

export function saveMeta(meta) {
  try {
    localStorage.setItem(KEY, JSON.stringify(meta));
  } catch (e) {
    // приватный режим / нет доступа — просто работаем без сохранения
  }
}

export function resetMeta() {
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
}
