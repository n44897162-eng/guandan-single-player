/* 界面回归：加载 → 进桌 → 用真实点击（提示/选牌/出牌/不出）打完一局并截图 */
const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
const VW = +(process.env.VW || 731);
const VH = +(process.env.VH || 412);
const SHOT = path.resolve(__dirname, 'shots') + path.sep;
const FAST = process.env.FAST === '1';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function tap(page, sel) {
  return page.evaluate(s => {
    const el = document.querySelector(s);
    if (!el) return false;
    el.click();
    return true;
  }, sel);
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--allow-file-access-from-files', '--disable-gpu', '--no-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: VW, height: VH, deviceScaleFactor: 2 });

  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  await page.goto(URL, { waitUntil: 'load' });
  await sleep(300);
  await page.screenshot({ path: SHOT + 'n_home.png' });

  await tap(page,'#enterGuandan');
  await sleep(400);
  if (process.env.SPEED) await page.evaluate(v => { window.__S.speed = v; }, +process.env.SPEED);

  // 进贡面板（首局一般没有）
  const hasTrib = await page.$eval('#ovTribute', el => el.classList.contains('on')).catch(() => false);
  if (hasTrib) {
    const disabled = await page.$eval('#btnTributeOk', el => el.disabled);
    if (disabled) {
      await tap(page,'#tributePick .tk');
      await sleep(200);
    } else {
      await tap(page,'#btnTributeOk');
      await sleep(200);
    }
  }

  await page.screenshot({ path: SHOT + 'n_table.png' });

  let shots = 0, turns = 0;
  for (let i = 0; i < 4000; i++) {
    await sleep(FAST ? 40 : 120);

    const st = await page.evaluate(() => {
      const S = window.__S;
      return {
        phase: S.game && S.game.phase,
        turn: S.game && S.game.turn,
        trust: S.trust,
        canPlay: !document.getElementById('btnPlay').disabled,
        canPass: !document.getElementById('btnPass').disabled,
        canHint: !document.getElementById('btnHint').disabled,
        settle: document.getElementById('ovSettle').classList.contains('on'),
        tribute: document.getElementById('ovTribute').classList.contains('on'),
        handCount: S.game ? S.game.hands[0].length : -1,
        round: S.game ? S.game.round : 0,
        ranks: S.game && S.game.finished.slice()
      };
    });

    if (st.settle) break;
    if (st.tribute) {
      const disabled = await page.$eval('#btnTributeOk', el => el.disabled);
      if (disabled) await tap(page,'#tributePick .tk');
      else await tap(page,'#btnTributeOk');
      await sleep(250);
      continue;
    }
    if (st.phase !== 'play' || st.turn !== 0) continue;

    turns++;
    if (st.canHint && st.canPlay === false) {
      await tap(page,'#btnHint');
      await sleep(140);
      const nowPlay = await page.evaluate(() => !document.getElementById('btnPlay').disabled);
      if (nowPlay) { await tap(page,'#btnPlay'); }
      else if (st.canPass) { await tap(page,'#btnPass'); }
    } else if (st.canPlay) {
      await tap(page,'#btnPlay');
    } else if (st.canPass) {
      await tap(page,'#btnPass');
    }

    if (shots < 3 && turns % 4 === 2) {
      await sleep(400);
      await page.screenshot({ path: SHOT + `n_play${++shots}.png` });
    }
  }

  await sleep(300);
  await page.screenshot({ path: SHOT + 'n_settle.png' });

  const final = await page.evaluate(() => {
    const S = window.__S;
    return {
      phase: S.game && S.game.phase,
      round: S.game && S.game.round,
      ranks: S.game && S.game.lastRanks && S.game.lastRanks.map(r => r.seat + ':' + r.pos),
      levels: S.game && S.game.teamLevel,
      result: S.game && S.game.result,
      stats: S.stats
    };
  });

  console.log('turns clicked:', turns);
  console.log('final:', JSON.stringify(final));
  console.log('errors:', errors.length ? errors : 'none');

  await browser.close();
  if (errors.length) process.exitCode = 1;
})();
