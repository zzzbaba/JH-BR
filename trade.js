// 江汉BR —— 玩家间交易（内存态，重启清空）
// 报价式：A 给出 X，要 B 的 Y；B 接受即成交。

const trades = new Map();
let seq = 1;
const TTL = 5 * 60 * 1000;

function clean() {
  const now = Date.now();
  for (const [id, t] of trades) {
    if (now - t.at > TTL || t.status !== 'pending') trades.delete(id);
  }
}

function normItems(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const it of arr) {
    if (!it || !it.id) continue;
    const n = Math.max(1, Math.min(99, parseInt(it.n, 10) || 1));
    const found = out.find(x => x.id === it.id);
    if (found) found.n = Math.min(99, found.n + n);
    else out.push({ id: String(it.id), n });
  }
  return out.slice(0, 12);
}

function create(from, to, offer) {
  clean();
  const t = {
    id: 'T' + (seq++),
    from, to,
    giveGold: Math.max(0, Math.min(999999, parseInt(offer.giveGold, 10) || 0)),
    giveItems: normItems(offer.giveItems),
    wantGold: Math.max(0, Math.min(999999, parseInt(offer.wantGold, 10) || 0)),
    wantItems: normItems(offer.wantItems),
    at: Date.now(),
    status: 'pending',
  };
  if (!t.giveGold && !t.giveItems.length && !t.wantGold && !t.wantItems.length) {
    return { ok: false, msg: '报价是空的。' };
  }
  trades.set(t.id, t);
  return { ok: true, trade: t };
}

function pendingFor(user) {
  clean();
  return [...trades.values()].filter(t => t.to === user && t.status === 'pending');
}

function sentBy(user) {
  clean();
  return [...trades.values()].filter(t => t.from === user && t.status === 'pending');
}

function get(id) { return trades.get(id) || null; }

function setStatus(id, status) {
  const t = trades.get(id);
  if (t) t.status = status;
  return t;
}

function remove(id) { trades.delete(id); }

module.exports = { create, pendingFor, sentBy, get, setStatus, remove };
