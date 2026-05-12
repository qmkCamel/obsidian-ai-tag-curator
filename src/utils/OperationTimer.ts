// Captures dev-mode timing details for long-running recommendation operations.
export interface OperationTimingReport {
  startedAt: string;
  endedAt: string;
  durationMs: number;
  stages: OperationStageTiming[];
}

export interface OperationStageTiming {
  name: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
}

export class OperationTimer {
  private readonly startedAt: Date;
  private readonly stages: OperationStageTiming[] = [];
  private activeStages = new Map<string, Date>();

  constructor(private readonly now: () => Date = () => new Date()) {
    this.startedAt = this.now();
  }

  startStage(name: string): void {
    this.activeStages.set(name, this.now());
  }

  endStage(name: string): void {
    const startedAt = this.activeStages.get(name);
    if (!startedAt) {
      return;
    }

    const endedAt = this.now();
    this.activeStages.delete(name);
    this.stages.push({
      name,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      durationMs: endedAt.getTime() - startedAt.getTime()
    });
  }

  finish(): OperationTimingReport {
    const endedAt = this.now();
    return {
      startedAt: this.startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      durationMs: endedAt.getTime() - this.startedAt.getTime(),
      stages: this.stages
    };
  }
}
