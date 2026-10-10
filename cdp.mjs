export async function connect(url) {
  const u = new URL(url);
  if (u.protocol !== 'ws:' || u.hostname !== '127.0.0.1' || u.port !== '9222') throw new Error('Unexpected debugger endpoint');
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.close(); reject(new Error('Connect timeout')); }, 5000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Connection failed')); }, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    clearTimeout(entry.timer);
    message.error ? entry.reject(new Error(message.error.message)) : entry.resolve(message.result);
  });
  return {
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 5000);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() { socket.close(); for (const e of pending.values()) { clearTimeout(e.timer); e.reject(new Error('Closed')); } pending.clear(); }
  };
}

export async function playerTargets() {
  const response = await fetch('http://127.0.0.1:9222/json/list', { signal: AbortSignal.timeout(2000) });
  const targets = await response.json();
  return targets.filter(t => {
    try { const u = new URL(t.url); return t.type === 'page' && u.hostname === 'localwebapp.iqiyi.com' && /\/(?:index|player|compactPlayer)\.html$/.test(u.pathname); }
    catch { return false; }
  });
}
