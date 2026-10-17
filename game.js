// 比賽畫面：HD-2D 夜間球場（從本壘後方高處俯瞰的立體透視）、Pixel Hoops 風格的大頭像素球員、時間軸動畫與資訊面板。
// club.js 用 Match.start(客隊, 主隊, { onEnd }) 開打。
(function () {
'use strict';
const { Game, POS_XY, BASE, FIELD, POS_CN, POS_SHORT, fence, newStats } = BB;

const W = 480, H = 270, S = 3, PZ = 2 / 3;      // logical size, device px per logical px, sprite px in logical px
const DEG = Math.PI / 180;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const cv = document.getElementById('field');
cv.width = W * S; cv.height = H * S;
const ctx = cv.getContext('2d');
const FONT = '"Microsoft JhengHei","PingFang TC","Noto Sans TC",sans-serif';
const canFilter = typeof ctx.filter === 'string';
let fxOn = canFilter;
try { if (localStorage.getItem('pbb.fx') === 'off') fxOn = false; } catch (e) { /* ignore */ }

// ---------------- 透視：本壘後上方的轉播攝影機 ----------------
// 地面上 (x 往一壘側, y 往中外野, z 往上) 英呎 → 邏輯像素；s = 該處每英呎幾像素
const CAM = { F: 603.7, D: 402.5, V: 142123, hz: -115, cx: 240 };
function PJ(x, y, z) { const dz = Math.max(30, y + CAM.D), s = CAM.F / dz; return { x: CAM.cx + x * s, y: CAM.hz + CAM.V / dz - (z || 0) * s * 0.85, s }; }
function ground(sx, sy) { const dz = CAM.V / (sy - CAM.hz); return { x: (sx - CAM.cx) * dz / CAM.F, y: dz - CAM.D }; }

function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function rng(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f));
  return '#' + c.map(v => ('0' + clamp(v, 0, 255).toString(16)).slice(-2)).join('');
}

// ---------------- 球場：草地、紅土、白線（逐像素投影），然後外野牆、看台、燈塔 ----------------
const LIGHTS = [[-260, 170], [260, 170], [-200, 470], [200, 470]];
function groundColor(fx, fy) {
  const r = Math.hypot(fx, fy), th = Math.atan2(fx, fy) / DEG, fz = fence(Math.min(45, Math.abs(th))), n = hash(Math.round(fx * 2), Math.round(fy * 2));
  const fair = fy >= 0 && Math.abs(fx) <= fy;
  if (fair && r > fz) return null;                                       // beyond the wall: the stands cover it
  if (!fair && ((Math.abs(fx) - fy) / Math.SQRT2 > 58 || fy < -60)) return null;
  const mound = Math.hypot(fx, fy - 60.5), inGrass = Math.abs(fx) + Math.abs(fy - 63.6) < 55;
  const dirt = (mound < 95 && fy > -40 && !(inGrass && mound > 9)) || r < 13;
  let col;
  if (fair && r > fz - 12) col = n < 0.12 ? [150, 100, 62] : [166, 112, 70];                                    // warning track
  else if (dirt) col = n < 0.1 ? [176, 118, 72] : n > 0.94 ? [210, 152, 98] : [196, 136, 84];
  else {
    const a = Math.floor((fx + fy + 600) / 24) % 2, b = Math.floor((fy - fx + 600) / 24) % 2;            // diamond mowing pattern
    col = a ^ b ? [70, 150, 62] : [62, 136, 56];
    if (!fair) col = col.map(v => v - 8);
    if (n < 0.06) col = col.map(v => v - 12); else if (n > 0.96) col = col.map(v => v + 12);
  }
  // chalk: foul lines, batter's boxes, the circles where the on-deck hitters wait
  if (fy >= -1 && Math.abs(Math.abs(fx) - fy) < 0.9 && r < fz && r > 4) col = [246, 246, 238];
  const ax = Math.abs(fx);
  if (((ax > 3.5 && ax < 9) && Math.abs(Math.abs(fy) - 4) < 0.6) || ((Math.abs(ax - 3.5) < 0.6 || Math.abs(ax - 9) < 0.6) && Math.abs(fy) < 4.5)) col = [246, 246, 238];
  for (const sx of [-48, 48]) { const rr = Math.hypot(fx - sx, fy + 14); if (rr > 3.5 && rr < 4.8) col = [232, 232, 222]; }
  // night lighting: brighter under the towers
  let L = 0.72;
  for (const [lx, ly] of LIGHTS) L += 0.22 * Math.exp(-((fx - lx) ** 2 + (fy - ly) ** 2) / 90000);
  L = Math.min(1.12, L);
  return col.map(v => clamp(Math.round(v * L), 0, 255));
}
const FANC = ['#e8e8e8', '#30343c', '#c03a3a', '#3a6ac0', '#e0b030', '#5a9a4a', '#8a4ac0', '#f08aa0', '#f4f4f4'];
let stadium = null, stadiumKey = '';
function buildStadium(home, away) {
  const c = document.createElement('canvas'); c.width = W * S; c.height = H * S;
  const a = c.getContext('2d');
  // the night sky
  const sky = a.createLinearGradient(0, 0, 0, H * S * 0.5); sky.addColorStop(0, '#05060f'); sky.addColorStop(1, '#1c1838');
  a.fillStyle = sky; a.fillRect(0, 0, W * S, H * S);
  const R = rng(91);
  for (let i = 0; i < 90; i++) { a.fillStyle = `rgba(255,255,255,${0.3 + R() * 0.5})`; a.fillRect(R() * W * S, R() * H * S * 0.25, S * (R() < 0.2 ? 1 : 0.6), S * (R() < 0.2 ? 1 : 0.6)); }
  // the field, one device pixel at a time
  const img = a.getImageData(0, 0, W * S, H * S), d = img.data;
  for (let py = 0; py < H * S; py++) {
    const sy = (py + 0.5) / S; if (sy <= CAM.hz + 1) continue;
    for (let px = 0; px < W * S; px++) {
      const p = ground((px + 0.5) / S, sy), col = groundColor(p.x, p.y);
      if (!col) continue;
      const o = (py * W * S + px) * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
    }
  }
  a.putImageData(img, 0, 0);
  a.setTransform(S, 0, 0, S, 0, 0);
  const quad = (pts, col) => { a.fillStyle = col; a.beginPath(); pts.forEach((q, i) => i ? a.lineTo(q.x, q.y) : a.moveTo(q.x, q.y)); a.closePath(); a.fill(); };
  const polar = (r, th, z) => PJ(r * Math.sin(th * DEG), r * Math.cos(th * DEG), z);
  // the bleachers beyond the wall: rows rising away from the field, full of fans, drawn far to near
  const ROWS = 22;
  for (let j = ROWS - 1; j >= 0; j--) {
    for (let th = -47; th < 47; th += 2) {
      const r0 = fence(Math.min(45, Math.abs(th))) + 14 + j * 9, r1 = fence(Math.min(45, Math.abs(th + 2))) + 14 + j * 9, z0 = 12 + j * 5;
      quad([polar(r0, th, z0 - 5), polar(r1, th + 2, z0 - 5), polar(r1, th + 2, z0), polar(r0, th, z0)], '#151226');
      quad([polar(r0, th, z0), polar(r1, th + 2, z0), polar(r1 + 9, th + 2, z0), polar(r0 + 9, th, z0)], j % 2 ? '#241d3a' : '#1d1830');
      // fans: two per seat row cell
      for (let k = 0; k < 2; k++) {
        const t = th + 0.5 + k, rr = (r0 + r1) / 2 + 3, b = polar(rr, t, z0), s = b.s, v = R();
        if (v < 0.07) continue;
        const shirt = v < 0.4 ? home.shirt : v < 0.55 ? home.hat : v < 0.68 ? away.shirt : FANC[Math.floor(R() * FANC.length)];
        a.fillStyle = shirt; a.fillRect(b.x - 1.2 * s, b.y - 3.6 * s, 2.4 * s, 2.6 * s);
        a.fillStyle = ['#f6d3b3', '#eab68c', '#cf9566', '#a06842'][Math.floor(R() * 4)]; a.fillRect(b.x - 0.9 * s, b.y - 5.3 * s, 1.8 * s, 1.7 * s);
      }
    }
  }
  a.fillStyle = 'rgba(8,6,20,0.25)'; a.fillRect(0, 0, W, H);
  // the outfield wall: padded, with the home colour on top and advertising boards
  for (let th = -45; th < 45; th += 1.5) {
    const r0 = fence(Math.min(45, Math.abs(th))), r1 = fence(Math.min(45, Math.abs(th + 1.5)));
    quad([polar(r0, th, 0), polar(r1, th + 1.5, 0), polar(r1, th + 1.5, 10), polar(r0, th, 10)], Math.floor((th + 45) / 9) % 3 === 1 ? shade(home.hat, -0.2) : '#1f4a30');
    quad([polar(r0, th, 10), polar(r1, th + 1.5, 10), polar(r1, th + 1.5, 11.2), polar(r0, th, 11.2)], '#ffd23a');
  }
  // foul poles
  for (const sd of [-1, 1]) { const b = polar(330, 45 * sd, 0), t = polar(330, 45 * sd, 75); a.strokeStyle = '#ffe14a'; a.lineWidth = 1.2; a.beginPath(); a.moveTo(b.x, b.y); a.lineTo(t.x, t.y); a.stroke(); }
  // the scoreboard tower in centre field
  { const bl = polar(470, -9, 120), br = polar(470, 9, 120), tl = polar(470, -9, 170); a.fillStyle = '#0b0c14'; a.fillRect(bl.x, tl.y, br.x - bl.x, bl.y - tl.y);
    a.strokeStyle = '#3a4157'; a.lineWidth = 1; a.strokeRect(bl.x, tl.y, br.x - bl.x, bl.y - tl.y); stadiumBoard = { x: bl.x, y: tl.y, w: br.x - bl.x, h: bl.y - tl.y }; }
  // light towers with banks of lamps
  for (const [lx, ly] of [[-330, 380], [330, 380], [-150, 560], [150, 560]]) {
    const b = PJ(lx, ly, 0), t = PJ(lx, ly, 150);
    a.strokeStyle = '#2a2d3a'; a.lineWidth = 1.4; a.beginPath(); a.moveTo(b.x, b.y); a.lineTo(t.x, t.y); a.stroke();
    a.fillStyle = '#1c1e28'; a.fillRect(t.x - 10 * t.s, t.y - 7 * t.s, 20 * t.s, 8 * t.s);
    a.fillStyle = '#fff6d8'; for (let i = 0; i < 4; i++) for (let k = 0; k < 2; k++) a.fillRect(t.x - 9 * t.s + i * 4.8 * t.s, t.y - 6 * t.s + k * 3.6 * t.s, 3.4 * t.s, 2.6 * t.s);
  }
  // dugouts along the baselines
  for (const sd of [-1, 1]) {
    const x0 = sd * 92, x1 = sd * 165, yb = -10, yf = 4;
    quad([PJ(x0, yf, 0), PJ(x1, yf, 0), PJ(x1, yf, 6), PJ(x0, yf, 6)], '#2a2d3a');
    quad([PJ(x0, yb, 8), PJ(x1, yb, 8), PJ(x1, yf, 6), PJ(x0, yf, 6)], shade(sd > 0 ? home.hat : away.hat, -0.2));
  }
  // glow from the lights
  a.globalCompositeOperation = 'lighter';
  for (const [lx, ly] of [[-330, 380], [330, 380], [-150, 560], [150, 560]]) {
    const t = PJ(lx, ly, 150), r = 46 * t.s; const gr = a.createRadialGradient(t.x, t.y, 0, t.x, t.y, r); gr.addColorStop(0, 'rgba(255,245,220,0.55)'); gr.addColorStop(1, 'rgba(255,245,220,0)');
    a.fillStyle = gr; a.fillRect(t.x - r, t.y - r, r * 2, r * 2);
  }
  a.globalCompositeOperation = 'source-over';
  return c;
}
let stadiumBoard = null;

// ---------------- 球員：Pixel Hoops 風格的大頭像素精靈 ----------------
const SKINS = ['#f6d3b3', '#eab68c', '#cf9566', '#a06842', '#6f4529'];
const HAIRS = ['#1b1410', '#3a2414', '#6a3e1e', '#c8962e', '#a4381c', '#e8e2d8'];
const DIGITS = { 0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'], 2: ['111', '001', '111', '100', '111'], 3: ['111', '001', '011', '001', '111'],
  4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'], 6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'],
  8: ['111', '101', '111', '101', '111'], 9: ['111', '101', '111', '001', '111'] };
const STAR_LOOK = { 'Josh Chen': { skin: 1, hair: 1, beard: false }, 'Jasper Chen': { skin: 1, hair: 0, beard: false }, 'Jeff Chen': { skin: 1, hair: 0, beard: true, shades: true }, 'Erin Lai': { skin: 0, hair: 1, beard: false, shades: false, pony: true, girl: true } };
function look(p) {
  if (p._look) return p._look;
  let seed = Math.abs(((+p.lookSeed || +p.id || 7) * 2654435761) % 2147483647) || 7;
  const r = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
  const L = { skin: Math.floor(r() * SKINS.length), hair: r() < 0.92 ? Math.floor(r() * 5) : 5, beard: r() < 0.2, shades: r() < 0.08, pony: false, cleats: r() < 0.7 ? '#1c1c1c' : '#f4f4f4' };
  Object.assign(L, STAR_LOOK[p.name] || {});
  return (p._look = L);
}
const spriteCache = new Map();
// frames: stand run1 run2 windup throw crouch dive bat swing
function sprite(p, team, frame) {
  const key = p.id + '|' + team.name + '|' + frame;
  let c = spriteCache.get(key); if (c) return c;
  const L = look(p), skin = SKINS[L.skin], skinD = shade(skin, -0.18), hair = HAIRS[L.hair];
  const shirt = team.shirt, trim = team.trim, pants = team.pants, hat = team.hat, glove = '#8b4d1e';
  const Wd = 30, Ht = 32;
  c = document.createElement('canvas'); c.width = Wd; c.height = Ht;
  const x = c.getContext('2d'), R = (a, b, w, h, col) => { if (!col) return; x.fillStyle = col; x.fillRect(a, b, w, h); };
  const hx = 9, hy = 3, ty = hy + 12, sy = ty + 7, ly = sy + 3;
  const legs = (pose) => {                                                        // pants, socks, cleats
    const L1 = { stand: [0, 0], run1: [-2, 1], run2: [2, -1], bat: [-1, 1], swing: [-2, 2], throw: [-2, 2], windup: [0, 0] }[pose] || [0, 0];
    R(hx + 1, sy, 10, 3, pants); R(hx + 1, sy, 10, 1, '#1c1c1c');                  // belt
    R(hx + 1 + L1[0], ly, 4, 4, pants); R(hx + 7 + L1[1], ly, 4, 4, shade(pants, -0.15));
    R(hx + 1 + L1[0], ly + 4, 4, 2, trim); R(hx + 7 + L1[1], ly + 4, 4, 2, shade(trim, -0.15));
    R(hx + L1[0], ly + 6, 5, 2, L.cleats); R(hx + 7 + L1[1], ly + 6, 5, 2, L.cleats);
  };
  const body = () => {
    R(hx + 1, ty, 10, 7, shirt); R(hx + 1, ty, 1, 7, trim); R(hx + 10, ty, 1, 7, trim); R(hx + 4, ty, 4, 1, skin);
    const num = String(p.num % 100), dw = num.length * 4 - 1, dx = hx + 6 - Math.floor(dw / 2);
    num.split('').forEach((dd, i) => DIGITS[dd].forEach((row, yy) => row.split('').forEach((b, xx) => { if (b === '1') R(dx + i * 4 + xx, ty + 1 + yy, 1, 1, trim); })));
  };
  const head = (helmet, mask) => {
    if (L.pony) { R(hx + 10, hy + 4, 3, 7, hair); if (L.girl) { R(hx + 11, hy + 2, 4, 11, hair); R(hx + 12, hy + 13, 2, 2, hair); } }
    R(hx, hy + 1, 12, 9, skin); R(hx + 1, hy, 10, 11, skin); R(hx + 1, hy + 10, 10, 1, skinD); R(hx - 1, hy + 5, 1, 2, skin); R(hx + 12, hy + 5, 1, 2, skinD);
    R(hx, hy + 3, 1, 2, hair); R(hx + 11, hy + 3, 1, 2, hair);
    if (L.girl) { R(hx - 1, hy + 2, 2, 9, hair); R(hx + 11, hy + 2, 2, 9, hair); }               // long hair
    // cap or batting helmet
    R(hx - 1, hy - 1, 14, 4, hat); R(hx, hy - 2, 12, 1, hat); R(hx + 2, hy - 1, 3, 1, shade(hat, 0.3));
    if (helmet) { R(hx - 1, hy + 3, 3, 4, hat); R(hx - 1, hy - 1, 14, 1, shade(hat, 0.4)); } else { R(hx - 2, hy + 2, 16, 1, shade(hat, -0.3)); }
    R(hx + 5, hy, 2, 2, trim);                                                         // the cap logo
    R(hx + 2, hy + 4, 3, 1, shade(hair, -0.2)); R(hx + 7, hy + 4, 3, 1, shade(hair, -0.2));
    if (L.shades) { R(hx + 1, hy + 5, 10, 2, '#1a1a22'); R(hx + 2, hy + 5, 2, 1, '#6a8aff'); }
    else { R(hx + 3, hy + 5, 2, 2, '#1a1420'); R(hx + 7, hy + 5, 2, 2, '#1a1420'); R(hx + 3, hy + 5, 1, 1, '#ffffff'); R(hx + 7, hy + 5, 1, 1, '#ffffff'); }
    R(hx + 1, hy + 7, 2, 1, 'rgba(255,110,120,0.45)'); R(hx + 9, hy + 7, 2, 1, 'rgba(255,110,120,0.45)');
    if (L.beard) { R(hx + 1, hy + 8, 10, 3, hair); R(hx + 4, hy + 8, 4, 1, skin); }
    if (L.girl && !L.shades) { R(hx + 2, hy + 5, 1, 1, '#1a1420'); R(hx + 9, hy + 5, 1, 1, '#1a1420'); }   // lashes
    R(hx + 5, hy + 8, 2, 1, L.girl ? '#e0506e' : '#8a3a3a');
    if (mask) { R(hx + 1, hy + 3, 10, 7, 'rgba(30,30,36,0.55)'); for (let k = 0; k < 3; k++) R(hx + 1, hy + 4 + k * 2, 10, 1, '#2a2a30'); }
  };
  const arms = (lx, ly2, rx, ry2, gloveSide) => {                                   // two arms with hands; one wears the glove
    R(hx - 2, ty + 1, 3, 3, shirt); R(hx + 11, ty + 1, 3, 3, shirt);
    R(lx, ly2, 3, 3, skin); R(rx, ry2, 3, 3, skinD);
    if (gloveSide === 'L') { R(lx - 1, ly2, 4, 4, glove); R(lx, ly2 + 1, 2, 1, shade(glove, 0.3)); }
    if (gloveSide === 'R') { R(rx, ry2, 4, 4, glove); R(rx + 1, ry2 + 1, 2, 1, shade(glove, 0.3)); }
  };
  switch (frame) {
    case 'crouch': {                                                                  // the catcher behind the plate
      R(hx, sy - 1, 12, 4, pants); R(hx - 1, sy + 3, 5, 3, pants); R(hx + 8, sy + 3, 5, 3, pants);
      R(hx - 1, sy + 6, 5, 2, L.cleats); R(hx + 8, sy + 6, 5, 2, L.cleats);
      R(hx + 1, ty, 10, 7, '#2a2a30'); R(hx + 2, ty + 1, 8, 5, '#3a3a44');            // chest protector
      arms(hx - 3, ty + 4, hx + 12, ty + 4, 'L'); head(true, true);
      break; }
    case 'dive': {                                                                    // stretched out on the ground
      const yy = 22;
      R(2, yy, 10, 4, pants); R(0, yy + 1, 2, 3, L.cleats); R(12, yy - 1, 9, 6, shirt); R(12, yy - 1, 9, 1, trim);
      R(21, yy - 2, 6, 6, skin); R(21, yy - 3, 6, 2, hat); R(23, yy, 1, 1, '#1a1420'); R(27, yy, 3, 4, glove);
      break; }
    case 'bat': case 'swing': {                                                        // the hitter, helmet on, bat in hand
      legs(frame === 'swing' ? 'swing' : 'bat'); body();
      if (frame === 'bat') { arms(hx + 9, ty + 2, hx + 11, ty + 3, null); R(hx + 12, ty - 9, 2, 12, '#e2b066'); R(hx + 12, ty - 9, 1, 12, '#f2d090'); }
      else { arms(hx - 3, ty + 3, hx - 1, ty + 4, null); R(hx - 9, ty + 3, 12, 2, '#e2b066'); R(hx - 9, ty + 3, 12, 1, '#f2d090'); }
      head(true, false);
      break; }
    case 'windup': {                                                                  // knee up, glove at the chest
      R(hx + 1, sy, 10, 3, pants); R(hx + 1, sy, 10, 1, '#1c1c1c'); R(hx + 7, ly, 4, 4, pants); R(hx + 7, ly + 4, 4, 2, trim); R(hx + 6, ly + 6, 5, 2, L.cleats);
      R(hx - 1, ly - 2, 6, 3, pants); R(hx - 3, ly - 2, 3, 3, trim);                  // the raised leg
      body(); arms(hx + 3, ty + 2, hx + 6, ty + 2, 'L'); head(false, false);
      break; }
    case 'throw': legs('throw'); body(); arms(hx - 3, ty + 4, hx + 14, ty - 3, 'L'); head(false, false); break;
    default: { legs(frame); body(); const sw = frame === 'run1' ? 1 : frame === 'run2' ? -1 : 0; arms(hx - 3, ty + 4 + sw, hx + 12, ty + 4 - sw, 'L'); head(false, false); }
  }
  // a dark outline around the whole player, like Pixel Hoops
  const id = x.getImageData(0, 0, Wd, Ht), dd = id.data, src = new Uint8ClampedArray(dd);
  for (let yy = 0; yy < Ht; yy++) for (let xx = 0; xx < Wd; xx++) {
    const i = (yy * Wd + xx) * 4; if (src[i + 3] > 40) continue;
    if ((xx > 0 && src[i - 1] > 40) || (xx < Wd - 1 && src[i + 7] > 40) || (yy > 0 && src[i - Wd * 4 + 3] > 40) || (yy < Ht - 1 && src[i + Wd * 4 + 3] > 40)) { dd[i] = 20; dd[i + 1] = 16; dd[i + 2] = 24; dd[i + 3] = 255; }
  }
  x.putImageData(id, 0, 0);
  spriteCache.set(key, c);
  return c;
}
const UMP = { name: 'ump', hat: '#1f1f1f', shirt: '#2c2c34', trim: '#5a5a66', pants: '#6a6a72', bar: '#888' };

// ---------------- 狀態 ----------------
let teams = null, game, snap, homesMap, ents, ev = null, et = 0, gap = 0, waitT = 0, playing = false, speed = 1, banner = null, onEnd = null, finished = false;
function byId(id) { for (const t of teams) for (const p of t.roster) if (p.id === id) return p; return null; }

function start(away, home, opts = {}) {
  teams = [away, home]; onEnd = opts.onEnd || null; finished = false;
  spriteCache.clear(); stadium = null;
  game = new Game(teams[0], teams[1]);
  snap = Object.assign(game.snap(), { pregame: true });
  homesMap = homes(snap);
  ents = new Map();
  for (const t of teams) for (const p of t.roster) { const h = homesMap.get(p.id); ents.set(p.id, { p, x: h.x, y: h.y, phase: Math.random() * 6, moving: false }); }
  ev = null; et = 0; gap = 0; banner = { text: `${teams[0].full} vs ${teams[1].full}`, t: 0, dur: 3 };
  $('log').innerHTML = '';
  addLog([{ cls: 'inning', s: $L(`比賽即將開始：${teams[0].full}（客）vs ${teams[1].full}（主）`, `Play ball! ${teams[0].full} (away) vs ${teams[1].full} (home)`) },
    { s: $L(`先發投手：${game.ts[0].pitcher.name}（${teams[0].name}） vs ${game.ts[1].pitcher.name}（${teams[1].name}）`, `Starting pitchers: ${game.ts[0].pitcher.name} (${teams[0].name}) vs ${game.ts[1].pitcher.name} (${teams[1].name})`) }]);
  setPlaying(!!opts.autoplay);
  $('btnSim').disabled = false; $('btnPlay').disabled = false;
  rosterTeam = 0; renderRosterSel(); refreshPanels();
}

// 依快照決定每位球員的「歸位」位置
function homes(sn) {
  const M = new Map();
  for (let ti = 0; ti < 2; ti++) {
    const team = teams[ti], side = ti === 1 ? 1 : -1, placed = new Set();
    if (!sn.pregame) {
      if (sn.offIdx !== ti) {
        for (const pos of FIELD) { const id = sn.field[pos]; M.set(id, { x: POS_XY[pos].x, y: POS_XY[pos].y, role: 'field', pos }); placed.add(id); }
      } else {
        const b = byId(sn.batter);
        M.set(b.id, { x: b.bats === 'R' ? -6 : 6, y: 1, role: 'bat' }); placed.add(b.id);
        if (!sn.over) { M.set(sn.onDeck, { x: 48 * side, y: -14, role: 'deck' }); placed.add(sn.onDeck); }
        sn.bases.forEach((id, i) => { if (id) { M.set(id, { x: BASE[i + 1].x + (i === 0 ? 3 : i === 2 ? -3 : 0), y: BASE[i + 1].y - 3, role: 'run' }); placed.add(id); } });
      }
    }
    let dug = 0, pen = 0;
    const entered = new Set(sn.entered[ti]);
    for (const p of team.roster) {
      if (placed.has(p.id)) continue;
      if (p.role !== 'H' && !entered.has(p.id)) { const i = pen++; M.set(p.id, { x: side * (195 + (i % 4) * 11), y: 118 + Math.floor(i / 4) * 12, role: 'pen' }); }
      else { const i = dug++; M.set(p.id, { x: side * (98 + (i % 7) * 9), y: -4 - Math.floor(i / 7) * 5, role: 'dug' }); }
    }
  }
  return M;
}

// ---------------- 事件播放 ----------------
function startEvent(e) {
  ev = e; et = 0; ev.tracks = new Map(); ev.poses = new Map();
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
  if (finished) return; finished = true;
  const [a, h] = snap.R;
  const w = a === h ? $t('平手') : (a > h ? teams[0].full : teams[1].full) + $t(' 獲勝！');
  banner = { text: `${$t('比賽結束')} ${a} : ${h}${$t('　')}${w}`, t: 0, dur: 9999 };
  addLog([{ cls: 'final', s: `${$t('比賽結束　')}${teams[0].full} ${a} : ${h} ${teams[1].full}${$t('　')}${w}` }].concat((game.result || []).map(s => ({ cls: 'final', s }))));
  setPlaying(false);
  $('btnPlay').disabled = true; $('btnSim').disabled = true;
  refreshPanels();
  if (onEnd) setTimeout(() => onEnd({ R: snap.R.slice(), game }), 900);
}
function settled() { for (const e of ents.values()) { const h = homesMap.get(e.p.id); if (Math.abs(e.x - h.x) > 3 || Math.abs(e.y - h.y) > 3) return false; } return true; }
function update(dt) {
  if (!teams) return;
  if (banner) { banner.t += dt; if (banner.t > banner.dur) banner = null; }
  if (playing) {
    if (!ev) { gap -= dt; waitT += dt; if (gap <= 0 && (settled() || waitT > 4)) { const e = game.step(); if (e) startEvent(e); } }
    else { et += dt; if (et >= ev.dur) endEvent(); }
  }
  for (const e of ents.values()) {
    const id = e.p.id, h = homesMap.get(id), tr = ev && ev.tracks.get(id);
    let nx = e.x, ny = e.y;
    if (tr) {
      let ci = -1; for (let i = 0; i < tr.length; i++) if (tr[i].t0 <= et) ci = i;
      if (ci >= 0) { const m = tr[ci]; if (!m.from) m.from = ci > 0 ? tr[ci - 1].to : { x: e.x, y: e.y }; const u = clamp((et - m.t0) / (m.t1 - m.t0), 0, 1); nx = m.from.x + (m.to.x - m.from.x) * u; ny = m.from.y + (m.to.y - m.from.y) * u; }
    } else { const dx = h.x - e.x, dy = h.y - e.y, d = Math.hypot(dx, dy), step = 60 * dt; if (d <= step) { nx = h.x; ny = h.y; } else { nx = e.x + dx / d * step; ny = e.y + dy / d * step; } }
    const mdx = nx - e.x, mdy = ny - e.y;
    e.moving = Math.hypot(mdx, mdy) > 0.01;
    if (e.moving) { e.phase += dt * 10; if (Math.abs(mdx) > 0.02) e.face = mdx < 0; }
    e.x = nx; e.y = ny;
  }
}

// ---------------- 繪圖 ----------------
function poseOf(id) { if (!ev) return null; const l = ev.poses.get(id); if (!l) return null; let f = null; for (const p of l) if (p.t <= et && et < p.t + p.dur) f = p.frame; return f; }
function defaultFace(e, h) {
  if (h.role === 'bat') return e.p.bats !== 'R';
  if (h.role === 'dug' || h.role === 'pen' || h.role === 'deck') return h.x > 0;
  if (h.role === 'field') return h.pos === 'P' ? false : h.x > 1;
  return h.x > 0;
}
function drawAt(img, X, Y, flip, scale) {          // feet at logical (X, Y)
  const w = img.width * PZ * scale, h = img.height * PZ * scale, px = Math.round((X - w / 2) * S) / S, py = Math.round((Y - h + 1) * S) / S;
  if (flip) { ctx.save(); ctx.translate(px + w, py); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, w, h); ctx.restore(); } else ctx.drawImage(img, px, py, w, h);
}
function draw(now) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
  if (!teams) { ctx.fillStyle = '#0b0c12'; ctx.fillRect(0, 0, cv.width, cv.height); return; }
  const key = teams[1].name + '|' + teams[0].name;
  if (!stadium || stadiumKey !== key) { stadium = buildStadium(teams[1], teams[0]); stadiumKey = key; }
  ctx.drawImage(stadium, 0, 0);
  ctx.setTransform(S, 0, 0, S, 0, 0);
  if (stadiumBoard) drawBoard();
  const list = [...ents.values()].map(e => ({ e, y: e.y }));
  list.push({ ump: true, y: -17 });
  list.sort((a, b) => b.y - a.y);
  for (const it of list) {
    if (it.ump) { const q = PJ(4, -17, 0); shadowAt(q); drawAt(sprite({ id: -1, num: 0, name: 'ump' }, UMP, 'stand'), q.x, q.y, false, 1); continue; }
    const e = it.e, h = homesMap.get(e.p.id), team = e.p.team;
    let frame = poseOf(e.p.id);
    if (!frame) {
      if (e.moving) frame = Math.floor(e.phase) % 2 ? 'run1' : 'run2';
      else if (h.role === 'bat' && Math.abs(e.x - h.x) < 1 && Math.abs(e.y - h.y) < 1) frame = 'bat';
      else if (h.role === 'field' && h.pos === 'C' && Math.abs(e.x - h.x) < 1 && Math.abs(e.y - h.y) < 1) frame = 'crouch';
      else frame = 'stand';
    }
    const face = e.moving ? !!e.face : defaultFace(e, h), q = PJ(e.x, e.y, 0), active = h.role !== 'dug' && h.role !== 'pen';
    shadowAt(q, e.p.star && active);
    drawAt(sprite(e.p, team, frame), q.x, q.y, face, active ? 1 : 0.8);
    if (e.p.star && active) { const k = PZ; ctx.fillStyle = '#ffd23a'; const top = q.y - 32 * PZ - 2; ctx.fillRect(q.x - 0.5 * k, top - 3 * k, k, k); ctx.fillRect(q.x - 1.5 * k, top - 2 * k, 3 * k, k); ctx.fillRect(q.x - 0.5 * k, top - k, k, k); }
  }
  drawBall();
  if (fxOn) { tiltShift(); glow(); }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawTexts(); drawHUD();
  if (banner) drawBanner();
}
function shadowAt(q, star) { ctx.fillStyle = star ? 'rgba(255,210,60,0.45)' : 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(q.x, q.y + 0.3, star ? 6 : 5, 1.6, 0, 0, Math.PI * 2); ctx.fill(); }
function drawBoard() {                       // the centre-field scoreboard shows the live score
  const b = stadiumBoard, sn = snap;
  ctx.fillStyle = '#ff6a2a'; ctx.font = `bold ${Math.max(4, b.h * 0.32)}px "Courier New", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(`${sn.R[0]} - ${sn.R[1]}`, b.x + b.w / 2, b.y + b.h * 0.35);
  ctx.fillStyle = '#ffd23a'; ctx.font = `bold ${Math.max(3, b.h * 0.22)}px ${FONT}`;
  ctx.fillText(sn.pregame ? 'PLAY BALL' : sn.over ? 'FINAL' : `${sn.inning}${sn.half ? '▼' : '▲'}  ${sn.outs} OUT`, b.x + b.w / 2, b.y + b.h * 0.75);
}
function drawBall() {
  if (!ev || !ev.tl) return;
  let seg = null; for (const s of ev.tl.ball) if (s.t0 <= et && et <= s.t1) seg = s;
  if (!seg) return;
  const u = (et - seg.t0) / Math.max(0.001, seg.t1 - seg.t0);
  const x = seg.from.x + (seg.to.x - seg.from.x) * u, y = seg.from.y + (seg.to.y - seg.from.y) * u;
  const z = seg.h0 + (seg.h1 - seg.h0) * u + 4 * seg.peak * u * (1 - u);
  const g0 = PJ(x, y, 0), b = PJ(x, y, z), r = Math.max(0.8, Math.min(2.4, 1.1 + z / 60));
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(g0.x, g0.y, r, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#161616'; ctx.beginPath(); ctx.arc(b.x, b.y, r + 0.35, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e04040'; ctx.fillRect(b.x - r * 0.5, b.y - 0.15, r, 0.3);
}
// ---- the HD-2D post-processing (from Pixel Hoops): soft focus at the top and bottom, bloom, a warm grade, a vignette ----
const bufs = {};
function buf(name, w, h) { const b = bufs[name] || (bufs[name] = document.createElement('canvas')); if (b.width !== w || b.height !== h) { b.width = w; b.height = h; b.dirty = true; } return b; }
function tiltShift() {
  const w = cv.width, h = cv.height, sm = buf('dof', w / 4, h / 4), sg = sm.getContext('2d');
  sg.filter = 'blur(1.6px)'; sg.clearRect(0, 0, sm.width, sm.height); sg.drawImage(cv, 0, 0, sm.width, sm.height); sg.filter = 'none';
  const m = buf('dofmask', w, h);
  if (m.dirty) { const mg = m.getContext('2d'), gr = mg.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.18, 'rgba(0,0,0,0.75)'); gr.addColorStop(0.3, 'rgba(0,0,0,0)'); gr.addColorStop(0.92, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.7)'); mg.fillStyle = gr; mg.fillRect(0, 0, w, h); m.dirty = false; }
  const big = buf('dofbig', w, h), bg = big.getContext('2d');
  bg.globalCompositeOperation = 'source-over'; bg.clearRect(0, 0, w, h); bg.imageSmoothingEnabled = true; bg.drawImage(sm, 0, 0, w, h);
  bg.globalCompositeOperation = 'destination-in'; bg.drawImage(m, 0, 0); bg.globalCompositeOperation = 'source-over';
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(big, 0, 0); ctx.restore();
}
function glow() {
  const w = cv.width, h = cv.height, b = buf('bloom', w / 4, h / 4), bl = b.getContext('2d');
  bl.filter = 'brightness(0.7) contrast(3) saturate(1.4) blur(3px)'; bl.clearRect(0, 0, b.width, b.height); bl.drawImage(cv, 0, 0, b.width, b.height); bl.filter = 'none';
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = true;
  ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.32; ctx.drawImage(b, 0, 0, w, h);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = 'rgba(255,190,110,0.12)'; ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
  const v = buf('vig', w, h);
  if (v.dirty) { const vg = v.getContext('2d'), gr = vg.createRadialGradient(w / 2, h * 0.6, h * 0.35, w / 2, h * 0.6, w * 0.7); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(6,4,18,0.55)'); vg.fillStyle = gr; vg.fillRect(0, 0, w, h); v.dirty = false; }
  ctx.drawImage(v, 0, 0); ctx.restore();
}
function outlined(str, x, y, px, color, align) {
  ctx.font = `bold ${px}px ${FONT}`; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, px / 5); ctx.strokeStyle = '#161616'; ctx.strokeText(str, x, y); ctx.fillStyle = color; ctx.fillText(str, x, y);
}
function drawTexts() {
  if (!ev || !ev.tl) return;
  for (const t of ev.tl.tx) {
    const age = et - t.t; if (age < 0 || age > 1.1) continue;
    const q = PJ(t.x, t.y, 0);
    ctx.globalAlpha = age > 0.8 ? (1.1 - age) / 0.3 : 1;
    const pop = age < 0.12 ? 1 + (0.12 - age) * 3 : 1;
    outlined(t.str, clamp(q.x * S, 80, W * S - 80), clamp(q.y * S - 70 - age * 30, 60, H * S - 30), Math.round(30 * t.size * pop), t.color);
    ctx.globalAlpha = 1;
  }
}
function drawHUD() {
  const x = 18, y = 18, w = 420, h = 128, sn = snap;
  ctx.fillStyle = 'rgba(11,12,18,0.88)'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = '#000'; ctx.lineWidth = 4; ctx.strokeRect(x, y, w, h);
  for (let i = 0; i < 2; i++) {
    const t = teams[i], ry = y + 36 + i * 50;
    ctx.fillStyle = t.bar; ctx.fillRect(x + 14, ry - 16, 10, 32);
    let px = 26; ctx.font = `bold ${px}px ${FONT}`; const tw = ctx.measureText(t.full).width; if (tw > 150) px = Math.max(14, Math.floor(px * 150 / tw));   // long English names shrink to fit
    outlined(t.full, x + 34, ry, px, sn.offIdx === i && !sn.pregame && !sn.over ? '#ffc83a' : '#ffffff', 'left');
    ctx.font = 'bold 40px "Courier New", monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#ff6a2a'; ctx.fillText(String(sn.R[i]), x + 212, ry + 2);
  }
  const ix = x + 268;
  outlined(sn.pregame ? $t('賽前') : sn.over ? $t('終') : `${sn.inning}${sn.half ? '▼' : '▲'}`, ix + 6, y + 36, 26, '#ffc83a', 'center');
  const bx = ix + 92, by = y + 40;
  const dia = (cx, cy, on) => { ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.PI / 4); ctx.fillStyle = on ? '#ffc83a' : '#3a4157'; ctx.fillRect(-9, -9, 18, 18); ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.strokeRect(-9, -9, 18, 18); ctx.restore(); };
  dia(bx + 22, by, sn.bases[0]); dia(bx, by - 20, sn.bases[1]); dia(bx - 22, by, sn.bases[2]);
  const dots = (label, n, max, color, rx, ry) => { outlined(label, rx, ry, 18, '#ffffff', 'left'); for (let k = 0; k < max; k++) { ctx.fillStyle = k < n ? color : '#3a4157'; ctx.beginPath(); ctx.arc(rx + 26 + k * 18, ry, 6.5, 0, Math.PI * 2); ctx.fill(); } };
  dots('B', sn.balls, 3, '#4cd07a', ix - 12, y + 80); dots('S', sn.strikes, 2, '#ffc83a', ix - 12, y + 106); dots('O', sn.outs, 2, '#ff5a5a', ix + 70, y + 93);
}
function drawBanner() {
  const b = banner, a = b.t < 0.2 ? b.t / 0.2 : b.dur - b.t < 0.3 ? (b.dur - b.t) / 0.3 : 1;
  ctx.globalAlpha = clamp(a, 0, 1);
  const y = H * S * 0.45;
  ctx.fillStyle = 'rgba(11,12,18,0.8)'; ctx.fillRect(0, y - 46, W * S, 92);
  ctx.fillStyle = '#ffc83a'; ctx.fillRect(0, y - 46, W * S, 4); ctx.fillRect(0, y + 42, W * S, 4);
  outlined(b.text, W * S / 2, y, 44, '#ffc83a');
  ctx.globalAlpha = 1;
}

// ---------------- 面板 ----------------
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const nm = p => esc(p.name) + (p.star ? $t(' <span class="star" title="傳說球員">★</span>') : '') + (p.rarity ? ` <span class="rar r-${p.rarity}">${p.rarity}</span>` : '');
function addLog(items) {
  if (!items || !items.length) return;
  const L = $('log'), half = snap && !snap.pregame ? `${snap.inning}${snap.half ? $L('下', '▼') : $L('上', '▲')} ` : '';
  for (const it of items) { const d = document.createElement('div'); if (it.cls) d.className = it.cls; d.textContent = (it.cls === 'inning' || it.cls === 'final' || it.s.startsWith($t('　')) ? '' : half) + it.s; L.prepend(d); }
}
function gradeColor(v) { return v >= 90 ? '#ff8a3a' : v >= 80 ? '#ffc83a' : v >= 70 ? '#9be36a' : v >= 60 ? '#4cd07a' : v >= 50 ? '#8ab8f0' : v >= 40 ? '#9aa2bd' : '#e08080'; }
function grade(v) { return v >= 90 ? 'S' : v >= 80 ? 'A' : v >= 70 ? 'B' : v >= 60 ? 'C' : v >= 50 ? 'D' : v >= 40 ? 'E' : 'F'; }
const bar = (label, v, color) => `<div class="rt"><span>${label}</span><i><b style="width:${clamp(v, 0, 100)}%;background:${color || gradeColor(v)}"></b></i><span>${Math.round(v)}</span></div>`;
const skl = p => !p.sk || !p.sk.length || !window.SKILLS ? '' : `<div class="skc">${p.sk.map(id => { const s = SKILLS.BY_ID[id]; return s ? `<span class="g${s.grade}" title="${SKILLS.desc(s)}">${s.name}</span>` : ''; }).join('')}</div>`;
const ip = outs => `${Math.floor(outs / 3)}.${outs % 3}`;
function refreshPanels() {
  const sn = snap, n = Math.max(9, sn.line[0].length, sn.line[1].length);
  let h = $t('<tr><th>球隊</th>'); for (let i = 1; i <= n; i++) h += `<th>${i}</th>`; h += '<th>R</th><th>H</th><th>E</th></tr>';
  for (let t = 0; t < 2; t++) {
    h += `<tr><td class="tn"><span class="chip" style="background:${teams[t].bar}"></span>${esc(teams[t].full)}</td>`;
    for (let i = 0; i < n; i++) { const v = sn.line[t][i], cur = !sn.pregame && !sn.over && sn.inning === i + 1 && sn.offIdx === t; h += `<td class="${cur ? 'cur' : ''}">${v === undefined ? '' : v}</td>`; }
    h += `<td class="tot">${sn.R[t]}</td><td class="tot">${sn.H[t]}</td><td class="tot">${sn.E[t]}</td></tr>`;
  }
  $('line').innerHTML = h;
  const defI = sn.pregame ? 1 : 1 - sn.offIdx, P = byId(sn.pitchers[defI]), B = sn.pregame ? game.ts[0].lineup[0].p : byId(sn.batter);
  const lim = game.pLimit(P), st = clamp(1 - P.g.NP / lim, 0, 1) * 100;
  $('cardP').innerHTML = `<h3><span class="chip" style="background:${P.team.bar}"></span>#${P.num} ${nm(P)} <span class="role">${POS_CN[P.role]}</span></h3>
    <div class="sub">${P.throws === 'R' ? $t('右投') : $t('左投')}${$t('｜')}${P.velo}km${$t('｜')}${(P.pitches || []).join($t('、'))}</div>
    ${skl(P)}${bar($t('速球'), P.r.fastball)}${bar($t('變化球'), P.r.breaking)}${bar($t('控球'), P.r.control)}${bar($t('體力'), P.r.stamina)}${bar($t('剩餘'), st, st > 50 ? '#4cd07a' : st > 25 ? '#ffc83a' : '#ff5a5a')}
    <div class="line">${$L(`本場：${ip(P.g.outs)}局 ${P.g.NP}球 被安${P.g.pH} 失${P.g.pR} 四壞${P.g.pBB} 三振${P.g.pSO}`, `Today: ${ip(P.g.outs)} IP · ${P.g.NP} pitches · ${P.g.pH} H · ${P.g.pR} R · ${P.g.pBB} BB · ${P.g.pSO} K`)}</div>`;
  const e = (sn.lineups[sn.pregame ? 0 : sn.offIdx] || []).find(x => x.id === B.id), g = B.g;
  const line = g.AB || g.BB ? $L(`${g.AB}打數${g.H}安打${g.HR ? ' ' + g.HR + '轟' : ''}${g.RBI ? ' ' + g.RBI + '打點' : ''}${g.BB ? ' ' + g.BB + '保送' : ''}${g.SO ? ' ' + g.SO + '三振' : ''}`, `${g.H}-for-${g.AB}${g.HR ? ', ' + g.HR + ' HR' : ''}${g.RBI ? ', ' + g.RBI + ' RBI' : ''}${g.BB ? ', ' + g.BB + ' BB' : ''}${g.SO ? ', ' + g.SO + ' K' : ''}`) : $t('本場首打席');
  $('cardB').innerHTML = `<h3><span class="chip" style="background:${B.team.bar}"></span>#${B.num} ${nm(B)} <span class="role">${e ? POS_SHORT[e.pos] : POS_SHORT[B.pos]}</span></h3>
    <div class="sub">${B.bats === 'R' ? $t('右打') : $t('左打')}</div>
    ${skl(B)}${bar($t('打擊'), B.r.contact)}${bar($t('力量'), B.r.power)}${bar($t('選球'), B.r.eye)}${bar($t('速度'), B.r.speed)}${bar($t('守備'), B.r.defense)}${bar($t('臂力'), B.r.arm)}
    <div class="line">${$t('本場：')}${line}</div>`;
  if ($('pane-box').classList.contains('on')) renderBox();
}
function renderBox() {
  let h = '';
  for (let t = 0; t < 2; t++) {
    const ts = game.ts[t], team = teams[t], hitters = [];
    ts.lineup.forEach((e, i) => hitters.push({ p: e.p, pos: e.pos, slot: i + 1 }));
    for (const p of team.roster) if (p.role === 'H' && ts.exited.has(p.id)) hitters.push({ p, pos: p.pos, out: true });
    h += `<h4><span class="chip" style="background:${team.bar}"></span>${esc(team.full)} ${$t('打擊')}</h4><table class="box"><tr><th>${$t('打者')}</th><th>${$t('守')}</th><th>${$t('打數')}</th><th>${$t('安打')}</th><th>${$t('全壘打')}</th><th>${$t('打點')}</th><th>${$t('得分')}</th><th>${$t('四壞')}</th><th>${$t('三振')}</th></tr>`;
    for (const x of hitters) { const g = x.p.g; h += `<tr><td>${x.slot || ''} ${esc(x.p.name)}${x.out ? $t('（退）') : ''}</td><td>${POS_SHORT[x.pos] || x.pos}</td><td>${g.AB}</td><td>${g.H}</td><td>${g.HR}</td><td>${g.RBI}</td><td>${g.R}</td><td>${g.BB}</td><td>${g.SO}</td></tr>`; }
    h += `</table><h4>${esc(team.full)} ${$t('投手')}</h4><table class="box"><tr><th>${$t('投手')}</th><th>${$t('局數')}</th><th>${$t('用球')}</th><th>${$t('被安')}</th><th>${$t('失分')}</th><th>${$t('四壞')}</th><th>${$t('三振')}</th><th></th></tr>`;
    for (const p of team.roster) { if (p.role === 'H' || !ts.entered.has(p.id)) continue; const g = p.g; h += `<tr><td>${esc(p.name)} <small>${POS_SHORT[p.role]}</small></td><td>${ip(g.outs)}</td><td>${g.NP}</td><td>${g.pH}</td><td>${g.pR}</td><td>${g.pBB}</td><td>${g.pSO}</td><td>${g.W ? $t('勝') : g.L ? $t('敗') : g.S ? $t('救援') : ''}</td></tr>`; }
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
  const t = teams[rosterTeam], cell = v => `<td><span class="g" style="background:${gradeColor(v)}">${grade(v)} ${v}</span></td>`;
  let h = `<table class="box"><tr><th>${$t('野手')}</th><th>${$t('位置')}</th><th>${$t('打擊')}</th><th>${$t('力量')}</th><th>${$t('選球')}</th><th>${$t('速度')}</th><th>${$t('守備')}</th><th>${$t('臂力')}</th></tr>`;
  for (const p of t.roster.filter(p => p.role === 'H')) h += `<tr><td>#${p.num} ${nm(p)}</td><td>${POS_SHORT[p.pos]}</td>${cell(p.r.contact)}${cell(p.r.power)}${cell(p.r.eye)}${cell(p.r.speed)}${cell(p.r.defense)}${cell(p.r.arm)}</tr>`;
  h += `</table><table class="box"><tr><th>${$t('投手')}</th><th>${$t('角色')}</th><th>${$t('球速')}</th><th>${$t('速球')}</th><th>${$t('變化球')}</th><th>${$t('控球')}</th><th>${$t('體力')}</th></tr>`;
  for (const p of t.roster.filter(p => p.role !== 'H')) h += `<tr><td>#${p.num} ${nm(p)}</td><td>${POS_SHORT[p.role]}</td><td>${p.velo}</td>${cell(p.r.fastball)}${cell(p.r.breaking)}${cell(p.r.control)}${cell(p.r.stamina)}</tr>`;
  $('roster').innerHTML = h + '</table>';
}

// ---------------- 控制 ----------------
function setPlaying(v) { playing = v; $('btnPlay').textContent = v ? $t('⏸ 暫停') : (snap && !snap.pregame ? $t('▶ 繼續') : $t('▶ 開始比賽')); }
$('btnPlay').onclick = () => setPlaying(!playing);
$('speed').onchange = e => { speed = +e.target.value; };
function simToEnd() {
  if (!teams || finished) return;
  if (ev) endEvent();
  let e, logs = [];
  while ((e = game.step())) { logs.push(...e.log); if (e.post.over) break; }
  applySnap(game.snap());
  for (const en of ents.values()) { const h = homesMap.get(en.p.id); en.x = h.x; en.y = h.y; }
  addLog(logs.slice(-40)); refreshPanels(); gameOver();
}
$('btnSim').onclick = simToEnd;
$('btnFx').onclick = () => { fxOn = !fxOn && canFilter; $('btnFx').textContent = fxOn ? $t('✨ 特效：開') : $t('✨ 特效：關'); try { localStorage.setItem('pbb.fx', fxOn ? 'on' : 'off'); } catch (e) { /* ignore */ } };
$('btnFx').textContent = fxOn ? $t('✨ 特效：開') : $t('✨ 特效：關');
document.querySelectorAll('#match .tabs button').forEach(b => b.onclick = () => {
  document.querySelectorAll('#match .tabs button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('#match .pane').forEach(p => p.classList.toggle('on', p.id === 'pane-' + b.dataset.tab));
  if (b.dataset.tab === 'box') renderBox();
  if (b.dataset.tab === 'roster') renderRoster();
});
let last = performance.now();
function frame(now) {
  const dt = clamp((now - last) / 1000, 0, 0.05); last = now;
  const sub = Math.ceil(speed); for (let i = 0; i < sub; i++) update(dt * speed / sub);
  if (!document.getElementById('match').hidden) draw(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// quick result without the animation (for the other games of the league and the "simulate" button)
function quick(away, home) { const g = new Game(away, home); let e; while ((e = g.step())) if (e.post.over) break; return { R: [g.ts[0].R, g.ts[1].R], game: g }; }
window.Match = { sprite: (p, team, frame) => sprite(p, team, frame || 'stand'), start, quick, simToEnd, setSpeed: (v) => { speed = v; $('speed').value = String(v); }, play: () => setPlaying(true), get finished() { return finished; }, warp(n) { for (let i = 0; i < n; i++) update(1 / 60); } };
})();
