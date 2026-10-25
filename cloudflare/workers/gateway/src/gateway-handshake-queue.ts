// Cloudflare allows six simultaneous connections waiting for response headers.
// Admit only that opening work here; established sockets never hold a slot.
// https://developers.cloudflare.com/workers/platform/limits/#simultaneous-open-connections
const OPENING_CONNECTIONS = 6;

export class GatewayHandshakeQueue {
  private active = 0;
  private scheduled = false;
  private readonly pending: (() => void)[] = [];

  constructor(private readonly schedule?: () => void) {}

  run(signal: AbortSignal, operation: () => Promise<void>): Promise<void> {
    if (signal.aborted) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const admit = () => {
        signal.removeEventListener("abort", cancel);
        if (signal.aborted) { resolve(); return; }
        this.active += 1;
        void Promise.resolve().then(operation).then(resolve, reject).finally(() => {
          this.active -= 1;
          this.requestDrain();
        });
      };
      const cancel = () => {
        const index = this.pending.indexOf(admit);
        if (index < 0) return;
        this.pending.splice(index, 1);
        if (this.pending.length === 0) this.scheduled = false;
        resolve();
      };
      signal.addEventListener("abort", cancel, { once: true });
      this.pending.push(admit);
      this.requestDrain();
    });
  }

  private requestDrain(): void {
    if (this.pending.length === 0 || this.active >= OPENING_CONNECTIONS || this.scheduled) return;
    if (this.schedule === undefined) { this.drain(); return; }
    this.scheduled = true;
    this.schedule();
  }

  drain(): void {
    this.scheduled = false;
    while (this.active < OPENING_CONNECTIONS && this.pending.length > 0) {
      this.pending.shift()?.();
    }
  }
}
