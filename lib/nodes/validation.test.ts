import { describe, expect, it } from "vitest";

import { parseCanvasContent, safeParseCanvasContent } from "./validation";

describe("canvas content validation", () => {
  it("accepts a valid editable canvas document", () => {
    const content = parseCanvasContent({
      nodes: [
        {
          id: "node-1",
          type: "note",
          position: { x: 12, y: 34 },
          data: { text: "Saved in Postgres" },
        },
      ],
      edges: [
        {
          id: "edge-1",
          source: "node-1",
          target: "node-2",
          sourceHandle: "out",
          targetHandle: "in",
          data: { color: "green" },
        },
      ],
    });

    expect(content.nodes[0].data).toEqual({ text: "Saved in Postgres" });
    expect(content.edges[0].source).toBe("node-1");
  });

  it("normalizes legacy output nodes to imageOutput", () => {
    const content = parseCanvasContent({
      nodes: [
        {
          id: "legacy-output",
          type: "output",
          position: { x: 0, y: 0 },
          data: { resultUrl: null, status: "idle" },
        },
      ],
      edges: [],
    });

    expect(content.nodes[0].type).toBe("imageOutput");
  });

  it("rejects malformed canvas content before database writes", () => {
    expect(() =>
      parseCanvasContent({
        nodes: [{ id: "bad", type: "note", position: { x: "left", y: 0 }, data: {} }],
        edges: [],
      }),
    ).toThrow();
  });

  it("falls back to an empty canvas for unreadable fetched content", () => {
    const content = safeParseCanvasContent({ nodes: "bad", edges: [] });

    expect(content).toEqual({ nodes: [], edges: [] });
  });
});
