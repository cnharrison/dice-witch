export class ResourceRegistry {
  private static instance: ResourceRegistry;
  private timers: Set<NodeJS.Timeout> = new Set();
  private intervals: Set<NodeJS.Timeout> = new Set();

  private constructor() {}

  public static getInstance(): ResourceRegistry {
    if (!ResourceRegistry.instance) {
      ResourceRegistry.instance = new ResourceRegistry();
    }
    return ResourceRegistry.instance;
  }

  public registerTimeout(timeout: NodeJS.Timeout): NodeJS.Timeout {
    this.timers.add(timeout);
    return timeout;
  }

  public clearTimeout(timeout: NodeJS.Timeout): void {
    clearTimeout(timeout);
    this.timers.delete(timeout);
  }

  public registerInterval(interval: NodeJS.Timeout): NodeJS.Timeout {
    this.intervals.add(interval);
    return interval;
  }

  public clearInterval(interval: NodeJS.Timeout): void {
    clearInterval(interval);
    this.intervals.delete(interval);
  }

  public clearAll(): void {
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();

    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals.clear();
  }
}