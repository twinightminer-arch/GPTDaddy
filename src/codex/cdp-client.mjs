export class CdpClient {
  constructor(url, { callTimeoutMs = 15000 } = {}) {
    this.url = url;
    this.callTimeoutMs = callTimeoutMs;
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
    this.eventHandlers = new Set();
    this.closeHandlers = new Set();
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.close(); reject(new Error('CDP connection timed out')); }, 5000);
      this.socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      this.socket.addEventListener('error', () => { clearTimeout(timer); this.close(); reject(new Error('CDP connection failed')); }, { once: true });
    });
    this.socket.addEventListener('message', (event) => this.#onMessage(event));
    this.socket.addEventListener('close', () => {
      for (const { reject, timer } of this.pending.values()) { clearTimeout(timer); reject(new Error('CDP disconnected')); }
      this.pending.clear();
      for (const handler of this.closeHandlers) {
        try { handler(); } catch { /* close handlers are isolated */ }
      }
    });
  }

  #onMessage(event) {
    let message;
    try { message = JSON.parse(String(event.data)); } catch { return; }
    if (message.method) {
      for (const handler of this.eventHandlers) {
        try { handler(message); } catch { /* event handlers are isolated */ }
      }
      return;
    }
    const request = this.pending.get(message.id);
    if (!request) return;
    this.pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result || {});
  }

  onEvent(handler) {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  onClose(handler) {
    this.closeHandlers.add(handler);
    return () => this.closeHandlers.delete(handler);
  }

  isOpen() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  call(method, params = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) throw new Error('CDP is not connected');
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method} timed out`));
        this.close();
      }, this.callTimeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try { this.socket.send(JSON.stringify({ id, method, params })); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }

  close() {
    try { this.socket?.close(); } catch { /* no-op */ }
  }
}
