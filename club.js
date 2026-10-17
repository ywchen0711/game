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
  { name: $t('業餘聯盟'), ovr: 44, coin: 1 }, { name: $t('二軍聯盟'), ovr: 53, coin: 1.5 }, { name: $t('職業聯盟'), ovr: 62, coin: 2 },
  { name: $t('明星聯盟'), ovr: 71, coin: 2.6 }, { name: $t('傳奇聯盟'), ovr: 80, coin: 3.2 }];
const FPOS = ['C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF', 'DH'];
const PS = { C: $t('捕手'), '1B': $t('一壘'), '2B': $t('二壘'), SS: $t('游擊'), '3B': $t('三壘'), LF: $t('左外'), CF: $t('中外'), RF: $t('右外'), DH: 'DH', SP: $t('先發'), RP: $t('中繼'), CL: $t('終結') };
if (I18N.EN) Object.assign(PS, { C: 'C', '1B': '1B', '2B': '2B', SS: 'SS', '3B': '3B', LF: 'LF', CF: 'CF', RF: 'RF', DH: 'DH', SP: 'SP', RP: 'RP', CL: 'CL' });
const COLORS = [
  { name: '藍鷹', hat: '#2346a8', shirt: '#f4f4f4', trim: '#2f5fd0', pants: '#d8dce8', bar: '#4a86f5' },   // i18n:keep
  { name: '赤獅', hat: '#a81e18', shirt: '#e0442a', trim: '#ffd38a', pants: '#f0e8e0', bar: '#f05a4a' },   // i18n:keep
  { name: '翠龍', hat: '#1d6a34', shirt: '#eef0e0', trim: '#2aa050', pants: '#dfe6d8', bar: '#3cc070' },   // i18n:keep
  { name: '金虎', hat: '#1a1a1a', shirt: '#f2b632', trim: '#1a1a1a', pants: '#e8e2d0', bar: '#f2c040' },   // i18n:keep
  { name: '紫電', hat: '#4a2286', shirt: '#9a6ad8', trim: '#f0e0ff', pants: '#e8e0f4', bar: '#b07af0' },   // i18n:keep
  { name: '黑熊', hat: '#1c1c1c', shirt: '#3c3c3c', trim: '#e0e0e0', pants: '#c8c8c8', bar: '#d0d0d0' },   // i18n:keep
  { name: '海豚', hat: '#0a7a8a', shirt: '#f4f8f8', trim: '#ff8a3a', pants: '#e0eef0', bar: '#2ac0d0' },   // i18n:keep
  { name: '櫻花', hat: '#c83a7a', shirt: '#fff0f6', trim: '#c83a7a', pants: '#f4e8ee', bar: '#ff7ab8' },   // i18n:keep
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
  try { cloud = await import('/save.js'); if (await cloud.pull(GAME, KEY)) { S = load(); migrate(); render(); } setCloud($t('☁ 已同步')); }
  catch (e) { cloud = null; setCloud($t('本機存檔')); }
}
function setCloud(t) { const e = $('#cloud'); if (e) e.textContent = t; }
addEventListener('cloudsave', (e) => setCloud(e.detail.state === 'synced' ? $t('☁ 已同步') : e.detail.state === 'offline' ? $t('☁ 離線') : '☁ ' + e.detail.state));

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
  S = { v: 1, m2: 1, inv: {}, gear: [], coaches: [], staff: {}, nextItem: 1, coins: 2000, nextUid: 1, cards: [], dex: {}, pity: 0, lastFree: '', name: name || $t('我的球隊'), color: colorIdx || 0,
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
  if (!L || L.order.length < 9) out.push($t('先發打線不足 9 人'));
  const pos = L ? L.order.map((o) => o.pos) : [];
  for (const p of FPOS) if (!pos.includes(p)) out.push(`${$t('缺少')}${POS_CN[p]}`);
  if (!L || L.sp.length < 1) out.push($t('沒有先發投手'));
  if (!L || (!L.rp.length && !L.cl)) out.push($t('沒有後援投手'));
  const all = L ? [...L.order.map((o) => o.uid), ...L.bench, ...L.sp, ...L.rp, L.cl].filter((x) => x != null) : [];
  if (new Set(all).size !== all.length) out.push($t('有球員重複登錄'));
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
function unpackTeam(d) {
  const t = Object.assign({}, d, { roster: [], W: 0, L: 0, T: 0, full: I18N.team(d.full), name: I18N.team(d.name) });
  t.roster = d.roster.map((p) => Object.assign({}, p, { name: I18N.nm(p.name), pitches: p.pitches && p.pitches.map($t), team: t, g: newStats(), s: newStats() }));
  return t;
}

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
const teamName = (i) => (i === 0 ? S.name : I18N.team(S.league.cpus[i - 1].full));
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
  const tabs = [['home', $t('🏟 主場')], ['packs', $t('🎴 抽卡')], ['lineup', $t('📋 陣容')], ['players', $t('🧢 球員')], ['items', $t('🎒 道具')], ['cup', $t('🏆 盃賽')], ['pvp', $t('⚔ 對戰')], ['dex', $t('📖 圖鑑')]];
  $('#nav').innerHTML = tabs.map(([k, l]) => `<button data-nav="${k}" class="${screen === k ? 'on' : ''}">${l}</button>`).join('') + `<span class="coins">🪙 ${S.coins.toLocaleString()}</span>`;
  $('#nav').querySelectorAll('[data-nav]').forEach((b) => b.onclick = () => { screen = b.dataset.nav; render(); });
}
function render() {
  if (!S) return newClubDialog();
  $('#match').hidden = true; $('#club').hidden = false;
  nav();
  const el = $('#screen');
  el.innerHTML = { home: homeHTML, packs: packsHTML, lineup: lineupHTML, players: playersHTML, items: itemsHTML, cup: cupHTML, pvp: pvpHTML, dex: dexHTML }[screen]();
  bind[screen] && bind[screen]();
  drawPortraits();
}
// a card face: portrait, rarity frame, name, position, overall, level and stars
function cardHTML(c, inst, opts = {}) {
  const rar = RARITY[c.rarity], o = inst ? fo(inst) : fo({ cid: c.cid, lv: 1, xp: 0, stars: 1 }), hidden = opts.hidden;
  return `<div class="pcard r-${c.rarity} ${hidden ? 'unknown' : ''} ${opts.cls || ''}" ${inst ? `data-uid="${inst.uid}"` : `data-cid="${c.cid}"`} style="--rc:${rar.color};--rg:${rar.glow}">
    <div class="rar">${c.rarity}</div>${!hidden && c.traits && c.traits.length ? `<div class="trt">${c.traits.map((t) => `<span title="${TRAITS[t].name}">${TRAITS[t].icon}</span>`).join('')}</div>` : ''}<canvas class="pf" width="60" height="64" data-port="${c.cid}" data-dark="${hidden ? 1 : 0}"></canvas>
    <div class="pn">${hidden ? (c.rarity === 'EX' ? $t('隱藏球員') : $t('？？？')) : esc(c.name)}</div>
    <div class="pp"><b>${hidden && c.rarity === 'EX' ? $t('？？') : PS[c.pos]}</b> ${hidden ? '' : `<span class="ov">${o}</span>`}</div>
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
      <div><h2>${esc(S.name)}</h2><div class="muted">${$L(`${div.name}・第 ${L.season} 季・${tr.W} 勝 ${tr.L} 敗${tr.T ? ' ' + tr.T + ' 和' : ''}・球隊戰力 <b>${teamOvr()}</b>`, `${div.name} · Season ${L.season} · ${tr.W}-${tr.L}${tr.T ? '-' + tr.T : ''} · Team rating <b>${teamOvr()}</b>`)}</div></div>
      <span class="grow"></span>
      ${free ? $t('<button class="big" id="freePack">🎁 每日免費球員包</button>') : ''}
      ${S.cup && !S.cup.over ? `<button class="big" id="goCup">🏆 ${CUPS[S.cup.k].name}${$t('進行中')}</button>` : ''}
      ${invCount() ? `<button class="big" id="ticket">🎟 ${$t('未開卡包')} ×${invCount()}</button>` : ''}
    </section>
    <div class="cols">
      <section class="panel next">
        <h3>${$L(`第 ${L.round + 1} / ${L.sched.length} 戰`, `Game ${L.round + 1} / ${L.sched.length}`)}</h3>
        ${opp != null ? `<div class="vs"><span><i style="background:${teamColor(meHome ? opp : 0)}"></i>${esc(teamName(meHome ? opp : 0))}<small>${$t('客')}</small></span><b>VS</b><span><i style="background:${teamColor(meHome ? 0 : opp)}"></i>${esc(teamName(meHome ? 0 : opp))}<small>${$t('主')}</small></span></div>
        <div class="row">${probs.length ? `<p class="bad">⚠ ${probs.join($t('、'))}${$t('，請先到「陣容」調整')}</p>` : $t('<button class="big" id="watch">▶ 觀看比賽</button><button id="quick">⏭ 快速模擬</button>')}</div>` : ''}
        <h3>${$t('最近戰績')}</h3>
        <ul class="recent">${L.recent.slice(0, 6).map((r) => `<li class="${r.me > r.them ? 'w' : r.me < r.them ? 'l' : ''}">${$L(`第${r.round}戰`, `G${r.round}`)} ${r.home ? 'vs' : '@'} ${esc(r.opp)}${$t('　')}<b>${r.me} : ${r.them}</b> ${r.me > r.them ? $t('勝') : r.me < r.them ? $t('敗') : $t('和')}</li>`).join('') || $t('<li class="muted">開季還沒有比賽</li>')}</ul>
      </section>
      <section class="panel">
        <h3>${div.name} ${$t('戰績表')} <small class="muted">${$t('前 2 名升級')}・${$t('最後 1 名降級')}</small></h3>
        <table class="box"><tr><th>#</th><th>${$t('球隊')}</th><th>${$t('勝')}</th><th>${$t('敗')}</th><th>${$t('和')}</th><th>${$t('勝率')}</th><th>${$t('得失分')}</th></tr>
        ${st.map((r, k) => `<tr class="${r.i === 0 ? 'on' : ''}"><td>${k + 1}</td><td><span class="chip" style="background:${teamColor(r.i)}"></span>${esc(teamName(r.i))}</td><td>${r.W}</td><td>${r.L}</td><td>${r.T}</td><td>${r.pct.toFixed(3).replace(/^0/, '')}</td><td>${r.RS - r.RA > 0 ? '+' : ''}${r.RS - r.RA}</td></tr>`).join('')}</table>
        ${S.history.length ? `<h3>${$t('歷屆成績')}</h3><ul class="recent">${S.history.slice(0, 5).map((h) => `<li>${$L(`第 ${h.season} 季 ${DIVS[h.div].name}：第 ${h.rank} 名（${h.W}勝${h.L}敗）`, `Season ${h.season} · ${DIVS[h.div].name}: #${h.rank} (${h.W}-${h.L})`)}</li>`).join('')}</ul>` : ''}
      </section>
    </div>
  </div>`;
}
const today = () => new Date().toISOString().slice(0, 10);
const anyPack = (k) => PACKS[k] || BOXES[k];
const invCount = () => Object.values(S.inv || {}).reduce((a, b) => a + b, 0);
const oddsHTML = (p) => ORDER.filter((r) => p.odds[r]).map((r) => `<span class="r-${r}">${r === 'EX' ? $t('隱藏') : r} ${p.odds[r]}%</span>`).join(' ');
function packsHTML() {
  const inv = Object.entries(S.inv || {}).filter(([, n]) => n > 0);
  return (inv.length ? `<section class="panel"><h3>🎟 ${$t('我的卡包')} <small class="muted">${$t('盃賽與聯盟冠軍的獎品')}</small></h3><div class="packs">${inv.map(([k, n]) => `<div class="pack pk-${k}"><div class="pkart">🎁</div><h4>${anyPack(k).name} ×${n}</h4><p>${anyPack(k).desc}</p><p class="odds">${oddsHTML(anyPack(k))}</p>
      <button class="big" data-inv="${k}">${$t('開啟')}</button></div>`).join('')}</div></section>` : '') + `<section class="panel"><h3>${$t('抽卡')} <small class="muted">${$L(`重複的球員會升星（最高 ${STAR_MAX}★），滿星後轉成經驗值。再抽 ${PITY - (S.pity || 0)} 包內必出 SSR 以上。每張卡都會隨機獲得技能，3★、5★ 再學一個。傳說中還有 4 位隱藏超級球員⋯⋯`, `Duplicates raise a player's stars (max ${STAR_MAX}★), then turn into XP. An SSR or better is guaranteed within ${PITY - (S.pity || 0)} packs. Every card comes with random skills and learns one more at 3★ and 5★. Legend says there are 4 hidden superstars…`)}</small></h3>
    <div class="packs">${Object.entries(PACKS).filter(([, p]) => !p.reward).map(([k, p]) => `<div class="pack pk-${k}"><div class="pkart">🎴</div><h4>${p.name}</h4><p>${p.desc}</p>
      <p class="odds">${oddsHTML(p)}</p>
      <button class="big" data-buy="${k}" ${S.coins < p.cost ? 'disabled' : ''}>🪙 ${p.cost.toLocaleString()}</button></div>`).join('')}</div></section>
    <section class="panel"><h3>🎒 ${$t('裝備與教練')} <small class="muted">${$t('裝備穿在單一球員身上；教練放進教練團，加成全隊。能力數值都是隨機的。')}</small></h3>
    <div class="packs">${Object.entries(BOXES).filter(([, b]) => !b.reward).map(([k, b]) => `<div class="pack"><div class="pkart">${b.type === 'gear' ? '🧰' : '📜'}</div><h4>${b.name}</h4><p>${b.desc}</p><p class="odds">${oddsHTML(b)}</p>
      <button class="big" data-box="${k}" ${S.coins < b.cost ? 'disabled' : ''}>🪙 ${b.cost.toLocaleString()}</button></div>`).join('')}</div></section>`;
}
// ---------------------------------------------------------------- equipment and coaches
function itemsHTML() {
  const cs = S.coaches, staff = S.staff, onStaff = new Set(Object.values(staff));
  const coachCard = (c) => `<div class="coach" style="--rc:${RCOL[c.rar]}"><canvas class="pf" width="60" height="64" data-coach="${c.id}"></canvas><div><b>${esc(I18N.nm(c.name))}</b> <small class="rc">${c.rar}</small><div class="muted">${COACH[c.kind].icon} ${COACH[c.kind].name}</div><div class="cd">${ITEMS.coachDesc(c)}</div></div></div>`;
  const gear = S.gear.filter((g) => gearFilter === 'all' || g.slot === gearFilter).sort((a, b) => ITEMS.RAR.indexOf(b.rar) - ITEMS.RAR.indexOf(a.rar));
  return `<section class="panel"><h3>👔 ${$t('教練團')} <small class="muted">${$t('每個職位放一位教練，效果套用到全隊。教練合約可在「抽卡」購買，盃賽也會送名教練。')}</small></h3>
    <div class="staff">${Object.keys(COACH).map((kind) => { const cur = cs.find((c) => c.id === staff[kind]); return `<div class="staffslot"><h4>${COACH[kind].icon} ${COACH[kind].name}</h4>${cur ? coachCard(cur) : $t('<p class="muted">空缺</p>')}
      <select data-staff="${kind}"><option value="">${$t('（空缺）')}</option>${cs.filter((c) => c.kind === kind).map((c) => `<option value="${c.id}" ${c.id === staff[kind] ? 'selected' : ''}>${c.rar} ${esc(I18N.nm(c.name))}</option>`).join('')}</select></div>`; }).join('')}</div>
    ${cs.some((c) => !onStaff.has(c.id)) ? `<h4>${$t('候補教練')}</h4><div class="coaches">${cs.filter((c) => !onStaff.has(c.id)).map((c) => `<div>${coachCard(c)}<button data-sellc="${c.id}">${$t('解約（')}🪙${ITEMS.SELL_C[c.rar]}${$t('）')}</button></div>`).join('')}</div>` : ''}</section>
    <section class="panel"><div class="bar"><h3>🎒 ${$t('裝備')} <small class="muted">${S.gear.length} ${$t('件')}・${$t('到球員資料裡穿上')}</small></h3><span class="grow"></span>
      ${[['all', $t('全部')], ...Object.entries(SLOT).map(([k, d]) => [k, d.icon + ' ' + d.name])].map(([k, l]) => `<button data-gf="${k}" class="${gearFilter === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    ${gear.length ? `<table class="box gear">${gear.map((g) => { const who = g.on != null && instOf(g.on); return `<tr><td>${SLOT[g.slot].icon}</td><td><b style="color:${RCOL[g.rar]}">${g.rar}</b></td><td>${g.name}</td><td>${ITEMS.gearDesc(g)}</td><td>${who ? '🧢 ' + esc(card(who).name) : $t('<span class="muted">未裝備</span>')}</td><td><button data-sellg="${g.id}">${$t('賣出（')}🪙${ITEMS.SELL_G[g.rar]}${$t('）')}</button></td></tr>`; }).join('')}</table>` : $t('<p class="muted">還沒有裝備。到「抽卡」買裝備箱，或打盃賽贏高級裝備箱。</p>')}</section>`;
}
function openBoxDlg(k) {
  const b = BOXES[k], got = ITEMS.openBox(k);
  for (const x of got) { x.id = S.nextItem++; if (b.type === 'gear') { x.on = null; S.gear.push(x); } else S.coaches.push(x); }
  save(); nav();
  const m = modal(`<h2>${b.name}</h2><div class="loot">${got.map((x) => b.type === 'gear'
    ? `<div class="lootc" style="--rc:${RCOL[x.rar]}"><div class="ic">${SLOT[x.slot].icon}</div><b>${x.name}</b><small class="rc">${x.rar}・${SLOT[x.slot].name}</small><p>${ITEMS.gearDesc(x)}</p></div>`
    : `<div class="lootc" style="--rc:${RCOL[x.rar]}"><canvas class="pf" width="60" height="64" data-coach="${x.id}"></canvas><b>${esc(I18N.nm(x.name))}</b><small class="rc">${x.rar}・${COACH[x.kind].icon} ${COACH[x.kind].name}</small><p>${ITEMS.coachDesc(x)}</p></div>`).join('')}</div>
    <div class="row"><button class="big" id="done">${$t('好！')}</button></div>`, 'wide');
  drawPortraits();
  m.querySelector('#done').onclick = () => { closeModal(); render(); };
}
// where a player sits in the lineup right now
function whereMap() {
  const L = S.lineup, w = {};
  L.order.forEach((o, k) => { w[o.uid] = $L(`第${k + 1}棒・${PS[o.pos]}`, `#${k + 1} · ${PS[o.pos]}`); });
  L.bench.forEach((u) => { w[u] = $t('板凳'); }); L.sp.forEach((u, k) => { w[u] = $L(`先發${k + 1}`, `SP${k + 1}`); }); L.rp.forEach((u) => { w[u] = $t('牛棚'); }); if (L.cl != null) w[L.cl] = $t('終結者');
  return w;
}
const fitBadge = (c, pos) => pos === 'DH' ? '<span class="fit dh">DH</span>' : c.pos === pos ? $t('<span class="fit nat">✔ 本職</span>') : canPlay(c, pos) ? $t('<span class="fit alt">🔄 可守</span>') : $t('<span class="fit bad" title="非本職：守備 -15">⚠ 非本職</span>');
const posTag = (c) => `${PS[c.pos]}${c.alt && c.alt.length ? `<small>/${c.alt.map((x) => PS[x]).join('/')}</small>` : ''}`;
let lnSort = 'pos', lnFilter = 'all';
function lineupHTML() {
  const L = S.lineup, probs = lineupProblems(), H = hitters(), P = pitchers(), W = whereMap(), R = new Map(S.cards.map((i) => [i.uid, fs(i)]));
  const lbl = (i) => `${card(i).name}${$t('｜')}${PS[card(i).pos]}${card(i).alt && card(i).alt.length ? '+' : ''} ${fo(i)}${W[i.uid] ? `${$t('（')}${W[i.uid]}${$t('）')}` : ''}`;
  const o = (sel) => (i) => `<option value="${i.uid}" ${i.uid === sel ? 'selected' : ''}>${esc(lbl(i))}</option>`;
  // hitters for a spot: the ones who can play it first (best fit on top), then everyone else by position
  const hOpt = (sel, pos, none) => {
    const fit = pos ? H.filter((i) => canPlay(card(i), pos)).sort((a, b) => slotValue(b, pos, R.get(b.uid)) - slotValue(a, pos, R.get(a.uid))) : [];
    const rest = H.filter((i) => !fit.includes(i)).sort((a, b) => posRank(a) - posRank(b) || fo(b) - fo(a));
    return (none ? $t('<option value="">（無）</option>') : '') + (fit.length ? `<optgroup label="${pos === 'DH' ? $t('指定打擊（依打擊能力）') : $t('可守') + PS[pos]}">${fit.map(o(sel)).join('')}</optgroup>` : '') + (rest.length ? `<optgroup label="${pos ? $t('其他野手') : $t('野手（依位置）')}">${rest.map(o(sel)).join('')}</optgroup>` : '');
  };
  const pOpt = (sel, role, none) => {
    const roles = [role, ...['SP', 'RP', 'CL'].filter((x) => x !== role)];
    return (none ? $t('<option value="">（無）</option>') : '') + roles.map((ro) => { const g = P.filter((i) => card(i).pos === ro).sort((a, b) => fo(b) - fo(a)); return g.length ? `<optgroup label="${PS[ro]}">${g.map(o(sel)).join('')}</optgroup>` : ''; }).join('');
  };
  const posOpt = (sel) => FPOS.map((x) => `<option ${x === sel ? 'selected' : ''} value="${x}">${PS[x]}</option>`).join('');
  const mini = (i) => { const r = R.get(i.uid); return isPitcher(i) ? `<span class="mini">${$L(`速${r.fastball} 變${r.breaking} 控${r.control} 體${r.stamina}`, `FB${r.fastball} BRK${r.breaking} CTL${r.control} STA${r.stamina}`)}</span>` : `<span class="mini">${$L(`打${r.contact} 力${r.power} 速${r.speed} 守${r.defense}`, `CON${r.contact} POW${r.power} SPD${r.speed} DEF${r.defense}`)}</span>`; };
  const prow = (k, kind, sel, role) => { const i = sel != null ? instOf(sel) : null; return `<tr><td>${k + 1}</td><td><select data-${kind}="${k}">${pOpt(sel, role, true)}</select></td><td>${i ? mini(i) : ''}</td></tr>`; };
  // the roster table: every player, sortable, with a one-click "put him here"
  let list = lnFilter === 'H' ? H.slice() : lnFilter === 'P' ? P.slice() : S.cards.slice();
  list.sort(lnSort === 'pos' ? (a, b) => posRank(a) - posRank(b) || fo(b) - fo(a) : lnSort === 'ovr' ? (a, b) => fo(b) - fo(a) : lnSort === 'lv' ? (a, b) => b.lv - a.lv || fo(b) - fo(a) : (a, b) => (W[a.uid] ? 0 : 1) - (W[b.uid] ? 0 : 1) || posRank(a) - posRank(b));
  const putOpt = (i) => {
    const nm = (u) => (u != null && instOf(u) ? card(instOf(u)).name : $t('空'));
    const opts = isPitcher(i)
      ? [...[0, 1, 2, 3, 4].map((k) => [`sp:${k}`, $L(`先發${k + 1}（${nm(L.sp[k])}）`, `SP${k + 1} (${nm(L.sp[k])})`)]), ...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => [`rp:${k}`, $L(`牛棚${k + 1}（${nm(L.rp[k])}）`, `Bullpen ${k + 1} (${nm(L.rp[k])})`)]), ['cl:0', $L(`終結者（${nm(L.cl)}）`, `Closer (${nm(L.cl)})`)]]
      : [...L.order.map((x, k) => [`ord:${k}`, $L(`第${k + 1}棒・${PS[x.pos]}（${nm(x.uid)}）`, `#${k + 1} · ${PS[x.pos]} (${nm(x.uid)})`)]), ...[0, 1, 2, 3, 4, 5].map((k) => [`bench:${k}`, $L(`板凳${k + 1}（${nm(L.bench[k])}）`, `Bench ${k + 1} (${nm(L.bench[k])})`)])];
    return `<select data-put="${i.uid}"><option value="">${$t('放到')}…</option>${opts.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join('')}${W[i.uid] ? $t('<option value="out">移出陣容</option>') : ''}</select>`;
  };
  return `<section class="panel"><div class="bar"><h3>${$t('陣容')}</h3><span class="grow"></span><button id="auto" class="big">⚡ ${$t('自動排陣')}</button></div>
    ${probs.length ? `<p class="bad">⚠ ${probs.join($t('、'))}</p>` : $t('<p class="good">✔ 陣容完整</p>')}
    <div class="cols"><div><h4>${$t('打線')} <small class="muted">${$t('下拉選單裡「可守該位置」的球員排在最前面')}</small></h4><table class="box lineup">${L.order.map((x, k) => { const i = instOf(x.uid);
      return `<tr><td>${k + 1}</td><td><select data-pos="${k}">${posOpt(x.pos)}</select></td><td><select data-ord="${k}">${hOpt(x.uid, x.pos)}</select></td><td>${fitBadge(card(i), x.pos)}</td><td>${mini(i)}</td>
      <td class="nw"><button data-up="${k}" ${k ? '' : 'disabled'}>▲</button><button data-dn="${k}" ${k < 8 ? '' : 'disabled'}>▼</button></td></tr>`; }).join('')}</table>
      <h4>${$t('板凳（代打、代跑、守備替補）')}</h4><table class="box lineup">${[0, 1, 2, 3, 4, 5].map((k) => { const i = L.bench[k] != null ? instOf(L.bench[k]) : null; return `<tr><td>${k + 1}</td><td><select data-bench="${k}">${hOpt(L.bench[k], null, true)}</select></td><td>${i ? posTag(card(i)) : ''}</td><td>${i ? mini(i) : ''}</td></tr>`; }).join('')}</table></div>
    <div><h4>${$t('先發輪值')}</h4><table class="box lineup">${[0, 1, 2, 3, 4].map((k) => prow(k, 'sp', L.sp[k], 'SP')).join('')}</table>
      <h4>${$t('牛棚')}</h4><table class="box lineup">${[0, 1, 2, 3, 4, 5, 6, 7].map((k) => prow(k, 'rp', L.rp[k], 'RP')).join('')}</table>
      <h4>${$t('終結者')}</h4><table class="box lineup">${prow(0, 'cl', L.cl, 'CL')}</table></div></div></section>
    <section class="panel"><div class="bar"><h3>${$t('球員名單')} <small class="muted">${list.length} ${$t('人')}・${$t('用「放到')}…${$t('」直接排進陣容')}</small></h3><span class="grow"></span>
      ${[['all', $t('全部')], ['H', $t('野手')], ['P', $t('投手')]].map(([k, l]) => `<button data-lf="${k}" class="${lnFilter === k ? 'on' : ''}">${l}</button>`).join('')}
      <select id="lnsort">${[['pos', $t('依位置')], ['ovr', $t('依能力')], ['lv', $t('依等級')], ['use', $t('已登錄優先')]].map(([k, l]) => `<option value="${k}" ${lnSort === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <table class="box roster"><tr><th>${$t('位置')}</th><th>${$t('球員')}</th><th>${$t('能力')}</th><th>${$t('主要數值')}</th><th>${$t('特色')}</th><th>${$t('目前')}</th><th></th></tr>
    ${page(list, 'ln').map((i) => { const c = card(i); return `<tr class="${W[i.uid] ? 'in' : ''}"><td>${posTag(c)}</td><td><b class="r-${c.rarity}">${c.rarity}</b> <a data-pd="${i.uid}">${esc(c.name)}</a> <small class="muted">Lv${i.lv}</small></td><td><b>${fo(i)}</b></td><td>${mini(i)}</td>
      <td>${(c.traits || []).map((t) => `<span title="${TRAITS[t].name}">${TRAITS[t].icon}</span>`).join('')}</td><td>${W[i.uid] || '<span class="muted">—</span>'}</td><td>${putOpt(i)}</td></tr>`; }).join('')}</table>${pager(list.length, 'ln')}</section>`;
}
function playersHTML() {
  let list = S.cards.slice();
  if (plFilter === 'H') list = list.filter((i) => !isPitcher(i)); if (plFilter === 'P') list = list.filter(isPitcher);
  list.sort(plSort === 'ovr' ? (a, b) => fo(b) - fo(a) : plSort === 'rar' ? (a, b) => ORDER.indexOf(card(b).rarity) - ORDER.indexOf(card(a).rarity) || fo(b) - fo(a) : (a, b) => b.lv - a.lv);
  return `<section class="panel"><div class="bar"><h3>${$t('我的球員')} <small class="muted">${S.cards.length} ${$t('人')}</small></h3><span class="grow"></span>
    ${[['all', $t('全部')], ['H', $t('野手')], ['P', $t('投手')]].map(([k, l]) => `<button data-pf="${k}" class="${plFilter === k ? 'on' : ''}">${l}</button>`).join('')}
    <select id="psort"><option value="ovr" ${plSort === 'ovr' ? 'selected' : ''}>${$t('依能力')}</option><option value="rar" ${plSort === 'rar' ? 'selected' : ''}>${$t('依稀有度')}</option><option value="lv" ${plSort === 'lv' ? 'selected' : ''}>${$t('依等級')}</option></select></div>
    <div class="grid">${page(list, 'pl').map((i) => cardHTML(card(i), i)).join('')}</div>${pager(list.length, 'pl')}</section>`;
}
function dexHTML() {
  const have = (c) => !!S.dex[c.cid], n = POOL.filter(have).length, total = POOL.length - EXS.filter((c) => !have(c)).length;
  const list = POOL.filter((c) => dexFilter === 'all' || c.rarity === dexFilter);
  return `<section class="panel"><div class="bar"><h3>${$t('圖鑑')} <small class="muted">${$t('收集')} ${n} / ${total}</small></h3><span class="grow"></span>
    ${['all', ...ORDER].map((r) => `<button data-df="${r}" class="${dexFilter === r ? 'on' : ''}">${r === 'all' ? $t('全部') : r === 'EX' ? $t('隱藏') : r} ${r === 'all' ? '' : POOL.filter((c) => c.rarity === r && have(c)).length + '/' + (r === 'EX' ? '?' : POOL.filter((c) => c.rarity === r).length)}</button>`).join('')}</div>
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
      if (inOrder && old == null) return toast($t('打線不能空著：請改放到有人的位置，或在打線直接換人'));
      if (uid != null) {
        const o = L.order.find((x) => x.uid === uid); if (o) o.uid = old;
        for (const a of ['bench', 'sp', 'rp']) { const j = L[a].indexOf(uid); if (j >= 0) L[a][j] = old; }
        if (L.cl === uid) L.cl = old;
      }
      if (kind === 'ord') L.order[k].uid = uid; else if (kind === 'cl') L.cl = uid; else L[kind][k] = uid;
      tidy();
    };
    $('#auto').onclick = () => { autoLineup(); save(); render(); toast($t('已依位置與能力自動排好陣容')); };
    document.querySelectorAll('[data-ord]').forEach((s) => s.onchange = () => put('ord', +s.dataset.ord, +s.value));
    document.querySelectorAll('[data-pos]').forEach((s) => s.onchange = () => { const k = +s.dataset.pos, p = s.value, other = L.order.find((o, j) => j !== k && o.pos === p); if (other) other.pos = L.order[k].pos; L.order[k].pos = p; tidy(); });
    document.querySelectorAll('[data-up]').forEach((b) => b.onclick = () => { const k = +b.dataset.up; [L.order[k - 1], L.order[k]] = [L.order[k], L.order[k - 1]]; tidy(); });
    document.querySelectorAll('[data-dn]').forEach((b) => b.onclick = () => { const k = +b.dataset.dn; [L.order[k + 1], L.order[k]] = [L.order[k], L.order[k + 1]]; tidy(); });
    for (const kind of ['bench', 'sp', 'rp', 'cl']) document.querySelectorAll(`[data-${kind}]`).forEach((s) => s.onchange = () => put(kind, +s.dataset[kind], s.value === '' ? null : +s.value));
    document.querySelectorAll('[data-put]').forEach((s) => s.onchange = () => {
      const uid = +s.dataset.put;
      if (s.value === 'out') {
        if (L.order.some((x) => x.uid === uid)) { toast($t('打線不能空著：請先換另一位球員上場')); return render(); }
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
    document.querySelectorAll('[data-sellc]').forEach((b) => b.onclick = () => { const c = S.coaches.find((x) => x.id === +b.dataset.sellc); if (!confirm($L(`與 ${c.name} 解約？`, `Release coach ${I18N.nm(c.name)}?`))) return; S.coins += ITEMS.SELL_C[c.rar]; S.coaches = S.coaches.filter((x) => x !== c); save(); render(); });
    document.querySelectorAll('[data-sellg]').forEach((b) => b.onclick = () => { const g = S.gear.find((x) => x.id === +b.dataset.sellg); if (!confirm($L(`賣出 ${g.name}？`, `Sell ${g.name}?`))) return; S.coins += ITEMS.SELL_G[g.rar]; S.gear = S.gear.filter((x) => x !== g); save(); render(); });
  },
  pvp() {
    const h = $('#pvHost'); if (h) h.onclick = pvpHost;
    const j = $('#pvJoin'); if (j) j.onclick = () => pvpJoin($('#pvCode').value);
    const ci = $('#pvCode'); if (ci) ci.onkeydown = (e) => { if (e.key === 'Enter') pvpJoin(ci.value); };
    const l = $('#pvLeave'); if (l) l.onclick = () => { pvpLeave(); render(); };
    const a = $('#pvAgain'); if (a) a.onclick = () => { PV.ch.send({ t: 'again', from: pvpId }); PV.status = $t('已邀請再戰，等待對手⋯'); render(); };
    const cp = $('#pvCopy'); if (cp) cp.onclick = () => { try { navigator.clipboard.writeText(PV.code); toast($t('已複製房號 ') + PV.code); } catch (e) { /* ignore */ } };
  },
  cup() {
    document.querySelectorAll('[data-cup]').forEach((b) => b.onclick = () => { const k = +b.dataset.cup; if (!confirm($L(`報名${CUPS[k].name}？報名費 🪙${CUPS[k].fee.toLocaleString()}`, `Enter the ${CUPS[k].name}? Entry fee 🪙${CUPS[k].fee.toLocaleString()}`))) return; cupEnter(k); render(); });
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
  { name: $t('新人盃'), icon: '🌱', fee: 100, ovr: 46, coins: [800, 450, 250, 100], packs: [['premium', 'gear'], ['std'], [], []] },
  { name: $t('地區盃'), icon: '🥉', fee: 400, ovr: 55, coins: [1800, 1000, 500, 200], packs: [['premium', 'premium', 'gear2'], ['premium', 'gear'], ['std'], []] },
  { name: $t('全國盃'), icon: '🥈', fee: 1000, ovr: 64, coins: [4000, 2200, 1100, 400], packs: [['star', 'gear2', 'coach'], ['premium', 'premium', 'gear2'], ['premium'], []] },
  { name: $t('亞洲盃'), icon: '🥇', fee: 2500, ovr: 73, coins: [8000, 4500, 2200, 800], packs: [['star', 'star', 'coach2', 'gear2'], ['star', 'gear2'], ['premium', 'premium'], ['std']] },
  { name: $t('世界盃'), icon: '🌏', fee: 5000, ovr: 82, coins: [16000, 9000, 4500, 1600], packs: [['legend', 'coach2', 'gear2', 'gear2'], ['star', 'star', 'coach2'], ['star', 'gear2'], ['premium']] },
  { name: $t('傳奇盃'), icon: '👑', fee: 10000, ovr: 92, coins: [32000, 18000, 9000, 3000], packs: [['legend', 'legend', 'coach2', 'coach2', 'gear2', 'gear2'], ['legend', 'coach2', 'gear2'], ['star', 'star', 'gear2'], ['star']] },
];
const PLACE = [$t('冠軍'), $t('亞軍'), $t('四強'), $t('八強')], RNAME = [$t('八強賽'), $t('準決賽'), $t('決賽')];
const packList = (ks) => { const n = {}; for (const k of ks) n[k] = (n[k] || 0) + 1; return Object.entries(n).map(([k, c]) => `${anyPack(k).name}${c > 1 ? '×' + c : ''}`).join($t('、')); };
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
const cupName = (C, i) => (i === 0 ? S.name : I18N.team(C.teams[i].full));
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
  if (lineupProblems().length) return toast($t('陣容不完整，請先到「陣容」調整'));
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
      return `<div class="bm">${row(pr && pr.a, pr && pr.ra, 'a')}${row(pr && pr.b, pr && pr.rb, 'b')}${pr && pr.tb ? $t('<small>平手：安打數多者晉級</small>') : ''}</div>`;
    };
    return `<div class="bcol"><h4>${RNAME[r]}</h4><div class="bbs">${Array.from({ length: n }, (_, k) => box(pairs[k])).join('')}</div></div>`;
  });
  const fin = C.rounds[2] && C.rounds[2][0].w;
  return `<div class="bracket">${cols.join('')}<div class="bcol champ"><h4>${$t('冠軍')}</h4><div class="bbs"><div class="bm">${fin != null ? `<div class="bt win ${fin === 0 ? 'me' : ''}">🏆 ${esc(cupName(C, fin))}</div>` : $t('<div class="bt tbd">？</div>')}</div></div></div></div>`;
}
function cupHTML() {
  const C = S.cup, live = C && !C.over, to = teamOvr();
  let top = '';
  if (C) {
    const cup = CUPS[C.k], pr = live ? myPair() : null;
    top = `<section class="panel"><div class="bar"><h3>${cup.icon} ${cup.name} ${live ? `<small class="muted">${RNAME[C.round]}</small>` : `<small class="${C.place === 0 ? 'good' : ''}">${$t('最終成績：')}${PLACE[C.place]}</small>`}</h3><span class="grow"></span>
      ${live ? `<span class="muted">${$t('下一場：')}vs ${esc(cupName(C, pr.a === 0 ? pr.b : pr.a))}</span><button class="big" id="cupWatch">▶ ${$t('觀看比賽')}</button><button id="cupQuick">⏭ ${$t('快速模擬')}</button>` : ''}</div>
      ${bracketHTML(C)}</section>`;
  }
  const best = S.cupBest || {};
  return top + `<section class="panel"><h3>🏆 ${$t('盃賽報名')} <small class="muted">8 ${$t('隊單淘汰。名次越高、盃賽等級越高，獎金和卡包越好。你的球隊戰力')} <b>${to}</b></small></h3>
    <div class="packs cups">${CUPS.map((c, k) => `<div class="pack cupc ${to >= c.ovr ? '' : 'hard'}"><div class="pkart">${c.icon}</div><h4>${c.name}</h4>
      <p>${$t('對手戰力 約')} <b>${c.ovr}</b>${best[k] != null ? `${$t('　最佳：')}<b class="good">${PLACE[best[k]]}</b>` : ''}</p>
      <table class="prize">${PLACE.map((pl, i) => `<tr><td>${pl}</td><td>🪙${c.coins[i].toLocaleString()}</td><td>${packList(c.packs[i]) || ''}</td></tr>`).join('')}</table>
      <button class="big" data-cup="${k}" ${live || S.coins < c.fee ? 'disabled' : ''}>${live ? $t('盃賽進行中') : `${$t('報名')} 🪙${c.fee.toLocaleString()}`}</button></div>`).join('')}</div></section>`;
}
function cupResultDialog(o) {
  const lv = o.ups.map((u) => `${esc(card(u.inst).name)} Lv${u.inst.lv}${Math.floor(u.inst.lv / 100) > Math.floor((u.inst.lv - u.n) / 100) ? $t('（🎲 獲得技能重骰機會！）') : ''}`).join($t('、'));
  const f = o.finish;
  const m = modal(`<h2>${o.cup.icon} ${o.cup.name}・${RNAME[o.round]}</h2><h2>${o.win ? $t('🎉 晉級！') : $t('敗退')}</h2><div class="big score">${o.rMe} : ${o.rOp}</div>
    ${o.tb ? $t('<p class="muted">平手：以安打數決定晉級隊伍</p>') : ''}<p>vs ${esc(o.opp)}${o.mvp ? `${$t('　')}MVP${$t('：')}<b>${esc(o.mvp.name)}</b>` : ''}</p>${lv ? `<p class="good">${$t('升級：')}${lv}</p>` : ''}
    ${f ? `<div class="season"><h3>${f.place === 0 ? '🏆 ' : ''}${$t('最終成績：')}${PLACE[f.place]}</h3><p>🪙 +${f.coins.toLocaleString()}${f.packs.length ? `${$t('　')}🎟 ${packList(f.packs)}` : ''}</p>${f.packs.length ? $t('<p class="muted">卡包已放進「抽卡 → 我的卡包」</p>') : ''}</div>` : `<p>${$t('下一輪：')}${RNAME[o.round + 1]}</p>`}
    <div class="row"><button class="big" id="ok">${f && f.packs.length ? $t('去開卡包') : $t('回到盃賽')}</button></div>`);
  m.querySelector('#ok').onclick = () => { closeModal(); screen = f && f.packs.length ? 'packs' : 'cup'; render(); };
}

// ---------------------------------------------------------------- online versus: one room code, both clubs, the same seeded game on both screens
const PVP_REWARD = { win: 400, tie: 200, loss: 150 }, PVP_DAILY = 10;
const pvpId = Math.random().toString(36).slice(2, 10);
let PV = null;                       // { role: 'host' | 'guest', code, ch, net, opp, guest, busy, hostFinal }
function packPvp(t) {
  return Object.assign(Object.fromEntries(TKEYS.map((k) => [k, t[k]])), {
    roster: t.roster.map((p) => Object.assign(Object.fromEntries(PKEYS.map((k) => [k, p[k]])), { uid: p.uid, lookSeed: p.lookSeed, star: p.star, rarity: p.rarity })),
    order: t.order.map((o) => ({ id: o.p.id, pos: o.pos })), ovr: teamOvr() });
}
// both browsers build the two teams the same way: the guest's players get ids offset so they never clash with the host's
function unpackPvp(d, off) {
  const t = unpackTeam(d);
  for (const p of t.roster) p.id += off;
  t.order = d.order.map((o) => ({ p: t.roster.find((p) => p.id === o.id + off), pos: o.pos }));
  return t;
}
function pvpHost() {
  if (lineupProblems().length) return toast($t('陣容不完整，請先到「陣容」調整'));
  pvpLeave();
  PV = { role: 'host', code: NET.code(), opp: null }; screen = 'pvp';
  PV.ch = NET.join(PV.code, pvpMsg, (s) => { if (PV) { PV.net = s; pvpRefresh(); } });
  render();
}
function pvpJoin(code) {
  code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 5) return toast($t('房號是 5 個英數字'));
  if (lineupProblems().length) return toast($t('陣容不完整，請先到「陣容」調整'));
  pvpLeave();
  PV = { role: 'guest', code, opp: null }; screen = 'pvp';
  PV.ch = NET.join(code, pvpMsg, (s) => { if (!PV) return; PV.net = s; if (s === 'ready') pvpHello(); pvpRefresh(); });
  PV.knock = setInterval(() => { if (PV && !PV.busy && !PV.opp && PV.net === 'ready') pvpHello(); }, 2500);   // keep knocking until the host answers
  render();
}
const pvpHello = () => PV && PV.ch.send({ t: 'join', from: pvpId, name: S.name, team: packPvp(myTeam()) });
function pvpLeave() {
  if (!PV) return;
  clearInterval(PV.knock); PV.ch.send({ t: 'bye', from: pvpId });
  const ch = PV.ch; setTimeout(() => ch.close(), 300); PV = null;
}
function pvpMsg(m) {
  if (!PV || !m || m.from === pvpId) return;
  if (m.t === 'join' && PV.role === 'host') {
    if (PV.busy || (PV.guest && PV.guest !== m.from)) return;               // playing already, or the room is taken
    if (lineupProblems().length) { toast($t('你的陣容不完整，無法開賽')); return; }
    PV.guest = m.from; PV.opp = { name: m.name, ovr: m.team.ovr };
    const seed = Math.floor(Math.random() * 2147483647), host = packPvp(myTeam());
    PV.ch.send({ t: 'start', from: pvpId, to: m.from, seed, host, guest: m.team });
    pvpPlay(seed, host, m.team);
  } else if (m.t === 'start' && PV.role === 'guest' && m.to === pvpId && !PV.busy) {
    PV.opp = { name: m.host.name, ovr: m.host.ovr };
    pvpPlay(m.seed, m.host, m.guest);
  } else if (m.t === 'again' && PV.role === 'guest' && !PV.busy) { PV.opp = null; pvpHello(); toast($t('房主邀請再戰！')); }
  else if (m.t === 'final') PV.hostFinal = m.R;
  else if (m.t === 'emo') floatEmo(m.e, PV.opp ? PV.opp.name : $t('對手'));
  else if (m.t === 'bye') {
    toast($t('對手離開了房間'));
    if (!PV.busy) { if (PV.role === 'guest') pvpLeave(); else { PV.opp = null; PV.guest = null; } if (screen === 'pvp' && !$('#club').hidden) render(); }
  }
}
function pvpStatusText() {
  if (!PV) return '';
  if (PV.net === 'error') return $t('❌ 連線失敗，請離開房間再試一次');
  if (PV.net !== 'ready') return PV.net === 'reconnecting' ? $t('⏳ 重新連線中⋯') : $t('⏳ 連線中⋯');
  if (PV.busy) return `⚔ ${$t('對戰中：')}vs ${PV.opp ? PV.opp.name : ''}`;
  if (PV.role === 'host') return PV.opp ? `${$t('對手：')}${PV.opp.name}${$t('（戰力')} ${PV.opp.ovr}${$t('）')}` : $t('✅ 房間已開好，把房號告訴朋友，對方加入後自動開賽');
  return $t('✅ 已進入房間，等待房主回應⋯');
}
function pvpRefresh() { const el = $('#pvpStatus'); if (el) el.textContent = pvpStatusText(); }
function pvpPlay(seed, hostPack, guestPack) {
  PV.busy = true; PV.hostFinal = null; clearInterval(PV.knock); PV.knock = null;
  const meHost = PV.role === 'host', away = unpackPvp(guestPack, 500000), home = unpackPvp(hostPack, 0);
  if (away.bar === home.bar) { const alt = COLORS.find((c) => c.bar !== home.bar); Object.assign(away, { hat: alt.hat, shirt: alt.shirt, trim: alt.trim, pants: alt.pants, bar: alt.bar }); }
  if (away.name === home.name) away.name = away.full = away.name + $t('（客）');
  const mine = meHost ? home : away;
  closeModal();
  BB.setRng(CARDS.rng(seed));
  $('#club').hidden = true; $('#match').hidden = false; pvpBar(true);
  Match.start(away, home, { autoplay: true, onEnd: (res) => {
    BB.setRng(null); pvpBar(false);
    if (meHost && PV) PV.ch.send({ t: 'final', from: pvpId, R: res.R });
    pvpResult(res, mine, meHost ? 1 : 0);
  } });
}
function pvpBar(on) {
  const old = $('#pvbar'); if (old) old.remove();
  if (!on || !PV) return;
  const bar = $('#match .bar'), d = document.createElement('span'); d.id = 'pvbar';
  d.innerHTML = `<b>⚔ vs ${esc(PV.opp ? PV.opp.name : '')}</b>${['👏', '🔥', '😂', '😱', '💪', '🙏'].map((e) => `<button data-emo="${e}">${e}</button>`).join('')}`;
  bar.insertBefore(d, bar.querySelector('.grow'));
  d.querySelectorAll('[data-emo]').forEach((b) => b.onclick = () => { if (PV) PV.ch.send({ t: 'emo', from: pvpId, e: b.dataset.emo }); floatEmo(b.dataset.emo, $t('你')); });
}
function floatEmo(e, who) {
  const box = $('#field') ? $('#field').getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
  const d = document.createElement('div'); d.className = 'emo'; d.innerHTML = `<span>${e}</span><small>${esc(who)}</small>`;
  d.style.left = (box.left + box.width * (0.2 + Math.random() * 0.6)) + 'px'; d.style.top = (box.top + box.height * 0.6) + 'px';
  document.body.appendChild(d); setTimeout(() => d.remove(), 2200);
}
function pvpResult(res, mine, my) {
  const me = res.R[my], op = res.R[1 - my], win = me > op, tie = me === op, d = today();
  S.pvp = Object.assign({ W: 0, L: 0, T: 0, n: 0, day: d }, S.pvp || {});
  if (S.pvp.day !== d) { S.pvp.day = d; S.pvp.n = 0; }
  S.pvp[win ? 'W' : tie ? 'T' : 'L']++;
  let coins = 0;
  if (S.pvp.n < PVP_DAILY) { coins = PVP_REWARD[win ? 'win' : tie ? 'tie' : 'loss']; S.pvp.n++; S.coins += coins; }
  S.rotation = mine.rotation;
  const { ups, mvp } = gainFromGame(res, mine, my, win);
  save();
  if (PV) PV.busy = false;
  const host = PV && PV.role === 'host', opp = PV && PV.opp ? PV.opp.name : $t('對手');
  const lv = ups.map((u) => `${esc(card(u.inst).name)} Lv${u.inst.lv}`).join($t('、'));
  const m = modal(`<h2>⚔ ${$t('連線對戰')} vs ${esc(opp)}</h2><h2>${win ? $t('🎉 勝利！') : tie ? $t('平手') : $t('敗戰')}</h2><div class="big score">${me} : ${op}</div>
    <p>${coins ? `🪙 +${coins}` : $t('今日的對戰獎勵已領完')}${mvp ? `${$t('　')}MVP${$t('：')}<b>${esc(mvp.name)}</b>` : ''}</p>${lv ? `<p class="good">${$t('升級：')}${lv}</p>` : ''}
    <p class="muted">${$L(`對戰戰績 ${S.pvp.W} 勝 ${S.pvp.L} 敗 ${S.pvp.T} 和`, `Versus record ${S.pvp.W}-${S.pvp.L}-${S.pvp.T}`)}</p>
    <div class="row">${host ? $t('<button class="big" id="again">⚔ 再戰一場</button>') : ''}<button id="ok">${$t('回到對戰大廳')}</button></div>`);
  const a = m.querySelector('#again'); if (a) a.onclick = () => { closeModal(); screen = 'pvp'; if (PV) { PV.ch.send({ t: 'again', from: pvpId }); } render(); };
  m.querySelector('#ok').onclick = () => { closeModal(); screen = 'pvp'; render(); };
}
function pvpHTML() {
  const p = S.pvp || { W: 0, L: 0, T: 0 }, used = S.pvp && S.pvp.day === today() ? S.pvp.n : 0, probs = lineupProblems();
  const room = PV ? `<section class="panel room"><h3>${PV.role === 'host' ? $t('🏠 你的房間') : $t('🚪 已加入房間')}</h3>
    <div class="code">${PV.code}${PV.role === 'host' ? $t('<button id="pvCopy">📋 複製</button>') : ''}</div>
    <p id="pvpStatus">${pvpStatusText()}</p>
    <div class="row">${PV.role === 'host' && PV.opp && !PV.busy ? $t('<button class="big" id="pvAgain">⚔ 再戰一場</button>') : ''}<button id="pvLeave">${$t('離開房間')}</button></div></section>` : '';
  return `<section class="panel"><h3>⚔ ${$t('連線對戰')} <small class="muted">${$t('和朋友用房號對打：雙方用各自的陣容、技能、裝備與教練，同一場比賽在兩邊同步上演。')}</small></h3>
    <p>${$L(`對戰戰績：<b>${p.W}</b> 勝 <b>${p.L}</b> 敗 <b>${p.T}</b> 和・你的球隊戰力 <b>${teamOvr()}</b>・今日還有 <b>${Math.max(0, PVP_DAILY - used)}</b> 場有金幣獎勵（勝 🪙${PVP_REWARD.win}／和 ${PVP_REWARD.tie}／敗 ${PVP_REWARD.loss}）`, `Versus record: <b>${p.W}</b>-<b>${p.L}</b>-<b>${p.T}</b> · Your team rating <b>${teamOvr()}</b> · <b>${Math.max(0, PVP_DAILY - used)}</b> rewarded games left today (win 🪙${PVP_REWARD.win} / tie ${PVP_REWARD.tie} / loss ${PVP_REWARD.loss})`)}</p>
    ${probs.length ? `<p class="bad">⚠ ${probs.join($t('、'))}${$t('，請先到「陣容」調整')}</p>` : ''}
    ${PV ? '' : `<div class="packs pvpbtns"><div class="pack"><div class="pkart">🏠</div><h4>${$t('建立房間')}</h4><p>${$t('拿到 5 碼房號，傳給朋友')}</p><button class="big" id="pvHost" ${probs.length ? 'disabled' : ''}>${$t('建立房間')}</button></div>
      <div class="pack"><div class="pkart">🚪</div><h4>${$t('加入房間')}</h4><p>${$t('輸入朋友給你的房號')}</p><input id="pvCode" maxlength="5" placeholder="K7QX2" autocomplete="off"><button class="big" id="pvJoin" ${probs.length ? 'disabled' : ''}>${$t('加入')}</button></div></div>`}</section>${room}`;
}

// ---------------------------------------------------------------- dialogs
function modal(html, cls = '') { const m = $('#modal'); m.innerHTML = `<div class="dlg panel ${cls}">${html}</div>`; m.hidden = false; return m; }
const closeModal = () => { $('#modal').hidden = true; };
function newClubDialog() {
  $('#match').hidden = true; $('#club').hidden = false; $('#nav').innerHTML = ''; $('#screen').innerHTML = '';
  const m = modal(`<h2>⚾ ${$t('建立你的球隊')}</h2><p>${$t('從一支新人隊開始：在聯盟裡比賽賺金幣，抽卡包招募更強的球員，讓他們升級、升星，一路打進傳奇聯盟！')}</p>
    <label>${$t('球隊名稱')} <input id="tname" maxlength="10" value="${$t('我的球隊')}"></label>
    <label>${$t('球隊顏色')}</label><div class="colors">${COLORS.map((c, i) => `<button data-col="${i}" class="${i ? '' : 'on'}" style="background:${c.bar}" title="${I18N.team(c.name)}">${I18N.team(c.name)}</button>`).join('')}</div>
    <div class="row"><button class="big" id="go">${$t('開始！')}</button></div>`);
  let col = 0;
  m.querySelectorAll('[data-col]').forEach((b) => b.onclick = () => { col = +b.dataset.col; m.querySelectorAll('[data-col]').forEach((x) => x.classList.toggle('on', x === b)); });
  m.querySelector('#go').onclick = () => { newClub(m.querySelector('#tname').value.trim() || $t('我的球隊'), col); closeModal(); doOpen('std', true, true); };
}
// open a pack: five face-down cards that flip one by one
function doOpen(kind, free, first) {
  const got = openPack(kind, S), res = got.map((c) => addCard(S, c));
  S.packs = (S.packs || 0) + 1; save(); nav();
  const m = modal(`<h2>${first ? $t('🎁 新人禮物：') : free ? '🎁 ' : ''}${PACKS[kind].name}</h2>
    <div class="reveal">${got.map((c, k) => `<div class="flip ${c.rarity === 'EX' ? 'ex' : c.rarity === 'LR' ? 'lr' : ''}" data-k="${k}"><div class="back">⚾</div><div class="front">${cardHTML(c, res[k].inst)}
      <div class="tag t-${res[k].kind}">${res[k].kind === 'new' ? (c.rarity === 'EX' ? $t('✦ 隱藏球員登場！') : 'NEW!') : res[k].kind === 'star' ? `★ ${$t('升星')} ${res[k].inst.stars}★${res[k].learned ? `<br>${$t('習得「')}${SK[res[k].learned].name}${$t('」')}` : ''}` : $t('經驗 +600')}</div></div></div>`).join('')}</div>
    <div class="row"><button id="flipAll">${$t('全部翻開')}</button><button class="big" id="done">${$t('好！')}</button></div>`, 'wide');
  drawPortraits();
  const flips = [...m.querySelectorAll('.flip')];
  flips.forEach((f) => f.onclick = () => f.classList.add('open'));
  let k = 0; const t = setInterval(() => { if (k >= flips.length) return clearInterval(t); flips[k++].classList.add('open'); }, 420);
  m.querySelector('#flipAll').onclick = () => flips.forEach((f) => f.classList.add('open'));
  m.querySelector('#done').onclick = () => { clearInterval(t); closeModal(); render(); };
}
const REROLL_COST = 100000;
function playerDialog(inst) {
  const c = card(inst), r = fs(inst), rar = RARITY[c.rarity], keys = c.role === 'H' ? [['contact', $t('打擊')], ['power', $t('力量')], ['eye', $t('選球')], ['speed', $t('速度')], ['defense', $t('守備')], ['arm', $t('臂力')]] : [['fastball', $t('速球')], ['breaking', $t('變化球')], ['control', $t('控球')], ['stamina', $t('體力')]];
  const st = inst.st, line = !st ? $t('還沒有出賽紀錄') : c.role === 'H' ? $L(`${st.AB} 打數 ${st.H} 安打（打率 ${st.AB ? (st.H / st.AB).toFixed(3).replace(/^0/, '') : '.---'}）${st.HR} 轟 ${st.RBI} 打點`, `${st.H}-for-${st.AB} (${st.AB ? (st.H / st.AB).toFixed(3).replace(/^0/, '') : '.---'}) · ${st.HR} HR · ${st.RBI} RBI`) : $L(`${Math.floor(st.outs / 3)}.${st.outs % 3} 局 ${st.pSO} 三振 防禦率 ${st.outs ? (st.pER * 27 / st.outs).toFixed(2) : '-'} ${st.W} 勝 ${st.L} 敗 ${st.S} 救援`, `${Math.floor(st.outs / 3)}.${st.outs % 3} IP · ${st.pSO} K · ERA ${st.outs ? (st.pER * 27 / st.outs).toFixed(2) : '-'} · ${st.W}-${st.L} · ${st.S} SV`);
  const maxed = inst.lv >= LV_MAX, inUse = isUsed(inst.uid), b = bon(inst) || {};
  const traits = (c.traits || []).map((t) => `<li><b>${TRAITS[t].icon} ${TRAITS[t].name}</b><small>${traitDesc(t)}</small></li>`).join('');
  const eq = Object.entries(SLOT).map(([slot, d]) => { const opts = S.gear.filter((g) => g.slot === slot && (g.on == null || g.on === inst.uid)).sort((x, y) => ITEMS.RAR.indexOf(y.rar) - ITEMS.RAR.indexOf(x.rar));
    return `<label class="eq">${d.icon} ${d.name}<select data-eq="${slot}"><option value="">${$t('（無）')}</option>${opts.map((g) => `<option value="${g.id}" ${g.on === inst.uid ? 'selected' : ''}>${g.rar} ${g.name}${$t('｜')}${ITEMS.gearDesc(g)}</option>`).join('')}</select></label>`; }).join('');
  const m = modal(`<div class="pd">${cardHTML(c, inst, { cls: 'big' })}<div><h2>${esc(c.name)} <small class="r-${c.rarity}">${c.rarity}</small></h2>
    <p class="muted">${POS_CN[c.pos]}${$t('｜')}${c.role === 'H' ? (c.bats === 'R' ? $t('右打') : $t('左打')) : (c.throws === 'R' ? $t('右投') : $t('左投')) + ' ' + (c.velo || '') + 'km ' + (c.pitches || []).join($t('、'))}${$t('｜能力')} ${fo(inst)}</p>
    ${c.role === 'H' ? `<p class="muted">${$t('可守：')}${[c.pos, ...(c.alt || [])].map((x) => PS[x]).join($t('、'))}</p>` : ''}
    ${keys.map(([k, l]) => `<div class="rt"><span>${l}</span><i><b style="width:${Math.min(100, r[k])}%"></b></i><span>${r[k]}${b[k] ? `<small class="good"> +${b[k]}</small>` : ''}</span></div>`).join('')}
    ${traits ? `<h4>${$t('特色')}</h4><ul class="skl trl">${traits}</ul>` : ''}
    <h4>${$t('裝備')} <small class="muted">${S.gear.length ? '' : $t('到「抽卡」買裝備箱')}</small></h4><div class="eqs">${eq}</div>
    <p>Lv ${inst.lv} / ${LV_MAX}${$t('　')}${'★'.repeat(inst.stars)}${'☆'.repeat(STAR_MAX - inst.stars)}${$t('　')}${maxed ? $t('（等級已滿）') : `${$t('經驗')} ${inst.xp} / ${xpNeed(inst.lv)}`}</p>
    <h4>${$t('技能')} <small class="muted">${$L(`${(inst.sk || []).length} 個・可指定一個技能重骰：用重骰機會（Lv100／200／300／400／500 各得一次，目前剩 <b>${rerolls(inst)}</b> 次），或花 🪙${REROLL_COST.toLocaleString()}`, `${(inst.sk || []).length} · Reroll one chosen skill with a reroll chance (one each at Lv100/200/300/400/500, <b>${rerolls(inst)}</b> left) or 🪙${REROLL_COST.toLocaleString()}`)}</small></h4><ul class="skl">${(inst.sk || []).map((id, j) => { const k = SK[id]; return `<li class="g${k.grade} rr"><div><b style="color:${GR[k.grade].color}">${GR[k.grade].name}</b> ${esc(k.name)}<small>${SKILLS.desc(k)}</small></div>
      <span class="rrb"><button data-rr="${j}" data-pay="free" ${rerolls(inst) > 0 ? '' : 'disabled'} title="${$t('用一次重骰機會')}">🎲 ${$t('機會')}</button><button data-rr="${j}" data-pay="coin" ${S.coins >= REROLL_COST ? '' : 'disabled'} title="${$L(`花 ${REROLL_COST} 金幣`, `Costs ${REROLL_COST} coins`)}">🎲 🪙${REROLL_COST / 1000}K</button></span></li>`; }).join('') || $t('<li class="muted">沒有技能</li>')}</ul>
    <p class="muted">${$t('生涯：')}${line}</p>
    <div class="row"><button id="train" class="big" ${maxed || S.coins < 300 ? 'disabled' : ''}>💪 ${$t('特訓（')}🪙300${$t('，經驗 +200）')}</button>
    <button id="sell" ${inUse ? $t('disabled title="在陣容中，請先換下"') : ''}>${$t('釋出（')}🪙${rar.sell * inst.stars}${$t('）')}</button><button id="close">${$t('關閉')}</button></div></div></div>`, 'wide');
  drawPortraits();
  // reroll ONE chosen skill: the new one is random and never repeats a family the player already has
  m.querySelectorAll('[data-rr]').forEach((b) => b.onclick = () => {
    const j = +b.dataset.rr, free = b.dataset.pay === 'free', oldId = inst.sk[j];
    if (free ? rerolls(inst) <= 0 : S.coins < REROLL_COST) return;
    if (!confirm($L(`${free ? '用掉一次重骰機會' : `花 🪙${REROLL_COST.toLocaleString()}`}，重骰 ${c.name} 的「${SK[oldId].name}」？`, `${free ? 'Use a reroll chance' : `Spend 🪙${REROLL_COST.toLocaleString()}`} to reroll ${c.name}'s "${SK[oldId].name}"?`))) return;
    const id = SKILLS.rollOne(c, inst.sk); if (!id) return toast($t('沒有可以換的技能了'));
    if (free) inst.rru = (inst.rru || 0) + 1; else S.coins -= REROLL_COST;
    inst.sk[j] = id; save(); nav(); playerDialog(inst);
    toast(`${$t('「')}${SK[oldId].name}${$t('」')}→${$t('「')}${SK[id].name}${$t('」（')}${GR[SK[id].grade].name}${$t('）')}`);
  });
  m.querySelector('#train').onclick = () => { S.coins -= 300; const n = gainXp(inst, 200); save(); playerDialog(inst); if (n) toast(`${c.name} ${$L('升到', 'reached')} Lv ${inst.lv}${$t('！')}${Math.floor(inst.lv / 100) > Math.floor((inst.lv - n) / 100) ? $t(' 🎲 獲得技能重骰機會') : ''}`); };
  m.querySelectorAll('[data-eq]').forEach((sel) => sel.onchange = () => {
    for (const g of S.gear) if (g.on === inst.uid && g.slot === sel.dataset.eq) g.on = null;
    const g = S.gear.find((x) => x.id === +sel.value); if (g) g.on = inst.uid;
    save(); playerDialog(inst);
  });
  m.querySelector('#sell').onclick = () => { if (!confirm($L(`確定釋出 ${c.name}？`, `Release ${c.name}?`))) return; for (const g of S.gear) if (g.on === inst.uid) g.on = null; S.coins += rar.sell * inst.stars; S.cards = S.cards.filter((i) => i !== inst); save(); closeModal(); render(); };
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
  const lv = o.ups.map((u) => `${esc(card(u.inst).name)} Lv${u.inst.lv}${Math.floor(u.inst.lv / 100) > Math.floor((u.inst.lv - u.n) / 100) ? $t('（🎲 獲得技能重骰機會！）') : ''}`).join($t('、'));
  const s = o.season;
  const m = modal(`<h2>${o.win ? $t('🎉 勝利！') : o.tie ? $t('平手') : $t('敗戰')}</h2><div class="big score">${o.rMe} : ${o.rOp}</div>
    <p>🪙 +${o.coins}${o.mvp ? `${$t('　')}MVP${$t('：')}<b>${esc(o.mvp.name)}</b>` : ''}</p>${lv ? `<p class="good">${$t('升級：')}${lv}</p>` : ''}
    ${s ? `<div class="season"><h3>${$L(`球季結束：第 ${s.rank} 名`, `Season over: #${s.rank}`)}</h3><p>🪙 +${s.prize}${s.tickets ? $t('　🎟 冠軍高級包 ×1') : ''}</p>${s.ex ? `<p class="exwin">✦ ${$t('傳奇聯盟冠軍！隱藏超級球員')} <b>${esc(s.ex.card.name)}</b> ${s.ex.res.kind === 'new' ? $t('加入球隊！') : $t('升星！')}</p>` : ''}
      <p class="${s.move > 0 ? 'good' : s.move < 0 ? 'bad' : ''}">${s.move > 0 ? `⬆ ${$t('升級到')} ${DIVS[s.from + 1].name}${$t('！')}` : s.move < 0 ? `⬇ ${$t('降到')} ${DIVS[s.from - 1].name}` : `${$t('留在')} ${DIVS[s.from].name}`}</p></div>` : ''}
    <div class="row"><button class="big" id="ok">${$t('回到主場')}</button></div>`);
  m.querySelector('#ok').onclick = () => { closeModal(); screen = 'home'; render(); };
}
$('#btnBack').onclick = () => { if (!Match.finished && !confirm($t('比賽還沒結束，要直接模擬到結束嗎？'))) return; if (!Match.finished) Match.simToEnd(); else render(); };

// ---------------------------------------------------------------- go
S = load();
migrate();
if (S && !S.league) newSeason(0);
render();
cloudInit();
window.__club = { get S() { return S; }, get PV() { return PV; }, pvpHost, pvpJoin, packPvp, unpackPvp, myTeam, render, autoLineup, lineupProblems, openBoxDlg, fo, endSeason, playerDialog, cupEnter, playCup, CUPS, newClub, doOpen, playMatch, afterGame, setScreen: (k) => { screen = k; render(); } };
})();
