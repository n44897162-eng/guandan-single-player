/* 规则回归：接风 / 进贡还贡 / 抗贡 / 双下计分 */
const GD = require('../game/engine.js');
const LG = require('../game/logic.js');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + JSON.stringify(extra) : '')); }
}

function mk(seat, r, s) { return { r: r, s: s === undefined ? 0 : s, id: seat * 100 + r * 4 + (s || 0) }; }

console.log('\n[1] 接风：出完牌其余都不要，搭档接风');
{
  const evs = [];
  const g = new LG.Game({ levels: [2, 2], onEvent: e => evs.push(e) });
  g.hands = [[mk(0, 3)], [mk(1, 4)], [mk(2, 5)], [mk(3, 6)]];
  g.phase = 'play'; g.turn = 0; g.lastPlay = null; g.passed = {}; g.finished = []; g.level = 2;
  g.play(0, GD.combo('single', [g.hands[0][0]], 3));
  ok('0 出完后轮到 1', g.turn === 1, g.turn);
  g.pass(1); g.pass(2); g.pass(3);
  ok('三家都不要 → 对家(2) 接风', g.turn === 2, g.turn);
  ok('抛出 jiefeng 事件', evs.some(e => e.type === 'jiefeng' && e.seat === 2));
  ok('新一轮 lastPlay 清空', g.lastPlay === null);
}

console.log('\n[2] 进贡：除红桃级牌外最大的一张，玩家还贡不大于 10');
{
  const g = new LG.Game({ levels: [2, 2], onEvent: () => { } });
  g.level = 2;
  g.lastRanks = [{ seat: 0, pos: 1 }, { seat: 2, pos: 2 }, { seat: 1, pos: 3 }, { seat: 3, pos: 4 }];
  // 末游(3) 手里：红桃2(级牌/逢人配)、A♠、9♦ → 应进 A♠
  g.hands = [
    [mk(0, 3, 0), mk(0, 5, 1)],
    [mk(1, 7, 0)],
    [mk(2, 8, 0)],
    [mk(3, 2, 1), mk(3, 14, 0), mk(3, 9, 3)]
  ];
  const t = g.buildTribute();
  ok('不抗贡', !t.resist);
  ok('进贡最大牌 A♠', t.pairs[0].gift && t.pairs[0].gift.r === 14 && t.pairs[0].gift.s === 0, t.pairs[0].gift);
  ok('玩家是还贡方，等待选牌', t.wait.length === 1 && t.wait[0].to === 0);
  ok('A♠ 已进到我手', g.hands[0].some(c => c.r === 14 && c.s === 0));
  const opts = g.returnOptions(0).map(c => c.r + '_' + c.s);
  ok('还贡候选只含 ≤10 且非逢人配', opts.every(x => +x.split('_')[0] <= 10), opts);
  const pick = g.returnOptions(0).find(c => c.r === 5);
  ok('pickReturn 成功', g.pickReturn(pick.id));
  ok('还贡后进入出牌阶段', g.phase === 'play');
  ok('还贡牌已给末游', g.hands[3].some(c => c.r === 5));
  ok('头游先出', g.turn === 0, g.turn);
}

console.log('\n[3] 抗贡：进贡方两张大王');
{
  const g = new LG.Game({ levels: [2, 2], onEvent: () => { } });
  g.level = 2;
  g.lastRanks = [{ seat: 0, pos: 1 }, { seat: 2, pos: 2 }, { seat: 1, pos: 3 }, { seat: 3, pos: 4 }];
  g.hands = [[mk(0, 3)], [mk(1, 4)], [mk(2, 5)], [{ r: 17, s: 4, id: 901 }, { r: 17, s: 4, id: 902 }, mk(3, 6)]];
  const t = g.buildTribute();
  ok('双大王 → 抗贡', t.resist === true);
  ok('抗贡不进贡', t.pairs[0].gift === undefined);
}

console.log('\n[4] 双下计分与升级');
{
  const g = new LG.Game({ levels: [2, 2], onEvent: () => { } });
  g.teamLevel = [2, 2]; g.totalScore = 0; g.level = 2;
  g.finished = [0, 2, 1];
  g.settle();
  ok('我方 2 → 5（升 3 级）', g.teamLevel[0] === 5, g.teamLevel);
  ok('双下标记', g.result.doubleUp === true);
  ok('积分 = 3*100+100', g.result.score === 400, g.result.score);
  ok('累计积分', g.totalScore === 400, g.totalScore);
  ok('对手名次 3/4', g.result.ranks[2].seat === 1 && g.result.ranks[3].seat === 3);
}

console.log('\n[5] AI 兜底：能出就出，管不上就过');
{
  const g = new LG.Game({ levels: [2, 2], onEvent: () => { } });
  g.hands = [[mk(0, 3)], [mk(1, 4)], [mk(2, 5)], [mk(3, 6)]];
  g.phase = 'play'; g.turn = 1; g.level = 2; g.finished = []; g.passed = {};
  g.lastPlay = { seat: 0, combo: GD.combo('single', [mk(0, 14)], 14) };
  g.hands[1] = [mk(1, 4)];
  ok('4 管不上 A → 返回 null', LG.aiFallback(g, 1) === null);
  g.lastPlay = { seat: 0, combo: GD.combo('single', [mk(0, 3)], 3) };
  ok('有能管的牌 → 出 4', (LG.aiFallback(g, 1) || {}).key === 4);
  g.hands[1] = [mk(1, 3), mk(1, 3, 1), mk(1, 4), mk(1, 5)];
  g.lastPlay = null;
  const lead = LG.aiFallback(g, 1);
  ok('先手能出牌型', !!lead && lead.cards.length > 0);
}

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
