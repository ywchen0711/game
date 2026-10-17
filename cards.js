// 球員卡：固定的卡池（每位玩家抽到的是同一批球員，所以會重複、可以升星）、稀有度、抽卡包、等級與成長。
// 不碰畫面；club.js 用它組隊、抽卡、養成。
(function (root) {
'use strict';
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---------------- 稀有度 ----------------
const RARITY = {
  N:   { name: 'N',   color: '#9aa2bd', glow: '#cfd5e8', ovr: [38, 50], cap: 30, sell: 30 },
  R:   { name: 'R',   color: '#4cd07a', glow: '#a8f5c0', ovr: [48, 60], cap: 40, sell: 80 },
  SR:  { name: 'SR',  color: '#4a9aff', glow: '#a8d0ff', ovr: [58, 70], cap: 50, sell: 200 },
  SSR: { name: 'SSR', color: '#c06aff', glow: '#e4c0ff', ovr: [68, 80], cap: 60, sell: 600 },
  UR:  { name: 'UR',  color: '#ffc83a', glow: '#fff0a0', ovr: [80, 90], cap: 70, sell: 2000 },
};
const ORDER = ['N', 'R', 'SR', 'SSR', 'UR'];
const HIT = ['contact', 'power', 'eye', 'speed', 'defense', 'arm'], PIT = ['fastball', 'breaking', 'control', 'stamina'];
const ADJ = {
  C: { defense: 8, arm: 10, speed: -14 }, '1B': { power: 9, defense: -6, speed: -8, contact: 2 }, '2B': { defense: 6, speed: 6, power: -6, contact: 3 },
  SS: { defense: 12, speed: 7, arm: 8, power: -7 }, '3B': { arm: 9, power: 4, defense: 3 }, LF: { power: 5, defense: -5 },
  CF: { speed: 13, defense: 9, arm: 2, power: -2 }, RF: { arm: 12, power: 5 },
};
const BREAKING = ['滑球', '曲球', '變速球', '指叉球', '卡特球', '伸卡球', '橫掃球'];
const SUR = '陳林黃張李王吳劉蔡楊許鄭謝郭洪曾邱廖賴周徐蘇葉莊呂江何蕭羅高潘簡朱鍾彭游詹胡施沈余趙盧梁顏柯孫魏翁戴范宋方鄧杜傅侯曹薛丁卓阮馬董唐藍蔣石古紀姚連馮程湯田康姜白汪鄒尤巫黎涂龔嚴韓袁金陸夏柳邵錢倪溫譚駱熊任秦顧毛';
const G1 = '志俊建家冠宗承柏彥睿子泓品宇哲嘉文信政明國偉智勝耀聖振博凱祐育廷浩翔安仁祥立昱晉維崇峻銘鴻正啟';
const G2 = '明傑宏豪宇翰恩廷哲瑋偉彬勳龍輝雄霖凱翔誠均軒鈞源達賢毅鋒威平安昌德民倫揚瑞弘竣';

// ---------------- 卡池（固定種子生成，所有玩家相同） ----------------
// 傳說卡：陳家四位明星 + 八位傳說球員
const CHEN = [
  { name: 'Josh Chen', pos: 'CF', bats: 'L', throws: 'L', r: { contact: 94, power: 90, eye: 92, speed: 97, defense: 95, arm: 90 } },
  { name: 'Jasper Chen', pos: 'SS', bats: 'R', throws: 'R', r: { contact: 96, power: 86, eye: 95, speed: 92, defense: 97, arm: 93 } },
  { name: 'Jeff Chen', pos: 'SP', bats: 'R', throws: 'R', r: { fastball: 97, breaking: 95, control: 94, stamina: 96 } },
  { name: 'Erin Lai', pos: 'CL', bats: 'R', throws: 'L', r: { fastball: 98, breaking: 97, control: 95, stamina: 70 } },
];
const SLOTS_H = ['C', 'C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF'];
const SLOTS_P = ['SP', 'SP', 'SP', 'RP', 'RP', 'RP', 'CL', 'SP', 'RP', 'RP'];
const COUNT = { N: 80, R: 60, SR: 40, SSR: 24, UR: 12 };
function buildPool() {
  const R = rng(20261017), pick = (s) => s[Math.floor(R() * s.length)];
  const gauss = () => { let u = 0, v = 0; while (!u) u = R(); while (!v) v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const used = new Set(), name = () => { let n; do n = pick(SUR) + pick(G1) + pick(G2); while (used.has(n)); used.add(n); return n; };
  const pool = []; let cid = 1;
  for (const rar of ORDER) {
    const [lo, hi] = RARITY[rar].ovr;
    for (let i = 0; i < COUNT[rar]; i++) {
      if (rar === 'UR' && i < CHEN.length) { const c = CHEN[i]; pool.push(finish({ cid: cid++, rarity: rar, ...c, legend: true }, R)); continue; }
      const pitcher = R() < 0.42, pos = pitcher ? SLOTS_P[i % SLOTS_P.length] : SLOTS_H[i % SLOTS_H.length], ovr = lo + R() * (hi - lo), r = {};
      if (pitcher) { for (const k of PIT) r[k] = ovr + gauss() * 6; r.stamina = pos === 'SP' ? ovr + 10 + gauss() * 5 : ovr - 18 + gauss() * 6; if (pos === 'CL') { r.fastball += 4; r.breaking += 3; } }
      else { for (const k of HIT) r[k] = ovr + gauss() * 8; for (const [k, v] of Object.entries(ADJ[pos] || {})) r[k] += v * 0.6; }
      pool.push(finish({ cid: cid++, rarity: rar, name: name(), pos, bats: R() < 0.32 ? 'L' : 'R', throws: R() < 0.27 ? 'L' : 'R', r, legend: rar === 'UR' }, R));
    }
  }
  return pool;
  function finish(c, R) {
    for (const k in c.r) c.r[k] = Math.round(clamp(c.r[k], 15, 99));
    c.role = c.pos === 'SP' || c.pos === 'RP' || c.pos === 'CL' ? c.pos : 'H';
    if (c.role !== 'H') {
      c.pitches = []; const p = BREAKING.slice(); const n = 2 + (R() < 0.4 ? 1 : 0);
      while (c.pitches.length < n) c.pitches.push(p.splice(Math.floor(R() * p.length), 1)[0]);
      c.velo = Math.round(138 + c.r.fastball * 0.21);
      // pitchers bat poorly and field average
      Object.assign(c.r, { contact: 15 + Math.round(R() * 15), power: 12 + Math.round(R() * 15), eye: 15 + Math.round(R() * 12), speed: 35 + Math.round(R() * 20), defense: 45 + Math.round(R() * 20), arm: 55 + Math.round(R() * 20) });
    } else Object.assign(c.r, { fastball: 10 + Math.round(R() * 15), breaking: 10 + Math.round(R() * 15), control: 10 + Math.round(R() * 15), stamina: 10 + Math.round(R() * 10) });
    c.look = Math.floor(R() * 1e6);
    return c;
  }
}
const POOL = buildPool(), BY_CID = Object.fromEntries(POOL.map(c => [c.cid, c]));

// ---------------- 抽卡包 ----------------
const PACKS = {
  std:     { name: '標準球員包', desc: '5 張球員卡', cost: 500, n: 5, odds: { N: 58, R: 29, SR: 9.5, SSR: 3, UR: 0.5 } },
  premium: { name: '高級球員包', desc: '5 張，保證至少 1 張 SR 以上', cost: 1500, n: 5, odds: { N: 0, R: 54, SR: 32, SSR: 12, UR: 2 }, guarantee: 'SR' },
  pitch:   { name: '投手專門包', desc: '5 張投手卡', cost: 900, n: 5, odds: { N: 40, R: 36, SR: 17, SSR: 6, UR: 1 }, filter: (c) => c.role !== 'H' },
  bat:     { name: '野手專門包', desc: '5 張野手卡', cost: 900, n: 5, odds: { N: 40, R: 36, SR: 17, SSR: 6, UR: 1 }, filter: (c) => c.role === 'H' },
};
const PITY = 30;            // every 30 packs without an SSR+, the next card is SSR or better
function rollRarity(odds, R) {
  let x = R() * 100;
  for (const r of ORDER) { x -= odds[r] || 0; if (x < 0) return r; }
  return 'N';
}
// returns card templates; save.pity counts packs since the last SSR+
function openPack(kind, save, R = Math.random) {
  const pk = PACKS[kind], out = [];
  for (let i = 0; i < pk.n; i++) {
    let rar = rollRarity(pk.odds, R);
    if (i === pk.n - 1) {
      if (pk.guarantee && !out.some(c => ORDER.indexOf(c.rarity) >= ORDER.indexOf(pk.guarantee)) && ORDER.indexOf(rar) < ORDER.indexOf(pk.guarantee)) rar = pk.guarantee;
      if ((save.pity || 0) + 1 >= PITY && !out.some(c => ORDER.indexOf(c.rarity) >= 3) && ORDER.indexOf(rar) < 3) rar = R() < 0.85 ? 'SSR' : 'UR';
    }
    const list = POOL.filter(c => c.rarity === rar && (!pk.filter || pk.filter(c)));
    out.push(list[Math.floor(R() * list.length)]);
  }
  save.pity = out.some(c => ORDER.indexOf(c.rarity) >= 3) ? 0 : (save.pity || 0) + 1;
  return out;
}

// ---------------- 養成：等級、星數、能力 ----------------
const xpNeed = lv => 100 + lv * 25;
const STAR_MAX = 5;
function stats(inst) {
  const c = BY_CID[inst.cid], cap = RARITY[c.rarity].cap, grow = 12 / (cap - 1), out = {};
  const keys = c.role === 'H' ? HIT : PIT;
  for (const k in c.r) out[k] = c.r[k];
  for (const k of keys) out[k] = Math.round(clamp(c.r[k] + (inst.lv - 1) * grow + (inst.stars - 1) * 2, 1, 99));
  return out;
}
function ovr(inst) {
  const c = BY_CID[inst.cid], r = stats(inst);
  if (c.role === 'H') return Math.round(r.contact * 0.24 + r.power * 0.22 + r.eye * 0.14 + r.speed * 0.12 + r.defense * 0.16 + r.arm * 0.12);
  return Math.round(c.role === 'SP' ? r.fastball * 0.3 + r.breaking * 0.3 + r.control * 0.25 + r.stamina * 0.15 : r.fastball * 0.36 + r.breaking * 0.34 + r.control * 0.3);
}
// add experience; returns the number of level-ups
function gainXp(inst, n) {
  const cap = RARITY[BY_CID[inst.cid].rarity].cap; let ups = 0;
  if (inst.lv >= cap) return 0;
  inst.xp += Math.round(n);
  while (inst.lv < cap && inst.xp >= xpNeed(inst.lv)) { inst.xp -= xpNeed(inst.lv); inst.lv++; ups++; }
  if (inst.lv >= cap) inst.xp = 0;
  return ups;
}
// a card from a pack: a new player, a star-up, or experience if already maxed
function addCard(save, card) {
  const have = save.cards.find(i => i.cid === card.cid);
  if (!have) { const inst = { uid: save.nextUid++, cid: card.cid, lv: 1, xp: 0, stars: 1, s: null, num: null }; save.cards.push(inst); save.dex[card.cid] = 1; return { kind: 'new', inst }; }
  if (have.stars < STAR_MAX) { have.stars++; return { kind: 'star', inst: have }; }
  const ups = gainXp(have, 600); return { kind: 'xp', inst: have, ups };
}
const isPitcher = (inst) => BY_CID[inst.cid].role !== 'H';

root.CARDS = { RARITY, ORDER, POOL, BY_CID, PACKS, PITY, openPack, stats, ovr, gainXp, xpNeed, addCard, STAR_MAX, HIT, PIT, isPitcher, rng };
})(typeof window !== 'undefined' ? window : globalThis);
