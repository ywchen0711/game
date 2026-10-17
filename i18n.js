// 中英雙語：網址 ?lang=en|zh（大廳會帶），否則用上次的選擇，再否則看瀏覽器語言。
// $t('中文') 查 en.js 的字典；$L(中文, English) 直接二選一；I18N.nm() 把中文姓名轉成英文拼音（陳冠宇 → Kuan-Yu Chen）。
(function (root) {
'use strict';
let lang = null;
try { lang = new URLSearchParams(location.search).get('lang'); } catch (e) { /* ignore */ }
if (lang !== 'en' && lang !== 'zh') { try { lang = localStorage.getItem('pbb.lang'); } catch (e) { /* ignore */ } }
if (lang !== 'en' && lang !== 'zh') lang = typeof navigator !== 'undefined' && !/^zh/i.test(navigator.language || 'zh') ? 'en' : 'zh';
try { localStorage.setItem('pbb.lang', lang); } catch (e) { /* ignore */ }
const EN = lang === 'en';
if (typeof document !== 'undefined') document.documentElement.lang = EN ? 'en' : 'zh-Hant';

const $t = (s) => (EN && root.I18N_EN && root.I18N_EN[s] != null ? root.I18N_EN[s] : s);
const $L = (zh, en) => (EN ? en : zh);

// Taiwanese-style romanization for generated names: given name hyphenated, surname last
const SUR = { 陳: 'Chen', 林: 'Lin', 黃: 'Huang', 張: 'Chang', 李: 'Lee', 王: 'Wang', 吳: 'Wu', 劉: 'Liu', 蔡: 'Tsai', 楊: 'Yang', 許: 'Hsu', 鄭: 'Cheng', 謝: 'Hsieh', 郭: 'Kuo', 洪: 'Hung', 曾: 'Tseng', 邱: 'Chiu', 廖: 'Liao', 賴: 'Lai', 周: 'Chou',
  徐: 'Hsu', 蘇: 'Su', 葉: 'Yeh', 莊: 'Chuang', 呂: 'Lu', 江: 'Chiang', 何: 'Ho', 蕭: 'Hsiao', 羅: 'Lo', 高: 'Kao', 潘: 'Pan', 簡: 'Chien', 朱: 'Chu', 鍾: 'Chung', 彭: 'Peng', 游: 'Yu', 詹: 'Chan', 胡: 'Hu', 施: 'Shih', 沈: 'Shen',
  余: 'Yu', 趙: 'Chao', 盧: 'Lu', 梁: 'Liang', 顏: 'Yen', 柯: 'Ko', 孫: 'Sun', 魏: 'Wei', 翁: 'Weng', 戴: 'Tai', 范: 'Fan', 宋: 'Sung', 方: 'Fang', 鄧: 'Teng', 杜: 'Tu', 傅: 'Fu', 侯: 'Hou', 曹: 'Tsao', 薛: 'Hsueh', 丁: 'Ting',
  卓: 'Cho', 阮: 'Juan', 馬: 'Ma', 董: 'Tung', 唐: 'Tang', 藍: 'Lan', 蔣: 'Chiang', 石: 'Shih', 古: 'Ku', 紀: 'Chi', 姚: 'Yao', 連: 'Lien', 馮: 'Feng', 程: 'Cheng', 湯: 'Tang', 田: 'Tien', 康: 'Kang', 姜: 'Chiang', 白: 'Pai', 汪: 'Wang',
  鄒: 'Tsou', 尤: 'Yu', 巫: 'Wu', 黎: 'Li', 涂: 'Tu', 龔: 'Kung', 嚴: 'Yen', 韓: 'Han', 袁: 'Yuan', 金: 'Chin', 陸: 'Lu', 夏: 'Hsia', 柳: 'Liu', 邵: 'Shao', 錢: 'Chien', 倪: 'Ni', 溫: 'Wen', 譚: 'Tan', 駱: 'Lo', 熊: 'Hsiung',
  任: 'Jen', 秦: 'Chin', 顧: 'Ku', 毛: 'Mao' };
const GIV = { 志: 'chih', 俊: 'chun', 建: 'chien', 家: 'chia', 冠: 'kuan', 宗: 'tsung', 承: 'cheng', 柏: 'po', 彥: 'yen', 睿: 'jui', 子: 'tzu', 泓: 'hung', 品: 'pin', 宇: 'yu', 哲: 'che', 嘉: 'chia', 文: 'wen', 信: 'hsin', 政: 'cheng',
  明: 'ming', 國: 'kuo', 偉: 'wei', 智: 'chih', 勝: 'sheng', 耀: 'yao', 聖: 'sheng', 振: 'chen', 博: 'po', 凱: 'kai', 祐: 'yu', 育: 'yu', 廷: 'ting', 浩: 'hao', 翔: 'hsiang', 安: 'an', 仁: 'jen', 祥: 'hsiang', 立: 'li', 昱: 'yu',
  晉: 'chin', 維: 'wei', 崇: 'chung', 峻: 'chun', 銘: 'ming', 鴻: 'hung', 正: 'cheng', 啟: 'chi', 傑: 'chieh', 宏: 'hung', 豪: 'hao', 翰: 'han', 恩: 'en', 瑋: 'wei', 彬: 'pin', 勳: 'hsun', 龍: 'lung', 輝: 'hui', 雄: 'hsiung',
  霖: 'lin', 誠: 'cheng', 均: 'chun', 軒: 'hsuan', 鈞: 'chun', 源: 'yuan', 達: 'ta', 賢: 'hsien', 毅: 'yi', 鋒: 'feng', 威: 'wei', 平: 'ping', 昌: 'chang', 德: 'te', 民: 'min', 倫: 'lun', 揚: 'yang', 瑞: 'jui', 弘: 'hung', 竣: 'chun' };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function nm(name) {
  if (!EN || !name || !/^[一-鿿]{3}$/.test(name)) return name;
  const [a, b, c] = name, s = SUR[a], g1 = GIV[b], g2 = GIV[c];
  return s && g1 && g2 ? `${cap(g1)}-${g2} ${s}` : name;
}
// team names: city + nickname
const CITY = { 台北: 'Taipei', 新北: 'New Taipei', 桃園: 'Taoyuan', 台中: 'Taichung', 台南: 'Tainan', 高雄: 'Kaohsiung', 新竹: 'Hsinchu', 嘉義: 'Chiayi', 花蓮: 'Hualien', 基隆: 'Keelung' };
const NICK = { 藍鷹: 'Blue Eagles', 赤獅: 'Red Lions', 翠龍: 'Jade Dragons', 金虎: 'Golden Tigers', 紫電: 'Purple Thunder', 黑熊: 'Black Bears', 海豚: 'Dolphins', 櫻花: 'Sakuras' };
function team(full) {
  if (!EN || !full) return full;
  const m = /^(.{2})(.{2})(（客）)?$/.exec(full);
  if (m && CITY[m[1]] && NICK[m[2]]) return `${CITY[m[1]]} ${NICK[m[2]]}${m[3] ? ' (Away)' : ''}`;
  return NICK[full] || full;
}
function setLang(l) {
  try { localStorage.setItem('pbb.lang', l); } catch (e) { /* ignore */ }
  const u = new URL(location.href); u.searchParams.set('lang', l); location.href = u.toString();
}
// static page text (data-en="…") and the language button
if (typeof document !== 'undefined') {
  const apply = () => {
    if (EN) document.querySelectorAll('[data-en]').forEach((el) => { if (el.tagName === 'TITLE') document.title = el.dataset.en; else el.innerHTML = el.dataset.en; });
    const b = document.getElementById('langBtn');
    if (b) { b.textContent = EN ? '中文' : 'EN'; b.onclick = () => setLang(EN ? 'zh' : 'en'); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply); else apply();
}
root.$t = $t; root.$L = $L;
root.I18N = { lang, EN, nm, team, setLang, CITY, NICK };
})(typeof window !== 'undefined' ? window : globalThis);
