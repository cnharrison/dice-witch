// Cloudflare allows six simultaneous connections waiting for response headers.
// Admit only that opening work here; established sockets never hold a slot.
// https://developers.cloudflare.com/workers/platform/limits/#simultaneous-open-connections
const OPENING_CONNECTIONS = 6;

export class GatewayHandshakeQueue {
  private active = 0;
  private readonly pending: (() => void)[] = [];

  run(signal: AbortSignal, operation: () => Promise<void>): Promise<void> {
    if (signal.aborted) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const admit = () => {
        signal.removeEventListener("abort", cancel);
        if (signal.aborted) { resolve(); return; }
        this.active += 1;
        void Promise.resolve().then(operation).then(resolve, reject).finally(() => {
          this.active -= 1;
          this.drain();
        });
      };
      const cancel = () => {
        const index = this.pending.indexOf(admit);
        if (index < 0) return;
        this.pending.splice(index, 1);
        resolve();
      };
      signal.addEventListener("abort", cancel, { once: true });
      this.pending.push(admit);
      this.drain();
    });
  }

  private drain(): void {
    while (this.active < OPENING_CONNECTIONS && this.pending.length > 0) {
      this.pending.shift()?.();
    }
  }
}
