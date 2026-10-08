// 畫面：像素球場、球員精靈、時間軸動畫播放與資訊面板
(function () {
'use strict';
const { Game, makeMatch, POS_XY, BASE, FIELD, POS_CN, POS_SHORT, fence, newStats } = BB;

const W = 540, H = 480, OX = 270, OY = 445, S = 2;
const DEG = Math.PI / 180;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const cv = document.getElementById('field');
cv.width = W * S; cv.height = H * S;
const ctx = cv.getContext('2d');
const FONT = '"Microsoft JhengHei","PingFang TC","Noto Sans TC",sans-serif';

// ---------------- 球場背景（逐像素生成） ----------------
function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
const DUG = [{ x0: -182, x1: -92, y0: -8, y1: 24 }, { x0: 92, x1: 182, y0: -8, y1: 24 }];
const PEN = [{ x0: -257, x1: -183, y0: 336, y1: 362 }, { x0: 183, x1: 257, y0: 336, y1: 362 }];

function buildField() {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H), d = img.data;
  const stand = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const fx = x - OX + 0.5, fy = OY - y - 0.5, r = Math.hypot(fx, fy), th = Math.atan2(fx, fy) / DEG;
    const fair = fy >= 0 && Math.abs(fx) <= fy;
    const fz = fence(Math.min(45, Math.abs(th)));
    if (r > fz || (!fair && ((Math.abs(fx) - fy) / Math.SQRT2 > 52 || fy < -40))) stand[y * W + x] = 1;
  }
  // 牆壁距離（Chebyshev 距離轉換）
  const dd = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) dd[i] = stand[i] ? 99 : 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (!dd[i]) continue; let m = dd[i]; if (x > 0) m = Math.min(m, dd[i - 1] + 1); if (y > 0) { m = Math.min(m, dd[i - W] + 1); if (x > 0) m = Math.min(m, dd[i - W - 1] + 1); if (x < W - 1) m = Math.min(m, dd[i - W + 1] + 1); } dd[i] = m; }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; if (!dd[i]) continue; let m = dd[i]; if (x < W - 1) m = Math.min(m, dd[i + 1] + 1); if (y < H - 1) { m = Math.min(m, dd[i + W] + 1); if (x < W - 1) m = Math.min(m, dd[i + W + 1] + 1); if (x > 0) m = Math.min(m, dd[i + W - 1] + 1); } dd[i] = m; }

  const BR = [[168, 168, 168], [178, 178, 178], [158, 158, 158], [186, 186, 186], [150, 150, 150]];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, o = i * 4;
    const fx = x - OX + 0.5, fy = OY - y - 0.5, r = Math.hypot(fx, fy), th = Math.atan2(fx, fy) / DEG;
    const n = hash(x, y);
    let col;
    if (stand[i]) {
      const k = dd[i];
      if (k === 1 || k === 5) col = [22, 22, 22];
      else if (k <= 4) col = k === 2 ? [236, 236, 236] : [214, 214, 214];
      else {
        const bw = 20, bh = 8, row = Math.floor(y / bh), off = (row % 2) * 10, bx = Math.floor((x + off) / bw);
        if (y % bh === 0 || (x + off) % bw === 0) col = [138, 138, 138];
        else { col = BR[Math.floor(hash(bx, row) * BR.length)].slice(); if (n < 0.05) col = col.map(v => v - 8); }
      }
    } else {
      const fair = fy >= 0 && Math.abs(fx) <= fy;
      const fz = fence(Math.min(45, Math.abs(th)));
      const mound = Math.hypot(fx, fy - 60.5);
      const inGrass = Math.abs(fx) + Math.abs(fy - 63.6) < 55;
      const dirt = (mound < 95 && fy > -40 && !(inGrass && mound > 9)) || Math.hypot(fx, fy) < 13;
      const stripe = Math.floor((fy + 400) / 20) % 2;
      if (fair && r > fz - 12) col = n < 0.1 ? [150, 102, 64] : [162, 112, 72];
      else if (dirt) col = n < 0.08 ? [178, 124, 76] : n > 0.95 ? [206, 152, 100] : [196, 140, 88];
      else if (fair) col = stripe ? [76, 162, 66] : [68, 150, 60];
      else col = stripe ? [64, 140, 56] : [58, 130, 52];
      if (!dirt && !(fair && r > fz - 12)) { if (n < 0.05) col = col.map(v => v - 12); else if (n > 0.97) col = col.map(v => v + 14); }
      // 邊線
      if (fy >= -1 && Math.abs(Math.abs(fx) - fy) < 0.75 && r < fz - 1 && r > 4) col = [244, 244, 236];
      // 打擊區
      const ax = Math.abs(fx);
      if (((ax > 3.5 && ax < 9) && (Math.abs(fy) > 3.5 && Math.abs(fy) < 4.5)) || ((Math.abs(ax - 3.5) < 0.5 || Math.abs(ax - 9) < 0.5) && Math.abs(fy) < 4.5)) col = [244, 244, 236];
      // 打擊準備區
      for (const sx of [-48, 48]) { const rr = Math.hypot(fx - sx, fy + 14); if (rr > 3.5 && rr < 4.6) col = [230, 230, 220]; }
    }
    d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // 壘包、投手板
  for (let b = 1; b <= 3; b++) { const [x, y] = toC(BASE[b].x, BASE[b].y); g.fillStyle = '#161616'; g.fillRect(Math.round(x) - 3, Math.round(y) - 3, 7, 7); g.fillStyle = '#fafafa'; g.fillRect(Math.round(x) - 2, Math.round(y) - 2, 5, 5); }
  { const [x, y] = toC(0, 0); g.fillStyle = '#161616'; g.fillRect(x - 3, y - 3, 7, 6); g.fillRect(x - 2, y + 3, 5, 1); g.fillStyle = '#fafafa'; g.fillRect(x - 2, y - 2, 5, 4); g.fillRect(x - 1, y + 2, 3, 1); }
  { const [x, y] = toC(0, 60.5); g.fillStyle = '#fafafa'; g.fillRect(x - 2, y, 5, 1); }
  // 休息區、牛棚：仿範例的石牆結構
  const structure = (b, openTop) => {
    const [x0, y0] = toC(b.x0, b.y1), [x1, y1] = toC(b.x1, b.y0);
    g.fillStyle = '#7d7d7d'; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    const wall = (x, y, w, h) => { g.fillStyle = '#161616'; g.fillRect(x, y, w, h); g.fillStyle = '#dadada'; g.fillRect(x + 1, y + 1, w - 2, h - 2); g.fillStyle = '#f2f2f2'; g.fillRect(x + 1, y + 1, w - 2, 1); };
    wall(x0, y0, 5, y1 - y0); wall(x1 - 5, y0, 5, y1 - y0);
    if (openTop) wall(x0, y1 - 5, x1 - x0, 5); else wall(x0, y0, x1 - x0, 5);
    g.fillStyle = '#5e5e5e'; g.fillRect(x0 + 5, openTop ? y1 - 7 : y0 + 5, x1 - x0 - 10, 2);
  };
  DUG.forEach(b => structure(b, true));
  PEN.forEach(b => structure(b, false));
  return c;
}
function toC(x, y) { return [OX + x, OY - y]; }

// ---------------- 像素精靈 ----------------
const TOP = [
  '...kkkk...', '..khhhhk..', '..khhhhhhk', '..ksssek..', '..kssssk..',
  '...kkkk...', '..kuuuuk..', '.ksuttuusk', '.ksuuuuugk', '..kuuuuk..'];
const LEGS = {
  stand: ['..kppppk..', '..kpkkpk..', '..kpk.kpk.', '..kk...kk.'],
  run1: ['..kppppk..', '.kpk..kpk.', 'kpk....kpk', 'kk......kk'],
  run2: ['..kppppk..', '...kppk...', '...kpkk...', '...kkk....'],
};
const FR = {
  stand: TOP.concat(LEGS.stand),
  run1: TOP.concat(LEGS.run1),
  run2: TOP.concat(LEGS.run2),
  windup: TOP.slice(0, 6).concat(['..kuuuukkg', '.kuuttuuk.', '..kuuuuk..', '..kuuuuk..', '..kppppk..', '..kpkppppk', '..kpk.kkkk', '..kk......']),
  throw: TOP.slice(0, 6).concat(['..kuuuuk..', '.kuuttuuss', 'gkuuuuuk..', '..kuuuuk..']).concat(LEGS.run1),
  crouch: ['...kkkk...', '..khhhhk..', '..kmmmmk..', '..kmsmsk..', '..kmmmmk..', '.kkuuuukk.', 'kgkuttuk..', 'kgkuuuuk..', '.kppppppk.', '.kpk..kpk.', '.kk....kk.'],
  dive: ['..............', '...kkkk.......', 'kkkuuuukkkkk..', 'kppuuttuussskhk', 'kppuuuuuuugkhk.', 'kkkkkkkkkkkk...'].map(r => r.padEnd(15, '.').slice(0, 15)),
};
const pad = (rows, l, r) => rows.map(s => '.'.repeat(l) + s + '.'.repeat(r));
const overlay = (rows, pts, ch) => { const a = rows.map(s => s.split('')); for (const [x, y] of pts) if (a[y] && x < a[y].length) a[y][x] = ch; return a.map(r => r.join('')); };
FR.bat = overlay(pad(FR.stand, 3, 3), [[2, 0], [2, 1], [3, 2], [3, 3], [4, 4], [4, 5], [5, 6]], 'b');
FR.swing = overlay(pad(FR.run1, 3, 3), [[12, 7], [13, 7], [14, 7], [15, 7], [13, 6]], 'b');
const PAL0 = { k: '#161616', s: '#f1c18e', e: '#161616', g: '#8b4d1e', b: '#e2b066', m: '#4a4a4a', w: '#ffffff' };
const UMP = { hat: '#1f1f1f', shirt: '#2c2c2c', trim: '#5a5a5a', pants: '#6a6a6a' };
const spriteCache = new Map();
function sprite(team, frame, flip) {
  const key = team.name + '|' + frame + '|' + flip;
  let c = spriteCache.get(key);
  if (c) return c;
  const rows = FR[frame];
  const pal = Object.assign({}, PAL0, { h: team.hat, u: team.shirt, t: team.trim, p: team.pants });
  const h = rows.length, w = Math.max(...rows.map(r => r.length));
  c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = rows[y][flip ? w - 1 - x : x];
    if (!ch || ch === '.') continue;
    g.fillStyle = pal[ch] || '#f0f'; g.fillRect(x, y, 1, 1);
  }
  spriteCache.set(key, c);
  return c;
}

// ---------------- 狀態 ----------------
let teams, game, snap, homesMap, ents, ev = null, et = 0, gap = 0, waitT = 0, playing = false, speed = 1, banner = null, simulated = false;
const bg = buildField();

function byId(id) { for (const t of teams) for (const p of t.roster) if (p.id === id) return p; return null; }
function teamIdx(p) { return p.team === teams[0] ? 0 : 1; }

function newGame(fresh) {
  if (fresh || !teams) { teams = makeMatch(); spriteCache.clear(); }
  game = new Game(teams[0], teams[1]);
  snap = Object.assign(game.snap(), { pregame: true });
  homesMap = homes(snap);
  ents = new Map();
  for (const t of teams) for (const p of t.roster) { const h = homesMap.get(p.id); ents.set(p.id, { p, x: h.x, y: h.y, phase: Math.random() * 6, moving: false }); }
  ev = null; et = 0; gap = 0; banner = { text: `${teams[0].full} vs ${teams[1].full}`, t: 0, dur: 3 };
  simulated = false;
  document.getElementById('log').innerHTML = '';
  addLog([{ cls: 'inning', s: `比賽即將開始：${teams[0].full}（客）vs ${teams[1].full}（主）` },
    { s: `先發投手：${game.ts[0].pitcher.name}（${teams[0].name}） vs ${game.ts[1].pitcher.name}（${teams[1].name}）` }]);
  setPlaying(false);
  document.getElementById('btnNext').disabled = true;
  document.getElementById('btnSim').disabled = false;
  document.getElementById('btnPlay').disabled = false;
  renderRosterSel();
  refreshPanels();
}

// 依快照決定每位球員的「歸位」位置
function homes(sn) {
  const M = new Map();
  for (let ti = 0; ti < 2; ti++) {
    const team = teams[ti], side = ti === 1 ? 1 : -1;
    const placed = new Set();
    if (!sn.pregame) {
      if (sn.offIdx !== ti) {
        for (const pos of FIELD) { const id = sn.field[pos]; M.set(id, { x: POS_XY[pos].x, y: POS_XY[pos].y, role: 'field', pos }); placed.add(id); }
      } else {
        const b = byId(sn.batter);
        M.set(b.id, { x: b.bats === 'R' ? -8 : 8, y: 2, role: 'bat' }); placed.add(b.id);
        if (!sn.over) { M.set(sn.onDeck, { x: 48 * side, y: -14, role: 'deck' }); placed.add(sn.onDeck); }
        sn.bases.forEach((id, i) => { if (id) { M.set(id, { x: BASE[i + 1].x + (i === 0 ? 3 : i === 2 ? -3 : 0), y: BASE[i + 1].y - 3, role: 'run' }); placed.add(id); } });
      }
    }
    let dug = 0, pen = 0;
    const entered = new Set(sn.entered[ti]);
    for (const p of team.roster) {
      if (placed.has(p.id)) continue;
      if (p.role !== 'H' && !entered.has(p.id)) {
        const i = pen++; M.set(p.id, { x: side * (190 + (i % 7) * 10), y: 354 - Math.floor(i / 7) * 10, role: 'pen' });
      } else {
        const i = dug++; M.set(p.id, { x: side * (100 + (i % 9) * 9), y: 16 - Math.floor(i / 9) * 7, role: 'dug' });
      }
    }
  }
  return M;
}

// ---------------- 事件播放 ----------------
function startEvent(e) {
  ev = e; et = 0;
  ev.tracks = new Map(); ev.poses = new Map();
  if (e.tl) {
    for (const m of e.tl.mv) { if (!ev.tracks.has(m.id)) ev.tracks.set(m.id, []); ev.tracks.get(m.id).push(Object.assign({}, m)); }
    for (const l of ev.tracks.values()) l.sort((a, b) => a.t0 - b.t0);
    for (const p of e.tl.pose) { if (!ev.poses.has(p.id)) ev.poses.set(p.id, []); ev.poses.get(p.id).push(p); }
  }
  if (e.kind !== 'pitch') { applySnap(e.post); addLog(e.log); refreshPanels(); }
  if (e.banner) banner = { text: e.banner, t: 0, dur: Math.min(2.4, e.dur) };
}
function endEvent() {
  const e = ev; ev = null;
  if (e.kind === 'pitch') { applySnap(e.post); addLog(e.log); refreshPanels(); }
  gap = 0.3; waitT = 0;
  if (e.post.over) gameOver();
}
function applySnap(sn) { snap = sn; homesMap = homes(sn); }

function gameOver() {
  const [a, h] = snap.R;
  const w = a === h ? '平手' : (a > h ? teams[0].full : teams[1].full) + ' 獲勝！';
  banner = { text: `比賽結束 ${a} : ${h}　${w}`, t: 0, dur: 9999 };
  addLog([{ cls: 'final', s: `比賽結束　${teams[0].full} ${a} : ${h} ${teams[1].full}　${w}` }].concat((game.result || []).map(s => ({ cls: 'final', s }))));
  setPlaying(false);
  document.getElementById('btnPlay').disabled = true;
  document.getElementById('btnSim').disabled = true;
  document.getElementById('btnNext').disabled = false;
  refreshPanels();
  cloudSave();
}

function settled() {
  for (const e of ents.values()) { const h = homesMap.get(e.p.id); if (Math.abs(e.x - h.x) > 3 || Math.abs(e.y - h.y) > 3) return false; }
  return true;
}

function update(dt) {
  if (banner) { banner.t += dt; if (banner.t > banner.dur) banner = null; }
  if (playing) {
    if (!ev) {
      gap -= dt; waitT += dt;
      if (gap <= 0 && (settled() || waitT > 4)) {
        const e = game.step();
        if (e) startEvent(e);
      }
    } else {
      et += dt;
      if (et >= ev.dur) endEvent();
    }
  }
  // 球員移動
  for (const e of ents.values()) {
    const id = e.p.id, h = homesMap.get(id);
    const tr = ev && ev.tracks.get(id);
    let nx = e.x, ny = e.y;
    if (tr) {
      let ci = -1;
      for (let i = 0; i < tr.length; i++) if (tr[i].t0 <= et) ci = i;
      if (ci >= 0) {
        const m = tr[ci];
        if (!m.from) m.from = ci > 0 ? tr[ci - 1].to : { x: e.x, y: e.y };
        const u = clamp((et - m.t0) / (m.t1 - m.t0), 0, 1);
        nx = m.from.x + (m.to.x - m.from.x) * u; ny = m.from.y + (m.to.y - m.from.y) * u;
      }
    } else {
      const dx = h.x - e.x, dy = h.y - e.y, d = Math.hypot(dx, dy), step = 60 * dt;
      if (d <= step) { nx = h.x; ny = h.y; } else { nx = e.x + dx / d * step; ny = e.y + dy / d * step; }
    }
    const mdx = nx - e.x, mdy = ny - e.y;
    e.moving = Math.hypot(mdx, mdy) > 0.01;
    if (e.moving) { e.phase += dt * 10; if (Math.abs(mdx) > 0.02) e.face = mdx < 0; }
    e.x = nx; e.y = ny;
  }
}

// ---------------- 繪圖 ----------------
function poseOf(id) {
  if (!ev) return null;
  const l = ev.poses.get(id); if (!l) return null;
  let f = null; for (const p of l) if (p.t <= et && et < p.t + p.dur) f = p.frame;
  return f;
}
function defaultFace(e, h) {
  if (h.role === 'bat') return e.p.bats !== 'R';
  if (h.role === 'dug' || h.role === 'pen' || h.role === 'deck') return h.x > 0;
  if (h.role === 'field') return h.pos === 'P' ? false : h.x > 1;
  return h.x > 0;
}
function starOf(p) { const r = p.r; return p.role === 'H' ? Math.max(r.contact, r.power, r.speed, r.defense) >= 85 : Math.max(r.fastball, r.breaking, r.control) >= 85; }

function draw() {
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(bg, 0, 0, W * S, H * S);
  ctx.setTransform(S, 0, 0, S, 0, 0);

  const list = [...ents.values()];
  list.sort((a, b) => b.y - a.y);
  // 主審
  const umpY = -17;
  const all = list.map(e => ({ e, y: e.y }));
  all.push({ ump: true, y: umpY });
  all.sort((a, b) => b.y - a.y);
  for (const it of all) {
    if (it.ump) { const [ux, uy] = toC(4, umpY); drawSprite(sprite(UMP, 'stand', false), ux, uy, 1.5); continue; }
    const e = it.e, h = homesMap.get(e.p.id), team = e.p.team;
    let frame = poseOf(e.p.id);
    if (!frame) {
      if (e.moving) frame = Math.floor(e.phase) % 2 ? 'run1' : 'run2';
      else if (h.role === 'bat' && Math.abs(e.x - h.x) < 1 && Math.abs(e.y - h.y) < 1) frame = 'bat';
      else if (h.role === 'field' && h.pos === 'C' && Math.abs(e.x - h.x) < 1 && Math.abs(e.y - h.y) < 1) frame = 'crouch';
      else frame = 'stand';
    }
    const face = e.moving ? !!e.face : defaultFace(e, h);
    const [X, Y] = toC(e.x, e.y);
    const active = h.role !== 'dug' && h.role !== 'pen';
    const sc = active ? 1.5 : 1;
    if (active && starOf(e.p)) { ctx.fillStyle = 'rgba(170,110,255,0.3)'; ctx.beginPath(); ctx.ellipse(X, Y - 8, 12, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = 'rgba(190,140,255,0.85)'; ctx.lineWidth = 0.8; ctx.stroke(); }
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(Math.round(X) - 4 * sc, Math.round(Y), 9 * sc, 2);
    drawSprite(sprite(team, frame, face), X, Y, sc);
    if (active) drawBars(e, h, X, Y);
  }
  drawBall();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawTexts();
  drawHUD();
  if (banner) drawBanner();
}
const half = v => Math.round(v * 2) / 2;
function drawSprite(img, X, Y, sc) { ctx.drawImage(img, half(X - img.width * sc / 2), half(Y - (img.height - 1) * sc), img.width * sc, img.height * sc); }
function drawBars(e, h, X, Y) {
  const p = e.p, r = p.r;
  let a, b;
  if (h.role === 'field' && h.pos === 'P') { a = 1 - p.g.NP / game.pLimit(p); b = r.control / 100; }
  else if (h.role === 'bat' || h.role === 'deck') { a = r.contact / 100; b = r.power / 100; }
  else if (h.role === 'run') { a = r.speed / 100; b = r.contact / 100; }
  else { a = r.defense / 100; b = r.arm / 100; }
  const x = Math.round(X) - 7, y = Math.round(Y) + 2.5;
  ctx.fillStyle = '#161616'; ctx.fillRect(x - 0.5, y - 0.5, 15, 4);
  ctx.fillStyle = '#3a3a3a'; ctx.fillRect(x, y, 14, 3);
  ctx.fillStyle = p.team.bar; ctx.fillRect(x, y, half(14 * clamp(a, 0, 1)), 1.5);
  ctx.fillStyle = '#9b6ae6'; ctx.fillRect(x, y + 1.5, half(14 * clamp(b, 0, 1)), 1.5);
}
function drawBall() {
  if (!ev || !ev.tl) return;
  let seg = null;
  for (const s of ev.tl.ball) if (s.t0 <= et && et <= s.t1) seg = s;
  if (!seg) return;
  const u = (et - seg.t0) / Math.max(0.001, seg.t1 - seg.t0);
  const x = seg.from.x + (seg.to.x - seg.from.x) * u, y = seg.from.y + (seg.to.y - seg.from.y) * u;
  const z = seg.h0 + (seg.h1 - seg.h0) * u + 4 * seg.peak * u * (1 - u);
  const [X, Y] = toC(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(Math.round(X) - 1, Math.round(Y), 3, 1);
  const sz = z > 40 ? 4 : z > 15 ? 3 : 2;
  const by = Math.round(Y - z * 0.55);
  ctx.fillStyle = '#161616'; ctx.fillRect(Math.round(X) - 1, by - 1, sz + 1, sz + 1);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(X) - 1, by - 1, sz, sz);
}
function outlined(str, x, y, px, color, align) {
  ctx.font = `bold ${px}px ${FONT}`; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, px / 5); ctx.strokeStyle = '#161616';
  ctx.strokeText(str, x, y); ctx.fillStyle = color; ctx.fillText(str, x, y);
}
function drawTexts() {
  if (!ev || !ev.tl) return;
  for (const t of ev.tl.tx) {
    const age = et - t.t; if (age < 0 || age > 1.1) continue;
    const [X, Y] = toC(t.x, t.y);
    ctx.globalAlpha = age > 0.8 ? (1.1 - age) / 0.3 : 1;
    const pop = age < 0.12 ? 1 + (0.12 - age) * 3 : 1;
    outlined(t.str, clamp(X * S, 60, W * S - 60), Y * S - 30 - age * 28, Math.round(22 * t.size * pop), t.color);
    ctx.globalAlpha = 1;
  }
}
function drawHUD() {
  const x = 14, y = 14, w = 330, h = 104;
  ctx.fillStyle = '#161616'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#d8d8d8'; ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
  ctx.fillStyle = '#2a2a2a'; ctx.fillRect(x + 7, y + 7, w - 14, h - 14);
  const sn = snap;
  for (let i = 0; i < 2; i++) {
    const t = teams[i], ry = y + 30 + i * 40;
    ctx.fillStyle = t.bar; ctx.fillRect(x + 14, ry - 12, 8, 24);
    outlined(t.full, x + 30, ry, 22, sn.offIdx === i && !sn.pregame && !sn.over ? '#ffe14a' : '#ffffff', 'left');
    outlined(String(sn.R[i]), x + 168, ry, 28, '#ffffff', 'center');
  }
  // 局數
  const ix = x + 210;
  outlined(sn.pregame ? '賽前' : sn.over ? '終' : `${sn.inning}${sn.half ? '▼' : '▲'}`, ix + 6, y + 30, 22, '#ffffff', 'center');
  // 壘包
  const bx = ix + 70, by = y + 32;
  const dia = (cx, cy, on) => { ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.PI / 4); ctx.fillStyle = on ? '#ffe14a' : '#555'; ctx.fillRect(-7, -7, 14, 14); ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.strokeRect(-7, -7, 14, 14); ctx.restore(); };
  dia(bx + 18, by, sn.bases[0]); dia(bx, by - 16, sn.bases[1]); dia(bx - 18, by, sn.bases[2]);
  // 球數
  const dots = (label, n, max, color, ry) => {
    outlined(label, ix - 14, ry, 16, '#ffffff', 'left');
    for (let k = 0; k < max; k++) { ctx.fillStyle = k < n ? color : '#555'; ctx.fillRect(ix + 6 + k * 16, ry - 6, 12, 12); }
  };
  dots('B', sn.balls, 3, '#5ad06a', y + 62);
  dots('S', sn.strikes, 2, '#ffd23a', y + 84);
  outlined('O', ix + 54, y + 73, 16, '#ffffff', 'left');
  for (let k = 0; k < 2; k++) { ctx.fillStyle = k < sn.outs ? '#ff5a4a' : '#555'; ctx.fillRect(ix + 70 + k * 16, y + 67, 12, 12); }
}
function drawBanner() {
  const b = banner, a = b.t < 0.2 ? b.t / 0.2 : b.dur - b.t < 0.3 ? (b.dur - b.t) / 0.3 : 1;
  ctx.globalAlpha = clamp(a, 0, 1);
  const y = H * S * 0.42;
  ctx.fillStyle = 'rgba(22,22,22,0.78)'; ctx.fillRect(0, y - 38, W * S, 76);
  ctx.fillStyle = '#d8d8d8'; ctx.fillRect(0, y - 38, W * S, 4); ctx.fillRect(0, y + 34, W * S, 4);
  outlined(b.text, W * S / 2, y, 36, '#ffe14a');
  ctx.globalAlpha = 1;
}

// ---------------- 面板 ----------------
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function addLog(items) {
  if (!items || !items.length) return;
  const L = $('log');
  const half = snap && !snap.pregame ? `${snap.inning}${snap.half ? '下' : '上'} ` : '';
  for (const it of items) {
    const d = document.createElement('div');
    if (it.cls) d.className = it.cls;
    d.textContent = (it.cls === 'inning' || it.cls === 'final' || it.s.startsWith('　') ? '' : half) + it.s;
    L.prepend(d);
  }
}
function gradeColor(v) { return v >= 90 ? '#ff8a3a' : v >= 80 ? '#ffd23a' : v >= 70 ? '#9be36a' : v >= 60 ? '#6ad0a8' : v >= 50 ? '#8ab8f0' : v >= 40 ? '#c0c0c0' : '#e08080'; }
function grade(v) { return v >= 90 ? 'S' : v >= 80 ? 'A' : v >= 70 ? 'B' : v >= 60 ? 'C' : v >= 50 ? 'D' : v >= 40 ? 'E' : 'F'; }
const bar = (label, v, color) => `<div class="bar"><span>${label}</span><div class="track"><div class="fill" style="width:${clamp(v, 0, 100)}%;background:${color || gradeColor(v)}"></div></div><b>${Math.round(v)}</b></div>`;
const ip = outs => `${Math.floor(outs / 3)}.${outs % 3}`;

function refreshPanels() {
  const sn = snap;
  // 逐局比分
  const n = Math.max(9, sn.line[0].length, sn.line[1].length);
  let h = '<tr><th>球隊</th>';
  for (let i = 1; i <= n; i++) h += `<th>${i}</th>`;
  h += '<th>R</th><th>H</th><th>E</th></tr>';
  for (let t = 0; t < 2; t++) {
    h += `<tr><td class="tn"><span class="chip" style="background:${teams[t].bar}"></span>${esc(teams[t].full)} <small>(${teams[t].W}勝${teams[t].L}敗)</small></td>`;
    for (let i = 0; i < n; i++) {
      const v = sn.line[t][i];
      const cur = !sn.pregame && !sn.over && sn.inning === i + 1 && sn.offIdx === t;
      h += `<td class="${cur ? 'cur' : ''}">${v === undefined ? '' : v}</td>`;
    }
    h += `<td class="tot">${sn.R[t]}</td><td class="tot">${sn.H[t]}</td><td class="tot">${sn.E[t]}</td></tr>`;
  }
  $('line').innerHTML = h;
  // 投打對決卡
  const defI = sn.pregame ? 1 : 1 - sn.offIdx;
  const P = byId(sn.pitchers[defI]);
  const B = sn.pregame ? game.ts[0].lineup[0].p : byId(sn.batter);
  const lim = game.pLimit(P), st = clamp(1 - P.g.NP / lim, 0, 1) * 100;
  $('cardP').innerHTML = `<h3><span class="chip" style="background:${P.team.bar}"></span>#${P.num} ${esc(P.name)} <span class="role">${POS_CN[P.role]}</span></h3>
    <div class="sub">${P.throws === 'R' ? '右投' : '左投'}｜${P.velo}km｜${P.pitches.join('、')}</div>
    ${bar('速球', P.r.fastball)}${bar('變化球', P.r.breaking)}${bar('控球', P.r.control)}${bar('體力', P.r.stamina)}
    ${bar('剩餘體力', st, st > 50 ? '#5ad06a' : st > 25 ? '#ffd23a' : '#ff5a4a')}
    <div class="today">本場：${ip(P.g.outs)}局 ${P.g.NP}球 被安${P.g.pH} 失${P.g.pR} 四壞${P.g.pBB} 三振${P.g.pSO}</div>`;
  const e = (sn.lineups[sn.pregame ? 0 : sn.offIdx] || []).find(x => x.id === B.id);
  const g = B.g;
  const line = g.AB || g.BB ? `${g.AB}打數${g.H}安打${g.HR ? ' ' + g.HR + '轟' : ''}${g.RBI ? ' ' + g.RBI + '打點' : ''}${g.BB ? ' ' + g.BB + '保送' : ''}${g.SO ? ' ' + g.SO + '三振' : ''}` : '本場首打席';
  const s = B.s, avg = s.AB ? (s.H / s.AB).toFixed(3).replace(/^0/, '') : '.---';
  $('cardB').innerHTML = `<h3><span class="chip" style="background:${B.team.bar}"></span>#${B.num} ${esc(B.name)} <span class="role">${e ? POS_SHORT[e.pos] : POS_SHORT[B.pos]}</span></h3>
    <div class="sub">${B.bats === 'R' ? '右打' : '左打'}｜累計 打率${avg} ${s.HR}轟</div>
    ${bar('打擊', B.r.contact)}${bar('力量', B.r.power)}${bar('選球', B.r.eye)}${bar('速度', B.r.speed)}${bar('守備', B.r.defense)}${bar('臂力', B.r.arm)}
    <div class="today">本場：${line}</div>`;
  if ($('pane-box').classList.contains('on')) renderBox();
}

function renderBox() {
  let h = '';
  for (let t = 0; t < 2; t++) {
    const ts = game.ts[t], team = teams[t];
    const hitters = [];
    ts.lineup.forEach((e, i) => hitters.push({ p: e.p, pos: e.pos, slot: i + 1 }));
    for (const p of team.roster) if (p.role === 'H' && ts.exited.has(p.id)) hitters.push({ p, pos: POS_SHORT[p.pos], out: true });
    h += `<h4><span class="chip" style="background:${team.bar}"></span>${esc(team.full)} 打擊</h4><table class="stat"><tr><th></th><th>打者</th><th>守</th><th>打數</th><th>安打</th><th>二安</th><th>全壘打</th><th>打點</th><th>得分</th><th>四壞</th><th>三振</th><th>盜壘</th></tr>`;
    for (const x of hitters) {
      const g = x.p.g;
      h += `<tr class="${x.out ? 'out' : ''}"><td>${x.slot || ''}</td><td class="nm">${esc(x.p.name)}${x.out ? '（退）' : ''}</td><td>${POS_SHORT[x.pos] || x.pos}</td><td>${g.AB}</td><td>${g.H}</td><td>${g.D}</td><td>${g.HR}</td><td>${g.RBI}</td><td>${g.R}</td><td>${g.BB}</td><td>${g.SO}</td><td>${g.SB}</td></tr>`;
    }
    h += '</table>';
    h += `<h4>${esc(team.full)} 投手</h4><table class="stat"><tr><th>投手</th><th>局數</th><th>用球</th><th>被安</th><th>失分</th><th>自責</th><th>四壞</th><th>三振</th><th>被轟</th><th></th></tr>`;
    for (const p of team.roster) {
      if (p.role === 'H' || !ts.entered.has(p.id)) continue;
      const g = p.g;
      h += `<tr><td class="nm">${esc(p.name)} <small>${POS_SHORT[p.role]}</small></td><td>${ip(g.outs)}</td><td>${g.NP}</td><td>${g.pH}</td><td>${g.pR}</td><td>${g.pER}</td><td>${g.pBB}</td><td>${g.pSO}</td><td>${g.pHR}</td><td>${g.W ? '勝' : g.L ? '敗' : g.S ? '救援' : ''}</td></tr>`;
    }
    h += '</table>';
  }
  $('box').innerHTML = h;
}

let rosterTeam = 0;
function renderRosterSel() {
  $('rosterSel').innerHTML = teams.map((t, i) => `<button data-rt="${i}" class="${i === rosterTeam ? 'on' : ''}"><span class="chip" style="background:${t.bar}"></span>${esc(t.full)}</button>`).join('');
  $('rosterSel').querySelectorAll('button').forEach(b => b.onclick = () => { rosterTeam = +b.dataset.rt; renderRosterSel(); });
  renderRoster();
}
function renderRoster() {
  const t = teams[rosterTeam];
  const cell = v => `<td><span class="g" style="background:${gradeColor(v)}">${grade(v)} ${v}</span></td>`;
  let h = `<table class="stat"><tr><th>#</th><th>野手</th><th>位置</th><th>打</th><th>打擊</th><th>力量</th><th>選球</th><th>速度</th><th>守備</th><th>臂力</th><th>打率</th><th>轟</th></tr>`;
  for (const p of t.roster.filter(p => p.role === 'H')) {
    const s = p.s;
    h += `<tr><td>${p.num}</td><td class="nm">${esc(p.name)}</td><td>${POS_SHORT[p.pos]}</td><td>${p.bats === 'R' ? '右' : '左'}</td>${cell(p.r.contact)}${cell(p.r.power)}${cell(p.r.eye)}${cell(p.r.speed)}${cell(p.r.defense)}${cell(p.r.arm)}<td>${s.AB ? (s.H / s.AB).toFixed(3).replace(/^0/, '') : '-'}</td><td>${s.HR}</td></tr>`;
  }
  h += `</table><table class="stat" style="margin-top:8px"><tr><th>#</th><th>投手</th><th>角色</th><th>投</th><th>球速</th><th>速球</th><th>變化球</th><th>控球</th><th>體力</th><th>球種</th><th>防禦率</th><th>勝-敗-救</th></tr>`;
  for (const p of t.roster.filter(p => p.role !== 'H')) {
    const s = p.s, era = s.outs ? (s.pER * 27 / s.outs).toFixed(2) : '-';
    h += `<tr><td>${p.num}</td><td class="nm">${esc(p.name)}</td><td>${POS_SHORT[p.role]}</td><td>${p.throws === 'R' ? '右' : '左'}</td><td>${p.velo}</td>${cell(p.r.fastball)}${cell(p.r.breaking)}${cell(p.r.control)}${cell(p.r.stamina)}<td style="font-size:11px">${p.pitches.join('、')}</td><td>${era}</td><td>${s.W}-${s.L}-${s.S}</td></tr>`;
  }
  $('roster').innerHTML = h + '</table>';
}

// ---------------- 控制 ----------------
function setPlaying(v) {
  playing = v;
  $('btnPlay').textContent = v ? '⏸ 暫停' : (snap && !snap.pregame ? '▶ 繼續' : '▶ 開始比賽');
}
$('btnPlay').onclick = () => setPlaying(!playing);
$('speed').onchange = e => { speed = +e.target.value; };
$('btnSim').onclick = () => {
  if (ev) endEvent();
  let e, logs = [];
  while ((e = game.step())) { logs.push(...e.log); if (e.post.over) break; }
  applySnap(game.snap());
  for (const en of ents.values()) { const h = homesMap.get(en.p.id); en.x = h.x; en.y = h.y; }
  addLog(logs.slice(-40));
  refreshPanels();
  gameOver();
};
$('btnNext').onclick = () => { newGame(false); setPlaying(true); };
$('btnNew').onclick = () => { newGame(true); cloudSave(); };
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('.pane').forEach(p => p.classList.toggle('on', p.id === 'pane-' + b.dataset.tab));
  if (b.dataset.tab === 'box') renderBox();
  if (b.dataset.tab === 'roster') renderRoster();
});

// ---------------- 雲端存檔（account.js / Supabase） ----------------
const STYLE_KEYS = ['name', 'hat', 'shirt', 'trim', 'pants', 'bar', 'city', 'full', 'rotation', 'W', 'L', 'T'];
const PLAYER_KEYS = ['id', 'name', 'num', 'pos', 'role', 'bats', 'throws', 'r', 's', 'velo', 'pitches'];
function serializeTeams() {
  return { v: 1, teams: teams.map(t => Object.assign(
    Object.fromEntries(STYLE_KEYS.map(k => [k, t[k]])),
    { roster: t.roster.map(p => Object.fromEntries(PLAYER_KEYS.map(k => [k, p[k]]))) })) };
}
function restoreTeams(d) {
  return d.teams.map(td => {
    const t = Object.assign({}, td, { roster: [] });
    t.roster = td.roster.map(pd => Object.assign({}, pd, { team: t, g: newStats(), s: Object.assign(newStats(), pd.s) }));
    return t;
  });
}
const cloudOK = typeof ensureLogin === 'function';
function cloudStatus(text) { $('cloud').textContent = text; }
async function cloudSave() {
  if (!cloudOK) return;
  try { await saveGame(serializeTeams()); cloudStatus('☁ 已存檔'); }
  catch (e) { console.warn('存檔失敗', e); cloudStatus('☁ 存檔失敗'); }
}
async function cloudLoad() {
  if (!cloudOK) { cloudStatus('離線模式'); return; }
  try {
    await ensureLogin();
    const d = await loadGame();
    // 玩家還沒開打才套用存檔，避免中途換掉比賽
    if (d && d.v === 1 && snap.pregame && !playing) { teams = restoreTeams(d); spriteCache.clear(); newGame(false); cloudStatus('☁ 已讀取存檔'); }
    else if (!d) { await saveGame(serializeTeams()); cloudStatus('☁ 新玩家，已建立存檔'); }
    else cloudStatus('☁ 已連線');
  } catch (e) { console.warn('雲端連線失敗', e); cloudStatus('離線模式（無法連線雲端）'); }
}

let last = performance.now();
function frame(now) {
  const dt = clamp((now - last) / 1000, 0, 0.05); last = now;
  const sub = Math.ceil(speed);
  for (let i = 0; i < sub; i++) update(dt * speed / sub);
  draw();
  requestAnimationFrame(frame);
}
newGame(true);
const qs = new URLSearchParams(location.search);
if (qs.has('speed')) { speed = +qs.get('speed'); $('speed').value = qs.get('speed'); }
if (qs.has('auto')) setPlaying(true);
if (qs.has('warp')) { const n = +qs.get('warp') * 60; for (let i = 0; i < n; i++) update(1 / 60); }
requestAnimationFrame(frame);
cloudLoad();
})();
