'use strict';
// 零依赖串行存储队列：合并快照、原子替换、失败保留、按版本确认。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class StorageQueue {
  constructor(io = fs.promises, options = {}) {
    this.io = io;
    this.pending = new Map();
    this.confirmed = new Map();
    this.sequence = 0;
    this.running = null;
    this.timer = null;
    this.lastSuccessAt = null;
    this.lastErrorAt = null;
    this.lastError = null;
    this.delay = options.delay == null ? 50 : options.delay;
    this.onError = options.onError || (e => console.error('[storage]', e.code || e.message));
  }
  enqueue(file, value) {
    return this.put(file, JSON.stringify(value, null, 2), false);
  }
  remove(file) { return this.put(file, null, true); }
  put(file, data, deleted) {
    const old = this.pending.get(file);
    const rev = ++this.sequence;
    this.pending.set(file, { rev, data, deleted, since: old ? old.since : Date.now() });
    this.schedule();
    return rev;
  }
  schedule() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush().catch(e => this.onError(e));
    }, this.delay);
    this.timer.unref();
  }
  hasPersisted(file, rev) { return (this.confirmed.get(file) || 0) >= rev; }
  async atomic(file, entry) {
    if (entry.deleted) {
      try { await this.io.unlink(file); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      return;
    }
    const tmp = path.join(path.dirname(file), '.' + path.basename(file) + '.tmp-' + process.pid + '-' + crypto.randomBytes(6).toString('hex'));
    let handle = null;
    try {
      handle = await this.io.open(tmp, 'wx', 0o600);
      await handle.writeFile(entry.data, 'utf8');
      await handle.sync();
      await handle.close();
      handle = null;
      await this.io.rename(tmp, file);
    } catch (e) {
      if (handle) await handle.close().catch(() => {});
      await this.io.unlink(tmp).catch(() => {});
      throw e;
    }
  }
  flush() {
    if (this.running) return this.running;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.running = this.run().finally(() => {
      this.running = null;
      // 出错的条目由周期 flush 或新写入重试，避免忙循环。
      if (!this.lastError && this.pending.size) this.schedule();
    });
    return this.running;
  }
  async run() {
    let firstError = null;
    for (const [file, entry] of [...this.pending]) {
      try {
        await this.atomic(file, entry);
        this.confirmed.set(file, entry.rev);
        if (this.pending.get(file) === entry) this.pending.delete(file);
        this.lastSuccessAt = Date.now();
      } catch (e) {
        firstError = firstError || e;
        this.lastErrorAt = Date.now();
      }
    }
    if (firstError) {
      this.lastError = firstError.code || 'WRITE_FAILED';
      throw firstError;
    }
    // 本批无错误即恢复；更新快照仍排队时也要继续调度，避免重试活锁。
    this.lastError = null;
  }
  status() {
    const oldest = this.pending.size ? Math.min(...[...this.pending.values()].map(v => v.since)) : null;
    const pendingMs = oldest == null ? 0 : Date.now() - oldest;
    return {
      ok: !this.lastError && pendingMs < 10000,
      pending: this.pending.size,
      pendingMs,
      writing: !!this.running,
      lastSuccessAt: this.lastSuccessAt,
      lastErrorAt: this.lastErrorAt,
      lastError: this.lastError,
    };
  }
  async drain(timeoutMs = 12000) {
    let timer;
    try {
      await Promise.race([
        (async () => { while (this.pending.size || this.running) await this.flush(); })(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('storage drain timeout')), timeoutMs); }),
      ]);
    } finally { clearTimeout(timer); }
  }
}
const queue = new StorageQueue();
const retry = setInterval(() => queue.flush().catch(e => queue.onError(e)), 2000);
retry.unref();
module.exports = queue;
module.exports.StorageQueue = StorageQueue;
