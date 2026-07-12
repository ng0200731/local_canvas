import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ImagePreviewDialog } from "@/components/image-preview-dialog";

function createPointerEvent(
  type: string,
  init: { clientX: number; clientY: number; pointerId: number },
): Event {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX,
    clientY: init.clientY,
  });
  Object.defineProperty(event, "pointerId", { value: init.pointerId });
  return event;
}

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

  it("zooms the enlarged image with the mouse wheel", async () => {
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ImagePreviewDialog
          src="data:image/png;base64,aW1hZ2U="
          alt="Zoom preview"
          title="Zoom image"
          trigger={<button type="button">Open zoom preview</button>}
        />,
      );
    });

    const openButton = document.querySelector<HTMLButtonElement>("button");

    await act(async () => {
      openButton?.click();
    });

    const image = document.querySelector<HTMLImageElement>('img[alt="Zoom preview"]');
    expect(image).not.toBeNull();
    expect(document.body.textContent).toContain("Scroll to zoom");
    expect(document.body.textContent).toContain("Drag to pan");
    expect(document.body.textContent).toContain("100%");

    await act(async () => {
      image?.parentElement?.dispatchEvent(
        new WheelEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true }),
      );
    });

    expect(document.body.textContent).toContain("120%");
    expect(image?.style.transform).toBe("translate(0px, 0px) scale(1.2)");

    await act(async () => {
      image?.parentElement?.dispatchEvent(
        createPointerEvent("pointerdown", { clientX: 50, clientY: 60, pointerId: 1 }),
      );
      image?.parentElement?.dispatchEvent(
        createPointerEvent("pointermove", { clientX: 80, clientY: 90, pointerId: 1 }),
      );
      image?.parentElement?.dispatchEvent(
        createPointerEvent("pointerup", { clientX: 80, clientY: 90, pointerId: 1 }),
      );
    });

    expect(image?.style.transform).toBe("translate(30px, 30px) scale(1.2)");

    await act(async () => {
      root.unmount();
    });
  });

  it("navigates a gallery and only shows available directions", async () => {
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ImagePreviewDialog
          src="first.png"
          alt="First image"
          title="Render history"
          trigger={<button type="button">Open gallery</button>}
          gallery={[
            { src: "first.png", alt: "First image" },
            { src: "second.png", alt: "Second image" },
            { src: "third.png", alt: "Third image" },
          ]}
        />,
      );
    });

    await act(async () => {
      document.querySelector<HTMLButtonElement>("button")?.click();
    });

    expect(document.querySelector('button[aria-label="Previous rendered image"]')).toBeNull();
    expect(document.querySelector('button[aria-label="Next rendered image"]')).not.toBeNull();
    expect(document.body.textContent).toContain("1 of 3");

    await act(async () => {
      document
        .querySelector<HTMLButtonElement>('button[aria-label="Next rendered image"]')
        ?.click();
    });

    expect(document.querySelector<HTMLImageElement>('img[alt="Second image"]')).not.toBeNull();
    expect(document.querySelector('button[aria-label="Previous rendered image"]')).not.toBeNull();
    expect(document.querySelector('button[aria-label="Next rendered image"]')).not.toBeNull();

    await act(async () => {
      document
        .querySelector<HTMLElement>('[data-slot="dialog-content"]')
        ?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });

    expect(document.querySelector<HTMLImageElement>('img[alt="Third image"]')).not.toBeNull();
    expect(document.querySelector('button[aria-label="Previous rendered image"]')).not.toBeNull();
    expect(document.querySelector('button[aria-label="Next rendered image"]')).toBeNull();
    expect(document.body.textContent).toContain("3 of 3");

    await act(async () => {
      root.unmount();
    });
  });
});
