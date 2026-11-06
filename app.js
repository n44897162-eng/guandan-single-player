/* 掼蛋 · 单机版 —— 牌桌控制器
 * 对局相关功能：本局打几 / 座位倒计时 / 进贡还贡 / 接风 /
 *              提示候选 / 记牌器 / 托管 / 同牌叠放与理牌 / 快捷语 / 结算
 */
(function () {
  'use strict';

  var GD = window.GD;
  var LG = window.GDLogic;
  var $ = function (id) { return document.getElementById(id); };

  var KEY = 'gd_single_save_v2';
  var TURN_SEC = 20;          // 我方出牌倒计时

  var S = {
    game: null,
    sel: {},
    selEls: {},
    hintKey: '',
    hintIdx: 0,
    hintList: null,
    played: {},               // 本局已出的牌: rank -> count
    trust: false,
    group: true,              // true=同点数竖直叠放, false=单列理牌
    pileOpen: null,           // 当前扇开的那一摞（点数）
    flushIdx: 0,              // 同花顺循环游标
    flushRow: null,           // 理成一列的同花顺牌 id
    speed: 1,
    diff: 1,                  // 0 简单 / 1 普通 / 2 困难
    fast: false,              // 观战快进
    voice: true,              // 报牌语音
    vib: true,                // 震动
    paused: false,
    busy: false,
    stats: { games: 0, win: 0, lose: 0, rounds: 0, score: 0 },
    levels: [2, 2],
    round: 0,
    lastRanksSeats: null,
    handSig: '',
    aiTimer: null,
    myTimer: null,
    trustTimer: null,
    rings: {},
    sayTimer: {},
    ringTimer: null
  };

  /* ================= 音效（合成，无外部素材） ================= */
  var Snd = {
    ctx: null, on: true,
    init: function () {
      if (Snd.ctx) return;
      try {
        var C = window.AudioContext || window.webkitAudioContext;
        if (C) Snd.ctx = new C();
      } catch (e) { }
    },
    tone: function (f, d, type, g, delay) {
      if (!Snd.on) return;
      Snd.init();
      var c = Snd.ctx; if (!c) return;
      try {
        if (c.state === 'suspended') c.resume();
        var t0 = c.currentTime + (delay || 0);
        var o = c.createOscillator(), gn = c.createGain();
        o.type = type || 'sine';
        o.frequency.value = f;
        gn.gain.setValueAtTime(0.0001, t0);
        gn.gain.linearRampToValueAtTime(g || 0.07, t0 + 0.012);
        gn.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
        o.connect(gn); gn.connect(c.destination);
        o.start(t0); o.stop(t0 + d + 0.03);
      } catch (e) { }
    },
    pick: function () { Snd.tone(880, 0.045, 'triangle', 0.026); },
    play: function () { Snd.tone(620, 0.08, 'triangle', 0.048); },
    pass: function () { Snd.tone(280, 0.09, 'sine', 0.03); },
    deal: function () { for (var i = 0; i < 4; i++) Snd.tone(520 + i * 40, 0.04, 'triangle', 0.02, i * 0.05); },
    bomb: function () { Snd.tone(150, 0.3, 'sawtooth', 0.07); Snd.tone(96, 0.34, 'square', 0.05, 0.02); },
    win: function () { var n = [523, 659, 784, 1047]; for (var i = 0; i < n.length; i++) Snd.tone(n[i], 0.18, 'triangle', 0.05, i * 0.1); },
    lose: function () { var n = [440, 370, 294]; for (var i = 0; i < n.length; i++) Snd.tone(n[i], 0.2, 'sine', 0.042, i * 0.11); }
  };

  /* ================= 震动 ================= */
  /* pattern: 数字或数组，单位毫秒；Android 走原生桥，其它环境退回 Web 震动 API */
  function hz(p) {
    if (!S.vib) return;
    window.__lastVib = p;
    try {
      if (window.Android && window.Android.vibrate) {
        window.Android.vibrate(Array.isArray(p) ? p.join(',') : String(p));
        return;
      }
    } catch (e) { }
    try {
      if (navigator.vibrate) navigator.vibrate(p);
    } catch (e) { }
  }

  /* ================= 报牌语音 ================= */
  /* 语音包放在 voice/*.mp3（离线内置，不联网） */
  var Voice = {
    on: true, cur: null, box: {},
    files: ['single', 'pair', 'triple', 'fullhouse', 'straight', 'tube', 'plate',
      'bomb', 'flush', 'jokerbomb', 'pass', 'one', 'two', 'jiefeng', 'first', 'last'],
    preload: function () {
      if (Voice.box._done) return;
      Voice.box._done = true;
      Voice.files.forEach(function (n) {
        try {
          var a = new Audio('voice/' + n + '.mp3');
          a.preload = 'auto';
          a.volume = 1;
          Voice.box[n] = a;
        } catch (e) { }
      });
    },
    play: function (name) {
      window.__lastVoice = name;
      if (!Voice.on || !S.voice) return;
      var a = Voice.box[name];
      if (!a) return;
      try {
        if (Voice.cur && Voice.cur !== a) { Voice.cur.pause(); }
        a.currentTime = 0;
        Voice.cur = a;
        var pr = a.play();
        if (pr && pr.catch) pr.catch(function () { });
      } catch (e) { }
    }
  };

  /* ================= 存档 ================= */
  var Store = {
    get: function () {
      try { var v = localStorage.getItem(KEY); if (v) return v; } catch (e) { }
      try { if (window.AndroidStore) return window.AndroidStore.get(KEY) || null; } catch (e) { }
      return null;
    },
    set: function (v) {
      try { localStorage.setItem(KEY, v); } catch (e) { }
      try { if (window.AndroidStore) window.AndroidStore.set(KEY, v); } catch (e) { }
    },
    clear: function () {
      try { localStorage.removeItem(KEY); } catch (e) { }
      try { if (window.AndroidStore) window.AndroidStore.remove(KEY); } catch (e) { }
    }
  };

  function loadSave() {
    try {
      var raw = Store.get(); if (!raw) return;
      var d = JSON.parse(raw);
      if (Array.isArray(d.levels)) S.levels = d.levels;
      S.round = d.round || 0;
      S.lastRanksSeats = d.lastRanksSeats || null;
      if (d.stats) {
        S.stats.games = d.stats.games || 0;
        S.stats.win = d.stats.win || 0;
        S.stats.lose = d.stats.lose || 0;
        S.stats.rounds = d.stats.rounds || 0;
        S.stats.score = d.stats.score || 0;
      }
      if (typeof d.speed === 'number') S.speed = d.speed;
      if (typeof d.diff === 'number') S.diff = d.diff;
      if (typeof d.voice === 'boolean') S.voice = d.voice;
      if (typeof d.vib === 'boolean') S.vib = d.vib;
      if (typeof d.group === 'boolean') S.group = d.group;
      if (typeof d.snd === 'boolean') Snd.on = d.snd;
    } catch (e) { }
  }

  function persist() {
    try {
      Store.set(JSON.stringify({
        levels: S.levels, round: S.round, lastRanksSeats: S.lastRanksSeats,
        stats: S.stats, speed: S.speed, group: S.group, snd: Snd.on, diff: S.diff,
        voice: S.voice, vib: S.vib
      }));
    } catch (e) { }
  }

  /* ================= 工具 ================= */
  function rankName(r) {
    return r === 14 ? 'A' : r === 11 ? 'J' : r === 12 ? 'Q' : r === 13 ? 'K' : String(r);
  }
  function seatLabel(seat) { return ['我', '下家', '对家', '上家'][seat]; }
  function toast(msg, ms) {
    var t = $('toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(t._t); t._t = setTimeout(function () { t.classList.remove('on'); }, ms || 1600);
  }
  /* ================= 炸弹 / 同花顺特效 ================= */
  function boom(type, seat) {
    var big = type === 'jokerbomb' ? '天王炸！' : (type === 'flush' ? '同花顺！' : '炸弹！');
    var b = $('boomTxt');
    if (b) {
      b.textContent = big;
      b.className = 'boomtxt ' + type;
      void b.offsetWidth;
      b.classList.add('on');
      clearTimeout(b._t);
      b._t = setTimeout(function () { b.className = 'boomtxt'; }, 1500);
    }
    var fl = $('flash');
    if (fl) {
      fl.classList.remove('on');
      void fl.offsetWidth;
      fl.classList.add('on');
      clearTimeout(fl._t);
      fl._t = setTimeout(function () { fl.classList.remove('on'); }, 300);
    }
    var tb = document.querySelector('.table');
    if (tb) {
      tb.classList.remove('quake');
      void tb.offsetWidth;
      tb.classList.add('quake');
      setTimeout(function () { tb.classList.remove('quake'); }, 540);
    }
    Array.prototype.forEach.call(document.querySelectorAll('#playzone .card'), function (c) {
      c.classList.remove('boomglow'); void c.offsetWidth; c.classList.add('boomglow');
    });
    hz(type === 'jokerbomb' ? [0, 70, 50, 110, 50, 150] : [0, 55, 40, 90]);
  }

  function say(seat, txt, ms) {
    var el = $('s' + seat); if (!el) return;
    el.textContent = txt; el.classList.add('on');
    clearTimeout(S.sayTimer[seat]);
    S.sayTimer[seat] = setTimeout(function () { el.classList.remove('on'); }, ms || 1100);
  }
  function cssNum(name, dflt) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name);
    var n = parseFloat(v); return isNaN(n) ? dflt : n;
  }
  function show(id) { $(id).classList.add('on'); }
  function hide(id) { $(id).classList.remove('on'); }
  function isOverlayOpen() {
    var o = document.querySelectorAll('.overlay.on');
    return o.length > 0;
  }

  /* ================= 牌面 ================= */
  function cardEl(c, level) {
    var d = document.createElement('div');
    var cls = 'card';
    if (GD.isRed(c)) cls += ' red';
    if (GD.isWild(c, level)) cls += ' wild';
    if (c.r >= 16) cls += ' joker';
    d.className = cls;

    if (c.r >= 16) {
      var jt = c.r === 17 ? '大王' : '小王';
      d.innerHTML = '<div class="c-tl"><div class="rk">' + jt + '</div></div>' +
        '<div class="c-mid">' + jt + '</div>';
    } else {
      d.innerHTML = '<div class="c-tl"><div class="rk">' + GD.rankText(c.r) + '</div>' +
        '<div class="st">' + GD.suitText(c.s) + '</div></div>' +
        '<div class="c-mid">' + GD.suitText(c.s) + '</div>';
    }
    if (c.r === level && !GD.isJoker(c)) {
      var dot = document.createElement('div');
      dot.className = 'c-lv';
      d.appendChild(dot);
    }
    d.dataset.id = c.id;
    return d;
  }

  /* ================= 同花顺一键理牌 ================= */
  var flushCache = { sig: '', list: [] };

  function flushCombos() {
    var g = S.game; if (!g || !g.hands[0].length) return [];
    var sig = g.hands[0].map(function (c) { return c.id; }).join(',') + '|' + g.level;
    if (flushCache.sig === sig) return flushCache.list;
    var list = [], seen = {};
    GD.genAll(g.hands[0], g.level).forEach(function (cb) {
      if (cb.type !== 'flush') return;
      var k = cb.cards.map(function (c) { return c.id; }).sort(function (a, b) { return a - b; }).join(',');
      if (seen[k]) return;
      seen[k] = 1;
      list.push(cb);
    });
    list.sort(function (a, b) { return a.key - b.key; });
    flushCache = { sig: sig, list: list };
    return list;
  }

  function flushText(cb) {
    var lv = (S.game && S.game.level) || 2;
    var lo = cb.key - 4, hi = cb.key, out = '';
    for (var r = lo; r <= hi; r++) out += (r === 1 ? 'A' : GD.rankText(r));
    var plain = null, wild = false;
    cb.cards.forEach(function (c) {
      if (GD.isWild(c, lv)) wild = true;
      else if (!plain) plain = c;
    });
    var suit = GD.suitText((plain || cb.cards[0]).s);
    return suit + ' ' + out + (wild ? '（含逢人配）' : '');
  }

  function updateFlushUI() {
    var g = S.game;
    var can = !!g && g.phase === 'play' && g.turn === 0 && !S.trust;
    var list = can ? flushCombos() : [];
    var bf = $('btnFlush'), br = $('btnFlushRow'), bb = $('btnFlushBack');
    if (bf) {
      bf.disabled = !can || !list.length;
      bf.classList.toggle('has', list.length > 0);
    }
    if (br) {
      var sel = can ? currentCombo() : null;
      br.disabled = !can || !(sel && sel.type === 'flush');
    }
    if (bb) bb.disabled = !can || !S.flushRow;
  }

  function doFlush() {
    var g = S.game;
    if (!g || g.phase !== 'play' || g.turn !== 0 || S.trust) return;
    var handIds = {};
    g.hands[0].forEach(function (c) { handIds[c.id] = 1; });
    var list = flushCombos().filter(function (cb) {
      return cb.cards.every(function (c) { return handIds[c.id]; });
    });
    if (!list.length) { toast('手上没有同花顺', 1100); return; }
    if (S.flushIdx >= list.length) S.flushIdx = 0;
    var pick = list[S.flushIdx];
    S.flushIdx = (S.flushIdx + 1) % list.length;
    S.sel = {};
    pick.cards.forEach(function (c) { S.sel[c.id] = true; });
    if (S.flushRow) S.flushRow = pick.cards.map(function (c) { return c.id; });
    S.handSig = '';
    renderHand(true);
    refreshButtons();
    toast('同花顺 ' + flushText(pick) + (list.length > 1 ? '（再点换一条）' : ''), 1400);
    Snd.pick(); hz(10);
  }

  function doFlushRow() {
    var g = S.game;
    if (!g || g.phase !== 'play' || g.turn !== 0 || S.trust) return;
    var sel = currentCombo();
    if (!sel || sel.type !== 'flush') { toast('先点「同花顺」选中一条', 1300); return; }
    S.flushRow = selectedCards().map(function (c) { return c.id; });
    S.handSig = '';
    renderHand(true);
    updateFlushUI();
    toast('已抽出来理成一列', 1100);
    hz(8);
  }

  function doFlushBack() {
    if (!S.flushRow) return;
    S.flushRow = null;
    S.handSig = '';
    renderHand(true);
    updateFlushUI();
    toast('已放回原来的位置', 1100);
  }

  /* ================= 手牌：同点数竖直叠放 / 单列理牌 ================= */
  /* 叠放规则：同「点数」全部叠成一摞（两副牌同点最多 8 张）
     短按一摞 = 直接选中其中一张（可连点连选），长按 400ms = 扇开挑花色 */
  function bindCard(el, id, mode) {
    var lpTimer = null, longPressed = false;

    function startLP() {
      if (!mode) return;
      longPressed = false;
      lpTimer = setTimeout(function () {
        longPressed = true;
        if (!S.game || S.game.phase !== 'play' || S.game.turn !== 0 || S.trust) return;
        S.pileOpen = (mode === 2) ? 'flush' : +el.dataset.rank;
        hz(12);
        renderHand(true);
      }, 400);
    }
    function endLP() { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } }

    el.addEventListener('touchstart', startLP, { passive: true });
    el.addEventListener('touchend', endLP);
    el.addEventListener('touchmove', endLP);
    el.addEventListener('touchcancel', endLP);
    el.addEventListener('mousedown', startLP);
    el.addEventListener('mouseup', endLP);

    el.addEventListener('click', function (ev) {
      ev.stopPropagation();
      endLP();
      if (longPressed) { longPressed = false; return; }
      if (!S.game || S.game.phase !== 'play' || S.game.turn !== 0 || S.trust) return;
      if (mode === 1) pickFromPile(+el.dataset.rank);
      else toggleCard(id);
    });
  }

  /* 一摞里按顺序选一张：还有没选的就再选一张，全选满了就整摞取消 */
  function pickFromPile(rank) {
    var g = S.game;
    var pile = g.hands[0].filter(function (c) { return c.r === rank; });
    if (!pile.length) return;
    var un = pile.filter(function (c) { return !S.sel[c.id]; });
    if (un.length) {
      S.sel[un[0].id] = true;
      Snd.pick();
    } else {
      pile.forEach(function (c) { delete S.sel[c.id]; });
      Snd.tone(300, 0.05, 'sine', 0.03);
    }
    hz(8);
    S.pileOpen = null;
    S.handSig = '';           // 让已选牌浮到摞顶
    renderHand(true);
    refreshButtons();
  }

  function renderHand(force) {
    var g = S.game; if (!g) return;
    var wrap = $('hand');
    var hand = g.hands[0];
    var watching = g.phase === 'play' && hand.length === 0;   // 自己出完了 → 看队友的牌
    var sig = hand.map(function (c) { return c.id; }).join(',') + '|' + (S.group ? 1 : 0) + '|' + g.level +
      '|' + S.pileOpen + '|' + (S.flushRow ? S.flushRow.join(',') : '') +
      '|' + (watching ? g.hands[2].map(function (c) { return c.id; }).join(',') : '');
    if (!force && sig === S.handSig) { applySel(); return; }
    S.handSig = sig;

    var avail = (wrap.clientWidth || (window.innerWidth - 20)) - 8;
    if (avail < 120) avail = window.innerWidth - 28;

    wrap.innerHTML = '';
    S.selEls = {};

    var cw = cssNum('--cw', 44);
    var ch = cssNum('--ch', 62);
    var stepY0 = cssNum('--stack', 14);

    /* 观战：把自己空出来的手牌区换成队友的牌（只显示，不可点） */
    if (watching) {
      var mate = g.hands[2];
      var mn = mate.length;
      var mstep = mn > 1 ? Math.min(cw * 0.58, (avail - cw) / (mn - 1)) : 0;
      if (mstep < cw * 0.2) mstep = cw * 0.2;
      var mw = (mn - 1) * mstep + cw;
      var mx = Math.max(0, (avail - mw) / 2);
      for (var mi = 0; mi < mn; mi++) {
        var mel = cardEl(mate[mi], g.level);
        mel.classList.add('ghost');
        mel.style.left = Math.round(mx + mi * mstep) + 'px';
        mel.style.bottom = '0px';
        mel.style.zIndex = mi + 1;
        wrap.appendChild(mel);
      }
      wrap.style.height = Math.round(ch) + 'px';
      var tip = $('watchTip');
      if (tip) {
        tip.textContent = '队友（对家）剩余 ' + mn + ' 张 · 观战中';
        tip.classList.add('top');
      }
      return;
    }
    var wt = $('watchTip');
    if (wt) wt.classList.remove('top');

    if (!hand.length) { wrap.style.height = Math.round(ch) + 'px'; return; }

    /* 理成一列：把这 5 张并成一摞，像同点数的牌那样竖着叠，位置还留在原处 */
    var flushSet = {};
    if (S.flushRow) {
      S.flushRow.forEach(function (id) {
        if (g.hands[0].some(function (c) { return c.id === id; })) flushSet[id] = 1;
      });
    }

    var cols = [], map = {}, flushCol = null;
    for (var i = 0; i < hand.length; i++) {
      var c = hand[i];
      if (flushSet[c.id]) {
        if (!flushCol) {
          flushCol = { key: 'flush', r: 'flush', cards: [], isFlush: true };
          cols.push(flushCol);
        }
        flushCol.cards.push(c);
        continue;
      }
      var k = S.group ? ('r' + c.r) : ('i' + i);
      if (!map[k]) { map[k] = { key: k, r: c.r, cards: [] }; cols.push(map[k]); }
      map[k].cards.push(c);
    }
    if (flushCol) flushCol.cards.sort(function (a, b) { return a.r - b.r; });   // 3 在底、7 在顶

    var n = cols.length;
    var stepX;
    if (S.group) {
      stepX = n > 1 ? Math.min(cw + 2, (avail - cw) / (n - 1)) : 0;
      var minX = cw * 0.4;
      if (stepX < minX) stepX = minX;
    } else {
      stepX = n > 1 ? Math.min(cw * 0.66, (avail - cw) / (n - 1)) : 0;
      var minX2 = cw * 0.3;
      if (stepX < minX2) stepX = minX2;
    }

    var totalW = (n - 1) * stepX + cw;
    var left0 = Math.max(0, (avail - totalW) / 2);

    var maxPile = 1;
    for (var j = 0; j < n; j++) if (cols[j].cards.length > maxPile) maxPile = cols[j].cards.length;

    /* 错位自适应：整摞高度控制在手牌区留白内（8 张也不顶到按钮） */
    var headroom = 40;
    var stepY = stepY0;
    if (maxPile > 1) stepY = Math.min(stepY0, Math.max(6, headroom / (maxPile - 1)));

    /* 展开的摞若已不存在（牌打出去了）则收起 */
    if (S.pileOpen != null) {
      var alive = false;
      for (var fa = 0; fa < n; fa++) if (cols[fa].r === S.pileOpen && cols[fa].cards.length > 1) alive = true;
      if (!alive) S.pileOpen = null;
    }

    for (var ci = 0; ci < n; ci++) {
      var col = cols[ci];
      var x = left0 + ci * stepX;
      var cnt = col.cards.length;
      var open = S.group && cnt > 1 && S.pileOpen === col.r;

      /* —— 已扇开：一张一张横向错开，露出点数与花色 —— */
      if (open) {
        var fstep = cnt > 1
          ? Math.min(cw * 0.78, Math.max(cw * 0.44, (Math.min(avail, cw * 6) - cw) / (cnt - 1)))
          : 0;
        var fw = cw + (cnt - 1) * fstep;
        var fx = (x + fw > avail) ? Math.max(0, avail - fw) : x;
        var fbg = document.createElement('i');
        fbg.className = 'fanbg';
        fbg.style.left = Math.round(fx - 4) + 'px';
        fbg.style.width = Math.round(fw + 8) + 'px';
        fbg.style.bottom = '-3px';
        fbg.style.height = Math.round(ch + 6) + 'px';
        wrap.appendChild(fbg);
        for (var q = 0; q < cnt; q++) {
          var cq = col.cards[q];
          var eq = cardEl(cq, g.level);
          eq.dataset.flat = '1';
          eq.dataset.rank = cq.r;
          eq.style.left = Math.round(fx + q * fstep) + 'px';
          eq.style.bottom = '0px';
          eq.style.zIndex = 200 + q;
          S.selEls[cq.id] = eq;
          bindCard(eq, cq.id, false);
          wrap.appendChild(eq);
        }
        var tag = document.createElement('i');
        tag.className = 'piletag on';
        tag.textContent = '✕';
        tag.title = '收起这一摞';
        tag.style.left = Math.round(fx + fw - 16) + 'px';
        tag.style.bottom = Math.round(ch - 16) + 'px';
        tag.addEventListener('click', function (ev) {
          ev.stopPropagation();
          S.pileOpen = null;
          renderHand(true);
        });
        wrap.appendChild(tag);
        continue;
      }

      /* —— 合拢：竖着叠成一摞（同点数按选中重排，同花顺保持 3→7 的顺子） —— */
      var order = col.cards.slice();
      if (!col.isFlush) {
        order.sort(function (a, b) {
          var sa = S.sel[a.id] ? 1 : 0, sb = S.sel[b.id] ? 1 : 0;
          return sa - sb;
        });
      }
      for (var pi = 0; pi < cnt; pi++) {
        var card = order[pi];
        var el = cardEl(card, g.level);
        el.dataset.flat = cnt === 1 ? '1' : '0';
        el.dataset.rank = card.r;
        el.style.left = Math.round(x) + 'px';
        /* 同花顺那一摞倒着叠：3 在最上面、7 在底，每张都露出左上角的点数 */
        el.style.bottom = Math.round((col.isFlush ? (cnt - 1 - pi) : pi) * stepY) + 'px';
        el.style.zIndex = pi + 1;
        S.selEls[card.id] = el;
        bindCard(el, card.id, cnt > 1 ? (col.isFlush ? 2 : 1) : 0);
        if (cnt > 1 && (col.isFlush ? pi === 0 : pi === cnt - 1)) {
          var selN = 0;
          for (var bq = 0; bq < cnt; bq++) if (S.sel[col.cards[bq].id]) selN++;
          var badge = document.createElement('i');
          if (col.isFlush) {
            badge.className = 'pcnt on';
            badge.dataset.flush = '1';
            badge.textContent = '顺' + cnt;
            badge.title = '同花顺 ' + cnt + ' 张';
          } else {
            badge.className = 'pcnt' + (selN ? ' on' : '');
            badge.textContent = selN ? (selN + '/' + cnt) : ('×' + cnt);
          }
          el.appendChild(badge);
        }
        wrap.appendChild(el);
      }
    }
    wrap.style.height = Math.round(ch + (maxPile - 1) * stepY) + 'px';
    applySel();
    updateFlushUI();
  }

  /* 牌面上「几张」角标在选中态变化时同步刷新 */
  function refreshPileBadges() {
    var g = S.game; if (!g) return;
    var cnt = {};
    g.hands[0].forEach(function (c) {
      var o = cnt[c.r] || (cnt[c.r] = { all: 0, sel: 0 });
      o.all++; if (S.sel[c.id]) o.sel++;
    });
    Array.prototype.forEach.call(document.querySelectorAll('#hand .pcnt'), function (el) {
      if (el.dataset.flush) return;
      var r = +el.parentNode.dataset.rank;
      var o = cnt[r]; if (!o) return;
      el.textContent = o.sel ? (o.sel + '/' + o.all) : ('×' + o.all);
      el.classList.toggle('on', !!o.sel);
    });
  }

  function applySel() {
    var any = false;
    for (var id in S.selEls) {
      if (!S.selEls[id]) continue;
      var on = !!S.sel[id];
      if (on) any = true;
      S.selEls[id].classList.toggle('sel', on);
    }
    var h = $('hand');
    if (h) h.classList.toggle('has-sel', any);
    refreshPileBadges();
  }

  function toggleCard(id) {
    if (!S.game || S.game.phase !== 'play' || S.game.turn !== 0 || S.trust) return;
    if (S.sel[id]) delete S.sel[id]; else S.sel[id] = true;
    Snd.pick();
    applySel();
    refreshButtons();
    hidePop();
  }

  function selectedCards() {
    var g = S.game, out = [];
    if (!g) return out;
    g.hands[0].forEach(function (c) { if (S.sel[c.id]) out.push(c); });
    return out;
  }
  function currentCombo() {
    var cards = selectedCards();
    if (!cards.length) return null;
    var g = S.game;
    var prefer = (g.lastPlay && g.lastPlay.combo.n === 6) ? g.lastPlay.combo.type : null;
    return GD.evaluateSelection(cards, g.level, prefer);
  }

  /* ================= 座位 / 顶栏 ================= */
  function renderSeats() {
    var g = S.game; if (!g) return;
    var names = ['我', '下家', '对家', '上家'];
    for (var s = 0; s < 4; s++) {
      var p = $('p' + s), cnt = $('c' + s), badge = $('b' + s);
      if (!p) continue;
      var rest = g.hands[s].length;
      cnt.textContent = (g.phase !== 'play' && g.phase !== 'tribute') ? rest + '张' : (rest === 0 ? '出完' : rest + '张');
      p.classList.toggle('done', rest === 0);
      p.classList.toggle('turn', g.phase === 'play' && g.turn === s);
      var fin = g.finished.indexOf(s);
      if (fin >= 0) {
        badge.textContent = ['头游', '二游', '三游', '末游'][fin];
        badge.classList.add('show');
      } else {
        badge.classList.remove('show');
      }
      var ava = p.querySelector('.ava');
      if (ava) ava.textContent = names[s].charAt(0);
    }
    $('roundInfo').textContent = '第 ' + g.round + ' 局';
    $('levelTxt').textContent = rankName(g.level);
    $('lvMe').textContent = rankName(g.teamLevel[0]);
    $('lvOpp').textContent = rankName(g.teamLevel[1]);
  }

  /* ================= 出牌区 ================= */
  function renderPlayzone() {
    var g = S.game, zone = $('playzone'), hint = $('typeHint');
    zone.innerHTML = '';
    if (!g || !g.lastPlay) { hint.innerHTML = ''; return; }
    var lp = g.lastPlay;

    var stack = document.createElement('div');
    stack.className = 'stack';
    lp.combo.cards.forEach(function (c, i) {
      var el = cardEl(c, g.level);
      el.style.position = 'relative';
      el.style.animationDelay = (i * 38) + 'ms';
      stack.appendChild(el);
    });
    zone.appendChild(stack);

    var maxW = zone.clientWidth || 320;
    var cw = cssNum('--cw', 44) * 0.9;
    var need = cw + (lp.combo.cards.length - 1) * (cw - 18);
    if (need > maxW) {
      stack.style.transform = 'scale(' + (maxW / need).toFixed(3) + ')';
      stack.style.transformOrigin = 'center bottom';
    }

    var tname = GD.TYPE_NAME[lp.combo.type] || '出牌';
    hint.innerHTML = '<b>' + seatLabel(lp.seat) + '</b> · ' + tname +
      (lp.combo.n > 1 ? ' ' + lp.combo.n + '张' : '');
  }

  /* ================= 观战（自己出完后看队友和电脑打） ================= */
  function updateWatch() {
    var g = S.game;
    var on = !!g && g.phase === 'play' && g.hands[0].length === 0;
    var bar = $('watchBar'), tip = $('watchTip'), ab = document.querySelector('.actionbar');
    if (bar) bar.classList.toggle('on', on);
    if (tip) tip.classList.toggle('on', on);
    if (ab) ab.style.display = on ? 'none' : '';
    if (on) {
      var pos = g.finished.indexOf(0);
      var nm = ['头游', '二游', '三游', '末游'][pos] || '出完';
      $('watchLbl').textContent = '你已出完（' + nm + '）· 观战中';
    }
    var fb = $('btnFast');
    if (fb) {
      fb.textContent = S.fast ? '快进 ×3 开' : '快进 ×3';
      fb.classList.toggle('on', !!S.fast);
    }
  }

  /* ================= 按钮态 ================= */
  function refreshButtons() {
    var g = S.game; if (!g) return;
    var myTurn = g.phase === 'play' && g.turn === 0 && !S.trust;
    var cb = myTurn ? currentCombo() : null;
    var ok = false;
    if (cb) ok = g.lastPlay ? GD.beats(cb, g.lastPlay.combo) : true;
    $('btnPlay').disabled = !myTurn || !ok;
    $('btnPass').disabled = !myTurn || !g.lastPlay;
    $('btnHint').disabled = !myTurn;
    updateFlushUI();
  }

  /* ================= 记牌器 ================= */
  function renderCounter() {
    var g = S.game; if (!g) return;
    var total = {};
    for (var r = 2; r <= 14; r++) total[r] = 8;
    total[16] = 2; total[17] = 2;
    var mine = {};
    g.hands[0].forEach(function (c) { mine[c.r] = (mine[c.r] || 0) + 1; });

    var order = [17, 16, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
    var html = '';
    order.forEach(function (r) {
      var rest = total[r] - (S.played[r] || 0) - (mine[r] || 0);
      if (rest < 0) rest = 0;
      var label = r === 17 ? '大' : r === 16 ? '小' : rankName(r);
      html += '<div class="cc' + (rest === 0 ? ' zero' : '') + '">' + label + '<b>' + rest + '</b></div>';
    });
    $('counterBar').innerHTML = html;
  }

  /* ================= 计时环 ================= */
  function stopRing(seat) {
    if (S.rings[seat]) { clearInterval(S.rings[seat]); S.rings[seat] = null; }
  }
  function stopAllRings() {
    for (var s = 0; s < 4; s++) {
      stopRing(s);
      var el = $('ring' + s);
      if (el) { el.classList.remove('on'); el.classList.remove('warn'); el.style.setProperty('--p', '0%'); }
    }
  }
  function startRing(seat, ms, total) {
    var el = $('ring' + seat); if (!el) return;
    stopAllRings();
    el.classList.add('on');
    el.style.setProperty('--p', '100%');
    var t0 = Date.now();
    S.rings[seat] = setInterval(function () {
      var left = 1 - (Date.now() - t0) / ms;
      if (left < 0) left = 0;
      el.style.setProperty('--p', (left * 100).toFixed(1) + '%');
      if (left <= 0.3) el.classList.add('warn');
      if (left <= 0) stopRing(seat);
    }, 100);
  }

  /* ================= 回合驱动 ================= */
  function clearTimers() {
    if (S.aiTimer) { clearTimeout(S.aiTimer); S.aiTimer = null; }
    if (S.myTimer) { clearTimeout(S.myTimer); S.myTimer = null; }
    if (S.trustTimer) { clearTimeout(S.trustTimer); S.trustTimer = null; }
    stopAllRings();
  }

  function aiDelay() {
    var base = 5000 + Math.random() * 3000;      // 5~8 秒
    if (S.fast) base *= 0.22;                    // 观战快进
    return base * S.speed;
  }

  function scheduleTurn() {
    clearTimers();
    var g = S.game;
    if (!g || (g.phase !== 'play' && g.phase !== 'tribute') || S.paused) return;
    renderSeats();
    refreshButtons();
    updateWatch();

    if (g.phase === 'tribute' && !$('ovTribute').classList.contains('on')) {
      S.paused = true;
      renderTribute(g.tribute);
      show('ovTribute');
      return;
    }

    if (g.turn === 0) {
      /* 真人回合：不倒计时、不超时，想出多久出多久 */
      if (S.trust) {
        startRing(0, 1200, 1200);
        S.trustTimer = setTimeout(function () { autoSeat(0); }, 1100);
      } else {
        stopAllRings();
        S.hintIdx = 0;
      }
    } else {
      var seat = g.turn;
      var d = aiDelay();
      startRing(seat, d, d);
      S.aiTimer = setTimeout(function () {
        var gg = S.game;
        if (!gg || gg.phase !== 'play' || gg.turn !== seat || S.paused) return;
        aiSeat(seat);
      }, d);
    }
  }

  /* AI 出牌 */
  function aiSeat(seat) {
    var g = S.game; if (!g || g.phase !== 'play' || g.turn !== seat) return;
    var cb = LG.aiChoose(g, seat, S.diff);
    if (cb && !g.play(seat, cb)) {
      var fb = LG.aiFallback(g, seat);
      if (fb) g.play(seat, fb); else g.pass(seat);
    } else if (!cb) {
      if (!g.pass(seat)) {
        var fb2 = LG.aiFallback(g, seat);
        if (fb2) g.play(seat, fb2);
      }
    }
  }

  /* 托管 / 超时：按最省的方式出 */
  function autoSeat(seat) {
    var g = S.game; if (!g || g.phase !== 'play' || g.turn !== seat) return;
    S.sel = {}; applySel();
    var cb = LG.aiFallback(g, seat);
    if (cb) {
      if (!g.play(seat, cb)) g.pass(seat);
    } else {
      g.pass(seat);
    }
  }

  /* ================= 事件 ================= */
  function onEvent(e) {
    var g = S.game; if (!g) return;

    if (e.type === 'roundStart') {
      S.played = {}; S.sel = {}; S.hintIdx = 0; S.hintList = null;
      $('playzone').innerHTML = ''; $('typeHint').innerHTML = '';
      Snd.deal();
      renderHand(true); renderSeats(); renderCounter(); refreshButtons();
      var hw = $('hand');
      if (hw) {
        hw.classList.add('dealing');
        clearTimeout(hw._dt);
        hw._dt = setTimeout(function () { hw.classList.remove('dealing'); }, 420);
      }
    }
    else if (e.type === 'tribute') {
      S.paused = true;
      renderTribute(e.tribute);
      show('ovTribute');
    }
    else if (e.type === 'playStart') {
      S.paused = false;
      renderHand(true); renderSeats(); refreshButtons();
      scheduleTurn();
    }
    else if (e.type === 'play') {
      e.combo.cards.forEach(function (c) { S.played[c.r] = (S.played[c.r] || 0) + 1; });
      renderPlayzone(); renderSeats(); renderCounter();
      var tname = GD.TYPE_NAME[e.combo.type] || '出牌';
      var isBomb = (e.combo.type === 'bomb' || e.combo.type === 'flush' || e.combo.type === 'jokerbomb');
      if (isBomb) {
        say(e.seat, tname + '！', 1400);
        Snd.bomb();
        boom(e.combo.type, e.seat);
      } else {
        Snd.play();
        if (e.seat === 0) hz(10);
      }
      Voice.play(e.combo.type);
      if (e.seat === 0) { S.sel = {}; }
      /* 理成一列的牌被打出去了 → 自动收回这一列 */
      if (S.flushRow) {
        var gone = S.flushRow.some(function (id) {
          return !g.hands[0].some(function (c) { return c.id === id; });
        });
        if (gone) { S.flushRow = null; S.handSig = ''; }
      }
      renderHand(); applySel(); refreshButtons(); updateWatch();
      /* 报牌：出完这一手后只剩 1~2 张 */
      var left = g.hands[e.seat].length;
      if (left === 1 || left === 2) setTimeout(function () { Voice.play(left === 1 ? 'one' : 'two'); }, 420);
    }
    else if (e.type === 'pass') {
      say(e.seat, '不要');
      if (e.seat !== 0) Snd.pass();
      Voice.play('pass');
    }
    else if (e.type === 'finish') {
      say(e.seat, ['头游', '二游', '三游'][e.rank - 1] || '出完', 1400);
      if (e.rank === 1) Voice.play('first');
      else if (e.rank === 4) Voice.play('last');
      renderSeats(); updateWatch();
    }
    else if (e.type === 'jiefeng') {
      say(e.seat, '接风！', 1500);
      Voice.play('jiefeng');
    }
    else if (e.type === 'newTrick') {
      $('playzone').innerHTML = '';
      $('typeHint').innerHTML = '<span style="color:#8a6a34">新一轮</span>';
      if (e.seat === 0) toast('你接风先出', 1200);
    }
    else if (e.type === 'settle') {
      settle(e.result);
    }

    if (g.phase === 'play' && e.type !== 'settle' && e.type !== 'tribute') {
      setTimeout(function () { if (!S.paused) scheduleTurn(); }, 0);
    }
  }

  /* ================= 局流程 ================= */
  function startMatch() {
    clearTimers();
    S.sel = {}; S.played = {}; S.hintIdx = 0; S.hintList = null;
    S.pileOpen = null; S.fast = false; S.flushRow = null; S.flushIdx = 0;
    S.paused = false;
    if (S.levels[0] > 14) S.levels[0] = 14;
    if (S.levels[1] > 14) S.levels[1] = 14;

    var lastRanks = null;
    if (S.lastRanksSeats && S.lastRanksSeats.length === 4) {
      lastRanks = S.lastRanksSeats.map(function (seat, i) { return { seat: seat, pos: i + 1 }; });
    }

    /* 构造期间（发牌/进贡）产生的事件要等 S.game 指到新对象后再派发，
       否则会拿上一局的 game 去渲染，甚至第一局直接丢掉进贡面板 */
    var booting = true;
    S.game = new LG.Game({
      levels: S.levels, round: S.round, totalScore: S.stats.score,
      lastRanks: lastRanks,
      onEvent: function (e) {
        if (booting) { setTimeout(function () { onEvent(e); }, 0); }
        else onEvent(e);
      }
    });
    booting = false;

    renderHand(true); renderSeats(); renderPlayzone(); refreshButtons();
    updateHomeInfo();
    showDanjiTip();

    if (S.game.phase === 'play') scheduleTurn();
  }

  function showDanjiTip() {
    var el = $('danjiTip');
    el.classList.add('on');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('on'); }, 3600);
  }

  /* 进贡面板 */
  function renderTribute(t) {
    var body = $('tributeBody'), pick = $('tributePick'), sub = $('tributeSub');
    var html = '';
    if (t.resist) {
      sub.textContent = '进贡方手握双大王';
      html = '<div class="tribute-line"><b>抗贡</b>　进贡方合计两张大王，本局不进贡，头游先出。</div>';
      pick.innerHTML = '';
      $('btnTributeOk').disabled = false;
      $('btnTributeOk').textContent = '开始出牌';
      body.innerHTML = html;
      return;
    }
    t.pairs.forEach(function (p) {
      if (p.skip) return;
      html += '<div class="tribute-line">' + seatLabel(p.from) + ' 进贡 <b>' +
        LG.cardName(p.gift) + '</b> 给 ' + seatLabel(p.to) +
        (p.back ? '，' + seatLabel(p.to) + ' 还贡 <b>' + LG.cardName(p.back) + '</b>' : '') +
        '</div>';
    });
    body.innerHTML = html;

    if (t.wait && t.wait.length) {
      sub.textContent = '请选一张不大于 10 的牌还贡';
      var opts = S.game.returnOptions(0);
      var ph = '';
      opts.forEach(function (c) {
        ph += '<div class="tk" data-id="' + c.id + '">' + LG.cardName(c) + '</div>';
      });
      pick.innerHTML = ph;
      $('btnTributeOk').disabled = true;
      $('btnTributeOk').textContent = '请选择还贡牌';
      Array.prototype.forEach.call(pick.querySelectorAll('.tk'), function (el) {
        el.addEventListener('click', function () {
          var id = parseInt(el.dataset.id, 10);
          if (!S.game.pickReturn(id)) return;
          S.paused = false;
          hide('ovTribute');
          renderHand(true); renderSeats(); refreshButtons();
          if (S.game.phase === 'play') scheduleTurn();
        });
      });
    } else {
      sub.textContent = '本局开始前';
      pick.innerHTML = '';
      $('btnTributeOk').disabled = false;
      $('btnTributeOk').textContent = '开始出牌';
    }
  }

  /* ================= 玩家操作 ================= */
  function doPlay() {
    var g = S.game;
    if (!g || g.phase !== 'play' || g.turn !== 0 || S.trust) return;
    var cb = currentCombo();
    if (!cb) { toast('牌型不合法'); return; }
    if (g.lastPlay && !GD.beats(cb, g.lastPlay.combo)) { toast('管不上，换一手'); return; }
    S.sel = {};
    if (!g.play(0, cb)) { toast('出牌失败'); return; }
    renderHand(true);
    refreshButtons();
    hidePop();
  }

  function doPass() {
    var g = S.game;
    if (!g || g.phase !== 'play' || g.turn !== 0 || S.trust) return;
    if (!g.lastPlay) { toast('你是先手，必须出牌'); return; }
    S.sel = {};
    renderHand(true);
    g.pass(0);
    refreshButtons();
    hidePop();
  }

  /* 提示：按策略直接选中「最划算」的一手；再点循环换一手 */
  function hintScore(cb, hand, level, g) {
    var s = cb.n * 10 - cb.key * 1.5;
    if (GD.isBomb(cb)) s -= 300;
    if (cb.cards.some(function (c) { return GD.isWild(c, level); })) s -= 45;
    var cnt = {}, used = {};
    hand.forEach(function (c) { cnt[c.r] = (cnt[c.r] || 0) + 1; });
    cb.cards.forEach(function (c) { used[c.r] = (used[c.r] || 0) + 1; });
    for (var r in used) {
      var have = cnt[r] || 0, u = used[r];
      if (have >= 4 && u < 4) s -= 90;        // 拆炸弹
      else if (have >= 3 && u < 3) s -= 22;
      else if (have >= 2 && u < 2) s -= 9;
    }
    if (cb.n === hand.length) s += 800;        // 一手走完
    if (hand.length <= 6) s += cb.n * 3;
    /* 配合：我先手且队友只剩 1~2 张 → 优先送他能接的小牌 */
    if (g && !g.lastPlay) {
      var pl = g.hands[2].length;
      if (pl > 0 && pl <= 2) {
        var want = pl === 1 ? 1 : 2;
        if (cb.n === want && !GD.isBomb(cb)) s += 110 - cb.key * 2;
      }
    }
    return s;
  }

  function buildHints() {
    var g = S.game, hand = g.hands[0];
    var raw = g.lastPlay ? GD.genBeats(hand, g.level, g.lastPlay.combo) : GD.genAll(hand, g.level);
    var prefer = (g.lastPlay && g.lastPlay.combo.n === 6) ? g.lastPlay.combo.type : null;
    var list = [], seen = {};
    for (var i = 0; i < raw.length; i++) {
      var ev = GD.evaluateSelection(raw[i].cards, g.level, prefer);
      if (!ev) continue;
      if (g.lastPlay && !GD.beats(ev, g.lastPlay.combo)) continue;
      var sig = ev.type + '|' + ev.n + '|' + ev.key;
      if (seen[sig]) continue;
      seen[sig] = 1;
      ev._sc = hintScore(ev, hand, g.level, g);
      list.push(ev);
    }
    list.sort(function (a, b) { return b._sc - a._sc; });
    return list;
  }

  function doHint() {
    var g = S.game;
    if (!g || g.phase !== 'play' || g.turn !== 0 || S.trust) return;
    var list = buildHints();
    if (!list.length) {
      toast(g.lastPlay ? '没有能管的牌' : '无牌可出', 1200);
      hz([0, 18, 40, 18]);
      return;
    }
    /* 同一回合里重复点提示 → 依次换下一手 */
    if (S.hintIdx >= list.length) S.hintIdx = 0;
    var pick = list[S.hintIdx] || list[0];
    S.hintIdx++;

    S.sel = {};
    pick.cards.forEach(function (c) { S.sel[c.id] = true; });
    S.pileOpen = null;
    S.handSig = '';
    renderHand(true);
    refreshButtons();

    var nm = GD.TYPE_NAME[pick.type] || '牌';
    toast('提示：' + nm + (pick.n > 1 ? pick.n + '张' : '') + (list.length > 1 ? '（再点换一手）' : ''), 1300);
    Snd.pick();
    hz(10);
  }

  function hidePop() { }

  /* ================= 结算 ================= */
  function settle(res) {
    clearTimers();
    S.paused = true;
    $('toast').classList.remove('on');
    hidePop();
    S.stats.games++; S.stats.rounds++;
    var meWin = res.winTeam === 0;
    if (meWin) S.stats.win++; else S.stats.lose++;
    S.stats.score = res.totalScore;
    if (meWin) Snd.win(); else Snd.lose();

    S.levels = S.game.teamLevel.slice();
    S.round = S.game.round;
    S.lastRanksSeats = res.ranks.map(function (r) { return r.seat; });
    if (res.matchWin) {
      S.levels = [2, 2]; S.round = 0; S.lastRanksSeats = null;
    }
    persist();

    $('stTitle').textContent = res.matchWin ? '通关！' : '本局结束';
    $('stSub').textContent = res.matchWin
      ? (meWin ? '我方先过 A' : '对方先过 A')
      : (seatLabel(res.ranks[0].seat) + ' 头游 · 升 ' + res.gain + ' 级' + (res.doubleUp ? '（双下）' : ''));

    var html = '';
    res.ranks.forEach(function (r, i) {
      var sameTeam = (r.seat % 2) === 0;
      var left = (S.game.hands[r.seat] || []).slice();
      left.sort(function (a, b) { return b.r - a.r || a.s - b.s; });
      var txt = left.length
        ? '剩 ' + left.slice(0, 12).map(function (c) {
          return GD.rankText(c.r) + GD.suitText(c.s);
        }).join(' ') + (left.length > 12 ? ' …' : '')
        : '已出完';
      html += '<div class="rank-item ' + (i === 0 ? 'p1' : '') + (r.seat === 0 ? ' mine' : '') + '">' +
        '<div class="pos">' + (i + 1) + '</div>' +
        '<div class="who">' + seatLabel(r.seat) + '<em>' + (sameTeam ? '我方' : '对方') + '</em>' +
        '<span class="cards">' + txt + '</span></div>' +
        '<div class="tag">' + ['头游', '二游', '三游', '末游'][i] + '</div>' +
        '</div>';
    });
    $('stRanks').innerHTML = html;

    var nl = function (r) { return rankName(r); };
    if (res.winTeam === 0) {
      $('stMe').textContent = nl(res.oldLevel) + ' → ' + nl(res.newLevel) + '（+' + res.gain + '）';
      $('stOpp').textContent = nl(S.game.teamLevel[1]);
    } else {
      $('stOpp').textContent = nl(res.oldLevel) + ' → ' + nl(res.newLevel) + '（+' + res.gain + '）';
      $('stMe').textContent = nl(S.game.teamLevel[0]);
    }
    $('stScore').textContent = (res.score > 0 ? '+' : '') + res.score;
    $('stTotal').textContent = res.totalScore;

    $('btnNext').textContent = res.matchWin ? '再来一局' : '继续下一局';
    show('ovSettle');
    renderSeats();
    updateHomeInfo();
  }

  function nextRound() {
    hide('ovSettle');
    S.paused = false;
    if (S.game && S.game.matchOver) {
      S.levels = [2, 2]; S.round = 0; S.lastRanksSeats = null;
      S.stats.score = 0;
      persist();
    }
    startMatch();
  }

  /* ================= 大厅信息 ================= */
  function updateHomeInfo() {
    $('homeProg').textContent = '我方 ' + rankName(S.levels[0]) + ' · 对方 ' + rankName(S.levels[1]);
    $('homeGames').textContent = S.stats.games + ' 局';
    $('homeWin').textContent = S.stats.win + ' / ' + S.stats.lose;
    $('homeScore').textContent = S.stats.score;
    $('tagLevel').textContent = '打 ' + rankName(S.levels[0]);
  }

  function renderStats() {
    var s = S.stats;
    var rate = s.games ? Math.round(s.win / s.games * 100) : 0;
    $('statsRows').innerHTML =
      '<div class="row"><span class="lbl">总对局</span><span>' + s.games + ' 局</span></div>' +
      '<div class="row"><span class="lbl">胜 / 负</span><span>' + s.win + ' / ' + s.lose + '</span></div>' +
      '<div class="row"><span class="lbl">胜率</span><span>' + rate + '%</span></div>' +
      '<div class="row"><span class="lbl">累计积分</span><span>' + s.score + '</span></div>' +
      '<div class="row"><span class="lbl">当前进度</span><span>我方 ' + rankName(S.levels[0]) + ' · 对方 ' + rankName(S.levels[1]) + '</span></div>';
  }

  /* ================= 屏幕切换 ================= */
  function goHome() {
    clearTimers();
    S.paused = true;
    $('scr-table').classList.remove('on');
    $('scr-home').classList.add('on');
    updateHomeInfo();
  }
  function goTable() {
    Snd.init();
    Voice.preload();
    $('scr-home').classList.remove('on');
    $('scr-table').classList.add('on');
    S.paused = false;
    startMatch();
  }

  /* ================= 设置 ================= */
  function syncSetUI() {
    $('speedTxt').textContent = S.speed < 0.8 ? '快 (2.5-4秒)' : (S.speed > 1.3 ? '慢 (8-14秒)' : '5-8 秒');
    $('diffTxt').textContent = ['简单', '普通', '困难'][S.diff] || '普通';
    $('groupTxt').textContent = S.group ? '同牌叠放' : '单列理牌';
    $('sndTxt').textContent = Snd.on ? '开' : '关';
    $('voiceTxt').textContent = S.voice ? '开' : '关';
    $('vibTxt').textContent = S.vib ? '开' : '关';
  }

  /* ================= 绑定 ================= */
  function bind() {
    $('enterGuandan').addEventListener('click', goTable);
    $('btnPlay').addEventListener('click', doPlay);
    $('btnPass').addEventListener('click', doPass);
    $('btnHint').addEventListener('click', doHint);
    $('btnSort').addEventListener('click', function () {
      S.group = !S.group;
      persist();
      renderHand(true);
      toast(S.group ? '同牌叠放' : '单列理牌', 1000);
      $('btnSort').classList.toggle('on', !S.group);
    });

    $('btnExit').addEventListener('click', function () {
      if (S.game && S.game.phase === 'play') {
        if (!confirm('退出本局？进度会保存。')) return;
      }
      goHome();
    });

    $('btnNext').addEventListener('click', nextRound);

    $('btnStats').addEventListener('click', function () { renderStats(); show('ovStats'); });
    $('btnStatsClose').addEventListener('click', function () { hide('ovStats'); });
    $('btnRule').addEventListener('click', function () { show('ovRule'); });
    $('btnRuleClose').addEventListener('click', function () { hide('ovRule'); });
    $('btnSet').addEventListener('click', function () { syncSetUI(); show('ovSet'); });
    $('btnSet2').addEventListener('click', function () { syncSetUI(); S.paused = true; show('ovSet'); });
    $('btnSetClose').addEventListener('click', function () {
      hide('ovSet');
      if ($('scr-table').classList.contains('on') && S.game && S.game.phase === 'play') {
        S.paused = false; scheduleTurn();
      }
    });

    $('btnCounter').addEventListener('click', function () {
      renderCounter();
      var bar = $('counterBar');
      bar.classList.toggle('on');
      $('btnCounter').classList.toggle('on', bar.classList.contains('on'));
    });

    $('btnTrust').addEventListener('click', function () {
      S.trust = !S.trust;
      $('btnTrust').classList.toggle('on', S.trust);
      $('trustFlag').classList.toggle('on', S.trust);
      toast(S.trust ? '托管中，自动出牌' : '取消托管', 1200);
      if (S.trust && S.game && S.game.turn === 0 && S.game.phase === 'play') scheduleTurn();
      refreshButtons();
    });

    $('btnFlush').addEventListener('click', doFlush);
    $('btnFlushRow').addEventListener('click', doFlushRow);
    $('btnFlushBack').addEventListener('click', doFlushBack);

    $('btnFast').addEventListener('click', function () {
      S.fast = !S.fast;
      updateWatch();
      toast(S.fast ? '快进：电脑出牌加速' : '恢复正常速度', 1100);
      var g = S.game;
      if (g && g.phase === 'play' && g.turn !== 0) scheduleTurn();
    });

    $('btnTributeOk').addEventListener('click', function () {
      hide('ovTribute');
      S.paused = false;
      if (S.game && S.game.phase === 'play') scheduleTurn();
    });

    $('setSpeed').addEventListener('click', function () {
      S.speed = S.speed < 0.8 ? 1 : (S.speed < 1.3 ? 1.7 : 0.5);
      persist(); syncSetUI();
    });
    $('setVoice').addEventListener('click', function () {
      S.voice = !S.voice;
      persist(); syncSetUI();
      if (S.voice) { Voice.preload(); Voice.play('pair'); }
      toast('报牌语音：' + (S.voice ? '开' : '关'), 1000);
    });
    $('setVib').addEventListener('click', function () {
      S.vib = !S.vib;
      persist(); syncSetUI();
      if (S.vib) hz(30);
      toast('震动：' + (S.vib ? '开' : '关'), 1000);
    });
    $('setDiff').addEventListener('click', function () {
      S.diff = (S.diff + 1) % 3;
      persist(); syncSetUI();
      toast('电脑难度：' + ['简单', '普通', '困难'][S.diff], 1200);
    });
    $('setSnd').addEventListener('click', function () {
      Snd.on = !Snd.on; if (Snd.on) Snd.pick();
      persist(); syncSetUI();
    });
    $('setGroup').addEventListener('click', function () {
      S.group = !S.group;
      persist(); syncSetUI();
      renderHand(true);
      $('btnSort').classList.toggle('on', !S.group);
    });
    $('setReset').addEventListener('click', function () {
      if (!confirm('清空存档？当前进度与战绩都会重置。')) return;
      Store.clear();
      S.levels = [2, 2]; S.round = 0; S.lastRanksSeats = null;
      S.stats = { games: 0, win: 0, lose: 0, rounds: 0, score: 0 };
      updateHomeInfo(); syncSetUI();
      toast('存档已清空');
    });

    window.addEventListener('resize', function () {
      if (S.game && $('scr-table').classList.contains('on')) renderHand(true);
    });
    document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    /* 点空白处收起扇开的牌摞 */
    document.addEventListener('click', function (ev) {
      if (S.pileOpen == null) return;
      var t = ev.target;
      if (t && t.closest && (t.closest('.card') || t.closest('.piletag'))) return;
      S.pileOpen = null;
      renderHand(true);
    });
  }

  /* 返回键：先关面板，再回大厅 */
  window.__gdOnBack = function () {
    var ov = document.querySelector('.overlay.on');
    if (ov) {
      if (ov.id === 'ovTribute') return true;     // 进贡未确认不可跳过
      ov.classList.remove('on');
      if ($('scr-table').classList.contains('on') && S.game && S.game.phase === 'play') {
        S.paused = false; scheduleTurn();
      }
      return true;
    }
    if ($('scr-table').classList.contains('on')) { goHome(); return true; }
    return false;
  };

  /* ================= 启动 ================= */
  function boot() {
    loadSave();
    bind();
    window.__S = S;
    window.__gdRenderHand = renderHand;
    window.__gdSetPaused = function (v) { S.paused = !!v; };
    updateHomeInfo();
    syncSetUI();
    $('btnSort').classList.toggle('on', !S.group);
    if (/[?&]auto=table/.test(location.search)) {
      setTimeout(goTable, 50);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
