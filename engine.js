// 棒球模擬引擎：依球員能力逐球模擬，並產生給畫面播放的時間軸
// 座標單位為英呎，本壘 (0,0)，y 軸指向中外野，x 軸指向一壘側
(function (root) {
'use strict';

const R = Math.random;
function gauss() { let u = 0, v = 0; while (u === 0) u = R(); while (v === 0) v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const pick = a => a[Math.floor(R() * a.length)];
const P2 = (x, y) => ({ x, y });
const DEG = Math.PI / 180;

const BASE = [P2(0, 0), P2(63.6, 63.6), P2(0, 127.3), P2(-63.6, 63.6), P2(0, 0)];
const POS_XY = {
  P: P2(0, 60.5), C: P2(0, -6), '1B': P2(68, 84), '2B': P2(36, 144), SS: P2(-36, 144),
  '3B': P2(-66, 84), LF: P2(-152, 258), CF: P2(0, 306), RF: P2(152, 258),
};
const FIELD = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
const OF = new Set(['LF', 'CF', 'RF']);
const POS_CN = { P: '投手', C: '捕手', '1B': '一壘手', '2B': '二壘手', '3B': '三壘手', SS: '游擊手', LF: '左外野手', CF: '中外野手', RF: '右外野手', DH: '指定打擊', UT: '內野工具人', OF: '外野手', SP: '先發投手', RP: '中繼投手', CL: '終結者' };
const POS_SHORT = { P: '投', C: '捕', '1B': '一', '2B': '二', '3B': '三', SS: '游', LF: '左', CF: '中', RF: '右', DH: 'DH', UT: '內', OF: '外', SP: '先發', RP: '中繼', CL: '終結' };
const fence = th => { const a = Math.min(Math.abs(th), 45) / 45; return 330 + 70 * (1 - Math.pow(a, 1.5)); };

// 能力 -> 物理量
const runSpd = p => 24.5 + p.r.speed * 0.075;          // 跑速 ft/s
const reactT = p => 0.5 - p.r.defense * 0.0025;        // 反應時間
const throwSpd = p => 98 + p.r.arm * 0.45;             // 傳球速度 ft/s
const xferT = p => 0.85 - p.r.defense * 0.004;         // 接球到出手
const moveT = (d, spd) => d <= 0 ? 0 : d / spd + 0.45 * Math.min(1, d / 20); // 含起步加速

// ---------------- 球員與球隊 ----------------
const SUR = '陳林黃張李王吳劉蔡楊許鄭謝郭洪曾邱廖賴周徐蘇葉莊呂江何蕭羅高潘簡朱鍾彭游詹胡施沈余趙盧梁顏柯孫魏翁戴范宋方鄧杜傅侯曹薛丁卓阮馬董唐藍蔣石古紀姚連馮程湯田康姜白汪鄒尤巫黎涂龔嚴韓袁金陸夏柳邵錢倪溫譚駱熊任秦顧毛';
const G1 = '志俊建家冠宗承柏彥睿子泓品宇哲嘉文信政明國偉智勝耀聖振博凱祐育廷浩翔安仁祥立昱晉維崇峻銘鴻正啟';
const G2 = '明傑宏豪宇翰恩廷哲瑋偉彬勳龍輝雄霖凱翔誠均軒鈞源達賢毅鋒威平安昌德民倫揚瑞弘竣';
const genName = () => pick(SUR) + pick(G1) + pick(G2);

const TEAMS = [
  { name: '藍鷹', hat: '#2346a8', shirt: '#f4f4f4', trim: '#2f5fd0', pants: '#283044', bar: '#4a86f5' },
  { name: '赤獅', hat: '#a81e18', shirt: '#e0442a', trim: '#ffd38a', pants: '#6e1712', bar: '#f05a4a' },
  { name: '翠龍', hat: '#1d6a34', shirt: '#eef0e0', trim: '#2aa050', pants: '#1d4a2a', bar: '#3cc070' },
  { name: '金虎', hat: '#1a1a1a', shirt: '#f2b632', trim: '#1a1a1a', pants: '#3a3a3a', bar: '#f2c040' },
  { name: '紫電', hat: '#4a2286', shirt: '#9a6ad8', trim: '#f0e0ff', pants: '#311556', bar: '#b07af0' },
  { name: '黑熊', hat: '#1c1c1c', shirt: '#3c3c3c', trim: '#e0e0e0', pants: '#161616', bar: '#d0d0d0' },
];
const CITIES = ['台北', '新北', '桃園', '台中', '台南', '高雄', '新竹', '嘉義', '花蓮', '基隆'];

let PID = 1;
const newStats = () => ({ G: 0, PA: 0, AB: 0, H: 0, D: 0, T: 0, HR: 0, RBI: 0, R: 0, BB: 0, SO: 0, SB: 0, CS: 0,
  GP: 0, outs: 0, pH: 0, pR: 0, pER: 0, pBB: 0, pSO: 0, pHR: 0, NP: 0, BF: 0, W: 0, L: 0, S: 0 });

const ADJ = {
  C: { defense: 8, arm: 10, speed: -14 }, '1B': { power: 9, defense: -6, speed: -8, contact: 2 },
  '2B': { defense: 6, speed: 6, power: -6, contact: 3 }, SS: { defense: 12, speed: 7, arm: 8, power: -7 },
  '3B': { arm: 9, power: 4, defense: 3 }, LF: { power: 5, defense: -5 }, CF: { speed: 13, defense: 9, arm: 2, power: -2 },
  RF: { arm: 12, power: 5 }, DH: { power: 12, contact: 4, defense: -18, speed: -8 },
  UT: { defense: 4, speed: 2, power: -5, contact: -3 }, OF: { speed: 6, defense: 2, power: -4 },
};
const BREAKING = ['滑球', '曲球', '變速球', '指叉球', '卡特球', '伸卡球', '橫掃球', '滑球', '曲球', '變速球'];

function mkPlayer(pos, role, r) {
  for (const k in r) r[k] = Math.round(clamp(r[k], role === 'H' ? 20 : 8, 99));
  const p = { id: PID++, name: genName(), num: 0, pos, role, bats: R() < 0.32 ? 'L' : 'R', throws: R() < 0.27 ? 'L' : 'R', r, g: newStats(), s: newStats() };
  if (role !== 'H') {
    p.velo = Math.round(138 + r.fastball * 0.21 + gauss() * 1.5);
    const pool = BREAKING.slice(), n = 2 + (R() < 0.4 ? 1 : 0);
    p.pitches = [];
    while (p.pitches.length < n) { const b = pool.splice(Math.floor(R() * pool.length), 1)[0]; if (!p.pitches.includes(b)) p.pitches.push(b); }
  }
  return p;
}
function genHitter(pos, tier) {
  const r = { contact: 52 + tier + gauss() * 11, power: 50 + tier + gauss() * 13, eye: 50 + tier + gauss() * 11,
    speed: 50 + gauss() * 14, defense: 52 + gauss() * 12, arm: 52 + gauss() * 12,
    fastball: 10 + R() * 15, breaking: 10 + R() * 15, control: 10 + R() * 15, stamina: 10 + R() * 10 };
  const a = ADJ[pos] || {};
  for (const k in a) r[k] += a[k];
  return mkPlayer(pos, 'H', r);
}
function genPitcher(role) {
  const r = { fastball: 54 + gauss() * 10, breaking: 54 + gauss() * 10, control: 52 + gauss() * 11,
    stamina: role === 'SP' ? 72 + gauss() * 9 : 38 + gauss() * 10,
    contact: 16 + gauss() * 5, power: 14 + gauss() * 6, eye: 15 + gauss() * 5,
    speed: 38 + gauss() * 10, defense: 48 + gauss() * 10, arm: 60 + gauss() * 10 };
  if (role === 'CL') { r.fastball += 10; r.breaking += 6; r.control += 4; }
  if (role === 'RP') r.fastball += 3;
  return mkPlayer(role, role, r);
}

function makeTeam(style, city) {
  const t = Object.assign({}, style, { city, full: city + style.name, roster: [], rotation: 0, W: 0, L: 0, T: 0 });
  for (const pos of ['C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF', 'DH']) t.roster.push(genHitter(pos, 0));
  for (const pos of ['C', 'UT', 'UT', 'OF']) t.roster.push(genHitter(pos, -6));
  for (let i = 0; i < 5; i++) t.roster.push(genPitcher('SP'));
  for (let i = 0; i < 7; i++) t.roster.push(genPitcher('RP'));
  t.roster.push(genPitcher('CL'));
  const nums = []; for (let i = 0; i < 100; i++) nums.push(i);
  for (const p of t.roster) { p.num = nums.splice(Math.floor(R() * nums.length), 1)[0]; p.team = t; }
  return t;
}
// ---------------- 明星球員 ----------------
// 每場比賽一定會出現的四位超強球員，隨機分到兩隊的不同位置（先發打者、先發投手或終結者）
const STARS = ['Josh Chen', 'Jasper Chen', 'Jeff Chen', 'Erin Lai'];
const hi = (lo, top) => lo + R() * (top - lo);
function genStar(name, slot) {
  let r;
  if (slot === 'SP' || slot === 'CL') {
    r = { fastball: hi(93, 99), breaking: hi(92, 99), control: hi(90, 99), stamina: slot === 'SP' ? hi(92, 99) : hi(62, 75),
      contact: hi(25, 40), power: hi(20, 40), eye: hi(25, 40), speed: hi(50, 70), defense: hi(80, 95), arm: hi(88, 99) };
  } else {
    r = { contact: hi(90, 99), power: hi(88, 99), eye: hi(88, 99), speed: hi(84, 99), defense: hi(86, 99), arm: hi(86, 99),
      fastball: 10 + R() * 15, breaking: 10 + R() * 15, control: 10 + R() * 15, stamina: 10 + R() * 10 };
    const a = ADJ[slot] || {};
    for (const k in a) if (a[k] > 0) r[k] += a[k] * 0.3;          // 位置只加強項，不扣能力
  }
  const p = mkPlayer(slot, slot === 'SP' || slot === 'CL' ? slot : 'H', r);
  p.name = name; p.star = true;
  return p;
}
// 把明星放進球隊：每位明星挑一個還沒被佔走的位置，取代原本那位球員（背號沿用）
function addStars(teams) {
  const slots = [];
  teams.forEach((t, ti) => {
    ['C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF', 'DH'].forEach(pos => slots.push({ ti, pos }));
    slots.push({ ti, pos: 'SP' }, { ti, pos: 'CL' });
  });
  for (const name of STARS) {
    if (teams.some(t => t.roster.some(p => p.name === name))) continue;      // 存檔裡已經有了
    const free = slots.filter(s => !teams[s.ti].roster.some(p => p.star && slotOf(teams[s.ti], p) === s.pos));
    const s = pick(free), t = teams[s.ti];
    let i;
    if (s.pos === 'SP') {                                // 下一場先發的那位投手
      const sps = t.roster.filter(p => p.role === 'SP');
      i = t.roster.indexOf(sps[t.rotation % sps.length]);
    } else if (s.pos === 'CL') i = t.roster.findIndex(p => p.role === 'CL');
    else i = t.roster.findIndex((p, k) => k < 9 && p.pos === s.pos);
    const old = t.roster[i], star = genStar(name, s.pos);
    star.num = old.num; star.team = t;
    t.roster[i] = star;
  }
  return teams;
}
function slotOf(t, p) {
  if (p.role === 'SP' || p.role === 'CL') return p.role;
  return p.pos;
}
function makeMatch() {
  const pool = TEAMS.slice(), cities = CITIES.slice();
  const take = a => a.splice(Math.floor(R() * a.length), 1)[0];
  return addStars([makeTeam(take(pool), take(cities)), makeTeam(take(pool), take(cities))]);
}

function buildLineup(team) {
  if (team.order) return team.order.map(o => ({ p: o.p, pos: o.pos }));      // 玩家自己排的打序（養成模式）
  const pool = team.roster.slice(0, 9).map(p => ({ p, pos: p.pos }));
  const take = f => { pool.sort((a, b) => f(b.p.r) - f(a.p.r)); return pool.shift(); };
  const o = [];
  o[0] = take(r => r.speed * 0.5 + r.contact * 0.6 + r.eye * 0.4);
  o[2] = take(r => r.contact * 0.7 + r.power * 0.6 + r.eye * 0.2);
  o[3] = take(r => r.power);
  o[1] = take(r => r.contact + r.eye * 0.6);
  o[4] = take(r => r.power + r.contact * 0.3);
  pool.sort((a, b) => (b.p.r.contact + b.p.r.power) - (a.p.r.contact + a.p.r.power));
  for (let i = 5; i < 9; i++) o[i] = pool.shift();
  return o;
}

// ---------------- 時間軸 ----------------
class TL {
  constructor() { this.mv = []; this.ball = []; this.tx = []; this.pose = []; this.end = 0; }
  bump(t) { if (t > this.end) this.end = t; }
  m(id, t0, t1, to) { if (t1 < t0 + 0.02) t1 = t0 + 0.02; this.mv.push({ id, t0, t1, to: P2(to.x, to.y) }); this.bump(t1); return t1; }
  path(id, t0, pts, spd) { let t = t0; for (const p of pts) { const last = this.mv.filter(m => m.id === id).pop(); const from = last ? last.to : null; const d = from ? dist(from, p) : 30; const t1 = t + d / spd; this.m(id, t, t1, p); t = t1; } return t; }
  b(t0, t1, from, to, h0, h1, peak) { this.ball.push({ t0, t1, from: P2(from.x, from.y), to: P2(to.x, to.y), h0, h1, peak: peak || 0 }); this.bump(t1); }
  t(t, str, at, color, size) { this.tx.push({ t, str, x: at.x, y: at.y, color: color || '#fff', size: size || 1 }); this.bump(t + 1.1); }
  p(id, t, frame, dur) { this.pose.push({ id, t, frame, dur }); }
}

const C_GOOD = '#ffe14a', C_BAD = '#ff6a5a', C_INFO = '#bfe6ff', C_GOLD = '#ffcf3a';
const runnerPath = (from, to) => { const pts = []; for (let b = from + 1; b <= to; b++) pts.push(BASE[b]); return pts; };
const sprayName = sp => sp < -27 ? '左外野' : sp < -10 ? '左中間' : sp <= 10 ? '中外野' : sp <= 27 ? '右中間' : '右外野';

// ---------------- 比賽 ----------------
class Game {
  constructor(away, home) {
    this.teams = [away, home];
    this.ts = this.teams.map(t => this.initTeam(t));
    this.inning = 0; this.half = 1; this.outs = 0; this.balls = 0; this.strikes = 0;
    this.bases = [null, null, null];
    this.phase = 'half'; this.newPA = true; this.over = false;
    this.log = []; this.pitchNo = 0;
    this.rec = [{ win: null, lose: null }, { win: null, lose: null }];
  }
  initTeam(t) {
    for (const p of t.roster) { p.g = newStats(); p._charged = null; p._entry = null; }
    const sps = t.roster.filter(p => p.role === 'SP');
    const sp = sps[t.rotation % sps.length]; t.rotation++;
    const ts = { team: t, lineup: buildLineup(t), pitcher: sp, bi: 0, R: 0, H: 0, E: 0, line: [], entered: new Set(), exited: new Set(), field: {} };
    ts.lineup.forEach(e => ts.entered.add(e.p.id));
    ts.entered.add(sp.id); sp.g.GP = 1; sp._entry = { inning: 1, lead: 0 };
    ts.lineup.forEach(e => e.p.g.G = 1);
    this.refreshField(ts);
    return ts;
  }
  refreshField(ts) { ts.field = { P: ts.pitcher }; for (const e of ts.lineup) if (e.pos !== 'DH') ts.field[e.pos] = e.p; }
  off() { return this.ts[this.half]; }
  def() { return this.ts[1 - this.half]; }
  lead(i) { return this.ts[i].R - this.ts[1 - i].R; }

  snap() {
    const off = this.off(), def = this.def();
    return {
      inning: this.inning, half: this.half, outs: this.outs, balls: this.balls, strikes: this.strikes, over: this.over,
      offIdx: this.half, R: [this.ts[0].R, this.ts[1].R], H: [this.ts[0].H, this.ts[1].H], E: [this.ts[0].E, this.ts[1].E],
      line: [this.ts[0].line.slice(), this.ts[1].line.slice()],
      field: Object.fromEntries(FIELD.map(pos => [pos, def.field[pos].id])),
      batter: off.lineup[off.bi].p.id, onDeck: off.lineup[(off.bi + 1) % 9].p.id,
      bases: this.bases.map(r => r ? r.id : null),
      pitchers: this.ts.map(t => t.pitcher.id),
      entered: this.ts.map(t => [...t.entered]), exited: this.ts.map(t => [...t.exited]),
      lineups: this.ts.map(t => t.lineup.map(e => ({ id: e.p.id, pos: e.pos }))),
    };
  }
  ev(kind, tl, dur, log, banner) { return { kind, tl, dur, log: log || [], banner, post: this.snap() }; }

  // 回傳下一個事件（一球、換人、換局）
  step() {
    if (this.over) return null;
    if (this.phase === 'half') {
      this.startHalf();
      const t = this.off().team;
      const msg = `第 ${this.inning} 局${this.half ? '下' : '上'}　${t.full} 進攻`;
      const log = [{ cls: 'inning', s: msg }];
      if (this.bases[1]) log.push({ s: `延長賽突破僵局：${this.bases[1].name} 站上二壘` });
      return this.ev('half', null, 2.6, log, msg);
    }
    if (this.newPA) {
      this.newPA = false;
      const ch = this.manager();
      if (ch) { this.newPA = true; return this.ev('change', null, 2.6, ch.log, ch.banner); }
    }
    return this.pitch();
  }

  startHalf() {
    if (this.half === 1) { this.half = 0; this.inning++; } else this.half = 1;
    this.outs = 0; this.balls = 0; this.strikes = 0; this.bases = [null, null, null];
    const off = this.off();
    off.line[this.inning - 1] = 0;
    if (this.inning >= 10) { const g = off.lineup[(off.bi + 8) % 9].p; g._charged = null; this.bases[1] = g; }
    this.phase = 'play'; this.newPA = true;
  }

  // ---------- 教練調度 ----------
  pLimit(p) { return p.role === 'SP' ? 55 + p.r.stamina * 0.6 : 14 + p.r.stamina * 0.5; }
  fatigue(p) { const L = this.pLimit(p), over = (p.g.NP - 0.75 * L) / L; return over > 0 ? Math.max(0.55, 1 - over * 0.9) : 1; }
  manager() {
    const def = this.def(), off = this.off(), P = def.pitcher;
    const lead = this.lead(1 - this.half);
    const L = this.pLimit(P);
    let change = null;
    const outsHere = P.g.outs, newInning = this.outs === 0 && !this.bases.some(Boolean);
    if (P.g.NP >= L) change = '體力耗盡';
    else if (P.role === 'SP' && P.g.pR >= 7) change = '被打爆';
    else if (P.g.NP >= L * 0.7 && this.bases.filter(Boolean).length >= 2 && P.g.pR >= 3) change = '陷入危機';
    else if (P.role !== 'SP' && newInning && outsHere >= 3 && P._entry.inning < this.inning) change = '任務完成';
    else if (P.role !== 'CL' && newInning && this.inning >= 9 && lead >= 1 && lead <= 3) change = '關門';
    else if (P.role === 'SP' && newInning && this.inning >= 8 && lead >= 1 && lead <= 3 && P.g.NP > L * 0.6) change = '交給牛棚';
    if (change) {
      const rp = this.pickReliever(def, lead);
      if (rp) {
        def.exited.add(P.id); def.entered.add(rp.id);
        def.pitcher = rp; rp.g.GP = 1; rp._entry = { inning: this.inning, lead };
        this.refreshField(def);
        const role = POS_CN[rp.role];
        return { log: [{ cls: 'change', s: `${def.team.full} 換投（${change}）：${P.name} 退場，${role} ${rp.name} 上場` }], banner: `換投 ${rp.name}` };
      }
    }
    // 代打：七局後落後或平手，打者太弱
    const oLead = this.lead(this.half);
    if (this.inning >= 7 && oLead <= 0 && oLead >= -4) {
      const e = off.lineup[off.bi];
      const val = p => p.r.contact * 0.5 + p.r.power * 0.45 + p.r.eye * 0.25;
      const bench = off.team.roster.filter(p => p.role === 'H' && !off.entered.has(p.id));
      bench.sort((a, b) => val(b) - val(a));
      const ph = bench[0];
      if (ph && val(ph) > val(e.p) + 10 && R() < 0.7) {
        off.exited.add(e.p.id); off.entered.add(ph.id); ph.g.G = 1;
        const old = e.p; e.p = ph; this.refreshField(off);
        return { log: [{ cls: 'change', s: `${off.team.full} 代打：${ph.name} 替換 ${old.name}（守${POS_SHORT[e.pos]}）` }], banner: `代打 ${ph.name}` };
      }
    }
    return null;
  }
  pickReliever(ts, lead) {
    const avail = ts.team.roster.filter(p => (p.role === 'RP' || p.role === 'CL') && !ts.entered.has(p.id));
    let pool = avail;
    if (!pool.length) pool = ts.team.roster.filter(p => p.role === 'SP' && !ts.entered.has(p.id));
    if (!pool.length) return null;
    const q = p => p.r.fastball + p.r.breaking + p.r.control;
    const cl = pool.find(p => p.role === 'CL');
    const save = this.inning >= 9 && lead >= 1 && lead <= 3, tieHome = this.inning >= 9 && lead === 0 && this.half === 0;
    if ((save || tieHome) && cl) return cl;
    const non = pool.filter(p => p.role !== 'CL');
    if (!non.length) return pool[0];
    if (this.inning >= 7 && lead >= -1 && lead <= 3) return non.sort((a, b) => q(b) - q(a))[0];
    if (this.inning <= 5) return non.sort((a, b) => b.r.stamina - a.r.stamina)[0];
    return non.sort((a, b) => q(a) - q(b))[0];
  }

  // ---------- 記錄 ----------
  addOut(n) { this.outs += n || 1; this.def().pitcher.g.outs += n || 1; }
  scoreRun(r, rbiB, t, tl, unearned) {
    const off = this.off(), oi = this.half;
    const before = this.lead(oi);
    off.R++; off.line[this.inning - 1] = (off.line[this.inning - 1] || 0) + 1;
    r.g.R++;
    if (rbiB) rbiB.g.RBI++;
    const pc = r._charged || this.def().pitcher;
    pc.g.pR++; if (!unearned && r._charged) pc.g.pER++;
    r._charged = null;
    const after = before + 1;
    if (before <= 0 && after > 0) { this.rec[oi].win = off.pitcher; this.rec[1 - oi].lose = pc; }
    if (before < 0 && after === 0) { this.rec[0].win = this.rec[1].win = null; this.rec[0].lose = this.rec[1].lose = null; }
    if (tl) tl.t(t, '+1 分', P2(4, 10), this.teams[oi].bar, 1.3);
  }
  endPA() {
    const off = this.off();
    off.bi = (off.bi + 1) % 9; this.balls = 0; this.strikes = 0; this.newPA = true;
  }
  checkEnd() {
    const a = this.ts[0].R, h = this.ts[1].R;
    if (this.half === 1 && this.inning >= 9 && h > a) { this.finish(); return; }
    if (this.outs >= 3) {
      const off = this.off();
      if (this.half === 0 && this.inning >= 9 && h > a) { this.ts[1].line[this.inning - 1] = 'X'; this.finish(); }
      else if (this.half === 1 && this.inning >= 9 && h !== a) this.finish();
      else if (this.half === 1 && this.inning >= 15) this.finish();
      else { this.phase = 'half'; off.line[this.inning - 1] = off.line[this.inning - 1] || 0; }
    }
  }
  finish() {
    this.over = true;
    const a = this.ts[0].R, h = this.ts[1].R;
    const res = [];
    if (a !== h) {
      const wi = h > a ? 1 : 0, li = 1 - wi, wt = this.ts[wi];
      let w = this.rec[wi].win || wt.pitcher;
      if (w.role === 'SP' && w.g.outs < 15) {
        const rps = wt.team.roster.filter(p => p.role !== 'SP' && wt.entered.has(p.id));
        if (rps.length) w = rps.sort((x, y) => y.g.outs - x.g.outs)[0];
      }
      const l = this.rec[li].lose || this.ts[li].pitcher;
      w.g.W = 1; l.g.L = 1;
      const fin = wt.pitcher;
      if (fin !== w && fin._entry && fin._entry.lead >= 1 && fin._entry.lead <= 3 && fin.g.outs >= 1) fin.g.S = 1;
      this.teams[wi].W++; this.teams[li].L++;
      res.push(`勝投 ${w.name}　敗投 ${l.name}` + (fin.g.S ? `　救援 ${fin.name}` : ''));
    } else { this.teams[0].T++; this.teams[1].T++; }
    this.result = res;
    for (const ts of this.ts) for (const p of ts.team.roster) for (const k in p.g) p.s[k] += p.g[k];
  }

  // ---------- 一球 ----------
  pitch() {
    const tl = new TL(), log = [];
    this.L = log;
    const off = this.off(), def = this.def(), F = def.field;
    const P = def.pitcher, B = off.lineup[off.bi].p;
    if (this.balls === 0 && this.strikes === 0) { B.g.PA++; P.g.BF++; }

    // 盜壘
    let steal = null;
    const r1 = this.bases[0];
    if (r1 && !this.bases[1] && this.outs < 2 && r1.r.speed >= 55 && this.balls < 3 && R() < (r1.r.speed - 50) * 0.005) steal = r1;

    const fat = this.fatigue(P);
    const bProb = clamp(0.33 + (P.r.breaking - P.r.fastball) * 0.006 + (this.strikes === 2 ? 0.1 : 0) - (this.balls === 3 ? 0.12 : 0), 0.12, 0.65);
    const brk = R() < bProb;
    const pname = brk ? pick(P.pitches) : '速球';
    const velo = brk ? Math.round(P.velo - 10 - R() * 16) : Math.round(P.velo + gauss() * 1.3 - (1 - fat) * 14);
    const pq = (brk ? P.r.breaking : P.r.fastball) * fat + gauss() * 8;
    const ctl = P.r.control * fat;
    let zone = 0.505 + (ctl - 50) * 0.0032 - (brk ? 0.05 : 0);
    if (this.balls === 3) zone += 0.08;
    if (this.strikes === 2 && this.balls < 2) zone -= 0.1;
    const inZ = R() < zone;
    const eye = B.r.eye;
    let swing;
    if (steal && this.strikes < 2) swing = false;
    else if (inZ) swing = R() < clamp(0.66 + (eye - 50) * 0.002 + (this.strikes === 2 ? 0.18 : 0) - (this.balls === 3 && this.strikes < 2 ? 0.35 : 0), 0.2, 0.97);
    else swing = R() < clamp(0.29 - (eye - 50) * 0.0045 + (pq - 50) * 0.0025 + (brk ? 0.04 : 0) + (this.strikes === 2 ? 0.12 : 0) - (this.balls === 3 ? 0.1 : 0), 0.03, 0.7);
    let contact = false;
    if (swing) contact = R() < clamp((inZ ? 0.85 : 0.6) + (B.r.contact - pq) * 0.0045, 0.3, 0.97);

    const T0 = 1.0, fps = velo / 3.6 * 3.281, tPl = T0 + 57 / fps;
    const px = inZ ? gauss() * 0.6 : (R() < 0.5 ? -1 : 1) * (1.8 + R() * 1.6);
    const plate = P2(px, 0.5);
    tl.p(P.id, 0, 'windup', T0);
    tl.p(P.id, T0, 'throw', 0.3);
    tl.b(T0, tPl, P2(1, 56), plate, 6, 2.5, brk ? 1.5 : 0.3);
    tl.t(T0 + 0.05, `${velo}km ${pname}`, P2(0, 82), brk ? C_GOLD : '#ffffff', 0.85);
    if (swing) tl.p(B.id, tPl - 0.08, 'swing', 0.45);
    P.g.NP++; this.pitchNo++;
    if (steal) tl.m(steal.id, 0.15, 0.4 + 78 / runSpd(steal), P2(BASE[2].x + 3, BASE[2].y - 3));

    let paOver = false, walked = false;
    if (!contact) {
      tl.b(tPl, tPl + 0.07, plate, P2(0, -3), 2.5, 3, 0);
      const runnersOn = this.bases.some(Boolean);
      if (!swing && !inZ && R() < 0.011 * (1.45 - ctl / 100)) {
        tl.t(tPl + 0.1, '觸身球', P2(B.bats === 'R' ? -6 : 6, 14), C_BAD, 1.1);
        log.push({ s: `${B.name} 觸身球保送` });
        this.walk(tl, tPl + 0.4, B, P, true); paOver = true; walked = true;
      } else if (swing || inZ) {
        this.strikes++;
        tl.t(tPl + 0.1, swing ? '揮空!' : '好球', P2(B.bats === 'R' ? -6 : 6, 14), C_GOOD, 1);
        if (this.strikes >= 3) {
          tl.t(tPl + 0.5, '三振!!', P2(0, 26), C_BAD, 1.6);
          B.g.AB++; B.g.SO++; P.g.pSO++; this.addOut();
          log.push({ cls: 'k', s: `${B.name} ${swing ? '揮棒落空' : '站著不動'}，三振出局（${pname} ${velo}km）` });
          paOver = true;
        }
      } else {
        this.balls++;
        tl.t(tPl + 0.1, '壞球', P2(B.bats === 'R' ? -6 : 6, 14), C_INFO, 0.9);
        if (runnersOn && R() < 0.009 * (1.5 - ctl / 100)) {
          tl.b(tPl + 0.07, tPl + 0.6, P2(0, -3), P2(gauss() * 15, -36), 1, 0, 1);
          tl.m(F.C.id, tPl + 0.2, tPl + 1.2, P2(0, -32));
          tl.t(tPl + 0.3, '暴投!', P2(0, 0), C_BAD, 1.2);
          log.push({ s: `${P.name} 暴投，壘上跑者各推進一個壘包` });
          this.advanceAll(tl, tPl + 0.3, null);
          steal = null;
        }
        if (this.balls >= 4) {
          tl.t(tPl + 0.5, '四壞保送', P2(0, 26), C_INFO, 1.2);
          log.push({ s: `${B.name} 選到四壞球保送` });
          this.walk(tl, tPl + 0.6, B, P, false); paOver = true; walked = true;
        }
      }
      if (steal && !walked && this.outs < 3 && this.bases[0] === steal) this.doSteal(tl, steal, T0, tPl, F, log);
    } else if (R() < (inZ ? 0.5 : 0.6)) {
      // 界外球
      const side = R() < 0.5 ? -1 : 1;
      const popOut = R() < 0.045;
      if (popOut) {
        const who = pick(['C', side < 0 ? '3B' : '1B']), f = F[who];
        const spot = who === 'C' ? P2(side * (10 + R() * 25), -15 - R() * 15) : P2(side * (95 + R() * 20), 55 + R() * 30);
        const hang = 3.2 + R() * 1.3;
        tl.b(tPl, tPl + hang, plate, spot, 3, 5, 90);
        tl.m(f.id, tPl + 0.4, tPl + hang - 0.3, spot);
        tl.t(tPl + hang, '界外接殺', spot, C_BAD, 1.1);
        B.g.AB++; this.addOut();
        log.push({ s: `${B.name} 擊出界外高飛球，被${POS_CN[who]} ${f.name} 接殺` });
        paOver = true;
      } else {
        const spot = R() < 0.45 ? P2(gauss() * 20, -40) : P2(side * (60 + R() * 120), 20 + R() * 120);
        if (spot.y > 0 && Math.abs(spot.x) < spot.y + 5) spot.x = side * (spot.y + 20);
        tl.b(tPl, tPl + 1.0, plate, spot, 3, 0, 15 + R() * 30);
        tl.t(tPl + 0.15, '界外', P2(side * 10, 14), '#ffffff', 0.9);
        if (this.strikes < 2) this.strikes++;
      }
    } else {
      this.inPlay(tl, tPl, B, P, pq, brk, velo, pname);
      paOver = true;
    }

    if (paOver) this.endPA();
    this.checkEnd();
    const dur = Math.max(tl.end + 0.3, tPl + 0.9);
    return this.ev('pitch', tl, dur, log);
  }

  doSteal(tl, r, T0, tPl, F, log) {
    const C = F.C, cov = F.SS;
    const runT = 0.4 + 78 / runSpd(r);
    const pop = 0.95 - C.r.defense * 0.003 + dist(BASE[0], BASE[2]) / throwSpd(C);
    const thr = tPl + 0.05 + pop;
    tl.m(cov.id, T0 + 0.3, thr - 0.1, P2(BASE[2].x - 3, BASE[2].y + 2));
    tl.b(thr - dist(BASE[0], BASE[2]) / throwSpd(C), thr, P2(0, -3), BASE[2], 5, 4, 6);
    const m = thr - runT + gauss() * 0.18;
    if (m > 0) {
      this.bases[1] = r; this.bases[0] = null; r.g.SB++;
      tl.t(runT, '盜壘成功!', BASE[2], C_GOOD, 1.1);
      log.push({ s: `${r.name} 盜上二壘成功！` });
    } else {
      this.bases[0] = null; r.g.CS++; this.addOut();
      tl.t(thr, '阻殺!', BASE[2], C_BAD, 1.2);
      log.push({ s: `${r.name} 盜壘失敗，被捕手 ${C.name} 阻殺` });
    }
  }

  walk(tl, t, B, P, hbp) {
    if (hbp) B.g.PA += 0; else { B.g.BB++; P.g.pBB++; }
    B._charged = P;
    let carry = B, from = 0;
    for (let i = 0; i < 3; i++) {
      const cur = this.bases[i];
      tl.m(carry.id, t, t + 90 / 22, BASE[i + 1]);
      this.bases[i] = carry;
      if (!cur) { carry = null; break; }
      carry = cur;
    }
    if (carry) { tl.m(carry.id, t, t + 90 / 22, BASE[4]); this.scoreRun(carry, B, t + 90 / 22, tl); this.L.push({ s: `　→ 擠回一分，${carry.name} 得分` }); }
  }
  advanceAll(tl, t, rbiB) {
    for (let i = 2; i >= 0; i--) {
      const r = this.bases[i]; if (!r) continue;
      tl.m(r.id, t, t + 90 / 26, BASE[i + 2]);
      this.bases[i] = null;
      if (i === 2) this.scoreRun(r, rbiB, t + 90 / 26, tl); else this.bases[i + 1] = r;
    }
  }

  // ---------- 擊球進場 ----------
  inPlay(tl, t0, B, P, pq, brk, velo, pname) {
    const F = this.def().field;
    let ev = clamp(80 + B.r.power * 0.21 + (B.r.contact - pq) * 0.07 + gauss() * 12.5, 30, 119);
    const la = clamp(11 + (B.r.power - 50) * 0.12 + gauss() * 25, -50, 85);
    if (la < -20) ev *= 0.75;
    const pull = B.bats === 'R' ? -1 : 1;
    const sp = clamp(pull * (5 + (B.r.power - 50) * 0.15) + gauss() * 18, -44, 44);
    const dir = P2(Math.sin(sp * DEG), Math.cos(sp * DEG));
    const c = { tl, t0, B, P, ev, la, sp, dir, v: ev * 1.467, F, T: x => t0 + x };
    B._charged = P;
    if (la >= 10) this.flyBall(c); else this.grounder(c);
  }

  flyBall(c) {
    const { tl, B, dir, v, la, sp, F, T } = c;
    const lr = la * DEG;
    const full = v * v * Math.sin(2 * lr) / 32.2 * clamp(0.875 - la * 0.008, 0.4, 0.82);
    const hang = Math.max(0.5, 2 * v * Math.sin(lr) / 32.2 * 0.92);
    const apex = Math.max(4, v * v * Math.sin(lr) ** 2 / 64.4 * 0.7);
    const fd = fence(sp);
    const at = s => P2(dir.x * s, dir.y * s);
    const hAt = u => 4 * apex * u * (1 - u) + 3;
    const type = la < 20 ? '平飛球' : la > 50 ? '內野高飛球' : '高飛球';
    if (full > fd && la >= 16) return this.homeRun(c, full, hang, apex);
    const wall = full > fd;
    const end = wall ? fd - 1 : full;
    const sList = []; for (let s = 20; s < end; s += 3) sList.push(s); sList.push(end);

    let best = null, near = null;
    for (const pos of FIELD) {
      if (pos === 'C' && !(la > 45 && full < 90)) continue;
      const f = F[pos], h0 = P2(POS_XY[pos].x + gauss() * 8, POS_XY[pos].y + gauss() * 8), spd = runSpd(f), rx = reactT(f) + (pos === 'P' ? 0.3 : OF.has(pos) ? 0.45 : 0.1);
      for (const s of sList) {
        const u = s / full;
        if (hAt(u) > 9) continue;
        const pt = at(s), tb = hang * u, tf = rx + moveT(dist(h0, pt) * 1.1 - 3, spd), d = tf - tb;
        if (d <= 0) { if (!best || tb < best.tb - 0.05 || (Math.abs(tb - best.tb) <= 0.05 && d < best.d)) best = { pos, f, pt, tb, tf, rx, d, u }; break; }
        if (!near || d < near.d) near = { pos, f, pt, tb, tf, rx, d, u };
      }
    }
    const arc = (u) => { const h1 = hAt(u), zm = 4 * apex * (u / 2) * (1 - u / 2) + 3; return { h1, peak: zm - (3 + h1) / 2 }; };
    let caught = null, spectacular = false;
    if (best) caught = best;
    else if (near) {
      const win = 0.12 + near.f.r.defense * 0.004;
      if (near.d < win && R() < (1 - near.d / win) * 0.85) { caught = near; spectacular = true; }
    }
    if (caught && R() < 0.01 * (1.5 - caught.f.r.defense / 100)) {
      // 漏接失誤
      const a = arc(caught.u);
      tl.b(T(0), T(caught.tb), BASE[0], caught.pt, 3, a.h1, a.peak);
      tl.m(caught.f.id, T(caught.rx), T(Math.min(caught.tf, caught.tb)), caught.pt);
      tl.t(T(caught.tb), '失誤!', caught.pt, C_BAD, 1.2);
      this.def().E++;
      this.L.push({ cls: 'err', s: `${B.name} 擊出${type}，${POS_CN[caught.pos]} ${caught.f.name} 漏接失誤` });
      const roll = P2(caught.pt.x + dir.x * 12, caught.pt.y + dir.y * 12);
      tl.b(T(caught.tb), T(caught.tb + 0.7), caught.pt, roll, 0, 0, 1);
      return this.runOnHit(c, { pos: caught.pos, f: caught.f, pt: roll, tR: caught.tb + 1.0, kind: 'fly', hang: caught.tb, err: true, desc: '' });
    }
    if (caught) {
      const a = arc(caught.u);
      tl.b(T(0), T(caught.tb), BASE[0], caught.pt, 3, a.h1, a.peak);
      tl.m(caught.f.id, T(caught.rx), T(spectacular ? caught.tb : Math.min(caught.tf, caught.tb)), caught.pt);
      if (spectacular) tl.p(caught.f.id, T(caught.tb - 0.1), 'dive', 0.8);
      tl.t(T(caught.tb), spectacular ? '美技接殺!!' : '接殺', P2(caught.pt.x, caught.pt.y + 10), spectacular ? C_GOLD : '#ffffff', spectacular ? 1.3 : 1);
      B.g.AB++; this.addOut();
      const where = OF.has(caught.pos) ? sprayName(sp) : POS_CN[caught.pos] + '方向';
      this.L.push({ s: `${B.name} 擊出${where}${type}，被${POS_CN[caught.pos]} ${caught.f.name} ${spectacular ? '飛撲美技' : ''}接殺` });
      for (const pos of FIELD) if (pos !== caught.pos && OF.has(pos) && OF.has(caught.pos)) tl.m(F[pos].id, T(0.5), T(caught.tb), P2((POS_XY[pos].x * 2 + caught.pt.x) / 3, (POS_XY[pos].y * 2 + caught.pt.y) / 3));
      if (this.outs < 3) this.tagUps(c, caught);
      return;
    }
    // 安打
    const u = end / full, a = arc(u);
    const L = at(end), tL = hang * u;
    let rollD, rdir = dir;
    if (wall) { rollD = 12 + R() * 12; rdir = P2(-dir.x, -dir.y); }
    else rollD = la < 20 ? c.ev * 1.6 : la < 35 ? c.ev * 1.1 : c.ev * 0.3;
    if (Math.abs(sp) > 32) rollD *= 1.5;
    if (near && near.d < 0.6) { rollD += 25; if (near.d < 0.35) tl.p(near.f.id, T(tL - 0.1), 'dive', 0.8); }
    let Rp = P2(L.x + rdir.x * rollD, L.y + rdir.y * rollD);
    if (!wall) { const rr = Math.hypot(Rp.x, Rp.y), fz = fence(Math.atan2(Rp.x, Rp.y) / DEG) - 3; if (rr > fz) { Rp = P2(Rp.x * fz / rr, Rp.y * fz / rr); } }
    const rollT = Math.max(0.3, dist(L, Rp) / (c.v * Math.cos(lr) * 0.35));
    let ret = null;
    for (const pos of FIELD) {
      if (pos === 'C' || pos === 'P') continue;
      const f = F[pos], h0 = POS_XY[pos], spd = runSpd(f), rx = reactT(f) + 0.5;
      let got = null;
      for (let k = 0; k <= 8; k++) {
        const q = k / 8, pt = P2(L.x + (Rp.x - L.x) * q, L.y + (Rp.y - L.y) * q);
        const tb = tL + rollT * Math.pow(q, 0.7), tf = rx + moveT(dist(h0, pt), spd);
        if (tf <= tb) { got = { f, pos, pt, t: tb + 0.8, tf, rx }; break; }
        if (k === 8) got = { f, pos, pt, t: Math.max(tf, tL + rollT) + 0.6, tf, rx };
      }
      if (!ret || got.t < ret.t) ret = got;
    }
    tl.b(T(0), T(tL), BASE[0], L, 3, wall ? 8 : 0, a.peak + (wall ? 3 : 0));
    tl.b(T(tL), T(ret.t), L, ret.pt, wall ? 8 : 0, 0, wall ? 4 : 1.5);
    tl.m(ret.f.id, T(ret.rx), T(Math.min(ret.tf, ret.t)), ret.pt);
    const desc = `${sprayName(sp)}${wall ? '大牆' : ''}`;
    if (wall) tl.t(T(tL), '碰牆!', L, C_GOLD, 1);
    this.runOnHit(c, { pos: ret.pos, f: ret.f, pt: ret.pt, tR: ret.t + 0.3, kind: la < 20 ? 'liner' : 'fly', hang: tL, desc });
  }

  tagUps(c, cg) {
    const { tl, B, T } = c;
    const f = cg.f, tC = cg.tb;
    const r3 = this.bases[2], r2 = this.bases[1];
    const thrT = b => { const d = dist(cg.pt, BASE[b]); return tC + xferT(f) + d / throwSpd(f) * (d > 250 ? 1.15 : 1); };
    if (r3) {
      const arr = tC + 0.15 + 90 / runSpd(r3), thr = thrT(4), m = thr - arr;
      if (m > 0.25) {
        tl.m(r3.id, T(tC + 0.1), T(arr), BASE[4]);
        tl.b(T(tC + xferT(f)), T(thr), cg.pt, P2(0, 2), 6, 3, 12);
        this.bases[2] = null;
        if (m + gauss() * 0.25 < 0) {
          this.addOut(); tl.t(T(thr), '本壘觸殺!', BASE[0], C_BAD, 1.3);
          this.L.push({ s: `　→ ${r3.name} 回壘衝本壘，被觸殺出局！雙殺` });
        } else {
          this.scoreRun(r3, B, T(arr), tl); B.g.AB--;
          this.L.push({ s: `　→ 高飛犧牲打，${r3.name} 回壘衝回本壘得分` });
        }
        return;
      }
    }
    if (r2 && !this.bases[2]) {
      const arr = tC + 0.15 + 90 / runSpd(r2), thr = thrT(3), m = thr - arr;
      if (m > 0.6) {
        tl.m(r2.id, T(tC + 0.1), T(arr), BASE[3]);
        this.bases[1] = null;
        if (m + gauss() * 0.25 < 0) { this.addOut(); tl.t(T(thr), '觸殺!', BASE[3], C_BAD, 1.2); this.L.push({ s: `　→ ${r2.name} 推進三壘被觸殺` }); }
        else { this.bases[2] = r2; this.L.push({ s: `　→ ${r2.name} 回壘推進到三壘` }); }
      }
    }
  }

  homeRun(c, full, hang, apex) {
    const { tl, B, dir, sp, F, T } = c;
    const land = P2(dir.x * full, dir.y * full);
    tl.b(T(0), T(hang), BASE[0], land, 3, 10, apex);
    let near = 'CF'; for (const p of ['LF', 'RF']) if (dist(POS_XY[p], land) < dist(POS_XY[near], land)) near = p;
    const fp = fence(sp) - 4;
    tl.m(F[near].id, T(0.4), T(hang * 0.9), P2(dir.x * fp, dir.y * fp));
    const n = this.bases.filter(Boolean).length + 1;
    const big = n === 4 ? '滿貫全壘打!!!' : '全壘打!!';
    tl.t(T(hang * 0.8), big, P2(dir.x * 260, dir.y * 260), C_GOLD, 1.8);
    B.g.AB++; B.g.H++; B.g.HR++; this.off().H++;
    const P = this.def().pitcher; P.g.pH++; P.g.pHR++;
    this.L.push({ cls: 'hr', s: `${B.name} 轟出${sprayName(sp)}${n > 1 ? n + '分' : '陽春'}全壘打！飛行距離 ${Math.round(full)} 呎（初速 ${Math.round(c.ev * 1.609)}km/h）` });
    let t = 1.0;
    for (let i = 2; i >= 0; i--) {
      const r = this.bases[i]; if (!r) continue;
      const tEnd = tl.path(r.id, T(t), runnerPath(i + 1, 4), 40);
      this.scoreRun(r, B, tEnd, tl);
      this.bases[i] = null;
    }
    const tEnd = tl.path(B.id, T(1.0), runnerPath(0, 4), 40);
    this.scoreRun(B, B, tEnd, tl);
  }

  grounder(c) {
    const { tl, B, dir, v, la, sp, F, T } = c;
    const vg = v * 0.85 * Math.cos(la * DEG) * (1 - Math.max(0, -la) / 90);
    const a = 18, fd = fence(sp);
    const sStop = Math.min(vg * vg / (2 * a), fd - 3);
    const tAt = s => { const disc = vg * vg - 2 * a * s; return disc <= 0 ? vg / a : (vg - Math.sqrt(disc)) / a; };
    let best = null, dive = null;
    for (const pos of FIELD) {
      if (pos === 'C' && sStop > 35) continue;
      const f = F[pos], h0 = P2(POS_XY[pos].x + gauss() * 6, POS_XY[pos].y + gauss() * 6), spd = runSpd(f);
      const rx = reactT(f) + 0.1 + (pos === "P" ? 0.35 : 0) + (OF.has(pos) ? 0.2 : 0);
      const reach = 1.5 + f.r.defense * 0.02;
      let got = null, nd = null;
      for (let s = 3; ; s += 2) {
        const last = s >= sStop; if (last) s = sStop;
        const pt = P2(dir.x * s, dir.y * s), tb = tAt(s), tf = rx + moveT(dist(h0, pt) - reach, spd);
        if (tf <= tb) { got = { pos, f, pt, t: tb, s, rx }; break; }
        if (last) { got = { pos, f, pt, t: tf, s, rx }; break; }
        if (!OF.has(pos) && pos !== 'C' && (!nd || tf - tb < nd.d)) nd = { pos, f, pt, t: tb, d: tf - tb, s, rx };
      }
      if (!best || got.t < best.t) best = got;
      if (nd && (!dive || nd.d < dive.d)) dive = nd;
    }
    const roll = (to, t1) => {
      const from = BASE[0], n = 3;
      for (let i = 0; i < n; i++) {
        const q0 = i / n, q1 = (i + 1) / n;
        tl.b(T(t1 * q0), T(t1 * q1), P2(from.x + (to.x - from.x) * q0, from.y + (to.y - from.y) * q0), P2(from.x + (to.x - from.x) * q1, from.y + (to.y - from.y) * q1), 0.5, 0.5, (n - i) * 1.5);
      }
    };
    const infield = !OF.has(best.pos) && best.s < 175;
    if (infield) { roll(best.pt, best.t); return this.infieldPlay(c, best, false); }
    if (dive) {
      const win = 0.12 + dive.f.r.defense * 0.004;
      if (dive.d < win && R() < (1 - dive.d / win) * (0.35 + dive.f.r.defense / 200)) {
        roll(dive.pt, dive.t);
        return this.infieldPlay(c, Object.assign({}, dive, { t: dive.t + 0.55 }), true);
      }
      if (dive.d < 0.4) tl.p(dive.f.id, T(dive.t - 0.1), 'dive', 0.8);
    }
    roll(best.pt, best.t);
    tl.m(best.f.id, T(best.rx), T(best.t), best.pt);
    const gap = Math.abs(sp) < 12 ? '穿越二遊間' : sp < 0 ? (sp < -30 ? '沿三壘邊線' : '穿越三遊間') : (sp > 30 ? '沿一壘邊線' : '穿越一二壘間');
    this.runOnHit(c, { pos: best.pos, f: best.f, pt: best.pt, tR: best.t + 0.3, kind: 'ground', hang: 0, desc: gap });
  }

  infieldPlay(c, fe, dived) {
    const { tl, B, F, T } = c;
    const f = fe.f, Fp = fe.pt;
    // 不規則彈跳、移動中接球後需重新站穩
    const tF = fe.t + 0.15 + (R() < 0.25 ? 0.2 + R() * 0.5 : 0) + (dist(POS_XY[fe.pos], Fp) > 15 ? 0.25 : 0);
    const def = this.def();
    tl.m(f.id, T(fe.rx), T(fe.t - (dived ? 0.55 : 0)), Fp);
    if (dived) { tl.p(f.id, T(fe.t - 0.65), 'dive', 0.7); tl.t(T(fe.t - 0.5), '飛撲!', Fp, C_GOLD, 1); }
    const bTime = 1.1 + (B.bats === 'L' ? -0.08 : 0) + 90 / runSpd(B);
    const lead = [10, 14, 12];
    const rArr = i => 0.25 + (90 - lead[i]) / runSpd(this.bases[i]);
    const occ = this.bases.map(Boolean);
    const forced = [occ[0], occ[0] && occ[1], occ[0] && occ[1] && occ[2]];
    const where = POS_CN[fe.pos];
    const outs0 = this.outs;

    const cover = b => {
      if (b === 1) {
        if (fe.pos === '1B') { if (dist(Fp, BASE[1]) < 30) return { p: f, self: true }; const P = F.P; return { p: P, arrive: 0.5 + dist(POS_XY.P, BASE[1]) / runSpd(P) }; }
        const p = F['1B']; return { p, arrive: reactT(p) + dist(POS_XY['1B'], BASE[1]) / runSpd(p) };
      }
      if (b === 2) {
        if ((fe.pos === 'SS' || fe.pos === '2B') && dist(Fp, BASE[2]) < 18) return { p: f, self: true };
        let pos = Fp.x > 0 ? 'SS' : '2B'; if (pos === fe.pos) pos = pos === 'SS' ? '2B' : 'SS';
        const p = F[pos]; return { p, arrive: reactT(p) + dist(POS_XY[pos], BASE[2]) / runSpd(p) };
      }
      if (b === 3) {
        if (fe.pos === '3B') { if (dist(Fp, BASE[3]) < 18) return { p: f, self: true }; const p = F.SS; return { p, arrive: reactT(p) + dist(POS_XY.SS, BASE[3]) / runSpd(p) }; }
        const p = F['3B']; return { p, arrive: reactT(p) + dist(POS_XY['3B'], BASE[3]) / runSpd(p) };
      }
      if (fe.pos === 'C') return { p: f, self: true };
      return { p: F.C, arrive: 0.1 };
    };
    const thrArr = b => { const cv = cover(b); if (cv.self) return tF + dist(Fp, BASE[b]) / runSpd(f); return Math.max(tF + xferT(f) + dist(Fp, BASE[b]) / throwSpd(f), cv.arrive); };
    const runAt = b => b === 1 ? bTime : rArr(b - 2);

    // 失誤
    if (R() < 0.02 * (1.6 - f.r.defense / 100)) {
      def.E++;
      tl.t(T(tF), '失誤!', Fp, C_BAD, 1.2);
      this.L.push({ cls: 'err', s: `${B.name} 擊出${where}方向滾地球，${f.name} 處理失誤，打者上到一壘` });
      B.g.AB++;
      tl.m(B.id, T(0.7), T(bTime), BASE[1]);
      for (let i = 2; i >= 0; i--) {
        const r = this.bases[i]; if (!r) continue;
        const ta = T(rArr(i));
        tl.m(r.id, T(0.25), ta, BASE[i + 2]); this.bases[i] = null;
        if (i === 2) this.scoreRun(r, null, ta, tl, true); else this.bases[i + 1] = r;
      }
      this.bases[0] = B; B._unearned = true;
      return;
    }

    let target = 1;
    const margin = b => runAt(b) - thrArr(b);
    if (outs0 < 2) {
      if (forced[2] && (['P', 'C', '1B', '3B'].includes(fe.pos) || Fp.y < 95) && margin(4) > 0.1) target = 4;
      else if (forced[0] && margin(2) > 0.15) target = 2;
      else if (forced[1] && fe.pos === '3B' && dist(Fp, BASE[3]) < 20 && margin(3) > 0.1) target = 3;
    } else {
      let bm = margin(1);
      for (const b of [2, 3, 4]) if (forced[b - 2] && margin(b) > bm + 0.2) { bm = margin(b); target = b; }
    }
    // 動畫：補位、傳球
    const cv = cover(target);
    const thrA = thrArr(target);
    if (!cv.self) {
      tl.m(cv.p.id, T(0.3), T(Math.min(cv.arrive, thrA - 0.05)), BASE[target]);
      tl.b(T(tF + xferT(f)), T(thrA), Fp, BASE[target], 5, 5, 3);
    } else tl.m(f.id, T(tF), T(thrA), BASE[target]);
    if (target !== 1) { const c1 = cover(1); if (!c1.self) tl.m(c1.p.id, T(0.3), T(1.4), BASE[1]); }
    // 跑者跑壘
    tl.m(B.id, T(0.7), T(bTime), P2(BASE[1].x + 4, BASE[1].y - 4));
    for (let i = 0; i < 3; i++) if (this.bases[i] && forced[i]) tl.m(this.bases[i].id, T(0.25), T(rArr(i)), BASE[i + 2]);

    const throwErr = R() < 0.006 * (1.6 - f.r.arm / 100);
    const roll = x => x + gauss() * 0.12;
    const runs = [];
    const nb = [null, null, null];
    const toBase = (r, i) => { if (i >= 3) runs.push(r); else nb[i] = r; };

    if (throwErr) {
      def.E++;
      tl.t(T(thrA), '暴傳!', BASE[target], C_BAD, 1.2);
      this.L.push({ cls: 'err', s: `${B.name} 擊出${where}方向滾地球，${f.name} 傳球失誤，全員推進` });
      B.g.AB++;
      for (let i = 2; i >= 0; i--) if (this.bases[i]) toBase(this.bases[i], i + 2);
      toBase(B, 1); B._unearned = true;
      this.bases = nb;
      for (const r of runs) this.scoreRun(r, null, T(bTime + 1), tl, true);
      return;
    }

    const outAt = roll(runAt(target) - thrA) > 0;
    B.g.AB++;
    let outsMade = 0, dp = false, hit = false, isForceOut = true;
    if (target === 1) {
      if (outAt) {
        outsMade = 1;
        tl.t(T(thrA), '刺殺', BASE[1], '#ffffff', 1);
        this.L.push({ s: `${B.name} 擊出${where}方向滾地球，${f.name} ${cv.self ? '自己踩壘' : '傳一壘'}刺殺出局` });
      } else {
        hit = true;
        tl.t(T(bTime), '內野安打!', BASE[1], C_GOOD, 1.1);
        this.L.push({ cls: 'hit', s: `${B.name} 擊出${where}方向滾地球，跑出內野安打！` });
        toBase(B, 0);
      }
      for (let i = 2; i >= 0; i--) {
        const r = this.bases[i]; if (!r) continue;
        if (forced[i]) toBase(r, i + 1);
        else if (i === 1 && !nb[2] && (Fp.x > 0 || R() < 0.3) && (outAt || Fp.x > 0)) { tl.m(r.id, T(0.4), T(0.4 + 90 / runSpd(r)), BASE[3]); toBase(r, 2); }
        else if (i === 2 && outAt && outs0 < 2 && R() < (Fp.y > 95 ? 0.7 : 0.25) * (0.6 + r.r.speed / 125)) { tl.m(r.id, T(0.4), T(0.4 + 90 / runSpd(r)), BASE[4]); toBase(r, 3); }
        else toBase(r, i);
      }
    } else {
      const ri = target - 2, runner = this.bases[ri];
      if (outAt) {
        outsMade = 1;
        tl.t(T(thrA), '封殺', BASE[target], '#ffffff', 1);
        // 雙殺
        if (outs0 + 1 < 3) {
          const piv = cv.p, c1 = cover(1);
          const relay = Math.max(thrA + xferT(piv) * 0.9 + dist(BASE[target], BASE[1]) / throwSpd(piv), c1.self ? 0 : c1.arrive);
          tl.b(T(thrA + xferT(piv) * 0.9), T(relay), BASE[target], BASE[1], 5, 5, 3);
          if (roll(bTime - relay) > 0) { dp = true; outsMade = 2; tl.t(T(relay), '雙殺!!', BASE[1], C_BAD, 1.4); }
        }
        this.L.push({ s: `${B.name} 擊出${where}方向滾地球，${dp ? `形成${target === 4 ? '本壘' : target + '壘'}－一壘雙殺！` : `${runner.name} 在${target === 4 ? '本壘' : target + '壘'}被封殺，打者上到一壘（野手選擇）`}` });
        if (!dp) toBase(B, 0);
      } else {
        tl.t(T(runAt(target)), '安全上壘', BASE[target], C_GOOD, 0.9);
        this.L.push({ s: `${B.name} 擊出${where}方向滾地球，野手選擇傳${target === 4 ? '本壘' : target + '壘'}不及，全員安全上壘` });
        toBase(B, 0);
        toBase(runner, ri + 1);
      }
      for (let i = 2; i >= 0; i--) {
        const r = this.bases[i]; if (!r || i === ri) continue;
        if (forced[i]) toBase(r, i + 1);
        else if (i === 2 && outs0 < 2 && R() < 0.4) { tl.m(r.id, T(0.4), T(0.4 + 90 / runSpd(r)), BASE[4]); toBase(r, 3); }
        else toBase(r, i);
      }
    }
    if (hit) { B.g.H++; this.off().H++; def.pitcher.g.pH++; }
    this.bases = nb;
    this.addOut(outsMade);
    if (this.outs < 3) {
      for (const r of runs) {
        this.scoreRun(r, dp ? null : B, T(2.8), tl);
        this.L.push({ s: `　→ ${r.name} 跑回本壘得分` });
      }
    } else void isForceOut;
  }

  runOnHit(c, h) {
    const { tl, B, T } = c;
    const outs0 = this.outs;
    const f = h.f;
    const lead = [0, 10, 14, 12];
    const list = [];
    for (let b = 2; b >= 0; b--) if (this.bases[b]) list.push({ p: this.bases[b], from: b + 1 });
    list.push({ p: B, from: 0, batter: true });
    const occ = [true, !!this.bases[0], !!this.bases[1], !!this.bases[2]];
    const forcedFrom = b => { for (let i = 0; i < b; i++) if (!occ[i]) return false; return true; };
    const delay = r => r.batter ? 1.1 : (outs0 === 2 ? 0.15 : h.kind === 'fly' ? Math.max(0.3, h.hang * 0.55) : h.kind === 'liner' ? 0.55 : 0.25);
    const arr = (r, k) => delay(r) + (90 * (k - r.from) - (r.batter ? 0 : lead[r.from])) / runSpd(r.p) + 0.3 * Math.max(0, k - r.from - 1);
    const thr = k => { const d = dist(h.pt, BASE[k]); return h.tR + xferT(f) + (OF.has(h.pos) ? 0.4 : 0) + d / throwSpd(f) * 1.1 + (d > 180 ? 0.6 : 0); };
    let prevK = 5;
    for (const r of list) {
      const minK = r.batter ? 1 : (forcedFrom(r.from) ? r.from + 1 : r.from);
      let maxK = r.batter ? 3 : 4;
      if (prevK <= 4) maxK = Math.min(maxK, prevK === 4 ? 4 : prevK - 1);
      let k = minK;
      for (let kk = minK + 1; kk <= maxK; kk++) {
        const m = thr(kk) - arr(r, kk), need = (r.batter ? 0 : 0.3) + (r.p.r.speed < 40 ? 0.15 : 0) + gauss() * 0.12;
        if (m > need) k = kk; else break;
      }
      if (r.batter && k === 3 && prevK >= 4 && thr(4) - arr(r, 4) > 1.0) k = 4;
      r.k = k; r.minK = minK; r.m = thr(k) - arr(r, k) + gauss() * 0.22; r.t = arr(r, k);
      prevK = k;
    }
    // 防守選擇傳向最有機會的壘
    let tgt = null;
    for (const r of list) if (r.k > r.minK && (!tgt || r.m < tgt.m)) tgt = r;
    const throwTo = tgt ? tgt.k : Math.min(2, list[list.length - 1].k + 1);
    const tThrow = thr(throwTo);
    tl.b(T(h.tR + xferT(f)), T(tThrow), h.pt, BASE[throwTo], 6, 4, Math.min(30, dist(h.pt, BASE[throwTo]) / 10));
    // 補位
    const F = c.F;
    tl.m(F.SS.id, T(0.5), T(2.2), P2(BASE[2].x - 4, BASE[2].y + 3));
    tl.m(F['1B'].id, T(0.5), T(2.0), P2(BASE[1].x + 2, BASE[1].y + 6));
    tl.m(F['3B'].id, T(0.5), T(2.2), P2(BASE[3].x - 2, BASE[3].y + 6));

    let outRunner = null;
    if (tgt && tgt.m < 0) outRunner = tgt;
    const nb = [null, null, null];
    const scored = [];
    const tOut = T(tThrow);
    for (const r of list) {
      const pts = runnerPath(r.from, r.k);
      if (r.batter && !pts.length) continue;
      if (r === outRunner) {
        const last = pts.pop(); pts.push(P2(last.x * 0.9 + BASE[r.k - 1].x * 0.1, last.y * 0.9 + BASE[r.k - 1].y * 0.1));
      }
      if (pts.length) tl.path(r.p.id, T(delay(r)), pts, (90 * (r.k - r.from)) / Math.max(0.5, r.t - delay(r)) * (pts.length > 0 ? 1 : 1));
      if (r === outRunner) continue;
      if (r.k >= 4) scored.push(r); else nb[r.k - 1] = r.p;
    }
    let bk = list[list.length - 1].k;
    const batterOut = outRunner && outRunner.batter;
    const hitBases = batterOut ? bk - 1 : bk;
    const names = ['', '一壘安打', '二壘安打', '三壘安打', '場內全壘打'];
    const OFF = this.off(), P = this.def().pitcher;
    B.g.AB++;
    if (!h.err) {
      B.g.H++; OFF.H++; P.g.pH++;
      if (hitBases === 2) B.g.D++; else if (hitBases === 3) B.g.T++; else if (hitBases === 4) B.g.HR++;
      tl.t(T(Math.min(h.tR, 2.5)), names[hitBases] + (hitBases >= 2 ? '!' : ''), P2(h.pt.x, h.pt.y + 12), hitBases >= 3 ? C_GOLD : C_GOOD, hitBases >= 2 ? 1.3 : 1.1);
      this.L.push({ cls: 'hit', s: `${B.name} 擊出${h.desc}${names[hitBases]}` });
    } else B._unearned = true;
    this.bases = nb;
    if (outRunner) {
      this.addOut();
      tl.t(tOut, outRunner.k === 4 ? '本壘觸殺!' : '觸殺出局', BASE[outRunner.k], C_BAD, 1.2);
      this.L.push({ s: `　→ ${outRunner.p.name} 衝${outRunner.k === 4 ? '本壘' : outRunner.k + '壘'}被觸殺出局` });
    }
    for (const r of scored) {
      const tScore = T(r.t);
      if (this.outs >= 3 && tScore > tOut) continue;
      this.scoreRun(r.p, h.err ? null : B, tScore, tl, h.err);
      this.L.push({ s: `　→ ${r.p.name} 跑回本壘得分` });
    }
  }
}

const api = { Game, makeTeam, makeMatch, addStars, STARS, TEAMS, CITIES, POS_XY, BASE, FIELD, OF, POS_CN, POS_SHORT, fence, newStats };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.BB = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
