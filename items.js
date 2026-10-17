// 裝備與教練：裝備穿在單一球員身上（球棒／手套／釘鞋／飾品），教練卡放進教練團、加成全隊。
// 都從箱子裡隨機開出來（商店購買或盃賽獎品），能力數值也是隨機的。
(function (root) {
'use strict';
const RAR = ['N', 'R', 'SR', 'SSR', 'UR'];
const RCOL = { N: '#9aa2bd', R: '#4cd07a', SR: '#4a9aff', SSR: '#c06aff', UR: '#ffc83a' };
const ALLST = ['contact', 'power', 'eye', 'speed', 'defense', 'arm', 'fastball', 'breaking', 'control', 'stamina'];
const SLOT = {
  bat:   { name: '球棒', icon: '🏏', stats: ['contact', 'power', 'eye'], names: ['練習木棒', '鋁合金球棒', '楓木球棒', '職業級球棒', '傳奇金棒'] },
  glove: { name: '手套', icon: '🧤', stats: ['defense', 'arm', 'control', 'breaking'], names: ['練習手套', '牛皮手套', '職業手套', '黃金手套', '傳奇手套'] },
  shoes: { name: '釘鞋', icon: '👟', stats: ['speed', 'defense', 'stamina', 'fastball'], names: ['帆布運動鞋', '入門釘鞋', '輕量釘鞋', '職業釘鞋', '閃電釘鞋'] },
  acc:   { name: '飾品', icon: '💍', stats: ALLST, names: ['運動護腕', '幸運手環', '能量項鍊', '冠軍戒指', '傳說護身符'] },
};
const VAL = { N: [1, 2], R: [2, 3], SR: [3, 5], SSR: [5, 7], UR: [7, 10] };
const NSTAT = { N: 1, R: 1, SR: 2, SSR: 2, UR: 3 };
const SELL_G = { N: 20, R: 50, SR: 150, SSR: 400, UR: 1200 }, SELL_C = { N: 50, R: 120, SR: 350, SSR: 900, UR: 2500 };
const BOXES = {
  gear:   { name: '裝備箱', desc: '3 件隨機裝備', cost: 800, n: 3, type: 'gear', odds: { N: 50, R: 30, SR: 14, SSR: 5, UR: 1 } },
  coach:  { name: '教練合約', desc: '簽下 1 位隨機教練', cost: 1500, n: 1, type: 'coach', odds: { N: 45, R: 32, SR: 16, SSR: 6, UR: 1 } },
  gear2:  { name: '高級裝備箱', desc: '盃賽獎品：3 件 SR 以上裝備', reward: true, n: 3, type: 'gear', odds: { SR: 70, SSR: 24, UR: 6 } },
  coach2: { name: '名教練合約', desc: '盃賽獎品：1 位 SR 以上教練', reward: true, n: 1, type: 'coach', odds: { SR: 65, SSR: 28, UR: 7 } },
};
// coaches: the head coach lifts everyone a little and speeds up growth; the others lift one area
const COACH = {
  mgr: { name: '總教練', icon: '🧢' }, hit: { name: '打擊教練', icon: '🏏' }, pit: { name: '投手教練', icon: '⚾' },
  def: { name: '守備教練', icon: '🧤' }, run: { name: '體能教練', icon: '🏃' },
};
const CV = { N: 1, R: 2, SR: 3, SSR: 4, UR: 6 };
const ST_CN = { contact: '打擊', power: '力量', eye: '選球', speed: '速度', defense: '守備', arm: '臂力', fastball: '速球', breaking: '變化球', control: '控球', stamina: '體力' };
const SUR = '陳林黃張李王吳劉蔡楊許鄭謝郭洪曾邱廖賴周徐蘇葉莊呂江何蕭羅高潘簡朱鍾彭游詹胡施沈余趙盧梁顏柯孫魏翁戴范宋方鄧杜傅侯曹', G1 = '志俊建家冠宗承柏彥子品宇哲嘉文信政明國偉智勝耀振博凱育廷浩翔安仁', G2 = '明傑宏豪宇翰恩廷哲瑋偉彬勳龍輝雄霖凱誠均軒源達賢毅';
const pick = (a, R) => a[Math.floor(R() * a.length)];
function rollRar(odds, R) { let x = R() * Object.values(odds).reduce((a, b) => a + b, 0); for (const r of RAR) { x -= odds[r] || 0; if (x < 0) return r; } return 'N'; }
function makeGear(rar, R = Math.random) {
  const slot = pick(Object.keys(SLOT), R), S = SLOT[slot], pool = S.stats.slice(), fx = {}, [lo, hi] = VAL[rar];
  for (let i = 0; i < NSTAT[rar] && pool.length; i++) fx[pool.splice(Math.floor(R() * pool.length), 1)[0]] = lo + Math.floor(R() * (hi - lo + 1));
  return { slot, rar, name: S.names[RAR.indexOf(rar)], fx };
}
function makeCoach(rar, R = Math.random) {
  return { kind: pick(Object.keys(COACH), R), rar, name: pick(SUR, R) + pick(G1, R) + pick(G2, R), look: Math.floor(R() * 1e6) };
}
function openBox(k, R = Math.random) {
  const b = BOXES[k], out = [];
  for (let i = 0; i < b.n; i++) { const rar = rollRar(b.odds, R); out.push(b.type === 'gear' ? makeGear(rar, R) : makeCoach(rar, R)); }
  return out;
}
const gearDesc = (g) => Object.entries(g.fx).map(([k, v]) => `${ST_CN[k]} +${v}`).join('、');
function coachFx(c) {
  const v = CV[c.rar];
  switch (c.kind) {
    case 'mgr': return { all: Math.ceil(v / 2), xp: v * 8 };
    case 'hit': return { H: { contact: v, power: v, eye: v } };
    case 'pit': return { P: { fastball: v, breaking: v, control: v } };
    case 'def': return { H: { defense: v + 1, arm: v + 1 } };
    default: return { H: { speed: v + 2 }, P: { stamina: v * 2 + 2 } };
  }
}
function coachDesc(c) {
  const f = coachFx(c);
  if (f.all) return `全隊所有能力 +${f.all}、經驗值 +${f.xp}%`;
  const part = (who, m) => m ? `${who}${Object.entries(m).map(([k, v]) => `${ST_CN[k]} +${v}`).join('、')}` : '';
  return [part('野手 ', f.H), part('投手 ', f.P)].filter(Boolean).join('；');
}
// the total bonus for one player: his own equipment plus the whole coaching staff
function bonus(role, gear, coaches) {
  const b = {}, add = (k, v) => { b[k] = (b[k] || 0) + v; };
  for (const g of gear) for (const k in g.fx) add(k, g.fx[k]);
  for (const c of coaches) { const f = coachFx(c); if (f.all) for (const k of ALLST) add(k, f.all); const m = f[role]; if (m) for (const k in m) add(k, m[k]); }
  return b;
}
const xpBonus = (coaches) => coaches.reduce((s, c) => s + (coachFx(c).xp || 0), 0) / 100;

root.ITEMS = { RAR, RCOL, SLOT, BOXES, COACH, CV, SELL_G, SELL_C, openBox, makeGear, makeCoach, gearDesc, coachDesc, coachFx, bonus, xpBonus };
})(typeof window !== 'undefined' ? window : globalThis);
