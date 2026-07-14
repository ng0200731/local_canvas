import { beforeEach, describe, expect, it } from "vitest";

import type { CanvasNode } from "@/lib/nodes/types";
import { localCanvasStore } from "./localCanvasStore";

beforeEach(() => localStorage.clear());

describe("localCanvasStore", () => {
  it("upserts one durable sample order per canvas send and supplier", async () => {
    const input = {
      canvasSendId: "send-1",
      canvasId: "canvas-1",
      projectId: "project-1",
      supplierId: "supplier-1",
      sequence: "CA000018",
      recipientEmail: "supplier@example.com",
      approverEmail: "buyer@example.com",
      supplierTokenHash: "hash",
      snapshot: {
        project: { id: "project-1", name: "Project", customerName: "Customer" },
        canvas: { id: "canvas-1", name: "Canvas", reportUrl: "https://example.com/report" },
        supplier: {
          id: "supplier-1",
          name: "Supplier",
          email: "supplier@example.com",
          productTypes: ["woven-label"],
          employees: [
            { name: "Contact", title: "Coordinator", email: "supplier@example.com", tel: "123" },
          ],
        },
        lines: [
          {
            nodeId: "node-1",
            productId: null,
            variantId: null,
            subject: "Label",
            details: ["Material: cotton"],
          },
        ],
      },
    };
    const first = await localCanvasStore.upsertSampleOrder(input);
    const second = await localCanvasStore.upsertSampleOrder({
      ...input,
      supplierTokenHash: "new-hash",
    });
    expect(second.id).toBe(first.id);
    expect(second.deliveryCount).toBe(2);
    expect(await localCanvasStore.listSampleOrders()).toHaveLength(1);
  });

  it("generates ten validated demo sample orders", async () => {
    await localCanvasStore.generateDemoSampleOrders(10);
    const records = await localCanvasStore.listSampleOrders();
    expect(records).toHaveLength(10);
    expect(new Set(records.map((record) => record.currentStage)).size).toBeGreaterThan(4);
  });

  it("creates and lists projects (newest first)", async () => {
    const a = await localCanvasStore.createProject({ name: "A" });
    const b = await localCanvasStore.createProject({ name: "B" });
    const list = await localCanvasStore.listProjects();
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe(b.id);
    expect(list[1].id).toBe(a.id);
  });

  it("persists structured project customer, contact, currency, and destination fields", async () => {
    const project = await localCanvasStore.createProject({
      name: "Harborline launch",
      customerId: "customer-1",
      customerName: "Harborline Retail Ltd.",
      employeeId: "employee-1",
      employeeName: "Mia Chen 2",
      employeeTitle: "Merchandising Manager",
      employeeEmail: "eric.brilliant@gmail.com",
      employeeTel: "+86 755 8821 1042",
      currencyCode: "USD",
      currencyName: "US Dollar",
      currencySymbol: "$",
      destinationCountryCode: "US",
      destinationCountryName: "United States",
    });

    const saved = await localCanvasStore.getProject(project.id);
    expect(saved).toMatchObject({
      customerName: "Harborline Retail Ltd.",
      employeeEmail: "eric.brilliant@gmail.com",
      currencyCode: "USD",
      destinationCountryCode: "US",
    });
  });

  it("creates a canvas with empty content", async () => {
    const p = await localCanvasStore.createProject({ name: "P" });
    const c = await localCanvasStore.createCanvas({
      projectId: p.id,
      name: "Canvas",
    });
    expect(c.content.nodes).toEqual([]);
    const got = await localCanvasStore.getCanvas(c.id);
    expect(got?.name).toBe("Canvas");
    expect(got?.projectId).toBe(p.id);
  });

  it("saves and reloads canvas content", async () => {
    const p = await localCanvasStore.createProject({ name: "P" });
    const c = await localCanvasStore.createCanvas({
      projectId: p.id,
      name: "Canvas",
    });
    const node: CanvasNode = {
      id: "n1",
      type: "note",
      position: { x: 10, y: 20 },
      data: { text: "hello" },
    };
    await localCanvasStore.saveCanvasContent(c.id, { nodes: [node], edges: [] });
    const got = await localCanvasStore.getCanvas(c.id);
    expect(got?.content.nodes).toHaveLength(1);
    expect(got?.content.nodes[0].data).toEqual({ text: "hello" });
  });

  it("renames a canvas", async () => {
    const p = await localCanvasStore.createProject({ name: "P" });
    const c = await localCanvasStore.createCanvas({
      projectId: p.id,
      name: "Old",
    });
    const renamed = await localCanvasStore.renameCanvas(c.id, "New");
    expect(renamed.name).toBe("New");
    const got = await localCanvasStore.getCanvas(c.id);
    expect(got?.name).toBe("New");
  });

  it("deletes a project and cascades its canvases", async () => {
    const p = await localCanvasStore.createProject({ name: "P" });
    await localCanvasStore.createCanvas({ projectId: p.id, name: "C" });
    await localCanvasStore.deleteProject(p.id);
    expect(await localCanvasStore.listProjects()).toHaveLength(0);
    expect(await localCanvasStore.listCanvases(p.id)).toHaveLength(0);
  });

  it("returns null for missing entities", async () => {
    expect(await localCanvasStore.getProject("nope")).toBeNull();
    expect(await localCanvasStore.getCanvas("nope")).toBeNull();
  });

  it("does not duplicate inline image payloads in image metadata", async () => {
    const dataUrl = `data:image/png;base64,${"a".repeat(10_000)}`;

    const record = await localCanvasStore.recordImage({
      source: "generated",
      url: dataUrl,
      prompt: "A test image",
      model: "test-model",
    });

    expect(record.url).toBe(dataUrl);
    expect(localStorage.getItem("ica:images")).toBeNull();
  });

  it("removes legacy inline payloads when recording an inline image", async () => {
    localStorage.setItem(
      "ica:images",
      JSON.stringify([
        {
          id: "legacy-inline",
          canvasId: null,
          source: "generated",
          url: "data:image/png;base64,legacy",
          storagePath: null,
          prompt: null,
          model: null,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "remote",
          canvasId: null,
          source: "generated",
          url: "https://example.com/image.png",
          storagePath: null,
          prompt: null,
          model: null,
          createdAt: "2026-01-02T00:00:00.000Z",
        },
      ]),
    );

    await localCanvasStore.recordImage({
      source: "generated",
      url: "data:image/png;base64,new",
    });

    const stored = JSON.parse(localStorage.getItem("ica:images") ?? "[]") as Array<{
      id: string;
    }>;
    expect(stored).toEqual([
      {
        id: "remote",
        canvasId: null,
        source: "generated",
        url: "https://example.com/image.png",
        storagePath: null,
        prompt: null,
        model: null,
        createdAt: "2026-01-02T00:00:00.000Z",
      },
    ]);
  });
});
