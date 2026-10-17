// 連線對戰用的極簡即時頻道：Supabase Realtime 的 Broadcast（不需要資料表），兩個瀏覽器在同一個房號裡互傳訊息。
// const ch = NET.join('ABCD', (msg) => ..., (status) => ...); ch.send({ ... }); ch.close();
(function (root) {
'use strict';
const KEY = 'sb_publishable_HbbsnjG0GTwzfRgKyx1Aqg__JUOb24B';
const URL = 'wss://usoavddhglpbdpwwxium.supabase.co/realtime/v1/websocket?apikey=' + KEY + '&vsn=1.0.0';
function join(room, onMsg, onStatus = () => {}) {
  const topic = 'realtime:pixel-baseball-' + room;
  let ws = null, ref = 1, beat = null, closed = false, ready = false, queue = [], retry = 0;
  const raw = (o) => { try { ws.send(JSON.stringify(o)); } catch (e) { /* ignore */ } };
  function open() {
    onStatus('connecting');
    ws = new WebSocket(URL);
    ws.onopen = () => {
      raw({ topic, event: 'phx_join', payload: { config: { broadcast: { self: false, ack: false }, presence: { key: '' }, private: false } }, ref: String(ref++), join_ref: '1' });
      beat = setInterval(() => raw({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(ref++) }), 25000);
    };
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch (x) { return; }
      if (m.event === 'phx_reply' && m.topic === topic && !ready) {
        if (m.payload && m.payload.status === 'ok') { ready = true; retry = 0; onStatus('ready'); for (const q of queue.splice(0)) send(q); } else onStatus('error');
      } else if (m.event === 'broadcast' && m.payload) onMsg(m.payload.payload);
    };
    ws.onclose = () => {
      clearInterval(beat); ready = false;
      if (closed) return;
      onStatus('reconnecting');
      setTimeout(open, Math.min(8000, 1000 * ++retry));
    };
    ws.onerror = () => { /* onclose follows */ };
  }
  function send(p) { if (!ready) { queue.push(p); return; } raw({ topic, event: 'broadcast', payload: { type: 'broadcast', event: 'm', payload: p }, ref: String(ref++), join_ref: '1' }); }
  open();
  return { send, close() { closed = true; clearInterval(beat); try { ws.close(); } catch (e) { /* ignore */ } }, get ready() { return ready; } };
}
const code = () => Array.from({ length: 5 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)]).join('');
root.NET = { join, code };
})(typeof window !== 'undefined' ? window : globalThis);
