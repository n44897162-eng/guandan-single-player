/* 掼蛋单机版 - 规则引擎与 AI
 * 原创实现，规则参照公开的掼蛋玩法。
 * 牌: {r, s}  r: 2-14 (2..A), 16=小王, 17=大王;  s: 0黑桃 1红桃 2梅花 3方块, 4=王
 */
(function (global) {
  'use strict';

  var SUITS = ['\u2660', '\u2665', '\u2663', '\u2666', ''];
  var RANK_TXT = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 16: '\u5c0f', 17: '\u5927' };

  function rankText(r) { return RANK_TXT[r] || String(r); }
  function suitText(s) { return SUITS[s] || ''; }
  function isRed(c) { return c.s === 1 || c.s === 3 || c.r === 17; }
  function isJoker(c) { return c.r >= 16; }
  function isWild(c, level) { return c.r === level && c.s === 1; }

  /* 单张/对子/三张的比较力: 级牌升到 A 之上、王之下 */
  function power(c, level) {
    if (c.r >= 16) return c.r;          // 16 小王, 17 大王
    if (c.r === level) return 15;       // 级牌
    return c.r;
  }
  function powerOfRank(r, level) {
    if (r >= 16) return r;
    if (r === level) return 15;
    return r;
  }

  var BOMB_TYPES = { bomb: 1, flush: 1, jokerbomb: 1 };

  function isBomb(cb) { return !!BOMB_TYPES[cb.type]; }
  function bombWeight(cb) {
    if (cb.type === 'jokerbomb') return 100;
    if (cb.type === 'flush') return 5.5;
    return cb.n; // 4~10 炸
  }

  /* a 能否压过 b */
  function beats(a, b) {
    if (!b) return true;
    var ab = isBomb(a), bb = isBomb(b);
    if (ab && !bb) return true;
    if (!ab && bb) return false;
    if (ab && bb) {
      var wa = bombWeight(a), wb = bombWeight(b);
      if (wa !== wb) return wa > wb;
      return a.key > b.key;
    }
    if (a.type !== b.type) return false;
    if (a.n !== b.n) return false;
    return a.key > b.key;
  }

  /* ---------- 手牌索引 ---------- */
  function indexHand(hand, level) {
    var byRank = {}, wilds = [];
    for (var i = 0; i < hand.length; i++) {
      var c = hand[i];
      if (isWild(c, level)) wilds.push(c);
      else (byRank[c.r] = byRank[c.r] || []).push(c);
    }
    return { byRank: byRank, wilds: wilds };
  }

  function pick(byRank, r, n) {
    var arr = byRank[r] || [];
    return arr.slice(0, n);
  }

  /* ---------- 组合构造 ---------- */
  function combo(type, cards, key, extra) {
    var cb = { type: type, n: cards.length, key: key, cards: cards };
    if (extra) for (var k in extra) cb[k] = extra[k];
    return cb;
  }

  /* ---------- 生成所有可出的牌型 ---------- */
  function genAll(hand, level, opts) {
    opts = opts || {};
    var idx = indexHand(hand, level);
    var byRank = idx.byRank, wilds = idx.wilds, W = wilds.length;
    var out = [];
    var ranks = Object.keys(byRank).map(Number).sort(function (a, b) { return a - b; });

    // 单张
    for (var i = 0; i < ranks.length; i++) {
      var r = ranks[i];
      out.push(combo('single', [byRank[r][0]], powerOfRank(r, level)));
    }
    if (W > 0) out.push(combo('single', [wilds[0]], 15));

    // 对子
    for (var i2 = 0; i2 < ranks.length; i2++) {
      var r2 = ranks[i2], arr2 = byRank[r2];
      if (arr2.length >= 2) out.push(combo('pair', arr2.slice(0, 2), powerOfRank(r2, level)));
      else if (arr2.length === 1 && W >= 1) out.push(combo('pair', [arr2[0], wilds[0]], powerOfRank(r2, level)));
    }
    if (W >= 2) out.push(combo('pair', [wilds[0], wilds[1]], 15));

    // 三张
    for (var i3 = 0; i3 < ranks.length; i3++) {
      var r3 = ranks[i3], a3 = byRank[r3];
      if (a3.length >= 3) out.push(combo('triple', a3.slice(0, 3), powerOfRank(r3, level)));
      else if (a3.length === 2 && W >= 1) out.push(combo('triple', a3.concat([wilds[0]]), powerOfRank(r3, level)));
      else if (a3.length === 1 && W >= 2) out.push(combo('triple', a3.concat(wilds.slice(0, 2)), powerOfRank(r3, level)));
    }

    // 三带二
    for (var i4 = 0; i4 < ranks.length; i4++) {
      var r4 = ranks[i4], a4 = byRank[r4].slice();
      var need4 = r4 === level ? 3 : 3;
      var useW = 0;
      if (a4.length < 3) { useW = 3 - a4.length; if (useW > W) continue; }
      var trip = a4.slice(0, 3).concat(wilds.slice(0, useW));
      var restW = W - useW;
      // 找一对
      for (var j = 0; j < ranks.length; j++) {
        var q = ranks[j];
        if (q === r4) continue;
        var bq = byRank[q];
        if (bq.length >= 2) {
          out.push(combo('fullhouse', trip.concat(bq.slice(0, 2)), powerOfRank(r4, level)));
        } else if (bq.length === 1 && restW >= 1) {
          out.push(combo('fullhouse', trip.concat([bq[0], wilds[useW]]), powerOfRank(r4, level)));
        }
      }
    }

    // 顺子 / 三连对 / 钢板
    function seqRanks(s, len) {
      var a = [];
      for (var k = 0; k < len; k++) {
        var v = s + k;
        a.push(v === 1 ? 14 : v);
      }
      return a;
    }
    function hasRank(byRank, rr) { return !!(byRank[rr] && byRank[rr].length); }

    // 顺子: 5 张连续，s=1..10
    for (var s1 = 1; s1 <= 10; s1++) {
      var seq = seqRanks(s1, 5), miss = 0, ok = true;
      for (var k1 = 0; k1 < 5; k1++) if (!hasRank(byRank, seq[k1])) miss++;
      if (miss > W) continue;
      var need = [];
      for (var k2 = 0; k2 < 5; k2++) if (!hasRank(byRank, seq[k2])) need.push(seq[k2]);
      var cards5 = [], wi = 0;
      for (var k3 = 0; k3 < 5; k3++) {
        var rr = seq[k3];
        if (hasRank(byRank, rr)) cards5.push(byRank[rr][0]);
        else cards5.push(wilds[wi++]);
      }
      // 级牌在顺子里按自然点数
      // 若 5 张恰好同花，应归为同花顺（更强），此处不重复生成顺子
      var allSameSuit = cards5.every(function (c) { return c.s === cards5[0].s && !isWild(c, level); });
      if (!allSameSuit) out.push(combo('straight', cards5, s1 + 4));
    }
    // 同花顺
    for (var suit = 0; suit < 4; suit++) {
      for (var s2 = 1; s2 <= 10; s2++) {
        var seq2 = seqRanks(s2, 5), cardsF = [], missF = 0;
        for (var k4 = 0; k4 < 5; k4++) {
          var rr2 = seq2[k4], cand = null, arr = byRank[rr2] || [];
          for (var m = 0; m < arr.length; m++) if (arr[m].s === suit) { cand = arr[m]; break; }
          if (cand) cardsF.push(cand); else missF++;
        }
        if (missF > W) continue;
        var wiF = 0, full = [];
        for (var k5 = 0; k5 < 5; k5++) {
          var rr3 = seq2[k5], cand2 = null, arr2 = byRank[rr3] || [];
          for (var m2 = 0; m2 < arr2.length; m2++) if (arr2[m2].s === suit) { cand2 = arr2[m2]; break; }
          full.push(cand2 || wilds[wiF++]);
        }
        out.push(combo('flush', full, s2 + 4, { suit: suit }));
      }
    }
    // 三连对: 3 个连续对子
    for (var s3 = 1; s3 <= 12; s3++) {
      var seq3 = seqRanks(s3, 3), cards6 = [], miss3 = 0, ok3 = true;
      for (var k6 = 0; k6 < 3; k6++) {
        var rr4 = seq3[k6], have = (byRank[rr4] || []).length;
        if (have >= 2) miss3 += 0; else miss3 += (2 - have);
      }
      if (miss3 > W) continue;
      var wi3 = 0, full3 = [];
      for (var k7 = 0; k7 < 3; k7++) {
        var rr5 = seq3[k7], have5 = (byRank[rr5] || []);
        var take = Math.min(2, have5.length);
        for (var t = 0; t < take; t++) full3.push(have5[t]);
        for (var t2 = take; t2 < 2; t2++) full3.push(wilds[wi3++]);
      }
      out.push(combo('tube', full3, s3 + 2));
    }
    // 钢板: 2 个连续三张
    for (var s4 = 1; s4 <= 13; s4++) {
      var seq4 = seqRanks(s4, 2), full4 = [], miss4 = 0;
      for (var k8 = 0; k8 < 2; k8++) {
        var rr6 = seq4[k8], have6 = (byRank[rr6] || []).length;
        if (have6 < 3) miss4 += (3 - have6);
      }
      if (miss4 > W) continue;
      var wi4 = 0;
      for (var k9 = 0; k9 < 2; k9++) {
        var rr7 = seq4[k9], have7 = (byRank[rr7] || []);
        var take7 = Math.min(3, have7.length);
        for (var t3 = 0; t3 < take7; t3++) full4.push(have7[t3]);
        for (var t4 = take7; t4 < 3; t4++) full4.push(wilds[wi4++]);
      }
      out.push(combo('plate', full4, s4 + 1));
    }

    // 炸弹
    for (var i5 = 0; i5 < ranks.length; i5++) {
      var r5 = ranks[i5];
      if (r5 >= 16) continue;                 // 王不参与普通炸弹
      var have5 = byRank[r5].length;
      var maxN = Math.min(10, have5 + W);
      for (var n5 = 4; n5 <= maxN; n5++) {
        var useWild5 = Math.max(0, n5 - have5);
        if (useWild5 > W) continue;
        var cs = byRank[r5].slice(0, n5).concat(wilds.slice(0, useWild5));
        out.push(combo('bomb', cs, powerOfRank(r5, level), { n: n5 }));
      }
    }
    // 天王炸
    if ((byRank[16] || []).length >= 2 && (byRank[17] || []).length >= 2) {
      out.push(combo('jokerbomb', byRank[16].slice(0, 2).concat(byRank[17].slice(0, 2)), 100));
    }

    // 去重
    var seen = {}, uniq = [];
    for (var i6 = 0; i6 < out.length; i6++) {
      var cb = out[i6];
      var sig = cb.type + '|' + cb.n + '|' + cb.key + '|' + cb.cards.map(function (c) { return c.r + '' + c.s; }).sort().join(',');
      if (!seen[sig]) { seen[sig] = 1; uniq.push(cb); }
    }
    return uniq;
  }

  /* 只生成能压过 target 的牌 */
  function genBeats(hand, level, target) {
    var all = genAll(hand, level);
    var out = [];
    for (var i = 0; i < all.length; i++) if (beats(all[i], target)) out.push(all[i]);
    out.sort(function (a, b) {
      var ab = isBomb(a), bb = isBomb(b);
      if (ab !== bb) return ab ? 1 : -1;
      if (ab && bb) { var wa = bombWeight(a), wb = bombWeight(b); if (wa !== wb) return wa - wb; return a.key - b.key; }
      return a.key - b.key;
    });
    return out;
  }

  /* ---------- 校验玩家选中的牌 ---------- */
  function evaluateSelection(cards, level, prefer) {
    var n = cards.length;
    if (!n) return null;
    var byRank = {}, wilds = [];
    for (var i = 0; i < n; i++) {
      var c = cards[i];
      if (isWild(c, level)) wilds.push(c);
      else (byRank[c.r] = byRank[c.r] || []).push(c);
    }
    var ranks = Object.keys(byRank).map(Number).sort(function (a, b) { return a - b; });
    var W = wilds.length;

    if (n === 1) return combo('single', cards, power(cards[0], level));

    // 天王炸: 两小王 + 两大王
    if (n === 4 && W === 0 && cards.every(function (c) { return isJoker(c); })) {
      var sm = cards.filter(function (c) { return c.r === 16; }).length;
      var bg = cards.filter(function (c) { return c.r === 17; }).length;
      return (sm === 2 && bg === 2) ? combo('jokerbomb', cards, 100) : null;
    }
    var hasJoker = cards.some(isJoker);

    // 炸弹（4 张以上同点，王不参与）
    if (n >= 4 && ranks.length <= 1 && !hasJoker) {
      var rr = ranks.length ? ranks[0] : level;
      return combo('bomb', cards, powerOfRank(rr, level), { n: n });
    }

    if (n === 2) {
      if (ranks.length === 1 && (byRank[ranks[0]].length === 2 || (byRank[ranks[0]].length === 1 && W === 1)))
        return combo('pair', cards, powerOfRank(ranks[0], level));
      if (ranks.length === 1 && W === 0 && byRank[ranks[0]].length === 2 && isJoker(byRank[ranks[0]][0]))
        return combo('pair', cards, powerOfRank(ranks[0], level));
      if (W === 2) return combo('pair', cards, 15);
      if (ranks.length === 1) return combo('pair', cards, powerOfRank(ranks[0], level));
      return null;
    }
    if (n === 3) {
      if (ranks.length === 1 && byRank[ranks[0]].length + W === 3) return combo('triple', cards, powerOfRank(ranks[0], level));
      if (W === 3) return null;
      return null;
    }

    // 5 张: 三带二 / 顺子 / 同花顺
    if (n === 5) {
      if (hasJoker) {
        var fhj = tryFullHouse(cards, level);
        return fhj;
      }
      // 同花顺
      if (wilds.length <= 2) {
        var suits = {}, nat = cards.filter(function (c) { return !isWild(c, level); });
        var allSame = nat.length > 0 && nat.every(function (c) { return c.s === nat[0].s; });
        if (allSame) {
          var flush = trySequence(cards, level, 5, true, nat[0].s);
          if (flush) return flush;
        }
      }
      var st = trySequence(cards, level, 5, false, -1);
      if (st) return st;
      var fh = tryFullHouse(cards, level);
      if (fh) return fh;
      return null;
    }

    // 6 张: 三连对 / 钢板（王不可参与）
    if (n === 6) {
      if (hasJoker) return null;
      // 逢人配可能同时凑成两种牌型，按需要压制的牌型优先
      var tryOrder = (prefer === 'plate') ? [3, 2] : [2, 3];
      for (var oi = 0; oi < 2; oi++) {
        var mode = tryOrder[oi];
        var r6 = (mode === 3) ? tryMultiSeq(cards, level, 3, 2) : tryMultiSeq(cards, level, 2, 3);
        if (r6) return r6;
      }
      return null;
    }
    return null;
  }

  function tryFullHouse(cards, level) {
    var byRank = {}, W = 0;
    for (var i = 0; i < cards.length; i++) {
      if (isWild(cards[i], level)) W++;
      else (byRank[cards[i].r] = byRank[cards[i].r] || []).push(cards[i]);
    }
    var ranks = Object.keys(byRank).map(Number);
    if (ranks.length !== 2) return null;
    var a = ranks[0], b = ranks[1];
    var ca = byRank[a].length, cb = byRank[b].length;
    if (ca + cb + W !== 5) return null;
    // a 作三张
    if (ca <= 3 && cb <= 2 && (3 - ca) + (2 - cb) === W) return combo('fullhouse', cards, powerOfRank(a, level));
    if (cb <= 3 && ca <= 2 && (3 - cb) + (2 - ca) === W) return combo('fullhouse', cards, powerOfRank(b, level));
    return null;
  }

  function trySequence(cards, level, len, sameSuit, suit) {
    var byRank = {}, W = 0;
    for (var i = 0; i < cards.length; i++) {
      if (isWild(cards[i], level)) W++;
      else (byRank[cards[i].r] = byRank[cards[i].r] || []).push(cards[i]);
    }
    var ranks = Object.keys(byRank).map(Number);
    if (ranks.length + W !== len) return null;
    if (sameSuit) {
      for (var q = 0; q < ranks.length; q++) {
        var arr = byRank[ranks[q]];
        if (!arr.some(function (c) { return c.s === suit; })) return null;
      }
    }
    // 尝试把 A 当 1 或 14
    for (var s = 1; s <= 14 - len + 1; s++) {
      var need = [], ok = true;
      for (var k = 0; k < len; k++) {
        var v = s + k;
        var rr = v === 1 ? 14 : v;
        if (!byRank[rr] || !byRank[rr].length) { need.push(rr); }
      }
      if (need.length !== W) continue;
      // 检查所有自然牌都在窗口内且不重复
      var used = {};
      var good = true;
      for (var q2 = 0; q2 < ranks.length; q2++) {
        var r2 = ranks[q2];
        var inWin = false;
        for (var k2 = 0; k2 < len; k2++) {
          var v2 = s + k2; var rr2 = v2 === 1 ? 14 : v2;
          if (rr2 === r2) { inWin = true; break; }
        }
        if (!inWin || used[r2]) { good = false; break; }
        used[r2] = 1;
        if (byRank[r2].length !== 1) { good = false; break; }
      }
      if (!good) continue;
      var top = s + len - 1;
      return combo(sameSuit ? 'flush' : 'straight', cards, top, sameSuit ? { suit: suit } : null);
    }
    return null;
  }

  function tryMultiSeq(cards, level, pairCount, perRank) {
    var byRank = {}, W = 0;
    for (var i = 0; i < cards.length; i++) {
      if (isWild(cards[i], level)) W++;
      else (byRank[cards[i].r] = byRank[cards[i].r] || []).push(cards[i]);
    }
    var ranks = Object.keys(byRank).map(Number);
    for (var s = 1; s + pairCount - 1 <= 14; s++) {
      var win = [], miss = 0, ok = true, used = 0;
      for (var k = 0; k < pairCount; k++) {
        var v = s + k, rr = v === 1 ? 14 : v;
        win.push(rr);
        var have = (byRank[rr] || []).length;
        if (have > perRank) { ok = false; break; }
        used += have;
        miss += perRank - have;
      }
      if (!ok) continue;
      if (miss !== W) continue;
      if (used + W !== cards.length) continue;
      var allIn = ranks.every(function (r) { return win.indexOf(r) >= 0; });
      if (!allIn) continue;
      return combo(perRank === 2 ? 'tube' : 'plate', cards, s + pairCount - 1);
    }
    return null;
  }

  /* ---------- 牌堆 ---------- */
  function newDeck() {
    var deck = [], id = 0;
    for (var d = 0; d < 2; d++) {
      for (var s = 0; s < 4; s++) {
        for (var r = 2; r <= 14; r++) deck.push({ r: r, s: s, id: id++ });
      }
      deck.push({ r: 16, s: 4, id: id++ });
      deck.push({ r: 17, s: 4, id: id++ });
    }
    return deck;
  }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function sortHand(hand, level) {
    return hand.slice().sort(function (a, b) {
      var pa = power(a, level), pb = power(b, level);
      if (pa !== pb) return pb - pa;
      return a.s - b.s;
    });
  }

  /* ---------- 类型名 ---------- */
  var TYPE_NAME = {
    single: '\u5355\u5f20', pair: '\u5bf9\u5b50', triple: '\u4e09\u5f20',
    fullhouse: '\u4e09\u5e26\u4e8c', straight: '\u987a\u5b50', tube: '\u4e09\u8fde\u5bf9',
    plate: '\u94a2\u677f', bomb: '\u70b8\u5f39', flush: '\u540c\u82b1\u987a', jokerbomb: '\u5929\u738b\u70b8'
  };

  var api = {
    SUITS: SUITS, rankText: rankText, suitText: suitText, isRed: isRed, isJoker: isJoker,
    isWild: isWild, power: power, powerOfRank: powerOfRank, beats: beats, isBomb: isBomb,
    bombWeight: bombWeight, genAll: genAll, genBeats: genBeats, evaluateSelection: evaluateSelection,
    newDeck: newDeck, shuffle: shuffle, sortHand: sortHand, TYPE_NAME: TYPE_NAME, combo: combo
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else global.GD = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
