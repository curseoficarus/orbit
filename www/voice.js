/* Orbit – Sprachversteher
 * Wandelt einen gesprochenen deutschen Satz in einen Orbit-Eintrag um.
 * Läuft komplett auf dem Gerät, ohne Internet und ohne KI-Modell.
 *
 * OrbitVoice.parse(text, { now, tags, lists }) liefert eines von:
 *   { kind: 'entry',    f: { type, title, date, endDate, time, end, repeat, repeatDays, pauseVacation, tagId, listId, noDate } }
 *   { kind: 'list-new', name, items: [] }
 *   { kind: 'list-add', listId, name, items: [] }      (listId leer = Liste existiert noch nicht)
 *   { kind: 'person',   f: { name, birthday ('JJJJ-MM-TT' oder ohne Jahr '--MM-TT'), phone, email, address, note } }
 *   { kind: 'note',     title, body }
 */
(function (root) {
  'use strict';

  // ---------- Grundlagen ----------
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const wdOf = (d) => (d.getDay() + 6) % 7;
  const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const M = '\u0001'; // Markierung für bereits verstandene Satzteile

  const MONTHS = {
    januar: 1, jänner: 1, jaenner: 1, janner: 1, jan: 1, februar: 2, feber: 2, feb: 2, märz: 3, maerz: 3, mär: 3, mrz: 3,
    april: 4, apr: 4, mai: 5, juni: 6, jun: 6, juli: 7, jul: 7, august: 8, aug: 8, september: 9, sept: 9, sep: 9,
    oktober: 10, okt: 10, november: 11, nov: 11, dezember: 12, dez: 12
  };
  const MONTH_RE = '(?:januar|jänner|jaenner|janner|jan|februar|feber|feb|märz|maerz|mär|mrz|april|apr|mai|juni|jun|juli|jul|august|aug|september|sept|sep|oktober|okt|november|nov|dezember|dez)';
  const WD_NAMES = ['montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag', 'sonntag'];
  const WD_RE = '(?:montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonnabend|sonntag)';
  const wdIndex = (w) => { w = w.replace(/s$/, ''); if (w === 'sonnabend') return 5; return WD_NAMES.indexOf(w); };

  // ---------- Zahlwörter ----------
  const UNITS = { null: 0, eins: 1, zwei: 2, zwo: 2, drei: 3, vier: 4, fünf: 5, fuenf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9 };
  const UNIT_STEMS = { ein: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9 };
  const TEENS = { zehn: 10, elf: 11, zwölf: 12, dreizehn: 13, vierzehn: 14, fünfzehn: 15, sechzehn: 16, siebzehn: 17, achtzehn: 18, neunzehn: 19 };
  const TENS = { zwanzig: 20, dreißig: 30, dreissig: 30, vierzig: 40, fünfzig: 50, sechzig: 60 };
  function cardinal(w) {
    if (w in UNITS) return UNITS[w];
    if (w in TEENS) return TEENS[w];
    if (w in TENS) return TENS[w];
    const m = /^(ein|zwei|drei|vier|fünf|sechs|sieben|acht|neun)und(zwanzig|dreißig|dreissig|vierzig|fünfzig)$/.exec(w);
    if (m) return UNIT_STEMS[m[1]] + TENS[m[2]];
    return null;
  }
  const ORD_SPECIAL = { ers: 1, erst: 1, drit: 3, sieb: 7, sieben: 7, ach: 8 };
  function ordinal(w) {
    for (const suf of ['sten', 'ster', 'stes', 'stem', 'ste', 'ten', 'ter', 'tes', 'tem', 'te']) {
      if (!w.endsWith(suf) || w.length <= suf.length + 1) continue;
      const base = w.slice(0, -suf.length);
      if (base in ORD_SPECIAL) return ORD_SPECIAL[base];
      const n = cardinal(base);
      if (n != null && n > 0) return n;
    }
    return null;
  }

  // Text, der parallel in Original-Schreibweise (orig) und klein (low) geführt wird
  function Txt(s) { this.orig = s; this.low = s.toLowerCase(); }
  Txt.prototype.sub = function (re, fn) {
    // ersetzt Treffer in low und überträgt die Ersetzung an dieselbe Stelle in orig
    let o = '', l = '', last = 0, m;
    re.lastIndex = 0;
    const g = re.global ? re : new RegExp(re.source, re.flags + 'g');
    while ((m = g.exec(this.low)) !== null) {
      if (m[0] === '') { g.lastIndex++; continue; }
      const rep = fn(m, this.orig.substr(m.index, m[0].length));
      if (rep == null) continue;
      o += this.orig.slice(last, m.index) + rep;
      l += this.low.slice(last, m.index) + rep.toLowerCase();
      last = m.index + m[0].length;
    }
    this.orig = o + this.orig.slice(last);
    this.low = l + this.low.slice(last);
    return this;
  };
  Txt.prototype.mask = function (re, fn) {
    return this.sub(re, (m, om) => { if (fn) fn(m, om); return ' ' + M + ' '; });
  };
  Txt.prototype.find = function (re) { re.lastIndex = 0; return re.exec(this.low); };

  function normalize(text) {
    let s = String(text || '')
      .replace(/[–—]/g, '-')
      .replace(/[„“”"«»]/g, ' ')
      .replace(/[!?¿¡]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const t = new Txt(s);
    // "e-mail" vereinheitlichen
    t.sub(/(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))e-?mail/g, () => 'email');
    // Zahlwörter → Ziffern ("vierundzwanzigsten" → "24.", "fünfzehn" → "15")
    t.sub(/[a-zäöüß]+/g, (m) => {
      const w = m[0];
      if (w === 'ein' || w === 'eine' || w === 'einen' || w === 'einem' || w === 'einer') return null;
      const c = cardinal(w);
      if (c != null) return String(c);
      const o = ordinal(w);
      if (o != null) return o + '.';
      return null;
    });
    // "24 ." → "24."
    t.sub(/(\d)\s+\.(?=\s|$)/g, (m) => m[1] + '.');
    return t;
  }

  // ---------- Uhrzeiten ----------
  const H = '(\\d{1,2})';
  const TIME_ALT = [
    'halb ' + H,
    '(?:\\d{1,2}|fünf|zehn|zwanzig) (?:minuten )?(?:vor|nach) halb ' + H,
    'viertel nach ' + H, 'viertel vor ' + H, 'dreiviertel ' + H, 'drei viertel ' + H, 'viertel ' + H,
    '\\d{1,2} (?:minuten )?(?:nach|vor) ' + H,
    '\\d{1,2}:\\d{2}(?: ?uhr)?', '\\d{1,2}\\.\\d{2} ?uhr',
    '\\d{1,2} ?uhr(?: \\d{1,2}(?![\\d.]))?',
    '\\d{1,2}h',
    'mittag', 'mittags', 'mitternacht'
  ].join('|');
  const TIME_RE = '(?:' + TIME_ALT + ')';
  const BARE_RE = '(?:' + TIME_ALT + '|\\d{1,2}\\.\\d{2}(?![\\d.])|\\d{1,2}(?![\\d.:]))';
  function timeVal(str) {
    str = str.trim();
    let m;
    if (/^mittags?$/.test(str)) return { h: 12, m: 0, fixed: true };
    if (str === 'mitternacht') return { h: 0, m: 0, fixed: true };
    if ((m = /^(\d{1,2}) (?:minuten )?(vor|nach) halb (\d{1,2})$/.exec(str))) return { h: +m[3] - 1, m: m[2] === 'vor' ? 30 - +m[1] : 30 + +m[1] };
    if ((m = /^(fünf|zehn|zwanzig) (?:minuten )?(vor|nach) halb (\d{1,2})$/.exec(str))) { const x = { fünf: 5, zehn: 10, zwanzig: 20 }[m[1]]; return { h: +m[3] - 1, m: m[2] === 'vor' ? 30 - x : 30 + x }; }
    if ((m = /^halb (\d{1,2})$/.exec(str))) return { h: +m[1] - 1, m: 30 };
    if ((m = /^viertel nach (\d{1,2})$/.exec(str))) return { h: +m[1], m: 15 };
    if ((m = /^viertel vor (\d{1,2})$/.exec(str))) return { h: +m[1] - 1, m: 45 };
    if ((m = /^drei ?viertel (\d{1,2})$/.exec(str))) return { h: +m[1] - 1, m: 45 };
    if ((m = /^viertel (\d{1,2})$/.exec(str))) return { h: +m[1] - 1, m: 15 };
    if ((m = /^(\d{1,2}) (?:minuten )?nach (\d{1,2})$/.exec(str))) return { h: +m[2], m: +m[1] };
    if ((m = /^(\d{1,2}) (?:minuten )?vor (\d{1,2})$/.exec(str))) return { h: +m[2] - 1, m: 60 - +m[1] };
    if ((m = /^(\d{1,2})[:.](\d{2})/.exec(str))) return { h: +m[1], m: +m[2], explicit24: +m[1] > 12 };
    if ((m = /^(\d{1,2}) ?uhr(?: (\d{1,2}))?$/.exec(str))) return { h: +m[1], m: m[2] ? +m[2] : 0, explicit24: +m[1] > 12 };
    if ((m = /^(\d{1,2})h$/.exec(str))) return { h: +m[1], m: 0 };
    if ((m = /^(\d{1,2})$/.exec(str))) return { h: +m[1], m: 0, bare: true };
    return null;
  }
  function fixHour(t, period) {
    if (!t) return null;
    let h = t.h < 0 ? 23 : t.h;
    const mi = Math.max(0, Math.min(59, t.m));
    if (!t.fixed && !t.explicit24) {
      if (period === 'pm' && h < 12) h += 12;
      else if (period === 'night' && h >= 7 && h < 12) h += 12;
      else if (!period && h >= 1 && h <= 6) h += 12; // "um 3" meint meist 15 Uhr
    }
    if (h === 24) h = 0;
    if (h > 23 || mi > 59) return null;
    return pad(h) + ':' + pad(mi);
  }
  function addMinutes(hhmm, mins) {
    const p = hhmm.split(':').map(Number);
    const t = Math.min(23 * 60 + 59, p[0] * 60 + p[1] + mins);
    return pad(Math.floor(t / 60)) + ':' + pad(t % 60);
  }

  // ---------- Datum ----------
  function nextWeekday(from, wd, allowToday) {
    const diff = (wd - wdOf(from) + 7) % 7;
    return addDays(from, diff === 0 && !allowToday ? 7 : diff);
  }
  function dayMonth(now, day, month, year) {
    let y = year || now.getFullYear();
    if (y < 100) y += 2000;
    let d = new Date(y, month - 1, day);
    if (d.getMonth() !== month - 1) return null;
    if (!year && d < now) d = new Date(y + 1, month - 1, day);
    return d;
  }
  function dayOnly(now, day) {
    let d = new Date(now.getFullYear(), now.getMonth(), day);
    if (d.getDate() !== day) return null;
    if (d < now) d = new Date(now.getFullYear(), now.getMonth() + 1, day);
    return d;
  }
  const AMOUNT = '(\\d+|einen|einem|einer|eine|ein|anderthalb|eineinhalb)';
  const amount = (s) => (/^\d+$/.test(s) ? +s : (s === 'anderthalb' || s === 'eineinhalb') ? 1.5 : 1);

  // Findet Datumsangaben, markiert sie im Text und gibt sie in Satz-Reihenfolge zurück
  function takeDates(t, now) {
    const found = [];
    const add = (m, date, extra) => { if (date) found.push(Object.assign({ pos: m.index, date }, extra || {})); };
    // 1) 24.12.2026 / 24.12. / 24.12
    t.mask(/(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:am |den |zum |vom |ab (?:dem )?|bis (?:zum )?)?(\d{1,2})\.(\d{1,2})\.?(\d{2,4})?(?![\d:])/g, (m) => {
      if (+m[2] >= 1 && +m[2] <= 12) add(m, dayMonth(now, +m[1], +m[2], m[3] ? +m[3] : 0), { year: !!m[3] });
    });
    // 2) 24. Dezember (2027)
    t.mask(new RegExp('(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:am |den |zum |vom |ab (?:dem )?|bis (?:zum )?)?(\\d{1,2})\\.? ?(?:des )?(' + MONTH_RE + ')(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))\\.?(?: (\\d{4}))?', 'g'), (m) => {
      add(m, dayMonth(now, +m[1], MONTHS[m[2]], m[3] ? +m[3] : 0), { year: !!m[3] });
    });
    // 3) heute / morgen / übermorgen (mit Tageszeit)
    t.mask(/(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(übermorgen|uebermorgen|morgen|heute)(?! ?s(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_])))(?: (früh|morgen|vormittag|mittag|nachmittag|abend|nacht))?(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/g, (m) => {
      const off = m[1] === 'heute' ? 0 : m[1] === 'morgen' ? 1 : 2;
      const per = { früh: 'am', morgen: 'am', vormittag: 'am', mittag: 'noon', nachmittag: 'pm', abend: 'pm', nacht: 'night' }[m[2]];
      add(m, addDays(now, off), { period: per });
    });
    // 4) in 3 Tagen / in einer Woche / in zwei Monaten
    t.mask(new RegExp('(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))in ' + AMOUNT + ' (tag|tagen|woche|wochen|monat|monaten|jahr|jahren)(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))', 'g'), (m) => {
      const n = amount(m[1]);
      let d;
      if (/^tag/.test(m[2])) d = addDays(now, Math.round(n));
      else if (/^woche/.test(m[2])) d = addDays(now, Math.round(n * 7));
      else if (/^monat/.test(m[2])) d = new Date(now.getFullYear(), now.getMonth() + Math.round(n), now.getDate());
      else d = new Date(now.getFullYear() + Math.round(n), now.getMonth(), now.getDate());
      add(m, d);
    });
    // 5) (nächsten|kommenden|diesen|am) Montag (nächste Woche)
    t.mask(new RegExp('(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:((?:in der )?(?:übernächste[nr]?|nächste[nr]?|kommende[nr]?) woche(?: am)?|übernächste[nr]?|nächste[nr]?|kommende[nr]?|diese[nr]?|am|den|ab|bis) )?(' + WD_RE + ')(?: (?:in der )?(übernächste[nr]? woche|nächste[nr]? woche|kommende[nr]? woche|diese[nr]? woche))?(?: (früh|morgen|vormittag|mittag|nachmittag|abend|nacht))?(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))', 'g'), (m) => {
      const wd = wdIndex(m[2]);
      let d;
      const pre = m[1] || '', post = m[3] || '';
      if (/übernächste/.test(pre + post)) d = addDays(addDays(now, -wdOf(now) + 14), wd);
      else if (/nächste|kommende/.test(post) || /woche/.test(pre)) d = addDays(addDays(now, -wdOf(now) + 7), wd);
      else if (/diese/.test(post) || /diese/.test(pre)) { d = addDays(now, wd - wdOf(now)); if (d < now) d = addDays(d, 7); }
      else d = nextWeekday(now, wd, false);
      const per = { früh: 'am', morgen: 'am', vormittag: 'am', mittag: 'noon', nachmittag: 'pm', abend: 'pm', nacht: 'night' }[m[4]];
      add(m, d, { period: per, wd: true });
    });
    // 6) nächste Woche / übernächste Woche (ohne Tag) → Montag
    t.mask(/(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:in der |ab |für )?(übernächste[nr]?|nächste[nr]?|kommende[nr]?) woche(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/g, (m) => add(m, addDays(now, -wdOf(now) + (/über/.test(m[1]) ? 14 : 7)), { week: true }));
    // 7) Wochenende, Ende der Woche, Monatsende, nächsten Monat
    t.mask(/(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:am |übers |das )?(nächste[ns]? |kommende[ns]? )?wochenende(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/g, (m) => { let d = nextWeekday(now, 5, true); if (m[1]) d = addDays(d, wdOf(now) >= 5 ? 0 : 7); add(m, d); });
    t.mask(/(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:bis )?(?:zum |am )?ende (?:der|dieser) woche(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/g, (m) => add(m, nextWeekday(now, 4, true)));
    t.mask(/(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:bis )?(?:zum |am )?(?:monatsende|ende (?:des|dieses) monats)(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/g, (m) => add(m, new Date(now.getFullYear(), now.getMonth() + 1, 0)));
    t.mask(/(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:anfang |im |ab )?(nächste[nr]?|kommende[nr]?) monat(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/g, (m) => add(m, new Date(now.getFullYear(), now.getMonth() + 1, 1)));
    // 8) am 24. (nur Tag)
    t.mask(/(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:am|den|zum|vom|ab dem|bis zum) (\d{1,2})\.(?!\d)/g, (m) => add(m, dayOnly(now, +m[1])));
    found.sort((a, b) => a.pos - b.pos);
    return found;
  }

  // Uhrzeiten (zuerst Bereiche, dann einzelne Zeiten)
  function takeTimes(t) {
    const out = { start: null, end: null, period: null, dur: null, allDay: false };
    t.mask(/(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:den ganzen tag|ganztägig|ganztags|ganzer tag)(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/g, () => { out.allDay = true; });
    const per = t.find(/(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(abends|am abend|nachmittags|am nachmittag|nachts|in der nacht|morgens|am morgen|früh|in der früh|vormittags|am vormittag|mittags)(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/);
    if (per) {
      const w = per[1];
      out.period = /abend|nachmittag/.test(w) ? 'pm' : /nacht/.test(w) ? 'night' : /mittag/.test(w) ? 'noon' : 'am';
      t.mask(new RegExp('(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))' + w + '(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))'));
    }
    t.mask(new RegExp('(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:von|zwischen|ab) (' + BARE_RE + ') (?:uhr )?(?:bis|und|-) (' + BARE_RE + ')(?: uhr)?(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))', 'g'), (m) => {
      if (out.start) return;
      out.start = timeVal(m[1]); out.end = timeVal(m[m.length - 1] ? m[m.length - 1] : '');
      out.end = timeVal(m[0].replace(/^.*?(?:bis|und|-) /, '').replace(/ uhr$/, ''));
    });
    t.mask(new RegExp('(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:um|ab|gegen|so gegen|so um|zirka um|ca\\.? um|circa um) (' + BARE_RE + ')(?: uhr)?(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))', 'g'), (m) => { if (!out.start) out.start = timeVal(m[1]); });
    t.mask(new RegExp('(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))bis (' + TIME_RE + '|\\d{1,2}(?= uhr))(?: uhr)?(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))', 'g'), (m) => { if (!out.end) out.end = timeVal(m[1]); });
    t.mask(new RegExp('(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(' + TIME_RE + ')(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))', 'g'), (m) => { if (!out.start) out.start = timeVal(m[1]); else if (!out.end) out.end = timeVal(m[1]); });
    // Dauer: "für 2 Stunden", "eine halbe Stunde", "90 Minuten"
    t.mask(new RegExp('(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:für |dauer |dauert )?(?:' + AMOUNT + ' )?(halbe |dreiviertel )?(stunden?|std|minuten?|min)(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?: lang)?', 'g'), (m) => {
      if (!m[1] && !m[2]) return;
      let n = m[1] ? amount(m[1]) : 1;
      if (m[2] === 'halbe ') n = 0.5; else if (m[2] === 'dreiviertel ') n = 0.75;
      out.dur = /^(stunde|stunden|std)$/.test(m[3]) ? Math.round(n * 60) : Math.round(n);
    });
    return out;
  }

  // Wiederholung
  function takeRepeat(t) {
    const r = { repeat: 'none', days: null, monthDay: null };
    const setDays = (arr) => { r.repeat = 'weekly'; r.days = r.days || [false, false, false, false, false, false, false]; arr.forEach((i) => { if (i >= 0) r.days[i] = true; }); };
    t.mask(/(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:werktags|wochentags|unter der woche|an werktagen|an arbeitstagen|an wochentagen|jeden werktag|jeden arbeitstag)(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/g, () => setDays([0, 1, 2, 3, 4]));
    t.mask(/(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:jedes wochenende|am wochenende immer|immer am wochenende|wochenends)(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/g, () => setDays([5, 6]));
    // Bereich: (jeden/immer) Montag bis Freitag
    t.mask(new RegExp('(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:jeden |immer |von |wöchentlich |jede woche )*(' + WD_RE + ')s? (?:bis|-) (' + WD_RE + ')s?(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))', 'g'), (m) => {
      const a = wdIndex(m[1]), b = wdIndex(m[2]);
      const arr = []; for (let i = a; ; i = (i + 1) % 7) { arr.push(i); if (i === b || arr.length > 7) break; }
      setDays(arr);
    });
    // "jeden Montag und Mittwoch", "montags und donnerstags", "immer dienstags"
    t.mask(new RegExp('(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:(?:jeden|immer|jede woche am|wöchentlich am|immer am|regelmäßig am) (' + WD_RE + ')|(' + WD_RE + ')s)((?:(?:,| und| sowie| oder) (?:jeden |am )?' + WD_RE + 's?)*)(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))', 'g'), (m) => {
      const names = (m[0].match(new RegExp(WD_RE, 'g')) || []).map(wdIndex);
      setDays(names);
    });
    t.mask(/(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:jeden tag|täglich|tagtäglich|alle tage|jeden morgen|jeden abend|immer täglich)(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/g, () => { if (r.repeat === 'none') r.repeat = 'daily'; });
    t.mask(/(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:jede woche|wöchentlich|einmal (?:in der|pro) woche|alle (?:2|zwei) wochen)(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/g, () => { if (r.repeat === 'none') r.repeat = 'weekly'; });
    t.mask(/(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:jeden|immer am|am jeden) (\d{1,2})\.(?: (?:des|im|jeden) monats?)?/g, (m) => { r.repeat = 'monthly'; r.monthDay = +m[1]; });
    t.mask(/(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:jeden monat|monatlich|einmal (?:im|pro) monat)(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/g, () => { if (r.repeat === 'none') r.repeat = 'monthly'; });
    t.mask(/(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:jedes jahr|jährlich|alljährlich|einmal (?:im|pro) jahr)(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/g, () => { r.repeat = 'yearly'; });
    return r;
  }

  // ---------- Tags & Listen ----------
  const TAG_SYNONYMS = {
    arzt: 'zahnarzt|zahnärztin|arzt|ärztin|doktor|hausarzt|hausärztin|frauenarzt|frauenärztin|augenarzt|hautarzt|orthopäde|physio|physiotherapie|krankengymnastik|untersuchung|vorsorge|impfung|blutabnahme|praxis|krankenhaus|klinik',
    arbeit: 'arbeit|arbeiten|büro|meeting|besprechung|dienst|schicht|frühschicht|spätschicht|nachtschicht|job|kunde|kundin|kundentermin|präsentation|homeoffice|chef|chefin|kollegen|kollegin|teammeeting|call|telko|konferenz',
    geburtstag: 'geburtstag|geburtstagsfeier|geburtstagsparty',
    haushalt: 'putzen|staubsaugen|saugen|wischen|wäsche|bügeln|müll|abwasch|spülmaschine|aufräumen|fenster putzen|bad putzen|haushalt|einkauf|einkaufen|lebensmittel',
    privat: 'privat|freunde|freundin|freund|familie|treffen|kaffee|essen gehen|kino|party|feier',
    training: 'training|trainieren|gym|fitness|fitnessstudio|sport|laufen|joggen|workout|krafttraining|schwimmen|yoga|radfahren'
  };
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function matchTag(t, tags) {
    // 1) ausdrücklich: "mit dem Tag Arbeit", "Kategorie Privat", "markiere es als Arzt"
    let hit = null;
    const names = tags.map((x) => esc(x.name.toLowerCase())).sort((a, b) => b.length - a.length).join('|');
    if (names) {
      t.mask(new RegExp('(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:mit (?:dem )?(?:tag|label|schlagwort)|tag|kategorie|unter|markier(?:e|t)? (?:es |ihn |sie |das )?als|als) (' + names + ')(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))', 'g'), (m) => {
        if (!hit) hit = tags.find((x) => x.name.toLowerCase() === m[1]);
      });
    }
    if (hit) return hit;
    // 2) Tag-Name kommt im Satz vor (bleibt Teil des Titels)
    for (const tg of tags.slice().sort((a, b) => b.name.length - a.name.length)) {
      if (new RegExp('(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))' + esc(tg.name.toLowerCase()) + '(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))').test(t.low)) return tg;
    }
    // 3) passende Wörter (Zahnarzt → Arzt, Meeting → Arbeit …)
    for (const tg of tags) {
      const key = tg.system === 'training' ? 'training' : tg.system === 'birthday' ? 'geburtstag' : tg.name.toLowerCase();
      const syn = TAG_SYNONYMS[key];
      if (syn && new RegExp('(?:^|[^a-zäöüß])(?:' + syn + ')(?![a-zäöüß])').test(t.low)) return tg;
    }
    return null;
  }
  function listKey(s) {
    return String(s || '').toLowerCase().replace(/liste$/, '').replace(/[-\s]+$/, '').replace(/s$/, '').replace(/[^a-zäöüß0-9]/g, '');
  }
  function findList(name, lists) {
    const k = listKey(name);
    if (!k) return null;
    return lists.find((l) => listKey(l.name) === k) ||
      lists.find((l) => { const lk = listKey(l.name); return lk && (lk.startsWith(k) || k.startsWith(lk)); }) || null;
  }

  // ---------- Titel aufräumen ----------
  const FILLER = [
    /(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:ja|jo|genau|hey|hallo|hi|okay|ok|also|ähm?|äh|ehm|öhm|hm+|nen|ne|'nen|'ne|bitte|bitteschön|danke|mal|doch|einfach|kurz|schnell|gerne?|eben|jetzt|noch|halt|so|na)(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/g,
    /(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:kannst|könntest|würdest|wirst|magst) du(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/g,
    /(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:ich (?:möchte|will|würde gerne?|hätte gerne?|brauche|bräuchte))(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/g,
    /(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:erinner(?:e|n|t)?|erinnere) (?:mich|uns)(?: bitte)?(?: daran)?(?:,? dass)?(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/g,
    /(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:nicht vergessen|vergiss nicht|denk(?:e)? (?:dran|daran))(?:,? dass)?(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/g,
    /(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:trag(?:e|t)?|schreib(?:e|t)?|notier(?:e|t)?|erstell(?:e|t)?|mach(?:e|t)?|leg(?:e|t)?|füg(?:e|t)?|setz(?:e|t)?|plan(?:e|t)?|speicher(?:e|t)?|merk(?:e|t)?|hinterleg(?:e|t)?|vermerk(?:e|t)?|nimm|nehm(?:e|t)?)(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?: (?:mir|uns|bitte|mal|doch))*/g,
    /(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:eintragen|einplanen|anlegen|hinzufügen|aufschreiben|notieren|vormerken|speichern|abspeichern|erstellen|merken|eingetragen|einzutragen)(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/g,
    /(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:in (?:den|meinen|meinem|dem) kalender|im kalender|in die app|in orbit|zum kalender)(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/g,
    /(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:(?:einen|eine|ein|einem|einer|den|die|das|neuen|neue|neuer|neues|meinen|meine) )*(?:neuen |neue |neuer |neues )?(?:termin|termine|aufgabe|aufgaben|to-?do|todo|eintrag|erinnerung|event|ereignis)(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?: (?:für|zum thema|mit dem inhalt|über))?/g,
    /(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:ich (?:habe|hab|hätte|muss|müsste|sollte|soll|will|möchte|werde)|ich hab['’]?|wir (?:haben|müssen|sollten))(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/g,
    /(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:dass ich|dass wir|dass du|daran|darum|dran|du)(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/g,
    /(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:einträgst|einträgt|einplanst|notierst|hinzufügst|anlegst|aufschreibst|machst|erstellst|speicherst|einschreibst|einzutragen|eintragen kannst|reinschreibst|vormerkst)(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/g,
    /(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:mir|uns|mich|für mich)(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/g
  ];
  function cleanTitle(s) {
    let x = ' ' + s + ' ';
    x = x.replace(/[,;:]+/g, ' ').replace(/\s+/g, ' ');
    for (let i = 0; i < 3; i++) {
      x = x.replace(/^\s*(?:und|oder|dass|das|der|die|den|dem|des|ein|eine|einen|einem|einer|zu|zum|zur|beim|bei|am|um|an|im|in|für|vom|von|bis|ab|mit dem namen|namens|als|wegen|weil|dann|da|es|er|sie|ihn|wieder)\s+/i, ' ');
      x = x.replace(/\s+(?:zu|und|oder|ein|an|auf|vor|ab|hinzu|rein|bitte|am|um|im|für|von|vom|bis|den|dem|der|die|das|es|ist|sein|steht|stehen|haben|hab)\s*$/i, ' ');
    }
    x = x.trim();
    // "Steuer zu machen" → "Steuer machen"
    x = x.replace(/\s+zu\s+([a-zäöüß]+en)$/i, ' $1');
    x = x.replace(/\s+/g, ' ').replace(/^[\s.\-]+|[\s.\-]+$/g, '');
    return cap(x);
  }
  function joinRemaining(t) {
    return t.orig.split(M).map((p) => p.trim()).filter(Boolean).join(' ');
  }

  // ---------- Listen ----------
  const ITEM_SEP = /\s*(?:,|;|(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))komma(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))|(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))und(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))|(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))sowie(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))|(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))plus(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))|(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))dann(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))|(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))danach(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))|(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))außerdem(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))|(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))ausserdem(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))|(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))als nächstes(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))|(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))nächster punkt(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))|(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))neuer punkt(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))|(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))neue zeile(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))|(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))erstens(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))|(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))zweitens(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))|(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))drittens(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))|(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))viertens(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))|(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))fünftens(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))|(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))sechstens(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))|(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))siebtens(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))|(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))achtens(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))|(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))neuntens(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))|(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))zehntens(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))|(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:punkt|nummer) \d+(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))|(?:^|\s)\d+\.(?=\s))\s*/gi;
  // trennt "Milch Eier Brot" an aufeinanderfolgenden großgeschriebenen Wörtern (Spracherkennung schreibt Substantive groß)
  function capChunks(str) {
    const words = str.trim().split(/\s+/).filter(Boolean);
    const out = []; let cur = [];
    words.forEach((w, i) => {
      const upper = /^[A-ZÄÖÜ]/.test(w), prevUpper = i > 0 && /^[A-ZÄÖÜ]/.test(words[i - 1]);
      if (cur.length && upper && prevUpper) { out.push(cur.join(' ')); cur = []; }
      cur.push(w);
    });
    if (cur.length) out.push(cur.join(' '));
    return out;
  }
  function splitItems(orig) {
    const s = ' ' + orig.replace(/\s+/g, ' ') + ' ';
    ITEM_SEP.lastIndex = 0;
    const parts = [];
    const raw = s.split(ITEM_SEP).filter((p) => p.trim());
    raw.forEach((p) => (raw.length <= 2 ? capChunks(p) : [p]).forEach((c) => parts.push(c)));
    const seen = new Set();
    return parts.map((p) => p.trim()
      .replace(/^(?:noch|auch|bitte|und|oder|dass|ein paar|etwas|einmal|einen|eine|ein|die|der|das)\s+/i, '')
      .replace(/\s+(?:drauf|darauf|hinzu|rein|bitte|dazu|noch|auch|hinzufügen|setzen|schreiben|packen|aufschreiben|notieren|ein|auf)$/i, '')
      .replace(/^[\s.\-:]+|[\s.\-:]+$/g, ''))
      .filter((p) => p && !/^(?:und|oder|bitte|danke|drauf|darauf|punkt|komma)$/i.test(p))
      .map(cap)
      .filter((p) => { const k = p.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  }
  const NAME_MARK = '(?:mit (?:dem )?(?:namen|titel|name)|namens|die (?:heißt|heisst|soll heißen|soll heissen)|(?:die |das )?(?:heißt|heisst)|genannt|benannt|mit name|titel|name)';
  const NOUNS = '(?:unterpunkte?n?|punkte?n?|einträge?n?|eintrag|sachen|dinge?n?|aufgaben|inhalte?n?|artikeln?|items|positionen|elemente?n?|teile?n?)';
  const ITEM_MARK = '(?:mit (?:den )?(?:folgenden )?' + NOUNS + '|mit folgendem|mit folgenden|und zwar|(?:und )?folgende[nrs]?(?: ' + NOUNS + ')?|(?:die |als )?(?:unter)?punkte(?: sind| sollen sein)?|(?:darauf|drauf|rein) (?:soll|sollen|kommt|kommen|gehört|gehören)|bestehend aus|enthält|inhalt|mit(?! (?:dem )?(?:namen|titel|name)(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))))';
  const LIST_WORD = '([a-zäöüß][a-zäöüß-]*liste|liste)';

  function parseList(t, ctx) {
    const low = t.low;
    const isNew = /(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:neue[nrs]?|neu)\s+(?:[a-zäöüß-]*liste)(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/.test(low) ||
      /(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:erstell\w*|mach\w*|leg\w*|start\w*|anlegen|anfangen|beginn\w*)(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_])).*(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:[a-zäöüß-]*liste)(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/.test(low) && !/(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:auf|zu|zur|in|an) (?:die |der |meine |meiner |meinen |unsere |den )?(?:[a-zäöüß-]*liste)(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/.test(low) ||
      /(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))[a-zäöüß-]*liste (?:anlegen|erstellen|machen|anfangen|starten|an)(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/.test(low);
    const addRe = new RegExp('(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:auf|zu|zur|in|an) (?:die |der |meine |meiner |meinen |unsere |unserer |den )?' + LIST_WORD + '(?: ([a-zäöüß-]+))?', 'i');
    const addHit = addRe.exec(low);
    if (!isNew && !addHit) return null;

    if (isNew) {
      // Name
      let name = '';
      let rest = t.orig, restLow = low;
      const lw = new RegExp('(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))' + LIST_WORD).exec(restLow);
      let after = lw.index + lw[0].length;
      const compound = lw[1] !== 'liste' ? lw[1] : '';
      let tailLow = restLow.slice(after), tail = rest.slice(after);
      const lead0 = /^(?:\s*(?:an|bitte|mir|mal|,))+/.exec(tailLow);
      if (lead0) { tailLow = tailLow.slice(lead0[0].length); tail = tail.slice(lead0[0].length); }
      const nm = new RegExp('^\\s*' + NAME_MARK + '\\s+').exec(tailLow);
      let itemsStart = -1;
      const im = new RegExp('(?:^|\\s|:)' + ITEM_MARK + '(?:\\s|:|$)').exec(tailLow);
      const colon = tailLow.indexOf(':');
      if (im) itemsStart = im.index;
      if (colon >= 0 && (itemsStart < 0 || colon < itemsStart)) itemsStart = colon;
      if (nm) {
        const nmEnd = nm[0].length;
        const stop = itemsStart > nmEnd ? itemsStart : -1;
        name = tail.slice(nmEnd, stop > 0 ? stop : undefined);
        if (stop < 0) { // Name bis zum ersten Komma, Rest sind Punkte
          const c = name.search(/,|(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))und zwar(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/);
          if (c > 0) { itemsStart = nmEnd + c; name = name.slice(0, c); }
          else itemsStart = -1;
        }
      } else if (!compound) {
        const pre = itemsStart >= 0 ? tail.slice(0, itemsStart) : tail;
        name = pre;
        if (itemsStart < 0) {
          // "neue Liste Baumarkt erstens Schrauben …" / "neue Liste Packliste Sonnencreme Badehose"
          const ord = /\s(?:erstens|punkt 1|nummer 1|1\.)\s/i.exec(' ' + tail + ' ');
          if (ord) { name = tail.slice(0, Math.max(0, ord.index - 1)); itemsStart = Math.max(0, ord.index - 1); }
          else {
            const lead = /^\s*(?:für (?:den |die |das |meinen |meine )?|zum |zur |über (?:den |die |das )?)/i.exec(tail);
            const body = lead ? tail.slice(lead[0].length) : tail;
            const ch = capChunks(body);
            if (ch.length > 1) { name = ch[0]; itemsStart = tail.length - body.length + body.indexOf(ch[1]); }
          }
        }
      } else if (itemsStart < 0) {
        itemsStart = 0;
      }
      if (compound && !name.trim()) name = cap(compound);
      name = cleanTitle(name.replace(/^\s*(?:für (?:den |die |das |meinen |meine )?|zum |zur |über (?:den |die |das )?)/i, ''));
      let items = [];
      if (itemsStart >= 0) {
        const itTail = tail.slice(itemsStart).replace(new RegExp('^\\s*:?\\s*' + ITEM_MARK + '\\s*:?', 'i'), '').replace(/^\s*:\s*/, '');
        items = splitItems(itTail);
      }
      return { kind: 'list-new', name: name || 'Neue Liste', items };
    }

    // Zu bestehender Liste hinzufügen
    let listName = addHit[1] !== 'liste' ? addHit[1] : (addHit[2] || '');
    const listObj = findList(listName, ctx.lists || []);
    let consumed = addHit[0];
    if (addHit[2] && (addHit[1] !== 'liste' || (listObj && !listKey(listObj.name).startsWith(listKey(addHit[2]))))) consumed = addHit[0].replace(/ [^ ]+$/, '');
    const s = t.orig.slice(0, addHit.index) + ' ' + M + ' ' + t.orig.slice(addHit.index + consumed.length);
    const t2 = new Txt(s);
    t2.mask(/(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:setz(?:e|t|en)?|schreib(?:e|t|en)?|füg(?:e|t|en)?|pack(?:e|t|en)?|tu(?:e|n)?|trag(?:e|t|en)?|nimm|nehm(?:e|en)?|notier(?:e|t|en)?|aufschreiben|hinzufügen|draufschreiben|draufsetzen|eintragen|ergänz(?:e|en)?|kommt|kommen|gehört|gehören|hinzu|drauf|darauf|noch|bitte|mir|mal|du|auch|ja|also|kannst|könntest|würdest|magst|willst)(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/g);
    t2.mask(/(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:kannst|könntest|würdest) du(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/g);
    const items = splitItems(joinRemaining(t2).replace(new RegExp(M, 'g'), ','));
    return { kind: 'list-add', listId: listObj ? listObj.id : '', name: listObj ? listObj.name : cleanTitle(listName.replace(/liste$/i, '')) || 'Neue Liste', items };
  }

  // ---------- Personen ----------
  function parsePerson(t, now) {
    const low = t.low;
    if (!/(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:person|kontakt)(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/.test(low) || /(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))termin(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/.test(low)) return null;
    if (!/(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:neue[nrs]?|füg\w*|leg\w*|speicher\w*|erstell\w*|hinzufügen|anlegen|eintragen|trag\w*|merk\w*)(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/.test(low)) return null;
    const f = { name: '', birthday: '', phone: '', email: '', address: '', note: '' };
    // E-Mail
    const em = /(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))email(?:adresse)?(?: ist| lautet)? (.+?)(?=(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:telefon|nummer|handy|geburtstag|geboren|adresse|wohnt)(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))|$)/.exec(low);
    let mailSpan = null;
    if (em) {
      let e = em[1].replace(/\s+(?:at|ät)\s+/g, '@').replace(/\s+punkt\s+/g, '.').replace(/\s+(?:minus|bindestrich)\s+/g, '-').replace(/\s+unterstrich\s+/g, '_').replace(/\s+/g, '');
      if (/^[^@]+@[^@]+\.[a-z]{2,}$/.test(e)) { f.email = e; mailSpan = [em.index, em.index + em[0].length]; }
    }
    // Telefon (Ziffern, auch einzeln gesprochen)
    const ph = /(?:\+|plus )?\d[\d \/-]{4,}\d/.exec(low.replace(/(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))null(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/g, '0'));
    if (ph && (!mailSpan || ph.index < mailSpan[0] || ph.index > mailSpan[1])) {
      const near = low.slice(Math.max(0, ph.index - 25), ph.index);
      if (/telefon|nummer|handy|mobil|tel(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))|erreichbar/.test(near) || !/geboren|geburtstag/.test(near)) f.phone = ph[0].replace(/^plus /, '+').replace(/[^\d+]/g, '');
    }
    // Geburtstag (mit Jahr)
    const bdIdx = low.search(/(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:geburtstag|geboren|hat am)(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/);
    if (bdIdx >= 0) {
      const sub = new Txt(t.orig.slice(bdIdx));
      const ds = takeDates(sub, new Date(1900, 0, 1));
      if (ds.length) f.birthday = ds[0].year ? ymd(ds[0].date) : '--' + pad(ds[0].date.getMonth() + 1) + '-' + pad(ds[0].date.getDate());
    }
    // Name
    const nm = /(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:person|kontakt)(?:\s*(?:an|hinzu|hinzufügen|anlegen|bitte|,))*(?: (?:namens|mit (?:dem )?namen|die heißt|der heißt|heißt|name))?\s+(.+?)(?=\s*(?:,|(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))mit(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))|(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))geburtstag(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))|(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))geboren(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))|(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))telefon\w*(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))|(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))nummer(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))|(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))handy\w*(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))|(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))mobil\w*(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))|(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))email\w*(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))|(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))adresse(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))|(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))wohnt(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))|(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))hinzu\w*(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))|(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))anlegen(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))|(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))speichern(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))|(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))eintragen(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))|(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))erstellen(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))|$))/.exec(low);
    if (nm) {
      const startPos = nm.index + nm[0].length - nm[1].length;
      f.name = t.orig.slice(startPos, startPos + nm[1].length).trim()
        .replace(/^(?:namens|mit (?:dem )?namen|name|die|der|das)\s+/i, '')
        .split(' ').map(cap).join(' ');
    }
    const ad = /(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:adresse(?: ist| lautet)?|wohnt (?:in der |in |am |auf der )?)\s+(.+?)(?=(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:telefon|nummer|handy|geburtstag|geboren|email)(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))|$)/.exec(low);
    if (ad) { const p = ad.index + ad[0].length - ad[1].length; f.address = cap(t.orig.slice(p, p + ad[1].length).replace(/[,\s]+$/, '')); }
    return { kind: 'person', f };
  }

  // ---------- Hauptfunktion ----------
  function parse(text, ctx) {
    ctx = ctx || {};
    const now = midnight(ctx.now || new Date());
    const tags = ctx.tags || [];
    const lists = ctx.lists || [];
    const t = normalize(text);
    if (!t.low.trim()) return null;

    const person = parsePerson(t, now);
    if (person) return person;

    // Notiz: "neue Notiz: …", "mach mir eine Notiz Einkaufsideen …", "Notiz mit der Überschrift X …"
    const nIdx = t.low.search(/(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:notiz|notizen|sprachnotiz|memo)(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/);
    if (nIdx >= 0 && !/(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:termin|liste)(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/.test(t.low)) {
      const after = t.orig.slice(nIdx).replace(/^\S+/, '');
      let title = '', body = after;
      const tm = /^\s*(?:mit (?:der |dem )?(?:überschrift|titel|namen)|überschrift|titel|namens)\s+(.+?)(?:\s*(?:,|:|(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))und (?:der )?(?:inhalt|text)(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))|(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))inhalt(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))|(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))text(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_])))\s*(.*))?$/i.exec(after);
      if (tm) { title = tm[1]; body = tm[2] || ''; }
      body = body.replace(/^\s*(?:,|:|-)?\s*(?:mit dem (?:inhalt|text)|inhalt|text|über|zum thema|dass|folgendes|und zwar|bitte)?\s*:?\s*/i, '').trim();
      title = title.replace(/[,:\s]+$/, '').trim();
      if (!title && body) { const w = body.split(/\s+/); if (w.length > 6) title = w.slice(0, 5).join(' ') + ' …'; else { title = body; body = ''; } }
      return { kind: 'note', title: cap(title), body: cap(body) };
    }

    const lowNoList = t.low;
    const listCue = /liste(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/.test(lowNoList) && (/(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:neue[nrs]?|neu)\s+[a-zäöüß-]*liste(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/.test(lowNoList) || /(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:erstell\w*|mach\w*|leg\w*|start\w*)(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_])).*liste(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/.test(lowNoList) || /(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:auf|zu|zur|in|an) (?:die |der |meine |meiner |meinen |unsere |den )?[a-zäöüß-]*liste(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/.test(lowNoList));
    if (listCue) { const l0 = parseList(t, { lists }); if (l0) return l0; }
    const vacation = /(?:^|[^a-zäöüß])(?:urlaub|ferien|[a-zäöüß]+urlaub|[a-zäöüß]+ferien|urlaubstage?)(?![a-zäöüß])/.test(lowNoList) && !/(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:buchen|beantragen|einreichen|planen|organisieren|abklären|bezahlen)(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/.test(lowNoList);
    const listIntent = !vacation && /liste(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/.test(lowNoList);
    if (listIntent) {
      const l = parseList(t, { lists });
      if (l) return l;
    }

    // Urlaub
    if (vacation) {
      const word = /(?:^|[^a-zäöüß])([a-zäöüß]*(?:urlaub|ferien))(?![a-zäöüß])/.exec(t.low);
      let title = 'Urlaub';
      const nm = /(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:nenn\w* (?:ihn|es|den urlaub)|mit dem (?:titel|namen)|titel|namens)\s+([^,]+)/.exec(t.low);
      if (nm) { const p = nm.index + nm[0].length - nm[1].length; title = cleanTitle(t.orig.slice(p, p + nm[1].length)); }
      else if (word && word[1] !== 'urlaub') title = cap(word[1]);
      const ds = takeDates(t, now);
      // "von 16. bis 20. Dezember": Tag ohne Monat übernimmt den Monat des Endes
      let start = ds[0] ? ds[0].date : null, end = ds[1] ? ds[1].date : null;
      const dd = /(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:von|vom|ab) (?:dem )?(\d{1,2})\.? (?:bis|-) (?:zum )?(\d{1,2})\.? ?(\d{1,2}\.|[a-zäö]+)?/.exec(normalize(text).low);
      if (dd && dd[3]) {
        const mon = /\d/.test(dd[3]) ? parseInt(dd[3], 10) : MONTHS[dd[3]];
        if (mon) { start = dayMonth(now, +dd[1], mon, 0); end = dayMonth(now, +dd[2], mon, 0); if (end < start) end = new Date(end.getFullYear() + 1, end.getMonth(), end.getDate()); }
      }
      const dur = /(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:für|eine?|einen) ?(\d+|eine|einen|zwei|drei|vier)? ?(woche|wochen|tag|tage|tagen)(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/.exec(t.low) || /(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(\d+) (woche|wochen|tag|tage|tagen)(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/.exec(t.low);
      if (start && !end && dur) {
        const n = dur[1] && /\d/.test(dur[1]) ? +dur[1] : 1;
        end = /woche/.test(dur[2]) ? addDays(start, n * 7 - 1) : addDays(start, n - 1);
      }
      if (start && ds[0] && ds[0].week && !end) end = addDays(start, 6);
      if (!start) start = now;
      if (end && end < start && ds[1] && ds[1].wd) { while (end < start) end = addDays(end, 7); }
      if (!end || end < start) end = start;
      return { kind: 'entry', f: { type: 'urlaub', title, date: ymd(start), endDate: ymd(end), time: '', end: '', repeat: 'none', repeatDays: null, pauseVacation: false, tagId: '', listId: '', noDate: false } };
    }

    // Termin / Aufgabe
    const lowAll = t.low;
    const explicitTermin = /(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:termin|termine|verabredung|verabredet|meeting|treffen|besprechung|date|reservierung|reserviert)(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/.test(lowAll);
    const explicitTask = /(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:aufgabe|aufgaben|to-?do|todo|erinner\w*|nicht vergessen|vergiss|denk(?:e)? (?:dran|daran)|muss|müssen|müsste|sollte|erledigen|besorgen|kaufen|abholen|anrufen|zurückrufen|bezahlen|überweisen|zurückgeben|abgeben|schicken|senden|bestellen|kündigen|reparieren|putzen|waschen|aufräumen|rausbringen|lernen|machen)(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/.test(lowAll) && !/(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))termin(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))/.test(lowAll);

    // Ausdrücklicher Titel: "nenn ihn Zahnarzt", "mit dem Titel …"
    let explicitTitle = '';
    t.sub(/(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:nenn(?:e|t)?|nenne) (?:ihn|sie|es|das|den termin|die aufgabe|den eintrag)(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_])):? ?|(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:mit dem (?:titel|namen|betreff)|unter dem namen|der (?:titel|name) (?:ist|lautet|soll sein)|titel|betreff|namens|beschriftung)(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_])):? ?|(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:soll|sollte) (?:heißen|heissen)(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_])):? ?/g, () => ' \u0002 ');

    // Liste im Termin/Aufgaben-Satz: "auf die Einkaufsliste", "in der Liste Haushalt"
    let listId = '';
    t.mask(new RegExp('(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:auf|zu|zur|in|an) (?:die |der |meine |meiner |meinen |den )?' + LIST_WORD + '(?: ([a-zäöüß-]+))?', 'g'), (m) => {
      const l = findList(m[1] !== 'liste' ? m[1] : (m[2] || ''), lists);
      if (l) listId = l.id;
    });

    const rep = takeRepeat(t);
    const tm = takeTimes(t);
    const ds = takeDates(t, now);
    const tag = matchTag(t, tags);

    // Datum
    let date = ds.length ? ds[0].date : null;
    let period = tm.period || (ds[0] && ds[0].period) || null;
    if (period === 'noon' && !tm.start) tm.start = { h: 12, m: 0, fixed: true };
    if (period === 'noon') period = 'pm';
    if (rep.repeat === 'weekly' && rep.days && (!date || !rep.days[wdOf(date)])) {
      let d = date || now;
      for (let i = 0; i < 7; i++) { if (rep.days[wdOf(d)]) break; d = addDays(d, 1); }
      date = d;
    }
    if (rep.repeat === 'monthly' && rep.monthDay) date = dayOnly(now, rep.monthDay) || date;
    if (rep.repeat !== 'none' && !date) date = now;

    let start = tm.allDay ? '' : fixHour(tm.start, period);
    let end = tm.allDay ? '' : (tm.end ? fixHour(tm.end, period || (start && +start.slice(0, 2) >= 12 ? 'pm' : null)) : '');
    if (start && end && end <= start) { const h = +end.slice(0, 2); if (h < 12) end = pad(h + 12) + end.slice(2); }
    if (start && end && end <= start) end = '';
    if (start && !end && tm.dur) end = addMinutes(start, tm.dur);
    if (!start && end && !explicitTermin) { /* "bis 18 Uhr" bei Aufgaben = Fälligkeit */ start = end; end = ''; }
    if (!start && end) end = '';

    // Typ
    let type;
    if (explicitTermin) type = 'termin';
    else if (explicitTask) type = 'aufgabe';
    else if (start) type = 'termin';
    else if (tag && (tag.system === 'birthday' || /^(arzt|arbeit)$/i.test(tag.name))) type = date ? 'termin' : 'aufgabe';
    else type = 'aufgabe';
    if (/geburtstag/.test(lowAll) && type === 'termin' && rep.repeat === 'none') rep.repeat = 'yearly';
    const noDate = type === 'aufgabe' && !date;
    if (!date) date = now;

    // Titel
    let title = '';
    const parts = t.orig.split('\u0002');
    if (parts.length > 1) {
      explicitTitle = parts.slice(1).join(' ').split(M)[0];
      title = cleanTitle(explicitTitle);
    }
    if (!title) {
      const t2 = new Txt(parts[0] + (parts.length > 1 ? ' ' + M + ' ' + parts.slice(1).join(' ').split(M).slice(1).join(' ' + M + ' ') : ''));
      FILLER.forEach((re) => t2.mask(re));
      // übrig gebliebene Bindewörter direkt vor/nach Markierungen entfernen
      t2.mask(new RegExp('(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:am|um|den|zum|zur|ab|für|von|vom|bis|gegen|an|im|in der|in|nächste[nrs]?|diese[nrs]?|kommende[nrs]?|jeden|immer|und|uhr)\\s*(?=' + M + ')', 'g'));
      t2.mask(/(?:(?<![A-Za-z0-9ÄÖÜäöüß_])(?=[A-Za-z0-9ÄÖÜäöüß_])|(?<=[A-Za-z0-9ÄÖÜäöüß_])(?![A-Za-z0-9ÄÖÜäöüß_]))(?:ein|an|auf|hinzu|vor|ab)\s*$/g);
      title = cleanTitle(joinRemaining(t2));
    }
    if (!title) title = tag && !tag.system ? tag.name : (type === 'termin' ? 'Termin' : 'Aufgabe');

    const repeatDays = rep.repeat === 'weekly' ? (rep.days || (() => { const a = [false, false, false, false, false, false, false]; a[wdOf(date)] = true; return a; })()) : null;
    const f = {
      type, title,
      date: noDate ? ymd(now) : ymd(date), endDate: '',
      time: noDate ? '' : (start || ''), end: type === 'termin' ? (end || '') : '',
      repeat: noDate ? 'none' : rep.repeat, repeatDays: noDate ? null : repeatDays,
      pauseVacation: !noDate && rep.repeat !== 'none' && !!(tag && /arbeit/i.test(tag.name)),
      tagId: tag && tag.system !== 'vacation' ? tag.id : '', listId, noDate
    };
    return { kind: 'entry', f };
  }

  const api = { parse };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrbitVoice = api;
})(typeof window !== 'undefined' ? window : globalThis);
