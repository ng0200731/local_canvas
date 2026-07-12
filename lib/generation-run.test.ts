import { describe, expect, it } from "vitest";

import { createGenerationRunManager, isAbortError } from "./generation-run";

describe("generation run manager", () => {
  it("allows only one active run per Generate node", () => {
    const manager = createGenerationRunManager();
    const first = manager.start("generate-1");

    expect(first).not.toBeNull();
    expect(manager.start("generate-1")).toBeNull();
    expect(manager.has("generate-1")).toBe(true);
    expect(manager.isCurrent("generate-1", first?.runId ?? "")).toBe(true);
  });

  it("aborts and invalidates a cancelled run", () => {
    const manager = createGenerationRunManager();
    const run = manager.start("generate-1");
    if (!run) throw new Error("Expected a run");

    expect(manager.cancel("generate-1")).toBe(true);
    expect(run.signal.aborted).toBe(true);
    expect(isAbortError(run.signal.reason)).toBe(true);
    expect(manager.isCurrent("generate-1", run.runId)).toBe(false);
    expect(manager.cancel("generate-1")).toBe(false);
  });

  it("does not let stale completion clear a newer run", () => {
    const manager = createGenerationRunManager();
    const first = manager.start("generate-1");
    if (!first) throw new Error("Expected a run");
    manager.cancel("generate-1");

    const second = manager.start("generate-1");
    if (!second) throw new Error("Expected a replacement run");
    manager.finish("generate-1", first.runId);

    expect(manager.isCurrent("generate-1", second.runId)).toBe(true);
    manager.finish("generate-1", second.runId);
    expect(manager.has("generate-1")).toBe(false);
  });

  it("cancels every request when the canvas unmounts", () => {
    const manager = createGenerationRunManager();
    const first = manager.start("generate-1");
    const second = manager.start("generate-2");
    if (!first || !second) throw new Error("Expected active runs");

    manager.cancelAll();

    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(true);
    expect(manager.has("generate-1")).toBe(false);
    expect(manager.has("generate-2")).toBe(false);
  });
});
