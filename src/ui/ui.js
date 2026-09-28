/**
 * Интерфейс: HUD, миникарта, меню, магазин, дерево навыков, лут, итоги.
 */
import { bus, EV } from '../core/bus.js';
import { audio } from '../core/audio.js';
import { WEAPONS, RARITY_NAMES, weaponList } from '../data/weapons.js';
import { BRANCHES, SKILLS, xpForLevel } from '../data/skills.js';
import { SHOP_GEAR } from '../data/shop.js';
import { RARITY_BY_ID } from '../data/items.js';
import { TILE_MAP, rows, cols } from '../world/layout.js';
import { resetMeta } from '../meta.js';
import * as THREE from 'three';

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

export class UI {
  constructor(game, input, canvas) {
    this.game = game;
    this.input = input;
    this.canvas = canvas;
    this.root = document.getElementById('ui');
    this.overlays = {};
    this.activeOverlay = null;
    this.toastTimers = [];
    this.buildHud();
    this.buildMenu();
    this.bind();
    this.lastState = 'menu';
    this.flashUntil = 0;
    this.blindUntil = 0;
    this.showMenu();
  }

  /* ==================== построение DOM ==================== */

  buildHud() {
    const hud = el('div');
    hud.id = 'hud';

    // верхняя панель счёта
    const top = el('div', 'hud-top');
    this.elCtScore = this.block(top, 'ct', 'вы · жизни', '❤️ 3');
    this.elTimer = this.block(top, 'timer', 'раунд', '2:15');
    this.elTScore = this.block(top, 't', 'врагов на карте', '2');
    hud.appendChild(top);

    this.elObjective = el('div', 'objective');
    hud.appendChild(this.elObjective);
    this.elBombTimer = el('div', 'bomb-timer');
    this.elBombTimer.style.display = 'none';
    hud.appendChild(this.elBombTimer);
    this.elRoundFlash = el('div', 'round-flash');
    hud.appendChild(this.elRoundFlash);

    // миникарта
    const mmWrap = el('div', 'minimap-wrap');
    this.minimap = el('canvas');
    this.mmSize = 196;
    this.minimap.width = this.mmSize;
    this.minimap.height = this.mmSize;
    mmWrap.appendChild(this.minimap);
    mmWrap.appendChild(el('div', 'minimap-title', 'DE_БОМБОМ'));
    hud.appendChild(mmWrap);

    this.killfeed = el('div', 'killfeed');
    hud.appendChild(this.killfeed);

    // центр
    this.crosshair = el('div', 'crosshair');
    this.chLines = [];
    for (const dir of ['up', 'down', 'left', 'right']) {
      const line = el('div', `ch-line ${dir === 'up' || dir === 'down' ? 'v' : 'h'}`);
      this.crosshair.appendChild(line);
      this.chLines.push({ dir, line });
    }
    this.crosshair.appendChild(el('div', 'ch-dot'));
    hud.appendChild(this.crosshair);

    this.hitmarker = el('div', 'hitmarker', '<i></i><i></i><i></i><i></i>');
    hud.appendChild(this.hitmarker);

    this.dmgLayer = el('div', 'dmg-layer');
    hud.appendChild(this.dmgLayer);
    this.vignette = el('div', 'vignette');
    hud.appendChild(this.vignette);
    this.dmgFlash = el('div', 'dmg-flash');
    hud.appendChild(this.dmgFlash);
    this.scope = el('div', 'scope');
    hud.appendChild(this.scope);

    this.prompt = el('div', 'prompt');
    this.prompt.style.display = 'none';
    this.promptText = el('div', 't', '');
    this.promptBar = el('div', 'progress-mini', '<i></i>');
    this.prompt.appendChild(this.promptText);
    this.prompt.appendChild(this.promptBar);
    hud.appendChild(this.prompt);

    this.toasts = el('div', 'toasts');
    hud.appendChild(this.toasts);

    // низ слева — здоровье/броня/способности
    const bl = el('div', 'hud-bl');
    const hpBar = el('div', 'bar', '<span class="hp-fill"></span><div class="txt">100 HP</div>');
    this.hpFill = hpBar.querySelector('.hp-fill');
    this.hpTxt = hpBar.querySelector('.txt');
    const armorBar = el('div', 'bar', '<span class="armor-fill"></span><div class="txt">0 БР</div>');
    this.armorFill = armorBar.querySelector('.armor-fill');
    this.armorTxt = armorBar.querySelector('.txt');
    bl.appendChild(hpBar);
    bl.appendChild(armorBar);
    this.abilityRow = el('div', 'ability-row');
    bl.appendChild(this.abilityRow);
    hud.appendChild(bl);

    // низ справа — оружие
    const br = el('div', 'hud-br');
    this.elAmmo = el('div', 'ammo', '20 <span class="res">/ 100</span>');
    this.elWName = el('div', 'wname', '—');
    this.elWVariant = el('div', 'wvariant', '');
    this.elGrenades = el('div', 'grenade-info', '');
    br.appendChild(this.elAmmo);
    br.appendChild(this.elWName);
    br.appendChild(this.elWVariant);
    br.appendChild(this.elGrenades);
    hud.appendChild(br);

    // низ центр — уровень/опыт/кредиты
    const bc = el('div', 'hud-bc');
    const xpWrap = el('div', 'xp-wrap');
    this.elLevel = el('div', 'lvl-badge', '<b>1</b><small>LVL</small>');
    const xpBarWrap = el('div', 'col grow');
    const xpBar = el('div', 'bar xp-bar', '<span class="xp-fill"></span><div class="txt"></div>');
    this.xpFill = xpBar.querySelector('.xp-fill');
    this.xpTxt = xpBar.querySelector('.txt');
    this.elPoints = el('div', 'points-hint', '');
    xpBarWrap.appendChild(xpBar);
    xpBarWrap.appendChild(this.elPoints);
    this.elCredits = el('div', 'credits', '0');
    xpWrap.appendChild(this.elLevel);
    xpWrap.appendChild(xpBarWrap);
    xpWrap.appendChild(this.elCredits);
    bc.appendChild(xpWrap);
    hud.appendChild(bc);

    this.root.appendChild(hud);
    this.hud = hud;
  }

  block(parent, cls, label, value) {
    const b = el('div', `block ${cls}`);
    const v = el('div', 'v', value);
    b.appendChild(v);
    b.appendChild(el('div', 'l', label));
    parent.appendChild(b);
    return v;
  }

  buildMenu() {
    const menu = el('div', '');
    menu.id = 'menu';
    const wrap = el('div', 'menu-wrap');

    const logo = el('div', 'logo');
    logo.appendChild(el('h1', '', 'BOMBOM'));
    logo.appendChild(el('div', 'sub', '3D тактический шутер · CS2-стиль + RPG'));
    wrap.appendChild(logo);

    const grid = el('div', 'menu-grid');
    // левая колонка — кнопки
    const left = el('div', 'card panel');
    left.appendChild(el('h3', '', 'Операция'));
    const actions = el('div', 'menu-actions');
    this.btnStart = el('button', 'btn primary', 'Начать операцию');
    this.btnSkills = el('button', 'btn', 'Прокачка (RPG)');
    this.btnArsenal = el('button', 'btn', 'Арсенал');
    this.btnControls = el('button', 'btn ghost', 'Управление');
    this.btnSettings = el('button', 'btn ghost', 'Настройки');
    this.btnReset = el('button', 'btn ghost', 'Сбросить прогресс');
    for (const b of [this.btnStart, this.btnSkills, this.btnArsenal, this.btnControls, this.btnSettings, this.btnReset]) {
      actions.appendChild(b);
    }
    left.appendChild(actions);
    left.appendChild(el('div', 'small-note', 'Цель: не дать террористам взорвать бомбу и пройти как можно больше раундов. Смерть завершает операцию, но опыт и навыки остаются навсегда.'));
    grid.appendChild(left);

    // правая колонка — статистика и управление
    const right = el('div', 'card panel');
    right.appendChild(el('h3', '', 'Профиль'));
    this.elMenuStats = el('div');
    right.appendChild(this.elMenuStats);
    right.appendChild(el('h3', '', 'Управление'));
    const keys = el('div', 'keys-grid');
    const keyRows = [
      ['WASD', 'движение'], ['Мышь', 'обзор'], ['ЛКМ', 'огонь'], ['ПКМ', 'прицел (оптика)'],
      ['R', 'перезарядка'], ['Shift', 'рывок'], ['Ctrl', 'присесть'], ['Space', 'прыжок'],
      ['F', 'аптечка'], ['E', 'разминирование'], ['1/2/3', 'оружие'], ['4-7', 'гранаты'],
      ['G', 'бросить гранату'], ['B', 'магазин'], ['Tab', 'отчёт'], ['Esc', 'пауза'],
    ];
    for (const [k, v] of keyRows) {
      const row = el('div');
      row.appendChild(el('span', '', v));
      row.appendChild(el('span', '', `<span class="kbd">${k}</span>`));
      keys.appendChild(row);
    }
    right.appendChild(keys);
    grid.appendChild(right);

    wrap.appendChild(grid);
    menu.appendChild(wrap);
    this.root.appendChild(menu);
    this.menu = menu;

    // оверлеи
    this.overlayHost = el('div');
    this.overlayHost.style.position = 'absolute';
    this.overlayHost.style.inset = '0';
    this.root.appendChild(this.overlayHost);

    this.hitmarkerTimer = 0;
    this.lootOverlay = null;
  }

  /* ==================== события ==================== */

  bind() {
    const g = this.game;

    this.btnStart.onclick = () => {
      audio.init(); audio.resume(); audio.click();
      this.hideMenu();
      g.startRun();
      this.input.requestLock();
    };
    this.btnSkills.onclick = () => { audio.click(); this.openSkillTree(); };
    this.btnArsenal.onclick = () => { audio.click(); this.openArsenal(); };
    this.btnControls.onclick = () => { audio.click(); this.openControls(); };
    this.btnSettings.onclick = () => { audio.click(); this.openSettings(); };
    this.btnReset.onclick = () => {
      if (confirm('Сбросить весь прогресс (уровень, навыки, статистику)?')) {
        resetMeta();
        location.reload();
      }
    };

    bus.on(EV.HIT, (d) => this.onHit(d));
    bus.on(EV.KILL, (d) => this.onKill(d));
    bus.on(EV.BOT_DEATH, (d) => this.onBotDeathFeed(d));
    bus.on(EV.TOAST, (d) => this.toast(d.text, d.kind));
    bus.on(EV.LEVEL_UP, (d) => this.onLevelUp(d));
    bus.on(EV.LOOT, (d) => this.onLoot(d));
    bus.on(EV.FLASH, (d) => this.onFlash(d));
    bus.on(EV.DAMAGE_TAKEN, (d) => this.onDamage(d));
    bus.on(EV.PROMPT, (d) => this.onPrompt(d));
    bus.on(EV.BOMB, (d) => this.onBomb(d));
    bus.on(EV.ROUND_START, (d) => this.onRoundStart(d));
    bus.on(EV.ROUND_END, (d) => this.onRoundEnd(d));
    bus.on(EV.GAME_OVER, (d) => this.onGameOver(d));
    bus.on(EV.OBJECTIVE, (d) => {
      this.elObjective.textContent = d.text || '';
      // раунд начался — закрываем магазин, чтобы игрок не стоял в меню под огнём
      if (this.activeOverlay === 'buy' && this.game.state === 'live') this.closeOverlay();
    });
    bus.on(EV.STATE, () => this.refreshPersistent());

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        if (this.activeOverlay && this.activeOverlay !== 'pause') this.closeOverlay();
        else if (this.game.state !== 'idle') this.togglePause();
      }
      if (e.code === 'Tab' && this.game.state !== 'idle') { e.preventDefault(); this.toggleStats(); }
      if (e.code === 'KeyB' && this.game.state !== 'idle') this.toggleBuy();
      if (e.code === 'KeyP' && this.game.state !== 'idle') this.openSkillTree();
      if (this.lootOptions) {
        if (e.code === 'Digit1') this.game.chooseLoot(0);
        if (e.code === 'Digit2') this.game.chooseLoot(1);
        if (e.code === 'Digit3') this.game.chooseLoot(2);
      }
    });
  }

  /* ==================== HUD-события ==================== */

  onHit(d) {
    this.hitmarker.classList.remove('show');
    void this.hitmarker.offsetWidth;
    this.hitmarker.classList.add('show');
    if (d.zone === 'head' || d.killed) this.hitmarker.classList.add('fatal');
    else this.hitmarker.classList.remove('fatal');
    const num = el('div', `dmg-num ${d.zone === 'head' ? 'head' : ''} ${d.killed ? 'crit' : ''}`, `${d.damage}`);
    num.style.left = `${Math.max(20, Math.min(window.innerWidth - 60, d.x + (Math.random() - 0.5) * 40))}px`;
    num.style.top = `${Math.max(20, Math.min(window.innerHeight - 60, d.y + (Math.random() - 0.5) * 30))}px`;
    this.dmgLayer.appendChild(num);
    setTimeout(() => num.remove(), 900);
  }

  onKill(d) {
    if (d.headshot) {
      this.elRoundFlash.textContent = 'Headshot!';
      this.elRoundFlash.style.color = '#ff6b6b';
      this.flashText(this.elRoundFlash);
    }
  }

  onBotDeathFeed(d) {
    const bot = d.bot;
    const row = el('div', `kf ${d.zone === 'head' ? 'head' : ''}`);
    row.innerHTML = `<b style="color:#4aa8ff">Вы</b> <span style="opacity:.7">→</span> ${d.zone === 'head' ? '☠️' : '🎯'} <b style="color:#ff8a5a">${bot.name}</b>`;
    this.killfeed.appendChild(row);
    while (this.killfeed.children.length > 6) this.killfeed.removeChild(this.killfeed.firstChild);
    setTimeout(() => row.remove(), 5200);
  }

  toast(text, kind = 'plain') {
    const t = el('div', `toast ${kind || 'plain'}`, text);
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 6) this.toasts.removeChild(this.toasts.firstChild);
    setTimeout(() => t.remove(), 3200);
  }

  onLevelUp(d) {
    const lv = el('div', 'levelup', `<div class="big">УРОВЕНЬ ${d.level}</div><div class="small">+1 очко навыка · новый лут</div>`);
    this.root.appendChild(lv);
    setTimeout(() => lv.remove(), 2200);
  }

  onLoot(d) {
    if (!d.options) { this.closeOverlay(); this.lootOptions = null; return; }
    this.lootOptions = d.options;
    const sheet = el('div', 'sheet panel');
    sheet.appendChild(el('h2', '', 'Новый уровень!'));
    sheet.appendChild(el('div', 'sub2', 'Выберите один предмет (клавиши 1/2/3)'));
    const grid = el('div', 'grid-cards');
    d.options.forEach((opt, i) => {
      const r = RARITY_BY_ID[opt.rarity.id];
      const card = el('div', `item ${r.cls} interactive`);
      card.appendChild(el('div', 'row', `<span class="tag rarity-tag ${r.cls}">${r.name}</span><span class="muted">${i + 1}</span>`));
      card.appendChild(el('div', 'iname', `${opt.item.icon} ${opt.item.name}`));
      card.appendChild(el('div', 'idesc', opt.item.desc(opt.value)));
      card.onclick = () => { audio.pickup(true); this.game.chooseLoot(i); };
      grid.appendChild(card);
    });
    sheet.appendChild(grid);
    this.showOverlay('loot', sheet);
  }

  onFlash(d) {
    this.blindUntil = performance.now() + d.duration * 1000;
    this.dmgFlash.classList.remove('on');
    void this.dmgFlash.offsetWidth;
    this.dmgFlash.style.background = 'rgba(255,255,255,0.95)';
    this.dmgFlash.classList.add('on');
    setTimeout(() => { this.dmgFlash.style.background = 'rgba(255,40,40,0.28)'; }, 420);
  }

  onDamage(d) {
    this.dmgFlash.classList.remove('on');
    void this.dmgFlash.offsetWidth;
    this.dmgFlash.classList.add('on');
    this.vignette.classList.add('on');
    clearTimeout(this._vigTimer);
    this._vigTimer = setTimeout(() => this.vignette.classList.remove('on'), 900);
  }

  onPrompt(d) {
    if (!d) { this.prompt.style.display = 'none'; return; }
    this.prompt.style.display = 'block';
    this.promptText.textContent = d.text;
    const bar = this.promptBar.querySelector('i');
    bar.style.width = `${Math.round((d.progress || 0) * 100)}%`;
    this.promptBar.style.display = d.progress > 0 ? 'block' : 'none';
  }

  onBomb(d) {
    const g = this.game;
    if (d.planting !== undefined) {
      this.elObjective.textContent = `⚠️ Закладка бомбы на точке ${d.site}: ${Math.round((d.progress || 0) * 100)}%`;
      return;
    }
    if (d.planted) {
      this.elBombTimer.style.display = 'block';
      this.elBombTimer.textContent = `${d.timer.toFixed(1)}`;
      this.elObjective.textContent = `Бомба на точке ${d.site} — разминируйте (E)`;
    }
    if (d.defused || d.exploded) {
      this.elBombTimer.style.display = 'none';
    }
  }

  onRoundStart(d) {
    this.elRoundFlash.textContent = `Раунд ${d.round}`;
    this.elRoundFlash.style.color = '#ffb02e';
    this.flashText(this.elRoundFlash);
    this.elBombTimer.style.display = 'none';
    this.elObjective.textContent = 'Фаза закупки — купите снаряжение (B)';
    this.refreshPersistent();
  }

  flashText(elem) {
    elem.style.animation = 'none';
    void elem.offsetWidth;
    elem.style.animation = 'fadeUp 1.9s ease both';
    setTimeout(() => { elem.textContent = ''; }, 1900);
  }

  onRoundEnd(d) {
    const s = d.summary;
    const sheet = el('div', 'sheet panel results');
    sheet.appendChild(el('div', `verdict ${s.result === 'win' ? 'win' : 'lose'}`, s.result === 'win' ? 'РАУНД ВЫИГРАН' : 'РАУНД ПРОИГРАН'));
    sheet.appendChild(el('div', 'sub2', s.reason));
    const table = el('div', 'table');
    const rows = [
      ['Награда', `$${s.reward}`],
      ['Кредиты', `$${s.credits}`],
      ['Убийств в операции', s.kills],
      ['Уровень', s.level],
    ];
    for (const [k, v] of rows) {
      const line = el('div', 'stat-line');
      line.appendChild(el('span', 'muted', k));
      line.appendChild(el('b', '', String(v)));
      table.appendChild(line);
    }
    sheet.appendChild(table);
    if (s.lives !== undefined) {
      const line = el('div', 'stat-line');
      line.appendChild(el('span', 'muted', 'Осталось жизней'));
      line.appendChild(el('b', '', `${'❤️'.repeat(Math.max(0, s.lives))}${'🖤'.repeat(Math.max(0, (s.maxLives || 3) - s.lives))}`));
      table.appendChild(line);
    }
    const chips = el('div', 'center-actions');
    if (s.result === 'win' || (s.lives !== undefined && s.lives > 0)) {
      const next = el('button', 'btn primary', 'Следующий раунд');
      next.onclick = () => { audio.click(); this.closeOverlay(); this.game.nextRound(); };
      chips.appendChild(next);
    }
    const skills = el('button', 'btn', 'Прокачка');
    skills.onclick = () => { audio.click(); this.openSkillTree(true); };
    chips.appendChild(skills);
    const buy = el('button', 'btn ghost', 'Магазин');
    buy.onclick = () => { audio.click(); this.openBuy(true); };
    chips.appendChild(buy);
    sheet.appendChild(chips);
    this.showOverlay('results', sheet, true);
  }

  onGameOver(d) {
    const st = d.stats;
    const sheet = el('div', 'sheet panel results');
    sheet.appendChild(el('h2', '', 'ОПЕРАЦИЯ ЗАВЕРШЕНА'));
    sheet.appendChild(el('div', 'sub2', d.reason));
    const table = el('div', 'table');
    const rows = [
      ['Пройдено раундов', d.round],
      ['Убийств', st.kills],
      ['Хедшотов', st.headshots],
      ['Смертей', st.deaths],
      ['Раундов выиграно', st.roundsWon],
      ['Нанесено урона', st.damage],
      ['Уровень', st.level],
      ['Кредитов осталось', `$${st.credits}`],
    ];
    for (const [k, v] of rows) {
      const line = el('div', 'stat-line');
      line.appendChild(el('span', 'muted', k));
      line.appendChild(el('b', '', String(v)));
      table.appendChild(line);
    }
    sheet.appendChild(table);
    if (st.items && st.items.length) {
      sheet.appendChild(el('h3', 'muted', 'Собранные предметы'));
      const chips = el('div', 'tag-strip');
      for (const it of st.items) {
        chips.appendChild(el('span', `chip ${it.rarity === 'legend' || it.rarity === 'epic' ? 'hot' : 'good'}`, `${it.name} (${RARITY_NAMES[it.rarity] || ''})`));
      }
      sheet.appendChild(chips);
    }
    const actions = el('div', 'center-actions');
    const again = el('button', 'btn primary', 'Новая операция');
    again.onclick = () => { audio.click(); this.closeOverlay(); this.game.startRun(); this.input.requestLock(); };
    const skills = el('button', 'btn', 'Прокачка (RPG)');
    skills.onclick = () => { audio.click(); this.openSkillTree(true); };
    const menu = el('button', 'btn ghost', 'В главное меню');
    menu.onclick = () => { audio.click(); this.closeOverlay(); this.showMenu(); };
    actions.appendChild(again);
    actions.appendChild(skills);
    actions.appendChild(menu);
    sheet.appendChild(actions);
    this.showOverlay('gameover', sheet, true);
  }

  /* ==================== оверлеи ==================== */

  showOverlay(id, content, pausable = true) {
    // в фазе закупки таймер раунда продолжает идти (как в CS), поэтому магазин не ставит паузу
    if (id === 'buy' && this.game.state === 'buy') pausable = false;
    this.closeOverlay();
    const ov = el('div', 'overlay');
    ov.appendChild(content);
    this.overlayHost.appendChild(ov);
    this.activeOverlay = id;
    this.overlayEl = ov;
    if (pausable) this.game.pauseReason = id === 'loot' ? 'loot' : 'pause';
    this.input.exitLock();

    // вход по клику мимо окна закрывает (кроме критичных)
    if (id === 'skills' || id === 'buy' || id === 'arsenal' || id === 'controls' || id === 'settings') {
      ov.addEventListener('mousedown', (e) => { if (e.target === ov) this.closeOverlay(); });
    }
    return ov;
  }

  closeOverlay() {
    if (this.activeOverlay === 'loot') return; // лут закрывается только выбором
    if (this.overlayEl) { this.overlayEl.remove(); this.overlayEl = null; }
    if (this.game.pauseReason === 'pause') this.game.pauseReason = null;
    this.activeOverlay = null;
  }

  openSkillTree(keepResults = false) {
    const meta = this.game.meta;
    const sheet = el('div', 'sheet panel');
    sheet.appendChild(el('h2', '', 'Дерево навыков'));
    sheet.appendChild(el('div', 'sub2', `Уровень ${meta.level} · свободных очков: ${meta.skillPoints} · опыт ${meta.xp}/${xpForLevel(meta.level)}`));
    const tree = el('div', 'tree');
    for (const branch of BRANCHES) {
      const col = el('div', `branch ${branch.id}`);
      col.appendChild(el('h4', '', `${branch.icon} ${branch.name}`));
      for (const skill of SKILLS.filter((s) => s.branch === branch.id)) {
        const lvl = meta.skills[skill.id] || 0;
        const blocked = skill.req && !(meta.skills[skill.req] || 0);
        const maxed = lvl >= skill.max;
        const card = el('div', `skill ${maxed ? 'maxed' : ''} ${blocked ? 'blocked' : ''} interactive`);
        const head = el('div', 'sh');
        head.appendChild(el('div', 'sn', `${skill.icon} ${skill.name}`));
        const pips = el('div', 'pips');
        for (let i = 0; i < skill.max; i++) pips.appendChild(el('i', i < lvl ? 'on' : ''));
        head.appendChild(pips);
        card.appendChild(head);
        card.appendChild(el('div', 'sd', skill.desc(Math.max(1, lvl))));
        if (blocked) card.appendChild(el('div', 'small-note', 'Требуется предыдущий навык'));
        card.onclick = () => {
          if (blocked || maxed) { audio.error(); return; }
          if (this.game.spendSkillPoint(skill.id)) {
            this.closeOverlay();
            this.openSkillTree(keepResults);
          }
        };
        col.appendChild(card);
      }
      tree.appendChild(col);
    }
    sheet.appendChild(tree);
    const footer = el('div', 'center-actions');
    const close = el('button', 'btn primary', 'Закрыть');
    close.onclick = () => { audio.click(); this.closeOverlay(); };
    footer.appendChild(close);
    sheet.appendChild(footer);
    this.showOverlay('skills', sheet, !keepResults);
  }

  openBuy(keepResults = false) {
    const g = this.game;
    const sheet = el('div', 'sheet panel');
    sheet.appendChild(el('h2', '', 'Магазин'));
    sheet.appendChild(el('div', 'sub2', `Кредиты: $${g.run.credits} · закупка доступна первые 25 секунд раунда (B)`));
    const cols = el('div', 'buy-cols');

    // оружие
    const wcol = el('div');
    wcol.appendChild(el('h4', '', 'Оружие'));
    for (const def of weaponList().filter((w) => w.cls !== 'knife')) {
      const unlocked = g.meta.level >= def.unlock;
      const afford = g.run.credits >= def.price;
      const row = el('div', `buy-item ${!afford || !unlocked ? 'cant' : ''} interactive`);
      const left = el('div');
      left.appendChild(el('div', 'bi-name', def.name));
      left.appendChild(el('div', 'bi-meta', `${RARITY_NAMES[def.rarity]} · урон ${def.dmg} · ${def.rpm} в/м`));
      row.appendChild(left);
      const right = el('div');
      right.appendChild(el('div', 'price', `$${def.price}`));
      right.appendChild(el('div', 'bi-meta', unlocked ? (afford ? 'купить' : 'нет денег') : `с ${def.unlock} ур.`));
      row.appendChild(right);
      row.onclick = () => {
        if (g.buy(def.id)) { this.closeOverlay(); this.openBuy(keepResults); }
      };
      wcol.appendChild(row);
    }
    cols.appendChild(wcol);

    // снаряжение
    const gcol = el('div');
    gcol.appendChild(el('h4', '', 'Снаряжение и гранаты'));
    for (const gear of SHOP_GEAR) {
      const afford = g.run.credits >= gear.price;
      const row = el('div', `buy-item ${afford ? '' : 'cant'} interactive`);
      const left = el('div');
      left.appendChild(el('div', 'bi-name', `${gear.icon} ${gear.name}`));
      left.appendChild(el('div', 'bi-meta', gear.desc));
      row.appendChild(left);
      const right = el('div');
      right.appendChild(el('div', 'price', `$${gear.price}`));
      row.appendChild(right);
      row.onclick = () => {
        if (g.buy(gear.id)) { this.closeOverlay(); this.openBuy(keepResults); }
      };
      gcol.appendChild(row);
    }
    cols.appendChild(gcol);
    sheet.appendChild(cols);
    const footer = el('div', 'center-actions');
    const close = el('button', 'btn primary', 'Закрыть');
    close.onclick = () => { audio.click(); this.closeOverlay(); };
    footer.appendChild(close);
    sheet.appendChild(footer);
    this.showOverlay('buy', sheet, !keepResults);
  }

  openArsenal() {
    const meta = this.game.meta;
    const sheet = el('div', 'sheet panel');
    sheet.appendChild(el('h2', '', 'Арсенал'));
    sheet.appendChild(el('div', 'sub2', `Уровень ${meta.level} · открыто по уровню · покупка внутри операции (клавиша B)`));
    const grid = el('div', 'grid-cards');
    for (const def of weaponList()) {
      const unlocked = meta.level >= def.unlock;
      const card = el('div', `item ${RARITY_BY_ID[def.rarity]?.cls || ''} ${unlocked ? '' : 'locked'}`);
      card.appendChild(el('div', 'row', `<span class="tag rarity-tag ${def.rarity}">${RARITY_NAMES[def.rarity]}</span>${unlocked ? '' : `<span class="muted">с ${def.unlock} ур.</span>`}`));
      card.appendChild(el('div', 'iname', def.name));
      const stats = el('div', 'wstats');
      const rows = [
        ['Урон', def.dmg + (def.pellets > 1 ? `×${def.pellets}` : '')],
        ['Темп', `${def.rpm}/м`],
        ['Магазин', def.mag === Infinity ? '∞' : def.mag],
        ['Броня', `${Math.round((def.armorPen || 0) * 100)}%`],
        ['Разброс', def.spread.toFixed(2)],
        ['Скорость', def.moveSpeedMul.toFixed(2)],
      ];
      for (const [k, v] of rows) {
        const s = el('div');
        s.innerHTML = `${k}: <b>${v}</b>`;
        stats.appendChild(s);
      }
      card.appendChild(stats);
      card.appendChild(el('div', 'idesc', def.desc));
      grid.appendChild(card);
    }
    sheet.appendChild(grid);
    const footer = el('div', 'center-actions');
    const close = el('button', 'btn primary', 'Назад');
    close.onclick = () => { audio.click(); this.closeOverlay(); };
    footer.appendChild(close);
    sheet.appendChild(footer);
    this.showOverlay('arsenal', sheet, this.game.state !== 'idle');
  }

  openControls() {
    const sheet = el('div', 'sheet panel');
    sheet.appendChild(el('h2', '', 'Управление'));
    const keys = el('div', 'keys-grid');
    const rows = [
      ['WASD', 'движение'], ['Мышь', 'обзор'], ['ЛКМ', 'огонь'], ['ПКМ', 'оптический прицел'],
      ['R', 'перезарядка'], ['Shift', 'рывок'], ['Ctrl / C', 'присесть'], ['Space', 'прыжок'],
      ['F', 'аптечка (навык)'], ['E', 'разминирование'], ['1', 'основное оружие'], ['2', 'пистолет'],
      ['3', 'нож'], ['4', 'осколочная'], ['5', 'дымовая'], ['6', 'слепящая'], ['7', 'зажигательная'],
      ['B', 'магазин'], ['P', 'дерево навыков'], ['Tab', 'отчёт по операции'], ['Esc', 'пауза'],
    ];
    for (const [k, v] of rows) {
      const row = el('div');
      row.appendChild(el('span', '', v));
      row.appendChild(el('span', '', `<span class="kbd">${k}</span>`));
      keys.appendChild(row);
    }
    sheet.appendChild(keys);
    const footer = el('div', 'center-actions');
    const close = el('button', 'btn primary', 'Назад');
    close.onclick = () => { audio.click(); this.closeOverlay(); };
    footer.appendChild(close);
    sheet.appendChild(footer);
    this.showOverlay('controls', sheet, this.game.state !== 'idle');
  }

  openSettings() {
    const g = this.game;
    const s = g.settings;
    const sheet = el('div', 'sheet panel');
    sheet.appendChild(el('h2', '', 'Настройки'));
    const grid = el('div', 'pause-grid');
    const col = el('div');

    const slider = (label, value, min, max, stepv, onChange) => {
      const row = el('div', 'slider-row');
      row.appendChild(el('span', '', label));
      const input = el('input');
      input.type = 'range'; input.min = min; input.max = max; input.step = stepv; input.value = value;
      const val = el('span', 'val', Number(value).toFixed(2));
      input.oninput = () => { val.textContent = Number(input.value).toFixed(2); onChange(parseFloat(input.value)); };
      row.appendChild(input);
      row.appendChild(val);
      return row;
    };

    col.appendChild(slider('Чувствительность мыши', s.sensitivity, 0.2, 3, 0.05, (v) => { s.sensitivity = v; g.saveMeta(); }));
    col.appendChild(slider('Громкость', s.volume, 0, 1, 0.05, (v) => { s.volume = v; audio.setVolume(v); g.saveMeta(); }));
    col.appendChild(slider('Обзор (FOV)', s.fov, 70, 110, 1, (v) => { s.fov = v; g.saveMeta(); }));

    const sw = el('div', 'switch-row');
    sw.appendChild(el('span', '', 'Тени и высокое качество'));
    const cb = el('input');
    cb.type = 'checkbox';
    cb.checked = !!s.shadows;
    cb.onchange = () => { s.shadows = cb.checked; g.engine.setShadows(cb.checked); g.saveMeta(); };
    sw.appendChild(cb);
    col.appendChild(sw);
    grid.appendChild(col);

    const col2 = el('div');
    col2.appendChild(el('div', 'small-note', 'Подсказки: держите ПКМ для оптики снайперских винтовок, используйте Shift для рывка сквозь прострел, ставьте дым на линии огня ботов, а огонь — в узких проходах.'));
    grid.appendChild(col2);
    sheet.appendChild(grid);

    const footer = el('div', 'center-actions');
    const close = el('button', 'btn primary', 'Готово');
    close.onclick = () => { audio.click(); this.closeOverlay(); };
    footer.appendChild(close);
    sheet.appendChild(footer);
    this.showOverlay('settings', sheet, this.game.state !== 'idle');
  }

  toggleStats() {
    if (this.activeOverlay === 'stats') { this.closeOverlay(); return; }
    const g = this.game;
    const sheet = el('div', 'sheet panel');
    sheet.appendChild(el('h2', '', 'Отчёт по операции'));
    sheet.appendChild(el('div', 'sub2', `Раунд ${g.roundNumber} из 20`));
    const table = el('div', 'table');
    const m = g.meta;
    const rows = [
      ['Убийств за операцию', g.run.kills],
      ['Хедшотов', g.run.headshots],
      ['Смертей', g.run.deaths],
      ['Нанесено урона', Math.round(g.run.damageDealt)],
      ['Кредиты', `$${g.run.credits}`],
      ['Уровень', m.level],
      ['Всего убийств за всё время', m.stats.kills],
      ['Лучший раунд', m.stats.bestRound || g.roundNumber],
      ['Операций сыграно', m.stats.runs],
    ];
    for (const [k, v] of rows) {
      const line = el('div', 'stat-line');
      line.appendChild(el('span', 'muted', k));
      line.appendChild(el('b', '', String(v)));
      table.appendChild(line);
    }
    sheet.appendChild(table);
    if (g.run.items.length) {
      sheet.appendChild(el('h3', 'muted', 'Предметы операции'));
      const chips = el('div', 'tag-strip');
      for (const it of g.run.items) chips.appendChild(el('span', 'chip good', it.name));
      sheet.appendChild(chips);
    }
    const footer = el('div', 'center-actions');
    const close = el('button', 'btn primary', 'Закрыть');
    close.onclick = () => { this.closeOverlay(); this.input.requestLock(); };
    footer.appendChild(close);
    sheet.appendChild(footer);
    this.showOverlay('stats', sheet, true);
  }

  toggleBuy() {
    if (this.activeOverlay === 'buy') { this.closeOverlay(); this.input.requestLock(); return; }
    if (this.game.state === 'idle') return;
    this.openBuy();
  }

  togglePause() {
    if (this.activeOverlay === 'pause') { this.closeOverlay(); this.input.requestLock(); return; }
    const sheet = el('div', 'sheet panel');
    sheet.appendChild(el('h2', '', 'Пауза'));
    sheet.appendChild(el('div', 'sub2', 'Операция приостановлена'));
    const grid = el('div', 'pause-grid');
    const col = el('div');
    const resume = el('button', 'btn primary', 'Продолжить');
    resume.onclick = () => { this.closeOverlay(); this.input.requestLock(); };
    col.appendChild(resume);
    const skills = el('button', 'btn', 'Прокачка (RPG)');
    skills.onclick = () => this.openSkillTree();
    col.appendChild(skills);
    const buy = el('button', 'btn', 'Магазин');
    buy.onclick = () => this.openBuy();
    col.appendChild(buy);
    const settings = el('button', 'btn ghost', 'Настройки');
    settings.onclick = () => this.openSettings();
    col.appendChild(settings);
    const toMenu = el('button', 'btn danger', 'Прервать операцию');
    toMenu.onclick = () => {
      this.closeOverlay();
      this.game.state = 'idle';
      this.game.pauseReason = null;
      this.showMenu();
      this.game.runEnd('Операция прервана');
    };
    col.appendChild(toMenu);
    grid.appendChild(col);
    const col2 = el('div');
    col2.appendChild(el('div', 'small-note', 'Совет: в фазе закупки боты стоят на месте — используйте это время, чтобы купить броню, гранаты и занять удобную позицию.'));
    grid.appendChild(col2);
    sheet.appendChild(grid);
    this.showOverlay('pause', sheet, true);
  }

  /* ==================== меню ==================== */

  showMenu() {
    this.menu.style.display = 'flex';
    this.hud.classList.remove('on');
    this.game.pauseReason = 'menu';
    this.refreshPersistent();
    this.input.exitLock();
  }

  hideMenu() {
    this.menu.style.display = 'none';
    this.hud.classList.add('on');
    if (this.game.pauseReason === 'menu') this.game.pauseReason = null;
  }

  refreshPersistent() {
    const g = this.game;
    const m = g.meta;
    const need = xpForLevel(m.level);
    this.elLevel.querySelector('b').textContent = m.level;
    this.xpFill.style.transform = `scaleX(${Math.min(1, m.xp / need)})`;
    this.xpTxt.textContent = `${Math.floor(m.xp)} / ${need} XP`;
    this.elPoints.textContent = m.skillPoints > 0 ? `Есть очки навыков: ${m.skillPoints} (P)` : '';
    this.elCredits.textContent = g.run.credits;
    // вне боя в верхней панели показываем счёт операции: победы / поражения
    const losses = Math.max(0, (g.roundNumber || 1) - 1 - g.run.roundsWon);
    this.elCtScore.textContent = `❤️ ${g.run.lives} · ${g.run.roundsWon}`;
    this.elTScore.textContent = `${losses}`;
    if (this.elMenuStats) {
      this.elMenuStats.innerHTML = '';
      const rows = [
        ['Уровень', m.level],
        ['Опыт', `${Math.floor(m.xp)} / ${need}`],
        ['Очки навыков', m.skillPoints],
        ['Всего убийств', m.stats.kills],
        ['Хедшотов', m.stats.headshots],
        ['Раундов пройдено', `${m.stats.roundsWon} / ${m.stats.rounds}`],
        ['Операций', m.stats.runs],
        ['Лучший результат (раунд)', m.stats.bestRound || 0],
      ];
      for (const [k, v] of rows) {
        const line = el('div', 'stat-line');
        line.appendChild(el('span', 'muted', k));
        line.appendChild(el('b', '', String(v)));
        this.elMenuStats.appendChild(line);
      }
    }
  }

  /* ==================== кадр ==================== */

  update(dt) {
    const g = this.game;
    const p = g.player;
    if (g.state === 'idle') {
      this.drawMinimap();
      return;
    }

    // таймер
    let timeText, warn = false;
    if (g.bomb && g.bomb.planted) {
      timeText = g.bomb.timer.toFixed(1);
      warn = g.bomb.timer < 10;
    } else if (g.state === 'buy') {
      timeText = `0:${String(Math.max(0, Math.ceil(g.buyTimer))).padStart(2, '0')}`;
    } else {
      const t = Math.max(0, g.roundTimer);
      timeText = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
      warn = t < 20;
    }
    this.elTimer.textContent = timeText;
    this.elTimer.classList.toggle('warn', warn);
    this.elTScore.textContent = String(g.aliveBots().length);
    this.elCtScore.textContent = `❤️ ${g.run.lives}`;

    // здоровье / броня
    const hp = Math.max(0, Math.round(p.health));
    const hpMax = g.mods.maxHealth;
    this.hpFill.style.transform = `scaleX(${Math.max(0, Math.min(1, hp / hpMax))})`;
    this.hpFill.classList.toggle('low', hp / hpMax < 0.35);
    this.hpTxt.textContent = `${hp} HP`;
    const armor = Math.round(p.armor);
    this.armorFill.style.transform = `scaleX(${Math.max(0, Math.min(1, armor / 100))})`;
    this.armorFill.classList.toggle('zero', armor <= 0);
    this.armorTxt.textContent = `${armor} БР`;

    // оружие
    const def = p.weaponDef;
    if (def) {
      const st = p.state;
      if (st && st.ammo !== Infinity) {
        this.elAmmo.innerHTML = `${st.ammo} <span class="res">/ ${st.reserve}</span>`;
        this.elAmmo.classList.toggle('reloading', st.reloading);
      } else if (def.cls === 'knife') {
        this.elAmmo.innerHTML = '🔪 <span class="res">нож</span>';
        this.elAmmo.classList.remove('reloading');
      } else {
        this.elAmmo.innerHTML = '—';
      }
      this.elWName.textContent = def.name;
      this.elWVariant.textContent = `${RARITY_NAMES[def.rarity]} · ${def.rcls || ''}${def.cls}`;
    } else {
      this.elAmmo.innerHTML = '—';
      this.elWName.textContent = 'Граната';
      this.elWVariant.textContent = p.grenadeType || '';
    }
    const gren = [];
    for (const [k, v] of Object.entries(p.grenades)) if (v > 0) gren.push(`${GREN_ICON[k]}${v}`);
    this.elGrenades.textContent = gren.length ? gren.join('  ') : 'гранат нет';

    // способности
    this.updateAbilities(p);

    // прицел
    const st = p.state;
    const spread = st && def && def.cls !== 'knife'
      ? st.spread(p.speedFactor, !p.onGround, p.crouch, p.viewModel.adsAmount > 0.5, g.mods, g.itemSpreadMul())
      : 2;
    const gap = 4 + spread * 6 + (p.speedFactor > 0.4 ? 6 : 0);
    for (const { dir, line } of this.chLines) {
      const t = Math.min(46, gap);
      if (dir === 'up') line.style.transform = `translateY(${-t}px)`;
      if (dir === 'down') line.style.transform = `translateY(${t}px)`;
      if (dir === 'left') line.style.transform = `translateX(${-t}px)`;
      if (dir === 'right') line.style.transform = `translateX(${t}px)`;
    }
    const scoped = p.viewModel.adsAmount > 0.55 && def && def.adsZoom >= 2.2;
    this.scope.classList.toggle('on', !!scoped);
    this.crosshair.classList.toggle('hidden', scoped || !!p.dead);

    // слепящая граната / вспышка урона
    const now = performance.now();
    if (this.blindUntil > now) {
      const k = (this.blindUntil - now) / 1000;
      this.scope.style.background = `radial-gradient(circle at 50% 50%, rgba(255,255,255,${Math.min(0.95, k * 0.9)}) 0%, rgba(255,255,255,${Math.min(0.99, k)}) 100%)`;
      this.scope.classList.add('on');
    } else if (this._wasBlind) {
      this.scope.classList.remove('on');
      this.scope.style.background = '';
    }
    this._wasBlind = this.blindUntil > now;

    if (p.dead) {
      this.elObjective.textContent = 'Вы мертвы — раунд завершается';
    }

    this.drawMinimap();
  }

  updateAbilities(p) {
    const g = this.game;
    const list = [
      { id: 'dash', icon: '💨', label: 'Рывок', cd: p.dashCd, max: g.mods.dashCooldown, key: 'Shift' },
      { id: 'medic', icon: '🧰', label: 'Аптечка', cd: p.medicCd, max: g.mods.medicCooldown, key: 'F' },
    ];
    if (this.abilityRow.children.length !== list.length) {
      this.abilityRow.innerHTML = '';
      for (const a of list) {
        const box = el('div', 'ability', `${a.icon}<span class="key">${a.key}</span><span class="cd"></span>`);
        this.abilityRow.appendChild(box);
      }
    }
    list.forEach((a, i) => {
      const box = this.abilityRow.children[i];
      const cdEl = box.querySelector('.cd');
      const ready = a.cd <= 0;
      box.classList.toggle('ready', ready);
      cdEl.style.transform = ready ? 'scaleY(0)' : `scaleY(${Math.max(0, Math.min(1, a.cd / a.max))})`;
    });
  }

  drawMinimap() {
    const g = this.game;
    const ctx = this.minimap.getContext('2d');
    const size = this.mmSize;
    const scale = size / 80; // карта 80 x 80 м
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(8,11,15,0.75)';
    ctx.fillRect(0, 0, size, size);

    // стены
    const colsN = cols(), rowsN = rows();
    for (let r = 0; r < rowsN; r++) {
      for (let c = 0; c < colsN; c++) {
        const t = TILE_MAP[r][c];
        if (t === '#') {
          ctx.fillStyle = 'rgba(150,170,190,0.35)';
        } else if (t === 'C' || t === 'B' || t === 'T') {
          ctx.fillStyle = 'rgba(190,160,110,0.45)';
        } else if (t === 'A') {
          ctx.fillStyle = 'rgba(255,176,46,0.55)';
        } else if (t === 'X') {
          ctx.fillStyle = 'rgba(53,208,255,0.5)';
        } else {
          continue;
        }
        const x = (c * 4 + 40) * scale;
        const y = (r * 4 + 40) * scale;
        ctx.fillRect(x, y, 4 * scale, 4 * scale);
      }
    }

    const wx = (x) => (x + 40) * scale;
    const wy = (z) => (z + 40) * scale;

    // бомба
    if (g.bomb && g.bomb.planted) {
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 180);
      ctx.fillStyle = `rgba(255,60,60,${0.5 + pulse * 0.5})`;
      ctx.beginPath();
      ctx.arc(wx(g.bomb.pos.x), wy(g.bomb.pos.z), 4 + pulse * 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // замеченные враги
    for (const bot of g.bots) {
      if (bot.dead) continue;
      const recent = bot.game.time - (bot.weaponState.lastShotAt || -99) < 2.2;
      const dist = Math.hypot(bot.pos.x - g.player.pos.x, bot.pos.z - g.player.pos.z);
      const visible = dist < 16 && g.physics.lineOfSight(g.player.eyePosition(new THREE.Vector3()), bot.pos.clone().setY(bot.pos.y + 1.4));
      if (recent || visible) {
        ctx.fillStyle = recent ? 'rgba(255,120,60,0.95)' : 'rgba(255,60,60,0.9)';
        ctx.beginPath();
        ctx.arc(wx(bot.pos.x), wy(bot.pos.z), bot.boss ? 4 : 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // игрок
    const px = wx(g.player.pos.x), py = wy(g.player.pos.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-g.player.yaw);
    ctx.fillStyle = '#7fe0ff';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.2, 5);
    ctx.lineTo(0, 2.6);
    ctx.lineTo(-4.2, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // рамка
    ctx.strokeStyle = 'rgba(120,145,175,0.35)';
    ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
  }
}

const GREN_ICON = { he: '💥', smoke: '🌫️', flash: '⚡', fire: '🔥', decoy: '📢' };
