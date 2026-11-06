/* AI 配合度测试：送队友 / 堵对手 */
const LG = require('../game/logic.js');
const GD = require('../game/engine.js');
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
const C = (r, s, id) => ({ r: r, s: s, id: id });

function newG(hands) {
  const G = new LG.Game({ levels: [2, 2] });
  G.phase = 'play'; G.lastPlay = null; G.finished = []; G.passed = {};
  G.hands = hands;
  return G;
}

console.log('[1] 队友只剩 1 张，队友先出 → 送小单张');
{
  const G = newG([
    [C(13, 0, 90)],                                   // 我：1 张 K
    [C(3, 1, 1), C(4, 1, 2), C(6, 1, 3), C(8, 1, 4), C(10, 1, 5)], // 下家
    [C(3, 2, 10), C(5, 3, 11), C(5, 0, 12), C(9, 0, 13), C(11, 3, 14)], // 队友
    [C(4, 2, 20), C(7, 1, 21), C(9, 2, 22)]           // 上家
  ]);
  G.turn = 2;
  const cb = LG.aiChoose(G, 2, 1);
  ok('队友出单张', cb && cb.type === 'single', cb && cb.type);
  ok('出的是最小的单张(3)', cb && cb.key === 3, cb && cb.key);
}

console.log('[2] 对手只剩 1 张，我先出 → 不出单张');
{
  const G = newG([
    [C(13, 0, 90)],                                   // 对手：1 张
    [C(3, 1, 1), C(4, 1, 2), C(6, 1, 3)],             // 队友
    [C(3, 2, 10), C(5, 3, 11), C(5, 0, 12), C(9, 0, 13)],
    [C(3, 0, 20), C(6, 2, 21), C(6, 3, 22), C(8, 3, 23), C(11, 1, 24)]  // 我（上家）
  ]);
  G.turn = 3;
  const cb = LG.aiChoose(G, 3, 1);
  ok('出的是多张牌型', cb && cb.n >= 2, cb && (cb.type + '/' + cb.n));
}

console.log('[3] 对家（队友）压着牌 → 我不抢');
{
  const G = newG([
    [C(3, 0, 1), C(4, 0, 2), C(9, 0, 3), C(9, 1, 4)], // 我
    [C(5, 1, 10), C(6, 1, 11)],                        // 下家
    [C(8, 2, 20), C(9, 2, 21), C(9, 3, 22)],           // 队友（刚出了 9 一对）
    [C(6, 2, 30), C(7, 2, 31), C(10, 3, 32), C(11, 3, 33)]
  ]);
  G.lastPlay = { seat: 2, combo: GD.combo('pair', [C(8, 2, 20), C(8, 3, 23)], 8) };
  G.turn = 3;
  G.hands[2] = [C(9, 2, 21), C(9, 3, 22)];
  const cb = LG.aiChoose(G, 3, 1);   // 上家跟牌，队友（对家=2）正赢着
  ok('上家不压队友（队友牌少时不抢）', cb === null || cb === undefined, cb && cb.type);
}

console.log('[4] 队友只剩 2 张，队友先出 → 送对子');
{
  const G = newG([
    [C(13, 0, 90), C(3, 3, 91)],                       // 队友：2 张
    [C(3, 1, 1), C(4, 1, 2), C(6, 1, 3), C(8, 1, 4)],
    [C(4, 2, 10), C(4, 3, 11), C(7, 0, 12), C(10, 0, 13), C(12, 0, 14)],
    [C(5, 2, 20), C(7, 1, 21)]
  ]);
  G.turn = 2;
  const cb = LG.aiChoose(G, 2, 1);
  ok('队友出对子', cb && cb.type === 'pair', cb && cb.type);
  ok('对子是最小的 4', cb && cb.key === 4, cb && cb.key);
}

console.log('结果: ' + pass + ' 通过, ' + fail + ' 失败');
