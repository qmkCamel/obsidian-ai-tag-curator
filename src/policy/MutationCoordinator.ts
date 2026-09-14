export class MutationCoordinator {
  private active: { id: symbol; recoveryId?: string } | null = null;
  private failure: string | null = null;

  constructor(private readonly changed: () => void = () => {}) {}

  get busy(): boolean { return this.active !== null; }
  get recoveryId(): string | undefined { return this.active?.recoveryId; }
  get error(): string | null { return this.failure; }

  block(error: string): void {
    this.failure = error;
    this.notify();
  }

  async run<T>(work: () => Promise<T>, recoveryId?: string): Promise<T> {
    if (this.active) throw new Error("A tag operation is already running.");
    if (this.failure) throw new Error(this.failure);
    const lease = { id: Symbol("tag-mutation"), recoveryId };
    this.active = lease;
    this.notify();
    try {
      return await work();
    } finally {
      if (this.active === lease) this.active = null;
      this.notify();
    }
  }

  private notify(): void {
    try { this.changed(); } catch { /* View observers cannot own or interrupt the mutation lease. */ }
  }
}
