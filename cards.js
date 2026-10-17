// 球員卡：固定的卡池（每位玩家抽到的是同一批球員，所以會重複、可以升星）、稀有度、抽卡包、等級與成長。
// 不碰畫面；club.js 用它組隊、抽卡、養成。
(function (root) {
'use strict';
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---------------- 稀有度 ----------------
const RARITY = {
  N:   { name: 'N',   color: '#9aa2bd', glow: '#cfd5e8', ovr: [38, 50], cap: 500, sell: 30 },
  R:   { name: 'R',   color: '#4cd07a', glow: '#a8f5c0', ovr: [48, 60], cap: 500, sell: 80 },
  SR:  { name: 'SR',  color: '#4a9aff', glow: '#a8d0ff', ovr: [58, 70], cap: 500, sell: 200 },
  SSR: { name: 'SSR', color: '#c06aff', glow: '#e4c0ff', ovr: [68, 80], cap: 500, sell: 600 },
  UR:  { name: 'UR',  color: '#ffc83a', glow: '#fff0a0', ovr: [80, 88], cap: 500, sell: 2000 },
  LR:  { name: 'LR',  color: '#ff5a4a', glow: '#ffc0a8', ovr: [87, 93], cap: 500, sell: 5000 },
  EX:  { name: 'EX',  color: '#ff6ad5', glow: '#ffd0f4', ovr: [95, 99], cap: 500, sell: 20000, hidden: true },   // 隱藏超級球員
};
const ORDER = ['N', 'R', 'SR', 'SSR', 'UR', 'LR', 'EX'];
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
// 隱藏超級球員（EX）：陳家四位明星，只有極低機率抽到，或在傳奇聯盟奪冠時獲得
const CHEN = [
  { name: 'Josh Chen', pos: 'CF', bats: 'L', throws: 'L', r: { contact: 97, power: 94, eye: 95, speed: 99, defense: 98, arm: 94 } },
  { name: 'Jasper Chen', pos: 'SS', bats: 'R', throws: 'R', r: { contact: 99, power: 90, eye: 98, speed: 95, defense: 99, arm: 96 } },
  { name: 'Jeff Chen', pos: 'SP', bats: 'R', throws: 'R', r: { fastball: 99, breaking: 97, control: 97, stamina: 99 } },
  { name: 'Erin Lai', pos: 'CL', bats: 'R', throws: 'L', female: true, r: { fastball: 99, breaking: 99, control: 98, stamina: 78 } },
];
const SLOTS_H = ['C', 'C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF'];
const SLOTS_P = ['SP', 'SP', 'SP', 'RP', 'RP', 'RP', 'CL', 'SP', 'RP', 'RP'];
const COUNT = { N: 80, R: 60, SR: 40, SSR: 24, UR: 12, LR: 8, EX: 4 };              // the first 228 cards (ids 1-228 never change)
const MORE = { N: 280, R: 210, SR: 140, SSR: 86, UR: 38, LR: 18 };                   // 772 more from a second seed: 1000 players in all
function buildPool() {
  const used = new Set(), pool = []; let cid = 1;
  const batch = (seed, counts) => {
    const R = rng(seed), pick = (s) => s[Math.floor(R() * s.length)];
    const gauss = () => { let u = 0, v = 0; while (!u) u = R(); while (!v) v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const name = () => { let n; do n = pick(SUR) + pick(G1) + pick(G2); while (used.has(n)); used.add(n); return n; };
    for (const rar of ORDER) {
      const [lo, hi] = RARITY[rar].ovr;
      for (let i = 0; i < (counts[rar] || 0); i++) {
        if (rar === 'EX') { const c = CHEN[i]; pool.push(finish({ cid: cid++, rarity: rar, ...c, legend: true, hidden: true }, R)); continue; }
        const pitcher = R() < 0.42, pos = pitcher ? SLOTS_P[i % SLOTS_P.length] : SLOTS_H[i % SLOTS_H.length], ovr = lo + R() * (hi - lo), r = {};
        if (pitcher) { for (const k of PIT) r[k] = ovr + gauss() * 6; r.stamina = pos === 'SP' ? ovr + 10 + gauss() * 5 : ovr - 18 + gauss() * 6; if (pos === 'CL') { r.fastball += 4; r.breaking += 3; } }
        else { for (const k of HIT) r[k] = ovr + gauss() * 8; for (const [k, v] of Object.entries(ADJ[pos] || {})) r[k] += v * 0.6; }
        pool.push(finish({ cid: cid++, rarity: rar, name: name(), pos, bats: R() < 0.32 ? 'L' : 'R', throws: R() < 0.27 ? 'L' : 'R', r, legend: rar === 'UR' || rar === 'LR' }, R));
      }
    }
  };
  batch(20261017, COUNT); batch(20261099, MORE);
  for (const c of pool) addTraits(c);
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
// ---------------- 球員特色：每張卡固定的個性（跑得快、很會守、能守很多位置⋯⋯） ----------------
const TRAITS = {
  speed:  { name: '飛毛腿', icon: '🏃', who: 'H', fx: { speed: 12 } },
  glove:  { name: '守備職人', icon: '🧤', who: 'H', fx: { defense: 12 } },
  util:   { name: '萬能工具人', icon: '🔄', who: 'H', fx: {}, desc: '能守多個位置，不算非本職' },
  cannon: { name: '雷射肩', icon: '🎯', who: 'H', fx: { arm: 12 } },
  slug:   { name: '重砲手', icon: '💥', who: 'H', fx: { power: 10 } },
  hitter: { name: '安打王', icon: '🏏', who: 'H', fx: { contact: 10 } },
  eye:    { name: '選球專家', icon: '👁', who: 'H', fx: { eye: 12 } },
  flame:  { name: '火球男', icon: '🔥', who: 'P', fx: { fastball: 9 } },
  magic:  { name: '變化球大師', icon: '🌀', who: 'P', fx: { breaking: 9 }, desc: '多一種變化球' },
  sniper: { name: '精準控球', icon: '📐', who: 'P', fx: { control: 10 } },
  iron:   { name: '鐵臂', icon: '🦾', who: 'P', fx: { stamina: 14 } },
  ace:    { name: '三振機器', icon: '⚡', who: 'P', fx: { fastball: 5, breaking: 5 } },
};
const ST_CN = { contact: '打擊', power: '力量', eye: '選球', speed: '速度', defense: '守備', arm: '臂力', fastball: '速球', breaking: '變化球', control: '控球', stamina: '體力' };
const traitDesc = (k) => TRAITS[k].desc || Object.entries(TRAITS[k].fx).map(([s, v]) => `${ST_CN[s]} +${v}`).join('、');
const ALT = { C: ['1B'], '1B': ['3B', 'LF', 'RF'], '2B': ['SS', '3B', '1B'], SS: ['2B', '3B'], '3B': ['1B', 'SS', '2B'], LF: ['RF', 'CF', '1B'], CF: ['LF', 'RF'], RF: ['LF', 'CF', '1B'] };
const T_ODDS = { N: [0.4, 0], R: [0.55, 0.05], SR: [0.7, 0.15], SSR: [0.85, 0.3], UR: [1, 0.5], LR: [1, 0.7] };
const CHEN_T = { 'Josh Chen': ['speed', 'glove'], 'Jasper Chen': ['util', 'glove'], 'Jeff Chen': ['flame', 'iron'], 'Erin Lai': ['flame', 'magic'] };
function addTraits(c) {
  const R = rng(c.cid * 7919 + 13), who = c.role === 'H' ? 'H' : 'P';
  let ts = CHEN_T[c.name];
  if (!ts) {
    const [p1, p2] = T_ODDS[c.rarity], keys = Object.keys(TRAITS).filter((k) => TRAITS[k].who === who && !(k === 'iron' && c.pos !== 'SP'));
    ts = [];
    if (R() < p1) { ts.push(keys.splice(Math.floor(R() * keys.length), 1)[0]); if (R() < p2) ts.push(keys.splice(Math.floor(R() * keys.length), 1)[0]); }
  }
  c.traits = ts;
  for (const t of ts) for (const [k, v] of Object.entries(TRAITS[t].fx)) c.r[k] = Math.min(99, c.r[k] + v);
  if (ts.includes('util')) { const a = ALT[c.pos].slice().sort(() => R() - 0.5); c.alt = a.slice(0, Math.max(2, a.length - (R() < 0.5 ? 1 : 0))); if (c.pos === 'C') c.alt = ['1B', '3B']; }
  if (ts.includes('magic')) { const left = BREAKING.filter((b) => !c.pitches.includes(b)); c.pitches.push(left[Math.floor(R() * left.length)]); }
  if (c.role !== 'H') c.velo = Math.round(138 + c.r.fastball * 0.21);
}
const canPlay = (c, pos) => pos === 'DH' || c.pos === pos || (c.alt || []).includes(pos);
const POOL = buildPool(), BY_CID = Object.fromEntries(POOL.map(c => [c.cid, c]));

// ---------------- 抽卡包 ----------------
const PACKS = {
  std:     { name: '標準球員包', desc: '5 張球員卡', cost: 500, n: 5, odds: { N: 57.82, R: 29, SR: 9.5, SSR: 3, UR: 0.5, LR: 0.15, EX: 0.03 } },
  premium: { name: '高級球員包', desc: '5 張，保證至少 1 張 SR 以上', cost: 1500, n: 5, odds: { N: 0, R: 53.32, SR: 32, SSR: 12, UR: 2, LR: 0.6, EX: 0.08 }, guarantee: 'SR' },
  pitch:   { name: '投手專門包', desc: '5 張投手卡', cost: 900, n: 5, odds: { N: 39.66, R: 36, SR: 17, SSR: 6, UR: 1, LR: 0.3, EX: 0.04 }, filter: (c) => c.role !== 'H' },
  star:    { name: '明星球員包', desc: '盃賽獎品：5 張，保證至少 1 張 SSR 以上', reward: true, n: 5, odds: { SR: 55, SSR: 33, UR: 9, LR: 2.7, EX: 0.3 }, guarantee: 'SSR' },
  legend:  { name: '傳說球員包', desc: '盃賽獎品：5 張，保證至少 1 張 UR 以上', reward: true, n: 5, odds: { SSR: 60, UR: 30, LR: 9, EX: 1 }, guarantee: 'UR' },
  bat:     { name: '野手專門包', desc: '5 張野手卡', cost: 900, n: 5, odds: { N: 39.66, R: 36, SR: 17, SSR: 6, UR: 1, LR: 0.3, EX: 0.04 }, filter: (c) => c.role === 'H' },
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
// 等級上限 500，越往上越難升；每升一級全能力 +0.08（500 級時約 +40），每 100 級可以免費重骰一次技能
const LV_MAX = 500, GROW = 0.08, STAT_MAX = 140;
const xpNeed = lv => 150 + lv * 2;
const rerolls = (inst) => Math.floor(inst.lv / 100) - (inst.rru || 0);
const STAR_MAX = 5;
function stats(inst, bonus) {
  const c = BY_CID[inst.cid], out = {};
  const keys = c.role === 'H' ? HIT : PIT;
  for (const k in c.r) out[k] = c.r[k];
  for (const k of keys) out[k] = Math.round(clamp(c.r[k] + (inst.lv - 1) * GROW + (inst.stars - 1) * 2 + ((bonus && bonus[k]) || 0), 1, STAT_MAX));
  return out;
}
function ovr(inst, bonus) {
  const c = BY_CID[inst.cid], r = stats(inst, bonus);
  if (c.role === 'H') return Math.round(r.contact * 0.24 + r.power * 0.22 + r.eye * 0.14 + r.speed * 0.12 + r.defense * 0.16 + r.arm * 0.12);
  return Math.round(c.role === 'SP' ? r.fastball * 0.3 + r.breaking * 0.3 + r.control * 0.25 + r.stamina * 0.15 : r.fastball * 0.36 + r.breaking * 0.34 + r.control * 0.3);
}
// add experience; returns the number of level-ups
function gainXp(inst, n) {
  const cap = LV_MAX; let ups = 0;
  if (inst.lv >= cap) return 0;
  inst.xp += Math.round(n);
  while (inst.lv < cap && inst.xp >= xpNeed(inst.lv)) { inst.xp -= xpNeed(inst.lv); inst.lv++; ups++; }
  if (inst.lv >= cap) inst.xp = 0;
  return ups;
}
// a card from a pack: a new player, a star-up, or experience if already maxed
function addCard(save, card) {
  const have = save.cards.find(i => i.cid === card.cid);
  if (!have) { const inst = { uid: save.nextUid++, cid: card.cid, lv: 1, xp: 0, stars: 1, s: null, num: null, sk: SKILLS.rollSet(card) }; save.cards.push(inst); save.dex[card.cid] = 1; return { kind: 'new', inst }; }
  if (have.stars < STAR_MAX) {
    have.stars++;
    let learned = null;                       // 3★ and 5★ each teach one more random skill
    if (have.stars === 3 || have.stars === 5) { learned = SKILLS.rollOne(card, have.sk || []); if (learned) (have.sk = have.sk || []).push(learned); }
    return { kind: 'star', inst: have, learned };
  }
  const ups = gainXp(have, 600); return { kind: 'xp', inst: have, ups };
}
const isPitcher = (inst) => BY_CID[inst.cid].role !== 'H';
// older saves: cards from before skills existed get theirs now (plus the star-up skills they'd have learned)
function ensureSkills(save) {
  for (const i of save.cards) if (!i.sk) { const c = BY_CID[i.cid]; i.sk = SKILLS.rollSet(c); for (const s of [3, 5]) if (i.stars >= s) { const id = SKILLS.rollOne(c, i.sk); if (id) i.sk.push(id); } }
}

root.CARDS = { TRAITS, traitDesc, canPlay, ST_CN, RARITY, ORDER, POOL, BY_CID, PACKS, PITY, openPack, stats, ovr, gainXp, xpNeed, addCard, ensureSkills, rerolls, LV_MAX, STAR_MAX, HIT, PIT, isPitcher, rng };
})(typeof window !== 'undefined' ? window : globalThis);
