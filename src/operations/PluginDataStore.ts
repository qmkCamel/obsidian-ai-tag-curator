import { cloneData, operationHistoryBytes, OPERATION_HISTORY_BYTE_LIMIT, OperationLogCapacityError } from "./OperationLog";

export interface PluginDataStoreOptions<T> {
  snapshot(): T;
  write(snapshot: T): Promise<void>;
  onError?(error: unknown): void;
}

/** One queue for the whole plugin, including settings, index, intents and receipts. */
export class PluginDataStore<T> {
  private tail: Promise<void> = Promise.resolve();
  private failed = false;

  constructor(private readonly options: PluginDataStoreOptions<T>) {}

  /** Sticky diagnostic: a subsequent successful save does not prove a failed write was harmless. */
  get requiresReload(): boolean { return this.failed; }

  save(beforeSnapshot?: () => boolean | void, transformSnapshot?: (data: T) => T): Promise<void> {
    const save = this.tail.then(async () => {
      try {
        if (beforeSnapshot?.() === false) return;
        // Read at queue head, then detach before write() can await or retain the object.
        const detached = cloneData(this.options.snapshot());
        const snapshot = transformSnapshot ? transformSnapshot(detached) : detached;
        if (snapshot && typeof snapshot === "object" && "operations" in snapshot) {
          const receipts = "receipts" in snapshot ? snapshot.receipts : [];
          const bytes = operationHistoryBytes(snapshot.operations, receipts);
          if (bytes > OPERATION_HISTORY_BYTE_LIMIT) throw new OperationLogCapacityError(bytes, OPERATION_HISTORY_BYTE_LIMIT);
        }
        await this.options.write(snapshot);
      } catch (error) {
        this.failed = true;
        try { this.options.onError?.(error); } catch { /* Preserve the original persistence error. */ }
        throw error;
      }
    });
    this.tail = save.catch(() => undefined);
    return save;
  }
}
