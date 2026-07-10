import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ImagePreviewDialog } from "@/components/image-preview-dialog";

describe("ImagePreviewDialog", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
  });

  afterEach(() => {
    container.remove();
    document.body.innerHTML = "";
  });

  it("opens an enlarged image and closes from the close button or Escape", async () => {
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ImagePreviewDialog
          src="data:image/png;base64,aW1hZ2U="
          alt="Test preview"
          title="Test image"
          trigger={<button type="button">Open preview</button>}
        />,
      );
    });

    const openButton = document.querySelector<HTMLButtonElement>("button");
    expect(openButton?.textContent).toBe("Open preview");

    await act(async () => {
      openButton?.click();
    });

    expect(document.querySelector<HTMLImageElement>('img[alt="Test preview"]')).not.toBeNull();

    const closeButton = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Close image preview"]',
    );
    expect(closeButton).not.toBeNull();

    await act(async () => {
      closeButton?.click();
    });

    expect(document.querySelector<HTMLImageElement>('img[alt="Test preview"]')).toBeNull();

    await act(async () => {
      openButton?.click();
    });

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(document.querySelector<HTMLImageElement>('img[alt="Test preview"]')).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });
});
