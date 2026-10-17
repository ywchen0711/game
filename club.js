// 養成模式：建立自己的球隊、抽卡包、升級升星、排陣容，在聯盟裡一路升級到傳奇聯盟。
// 存檔放在 localStorage（雲端同步用大廳共用的 /save.js）。
(function () {
'use strict';
const { RARITY, ORDER, POOL, BY_CID, PACKS, PITY, openPack, stats, ovr, gainXp, xpNeed, addCard, ensureSkills, rerolls, LV_MAX, STAR_MAX, isPitcher } = CARDS;
const SK = SKILLS.BY_ID, GR = SKILLS.GRADE;
const { TRAITS, traitDesc, canPlay } = CARDS, { SLOT, COACH, BOXES, RCOL } = ITEMS;
const EXS = POOL.filter((c) => c.rarity === 'EX');
const { makeTeam, TEAMS, CITIES, newStats, POS_CN, POS_SHORT } = BB;
const $ = (s) => document.querySelector(s), esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const KEY = 'pbb.club.v1', GAME = 'pixel-baseball';
const DIVS = [
  { name: '業餘聯盟', ovr: 44, coin: 1 }, { name: '二軍聯盟', ovr: 53, coin: 1.5 }, { name: '職業聯盟', ovr: 62, coin: 2 },
  { name: '明星聯盟', ovr: 71, coin: 2.6 }, { name: '傳奇聯盟', ovr: 80, coin: 3.2 }];
const FPOS = ['C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF', 'DH'];
const PS = { C: '捕手', '1B': '一壘', '2B': '二壘', SS: '游擊', '3B': '三壘', LF: '左外', CF: '中外', RF: '右外', DH: 'DH', SP: '先發', RP: '中繼', CL: '終結' };
const COLORS = [
  { name: '藍鷹', hat: '#2346a8', shirt: '#f4f4f4', trim: '#2f5fd0', pants: '#d8dce8', bar: '#4a86f5' },
  { name: '赤獅', hat: '#a81e18', shirt: '#e0442a', trim: '#ffd38a', pants: '#f0e8e0', bar: '#f05a4a' },
  { name: '翠龍', hat: '#1d6a34', shirt: '#eef0e0', trim: '#2aa050', pants: '#dfe6d8', bar: '#3cc070' },
  { name: '金虎', hat: '#1a1a1a', shirt: '#f2b632', trim: '#1a1a1a', pants: '#e8e2d0', bar: '#f2c040' },
  { name: '紫電', hat: '#4a2286', shirt: '#9a6ad8', trim: '#f0e0ff', pants: '#e8e0f4', bar: '#b07af0' },
  { name: '黑熊', hat: '#1c1c1c', shirt: '#3c3c3c', trim: '#e0e0e0', pants: '#c8c8c8', bar: '#d0d0d0' },
  { name: '海豚', hat: '#0a7a8a', shirt: '#f4f8f8', trim: '#ff8a3a', pants: '#e0eef0', bar: '#2ac0d0' },
  { name: '櫻花', hat: '#c83a7a', shirt: '#fff0f6', trim: '#c83a7a', pants: '#f4e8ee', bar: '#ff7ab8' },
];

// ---------------------------------------------------------------- save
let S = null;
function load() { try { const d = JSON.parse(localStorage.getItem(KEY)); return d && d.v === 1 ? d : null; } catch (e) { return null; } }
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ }
  if (cloud) try { cloud.touch(GAME, KEY); } catch (e) { /* ignore */ }
}
let cloud = null;
async function cloudInit() {
  try { cloud = await import('/save.js'); if (await cloud.pull(GAME, KEY)) { S = load(); migrate(); render(); } setCloud('☁ 已同步'); }
  catch (e) { cloud = null; setCloud('本機存檔'); }
}
function setCloud(t) { const e = $('#cloud'); if (e) e.textContent = t; }
addEventListener('cloudsave', (e) => setCloud(e.detail.state === 'synced' ? '☁ 已同步' : e.detail.state === 'offline' ? '☁ 離線' : '☁ ' + e.detail.state));

// saves from before the hidden tier: the four Chen-family UR cards (cid 205-208) become the hidden EX cards; everyone gets skills
function migrate() {
  if (!S) return;
  if (!S.m2) {
    const old = { 205: 'Josh Chen', 206: 'Jasper Chen', 207: 'Jeff Chen', 208: 'Erin Lai' };
    for (const i of S.cards) if (old[i.cid] && i.sk == null) { const c = EXS.find((x) => x.name === old[i.cid]); delete S.dex[i.cid]; i.cid = c.cid; S.dex[c.cid] = 1; }
    S.m2 = 1;
  }
  ensureSkills(S);
  S.inv = S.inv || {}; S.gear = S.gear || []; S.coaches = S.coaches || []; S.staff = S.staff || {}; S.nextItem = S.nextItem || 1;
  if (S.tickets) { S.inv.premium = (S.inv.premium || 0) + S.tickets; S.tickets = 0; }
}
// a brand-new club: a rookie squad of N cards covering every position, plus starting coins
function newClub(name, colorIdx) {
  S = { v: 1, m2: 1, inv: {}, gear: [], coaches: [], staff: {}, nextItem: 1, coins: 2000, nextUid: 1, cards: [], dex: {}, pity: 0, lastFree: '', name: name || '我的球隊', color: colorIdx || 0,
    lineup: null, rotation: 0, league: null, history: [], packs: 0 };
  const N = POOL.filter((c) => c.rarity === 'N'), take = (pred, n) => { const out = []; for (const c of N) { if (out.length >= n) break; if (pred(c) && !S.cards.some((i) => i.cid === c.cid)) out.push(c); } return out; };
  const need = [['C', 2], ['1B', 1], ['2B', 1], ['SS', 1], ['3B', 1], ['LF', 1], ['CF', 1], ['RF', 1], ['SP', 5], ['RP', 6], ['CL', 1]];
  for (const [pos, n] of need) for (const c of take((x) => x.pos === pos, n)) addCard(S, c);
  for (const c of take((x) => x.role === 'H', 4)) addCard(S, c);                     // a few extra hitters for the bench
  autoLineup(); newSeason(0);
  save();
}

// ---------------------------------------------------------------- lineup
const card = (inst) => BY_CID[inst.cid];
const instOf = (uid) => S.cards.find((i) => i.uid === uid);
// equipment worn by one player + the coaching staff, added on top of the card's own ratings
const staffCoaches = () => Object.values(S.staff || {}).map((id) => (S.coaches || []).find((c) => c.id === id)).filter(Boolean);
const gearOn = (uid) => (S.gear || []).filter((g) => g.on === uid);
function bon(inst) { if (!S || inst.uid == null) return null; return ITEMS.bonus(isPitcher(inst) ? 'P' : 'H', gearOn(inst.uid), staffCoaches()); }
const fs = (inst) => stats(inst, bon(inst)), fo = (inst) => ovr(inst, bon(inst));
const hitters = () => S.cards.filter((i) => !isPitcher(i)), pitchers = () => S.cards.filter((i) => isPitcher(i));
// the defensive value of a hitter at a position (out of position plays worse)
// how much a hitter is worth at a position: bat + glove (weighted by how demanding the spot is); out of position is a last resort
const POS_ORDER = ['C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF', 'SP', 'RP', 'CL'];
const posRank = (i) => POS_ORDER.indexOf(card(i).pos);
const hitVal = (r) => r.contact * 0.35 + r.power * 0.35 + r.eye * 0.15 + r.speed * 0.15;
const DEFW = { C: 0.5, SS: 0.45, CF: 0.4, '2B': 0.35, '3B': 0.3, RF: 0.25, LF: 0.2, '1B': 0.12 };
function slotValue(inst, pos, r = fs(inst)) { if (pos === 'DH') return hitVal(r); return hitVal(r) + (r.defense * 0.7 + r.arm * 0.3) * DEFW[pos] - (canPlay(card(inst), pos) ? 0 : 60); }
// Hungarian algorithm (min cost, rows <= cols): the best way to fill all nine spots at once
function hungarian(cost) {
  const n = cost.length, m = cost[0].length, INF = 1e18, u = Array(n + 1).fill(0), v = Array(m + 1).fill(0), p = Array(m + 1).fill(0), way = Array(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i; let j0 = 0; const minv = Array(m + 1).fill(INF), used = Array(m + 1).fill(false);
    do {
      used[j0] = true; const i0 = p[j0]; let delta = INF, j1 = 0;
      for (let j = 1; j <= m; j++) if (!used[j]) {
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= m; j++) if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const ans = Array(n).fill(-1); for (let j = 1; j <= m; j++) if (p[j]) ans[p[j] - 1] = j - 1; return ans;
}
function autoLineup() {
  const H = hitters().slice(), used = new Set(), field = {}, R = new Map(H.map((i) => [i.uid, fs(i)]));
  const m = Math.max(H.length, FPOS.length);
  const cost = FPOS.map((pos) => Array.from({ length: m }, (_, j) => j < H.length ? -slotValue(H[j], pos, R.get(H[j].uid)) : 1e6));
  hungarian(cost).forEach((j, k) => { if (j >= 0 && j < H.length) { field[FPOS[k]] = H[j].uid; used.add(H[j].uid); } });
  const nine = FPOS.filter((p) => field[p] != null).map((pos) => ({ uid: field[pos], pos }));
  // batting order: speed and contact up top, power in the middle
  const score = (o, f) => f(fs(instOf(o.uid)));
  const pickBy = (f) => { nine.sort((a, b) => score(b, f) - score(a, f)); return nine.shift(); };
  const order = [];
  order[0] = pickBy((r) => r.speed * 0.5 + r.contact * 0.6 + r.eye * 0.4);
  order[2] = pickBy((r) => r.contact * 0.7 + r.power * 0.6);
  order[3] = pickBy((r) => r.power);
  order[1] = pickBy((r) => r.contact + r.eye * 0.6);
  order[4] = pickBy((r) => r.power + r.contact * 0.3);
  nine.sort((a, b) => score(b, (r) => r.contact + r.power) - score(a, (r) => r.contact + r.power));
  for (let i = 5; i < 9; i++) order[i] = nine.shift();
  const P = pitchers().slice().sort((a, b) => fo(b) - fo(a));
  const sps = P.filter((i) => card(i).pos === 'SP').concat(P.filter((i) => card(i).pos !== 'SP')).slice(0, 5);
  const rest = P.filter((i) => !sps.includes(i));
  const cl = rest.filter((i) => card(i).pos === 'CL')[0] || rest.filter((i) => card(i).pos === 'RP')[0] || rest[0];
  const rps = rest.filter((i) => i !== cl && card(i).pos !== 'SP').concat(rest.filter((i) => i !== cl && card(i).pos === 'SP')).slice(0, 8);
  // bench: a backup catcher, an infielder and an outfielder first, then the best bats left
  const left = H.filter((i) => !used.has(i.uid)).sort((a, b) => fo(b) - fo(a)), bench = [];
  for (const ok of [(c) => canPlay(c, 'C'), (c) => ['2B', 'SS', '3B'].some((x) => canPlay(c, x)), (c) => ['LF', 'CF', 'RF'].some((x) => canPlay(c, x))]) { const b = left.find((i) => ok(card(i)) && !bench.includes(i)); if (b) bench.push(b); }
  for (const i of left) if (bench.length < 6 && !bench.includes(i)) bench.push(i);
  S.lineup = { order: order.filter(Boolean), bench: bench.map((i) => i.uid), sp: sps.map((i) => i.uid), rp: rps.map((i) => i.uid), cl: cl ? cl.uid : null };
}
function lineupProblems() {
  const L = S.lineup, out = [];
  if (!L || L.order.length < 9) out.push('先發打線不足 9 人');
  const pos = L ? L.order.map((o) => o.pos) : [];
  for (const p of FPOS) if (!pos.includes(p)) out.push(`缺少${POS_CN[p]}`);
  if (!L || L.sp.length < 1) out.push('沒有先發投手');
  if (!L || (!L.rp.length && !L.cl)) out.push('沒有後援投手');
  const all = L ? [...L.order.map((o) => o.uid), ...L.bench, ...L.sp, ...L.rp, L.cl].filter((x) => x != null) : [];
  if (new Set(all).size !== all.length) out.push('有球員重複登錄');
  return out;
}

// ---------------------------------------------------------------- teams for the engine
function numberCards() {
  const used = new Set(S.cards.map((i) => i.num).filter((n) => n != null));
  // jersey numbers 1-99; once a club has more than 99 players numbers repeat (only the game roster needs them unique, see myTeam)
  for (const i of S.cards) if (i.num == null) { let n = card(i).cid % 99 + 1, k = 0; while (used.has(n) && k++ < 99) n = (n % 99) + 1; i.num = n; used.add(n); }
}
function playerOf(inst, pos, team) {
  const c = card(inst), r = fs(inst);
  if (pos && c.role === 'H' && !canPlay(c, pos)) r.defense = Math.max(10, r.defense - 15);   // out of position
  return { id: 100000 + inst.uid, uid: inst.uid, name: c.name, num: inst.num, pos: pos || c.pos, role: c.role, bats: c.bats, throws: c.throws, r,
    velo: c.velo, pitches: c.pitches, star: !!c.legend, rarity: c.rarity, lookSeed: c.look, sk: (inst.sk || []).slice(), team, g: newStats(), s: newStats() };
}
function myTeam() {
  numberCards();
  const col = COLORS[S.color], t = Object.assign({}, col, { name: S.name, full: S.name, city: '', roster: [], rotation: S.rotation, W: 0, L: 0, T: 0, mine: true });
  const L = S.lineup;
  const order = L.order.map((o) => ({ p: playerOf(instOf(o.uid), o.pos, t), pos: o.pos }));
  t.order = order;
  t.roster.push(...order.map((o) => o.p));
  for (const uid of L.bench) t.roster.push(playerOf(instOf(uid), null, t));
  for (const uid of L.sp) { const p = playerOf(instOf(uid), null, t); p.role = 'SP'; p.pos = 'SP'; t.roster.push(p); }
  for (const uid of L.rp) { const p = playerOf(instOf(uid), null, t); p.role = 'RP'; p.pos = 'RP'; t.roster.push(p); }
  if (L.cl != null) { const p = playerOf(instOf(L.cl), null, t); p.role = 'CL'; p.pos = 'CL'; t.roster.push(p); }
  const seen = new Set();                                  // no two players on today's roster wear the same number
  for (const p of t.roster) { if (seen.has(p.num)) { let n = 1; while (seen.has(n)) n++; p.num = n; } seen.add(p.num); }
  return t;
}
// CPU clubs: generated by the engine, then scaled to the division's strength
function cpuTeam(style, city, div) { return cpuTeamAt(style, city, DIVS[div].ovr, div); }
function cpuTeamAt(style, city, target, skillLv) {
  const t = makeTeam(style, city), shift = target - 52;
  for (const p of t.roster) {
    const keys = p.role === 'H' ? ['contact', 'power', 'eye', 'speed', 'defense', 'arm'] : ['fastball', 'breaking', 'control'];
    for (const k of keys) p.r[k] = Math.round(clamp(p.r[k] + shift + (Math.random() - 0.5) * 6, 12, 99));
    if (p.role !== 'H') p.velo = Math.round(138 + p.r.fastball * 0.21);
    p.sk = SKILLS.rollCpu(p.role, skillLv);
  }
  return t;
}
const TKEYS = ['name', 'hat', 'shirt', 'trim', 'pants', 'bar', 'city', 'full', 'rotation'], PKEYS = ['id', 'name', 'num', 'pos', 'role', 'bats', 'throws', 'r', 'velo', 'pitches', 'sk'];
const packTeam = (t) => Object.assign(Object.fromEntries(TKEYS.map((k) => [k, t[k]])), { roster: t.roster.map((p) => Object.fromEntries(PKEYS.map((k) => [k, p[k]]))) });
function unpackTeam(d) { const t = Object.assign({}, d, { roster: [], W: 0, L: 0, T: 0 }); t.roster = d.roster.map((p) => Object.assign({}, p, { team: t, g: newStats(), s: newStats() })); return t; }

// ---------------------------------------------------------------- league
function newSeason(div) {
  const styles = COLORS.filter((_, i) => i !== S.color), pool = styles.slice(), cities = CITIES.slice();
  const take = (a) => a.splice(Math.floor(Math.random() * a.length), 1)[0];
  const cpus = [];
  for (let i = 0; i < 5; i++) { const st = take(pool), city = take(cities); cpus.push(packTeam(cpuTeam(Object.assign({}, st), city, div))); }
  // double round robin for six teams (circle method), home and away swapped in the second half
  const ids = [0, 1, 2, 3, 4, 5], rounds = [];
  for (let r = 0; r < 5; r++) {
    const m = [];
    for (let i = 0; i < 3; i++) { const a = ids[i], b = ids[5 - i]; m.push(r % 2 ? [a, b] : [b, a]); }
    rounds.push(m);
    ids.splice(1, 0, ids.pop());
  }
  const sched = rounds.concat(rounds.map((m) => m.map(([a, b]) => [b, a])));
  S.league = { div, season: (S.league ? S.league.season : 0) + 1, round: 0, cpus, sched, table: [0, 1, 2, 3, 4, 5].map(() => ({ W: 0, L: 0, T: 0, RS: 0, RA: 0 })), recent: [] };
}
const teamName = (i) => (i === 0 ? S.name : S.league.cpus[i - 1].full);
const teamColor = (i) => (i === 0 ? COLORS[S.color].bar : S.league.cpus[i - 1].bar);
function standings() {
  return S.league.table.map((r, i) => ({ i, ...r, pct: r.W + r.L ? r.W / (r.W + r.L) : 0 })).sort((a, b) => b.pct - a.pct || (b.RS - b.RA) - (a.RS - a.RA));
}
function record(i, j, ri, rj) {
  const T = S.league.table;
  T[i].RS += ri; T[i].RA += rj; T[j].RS += rj; T[j].RA += ri;
  if (ri > rj) { T[i].W++; T[j].L++; } else if (rj > ri) { T[j].W++; T[i].L++; } else { T[i].T++; T[j].T++; }
}
const myMatch = () => S.league.sched[S.league.round].find(([a, b]) => a === 0 || b === 0);
// the rest of the round plays out quietly
function simOthers() {
  for (const [a, b] of S.league.sched[S.league.round]) {
    if (a === 0 || b === 0) continue;
    const A = unpackTeam(S.league.cpus[a - 1]), B = unpackTeam(S.league.cpus[b - 1]);
    const res = Match.quick(A, B);
    S.league.cpus[a - 1].rotation = A.rotation; S.league.cpus[b - 1].rotation = B.rotation;
    record(a, b, res.R[0], res.R[1]);
  }
}

// ---------------------------------------------------------------- after a game
function afterGame(res, mine, opp, meHome) {
  const div = DIVS[S.league.div], my = meHome ? 1 : 0, rMe = res.R[my], rOp = res.R[1 - my], win = rMe > rOp, tie = rMe === rOp;
  const [a, b] = myMatch(); record(a, b, res.R[0], res.R[1]);
  const oppIdx = a === 0 ? b : a; S.league.cpus[oppIdx - 1].rotation = opp.rotation;
  S.rotation = mine.rotation;
  const coins = Math.round((win ? 260 : tie ? 160 : 100) * div.coin);
  S.coins += coins;
  const { ups, mvp } = gainFromGame(res, mine, my, win);
  S.league.recent.unshift({ round: S.league.round + 1, opp: teamName(oppIdx), me: rMe, them: rOp, home: meHome });
  simOthers();
  S.league.round++;
  let season = null;
  if (S.league.round >= S.league.sched.length) season = endSeason();
  save();
  return { win, tie, rMe, rOp, coins, ups, mvp, season };
}
// experience: everyone who played, more for good games; the whole squad gets a little
function gainFromGame(res, mine, my, win) {
  const ups = [], ts = res.game.ts[my];
  let mvp = null, best = -1;
  for (const p of mine.roster) {
    const inst = instOf(p.uid); if (!inst) continue;
    const g = p.g, played = ts.entered.has(p.id);
    let xp = 12;
    if (played) xp += p.role === 'H' ? 40 + g.H * 12 + g.HR * 25 + g.RBI * 8 + g.BB * 5 : 20 + g.outs * 6 + g.pSO * 4 + (g.W ? 40 : 0) + (g.S ? 30 : 0);
    if (win) xp *= 1.3;
    xp *= 1 + ITEMS.xpBonus(staffCoaches());                // the head coach speeds up growth
    const n = gainXp(inst, xp); if (n) ups.push({ inst, n });
    inst.st = inst.st || newStats(); for (const k in g) inst.st[k] += g[k];
    const score = p.role === 'H' ? g.H * 2 + g.HR * 4 + g.RBI * 2 + g.R + g.BB : g.outs * 0.5 + g.pSO - g.pR * 2 + (g.W ? 4 : 0) + (g.S ? 3 : 0);
    if (played && score > best) { best = score; mvp = p; }
  }
  return { ups, mvp };
}
function endSeason() {
  const st = standings(), rank = st.findIndex((r) => r.i === 0) + 1, L = S.league, div = DIVS[L.div];
  const prize = Math.round([2500, 1400, 800, 600, 500, 400][rank - 1] * div.coin);
  S.coins += prize;
  let move = 0;
  if (rank <= 2 && L.div < DIVS.length - 1) move = 1; else if (rank === 6 && L.div > 0) move = -1;
  const tickets = rank === 1 ? 1 : 0; if (tickets) S.inv.premium = (S.inv.premium || 0) + 1;
  let ex = null;                                        // 傳奇聯盟冠軍：獲得一位隱藏超級球員（沒有的優先）
  if (rank === 1 && L.div === DIVS.length - 1) { const miss = EXS.filter((c) => !S.dex[c.cid]), from = miss.length ? miss : EXS, c = from[Math.floor(Math.random() * from.length)]; ex = { card: c, res: addCard(S, c) }; }
  S.history.unshift({ season: L.season, div: L.div, rank, W: L.table[0].W, L: L.table[0].L });
  const res = { rank, prize, move, tickets, from: L.div, ex };
  newSeason(clamp(L.div + move, 0, DIVS.length - 1));
  return res;
}

// ---------------------------------------------------------------- screens
let screen = 'home', dexFilter = 'all', plFilter = 'all', plSort = 'ovr', gearFilter = 'all';
const PER = 60, pg = { pl: 0, dex: 0, ln: 0 };
const pager = (n, key) => n <= PER ? '' : `<div class="pager">${Array.from({ length: Math.ceil(n / PER) }, (_, i) => `<button data-pg="${key}:${i}" class="${i === pg[key] ? 'on' : ''}">${i + 1}</button>`).join('')}</div>`;
const page = (list, key) => { pg[key] = Math.min(pg[key], Math.max(0, Math.ceil(list.length / PER) - 1)); return list.slice(pg[key] * PER, pg[key] * PER + PER); };
const bindPager = () => document.querySelectorAll('[data-pg]').forEach((b) => b.onclick = () => { const [k, i] = b.dataset.pg.split(':'); pg[k] = +i; render(); scrollTo(0, 0); });
function nav() {
  const tabs = [['home', '🏟 主場'], ['packs', '🎴 抽卡'], ['lineup', '📋 陣容'], ['players', '🧢 球員'], ['items', '🎒 道具'], ['cup', '🏆 盃賽'], ['dex', '📖 圖鑑']];
  $('#nav').innerHTML = tabs.map(([k, l]) => `<button data-nav="${k}" class="${screen === k ? 'on' : ''}">${l}</button>`).join('') + `<span class="coins">🪙 ${S.coins.toLocaleString()}</span>`;
  $('#nav').querySelectorAll('[data-nav]').forEach((b) => b.onclick = () => { screen = b.dataset.nav; render(); });
}
function render() {
  if (!S) return newClubDialog();
  $('#match').hidden = true; $('#club').hidden = false;
  nav();
  const el = $('#screen');
  el.innerHTML = { home: homeHTML, packs: packsHTML, lineup: lineupHTML, players: playersHTML, items: itemsHTML, cup: cupHTML, dex: dexHTML }[screen]();
  bind[screen] && bind[screen]();
  drawPortraits();
}
// a card face: portrait, rarity frame, name, position, overall, level and stars
function cardHTML(c, inst, opts = {}) {
  const rar = RARITY[c.rarity], o = inst ? fo(inst) : fo({ cid: c.cid, lv: 1, xp: 0, stars: 1 }), hidden = opts.hidden;
  return `<div class="pcard r-${c.rarity} ${hidden ? 'unknown' : ''} ${opts.cls || ''}" ${inst ? `data-uid="${inst.uid}"` : `data-cid="${c.cid}"`} style="--rc:${rar.color};--rg:${rar.glow}">
    <div class="rar">${c.rarity}</div>${!hidden && c.traits && c.traits.length ? `<div class="trt">${c.traits.map((t) => `<span title="${TRAITS[t].name}">${TRAITS[t].icon}</span>`).join('')}</div>` : ''}<canvas class="pf" width="60" height="64" data-port="${c.cid}" data-dark="${hidden ? 1 : 0}"></canvas>
    <div class="pn">${hidden ? (c.rarity === 'EX' ? '隱藏球員' : '？？？') : esc(c.name)}</div>
    <div class="pp"><b>${hidden && c.rarity === 'EX' ? '？？' : PS[c.pos]}</b> ${hidden ? '' : `<span class="ov">${o}</span>`}</div>
    ${inst && inst.sk && inst.sk.length ? `<div class="sks">${inst.sk.map((id) => `<i style="background:${GR[SK[id].grade].color}" title="${SK[id].name}"></i>`).join('')}</div>` : ''}
    ${inst ? `<div class="pl">Lv${inst.lv} ${'★'.repeat(inst.stars)}<i><u style="width:${inst.lv >= LV_MAX ? 100 : inst.xp / xpNeed(inst.lv) * 100}%"></u></i></div>` : ''}
  </div>`;
}
function drawPortraits() {
  const col = COLORS[S.color];
  document.querySelectorAll('canvas[data-port]').forEach((cv) => {
    const c = BY_CID[+cv.dataset.port], g = cv.getContext('2d'), img = Match.sprite({ id: 'c' + c.cid, num: (c.cid % 99) + 1, name: c.name, lookSeed: c.look }, Object.assign({}, col, { name: 'card' + S.color }), c.role === 'H' ? 'bat' : 'windup');
    g.imageSmoothingEnabled = false; g.clearRect(0, 0, cv.width, cv.height);
    if (cv.dataset.dark === '1') { g.filter = 'brightness(0)'; g.globalAlpha = 0.55; }
    g.drawImage(img, 0, 0, img.width * 2, img.height * 2);
    g.filter = 'none'; g.globalAlpha = 1;
  });
  document.querySelectorAll('canvas[data-coach]').forEach((cv) => {
    const c = (S.coaches || []).find((x) => x.id === +cv.dataset.coach); if (!c) return;
    const g = cv.getContext('2d'), img = Match.sprite({ id: 'co' + c.id, num: 0, name: c.name, lookSeed: c.look }, Object.assign({}, col, { name: 'card' + S.color }), 'stand');
    g.imageSmoothingEnabled = false; g.clearRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, img.width * 2, img.height * 2);
  });
}
function teamOvr() { const L = S.lineup; if (!L) return 0; const xs = [...L.order.map((o) => instOf(o.uid)), ...L.sp.map(instOf)].filter(Boolean); return Math.round(xs.reduce((s, i) => s + fo(i), 0) / Math.max(1, xs.length)); }

function homeHTML() {
  const L = S.league, div = DIVS[L.div], m = myMatch(), meHome = m && m[1] === 0, opp = m ? (m[0] === 0 ? m[1] : m[0]) : null, tr = L.table[0];
  const free = S.lastFree !== today(), probs = lineupProblems();
  const st = standings();
  return `<div class="home">
    <section class="panel hero">
      <div class="crest" style="background:${COLORS[S.color].bar}">⚾</div>
      <div><h2>${esc(S.name)}</h2><div class="muted">${div.name}・第 ${L.season} 季・${tr.W} 勝 ${tr.L} 敗${tr.T ? ' ' + tr.T + ' 和' : ''}・球隊戰力 <b>${teamOvr()}</b></div></div>
      <span class="grow"></span>
      ${free ? '<button class="big" id="freePack">🎁 每日免費球員包</button>' : ''}
      ${S.cup && !S.cup.over ? `<button class="big" id="goCup">🏆 ${CUPS[S.cup.k].name}進行中</button>` : ''}
      ${invCount() ? `<button class="big" id="ticket">🎟 未開卡包 ×${invCount()}</button>` : ''}
    </section>
    <div class="cols">
      <section class="panel next">
        <h3>第 ${L.round + 1} / ${L.sched.length} 戰</h3>
        ${opp != null ? `<div class="vs"><span><i style="background:${teamColor(meHome ? opp : 0)}"></i>${esc(teamName(meHome ? opp : 0))}<small>客</small></span><b>VS</b><span><i style="background:${teamColor(meHome ? 0 : opp)}"></i>${esc(teamName(meHome ? 0 : opp))}<small>主</small></span></div>
        <div class="row">${probs.length ? `<p class="bad">⚠ ${probs.join('、')}，請先到「陣容」調整</p>` : '<button class="big" id="watch">▶ 觀看比賽</button><button id="quick">⏭ 快速模擬</button>'}</div>` : ''}
        <h3>最近戰績</h3>
        <ul class="recent">${L.recent.slice(0, 6).map((r) => `<li class="${r.me > r.them ? 'w' : r.me < r.them ? 'l' : ''}">第${r.round}戰 ${r.home ? 'vs' : '@'} ${esc(r.opp)}　<b>${r.me} : ${r.them}</b> ${r.me > r.them ? '勝' : r.me < r.them ? '敗' : '和'}</li>`).join('') || '<li class="muted">開季還沒有比賽</li>'}</ul>
      </section>
      <section class="panel">
        <h3>${div.name} 戰績表 <small class="muted">前 2 名升級・最後 1 名降級</small></h3>
        <table class="box"><tr><th>#</th><th>球隊</th><th>勝</th><th>敗</th><th>和</th><th>勝率</th><th>得失分</th></tr>
        ${st.map((r, k) => `<tr class="${r.i === 0 ? 'on' : ''}"><td>${k + 1}</td><td><span class="chip" style="background:${teamColor(r.i)}"></span>${esc(teamName(r.i))}</td><td>${r.W}</td><td>${r.L}</td><td>${r.T}</td><td>${r.pct.toFixed(3).replace(/^0/, '')}</td><td>${r.RS - r.RA > 0 ? '+' : ''}${r.RS - r.RA}</td></tr>`).join('')}</table>
        ${S.history.length ? `<h3>歷屆成績</h3><ul class="recent">${S.history.slice(0, 5).map((h) => `<li>第 ${h.season} 季 ${DIVS[h.div].name}：第 ${h.rank} 名（${h.W}勝${h.L}敗）</li>`).join('')}</ul>` : ''}
      </section>
    </div>
  </div>`;
}
const today = () => new Date().toISOString().slice(0, 10);
const anyPack = (k) => PACKS[k] || BOXES[k];
const invCount = () => Object.values(S.inv || {}).reduce((a, b) => a + b, 0);
const oddsHTML = (p) => ORDER.filter((r) => p.odds[r]).map((r) => `<span class="r-${r}">${r === 'EX' ? '隱藏' : r} ${p.odds[r]}%</span>`).join(' ');
function packsHTML() {
  const inv = Object.entries(S.inv || {}).filter(([, n]) => n > 0);
  return (inv.length ? `<section class="panel"><h3>🎟 我的卡包 <small class="muted">盃賽與聯盟冠軍的獎品</small></h3><div class="packs">${inv.map(([k, n]) => `<div class="pack pk-${k}"><div class="pkart">🎁</div><h4>${anyPack(k).name} ×${n}</h4><p>${anyPack(k).desc}</p><p class="odds">${oddsHTML(anyPack(k))}</p>
      <button class="big" data-inv="${k}">開啟</button></div>`).join('')}</div></section>` : '') + `<section class="panel"><h3>抽卡 <small class="muted">重複的球員會升星（最高 ${STAR_MAX}★），滿星後轉成經驗值。再抽 ${PITY - (S.pity || 0)} 包內必出 SSR 以上。每張卡都會隨機獲得技能，3★、5★ 再學一個。傳說中還有 4 位隱藏超級球員⋯⋯</small></h3>
    <div class="packs">${Object.entries(PACKS).filter(([, p]) => !p.reward).map(([k, p]) => `<div class="pack pk-${k}"><div class="pkart">🎴</div><h4>${p.name}</h4><p>${p.desc}</p>
      <p class="odds">${oddsHTML(p)}</p>
      <button class="big" data-buy="${k}" ${S.coins < p.cost ? 'disabled' : ''}>🪙 ${p.cost.toLocaleString()}</button></div>`).join('')}</div></section>
    <section class="panel"><h3>🎒 裝備與教練 <small class="muted">裝備穿在單一球員身上；教練放進教練團，加成全隊。能力數值都是隨機的。</small></h3>
    <div class="packs">${Object.entries(BOXES).filter(([, b]) => !b.reward).map(([k, b]) => `<div class="pack"><div class="pkart">${b.type === 'gear' ? '🧰' : '📜'}</div><h4>${b.name}</h4><p>${b.desc}</p><p class="odds">${oddsHTML(b)}</p>
      <button class="big" data-box="${k}" ${S.coins < b.cost ? 'disabled' : ''}>🪙 ${b.cost.toLocaleString()}</button></div>`).join('')}</div></section>`;
}
// ---------------------------------------------------------------- equipment and coaches
function itemsHTML() {
  const cs = S.coaches, staff = S.staff, onStaff = new Set(Object.values(staff));
  const coachCard = (c) => `<div class="coach" style="--rc:${RCOL[c.rar]}"><canvas class="pf" width="60" height="64" data-coach="${c.id}"></canvas><div><b>${esc(c.name)}</b> <small class="rc">${c.rar}</small><div class="muted">${COACH[c.kind].icon} ${COACH[c.kind].name}</div><div class="cd">${ITEMS.coachDesc(c)}</div></div></div>`;
  const gear = S.gear.filter((g) => gearFilter === 'all' || g.slot === gearFilter).sort((a, b) => ITEMS.RAR.indexOf(b.rar) - ITEMS.RAR.indexOf(a.rar));
  return `<section class="panel"><h3>👔 教練團 <small class="muted">每個職位放一位教練，效果套用到全隊。教練合約可在「抽卡」購買，盃賽也會送名教練。</small></h3>
    <div class="staff">${Object.keys(COACH).map((kind) => { const cur = cs.find((c) => c.id === staff[kind]); return `<div class="staffslot"><h4>${COACH[kind].icon} ${COACH[kind].name}</h4>${cur ? coachCard(cur) : '<p class="muted">空缺</p>'}
      <select data-staff="${kind}"><option value="">（空缺）</option>${cs.filter((c) => c.kind === kind).map((c) => `<option value="${c.id}" ${c.id === staff[kind] ? 'selected' : ''}>${c.rar} ${esc(c.name)}</option>`).join('')}</select></div>`; }).join('')}</div>
    ${cs.some((c) => !onStaff.has(c.id)) ? `<h4>候補教練</h4><div class="coaches">${cs.filter((c) => !onStaff.has(c.id)).map((c) => `<div>${coachCard(c)}<button data-sellc="${c.id}">解約（🪙${ITEMS.SELL_C[c.rar]}）</button></div>`).join('')}</div>` : ''}</section>
    <section class="panel"><div class="bar"><h3>🎒 裝備 <small class="muted">${S.gear.length} 件・到球員資料裡穿上</small></h3><span class="grow"></span>
      ${[['all', '全部'], ...Object.entries(SLOT).map(([k, d]) => [k, d.icon + ' ' + d.name])].map(([k, l]) => `<button data-gf="${k}" class="${gearFilter === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    ${gear.length ? `<table class="box gear">${gear.map((g) => { const who = g.on != null && instOf(g.on); return `<tr><td>${SLOT[g.slot].icon}</td><td><b style="color:${RCOL[g.rar]}">${g.rar}</b></td><td>${g.name}</td><td>${ITEMS.gearDesc(g)}</td><td>${who ? '🧢 ' + esc(card(who).name) : '<span class="muted">未裝備</span>'}</td><td><button data-sellg="${g.id}">賣出（🪙${ITEMS.SELL_G[g.rar]}）</button></td></tr>`; }).join('')}</table>` : '<p class="muted">還沒有裝備。到「抽卡」買裝備箱，或打盃賽贏高級裝備箱。</p>'}</section>`;
}
function openBoxDlg(k) {
  const b = BOXES[k], got = ITEMS.openBox(k);
  for (const x of got) { x.id = S.nextItem++; if (b.type === 'gear') { x.on = null; S.gear.push(x); } else S.coaches.push(x); }
  save(); nav();
  const m = modal(`<h2>${b.name}</h2><div class="loot">${got.map((x) => b.type === 'gear'
    ? `<div class="lootc" style="--rc:${RCOL[x.rar]}"><div class="ic">${SLOT[x.slot].icon}</div><b>${x.name}</b><small class="rc">${x.rar}・${SLOT[x.slot].name}</small><p>${ITEMS.gearDesc(x)}</p></div>`
    : `<div class="lootc" style="--rc:${RCOL[x.rar]}"><canvas class="pf" width="60" height="64" data-coach="${x.id}"></canvas><b>${esc(x.name)}</b><small class="rc">${x.rar}・${COACH[x.kind].icon} ${COACH[x.kind].name}</small><p>${ITEMS.coachDesc(x)}</p></div>`).join('')}</div>
    <div class="row"><button class="big" id="done">好！</button></div>`, 'wide');
  drawPortraits();
  m.querySelector('#done').onclick = () => { closeModal(); render(); };
}
// where a player sits in the lineup right now
function whereMap() {
  const L = S.lineup, w = {};
  L.order.forEach((o, k) => { w[o.uid] = `第${k + 1}棒・${PS[o.pos]}`; });
  L.bench.forEach((u) => { w[u] = '板凳'; }); L.sp.forEach((u, k) => { w[u] = `先發${k + 1}`; }); L.rp.forEach((u) => { w[u] = '牛棚'; }); if (L.cl != null) w[L.cl] = '終結者';
  return w;
}
const fitBadge = (c, pos) => pos === 'DH' ? '<span class="fit dh">DH</span>' : c.pos === pos ? '<span class="fit nat">✔ 本職</span>' : canPlay(c, pos) ? '<span class="fit alt">🔄 可守</span>' : '<span class="fit bad" title="非本職：守備 -15">⚠ 非本職</span>';
const posTag = (c) => `${PS[c.pos]}${c.alt && c.alt.length ? `<small>/${c.alt.map((x) => PS[x]).join('/')}</small>` : ''}`;
let lnSort = 'pos', lnFilter = 'all';
function lineupHTML() {
  const L = S.lineup, probs = lineupProblems(), H = hitters(), P = pitchers(), W = whereMap(), R = new Map(S.cards.map((i) => [i.uid, fs(i)]));
  const lbl = (i) => `${card(i).name}｜${PS[card(i).pos]}${card(i).alt && card(i).alt.length ? '+' : ''} ${fo(i)}${W[i.uid] ? `（${W[i.uid]}）` : ''}`;
  const o = (sel) => (i) => `<option value="${i.uid}" ${i.uid === sel ? 'selected' : ''}>${esc(lbl(i))}</option>`;
  // hitters for a spot: the ones who can play it first (best fit on top), then everyone else by position
  const hOpt = (sel, pos, none) => {
    const fit = pos ? H.filter((i) => canPlay(card(i), pos)).sort((a, b) => slotValue(b, pos, R.get(b.uid)) - slotValue(a, pos, R.get(a.uid))) : [];
    const rest = H.filter((i) => !fit.includes(i)).sort((a, b) => posRank(a) - posRank(b) || fo(b) - fo(a));
    return (none ? '<option value="">（無）</option>' : '') + (fit.length ? `<optgroup label="${pos === 'DH' ? '指定打擊（依打擊能力）' : '可守' + PS[pos]}">${fit.map(o(sel)).join('')}</optgroup>` : '') + (rest.length ? `<optgroup label="${pos ? '其他野手' : '野手（依位置）'}">${rest.map(o(sel)).join('')}</optgroup>` : '');
  };
  const pOpt = (sel, role, none) => {
    const roles = [role, ...['SP', 'RP', 'CL'].filter((x) => x !== role)];
    return (none ? '<option value="">（無）</option>' : '') + roles.map((ro) => { const g = P.filter((i) => card(i).pos === ro).sort((a, b) => fo(b) - fo(a)); return g.length ? `<optgroup label="${PS[ro]}">${g.map(o(sel)).join('')}</optgroup>` : ''; }).join('');
  };
  const posOpt = (sel) => FPOS.map((x) => `<option ${x === sel ? 'selected' : ''} value="${x}">${PS[x]}</option>`).join('');
  const mini = (i) => { const r = R.get(i.uid); return isPitcher(i) ? `<span class="mini">速${r.fastball} 變${r.breaking} 控${r.control} 體${r.stamina}</span>` : `<span class="mini">打${r.contact} 力${r.power} 速${r.speed} 守${r.defense}</span>`; };
  const prow = (k, kind, sel, role) => { const i = sel != null ? instOf(sel) : null; return `<tr><td>${k + 1}</td><td><select data-${kind}="${k}">${pOpt(sel, role, true)}</select></td><td>${i ? mini(i) : ''}</td></tr>`; };
  // the roster table: every player, sortable, with a one-click "put him here"
  let list = lnFilter === 'H' ? H.slice() : lnFilter === 'P' ? P.slice() : S.cards.slice();
  list.sort(lnSort === 'pos' ? (a, b) => posRank(a) - posRank(b) || fo(b) - fo(a) : lnSort === 'ovr' ? (a, b) => fo(b) - fo(a) : lnSort === 'lv' ? (a, b) => b.lv - a.lv || fo(b) - fo(a) : (a, b) => (W[a.uid] ? 0 : 1) - (W[b.uid] ? 0 : 1) || posRank(a) - posRank(b));
  const putOpt = (i) => {
    const nm = (u) => (u != null && instOf(u) ? card(instOf(u)).name : '空');
    const opts = isPitcher(i)
      ? [...[0, 1, 2, 3, 4].map((k) => [`sp:${k}`, `先發${k + 1}（${nm(L.sp[k])}）`]), ...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => [`rp:${k}`, `牛棚${k + 1}（${nm(L.rp[k])}）`]), ['cl:0', `終結者（${nm(L.cl)}）`]]
      : [...L.order.map((x, k) => [`ord:${k}`, `第${k + 1}棒・${PS[x.pos]}（${nm(x.uid)}）`]), ...[0, 1, 2, 3, 4, 5].map((k) => [`bench:${k}`, `板凳${k + 1}（${nm(L.bench[k])}）`])];
    return `<select data-put="${i.uid}"><option value="">放到…</option>${opts.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join('')}${W[i.uid] ? '<option value="out">移出陣容</option>' : ''}</select>`;
  };
  return `<section class="panel"><div class="bar"><h3>陣容</h3><span class="grow"></span><button id="auto" class="big">⚡ 自動排陣</button></div>
    ${probs.length ? `<p class="bad">⚠ ${probs.join('、')}</p>` : '<p class="good">✔ 陣容完整</p>'}
    <div class="cols"><div><h4>打線 <small class="muted">下拉選單裡「可守該位置」的球員排在最前面</small></h4><table class="box lineup">${L.order.map((x, k) => { const i = instOf(x.uid);
      return `<tr><td>${k + 1}</td><td><select data-pos="${k}">${posOpt(x.pos)}</select></td><td><select data-ord="${k}">${hOpt(x.uid, x.pos)}</select></td><td>${fitBadge(card(i), x.pos)}</td><td>${mini(i)}</td>
      <td class="nw"><button data-up="${k}" ${k ? '' : 'disabled'}>▲</button><button data-dn="${k}" ${k < 8 ? '' : 'disabled'}>▼</button></td></tr>`; }).join('')}</table>
      <h4>板凳（代打、代跑、守備替補）</h4><table class="box lineup">${[0, 1, 2, 3, 4, 5].map((k) => { const i = L.bench[k] != null ? instOf(L.bench[k]) : null; return `<tr><td>${k + 1}</td><td><select data-bench="${k}">${hOpt(L.bench[k], null, true)}</select></td><td>${i ? posTag(card(i)) : ''}</td><td>${i ? mini(i) : ''}</td></tr>`; }).join('')}</table></div>
    <div><h4>先發輪值</h4><table class="box lineup">${[0, 1, 2, 3, 4].map((k) => prow(k, 'sp', L.sp[k], 'SP')).join('')}</table>
      <h4>牛棚</h4><table class="box lineup">${[0, 1, 2, 3, 4, 5, 6, 7].map((k) => prow(k, 'rp', L.rp[k], 'RP')).join('')}</table>
      <h4>終結者</h4><table class="box lineup">${prow(0, 'cl', L.cl, 'CL')}</table></div></div></section>
    <section class="panel"><div class="bar"><h3>球員名單 <small class="muted">${list.length} 人・用「放到…」直接排進陣容</small></h3><span class="grow"></span>
      ${[['all', '全部'], ['H', '野手'], ['P', '投手']].map(([k, l]) => `<button data-lf="${k}" class="${lnFilter === k ? 'on' : ''}">${l}</button>`).join('')}
      <select id="lnsort">${[['pos', '依位置'], ['ovr', '依能力'], ['lv', '依等級'], ['use', '已登錄優先']].map(([k, l]) => `<option value="${k}" ${lnSort === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <table class="box roster"><tr><th>位置</th><th>球員</th><th>能力</th><th>主要數值</th><th>特色</th><th>目前</th><th></th></tr>
    ${page(list, 'ln').map((i) => { const c = card(i); return `<tr class="${W[i.uid] ? 'in' : ''}"><td>${posTag(c)}</td><td><b class="r-${c.rarity}">${c.rarity}</b> <a data-pd="${i.uid}">${esc(c.name)}</a> <small class="muted">Lv${i.lv}</small></td><td><b>${fo(i)}</b></td><td>${mini(i)}</td>
      <td>${(c.traits || []).map((t) => `<span title="${TRAITS[t].name}">${TRAITS[t].icon}</span>`).join('')}</td><td>${W[i.uid] || '<span class="muted">—</span>'}</td><td>${putOpt(i)}</td></tr>`; }).join('')}</table>${pager(list.length, 'ln')}</section>`;
}
function playersHTML() {
  let list = S.cards.slice();
  if (plFilter === 'H') list = list.filter((i) => !isPitcher(i)); if (plFilter === 'P') list = list.filter(isPitcher);
  list.sort(plSort === 'ovr' ? (a, b) => fo(b) - fo(a) : plSort === 'rar' ? (a, b) => ORDER.indexOf(card(b).rarity) - ORDER.indexOf(card(a).rarity) || fo(b) - fo(a) : (a, b) => b.lv - a.lv);
  return `<section class="panel"><div class="bar"><h3>我的球員 <small class="muted">${S.cards.length} 人</small></h3><span class="grow"></span>
    ${[['all', '全部'], ['H', '野手'], ['P', '投手']].map(([k, l]) => `<button data-pf="${k}" class="${plFilter === k ? 'on' : ''}">${l}</button>`).join('')}
    <select id="psort"><option value="ovr" ${plSort === 'ovr' ? 'selected' : ''}>依能力</option><option value="rar" ${plSort === 'rar' ? 'selected' : ''}>依稀有度</option><option value="lv" ${plSort === 'lv' ? 'selected' : ''}>依等級</option></select></div>
    <div class="grid">${page(list, 'pl').map((i) => cardHTML(card(i), i)).join('')}</div>${pager(list.length, 'pl')}</section>`;
}
function dexHTML() {
  const have = (c) => !!S.dex[c.cid], n = POOL.filter(have).length, total = POOL.length - EXS.filter((c) => !have(c)).length;
  const list = POOL.filter((c) => dexFilter === 'all' || c.rarity === dexFilter);
  return `<section class="panel"><div class="bar"><h3>圖鑑 <small class="muted">收集 ${n} / ${total}</small></h3><span class="grow"></span>
    ${['all', ...ORDER].map((r) => `<button data-df="${r}" class="${dexFilter === r ? 'on' : ''}">${r === 'all' ? '全部' : r === 'EX' ? '隱藏' : r} ${r === 'all' ? '' : POOL.filter((c) => c.rarity === r && have(c)).length + '/' + (r === 'EX' ? '?' : POOL.filter((c) => c.rarity === r).length)}</button>`).join('')}</div>
    <div class="grid">${page(list, 'dex').map((c) => cardHTML(c, null, { hidden: !have(c) })).join('')}</div>${pager(list.length, 'dex')}</section>`;
}
const bind = {
  home() {
    const f = $('#freePack'); if (f) f.onclick = () => { S.lastFree = today(); doOpen('std', true); };
    const t = $('#ticket'); if (t) t.onclick = () => { screen = 'packs'; render(); };
    const gc = $('#goCup'); if (gc) gc.onclick = () => { screen = 'cup'; render(); };
    const w = $('#watch'); if (w) w.onclick = () => playMatch(true);
    const q = $('#quick'); if (q) q.onclick = () => playMatch(false);
  },
  packs() {
    document.querySelectorAll('[data-inv]').forEach((b) => b.onclick = () => { const k = b.dataset.inv; if (!(S.inv[k] > 0)) return; S.inv[k]--; if (BOXES[k]) openBoxDlg(k); else doOpen(k, true); });
    document.querySelectorAll('[data-box]').forEach((b) => b.onclick = () => { const k = b.dataset.box; if (S.coins < BOXES[k].cost) return; S.coins -= BOXES[k].cost; openBoxDlg(k); });
    document.querySelectorAll('[data-buy]').forEach((b) => b.onclick = () => { const k = b.dataset.buy; if (S.coins < PACKS[k].cost) return; S.coins -= PACKS[k].cost; doOpen(k); }); },
  lineup() {
    const L = S.lineup;
    const tidy = () => { L.bench = L.bench.filter((x) => x != null); L.sp = L.sp.filter((x) => x != null); L.rp = L.rp.filter((x) => x != null); save(); render(); };
    // put a player into a spot; whoever was there takes his old spot (or leaves the lineup)
    const put = (kind, k, uid) => {
      const old = kind === 'ord' ? L.order[k].uid : kind === 'cl' ? L.cl : L[kind][k] ?? null;
      if (uid === old) return;
      const inOrder = uid != null && L.order.some((x) => x.uid === uid);
      if (inOrder && old == null) return toast('打線不能空著：請改放到有人的位置，或在打線直接換人');
      if (uid != null) {
        const o = L.order.find((x) => x.uid === uid); if (o) o.uid = old;
        for (const a of ['bench', 'sp', 'rp']) { const j = L[a].indexOf(uid); if (j >= 0) L[a][j] = old; }
        if (L.cl === uid) L.cl = old;
      }
      if (kind === 'ord') L.order[k].uid = uid; else if (kind === 'cl') L.cl = uid; else L[kind][k] = uid;
      tidy();
    };
    $('#auto').onclick = () => { autoLineup(); save(); render(); toast('已依位置與能力自動排好陣容'); };
    document.querySelectorAll('[data-ord]').forEach((s) => s.onchange = () => put('ord', +s.dataset.ord, +s.value));
    document.querySelectorAll('[data-pos]').forEach((s) => s.onchange = () => { const k = +s.dataset.pos, p = s.value, other = L.order.find((o, j) => j !== k && o.pos === p); if (other) other.pos = L.order[k].pos; L.order[k].pos = p; tidy(); });
    document.querySelectorAll('[data-up]').forEach((b) => b.onclick = () => { const k = +b.dataset.up; [L.order[k - 1], L.order[k]] = [L.order[k], L.order[k - 1]]; tidy(); });
    document.querySelectorAll('[data-dn]').forEach((b) => b.onclick = () => { const k = +b.dataset.dn; [L.order[k + 1], L.order[k]] = [L.order[k], L.order[k + 1]]; tidy(); });
    for (const kind of ['bench', 'sp', 'rp', 'cl']) document.querySelectorAll(`[data-${kind}]`).forEach((s) => s.onchange = () => put(kind, +s.dataset[kind], s.value === '' ? null : +s.value));
    document.querySelectorAll('[data-put]').forEach((s) => s.onchange = () => {
      const uid = +s.dataset.put;
      if (s.value === 'out') {
        if (L.order.some((x) => x.uid === uid)) { toast('打線不能空著：請先換另一位球員上場'); return render(); }
        for (const a of ['bench', 'sp', 'rp']) L[a] = L[a].filter((x) => x !== uid); if (L.cl === uid) L.cl = null; return tidy();
      }
      const [kind, k] = s.value.split(':'); put(kind, +k, uid);
    });
    document.querySelectorAll('[data-lf]').forEach((b) => b.onclick = () => { lnFilter = b.dataset.lf; pg.ln = 0; render(); });
    $('#lnsort').onchange = (e) => { lnSort = e.target.value; pg.ln = 0; render(); };
    document.querySelectorAll('[data-pd]').forEach((a) => a.onclick = () => playerDialog(instOf(+a.dataset.pd)));
    bindPager();
  },
  items() {
    document.querySelectorAll('[data-staff]').forEach((s) => s.onchange = () => { const k = s.dataset.staff; if (s.value === '') delete S.staff[k]; else S.staff[k] = +s.value; save(); render(); });
    document.querySelectorAll('[data-gf]').forEach((b) => b.onclick = () => { gearFilter = b.dataset.gf; render(); });
    document.querySelectorAll('[data-sellc]').forEach((b) => b.onclick = () => { const c = S.coaches.find((x) => x.id === +b.dataset.sellc); if (!confirm(`與 ${c.name} 解約？`)) return; S.coins += ITEMS.SELL_C[c.rar]; S.coaches = S.coaches.filter((x) => x !== c); save(); render(); });
    document.querySelectorAll('[data-sellg]').forEach((b) => b.onclick = () => { const g = S.gear.find((x) => x.id === +b.dataset.sellg); if (!confirm(`賣出 ${g.name}？`)) return; S.coins += ITEMS.SELL_G[g.rar]; S.gear = S.gear.filter((x) => x !== g); save(); render(); });
  },
  cup() {
    document.querySelectorAll('[data-cup]').forEach((b) => b.onclick = () => { const k = +b.dataset.cup; if (!confirm(`報名${CUPS[k].name}？報名費 🪙${CUPS[k].fee.toLocaleString()}`)) return; cupEnter(k); render(); });
    const w = $('#cupWatch'); if (w) w.onclick = () => playCup(true);
    const q = $('#cupQuick'); if (q) q.onclick = () => playCup(false);
  },
  players() {
    document.querySelectorAll('[data-pf]').forEach((b) => b.onclick = () => { plFilter = b.dataset.pf; pg.pl = 0; render(); });
    bindPager();
    $('#psort').onchange = (e) => { plSort = e.target.value; render(); };
    document.querySelectorAll('.pcard[data-uid]').forEach((d) => d.onclick = () => playerDialog(instOf(+d.dataset.uid)));
  },
  dex() {
    document.querySelectorAll('[data-df]').forEach((b) => b.onclick = () => { dexFilter = b.dataset.df; pg.dex = 0; render(); });
    bindPager();
    document.querySelectorAll('.pcard[data-cid]').forEach((d) => d.onclick = () => { const c = BY_CID[+d.dataset.cid]; if (S.dex[c.cid]) { const inst = S.cards.find((i) => i.cid === c.cid); if (inst) playerDialog(inst); } });
  },
};

// ---------------------------------------------------------------- cups: 8-team knockout tournaments; the further you go, the bigger the prize
const CUPS = [
  { name: '新人盃', icon: '🌱', fee: 100, ovr: 46, coins: [800, 450, 250, 100], packs: [['premium', 'gear'], ['std'], [], []] },
  { name: '地區盃', icon: '🥉', fee: 400, ovr: 55, coins: [1800, 1000, 500, 200], packs: [['premium', 'premium', 'gear2'], ['premium', 'gear'], ['std'], []] },
  { name: '全國盃', icon: '🥈', fee: 1000, ovr: 64, coins: [4000, 2200, 1100, 400], packs: [['star', 'gear2', 'coach'], ['premium', 'premium', 'gear2'], ['premium'], []] },
  { name: '亞洲盃', icon: '🥇', fee: 2500, ovr: 73, coins: [8000, 4500, 2200, 800], packs: [['star', 'star', 'coach2', 'gear2'], ['star', 'gear2'], ['premium', 'premium'], ['std']] },
  { name: '世界盃', icon: '🌏', fee: 5000, ovr: 82, coins: [16000, 9000, 4500, 1600], packs: [['legend', 'coach2', 'gear2', 'gear2'], ['star', 'star', 'coach2'], ['star', 'gear2'], ['premium']] },
  { name: '傳奇盃', icon: '👑', fee: 10000, ovr: 92, coins: [32000, 18000, 9000, 3000], packs: [['legend', 'legend', 'coach2', 'coach2', 'gear2', 'gear2'], ['legend', 'coach2', 'gear2'], ['star', 'star', 'gear2'], ['star']] },
];
const PLACE = ['冠軍', '亞軍', '四強', '八強'], RNAME = ['八強賽', '準決賽', '決賽'];
const packList = (ks) => { const n = {}; for (const k of ks) n[k] = (n[k] || 0) + 1; return Object.entries(n).map(([k, c]) => `${anyPack(k).name}${c > 1 ? '×' + c : ''}`).join('、'); };
function cupEnter(k) {
  const cup = CUPS[k]; if (S.coins < cup.fee || (S.cup && !S.cup.over)) return;
  S.coins -= cup.fee;
  const styles = COLORS.filter((_, i) => i !== S.color), cities = CITIES.slice(), take = (a) => a.splice(Math.floor(Math.random() * a.length), 1)[0];
  const teams = [null];
  for (let i = 0; i < 7; i++) teams.push(packTeam(cpuTeamAt(Object.assign({}, take(styles)), take(cities), cup.ovr - 4 + i * 1.3 + (Math.random() - 0.5) * 2, k)));
  const slots = [0, 1, 2, 3, 4, 5, 6, 7].sort(() => Math.random() - 0.5);
  const pairs = []; for (let i = 0; i < 8; i += 2) pairs.push({ a: slots[i], b: slots[i + 1] });
  S.cup = { k, teams, rounds: [pairs], round: 0, over: false, place: null };
  save();
}
const cupName = (C, i) => (i === 0 ? S.name : C.teams[i].full);
const cupColor = (C, i) => (i === 0 ? COLORS[S.color].bar : C.teams[i].bar);
const myPair = () => S.cup.rounds[S.cup.round].find((p) => p.a === 0 || p.b === 0);
// a knockout game can't end level: more hits goes through, then the home side
function settle(pr, res) {
  pr.ra = res.R[0]; pr.rb = res.R[1]; pr.tb = pr.ra === pr.rb;
  pr.w = pr.ra > pr.rb ? pr.a : pr.rb > pr.ra ? pr.b : res.game.ts[0].H > res.game.ts[1].H ? pr.a : pr.b;
}
function simPair(C, pr) {
  const A = unpackTeam(C.teams[pr.a]), B = unpackTeam(C.teams[pr.b]), res = Match.quick(A, B);
  C.teams[pr.a].rotation = A.rotation; C.teams[pr.b].rotation = B.rotation; settle(pr, res);
}
function nextRound(C) {
  const prev = C.rounds[C.round];
  if (prev.length === 1) return false;
  const pairs = []; for (let i = 0; i < prev.length; i += 2) pairs.push({ a: prev[i].w, b: prev[i + 1].w });
  C.rounds.push(pairs); C.round++; return true;
}
function playCup(watch) {
  if (lineupProblems().length) return toast('陣容不完整，請先到「陣容」調整');
  const C = S.cup, pr = myPair(), meHome = pr.b === 0, oppIdx = meHome ? pr.a : pr.b;
  const mine = myTeam(), opp = unpackTeam(C.teams[oppIdx]);
  const away = meHome ? opp : mine, home = meHome ? mine : opp;
  const done = (res) => cupResultDialog(cupAfter(res, pr, mine, opp, meHome));
  if (!watch) { done(Match.quick(away, home)); return; }
  $('#club').hidden = true; $('#match').hidden = false;
  Match.start(away, home, { onEnd: done, autoplay: true });
}
function cupAfter(res, pr, mine, opp, meHome) {
  const C = S.cup, cup = CUPS[C.k], my = meHome ? 1 : 0, oppIdx = meHome ? pr.a : pr.b;
  C.teams[oppIdx].rotation = opp.rotation; S.rotation = mine.rotation;
  settle(pr, res);
  const win = pr.w === 0, rMe = res.R[my], rOp = res.R[1 - my], round = C.round;
  const { ups, mvp } = gainFromGame(res, mine, my, win);
  for (const p of C.rounds[C.round]) if (p !== pr) simPair(C, p);
  let finish = null;
  if (!win) {
    C.place = [3, 2, 1][round];
    while (nextRound(C)) for (const p of C.rounds[C.round]) simPair(C, p);      // the rest of the cup plays out
  } else if (!nextRound(C)) C.place = 0;
  if (C.place != null) {
    C.over = true;
    const coins = cup.coins[C.place], packs = cup.packs[C.place];
    S.coins += coins; for (const k of packs) S.inv[k] = (S.inv[k] || 0) + 1;
    S.cupBest = S.cupBest || {}; if (S.cupBest[C.k] == null || C.place < S.cupBest[C.k]) S.cupBest[C.k] = C.place;
    S.cupLog = [{ k: C.k, place: C.place }].concat(S.cupLog || []).slice(0, 20);
    finish = { place: C.place, coins, packs };
  }
  save();
  return { win, tb: pr.tb, rMe, rOp, ups, mvp, round, opp: cupName(C, oppIdx), finish, cup };
}
function bracketHTML(C) {
  const cols = [0, 1, 2].map((r) => {
    const n = 4 >> r, pairs = C.rounds[r] || [];
    const box = (pr) => {
      const row = (i, sc, side) => i == null ? '<div class="bt tbd">—</div>' : `<div class="bt ${i === 0 ? 'me' : ''} ${pr && pr.w != null ? (pr.w === i ? 'win' : 'lose') : ''}"><i style="background:${cupColor(C, i)}"></i>${esc(cupName(C, i))}<b>${sc ?? ''}</b></div>`;
      return `<div class="bm">${row(pr && pr.a, pr && pr.ra, 'a')}${row(pr && pr.b, pr && pr.rb, 'b')}${pr && pr.tb ? '<small>平手：安打數多者晉級</small>' : ''}</div>`;
    };
    return `<div class="bcol"><h4>${RNAME[r]}</h4><div class="bbs">${Array.from({ length: n }, (_, k) => box(pairs[k])).join('')}</div></div>`;
  });
  const fin = C.rounds[2] && C.rounds[2][0].w;
  return `<div class="bracket">${cols.join('')}<div class="bcol champ"><h4>冠軍</h4><div class="bbs"><div class="bm">${fin != null ? `<div class="bt win ${fin === 0 ? 'me' : ''}">🏆 ${esc(cupName(C, fin))}</div>` : '<div class="bt tbd">？</div>'}</div></div></div></div>`;
}
function cupHTML() {
  const C = S.cup, live = C && !C.over, to = teamOvr();
  let top = '';
  if (C) {
    const cup = CUPS[C.k], pr = live ? myPair() : null;
    top = `<section class="panel"><div class="bar"><h3>${cup.icon} ${cup.name} ${live ? `<small class="muted">${RNAME[C.round]}</small>` : `<small class="${C.place === 0 ? 'good' : ''}">最終成績：${PLACE[C.place]}</small>`}</h3><span class="grow"></span>
      ${live ? `<span class="muted">下一場：vs ${esc(cupName(C, pr.a === 0 ? pr.b : pr.a))}</span><button class="big" id="cupWatch">▶ 觀看比賽</button><button id="cupQuick">⏭ 快速模擬</button>` : ''}</div>
      ${bracketHTML(C)}</section>`;
  }
  const best = S.cupBest || {};
  return top + `<section class="panel"><h3>🏆 盃賽報名 <small class="muted">8 隊單淘汰。名次越高、盃賽等級越高，獎金和卡包越好。你的球隊戰力 <b>${to}</b></small></h3>
    <div class="packs cups">${CUPS.map((c, k) => `<div class="pack cupc ${to >= c.ovr ? '' : 'hard'}"><div class="pkart">${c.icon}</div><h4>${c.name}</h4>
      <p>對手戰力 約 <b>${c.ovr}</b>${best[k] != null ? `　最佳：<b class="good">${PLACE[best[k]]}</b>` : ''}</p>
      <table class="prize">${PLACE.map((pl, i) => `<tr><td>${pl}</td><td>🪙${c.coins[i].toLocaleString()}</td><td>${packList(c.packs[i]) || ''}</td></tr>`).join('')}</table>
      <button class="big" data-cup="${k}" ${live || S.coins < c.fee ? 'disabled' : ''}>${live ? '盃賽進行中' : `報名 🪙${c.fee.toLocaleString()}`}</button></div>`).join('')}</div></section>`;
}
function cupResultDialog(o) {
  const lv = o.ups.map((u) => `${esc(card(u.inst).name)} Lv${u.inst.lv}${Math.floor(u.inst.lv / 100) > Math.floor((u.inst.lv - u.n) / 100) ? '（🎲 獲得技能重骰機會！）' : ''}`).join('、');
  const f = o.finish;
  const m = modal(`<h2>${o.cup.icon} ${o.cup.name}・${RNAME[o.round]}</h2><h2>${o.win ? '🎉 晉級！' : '敗退'}</h2><div class="big score">${o.rMe} : ${o.rOp}</div>
    ${o.tb ? '<p class="muted">平手：以安打數決定晉級隊伍</p>' : ''}<p>vs ${esc(o.opp)}${o.mvp ? `　MVP：<b>${esc(o.mvp.name)}</b>` : ''}</p>${lv ? `<p class="good">升級：${lv}</p>` : ''}
    ${f ? `<div class="season"><h3>${f.place === 0 ? '🏆 ' : ''}最終成績：${PLACE[f.place]}</h3><p>🪙 +${f.coins.toLocaleString()}${f.packs.length ? `　🎟 ${packList(f.packs)}` : ''}</p>${f.packs.length ? '<p class="muted">卡包已放進「抽卡 → 我的卡包」</p>' : ''}</div>` : `<p>下一輪：${RNAME[o.round + 1]}</p>`}
    <div class="row"><button class="big" id="ok">${f && f.packs.length ? '去開卡包' : '回到盃賽'}</button></div>`);
  m.querySelector('#ok').onclick = () => { closeModal(); screen = f && f.packs.length ? 'packs' : 'cup'; render(); };
}

// ---------------------------------------------------------------- dialogs
function modal(html, cls = '') { const m = $('#modal'); m.innerHTML = `<div class="dlg panel ${cls}">${html}</div>`; m.hidden = false; return m; }
const closeModal = () => { $('#modal').hidden = true; };
function newClubDialog() {
  $('#match').hidden = true; $('#club').hidden = false; $('#nav').innerHTML = ''; $('#screen').innerHTML = '';
  const m = modal(`<h2>⚾ 建立你的球隊</h2><p>從一支新人隊開始：在聯盟裡比賽賺金幣，抽卡包招募更強的球員，讓他們升級、升星，一路打進傳奇聯盟！</p>
    <label>球隊名稱 <input id="tname" maxlength="10" value="我的球隊"></label>
    <label>球隊顏色</label><div class="colors">${COLORS.map((c, i) => `<button data-col="${i}" class="${i ? '' : 'on'}" style="background:${c.bar}" title="${c.name}">${c.name}</button>`).join('')}</div>
    <div class="row"><button class="big" id="go">開始！</button></div>`);
  let col = 0;
  m.querySelectorAll('[data-col]').forEach((b) => b.onclick = () => { col = +b.dataset.col; m.querySelectorAll('[data-col]').forEach((x) => x.classList.toggle('on', x === b)); });
  m.querySelector('#go').onclick = () => { newClub(m.querySelector('#tname').value.trim() || '我的球隊', col); closeModal(); doOpen('std', true, true); };
}
// open a pack: five face-down cards that flip one by one
function doOpen(kind, free, first) {
  const got = openPack(kind, S), res = got.map((c) => addCard(S, c));
  S.packs = (S.packs || 0) + 1; save(); nav();
  const m = modal(`<h2>${first ? '🎁 新人禮物：' : free ? '🎁 ' : ''}${PACKS[kind].name}</h2>
    <div class="reveal">${got.map((c, k) => `<div class="flip ${c.rarity === 'EX' ? 'ex' : c.rarity === 'LR' ? 'lr' : ''}" data-k="${k}"><div class="back">⚾</div><div class="front">${cardHTML(c, res[k].inst)}
      <div class="tag t-${res[k].kind}">${res[k].kind === 'new' ? (c.rarity === 'EX' ? '✦ 隱藏球員登場！' : 'NEW!') : res[k].kind === 'star' ? `★ 升星 ${res[k].inst.stars}★${res[k].learned ? `<br>習得「${SK[res[k].learned].name}」` : ''}` : '經驗 +600'}</div></div></div>`).join('')}</div>
    <div class="row"><button id="flipAll">全部翻開</button><button class="big" id="done">好！</button></div>`, 'wide');
  drawPortraits();
  const flips = [...m.querySelectorAll('.flip')];
  flips.forEach((f) => f.onclick = () => f.classList.add('open'));
  let k = 0; const t = setInterval(() => { if (k >= flips.length) return clearInterval(t); flips[k++].classList.add('open'); }, 420);
  m.querySelector('#flipAll').onclick = () => flips.forEach((f) => f.classList.add('open'));
  m.querySelector('#done').onclick = () => { clearInterval(t); closeModal(); render(); };
}
function playerDialog(inst) {
  const c = card(inst), r = fs(inst), rar = RARITY[c.rarity], keys = c.role === 'H' ? [['contact', '打擊'], ['power', '力量'], ['eye', '選球'], ['speed', '速度'], ['defense', '守備'], ['arm', '臂力']] : [['fastball', '速球'], ['breaking', '變化球'], ['control', '控球'], ['stamina', '體力']];
  const st = inst.st, line = !st ? '還沒有出賽紀錄' : c.role === 'H' ? `${st.AB} 打數 ${st.H} 安打（打率 ${st.AB ? (st.H / st.AB).toFixed(3).replace(/^0/, '') : '.---'}）${st.HR} 轟 ${st.RBI} 打點` : `${Math.floor(st.outs / 3)}.${st.outs % 3} 局 ${st.pSO} 三振 防禦率 ${st.outs ? (st.pER * 27 / st.outs).toFixed(2) : '-'} ${st.W} 勝 ${st.L} 敗 ${st.S} 救援`;
  const maxed = inst.lv >= LV_MAX, inUse = isUsed(inst.uid), b = bon(inst) || {};
  const traits = (c.traits || []).map((t) => `<li><b>${TRAITS[t].icon} ${TRAITS[t].name}</b><small>${traitDesc(t)}</small></li>`).join('');
  const eq = Object.entries(SLOT).map(([slot, d]) => { const opts = S.gear.filter((g) => g.slot === slot && (g.on == null || g.on === inst.uid)).sort((x, y) => ITEMS.RAR.indexOf(y.rar) - ITEMS.RAR.indexOf(x.rar));
    return `<label class="eq">${d.icon} ${d.name}<select data-eq="${slot}"><option value="">（無）</option>${opts.map((g) => `<option value="${g.id}" ${g.on === inst.uid ? 'selected' : ''}>${g.rar} ${g.name}｜${ITEMS.gearDesc(g)}</option>`).join('')}</select></label>`; }).join('');
  const m = modal(`<div class="pd">${cardHTML(c, inst, { cls: 'big' })}<div><h2>${esc(c.name)} <small class="r-${c.rarity}">${c.rarity}</small></h2>
    <p class="muted">${POS_CN[c.pos]}｜${c.role === 'H' ? (c.bats === 'R' ? '右打' : '左打') : (c.throws === 'R' ? '右投' : '左投') + ' ' + (c.velo || '') + 'km ' + (c.pitches || []).join('、')}｜能力 ${fo(inst)}</p>
    ${c.role === 'H' ? `<p class="muted">可守：${[c.pos, ...(c.alt || [])].map((x) => PS[x]).join('、')}</p>` : ''}
    ${keys.map(([k, l]) => `<div class="rt"><span>${l}</span><i><b style="width:${Math.min(100, r[k])}%"></b></i><span>${r[k]}${b[k] ? `<small class="good"> +${b[k]}</small>` : ''}</span></div>`).join('')}
    ${traits ? `<h4>特色</h4><ul class="skl trl">${traits}</ul>` : ''}
    <h4>裝備 <small class="muted">${S.gear.length ? '' : '到「抽卡」買裝備箱'}</small></h4><div class="eqs">${eq}</div>
    <p>Lv ${inst.lv} / ${LV_MAX}　${'★'.repeat(inst.stars)}${'☆'.repeat(STAR_MAX - inst.stars)}　${maxed ? '（等級已滿）' : `經驗 ${inst.xp} / ${xpNeed(inst.lv)}`}</p>
    <h4>技能 <small class="muted">${(inst.sk || []).length} 個・技能完全隨機，Lv100／200／300／400／500 各得一次重骰機會</small></h4><ul class="skl">${(inst.sk || []).map((id) => { const k = SK[id]; return `<li class="g${k.grade}"><b style="color:${GR[k.grade].color}">${GR[k.grade].name}</b> ${esc(k.name)}<small>${SKILLS.desc(k)}</small></li>`; }).join('') || '<li class="muted">沒有技能</li>'}</ul>
    <p class="muted">生涯：${line}</p>
    <div class="row"><button id="train" class="big" ${maxed || S.coins < 300 ? 'disabled' : ''}>💪 特訓（🪙300，經驗 +200）</button>
    <button id="reroll" ${rerolls(inst) > 0 ? '' : 'disabled'} title="每 100 級獲得一次重骰機會">🎲 重骰技能（剩 ${rerolls(inst)} 次）</button>
    <button id="sell" ${inUse ? 'disabled title="在陣容中，請先換下"' : ''}>釋出（🪙${rar.sell * inst.stars}）</button><button id="close">關閉</button></div></div></div>`, 'wide');
  drawPortraits();
  m.querySelector('#reroll').onclick = () => {
    if (rerolls(inst) <= 0 || !confirm(`用掉一次機會，重骰 ${c.name} 的全部技能？`)) return;
    inst.rru = (inst.rru || 0) + 1; inst.sk = SKILLS.rollSet(c, Math.random, (inst.sk || []).length);
    save(); playerDialog(inst); toast('技能重骰完成！');
  };
  m.querySelector('#train').onclick = () => { S.coins -= 300; const n = gainXp(inst, 200); save(); playerDialog(inst); if (n) toast(`${c.name} 升到 Lv ${inst.lv}！${Math.floor(inst.lv / 100) > Math.floor((inst.lv - n) / 100) ? ' 🎲 獲得技能重骰機會' : ''}`); };
  m.querySelectorAll('[data-eq]').forEach((sel) => sel.onchange = () => {
    for (const g of S.gear) if (g.on === inst.uid && g.slot === sel.dataset.eq) g.on = null;
    const g = S.gear.find((x) => x.id === +sel.value); if (g) g.on = inst.uid;
    save(); playerDialog(inst);
  });
  m.querySelector('#sell').onclick = () => { if (!confirm(`確定釋出 ${c.name}？`)) return; for (const g of S.gear) if (g.on === inst.uid) g.on = null; S.coins += rar.sell * inst.stars; S.cards = S.cards.filter((i) => i !== inst); save(); closeModal(); render(); };
  m.querySelector('#close').onclick = () => { closeModal(); render(); };
}
const isUsed = (uid) => { const L = S.lineup; return L.order.some((o) => o.uid === uid) || L.bench.includes(uid) || L.sp.includes(uid) || L.rp.includes(uid) || L.cl === uid; };
function toast(t) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 2600); }

// ---------------------------------------------------------------- playing a game
function playMatch(watch) {
  const [a, b] = myMatch(), oppIdx = a === 0 ? b : a, meHome = b === 0;
  const mine = myTeam(), opp = unpackTeam(S.league.cpus[oppIdx - 1]);
  const away = meHome ? opp : mine, home = meHome ? mine : opp;
  const done = (res) => { const out = afterGame(res, mine, opp, meHome); resultDialog(out); };
  if (!watch) { done(Match.quick(away, home)); return; }
  $('#club').hidden = true; $('#match').hidden = false;
  Match.start(away, home, { onEnd: done, autoplay: true });
}
function resultDialog(o) {
  const lv = o.ups.map((u) => `${esc(card(u.inst).name)} Lv${u.inst.lv}${Math.floor(u.inst.lv / 100) > Math.floor((u.inst.lv - u.n) / 100) ? '（🎲 獲得技能重骰機會！）' : ''}`).join('、');
  const s = o.season;
  const m = modal(`<h2>${o.win ? '🎉 勝利！' : o.tie ? '平手' : '敗戰'}</h2><div class="big score">${o.rMe} : ${o.rOp}</div>
    <p>🪙 +${o.coins}${o.mvp ? `　MVP：<b>${esc(o.mvp.name)}</b>` : ''}</p>${lv ? `<p class="good">升級：${lv}</p>` : ''}
    ${s ? `<div class="season"><h3>球季結束：第 ${s.rank} 名</h3><p>🪙 +${s.prize}${s.tickets ? '　🎟 冠軍高級包 ×1' : ''}</p>${s.ex ? `<p class="exwin">✦ 傳奇聯盟冠軍！隱藏超級球員 <b>${esc(s.ex.card.name)}</b> ${s.ex.res.kind === 'new' ? '加入球隊！' : '升星！'}</p>` : ''}
      <p class="${s.move > 0 ? 'good' : s.move < 0 ? 'bad' : ''}">${s.move > 0 ? `⬆ 升級到 ${DIVS[s.from + 1].name}！` : s.move < 0 ? `⬇ 降到 ${DIVS[s.from - 1].name}` : `留在 ${DIVS[s.from].name}`}</p></div>` : ''}
    <div class="row"><button class="big" id="ok">回到主場</button></div>`);
  m.querySelector('#ok').onclick = () => { closeModal(); screen = 'home'; render(); };
}
$('#btnBack').onclick = () => { if (!Match.finished && !confirm('比賽還沒結束，要直接模擬到結束嗎？')) return; if (!Match.finished) Match.simToEnd(); else render(); };

// ---------------------------------------------------------------- go
S = load();
migrate();
if (S && !S.league) newSeason(0);
render();
cloudInit();
window.__club = { get S() { return S; }, render, autoLineup, lineupProblems, openBoxDlg, fo, endSeason, playerDialog, cupEnter, playCup, CUPS, newClub, doOpen, playMatch, afterGame, setScreen: (k) => { screen = k; render(); } };
})();
