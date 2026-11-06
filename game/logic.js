/* 掼蛋单机版 - 对局流程 + AI
 * 规则：两副牌、级牌、逢人配、进贡/还贡/抗贡、接风、双下升级
 */
(function (global) {
  'use strict';
  var GD = (typeof module === 'object' && module.exports) ? require('./engine.js') : global.GD;

  var SEAT_SHORT = ['你', '下家', '对家', '上家'];

  function teamOf(seat) { return seat % 2; }

  function rankName(r) {
    return r === 14 ? 'A' : (r === 11 ? 'J' : r === 12 ? 'Q' : r === 13 ? 'K' : String(r));
  }
  function cardName(c) {
    if (c.r >= 16) return c.r === 17 ? '大王' : '小王';
    return GD.suitText(c.s) + GD.rankText(c.r);
  }

  /* ---------------- 对局 ---------------- */
  function Game(opts) {
    opts = opts || {};
    this.teamLevel = (opts.levels && opts.levels.length === 2) ? opts.levels.slice() : [2, 2];
    this.round = opts.round || 0;
    this.lastRanks = opts.lastRanks || null;
    this.totalScore = opts.totalScore || 0;
    this.matchOver = false;
    this.winnerTeam = -1;
    this.logs = [];
    this.onEvent = opts.onEvent || function () { };
    this.startRound();
  }

  Game.prototype.currentLevel = function () {
    if (this.lastRanks) return this.teamLevel[teamOf(this.lastRanks[0].seat)];
    return this.teamLevel[0] === this.teamLevel[1] ? this.teamLevel[0] : Math.max(this.teamLevel[0], this.teamLevel[1]);
  };

  Game.prototype.log = function (txt) {
    this.logs.push(txt);
    if (this.logs.length > 200) this.logs.shift();
  };

  Game.prototype.startRound = function () {
    this.round++;
    this.level = this.currentLevel();
    var deck = GD.shuffle(GD.newDeck());
    this.hands = [[], [], [], []];
    for (var i = 0; i < 108; i++) this.hands[i % 4].push(deck[i]);
    for (var s = 0; s < 4; s++) this.hands[s] = GD.sortHand(this.hands[s], this.level);

    this.finished = [];        // 已出完的座位, 按名次
    this.lastPlay = null;      // {seat, combo}
    this.passed = {};          // 本轮已过牌
    this.trickNo = 0;

    this.tribute = this.lastRanks ? this.buildTribute() : null;

    if (this.tribute && this.tribute.wait && this.tribute.wait.length) {
      this.phase = 'tribute';
      this.turn = -1;
      this.onEvent({ type: 'roundStart' });
      this.onEvent({ type: 'tribute', tribute: this.tribute });
      return;
    }

    this.phase = 'play';
    this.turn = this.leadSeat();
    this.log('第 ' + this.round + ' 局开始，打 ' + rankName(this.level));
    this.onEvent({ type: 'roundStart' });
    if (this.tribute && (this.tribute.resist || this.tribute.pairs.length)) {
      this.onEvent({ type: 'tribute', tribute: this.tribute });
    }
  };

  /* 首出座位：上局头游先出；首局随机 */
  Game.prototype.leadSeat = function () {
    if (this.lastRanks) return this.lastRanks[0].seat;
    if (typeof this.firstSeat === 'number') return this.firstSeat;
    this.firstSeat = Math.floor(Math.random() * 4);
    return this.firstSeat;
  };

  /* ---------------- 进贡 / 还贡 / 抗贡 ---------------- */
  Game.prototype.buildTribute = function () {
    var self = this;
    var ranks = this.lastRanks;
    var winTeam = teamOf(ranks[0].seat);
    var doubleDown = teamOf(ranks[2].seat) !== winTeam;

    var pairs = [];
    if (doubleDown) {
      pairs.push({ from: ranks[3].seat, to: ranks[0].seat });   // 末游 -> 头游
      pairs.push({ from: ranks[2].seat, to: ranks[1].seat });   // 三游 -> 二游
    } else {
      pairs.push({ from: ranks[3].seat, to: ranks[0].seat });   // 末游 -> 头游
    }

    // 抗贡：进贡方合计两张大王
    var bigJokers = 0;
    pairs.forEach(function (p) {
      bigJokers += self.hands[p.from].filter(function (c) { return c.r === 17; }).length;
    });

    var t = { resist: bigJokers >= 2, doubleDown: doubleDown, pairs: pairs, wait: [] };
    this.tribute = t;
    if (t.resist) { this.log('进贡方手持双大王，抗贡'); return t; }

    // 进贡：除红桃级牌外最大的一张
    pairs.forEach(function (p) {
      var gift = self.pickGiftCard(p.from);
      if (!gift) { p.skip = true; return; }
      self.removeCard(p.from, gift);
      self.hands[p.to].push(gift);
      p.gift = gift;
    });

    // 还贡：不大于 10 的最小牌（逢人配不可还贡）
    pairs.forEach(function (p) {
      if (p.skip) return;
      if (p.to === 0) { t.wait.push(p); return; }   // 由玩家自己选
      var back = self.pickReturnCard(p.to);
      if (back) {
        self.removeCard(p.to, back);
        self.hands[p.from].push(back);
        p.back = back;
      }
    });

    for (var s = 0; s < 4; s++) this.hands[s] = GD.sortHand(this.hands[s], this.level);
    this.log('进贡还贡完成');
    this.tribute = t;
    return t;
  };

  Game.prototype.pickGiftCard = function (seat) {
    var hand = this.hands[seat], level = this.level, best = null;
    for (var i = 0; i < hand.length; i++) {
      var c = hand[i];
      if (GD.isWild(c, level)) continue;           // 红桃级牌不进贡
      if (!best || GD.power(c, level) > GD.power(best, level)) best = c;
    }
    if (!best && hand.length) best = hand[0];
    return best;
  };

  Game.prototype.returnOptions = function (seat) {
    var hand = this.hands[seat], level = this.level;
    var soft = hand.filter(function (c) {
      return c.r <= 10 && !GD.isWild(c, level) && !GD.isJoker(c);
    });
    if (soft.length) return soft;
    return hand.filter(function (c) { return !GD.isWild(c, level); });
  };

  Game.prototype.pickReturnCard = function (seat) {
    var list = this.returnOptions(seat);
    if (!list.length) return null;
    var best = list[0];
    for (var i = 1; i < list.length; i++) {
      if (GD.power(list[i], this.level) < GD.power(best, this.level)) best = list[i];
    }
    return best;
  };

  Game.prototype.removeCard = function (seat, card) {
    var h = this.hands[seat];
    for (var i = 0; i < h.length; i++) if (h[i].id === card.id) { h.splice(i, 1); return true; }
    return false;
  };

  /* 玩家选择还贡牌 */
  Game.prototype.pickReturn = function (cardId) {
    var t = this.tribute;
    if (!t || !t.wait || !t.wait.length) return false;
    var p = t.wait[0];
    var card = null;
    for (var i = 0; i < this.hands[0].length; i++) {
      if (this.hands[0][i].id === cardId) { card = this.hands[0][i]; break; }
    }
    if (!card) return false;
    this.removeCard(0, card);
    this.hands[p.from].push(card);
    p.back = card;
    t.wait.shift();

    this.hands[p.from] = GD.sortHand(this.hands[p.from], this.level);

    if (t.wait.length) return true;

    this.phase = 'play';
    this.turn = this.leadSeat();
    this.log('第 ' + this.round + ' 局开始，打 ' + rankName(this.level));
    this.onEvent({ type: 'playStart' });
    return true;
  };

  Game.prototype.activeSeats = function () {
    var out = [];
    for (var s = 0; s < 4; s++) if (this.hands[s].length > 0) out.push(s);
    return out;
  };

  Game.prototype.nextActive = function (from) {
    for (var i = 1; i <= 4; i++) {
      var s = (from + i) % 4;
      if (this.hands[s].length > 0) return s;
    }
    return -1;
  };

  /* 出牌 */
  Game.prototype.play = function (seat, cb) {
    if (this.phase !== 'play' || seat !== this.turn) return false;
    if (this.lastPlay && !GD.beats(cb, this.lastPlay.combo)) return false;

    var hand = this.hands[seat];
    var ids = {};
    cb.cards.forEach(function (c) { ids[c.id] = 1; });
    for (var i = 0; i < cb.cards.length; i++) {
      if (!hand.some(function (h) { return h.id === cb.cards[i].id; })) return false;
    }
    this.hands[seat] = hand.filter(function (c) { return !ids[c.id]; });

    var newTrick = !this.lastPlay || this.lastPlay.seat === seat;
    if (newTrick) this.trickNo++;
    this.lastPlay = { seat: seat, combo: cb };
    this.passed = {};
    this.onEvent({ type: 'play', seat: seat, combo: cb, newTrick: newTrick });

    if (this.hands[seat].length === 0 && this.finished.indexOf(seat) < 0) {
      this.finished.push(seat);
      this.onEvent({ type: 'finish', seat: seat, rank: this.finished.length });
    }
    if (this.finished.length === 3) {
      this.settle();
      return true;
    }
    this.turn = this.nextActive(seat);
    return true;
  };

  /* 过牌 */
  Game.prototype.pass = function (seat) {
    if (this.phase !== 'play' || seat !== this.turn || !this.lastPlay) return false;
    this.passed[seat] = 1;
    this.onEvent({ type: 'pass', seat: seat });

    var lastSeat = this.lastPlay.seat;
    var allPassed = true;
    var act = this.activeSeats();
    for (var i = 0; i < act.length; i++) {
      var s = act[i];
      if (s === lastSeat) continue;
      if (!this.passed[s]) { allPassed = false; break; }
    }
    if (allPassed) {
      this.lastPlay = null;
      this.passed = {};
      var lead;
      if (this.hands[lastSeat].length > 0) {
        lead = lastSeat;
      } else {
        // 接风：出完牌的人其余都不要，由搭档接风
        var partner = (lastSeat + 2) % 4;
        lead = this.hands[partner].length > 0 ? partner : this.nextActive(lastSeat);
        this.onEvent({ type: 'jiefeng', seat: lead });
      }
      this.turn = lead;
      this.onEvent({ type: 'newTrick', seat: this.turn });
    } else {
      this.turn = this.nextActive(seat);
    }
    return true;
  };

  /* 结算 */
  Game.prototype.settle = function () {
    this.phase = 'over';
    var ranks = this.finished.slice();
    for (var s = 0; s < 4; s++) if (ranks.indexOf(s) < 0) ranks.push(s);
    this.lastRanks = ranks.map(function (seat, i) { return { seat: seat, pos: i + 1 }; });

    var winTeam = teamOf(ranks[0]);
    var partnerPos = ranks.indexOf((ranks[0] + 2) % 4); // 0..3
    var gain = 4 - partnerPos;                          // 1/2/3
    var oldLevel = this.teamLevel[winTeam];
    var newLevel = Math.min(14, oldLevel + gain);
    var matchWin = (oldLevel === 14 && gain > 0);
    if (matchWin) newLevel = 14;
    this.teamLevel[winTeam] = newLevel;

    var doubleDown = partnerPos === 1;
    var score = gain * 100 + (doubleDown ? 100 : 0);
    var meWin = winTeam === 0;
    this.scoreDelta = meWin ? score : -score;
    this.totalScore += this.scoreDelta;

    this.result = {
      ranks: this.lastRanks, winTeam: winTeam, gain: gain,
      oldLevel: oldLevel, newLevel: newLevel, matchWin: matchWin,
      doubleUp: doubleDown,
      score: this.scoreDelta, totalScore: this.totalScore
    };
    if (matchWin) { this.matchOver = true; this.winnerTeam = winTeam; }
    this.log(SEAT_SHORT[ranks[0]] + ' 头游，' + (meWin ? '我方' : '对手') +
      '升 ' + gain + ' 级（' + rankName(oldLevel) + ' → ' + rankName(newLevel) + '）');
    this.onEvent({ type: 'settle', result: this.result });
  };

  Game.prototype.nextRound = function () {
    if (this.matchOver) return;
    this.startRound();
  };

  /* ---------------- AI ---------------- */
  function countByRank(hand) {
    var c = {};
    for (var i = 0; i < hand.length; i++) c[hand[i].r] = (c[hand[i].r] || 0) + 1;
    return c;
  }

  /* 手牌「凌乱度」：单张最废，三张略废，四张（炸弹）反而好。越小越整 */
  function badness(hand) {
    var cnt = {};
    for (var i = 0; i < hand.length; i++) cnt[hand[i].r] = (cnt[hand[i].r] || 0) + 1;
    var b = 0;
    for (var r in cnt) {
      var n = cnt[r];
      if (n === 1) b += 2;
      else if (n === 3) b += 1;
      else if (n === 4) b -= 1;
    }
    return b;
  }

  function leadScore(cb, hand, level) {    var s = 0;
    s += cb.n * 4;
    s -= cb.key * 1.2;
    if (GD.isBomb(cb)) s -= 260;
    if (cb.cards.some(function (c) { return GD.isWild(c, level); })) s -= 28;

    var cnt = countByRank(hand), used = {};
    cb.cards.forEach(function (c) { used[c.r] = (used[c.r] || 0) + 1; });
    for (var r in used) {
      var have = cnt[r] || 0, u = used[r];
      if (have >= 4 && u < 4) s -= 70;
      else if (have >= 3 && u < 3) s -= 18;
      else if (have >= 2 && u < 2) s -= 7;
    }
    if (cb.n === hand.length) s += 1000;
    if (hand.length <= 6) s += cb.n * 2;
    return s;
  }

  /* 从候选里挑 leadScore 最高的一手 */
  function bestOf(list, hand, level) {
    var best = null, bs = -1e9;
    for (var i = 0; i < list.length; i++) {
      var sc = leadScore(list[i], hand, level);
      if (sc > bs) { bs = sc; best = list[i]; }
    }
    return best;
  }

  /* 送牌：队友只剩 1~2 张时，找一手他多半能接过去的小牌 */
  function feedPartner(leads, hand, level, partnerLeft) {
    var want = partnerLeft === 1 ? 1 : 2;
    var pool = leads.filter(function (c) {
      if (GD.isBomb(c)) return false;
      if (c.n !== want) return false;
      if (c.cards.some(function (x) { return GD.isWild(x, level); })) return false;
      return true;
    });
    if (!pool.length && want === 2) {
      // 没有对子就退一步送小单张
      pool = leads.filter(function (c) {
        return c.n === 1 && !GD.isWild(c.cards[0], level);
      });
    }
    if (!pool.length) return null;
    pool.sort(function (a, b) { return a.key - b.key; });   // 越小越容易被队友接走
    return pool[0];
  }

  /* 堵门：对手只剩 1~2 张时，尽量别出单张送他走 */
  function blockOpp(leads, hand, level) {
    var multi = leads.filter(function (c) { return c.n >= 2 && !GD.isBomb(c); });
    if (multi.length) return bestOf(multi, hand, level);
    var singles = leads.filter(function (c) { return c.n === 1; });
    if (!singles.length) return null;
    singles.sort(function (a, b) { return b.key - a.key; });  // 单张就出大的
    return singles[0];
  }

  /* diff: 0 简单 / 1 普通 / 2 困难（默认普通，不传即旧行为） */
  function aiChoose(G, seat, diff) {
    diff = (diff === 0 || diff === 2) ? diff : 1;
    var hand = G.hands[seat], level = G.level;
    var target = G.lastPlay ? G.lastPlay.combo : null;
    var partner = (seat + 2) % 4;
    var partnerLeft = G.hands[partner].length;
    var oppMin = 99;
    for (var o0 = 0; o0 < 4; o0++) {
      if (o0 !== seat && o0 !== partner && G.hands[o0].length > 0) oppMin = Math.min(oppMin, G.hands[o0].length);
    }

    if (!target) {
      var leads = GD.genAll(hand, level);
      var best = null, bestS = -1e9;
      for (var i = 0; i < leads.length; i++) {
        if (leads[i].n === hand.length) return leads[i];      // 一手走完
        var sc = leadScore(leads[i], hand, level);
        if (sc > bestS) { bestS = sc; best = leads[i]; }
      }
      // 队友比对手更接近走完 → 优先送牌
      if (diff >= 1 && partnerLeft > 0 && partnerLeft <= 2 && partnerLeft < oppMin) {
        var fd = feedPartner(leads, hand, level, partnerLeft);
        if (fd) return fd;
      }
      // 对手只剩 1~2 张 → 别送单张，改用对子/三张或大单张压住
      if (diff >= 1 && oppMin <= 2) {
        var bl = blockOpp(leads, hand, level);
        if (bl) return bl;
      }
      // 简单：偶尔不走最优（拆牌/先甩小单张），给玩家机会
      if (diff === 0 && leads.length > 3 && Math.random() < 0.35) {
        var pool = leads.filter(function (c) { return !GD.isBomb(c) && c.n < hand.length; });
        if (pool.length) return pool[(Math.random() * pool.length) | 0];
      }
      return best;
    }

    var cands = GD.genBeats(hand, level, target);
    if (!cands.length) return null;

    for (var j = 0; j < cands.length; j++) {
      if (cands[j].n === hand.length) return cands[j];
    }

    var isPartnerWinning = (G.lastPlay.seat === partner);
    if (isPartnerWinning) {
      // 简单：一律不盖对家；普通/困难：对手牌还多就放过（困难略微更敢接）
      if (diff === 0) return null;
      if (diff === 1 && oppMin > 3) return null;
      if (diff === 2 && oppMin > 5) return null;
    }

    // 简单：明明能压却有三成概率留着大牌不出
    if (diff === 0 && Math.random() < 0.3) return null;

    var nonBomb = cands.filter(function (c) { return !GD.isBomb(c); });
    if (nonBomb.length) {
      // 困难：在能压的牌里挑「出完剩下的手最整」的那一手，减少废单张
      if (diff === 2 && nonBomb.length > 1) {
        var pickC = nonBomb[0], pickV = 1e9;
        for (var k = 0; k < nonBomb.length; k++) {
          var used = {}, ids = {};
          nonBomb[k].cards.forEach(function (c) { ids[c.id] = 1; used[c.r] = (used[c.r] || 0) + 1; });
          var rest = hand.filter(function (c) { return !ids[c.id]; });
          var bad = badness(rest);
          if (bad < pickV) { pickV = bad; pickC = nonBomb[k]; }
        }
        return pickC;
      }
      return nonBomb[0];
    }

    var oppClose = false;
    for (var q = 0; q < 4; q++) {
      if (q !== seat && q !== partner && G.hands[q].length > 0 && G.hands[q].length <= 5) oppClose = true;
    }
    if (diff === 2) {
      // 困难：对手剩 8 张以内就炸，别等
      for (var w = 0; w < 4; w++) {
        if (w !== seat && w !== partner && G.hands[w].length > 0 && G.hands[w].length <= 8) oppClose = true;
      }
    }
    if (oppClose || hand.length <= 8 || isPartnerWinning) return cands[0];
    return null;
  }

  /* 托管 / 超时兜底：能出就出最小一手，否则过 */
  function aiFallback(G, seat) {
    var hand = G.hands[seat], level = G.level;
    if (G.lastPlay) {
      var beats = GD.genBeats(hand, level, G.lastPlay.combo);
      if (beats.length) {
        var nb = beats.filter(function (c) { return !GD.isBomb(c); });
        return (nb.length ? nb : beats)[0];
      }
      return null;
    }
    var all = GD.genAll(hand, level);
    for (var i = 0; i < all.length; i++) if (all[i].n === hand.length) return all[i];
    all.sort(function (a, b) {
      var ab = GD.isBomb(a), bb = GD.isBomb(b);
      if (ab !== bb) return ab ? 1 : -1;
      if (a.n !== b.n) return a.n - b.n;
      return a.key - b.key;
    });
    return all[0] || null;
  }

  var api = {
    Game: Game, aiChoose: aiChoose, aiFallback: aiFallback,
    SEAT_SHORT: SEAT_SHORT, teamOf: teamOf, cardName: cardName, rankName: rankName
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { global.GDLogic = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
