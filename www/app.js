/* Orbit – Kalender, To-dos, Listen, Training & Personen (Android-App)
 * Alle Daten liegen lokal auf dem Gerät (Speicher der App, Schlüssel "orbit-data").
 * Ein APK-Update ändert nur die Programmdateien – deine Daten bleiben erhalten,
 * solange die App mit demselben Schlüssel signiert ist (android-signing/).
 * Wenn sich das Datenformat einmal ändert, hebt migrate() alte Daten automatisch an.
 */
'use strict';
(function () {
  const APP_VERSION = '1.1.0';
  const STORE_KEY = 'orbit-data';
  const SAFETY_KEY = 'orbit-data-sicherung';
  const DATA_VERSION = 1;
  const CAP = window.Capacitor;
  const NATIVE = !!(CAP && CAP.isNativePlatform && CAP.isNativePlatform());
  const plugin = (name) => (NATIVE && CAP.Plugins ? CAP.Plugins[name] : null);

  // ---------- Hilfsfunktionen ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parseD = (s) => { const p = String(s).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const wdOf = (d) => (d.getDay() + 6) % 7;
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const today = () => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); };
  const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

  const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const WDL = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
  const MON = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const MONS = ['Jan', 'Feb', 'März', 'Apr', 'Mai', 'Juni', 'Juli', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  const REP = { none: '', daily: 'täglich', weekly: 'wöchentlich', monthly: 'monatlich', yearly: 'jährlich' };
  const fmtDay = (d) => WDL[wdOf(d)] + ', ' + d.getDate() + '. ' + MON[d.getMonth()];
  const fmtShort = (d) => WD[wdOf(d)] + '. ' + d.getDate() + '. ' + MONS[d.getMonth()];
  const fmtLong = (d) => d.getDate() + '. ' + MON[d.getMonth()] + ' ' + d.getFullYear();

  const PALETTE = [
    { id: 'orange', name: 'Orange', c: '#E8801F' },
    { id: 'rot', name: 'Rot', c: '#D64545' },
    { id: 'pink', name: 'Pink', c: '#C2397A' },
    { id: 'lila', name: 'Lila', c: '#7A4CC2' },
    { id: 'blau', name: 'Blau', c: '#3B5BDB' },
    { id: 'tuerkis', name: 'Türkis', c: '#0F8A80' },
    { id: 'gruen', name: 'Grün', c: '#3E8E1E' },
    { id: 'gelb', name: 'Gelb', c: '#C99A06' },
    { id: 'braun', name: 'Braun', c: '#8B5A2B' },
    { id: 'grau', name: 'Grau', c: '#6B707A' }
  ];
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, t) => '#' + rgb(a).map((v, i) => Math.round(v + (rgb(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');
  const rgba = (h, a) => 'rgba(' + rgb(h).join(',') + ',' + a + ')';
  const colorHex = (id) => (PALETTE.find((p) => p.id === id) || PALETTE[9]).c;
  const colorVars = (id) => {
    const c = colorHex(id);
    return '--tc:' + c + ';--tbg-l:' + mix(c, '#ffffff', 0.84) + ';--tfg-l:' + mix(c, '#000000', 0.42) + ';--tbg-d:' + rgba(c, 0.24) + ';--tfg-d:' + mix(c, '#ffffff', 0.55);
  };

  const P = {
    sun: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
    cal: 'M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7ZM4 10h16M8 3v4M16 3v4',
    list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
    dumbbell: 'M6 7v10M18 7v10M3 9.5v5M21 9.5v5M6 12h12',
    people: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7M22 21a7 7 0 0 0-4-6.3',
    gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
    plus: 'M12 5v14M5 12h14',
    chevL: 'M15 6l-6 6 6 6',
    chevR: 'M9 6l6 6-6 6',
    tick: 'M5 12l5 5 9-10',
    gift: 'M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7c-1.5-3-5-3-5-1s3 1 5 1c2 0 5 1 5-1s-3.5-2-5 1',
    phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z',
    msg: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z',
    mail: 'M4 6h16v12H4zM4 7l8 6 8-6',
    download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
    upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
    trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
    edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z',
    tag: 'M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9ZM7.5 7.5h.01',
    moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z'
  };
  const icon = (name, cls) => '<svg viewBox="0 0 24 24" aria-hidden="true"' + (cls ? ' class="' + cls + '"' : '') + '><path d="' + P[name] + '"/></svg>';
  const CHECK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="tick" d="' + P.tick + '"/></svg>';

  // ---------- Daten ----------
  function defaultTags() {
    return [
      { id: 't-privat', name: 'Privat', color: 'orange' },
      { id: 't-arbeit', name: 'Arbeit', color: 'blau' },
      { id: 't-arzt', name: 'Arzt', color: 'tuerkis' },
      { id: 't-geburtstag', name: 'Geburtstag', color: 'pink', system: 'birthday' },
      { id: 't-haushalt', name: 'Haushalt', color: 'lila' },
      { id: 't-training', name: 'Training', color: 'gruen', system: 'training' }
    ];
  }
  function defaultData() {
    return { version: DATA_VERSION, items: [], people: [], plans: [], lists: [], done: {}, tags: defaultTags(), settings: { theme: 'system' } };
  }
  function migrate(d) {
    const out = defaultData();
    if (!d || typeof d !== 'object') return out;
    ['items', 'people', 'plans', 'lists', 'tags'].forEach((k) => { if (Array.isArray(d[k])) out[k] = d[k]; });
    if (d.done && typeof d.done === 'object') out.done = d.done;
    out.settings = Object.assign({ theme: 'system' }, d.settings || {});
    if (!out.tags.some((t) => t.system === 'birthday')) out.tags.push(defaultTags()[3]);
    if (!out.tags.some((t) => t.system === 'training')) out.tags.push(defaultTags()[5]);
    out.items = out.items.filter((x) => x && x.id).map((x) => Object.assign({ type: 'aufgabe', title: '', date: '', time: '', end: '', repeat: 'none', tagId: '', listId: '' }, x));
    out.plans = out.plans.filter((x) => x && x.id).map((p) => Object.assign({ name: '', start: '', end: '', time: '', dur: '', notes: '' }, p, { days: Array.isArray(p.days) ? WD.map((_, i) => !!p.days[i]) : WD.map(() => false) }));
    out.people = out.people.filter((x) => x && x.id).map((p) => Object.assign({ name: '', birthday: '', phone: '', email: '', address: '', note: '' }, p));
    out.lists = out.lists.filter((x) => x && x.id).map((l) => Object.assign({ name: '', color: 'grau' }, l));
    out.version = DATA_VERSION;
    return out;
  }
  function load() {
    let raw = null;
    try { raw = localStorage.getItem(STORE_KEY); } catch (e) { /* kein Speicher */ }
    if (!raw) return defaultData();
    try {
      const d = migrate(JSON.parse(raw));
      // einmal pro Start eine Sicherheitskopie des letzten Stands ablegen
      try { localStorage.setItem(SAFETY_KEY, raw); } catch (e) { /* egal */ }
      return d;
    } catch (e) {
      try { localStorage.setItem(STORE_KEY + '-defekt-' + Date.now(), raw); } catch (e2) { /* egal */ }
      return defaultData();
    }
  }
  let data = load();
  function persist() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); }
    catch (e) { toast('Speichern fehlgeschlagen – Speicher voll?'); }
  }
  const snapshot = () => JSON.stringify(data);

  const tagById = (id) => data.tags.find((t) => t.id === id);
  const tagSys = (s) => data.tags.find((t) => t.system === s);
  const listById = (id) => data.lists.find((l) => l.id === id);
  const planById = (id) => data.plans.find((p) => p.id === id);
  const personById = (id) => data.people.find((p) => p.id === id);
  const itemById = (id) => data.items.find((i) => i.id === id);

  // ---------- UI-Zustand ----------
  const TABS = [
    { id: 'heute', label: 'Heute', icon: 'sun' },
    { id: 'kalender', label: 'Kalender', icon: 'cal' },
    { id: 'listen', label: 'Listen', icon: 'list' },
    { id: 'training', label: 'Training', icon: 'dumbbell' },
    { id: 'personen', label: 'Personen', icon: 'people' }
  ];
  const ui = { tab: 'heute', stack: [], range: 'tag', monthOff: 0, selDay: '', justAdded: null, popKey: null, segFrom: {}, contentAnim: '', gridAnim: '', bumpDay: false, fresh: true, sheet: null, resetArmed: false };
  const top = () => ui.stack[ui.stack.length - 1] || null;

  // ---------- Termine & Aufgaben berechnen ----------
  function occurs(it, d) {
    if (!isDate(it.date)) return false;
    const b = parseD(it.date);
    if (d < b) return false;
    if (ymd(d) === it.date) return true;
    switch (it.repeat) {
      case 'daily': return true;
      case 'weekly': return wdOf(d) === wdOf(b);
      case 'monthly': return d.getDate() === b.getDate();
      case 'yearly': return d.getDate() === b.getDate() && d.getMonth() === b.getMonth();
      default: return false;
    }
  }
  function rawFor(d) {
    const s = ymd(d), out = [];
    data.items.forEach((it) => { if (it.date && occurs(it, d)) out.push({ kind: it.type, it, key: it.id + '|' + s, time: it.time || '', d }); });
    data.people.forEach((p) => {
      if (!isDate(p.birthday)) return;
      const b = parseD(p.birthday);
      if (b.getMonth() === d.getMonth() && b.getDate() === d.getDate() && d >= b) out.push({ kind: 'geburtstag', p, key: 'bd' + p.id + '|' + s, time: '', age: d.getFullYear() - b.getFullYear(), d });
    });
    data.plans.forEach((pl) => { if (s >= pl.start && s <= pl.end && pl.days[wdOf(d)]) out.push({ kind: 'training', pl, key: 'pl' + pl.id + '|' + s, time: pl.time || '', d }); });
    const rank = (r) => (r.kind === 'geburtstag' ? 0 : 1);
    out.sort((a, b) => (rank(a) - rank(b)) || (a.time || '99').localeCompare(b.time || '99'));
    return out;
  }
  const isCheckable = (r) => r.kind === 'aufgabe' || r.kind === 'training';
  function overdueItems() {
    const ts = ymd(today());
    return data.items.filter((it) => it.type === 'aufgabe' && isDate(it.date) && it.date < ts && (it.repeat || 'none') === 'none' && !data.done[it.id + '|' + it.date]);
  }
  function planSessions(pl) {
    const out = [];
    if (!isDate(pl.start) || !isDate(pl.end)) return out;
    let d = parseD(pl.start); const e = parseD(pl.end); let guard = 0;
    while (d <= e && guard < 2000) { if (pl.days[wdOf(d)]) out.push(ymd(d)); d = addDays(d, 1); guard++; }
    return out;
  }

  function tagChip(tag, dim) {
    if (!tag) return '';
    return '<span class="tag' + (dim ? ' dim' : '') + '" style="' + colorVars(tag.color) + '">' + esc(tag.name) + '</span>';
  }
  function rowHtml(r, opts) {
    opts = opts || {};
    const done = !!data.done[r.key];
    let box = false, left = '', title = '', tag = null, act = '', id = '';
    const meta = [];
    if (opts.withDate && r.d) meta.push(fmtShort(r.d));
    if (r.kind === 'termin') {
      left = r.it.time || 'ganzt.'; title = r.it.title; act = 'item-open'; id = r.it.id;
      if (r.it.time && r.it.end) meta.push(r.it.time + '–' + r.it.end);
      if (REP[r.it.repeat]) meta.push(REP[r.it.repeat]);
      if (r.it.listId && !opts.inList && listById(r.it.listId)) meta.push(listById(r.it.listId).name);
      tag = tagById(r.it.tagId);
    } else if (r.kind === 'aufgabe') {
      box = true; title = r.it.title; act = 'item-open'; id = r.it.id;
      if (opts.overdue) meta.push('überfällig seit ' + fmtShort(r.d));
      if (r.it.time) meta.push('bis ' + r.it.time);
      if (REP[r.it.repeat]) meta.push(REP[r.it.repeat]);
      if (r.it.listId && !opts.inList && listById(r.it.listId)) meta.push('Liste ' + listById(r.it.listId).name);
      tag = tagById(r.it.tagId);
    } else if (r.kind === 'geburtstag') {
      left = 'ganzt.'; title = r.p.name + ' hat Geburtstag'; act = 'person-open'; id = r.p.id;
      meta.push('wird ' + r.age);
      tag = tagSys('birthday');
    } else if (r.kind === 'training') {
      box = true; title = 'Training: ' + r.pl.name; act = 'plan-open'; id = r.pl.id;
      meta.push(r.pl.time ? r.pl.time : 'irgendwann am Tag');
      if (r.pl.dur) meta.push(r.pl.dur + ' min');
      tag = tagSys('training');
    }
    const cls = 'row' + (ui.justAdded && ui.justAdded === id ? ' enter' : '') + (opts.overdue ? ' overdue' : '');
    const pop = ui.popKey === r.key ? ' pop' : '';
    return '<div class="' + cls + '">' +
      (box
        ? '<button type="button" class="check' + (done ? ' on' : '') + pop + '" data-act="toggle" data-key="' + esc(r.key) + '" aria-pressed="' + done + '" aria-label="' + (done ? 'Als offen markieren: ' : 'Erledigt: ') + esc(title) + '">' + CHECK_SVG + '</button>'
        : '<span class="row-time">' + esc(left) + '</span>') +
      '<button type="button" class="row-main" data-act="' + act + '" data-id="' + esc(id) + '"><span class="row-title' + (done ? ' done' : '') + '">' + esc(title) + '</span>' +
      (meta.length ? '<span class="row-meta">' + esc(meta.join(' · ')) + '</span>' : '') + '</button>' +
      tagChip(tag, done) +
      '</div>';
  }

  // ---------- Bausteine ----------
  function topBar() {
    return '<div class="topbar"><div class="brand"><img src="icons/logo-mark.png" alt="" width="30" height="30"><span>Orbit</span></div>' +
      '<button type="button" class="icon-btn" data-act="settings" aria-label="Einstellungen">' + icon('gear') + '</button></div>';
  }
  function navBar(backLabel, actions) {
    return '<div class="navbar"><button type="button" class="back" data-act="back">' + icon('chevL') + esc(backLabel) + '</button><div class="nav-actions">' + (actions || '') + '</div></div>';
  }
  function seg(name, opts, cur, act) {
    const i = Math.max(0, opts.findIndex((o) => o[0] === cur));
    const from = ui.segFrom[name];
    delete ui.segFrom[name];
    const start = from != null ? from : i;
    return '<div class="seg" role="group" style="--n:' + opts.length + ';--i:' + start + '"' + (from != null && from !== i ? ' data-seg-to="' + i + '"' : '') + '>' +
      '<span class="seg-ind" aria-hidden="true"></span>' +
      opts.map((o) => '<button type="button" class="seg-btn' + (o[0] === cur ? ' on' : '') + '" data-act="' + act + '" data-v="' + o[0] + '" aria-pressed="' + (o[0] === cur) + '">' + esc(o[1]) + '</button>').join('') +
      '</div>';
  }
  function emptyState(ic, title, text, btn, act) {
    return '<div class="empty"><span class="empty-icon">' + icon(ic) + '</span><b>' + esc(title) + '</b><p>' + esc(text) + '</p>' +
      (btn ? '<button type="button" class="btn primary" data-act="' + act + '">' + esc(btn) + '</button>' : '') + '</div>';
  }
  const initials = (name) => String(name).trim().split(/\s+/).slice(0, 2).map((x) => x.charAt(0).toUpperCase()).join('') || '?';
  const personColor = (id) => { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997; return PALETTE[h % 9].id; };
  const avatar = (p, size) => '<span class="avatar" style="width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.38) + 'px;' + colorVars(personColor(p.id)) + '">' + esc(initials(p.name)) + '</span>';

  // ---------- Bildschirme ----------
  function scrHeute() {
    const t0 = today();
    let days = [t0];
    if (ui.range === 'woche') { days = []; for (let i = 0; i <= 6 - wdOf(t0); i++) days.push(addDays(t0, i)); }
    if (ui.range === 'monat') { days = []; const last = new Date(t0.getFullYear(), t0.getMonth() + 1, 0).getDate(); for (let i = 0; i <= last - t0.getDate(); i++) days.push(addDays(t0, i)); }
    let html = '';
    const od = overdueItems();
    if (od.length) {
      html += '<section class="group"><h2 class="group-label danger">Überfällig</h2><div class="card list">' +
        od.map((it) => rowHtml({ kind: 'aufgabe', it, key: it.id + '|' + it.date, d: parseD(it.date) }, { overdue: true })).join('') + '</div></section>';
    }
    let count = 0;
    days.forEach((d, i) => {
      const raws = rawFor(d);
      if (!raws.length) return;
      count++;
      html += '<section class="group"><h2 class="group-label">' + esc(i === 0 ? 'Heute' : fmtDay(d)) + '</h2><div class="card list">' + raws.map((r) => rowHtml(r)).join('') + '</div></section>';
    });
    if (!count && !od.length) {
      const what = ui.range === 'tag' ? 'heute' : (ui.range === 'woche' ? 'diese Woche' : 'diesen Monat');
      html = emptyState('sun', 'Für ' + what + ' ist nichts geplant', 'Lege einen Termin oder eine Aufgabe an – Trainings und Geburtstage erscheinen hier automatisch.', 'Eintrag anlegen', 'fab');
    }
    const title = ui.range === 'tag' ? 'Heute' : (ui.range === 'woche' ? 'Diese Woche' : 'Dieser Monat');
    const anim = ui.contentAnim; ui.contentAnim = '';
    return topBar() +
      '<div class="title-block"><span class="eyebrow">' + esc(fmtDay(t0).toUpperCase()) + '</span><h1 class="big">' + title + '</h1></div>' +
      seg('range', [['tag', 'Heute'], ['woche', 'Woche'], ['monat', 'Monat']], ui.range, 'range') +
      '<div class="stack ' + anim + '">' + html + '</div>';
  }

  function scrKalender() {
    const t0 = today(), ts = ymd(t0);
    const mBase = new Date(t0.getFullYear(), t0.getMonth() + ui.monthOff, 1);
    const first = addDays(mBase, -wdOf(mBase));
    const last = new Date(mBase.getFullYear(), mBase.getMonth() + 1, 0).getDate();
    const n = Math.ceil((wdOf(mBase) + last) / 7) * 7;
    const sel = ui.selDay || ts;
    let cells = '';
    for (let i = 0; i < n; i++) {
      const d = addDays(first, i), s = ymd(d);
      const out = d.getMonth() !== mBase.getMonth();
      const raws = rawFor(d);
      const dots = raws.slice(0, 3).map((r) => {
        let tg = null;
        if (r.kind === 'geburtstag') tg = tagSys('birthday');
        else if (r.kind === 'training') tg = tagSys('training');
        else tg = tagById(r.it.tagId);
        return '<i style="--tc:' + (tg ? colorHex(tg.color) : 'var(--muted)') + '"></i>';
      }).join('');
      const cls = 'cell' + (out ? ' out' : '') + (s === ts ? ' today' : '') + (s === sel ? ' sel' + (ui.bumpDay ? ' bump' : '') : '');
      cells += '<button type="button" class="' + cls + '" data-act="day" data-v="' + s + '" aria-label="' + esc(fmtDay(d) + (raws.length ? ', ' + raws.length + ' Einträge' : '')) + '" aria-pressed="' + (s === sel) + '"><span class="num">' + d.getDate() + '</span><span class="dots">' + dots + '</span></button>';
    }
    ui.bumpDay = false;
    const gridAnim = ui.gridAnim; ui.gridAnim = '';
    const sd = parseD(sel);
    const raws = rawFor(sd);
    return topBar() +
      '<div class="title-row"><h1 class="big">' + MON[mBase.getMonth()] + ' <span style="color:var(--muted);font-weight:500">' + mBase.getFullYear() + '</span></h1>' +
      '<div class="month-nav"><button type="button" class="icon-btn" data-act="month" data-d="-1" aria-label="Vorheriger Monat">' + icon('chevL') + '</button><button type="button" class="icon-btn" data-act="month" data-d="1" aria-label="Nächster Monat">' + icon('chevR') + '</button></div></div>' +
      '<div class="card cal" data-swipe="month"><div class="cal-head">' + WD.map((w) => '<span>' + w.toUpperCase() + '</span>').join('') + '</div><div class="cal-grid ' + gridAnim + '">' + cells + '</div></div>' +
      (ui.monthOff !== 0 ? '<button type="button" class="pill" data-act="month-today" style="align-self:center">Zurück zu heute</button>' : '') +
      '<section class="group"><h2 class="group-label">' + esc(fmtDay(sd)) + '</h2>' +
      (raws.length
        ? '<div class="card list">' + raws.map((r) => rowHtml(r)).join('') + '</div>'
        : '<div class="card hint">Keine Einträge an diesem Tag. Mit dem Plus-Button legst du einen an.</div>') +
      '</section>';
  }

  function scrListen() {
    const t0 = today();
    const openIn = (days) => { let c = 0; days.forEach((d) => rawFor(d).forEach((r) => { if (isCheckable(r) && !data.done[r.key]) c++; })); return c; };
    const week = []; for (let i = 0; i <= 6 - wdOf(t0); i++) week.push(addDays(t0, i));
    const month = []; const lm = new Date(t0.getFullYear(), t0.getMonth() + 1, 0).getDate(); for (let i = 0; i <= lm - t0.getDate(); i++) month.push(addDays(t0, i));
    const undated = data.items.filter((it) => it.type === 'aufgabe' && !it.date && !data.done[it.id + '|-']).length;
    const tiles = [
      ['tag', 'Heute', 'offen', openIn([t0]) + overdueItems().length, true],
      ['woche', 'Diese Woche', 'offen bis Sonntag', openIn(week)],
      ['monat', 'Dieser Monat', 'offen im ' + MON[t0.getMonth()], openIn(month)],
      ['irgendwann', 'Irgendwann', 'ohne Datum', undated]
    ];
    const lists = data.lists.map((l) => {
      const n = data.items.filter((it) => it.listId === l.id && it.type === 'aufgabe' && !data.done[it.id + '|' + (it.date || '-')]).length;
      return '<button type="button" class="link-row" data-act="list-open" data-id="' + l.id + '"><span class="badge" style="' + colorVars(l.color) + '">' + esc(l.name.charAt(0).toUpperCase()) + '</span>' +
        '<span class="grow"><span class="name">' + esc(l.name) + '</span></span><span class="num">' + n + '</span>' + icon('chevR', 'chev') + '</button>';
    }).join('');
    return topBar() +
      '<div class="title-row"><h1 class="big">Listen</h1><button type="button" class="pill" data-act="list-new">' + icon('plus') + 'Neue Liste</button></div>' +
      '<div class="tiles">' + tiles.map((t) => '<button type="button" class="tile' + (t[4] ? ' dark' : '') + '" data-act="smart" data-v="' + t[0] + '"><span class="count">' + t[3] + '</span><b>' + t[1] + '</b><small>' + esc(t[2]) + '</small></button>').join('') + '</div>' +
      '<section class="group"><h2 class="group-label">Meine Listen</h2>' +
      (lists ? '<div class="card links">' + lists + '</div>' : '<div class="card hint">Noch keine Listen. Lege z. B. „Einkauf“, „Haushalt“ oder „Geschenkideen“ an.</div>') +
      '</section>';
  }

  function scrListDetail(id) {
    const irg = id === '__irgendwann';
    const l = irg ? null : listById(id);
    if (!irg && !l) return scrListen();
    const its = irg ? data.items.filter((it) => it.type === 'aufgabe' && !it.date) : data.items.filter((it) => it.listId === id);
    const dated = its.filter((it) => it.date).sort((a, b) => a.date.localeCompare(b.date));
    const und = its.filter((it) => !it.date);
    const rows = dated.map((it) => rowHtml({ kind: it.type, it, key: it.id + '|' + it.date, d: parseD(it.date) }, { withDate: true, inList: !irg }))
      .concat(und.map((it) => rowHtml({ kind: 'aufgabe', it, key: it.id + '|-', d: null }, { inList: !irg })));
    const actions = irg ? '' : '<button type="button" class="pill" data-act="list-edit" data-id="' + id + '">' + icon('edit') + 'Bearbeiten</button><button type="button" class="pill danger" data-act="list-del" data-id="' + id + '">Löschen</button>';
    return navBar('Listen', actions) +
      '<div class="title-block"><h1 class="big">' + esc(irg ? 'Irgendwann' : l.name) + '</h1><span class="sub">' + (irg ? 'Alle Aufgaben ohne Datum' : dated.length + ' mit Datum · ' + und.length + ' ohne Datum') + '</span></div>' +
      '<form class="card quick" data-form="quick" data-list="' + (irg ? '' : id) + '"><label class="vh" for="quick-input">Neue Aufgabe</label><input id="quick-input" name="t" autocomplete="off" placeholder="Aufgabe ohne Datum hinzufügen …" enterkeyhint="done"><button type="submit" aria-label="Hinzufügen">' + icon('plus') + '</button></form>' +
      (rows.length ? '<div class="card list">' + rows.join('') + '</div>' : '<div class="card hint">Noch leer. Aufgaben mit Datum legst du über den Plus-Button an – sie erscheinen dann auch im Kalender.</div>');
  }

  function planStats(pl) {
    const ss = planSessions(pl);
    const dn = ss.filter((s) => data.done['pl' + pl.id + '|' + s]).length;
    return { ss, dn, pct: ss.length ? Math.round(dn / ss.length * 100) : 0 };
  }
  const daysLabel = (pl) => WD.filter((_, i) => pl.days[i]).join(', ');

  function scrTraining() {
    const ts = ymd(today());
    const grow = ui.fresh ? ' grow' : '';
    const cards = data.plans.slice().sort((a, b) => (a.start || '').localeCompare(b.start || '')).map((pl) => {
      const st = planStats(pl);
      const active = ts >= pl.start && ts <= pl.end, future = ts < pl.start;
      return '<button type="button" class="plan-card' + (ui.justAdded === pl.id ? ' enter' : '') + '" data-act="plan-open" data-id="' + pl.id + '">' +
        '<span class="head"><span style="display:flex;flex-direction:column;gap:2px"><h3>' + esc(pl.name) + '</h3><span class="sub">' + esc(fmtShort(parseD(pl.start)) + ' – ' + fmtShort(parseD(pl.end)) + ' · ' + daysLabel(pl)) + '</span></span>' +
        '<span class="state' + (active ? ' active' : '') + '">' + (active ? 'aktiv' : (future ? 'geplant' : 'beendet')) + '</span></span>' +
        '<span class="bar plain' + grow + '" style="--w:' + st.pct + '%"><span></span></span>' +
        '<span class="sub">' + st.dn + ' von ' + st.ss.length + ' Einheiten erledigt</span></button>';
    }).join('');
    return topBar() +
      '<div class="title-row"><h1 class="big">Training</h1><button type="button" class="pill" data-act="plan-new">' + icon('plus') + 'Neuer Plan</button></div>' +
      (cards || emptyState('dumbbell', 'Noch kein Trainingsplan', 'Wähle einen Zeitraum und deine Trainingstage. Jede Einheit erscheint im Kalender und unter „Heute“ zum Abhaken.', 'Plan erstellen', 'plan-new'));
  }

  function scrPlanDetail(id) {
    const pl = planById(id);
    if (!pl) return scrTraining();
    const ts = ymd(today());
    const st = planStats(pl);
    const grow = ui.fresh ? ' grow' : '';
    const rows = st.ss.map((s) => {
      const key = 'pl' + pl.id + '|' + s, done = !!data.done[key];
      const isT = s === ts, past = s < ts;
      const badge = isT ? '<span class="mini today">Heute</span>' : (done ? '<span class="mini ok">erledigt</span>' : (past ? '<span class="mini miss">verpasst</span>' : ''));
      return '<div class="row"' + (isT ? ' id="sess-today"' : '') + '><button type="button" class="check' + (done ? ' on' : '') + (ui.popKey === key ? ' pop' : '') + '" data-act="toggle" data-key="' + key + '" aria-pressed="' + done + '" aria-label="Einheit ' + esc(fmtShort(parseD(s))) + ' erledigt">' + CHECK_SVG + '</button>' +
        '<span class="sess-label' + (done ? ' done' : '') + '">' + esc(fmtShort(parseD(s)) + (pl.time ? ' · ' + pl.time : '')) + '</span>' + badge + '</div>';
    }).join('');
    const info = [fmtLong(parseD(pl.start)) + ' – ' + fmtLong(parseD(pl.end)), daysLabel(pl), pl.time ? pl.time + ' Uhr' : 'ohne feste Uhrzeit', pl.dur ? pl.dur + ' min' : ''].filter(Boolean).join(' · ');
    return navBar('Training', '<button type="button" class="pill" data-act="plan-edit" data-id="' + id + '">' + icon('edit') + 'Plan bearbeiten</button><button type="button" class="pill danger" data-act="plan-del" data-id="' + id + '">Plan löschen</button>') +
      '<div class="hero"><h2>' + esc(pl.name) + '</h2><span class="muted">' + esc(info) + '</span>' +
      '<span class="bar' + grow + '" style="--w:' + st.pct + '%"><span></span></span><span class="muted">' + st.dn + ' von ' + st.ss.length + ' Einheiten erledigt · ' + st.pct + ' %</span></div>' +
      '<section class="group"><h2 class="group-label">Alle Einheiten</h2><div class="card list">' + (rows || '<div class="hint">Keine Einheiten im Zeitraum.</div>') + '</div></section>' +
      '<section class="group"><h2 class="group-label"><label for="plan-notes">Übungen &amp; Notizen</label></h2>' +
      '<textarea id="plan-notes" class="input notes" data-autosave="plan-notes" data-id="' + id + '" placeholder="z. B.&#10;Kniebeugen 3 × 10&#10;Bankdrücken 3 × 8&#10;Plank 3 × 45 s">' + esc(pl.notes) + '</textarea>' +
      '<span class="saved-note" id="notes-saved">Gespeichert</span></section>';
  }

  function nextBirthday(b) {
    const t0 = today();
    let nb = new Date(t0.getFullYear(), b.getMonth(), b.getDate());
    if (nb < t0) nb = new Date(t0.getFullYear() + 1, b.getMonth(), b.getDate());
    return nb;
  }
  function scrPersonen() {
    const t0 = today();
    const people = data.people.slice().sort((a, b) => a.name.localeCompare(b.name, 'de'));
    const upcoming = people.filter((p) => isDate(p.birthday)).map((p) => {
      const b = parseD(p.birthday), nb = nextBirthday(b);
      return { p, nb, diff: Math.round((nb - t0) / 86400000), age: nb.getFullYear() - b.getFullYear() };
    }).sort((a, b) => a.diff - b.diff).slice(0, 5);
    const bdays = upcoming.length ? '<section class="group"><h2 class="group-label">Nächste Geburtstage</h2><div class="bday-row">' + upcoming.map((u) =>
      '<button type="button" class="bday' + (u.diff === 0 ? ' now' : '') + '" data-act="person-open" data-id="' + u.p.id + '">' + avatar(u.p, 44) + '<b>' + esc(u.p.name.split(' ')[0]) + '</b><small>' + (u.diff === 0 ? 'heute' : (u.diff === 1 ? 'morgen' : u.nb.getDate() + '. ' + MONS[u.nb.getMonth()])) + ' · wird ' + u.age + '</small></button>').join('') + '</div></section>' : '';
    const rows = people.map((p) => {
      let sub = p.phone || p.email || '';
      if (isDate(p.birthday)) { const b = parseD(p.birthday); sub = 'Geburtstag ' + b.getDate() + '. ' + MON[b.getMonth()] + (sub ? ' · ' + sub : ''); }
      return '<button type="button" class="link-row' + (ui.justAdded === p.id ? ' enter' : '') + '" data-act="person-open" data-id="' + p.id + '">' + avatar(p, 40) + '<span class="grow"><span class="name">' + esc(p.name) + '</span>' + (sub ? '<span class="meta">' + esc(sub) + '</span>' : '') + '</span>' + icon('chevR', 'chev') + '</button>';
    }).join('');
    return topBar() +
      '<div class="title-row"><h1 class="big">Personen</h1><button type="button" class="pill" data-act="person-new">' + icon('plus') + 'Person</button></div>' +
      (people.length ? bdays + '<section class="group"><h2 class="group-label">Alle · ' + people.length + '</h2><div class="card links">' + rows + '</div></section>'
        : emptyState('people', 'Noch keine Personen', 'Mit Geburtsdatum erscheint der Geburtstag jedes Jahr automatisch im Kalender.', 'Person hinzufügen', 'person-new'));
  }

  function scrPersonDetail(id) {
    const p = personById(id);
    if (!p) return scrPersonen();
    const qa = [];
    if (p.phone) {
      const tel = p.phone.replace(/[^\d+]/g, '');
      qa.push('<a class="qa" href="tel:' + esc(tel) + '">' + icon('phone') + 'Anrufen</a>');
      qa.push('<a class="qa" href="sms:' + esc(tel) + '">' + icon('msg') + 'Nachricht</a>');
    }
    if (p.email) qa.push('<a class="qa" href="mailto:' + esc(p.email) + '">' + icon('mail') + 'E-Mail</a>');
    let bd = '';
    if (isDate(p.birthday)) {
      const b = parseD(p.birthday), nb = nextBirthday(b);
      const diff = Math.round((nb - today()) / 86400000), age = nb.getFullYear() - b.getFullYear();
      bd = '<div class="bday-card">' + icon('gift') + '<span style="display:flex;flex-direction:column;gap:2px"><b>' + (diff === 0 ? 'Geburtstag heute · wird ' + age : 'Geburtstag in ' + diff + (diff === 1 ? ' Tag' : ' Tagen') + ' · wird ' + age) + '</b><small>' + esc(fmtLong(b)) + ' · steht jedes Jahr im Kalender</small></span></div>';
    }
    const f = [['Telefon', p.phone], ['E-Mail', p.email], ['Adresse', p.address], ['Notiz', p.note]].filter((x) => x[1]);
    return navBar('Personen', '<button type="button" class="pill" data-act="person-edit" data-id="' + id + '">' + icon('edit') + 'Bearbeiten</button><button type="button" class="pill danger" data-act="person-del" data-id="' + id + '">Löschen</button>') +
      '<div class="person-head">' + avatar(p, 88) + '<h1 class="big" style="font-size:28px">' + esc(p.name) + '</h1></div>' +
      (qa.length ? '<div class="qa-row">' + qa.join('') + '</div>' : '') + bd +
      (f.length ? '<div class="card fields">' + f.map((x) => '<div class="frow"><span>' + x[0] + '</span><b>' + esc(x[1]) + '</b></div>').join('') + '</div>'
        : '<div class="card hint">Noch keine Kontaktdaten. Tippe auf „Bearbeiten“, um Telefon, E-Mail oder Adresse einzutragen.</div>');
  }

  function scrSettings() {
    const theme = data.settings.theme || 'system';
    const tags = data.tags.map((t) => '<button type="button" class="setting-row" data-act="tag-edit" data-id="' + t.id + '"><span class="big-dot" style="--tc:' + colorHex(t.color) + '"></span><span class="grow">' + tagChip(t) +
      (t.system ? '<small style="margin-top:4px">' + (t.system === 'birthday' ? 'für Geburtstage aus Personen' : 'für Trainingseinheiten') + '</small>' : '') + '</span>' + icon('chevR', 'chev') + '</button>').join('');
    return navBar('Zurück', '') +
      '<h1 class="big">Einstellungen</h1>' +
      '<section class="group"><h2 class="group-label">Darstellung</h2>' + seg('theme', [['light', 'Hell'], ['dark', 'Dunkel'], ['system', 'Automatisch']], theme, 'theme') + '</section>' +
      '<section class="group"><h2 class="group-label">Tags</h2><div class="card links">' + tags + '</div>' +
      '<button type="button" class="btn secondary" data-act="tag-new">' + icon('plus') + 'Tag hinzufügen</button></section>' +
      '<section class="group"><h2 class="group-label">Deine Daten</h2>' +
      '<p class="data-note" style="margin:0">Alles, was du einträgst, bleibt auf diesem Gerät gespeichert – auch wenn die App ein Update bekommt. Für einen Gerätewechsel oder zur Sicherheit kannst du ein Backup speichern.</p>' +
      '<div class="btn-col"><button type="button" class="btn secondary" data-act="export">' + icon('download') + 'Backup speichern</button>' +
      '<button type="button" class="btn secondary" data-act="import">' + icon('upload') + 'Backup einspielen</button>' +
      '<button type="button" class="btn ' + (ui.resetArmed ? 'armed' : 'danger') + '" data-act="reset-all">' + icon('trash') + (ui.resetArmed ? 'Wirklich alles löschen? Nochmal tippen' : 'Alle Daten löschen') + '</button></div></section>' +
      '<div class="about"><img src="icons/app-icon.png" alt=""><b style="color:var(--text)">Orbit</b><span>Version ' + APP_VERSION + '</span></div>';
  }

  function screenHtml() {
    const t = top();
    if (t) {
      if (t.kind === 'settings') return scrSettings();
      if (t.kind === 'list') return scrListDetail(t.id);
      if (t.kind === 'plan') return scrPlanDetail(t.id);
      if (t.kind === 'person') return scrPersonDetail(t.id);
    }
    switch (ui.tab) {
      case 'kalender': return scrKalender();
      case 'listen': return scrListen();
      case 'training': return scrTraining();
      case 'personen': return scrPersonen();
      default: return scrHeute();
    }
  }

  // ---------- Darstellen & Übergänge ----------
  const stage = $('#stage');
  function show(anim) {
    anim = anim || 'none';
    ui.fresh = anim !== 'none';
    const old = stage.querySelector('.screen:not(.leaving)');
    const html = screenHtml();
    if (anim === 'none' && old) {
      const sc = old.scrollTop;
      const active = document.activeElement && document.activeElement.id;
      old.innerHTML = html;
      old.scrollTop = sc;
      if (active && active !== 'quick-input') { const el = document.getElementById(active); if (el && el.tagName === 'TEXTAREA') el.focus(); }
      after(old);
    } else {
      const el = document.createElement('section');
      el.className = 'screen';
      el.innerHTML = html;
      stage.appendChild(el);
      if (old) {
        old.classList.add('leaving', 'out-' + anim);
        el.classList.add('in-' + anim);
        let doneFlag = false;
        const finish = () => { if (doneFlag) return; doneFlag = true; old.remove(); el.classList.remove('in-' + anim); };
        el.addEventListener('animationend', (e) => { if (e.target === el) finish(); });
        setTimeout(finish, 480);
      }
      after(el);
    }
    ui.justAdded = null;
    ui.popKey = null;
    updateChrome();
  }
  function after(root) {
    $$('[data-seg-to]', root).forEach((el) => {
      el.getBoundingClientRect();
      requestAnimationFrame(() => { el.style.setProperty('--i', el.dataset.segTo); el.removeAttribute('data-seg-to'); });
    });
    if (ui.scrollToToday) {
      ui.scrollToToday = false;
      const t = $('#sess-today', root);
      if (t) setTimeout(() => t.scrollIntoView({ block: 'center', behavior: 'smooth' }), 380);
    }
  }
  function updateChrome() {
    const idx = TABS.findIndex((t) => t.id === ui.tab);
    const tb = $('#tabbar');
    tb.style.setProperty('--i', idx);
    $$('.tab', tb).forEach((b, i) => { if (i === idx) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    const t = top();
    const fab = $('#fab');
    let hide = false, label = 'Neuer Eintrag';
    if (t && (t.kind === 'settings' || t.kind === 'plan' || t.kind === 'person')) hide = true;
    if (!t && ui.tab === 'training') label = 'Neuer Trainingsplan';
    if (!t && ui.tab === 'personen') label = 'Neue Person';
    fab.classList.toggle('hidden', hide);
    fab.setAttribute('aria-label', label);
  }
  function buildTabbar() {
    $('#tabbar').innerHTML = '<span class="tab-ind" aria-hidden="true"></span>' + TABS.map((t) => '<button type="button" class="tab" data-act="tab" data-v="' + t.id + '">' + icon(t.icon) + '<span>' + t.label + '</span></button>').join('');
  }

  function switchTab(id, anim) {
    const from = TABS.findIndex((t) => t.id === ui.tab), to = TABS.findIndex((t) => t.id === id);
    if (from === to && !ui.stack.length) { const s = stage.querySelector('.screen:not(.leaving)'); if (s) s.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const wasStack = ui.stack.length > 0;
    ui.tab = id; ui.stack = []; ui.resetArmed = false;
    show(anim || (from === to ? (wasStack ? 'pop' : 'fade') : (to > from ? 'tabL' : 'tabR')));
  }
  function push(entry) { ui.stack.push(entry); show('push'); }
  function back() { if (!ui.stack.length) return; ui.stack.pop(); ui.resetArmed = false; show('pop'); }
  function openDetail(tab, entry) {
    if (ui.tab !== tab) { ui.tab = tab; ui.stack = [entry]; show('push'); }
    else push(entry);
  }

  // ---------- Toast ----------
  let toastTimer = null, toastUndo = null;
  function toast(msg, undoSnap) {
    const el = $('#toast');
    toastUndo = undoSnap || null;
    el.innerHTML = '<span>' + esc(msg) + '</span>' + (undoSnap ? '<button type="button" data-act="undo">Rückgängig</button>' : '');
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.classList.remove('show'); toastUndo = null; }, undoSnap ? 5500 : 2200);
  }

  // ---------- Bottom-Sheets (Formulare) ----------
  const sheetRoot = $('#sheet-root');
  const SHEETS = {
    entry: { title: (f) => (f.id ? 'Eintrag bearbeiten' : 'Neuer Eintrag'), body: entryForm, save: saveEntry },
    entryView: { title: () => 'Details', body: entryView, save: null },
    list: { title: (f) => (f.id ? 'Liste bearbeiten' : 'Neue Liste'), body: listForm, save: saveList },
    person: { title: (f) => (f.id ? 'Person bearbeiten' : 'Neue Person'), body: personForm, save: savePerson },
    plan: { title: (f) => (f.id ? 'Plan bearbeiten' : 'Neuer Trainingsplan'), body: planForm, save: savePlan },
    tag: { title: (f) => (f.id ? 'Tag bearbeiten' : 'Neuer Tag'), body: tagForm, save: saveTag }
  };
  function openSheet(kind, f, replace) {
    const wasOpen = !!ui.sheet;
    $('#toast').classList.remove('show');
    ui.sheet = { kind, f: f || {}, err: '' };
    const cfg = SHEETS[kind];
    sheetRoot.innerHTML = '<div class="backdrop" data-act="sheet-close"></div>' +
      '<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">' +
      '<div class="sheet-grab" aria-hidden="true"><span></span></div>' +
      '<div class="sheet-head"><button type="button" class="left" data-act="sheet-close">' + (cfg.save ? 'Abbrechen' : 'Schließen') + '</button><h2 id="sheet-title">' + esc(cfg.title(ui.sheet.f)) + '</h2>' +
      (cfg.save ? '<button type="button" class="right" data-act="sheet-save">Sichern</button>' : '<span></span>') + '</div>' +
      '<div class="sheet-body"></div></div>';
    renderSheetBody();
    bindSheetDrag();
    if (replace && wasOpen) { sheetRoot.classList.add('open'); }
    else {
      sheetRoot.getBoundingClientRect();
      requestAnimationFrame(() => sheetRoot.classList.add('open'));
    }
    const af = $('[data-autofocus]', sheetRoot);
    if (af && !ui.sheet.f.id) setTimeout(() => { try { af.focus({ preventScroll: true }); } catch (e) { /* egal */ } }, 380);
  }
  function renderSheetBody() {
    if (!ui.sheet) return;
    const body = $('.sheet-body', sheetRoot);
    const sc = body.scrollTop;
    body.innerHTML = (ui.sheet.err ? '<div class="err" role="alert">' + esc(ui.sheet.err) + '</div>' : '') + SHEETS[ui.sheet.kind].body(ui.sheet.f);
    body.scrollTop = sc;
    after(body);
  }
  function closeSheet() {
    if (!ui.sheet) return;
    ui.sheet = null;
    sheetRoot.classList.remove('open');
    const sh = $('.sheet', sheetRoot);
    if (sh) sh.style.transform = '';
    setTimeout(() => { if (!ui.sheet) sheetRoot.innerHTML = ''; }, 380);
  }
  function sheetErr(msg) {
    ui.sheet.err = msg;
    renderSheetBody();
    const sh = $('.sheet', sheetRoot);
    sh.classList.remove('shake'); void sh.offsetWidth; sh.classList.add('shake');
    $('.sheet-body', sheetRoot).scrollTop = 0;
  }
  function syncForm() {
    if (!ui.sheet) return;
    $$('[data-f]', sheetRoot).forEach((el) => { if (el.matches('input,select,textarea')) ui.sheet.f[el.dataset.f] = el.value; });
  }
  function bindSheetDrag() {
    const sh = $('.sheet', sheetRoot);
    let y0 = null, dy = 0;
    const startEls = [$('.sheet-grab', sheetRoot), $('.sheet-head', sheetRoot)];
    startEls.forEach((h) => h.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      y0 = e.clientY; dy = 0; sh.classList.add('dragging');
      h.setPointerCapture(e.pointerId);
    }));
    startEls.forEach((h) => h.addEventListener('pointermove', (e) => {
      if (y0 == null) return;
      dy = Math.max(0, e.clientY - y0);
      sh.style.transform = 'translateY(' + dy + 'px)';
    }));
    const end = () => {
      if (y0 == null) return;
      y0 = null; sh.classList.remove('dragging');
      if (dy > 110) closeSheet(); else sh.style.transform = '';
    };
    startEls.forEach((h) => { h.addEventListener('pointerup', end); h.addEventListener('pointercancel', end); });
  }

  // Formular-Bausteine
  const field = (label, f, val, type, ph, extra) => '<label class="field"><span>' + label + '</span><input class="input' + (extra && extra.big ? ' big' : '') + '" data-f="' + f + '" type="' + (type || 'text') + '" value="' + esc(val) + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + (extra && extra.autofocus ? ' data-autofocus' : '') + (extra && extra.attrs ? ' ' + extra.attrs : '') + '>' + (extra && extra.hint ? '<small>' + esc(extra.hint) + '</small>' : '') + '</label>';
  const area = (label, f, val, ph) => '<label class="field"><span>' + label + '</span><textarea class="input" data-f="' + f + '" placeholder="' + esc(ph || '') + '">' + esc(val) + '</textarea></label>';
  const clearable = (label, f, val, type, hint) => '<label class="field"><span>' + label + '</span><div class="with-clear"><input class="input" data-f="' + f + '" type="' + type + '" value="' + esc(val) + '">' + (val ? '<button type="button" data-act="f-clear" data-f="' + f + '">Leeren</button>' : '') + '</div>' + (hint ? '<small>' + esc(hint) + '</small>' : '') + '</label>';
  const chipGroup = (f, opts, cur) => '<div class="chips" data-group="' + f + '">' + opts.map((o) => '<button type="button" class="chip' + (o.v === cur ? ' on' : '') + '" data-act="f-set" data-f="' + f + '" data-v="' + esc(o.v) + '" aria-pressed="' + (o.v === cur) + '"' + (o.color ? ' style="' + colorVars(o.color) + '"' : '') + '>' + (o.color ? '<span class="dot"></span>' : '') + esc(o.label) + '</button>').join('') + '</div>';
  const swatches = (cur) => '<div class="swatches" data-group="color">' + PALETTE.map((p) => '<button type="button" class="swatch' + (p.id === cur ? ' on' : '') + '" style="--tc:' + p.c + '" data-act="f-set" data-f="color" data-v="' + p.id + '" aria-label="' + p.name + '" aria-pressed="' + (p.id === cur) + '">' + icon('tick') + '</button>').join('') + '</div>';

  function entryForm(f) {
    const task = f.type === 'aufgabe';
    const noDate = task && f.noDate;
    let h = seg('type', [['termin', 'Termin'], ['aufgabe', 'Aufgabe']], f.type, 'f-type');
    h += field('Titel', 'title', f.title, 'text', task ? 'z. B. Rezept abholen' : 'z. B. Zahnarzt', { big: true, autofocus: true, attrs: 'autocomplete="off" enterkeyhint="done"' });
    if (task) h += '<button type="button" class="switch-row" role="switch" aria-checked="' + !!noDate + '" data-act="f-toggle" data-f="noDate"><span>Ohne Datum<small>landet unter „Irgendwann“</small></span><span class="switch"></span></button>';
    if (!noDate) {
      h += '<div class="two">' + field('Datum', 'date', f.date, 'date') + clearable(task ? 'Bis (optional)' : 'Beginn (optional)', 'time', f.time, 'time') + '</div>';
      if (!task) h += clearable('Ende (optional)', 'end', f.end, 'time', 'Ohne Uhrzeit gilt der Termin als ganztägig.');
      h += '<label class="field"><span>Wiederholen</span><select class="input" data-f="repeat">' +
        [['none', 'Nie'], ['daily', 'Täglich'], ['weekly', 'Wöchentlich'], ['monthly', 'Monatlich'], ['yearly', 'Jährlich']].map((o) => '<option value="' + o[0] + '"' + (f.repeat === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></label>';
    }
    h += '<div class="field"><span class="label">Tag</span>' + chipGroup('tagId', [{ v: '', label: 'Kein Tag', color: 'grau' }].concat(data.tags.map((t) => ({ v: t.id, label: t.name, color: t.color }))), f.tagId || '') +
      '<small style="font-size:12px;color:var(--muted)">Tags bearbeitest du in den Einstellungen (Zahnrad oben rechts).</small></div>';
    h += '<div class="field"><span class="label">Liste</span>' + chipGroup('listId', [{ v: '', label: 'Keine Liste' }].concat(data.lists.map((l) => ({ v: l.id, label: l.name, color: l.color }))), f.listId || '') + '</div>';
    return h;
  }
  function entryView(f) {
    const it = itemById(f.id);
    if (!it) return '<div class="hint">Dieser Eintrag existiert nicht mehr.</div>';
    const rows = [['Art', it.type === 'termin' ? 'Termin' : 'Aufgabe'], ['Datum', it.date ? fmtDay(parseD(it.date)) + ' ' + parseD(it.date).getFullYear() : 'ohne Datum (Irgendwann)']];
    if (it.time) rows.push([it.type === 'termin' ? 'Uhrzeit' : 'Bis', it.time + (it.end ? ' – ' + it.end : '')]);
    else if (it.date && it.type === 'termin') rows.push(['Uhrzeit', 'ganztägig']);
    if (REP[it.repeat]) rows.push(['Wiederholung', REP[it.repeat]]);
    const tg = tagById(it.tagId);
    if (it.listId && listById(it.listId)) rows.push(['Liste', listById(it.listId).name]);
    return '<span class="detail-title">' + esc(it.title) + '</span>' + (tg ? '<div>' + tagChip(tg) + '</div>' : '') +
      '<div class="card fields">' + rows.map((r) => '<div class="frow"><span>' + r[0] + '</span><b>' + esc(r[1]) + '</b></div>').join('') + '</div>' +
      '<div class="btn-col"><button type="button" class="btn primary" data-act="item-edit" data-id="' + it.id + '">' + icon('edit') + 'Bearbeiten</button>' +
      '<button type="button" class="btn danger" data-act="item-del" data-id="' + it.id + '">' + icon('trash') + 'Löschen</button></div>';
  }
  function listForm(f) {
    return field('Name der Liste', 'name', f.name, 'text', 'z. B. Einkauf', { big: true, autofocus: true, attrs: 'autocomplete="off"' }) +
      '<div class="field"><span class="label">Farbe</span>' + swatches(f.color) + '</div>';
  }
  function personForm(f) {
    return field('Name', 'name', f.name, 'text', 'Vor- und Nachname', { big: true, autofocus: true, attrs: 'autocomplete="off"' }) +
      clearable('Geburtsdatum', 'birthday', f.birthday, 'date', 'Erscheint jedes Jahr automatisch im Kalender.') +
      field('Telefon', 'phone', f.phone, 'tel', 'z. B. 0176 …', { attrs: 'autocomplete="off"' }) +
      field('E-Mail', 'email', f.email, 'email', 'name@beispiel.de', { attrs: 'autocomplete="off"' }) +
      area('Adresse', 'address', f.address, 'Straße, PLZ Ort') +
      area('Notiz', 'note', f.note, 'Hobbys, Geschenkideen …');
  }
  function planPreviewText(f) {
    if (!isDate(f.start) || !isDate(f.endDate)) return '';
    if (f.endDate < f.start) return 'Das Ende liegt vor dem Start.';
    const n = planSessions({ start: f.start, end: f.endDate, days: f.days || [] }).length;
    if (!(f.days || []).some(Boolean)) return 'Wähle deine Trainingstage.';
    return n + ' Einheiten – jede erscheint im Kalender und unter „Heute“ zum Abhaken.';
  }
  function planForm(f) {
    return field('Name des Plans', 'name', f.name, 'text', 'z. B. Kraft & Ausdauer', { big: true, autofocus: true, attrs: 'autocomplete="off"' }) +
      '<div class="two">' + field('Start', 'start', f.start, 'date') + field('Ende', 'endDate', f.endDate, 'date') + '</div>' +
      '<div class="chips">' + [4, 6, 8, 12].map((w) => '<button type="button" class="chip" data-act="plan-dur" data-w="' + w + '">' + w + ' Wochen</button>').join('') + '</div>' +
      '<div class="field"><span class="label">Trainingstage</span><div class="days" data-group="days">' + WD.map((d, i) => '<button type="button" class="chip' + (f.days[i] ? ' on' : '') + '" data-act="f-day" data-i="' + i + '" aria-pressed="' + !!f.days[i] + '">' + d + '</button>').join('') + '</div></div>' +
      '<div class="two">' + clearable('Uhrzeit (optional)', 'time', f.time, 'time') + field('Dauer (optional)', 'dur', f.dur, 'number', 'Minuten', { attrs: 'inputmode="numeric" min="0"' }) + '</div>' +
      '<small style="font-size:12px;color:var(--muted);margin-top:-8px">Ohne Uhrzeit steht das Training einfach am jeweiligen Tag an.</small>' +
      area('Übungen & Notizen', 'notes', f.notes, 'z. B. Kniebeugen 3 × 10, Bankdrücken 3 × 8 …') +
      '<p class="data-note" id="plan-preview" style="margin:0">' + esc(planPreviewText(f)) + '</p>';
  }
  function tagForm(f) {
    const t = f.id ? tagById(f.id) : null;
    return field('Name', 'name', f.name, 'text', 'z. B. Sport', { big: true, autofocus: true, attrs: 'autocomplete="off"' }) +
      '<div class="field"><span class="label">Farbe</span>' + swatches(f.color) + '</div>' +
      '<div class="preview">Vorschau: <span id="tag-preview">' + tagChip({ name: f.name || 'Tag', color: f.color }) + '</span></div>' +
      (t && t.system ? '<p class="data-note" style="margin:0">Dieser Tag wird automatisch ' + (t.system === 'birthday' ? 'für Geburtstage' : 'für Trainingseinheiten') + ' verwendet. Name und Farbe kannst du ändern, löschen geht nicht.</p>' : '') +
      (t && !t.system ? '<button type="button" class="btn danger" data-act="tag-del" data-id="' + t.id + '">' + icon('trash') + 'Tag löschen</button>' : '');
  }

  // ---------- Speichern ----------
  function saveEntry() {
    syncForm();
    const f = ui.sheet.f;
    const title = (f.title || '').trim();
    if (!title) return sheetErr('Bitte einen Titel eingeben.');
    const noDate = f.type === 'aufgabe' && f.noDate;
    if (!noDate && !isDate(f.date)) return sheetErr('Bitte ein Datum wählen.');
    if (!noDate && f.type === 'termin' && f.time && f.end && f.end < f.time) return sheetErr('Das Ende liegt vor dem Beginn.');
    const rec = {
      id: f.id || uid(), type: f.type, title,
      date: noDate ? '' : f.date, time: noDate ? '' : (f.time || ''),
      end: (!noDate && f.type === 'termin' && f.time) ? (f.end || '') : '',
      repeat: noDate ? 'none' : (f.repeat || 'none'), tagId: f.tagId || '', listId: f.listId || ''
    };
    if (f.id) { const i = data.items.findIndex((x) => x.id === f.id); if (i >= 0) data.items[i] = Object.assign({}, data.items[i], rec); }
    else data.items.push(rec);
    persist();
    closeSheet();
    ui.justAdded = rec.id;
    show('none');
    toast(f.id ? 'Änderungen gespeichert' : (rec.type === 'termin' ? 'Termin angelegt' : 'Aufgabe angelegt'));
  }
  function saveList() {
    syncForm();
    const f = ui.sheet.f, name = (f.name || '').trim();
    if (!name) return sheetErr('Bitte einen Namen eingeben.');
    if (f.id) { const l = listById(f.id); if (l) { l.name = name; l.color = f.color; } }
    else data.lists.push({ id: uid(), name, color: f.color || 'grau' });
    persist(); closeSheet(); show('none');
    toast(f.id ? 'Liste gespeichert' : 'Liste angelegt');
  }
  function savePerson() {
    syncForm();
    const f = ui.sheet.f, name = (f.name || '').trim();
    if (!name) return sheetErr('Bitte einen Namen eingeben.');
    if (f.birthday && !isDate(f.birthday)) return sheetErr('Das Geburtsdatum ist ungültig.');
    if (f.birthday && f.birthday > ymd(today())) return sheetErr('Das Geburtsdatum liegt in der Zukunft.');
    const rec = { name, birthday: f.birthday || '', phone: (f.phone || '').trim(), email: (f.email || '').trim(), address: (f.address || '').trim(), note: (f.note || '').trim() };
    let id = f.id;
    if (id) { const p = personById(id); if (p) Object.assign(p, rec); }
    else { id = uid(); data.people.push(Object.assign({ id }, rec)); }
    persist(); closeSheet();
    ui.justAdded = id;
    show('none');
    toast(f.id ? 'Person gespeichert' : 'Person hinzugefügt');
  }
  function savePlan() {
    syncForm();
    const f = ui.sheet.f, name = (f.name || '').trim();
    if (!name) return sheetErr('Bitte einen Namen eingeben.');
    if (!isDate(f.start) || !isDate(f.endDate)) return sheetErr('Bitte Start und Ende wählen.');
    if (f.endDate < f.start) return sheetErr('Das Ende liegt vor dem Start.');
    if (!f.days.some(Boolean)) return sheetErr('Bitte mindestens einen Trainingstag wählen.');
    const rec = { name, start: f.start, end: f.endDate, days: f.days.slice(), time: f.time || '', dur: String(f.dur || '').trim(), notes: f.notes || '' };
    let id = f.id;
    if (id) { const p = planById(id); if (p) Object.assign(p, rec); }
    else { id = uid(); data.plans.push(Object.assign({ id }, rec)); }
    persist(); closeSheet();
    ui.justAdded = id;
    show('none');
    toast(f.id ? 'Plan gespeichert' : 'Trainingsplan angelegt');
  }
  function saveTag() {
    syncForm();
    const f = ui.sheet.f, name = (f.name || '').trim();
    if (!name) return sheetErr('Bitte einen Namen eingeben.');
    if (data.tags.some((t) => t.id !== f.id && t.name.toLowerCase() === name.toLowerCase())) return sheetErr('Diesen Tag gibt es schon.');
    if (f.id) { const t = tagById(f.id); if (t) { t.name = name; t.color = f.color; } }
    else data.tags.push({ id: uid(), name, color: f.color || 'blau' });
    persist(); closeSheet(); show('none');
    toast(f.id ? 'Tag gespeichert' : 'Tag angelegt');
  }

  function removeWithUndo(msg, fn, afterFn) {
    const snap = snapshot();
    fn();
    persist();
    if (afterFn) afterFn(); else show('none');
    toast(msg, snap);
  }

  // ---------- Theme ----------
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  function applyTheme(animate) {
    const pref = data.settings.theme || 'system';
    const t = pref === 'system' ? (mq.matches ? 'dark' : 'light') : pref;
    const html = document.documentElement;
    if (animate) { html.classList.add('theme-anim'); setTimeout(() => html.classList.remove('theme-anim'), 420); }
    html.dataset.theme = t;
    const bars = plugin('SystemBars');
    if (bars && bars.setStyle) bars.setStyle({ style: t === 'dark' ? 'DARK' : 'LIGHT' }).catch(() => {});
  }
  if (mq.addEventListener) mq.addEventListener('change', () => { if ((data.settings.theme || 'system') === 'system') applyTheme(true); });

  // ---------- Backup ----------
  function exportData() {
    const json = JSON.stringify(Object.assign({ exportiert: new Date().toISOString(), app: 'Orbit ' + APP_VERSION }, data), null, 2);
    const name = 'orbit-backup-' + ymd(today()) + '.json';
    const blob = new Blob([json], { type: 'application/json' });
    const fsys = plugin('Filesystem'), share = plugin('Share');
    if (fsys && share) {
      fsys.writeFile({ path: name, data: json, directory: 'CACHE', encoding: 'utf8' })
        .then((r) => share.share({ title: 'Orbit-Backup', files: [r.uri], dialogTitle: 'Backup speichern oder teilen' }))
        .catch((e) => { if (!/cancel/i.test(String(e && e.message))) toast('Backup konnte nicht geteilt werden.'); });
      return;
    }
    try {
      const file = new File([blob], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
        navigator.share({ files: [file], title: 'Orbit-Backup' }).catch(() => {});
        return;
      }
    } catch (e) { /* weiter mit Download */ }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Backup gespeichert');
  }
  $('#import-file').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    file.text().then((txt) => {
      const d = JSON.parse(txt);
      if (!d || typeof d !== 'object' || !Array.isArray(d.items)) throw new Error('kein Orbit-Backup');
      const snap = snapshot();
      data = migrate(d);
      persist(); applyTheme(true); show('fade');
      toast('Backup eingespielt', snap);
    }).catch(() => toast('Diese Datei ist kein gültiges Orbit-Backup.'));
  });

  // ---------- Aktionen ----------
  const A = {
    tab: (el) => switchTab(el.dataset.v),
    back: () => back(),
    settings: () => push({ kind: 'settings' }),
    range: (el) => {
      const order = ['tag', 'woche', 'monat'];
      const from = order.indexOf(ui.range), to = order.indexOf(el.dataset.v);
      if (from === to) return;
      ui.segFrom.range = from; ui.range = el.dataset.v; ui.contentAnim = to > from ? 'anim-l' : 'anim-r';
      show('none');
    },
    month: (el) => { const d = Number(el.dataset.d); ui.monthOff += d; ui.gridAnim = d > 0 ? 'slide-l' : 'slide-r'; show('none'); },
    'month-today': () => { ui.gridAnim = ui.monthOff > 0 ? 'slide-r' : 'slide-l'; ui.monthOff = 0; ui.selDay = ymd(today()); show('none'); },
    day: (el) => {
      ui.selDay = el.dataset.v; ui.bumpDay = true;
      const t0 = today(), d = parseD(el.dataset.v);
      const off = (d.getFullYear() - t0.getFullYear()) * 12 + d.getMonth() - t0.getMonth();
      if (off !== ui.monthOff) { ui.gridAnim = off > ui.monthOff ? 'slide-l' : 'slide-r'; ui.monthOff = off; }
      show('none');
    },
    toggle: (el) => {
      const k = el.dataset.key;
      if (data.done[k]) delete data.done[k]; else data.done[k] = true;
      persist();
      ui.popKey = k;
      if (navigator.vibrate && data.done[k]) navigator.vibrate(12);
      show('none');
    },
    smart: (el) => {
      const v = el.dataset.v;
      if (v === 'irgendwann') return push({ kind: 'list', id: '__irgendwann' });
      ui.range = v; ui.tab = 'heute'; ui.stack = []; show('tabR');
    },
    fab: () => {
      const t = top();
      if (!t && ui.tab === 'training') return A['plan-new']();
      if (!t && ui.tab === 'personen') return A['person-new']();
      const base = { type: 'termin', title: '', date: ymd(today()), time: '', end: '', repeat: 'none', tagId: '', listId: '', noDate: false };
      if (!t && ui.tab === 'kalender') base.date = ui.selDay || ymd(today());
      if (!t && ui.tab === 'listen') { base.type = 'aufgabe'; }
      if (t && t.kind === 'list') { base.type = 'aufgabe'; if (t.id === '__irgendwann') base.noDate = true; else base.listId = t.id; }
      openSheet('entry', base);
    },
    'item-open': (el) => openSheet('entryView', { id: el.dataset.id }),
    'item-edit': (el) => {
      const it = itemById(el.dataset.id); if (!it) return;
      openSheet('entry', { id: it.id, type: it.type, title: it.title, date: it.date || ymd(today()), time: it.time, end: it.end, repeat: it.repeat || 'none', tagId: it.tagId, listId: it.listId, noDate: !it.date }, true);
    },
    'item-del': (el) => {
      const id = el.dataset.id;
      closeSheet();
      removeWithUndo('Eintrag gelöscht', () => { data.items = data.items.filter((x) => x.id !== id); });
    },
    'list-new': () => openSheet('list', { name: '', color: PALETTE[data.lists.length % 9].id }),
    'list-open': (el) => push({ kind: 'list', id: el.dataset.id }),
    'list-edit': (el) => { const l = listById(el.dataset.id); if (l) openSheet('list', { id: l.id, name: l.name, color: l.color }); },
    'list-del': (el) => {
      const id = el.dataset.id;
      removeWithUndo('Liste gelöscht (Aufgaben bleiben erhalten)', () => {
        data.lists = data.lists.filter((l) => l.id !== id);
        data.items.forEach((it) => { if (it.listId === id) it.listId = ''; });
        ui.stack.pop();
      }, () => show('pop'));
    },
    'plan-new': () => openSheet('plan', { name: '', start: ymd(today()), endDate: ymd(addDays(today(), 8 * 7 - 1)), days: WD.map(() => false), time: '', dur: '', notes: '' }),
    'plan-open': (el) => { ui.scrollToToday = true; openDetail('training', { kind: 'plan', id: el.dataset.id }); },
    'plan-edit': (el) => { const p = planById(el.dataset.id); if (p) openSheet('plan', { id: p.id, name: p.name, start: p.start, endDate: p.end, days: p.days.slice(), time: p.time, dur: p.dur, notes: p.notes }); },
    'plan-del': (el) => {
      const id = el.dataset.id;
      removeWithUndo('Trainingsplan gelöscht', () => { data.plans = data.plans.filter((p) => p.id !== id); ui.stack.pop(); }, () => show('pop'));
    },
    'plan-dur': (el) => {
      syncForm();
      const f = ui.sheet.f;
      const s = isDate(f.start) ? f.start : ymd(today());
      f.start = s; f.endDate = ymd(addDays(parseD(s), Number(el.dataset.w) * 7 - 1));
      renderSheetBody();
    },
    'person-new': () => openSheet('person', { name: '', birthday: '', phone: '', email: '', address: '', note: '' }),
    'person-open': (el) => openDetail('personen', { kind: 'person', id: el.dataset.id }),
    'person-edit': (el) => { const p = personById(el.dataset.id); if (p) openSheet('person', Object.assign({}, p)); },
    'person-del': (el) => {
      const id = el.dataset.id;
      removeWithUndo('Person gelöscht', () => { data.people = data.people.filter((p) => p.id !== id); ui.stack.pop(); }, () => show('pop'));
    },
    'tag-new': () => openSheet('tag', { name: '', color: PALETTE[data.tags.length % PALETTE.length].id }),
    'tag-edit': (el) => { const t = tagById(el.dataset.id); if (t) openSheet('tag', { id: t.id, name: t.name, color: t.color }); },
    'tag-del': (el) => {
      const id = el.dataset.id;
      closeSheet();
      removeWithUndo('Tag gelöscht', () => {
        data.tags = data.tags.filter((t) => t.id !== id);
        data.items.forEach((it) => { if (it.tagId === id) it.tagId = ''; });
      });
    },
    theme: (el) => {
      const order = ['light', 'dark', 'system'];
      ui.segFrom.theme = order.indexOf(data.settings.theme || 'system');
      data.settings.theme = el.dataset.v; persist();
      applyTheme(true); show('none');
    },
    export: () => exportData(),
    import: () => $('#import-file').click(),
    'reset-all': () => {
      if (!ui.resetArmed) { ui.resetArmed = true; show('none'); setTimeout(() => { if (ui.resetArmed) { ui.resetArmed = false; if (top() && top().kind === 'settings') show('none'); } }, 4000); return; }
      ui.resetArmed = false;
      const theme = data.settings.theme;
      removeWithUndo('Alle Daten gelöscht', () => { data = defaultData(); data.settings.theme = theme; });
    },
    undo: () => {
      if (!toastUndo) return;
      data = migrate(JSON.parse(toastUndo));
      toastUndo = null;
      persist(); applyTheme(true);
      // geöffnete Detailseiten prüfen
      ui.stack = ui.stack.filter((s) => s.kind === 'settings' || (s.kind === 'list' && (s.id === '__irgendwann' || listById(s.id))) || (s.kind === 'plan' && planById(s.id)) || (s.kind === 'person' && personById(s.id)));
      show('fade');
      $('#toast').classList.remove('show');
    },
    'sheet-close': () => closeSheet(),
    'sheet-save': () => { const cfg = ui.sheet && SHEETS[ui.sheet.kind]; if (cfg && cfg.save) cfg.save(); },
    'f-type': (el) => {
      syncForm();
      const f = ui.sheet.f;
      if (f.type === el.dataset.v) return;
      ui.segFrom.type = f.type === 'termin' ? 0 : 1;
      f.type = el.dataset.v;
      renderSheetBody();
    },
    'f-set': (el) => {
      syncForm();
      const k = el.dataset.f;
      ui.sheet.f[k] = el.dataset.v;
      const grp = el.closest('[data-group]');
      if (grp) $$('[data-act="f-set"]', grp).forEach((b) => { const on = b === el; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
      if (ui.sheet.kind === 'tag') updateTagPreview();
    },
    'f-toggle': (el) => {
      syncForm();
      const k = el.dataset.f;
      ui.sheet.f[k] = !ui.sheet.f[k];
      el.setAttribute('aria-checked', !!ui.sheet.f[k]);
      setTimeout(renderSheetBody, 200);
    },
    'f-day': (el) => {
      syncForm();
      const i = Number(el.dataset.i);
      const days = ui.sheet.f.days;
      days[i] = !days[i];
      el.classList.toggle('on', days[i]); el.setAttribute('aria-pressed', days[i]);
      const pv = $('#plan-preview'); if (pv) pv.textContent = planPreviewText(ui.sheet.f);
    },
    'f-clear': (el) => { syncForm(); ui.sheet.f[el.dataset.f] = ''; renderSheetBody(); }
  };
  function updateTagPreview() {
    const pv = $('#tag-preview');
    if (pv && ui.sheet) pv.innerHTML = tagChip({ name: (ui.sheet.f.name || '').trim() || 'Tag', color: ui.sheet.f.color });
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const fn = A[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el, e); }
  });
  document.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-form="quick"]');
    if (!form) return;
    e.preventDefault();
    const input = form.querySelector('input');
    const t = input.value.trim();
    if (!t) return;
    const rec = { id: uid(), type: 'aufgabe', title: t, date: '', time: '', end: '', repeat: 'none', tagId: '', listId: form.dataset.list || '' };
    data.items.push(rec);
    persist();
    ui.justAdded = rec.id;
    show('none');
    const ni = $('#quick-input'); if (ni) ni.focus();
  });
  let notesTimer = null;
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset && el.dataset.autosave === 'plan-notes') {
      const pl = planById(el.dataset.id);
      if (!pl) return;
      pl.notes = el.value;
      clearTimeout(notesTimer);
      notesTimer = setTimeout(() => {
        persist();
        const n = $('#notes-saved'); if (n) { n.classList.add('show'); setTimeout(() => n.classList.remove('show'), 1200); }
      }, 400);
    }
    if (ui.sheet && el.dataset && el.dataset.f === 'name' && ui.sheet.kind === 'tag') { ui.sheet.f.name = el.value; updateTagPreview(); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ui.sheet) closeSheet();
    if (e.key === 'Enter' && ui.sheet && e.target.matches('input.input') && e.target.type !== 'date' && e.target.type !== 'time') {
      e.preventDefault();
      const cfg = SHEETS[ui.sheet.kind]; if (cfg && cfg.save) cfg.save();
    }
  });

  // ---------- Wischgesten ----------
  let sw = null;
  stage.addEventListener('touchstart', (e) => {
    if (ui.sheet || e.touches.length !== 1) { sw = null; return; }
    if (e.target.closest('input, textarea, select, .bday-row')) { sw = null; return; }
    const t = e.touches[0];
    const z = e.target.closest('[data-swipe]');
    sw = { x: t.clientX, y: t.clientY, t: Date.now(), zone: z ? z.dataset.swipe : null };
  }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    if (!sw) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - sw.x, dy = t.clientY - sw.y;
    const s = sw; sw = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.6 || Date.now() - s.t > 800) return;
    const dir = dx < 0 ? 'left' : 'right';
    if (ui.stack.length) { if (dir === 'right') back(); return; }
    if (s.zone === 'month') { A.month({ dataset: { d: dir === 'left' ? '1' : '-1' } }); return; }
    const idx = TABS.findIndex((x) => x.id === ui.tab);
    const next = idx + (dir === 'left' ? 1 : -1);
    if (next >= 0 && next < TABS.length) switchTab(TABS[next].id);
  }, { passive: true });

  // ---------- Start ----------
  buildTabbar();
  applyTheme(false);
  show('fade');
  persist();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  document.addEventListener('contextmenu', (e) => { if (!e.target.closest('input, textarea')) e.preventDefault(); });
  // Tageswechsel (App bleibt offen über Mitternacht)
  let lastDay = ymd(today());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && ymd(today()) !== lastDay) { lastDay = ymd(today()); ui.selDay = ''; show('none'); }
  });
  const appPlugin = plugin('App');
  if (appPlugin) {
    appPlugin.addListener('backButton', () => {
      if (ui.sheet) closeSheet();
      else if (ui.stack.length) back();
      else if (ui.tab !== 'heute') switchTab('heute');
      else if (appPlugin.minimizeApp) appPlugin.minimizeApp(); else appPlugin.exitApp();
    });
    appPlugin.addListener('resume', () => { if (ymd(today()) !== lastDay) { lastDay = ymd(today()); ui.selDay = ''; show('none'); } });
  }
})();
