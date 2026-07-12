export interface GenerationRunHandle {
  runId: string;
  signal: AbortSignal;
}

export interface GenerationRunManager {
  start(nodeId: string): GenerationRunHandle | null;
  has(nodeId: string): boolean;
  isCurrent(nodeId: string, runId: string): boolean;
  finish(nodeId: string, runId: string): void;
  cancel(nodeId: string): boolean;
  cancelAll(): void;
}

interface ActiveGenerationRun {
  runId: string;
  controller: AbortController;
}

export function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "name" in error && error.name === "AbortError"
  );
}

export function createGenerationRunManager(): GenerationRunManager {
  const activeRuns = new Map<string, ActiveGenerationRun>();
  let sequence = 0;

  return {
    start(nodeId) {
      if (activeRuns.has(nodeId)) return null;

      sequence += 1;
      const runId = `${nodeId}:${sequence}`;
      const controller = new AbortController();
      activeRuns.set(nodeId, { runId, controller });
      return { runId, signal: controller.signal };
    },

    has(nodeId) {
      return activeRuns.has(nodeId);
    },

    isCurrent(nodeId, runId) {
      const run = activeRuns.get(nodeId);
      return run?.runId === runId && !run.controller.signal.aborted;
    },

    finish(nodeId, runId) {
      if (activeRuns.get(nodeId)?.runId === runId) {
        activeRuns.delete(nodeId);
      }
    },

    cancel(nodeId) {
      const run = activeRuns.get(nodeId);
      if (!run) return false;

      activeRuns.delete(nodeId);
      run.controller.abort(new DOMException("Generation cancelled", "AbortError"));
      return true;
    },

    cancelAll() {
      for (const run of activeRuns.values()) {
        run.controller.abort(new DOMException("Generation cancelled", "AbortError"));
      }
      activeRuns.clear();
    },
  };
}
