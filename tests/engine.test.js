const GD = require('../game/engine.js');
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.log('  FAIL: ' + msg); } }
function C(r, s) { return { r, s }; }

function ev(cards, level) { return GD.evaluateSelection(cards, level); }

// 基本牌型 (级牌 = 2)
ok(ev([C(5,0)], 2).type === 'single', '单张');
ok(ev([C(5,0), C(5,2)], 2).type === 'pair', '对子');
ok(ev([C(5,0), C(5,2), C(5,3)], 2).type === 'triple', '三张');
ok(ev([C(5,0), C(5,2), C(5,3), C(9,1), C(9,0)], 2).type === 'fullhouse', '三带二');
ok(ev([C(3,0), C(4,1), C(5,2), C(6,3), C(7,0)], 2).type === 'straight', '顺子');
ok(ev([C(3,0), C(4,1), C(5,2), C(6,3), C(7,0)], 2).key === 7, '顺子 key=7');
ok(ev([C(3,0), C(3,1), C(4,0), C(4,1), C(5,0), C(5,1)], 2).type === 'tube', '三连对');
ok(ev([C(3,0), C(3,1), C(3,2), C(4,0), C(4,1), C(4,2)], 2).type === 'plate', '钢板');
ok(ev([C(5,0), C(5,1), C(5,2), C(5,3)], 2).type === 'bomb', '4炸');
ok(ev([C(5,0), C(5,1), C(5,2), C(5,3), C(5,0)], 2).type === 'bomb', '5炸');
ok(ev([C(3,0), C(4,0), C(5,0), C(6,0), C(7,0)].map((c,i)=>i===4?C(7,0):c), 2), '5张顺');

// 同花顺
let f = ev([C(3,0), C(4,0), C(5,0), C(6,0), C(7,0)], 2);
ok(f.type === 'flush', '同花顺识别, 实际=' + f.type);
// 王炸
let jb = ev([C(16,4), C(16,4), C(17,4), C(17,4)], 2);
ok(jb && jb.type === 'jokerbomb', '天王炸');
ok(ev([C(16,4), C(17,4)], 2) === null, '大小王不是对子');

// A 低顺 A2345
let low = ev([C(14,0), C(2,0), C(3,1), C(4,2), C(5,3)], 7);
ok(low && low.type === 'straight' && low.key === 5, 'A2345 顺子 key=5, 实际=' + (low && low.key));

// 比较
function cb(type, key, n, level) { return { type, key, n: n || 2 }; }
ok(GD.beats(cb('bomb', 5, 4), cb('single', 14, 1)), '4炸压单张');
ok(GD.beats(cb('flush', 7, 5), cb('bomb', 14, 5)), '同花顺压5炸');
ok(!GD.beats(cb('bomb', 14, 5), cb('flush', 7, 5)), '5炸不压同花顺');
ok(GD.beats(cb('bomb', 3, 6), cb('flush', 14, 5)), '6炸压同花顺');
ok(GD.beats(cb('jokerbomb', 100, 4), cb('bomb', 14, 8)), '天王炸最大');

// 级牌大小: 打2时, 2 > A
ok(GD.power(C(2,0), 2) === 15 && GD.power(C(14,0), 2) === 14, '级牌升到A之上');
ok(GD.power(C(2,0), 2) < GD.power(C(16,4), 2), '级牌小于小王');

// 逢人配: 打2, 红桃2 是万能牌
let wild = C(2,1);
ok(GD.isWild(wild, 2) === true, '红桃级牌是万能牌');
ok(GD.isWild(C(2,0), 2) === false, '黑桃2不是万能牌');
let wp = ev([C(9,0), wild], 2);
ok(wp && wp.type === 'pair' && wp.key === 9, '万能牌凑对子');
let ws = ev([C(3,0), C(4,1), wild, C(6,2), C(7,3)], 2);
ok(ws && ws.type === 'straight' && ws.key === 7, '万能牌补顺子缺口, 实际=' + (ws && ws.type + '/' + ws.key));
let wb = ev([C(9,0), C(9,2), C(9,3), wild], 2);
ok(wb && wb.type === 'bomb', '万能牌凑炸弹');
let wf = ev([C(3,0), C(4,0), C(5,0), C(6,0), wild], 2);
ok(wf && wf.type === 'flush', '万能牌凑同花顺, 实际=' + (wf && wf.type));

// 生成器
let hand = [C(3,0), C(3,1), C(4,0), C(4,1), C(5,0), C(5,1), C(14,0), C(14,1), C(14,2), C(14,3), C(16,4), C(17,4), C(9,0), C(9,2), C(7,0), C(7,1), C(7,2), C(7,3), C(6,0), C(8,0), C(10,0), C(11,0), C(12,0), C(13,0), C(2,0), C(2,2), C(2,3)];
let all = GD.genAll(hand, 2);
ok(all.length > 20, '生成牌型数量 ' + all.length);
let bombs = all.filter(x => GD.isBomb(x));
ok(bombs.length >= 2, '识别出炸弹 ' + bombs.length);
let beat = GD.genBeats(hand, 2, { type: 'single', key: 13, n: 1 });
ok(beat.length > 0 && beat[0].type === 'single', '能压 K 的单张数 ' + beat.length);

// 生成的每手牌必须自身合法
let bad = 0;
for (const c of all) {
  const r = GD.evaluateSelection(c.cards, 2);
  if (!r || r.type !== c.type) bad++;
}
ok(bad === 0, '生成的牌型全部可被校验回来, 失败 ' + bad + '/' + all.length);

console.log(`\n通过 ${pass}, 失败 ${fail}`);
process.exit(fail ? 1 : 0);
