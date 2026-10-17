// 技能：200 種特殊能力，完全隨機賦予（不綁定球員；稀有度只決定技能數量），比賽中依情境發動、提升能力值。
// 銅（一般）、銀（+）、金（專屬名稱）三階 × 60 系列 = 180 種，加上 20 種傳說技能。
(function (root) {
'use strict';
// conditions, from the player's own team's point of view
const COND = {
  always: ['常時', () => true],
  risp: ['得點圈有跑者', (c) => c.risp],
  loaded: ['滿壘', (c) => c.loaded],
  empty: ['壘上無人', (c) => c.empty],
  onBase: ['壘上有人', (c) => !c.empty],
  vsL: ['對左方', (c) => c.hand === 'L'],
  vsR: ['對右方', (c) => c.hand === 'R'],
  two: ['兩好球後', (c) => c.strikes === 2],
  first: ['第一球', (c) => c.balls === 0 && c.strikes === 0],
  ahead: ['壞球多於好球', (c) => c.balls > c.strikes],
  full: ['滿球數', (c) => c.balls === 3 && c.strikes === 2],
  late: ['第 7 局以後', (c) => c.inn >= 7],
  early: ['前 3 局', (c) => c.inn <= 3],
  extra: ['延長賽', (c) => c.inn >= 10],
  trail: ['球隊落後', (c) => c.lead < 0],
  lead: ['球隊領先', (c) => c.lead > 0],
  bigLead: ['領先 3 分以上', (c) => c.lead >= 3],
  deep: ['落後 3 分以上', (c) => c.lead <= -3],
  tied: ['比分平手', (c) => c.lead === 0],
  close: ['終盤一分差內', (c) => c.inn >= 7 && Math.abs(c.lead) <= 1],
  leadoff: ['局首、無人出局', (c) => c.outs === 0 && c.empty],
  twoOut: ['兩出局', (c) => c.outs === 2],
  zeroOn: ['無人出局有跑者', (c) => c.outs === 0 && !c.empty],
  home: ['主場', (c) => c.home],
  away: ['客場', (c) => !c.home],
  runner: ['跑壘時', (c) => c.runner],
  vsAce: ['對上速球派（速球 75+）', (c) => c.oppVelo >= 75],
  vsRP: ['對上後援投手', (c) => c.oppRP],
  vsPow: ['對上強打者（力量 70+）', (c) => c.oppPow >= 70],
  walkoff: ['主場第 9 局後、平手或落後 1 分', (c) => c.home && c.inn >= 9 && c.lead <= 0 && c.lead >= -1],
};
const ST = { contact: '打擊', power: '力量', eye: '選球', speed: '速度', defense: '守備', arm: '臂力', fastball: '速球', breaking: '變化球', control: '控球', stamina: '體力' };
// [cond, stats, bronze name, gold name, weight]  (weight scales the bonus: always-on skills are weaker)
const HF = [
  ['always', ['contact'], '巧打', '安打製造機', 0.55], ['always', ['power'], '長打', '全壘打砲', 0.55], ['always', ['eye'], '選球眼', '鷹之眼', 0.6],
  ['always', ['speed'], '快腿', '疾風', 0.6], ['always', ['defense'], '好手套', '金手套', 0.6], ['always', ['arm'], '強肩', '雷射肩', 0.65],
  ['risp', ['contact', 'power'], '得點圈', '勝負師', 1], ['loaded', ['power', 'contact'], '滿壘男', '滿壘砲', 1.2], ['vsL', ['contact', 'power'], '左投剋星', '左投殺手', 0.9],
  ['vsR', ['contact', 'power'], '右投剋星', '右投殺手', 0.8], ['two', ['contact', 'eye'], '纏鬥', '鬥魂打擊', 1], ['first', ['contact', 'power'], '初球打', '初球必殺', 1],
  ['ahead', ['power'], '好球帶獵人', '獵殺時刻', 1.1], ['late', ['contact', 'power'], '終盤', '第九局之王', 0.85], ['trail', ['contact', 'power'], '逆境', '逆轉之星', 0.85],
  ['close', ['contact', 'power', 'eye'], '關鍵時刻', '大心臟', 1], ['leadoff', ['eye', 'contact'], '開路先鋒', '特攻隊長', 1], ['twoOut', ['contact', 'power'], '兩出局後', '絕境打者', 0.95],
  ['home', ['contact', 'power'], '主場之光', '主場英雄', 0.7], ['away', ['contact', 'power'], '客場勇者', '敵地霸者', 0.7], ['extra', ['contact', 'power'], '延長賽', '延長戰之鬼', 1.3],
  ['early', ['contact', 'power'], '先制', '開局猛攻', 0.85], ['empty', ['power'], '一發屋', '單騎砲', 1], ['runner', ['speed'], '盜壘', '盜壘王', 1.3],
  ['onBase', ['contact'], '打帶跑', '戰術鬼才', 1], ['late', ['defense', 'arm'], '終盤守備', '鐵壁', 1], ['risp', ['defense', 'arm'], '守備職人', '銅牆鐵壁', 1],
  ['full', ['eye', 'contact'], '滿球數', '球數支配者', 1.2], ['lead', ['power'], '乘勝追擊', '擴大比分', 1], ['deep', ['contact', 'eye'], '不放棄', '永不放棄', 1.1],
  ['tied', ['contact', 'power'], '平手時', '均勢破壞者', 0.9], ['zeroOn', ['contact', 'eye'], '推進打', '推進大師', 1], ['vsAce', ['contact'], '剋速球', '速球殺手', 1.1],
  ['vsRP', ['contact', 'power'], '剋救援', '牛棚克星', 1],
];
const PF = [
  ['always', ['fastball'], '球威', '火球', 0.55], ['always', ['breaking'], '變化球', '魔球', 0.55], ['always', ['control'], '控球', '精密機械', 0.55],
  ['always', ['stamina'], '耐力', '鐵臂', 1.1], ['risp', ['fastball', 'breaking'], '得點圈封鎖', '救火隊', 1], ['loaded', ['control', 'breaking'], '滿壘危機', '危機處理大師', 1.2],
  ['vsL', ['fastball', 'breaking'], '左打剋星', '左打殺手', 0.9], ['vsR', ['fastball', 'breaking'], '右打剋星', '右打殺手', 0.8], ['two', ['breaking', 'fastball'], '決勝球', '三振魔', 1],
  ['first', ['control'], '初球搶好球', '先發制人', 1.2], ['ahead', ['control'], '救回球數', '逆轉球數', 1.2], ['late', ['fastball', 'breaking'], '終盤投手', '守護神', 0.85],
  ['lead', ['control', 'fastball'], '守成', '勝利方程式', 0.85], ['close', ['fastball', 'breaking', 'control'], '抗壓', '鋼鐵心臟', 1], ['twoOut', ['fastball'], '兩出局收尾', '收割者', 1.1],
  ['leadoff', ['control'], '封鎖首打', '開局封鎖', 1.2], ['home', ['fastball', 'control'], '主場投手', '主場守護者', 0.7], ['away', ['fastball', 'control'], '客場投手', '敵地鐵投', 0.7],
  ['extra', ['fastball', 'breaking'], '延長戰', '不死鳥', 1.3], ['early', ['control', 'fastball'], '開局穩定', '開局完美', 0.85], ['empty', ['control'], '節奏', '節奏大師', 1],
  ['trail', ['fastball', 'breaking'], '逆境投球', '逆境鬥魂', 0.9], ['tied', ['breaking', 'control'], '均勢投手', '膠著戰之王', 0.9], ['full', ['control'], '冷靜', '冷靜沉著', 1.3],
  ['vsPow', ['breaking'], '強打剋星', '屠龍者', 1.2], ['bigLead', ['control', 'stamina'], '餘裕', '王者餘裕', 1],
];
// legend skills: [who, cond, {stat: bonus}, name]
const LEG = [
  ['H', 'always', { contact: 6, eye: 6 }, '天才打者'], ['H', 'always', { power: 10 }, '怪力無雙'], ['H', 'always', { contact: 4, power: 4, speed: 4, defense: 4, arm: 4 }, '五拍子'],
  ['H', 'risp', { contact: 10, power: 10 }, '打點王'], ['H', 'walkoff', { contact: 14, power: 14 }, '再見英雄'], ['H', 'close', { contact: 9, power: 9, eye: 9 }, '大舞台'],
  ['H', 'always', { eye: 12 }, '神之眼'], ['H', 'runner', { speed: 18 }, '盜壘之神'], ['H', 'always', { defense: 12, arm: 8 }, '守備之神'], ['H', 'two', { contact: 10, eye: 10 }, '不動之心'],
  ['P', 'always', { fastball: 8, breaking: 6 }, '怪物投手'], ['P', 'always', { control: 12 }, '精密之神'], ['P', 'always', { stamina: 16 }, '無限體力'],
  ['P', 'two', { fastball: 10, breaking: 10 }, '奪三振王'], ['P', 'risp', { fastball: 10, breaking: 10, control: 10 }, '危機之神'], ['P', 'empty', { fastball: 7, control: 9 }, '完全支配'],
  ['H', 'always', { speed: 10, defense: 10, contact: 5 }, '閃電'], ['H', 'always', { contact: 8, eye: 8, defense: 8 }, '全能戰士'],
  ['P', 'always', { fastball: 8, breaking: 8, stamina: 10 }, '不敗王牌'], ['P', 'late', { fastball: 12, breaking: 12, control: 8 }, '終結者之魂'],
];
const GRADE = [null, { name: '銅', val: 4, color: '#c98a4a' }, { name: '銀', val: 7, color: '#c8d2e6' }, { name: '金', val: 11, color: '#ffc83a' }, { name: '傳說', val: 0, color: '#ff6ad5' }];
const LIST = [];
for (const [who, fams] of [['H', HF], ['P', PF]]) fams.forEach(([cond, stats, bronze, gold, w], fi) => {
  for (let g = 1; g <= 3; g++) {
    const per = Math.max(1, Math.round(GRADE[g].val * w * (stats.length > 1 ? 0.75 : 1) * (stats.length > 2 ? 0.85 : 1))), fx = {};
    for (const s of stats) fx[s] = per;
    LIST.push({ id: LIST.length + 1, who, fam: who + fi, grade: g, cond, fx, name: g === 1 ? bronze : g === 2 ? bronze + '+' : gold });
  }
});
LEG.forEach(([who, cond, fx, name]) => LIST.push({ id: LIST.length + 1, who, fam: 'L' + LIST.length, grade: 4, cond, fx, name }));
const BY_ID = Object.fromEntries(LIST.map((s) => [s.id, s]));
const desc = (s) => `${COND[s.cond][0]}：${Object.entries(s.fx).map(([k, v]) => `${ST[k]} +${v}`).join('、')}`;

// how many skills a card starts with (rarity only sets the count; which skills is pure luck)
const ROLL = { N: { n: 1 }, R: { n: 1 }, SR: { n: 2 }, SSR: { n: 2 }, UR: { n: 3 }, LR: { n: 3 }, EX: { n: 4 } };
// one more completely random skill (hitter skills for hitters, pitcher skills for pitchers; never two of the same family)
function rollOne(card, have, R = Math.random) {
  const who = card.role === 'H' ? 'H' : 'P', fams = new Set(have.map((id) => BY_ID[id].fam));
  const list = LIST.filter((s) => s.who === who && !fams.has(s.fam));
  return list.length ? list[Math.floor(R() * list.length)].id : null;
}
function rollSet(card, R = Math.random, n = ROLL[card.rarity].n) {
  const out = [];
  for (let i = 0; i < n; i++) { const id = rollOne(card, out, R); if (id) out.push(id); }
  return out;
}
// CPU players: a few skills scaled to the league level (0..4)
function rollCpu(role, div, R = Math.random) {
  const n = R() < 0.25 + div * 0.15 ? 1 + (R() < div * 0.18 ? 1 : 0) : 0, out = [];
  const fake = { role, rarity: ['N', 'R', 'SR', 'SSR', 'UR'][div] || 'R' };
  for (let i = 0; i < n; i++) { const id = rollOne(fake, out, R); if (id) out.push(id); }
  return out;
}

// ---- in the engine: before each pitch, rebuild every on-field player's ratings from base + active skills
function apply(g, off, def, B, P, log) {
  const hk = g.inning * 2 + g.half; if (g._skH !== hk) { g._skH = hk; g._skShown = new Set(); }   // announce each skill once per half-inning
  const bs = g.bases, base = { inn: g.inning, outs: g.outs, balls: g.balls, strikes: g.strikes, risp: !!(bs[1] || bs[2]), loaded: !!(bs[0] && bs[1] && bs[2]), empty: !bs[0] && !bs[1] && !bs[2] };
  const Pr = P.r0 || P.r, Br = B.r0 || B.r;
  for (const side of [off, def]) {
    const ti = g.ts.indexOf(side), c = Object.assign({}, base, { lead: g.lead(ti), home: ti === 1, hand: side === off ? P.throws : B.bats, oppVelo: Pr.fastball, oppRP: P.role !== 'SP', oppPow: Br.power });
    const players = side === off ? side.lineup.map((e) => e.p) : Object.values(side.field);
    for (const p of players) {
      if (!p.sk || !p.sk.length) continue;
      if (!p.r0) p.r0 = Object.assign({}, p.r);
      c.runner = bs.includes(p);
      const r = Object.assign({}, p.r0);
      for (const id of p.sk) {
        const s = BY_ID[id]; if (!s || !COND[s.cond][1](c)) continue;
        for (const k in s.fx) r[k] = Math.min(110, r[k] + s.fx[k]);
        if (log && (p === B || p === P) && s.cond !== 'always' && !g._skShown.has(p.id + ':' + id)) {
          g._skShown.add(p.id + ':' + id);
          log.push({ cls: 'skill g' + s.grade, s: `　✦ ${p.name}「${s.name}」發動！` });
        }
      }
      p.r = r;
    }
  }
}

root.SKILLS = { LIST, BY_ID, COND, ST, GRADE, desc, rollOne, rollSet, rollCpu, apply, ROLL };
})(typeof window !== 'undefined' ? window : globalThis);
