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

  it("selects the current gallery item and closes the preview", async () => {
    const root = createRoot(container);
    const selected: string[] = [];

    await act(async () => {
      root.render(
        <ImagePreviewDialog
          src="first.png"
          alt="First image"
          title="Selectable gallery"
          trigger={<button type="button">Open selectable gallery</button>}
          gallery={[
            { id: "first", src: "first.png", alt: "First image" },
            { id: "second", src: "second.png", alt: "Second image" },
          ]}
          selectedItemId="first"
          onSelect={(item) => {
            if (item.id) selected.push(item.id);
          }}
        />,
      );
    });

    await act(async () => {
      document.querySelector<HTMLButtonElement>("button")?.click();
    });

    await act(async () => {
      document
        .querySelector<HTMLButtonElement>('button[aria-label="Next rendered image"]')
        ?.click();
    });

    const selectButton = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "Select",
    );
    expect(selectButton).not.toBeNull();

    await act(async () => {
      selectButton?.click();
    });

    expect(selected).toEqual(["second"]);
    expect(document.querySelector<HTMLImageElement>('img[alt="Second image"]')).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it("shows masks for the selected image and highlights the hovered mask name", async () => {
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ImagePreviewDialog
          src="first.png"
          alt="First masked image"
          title="Masked gallery"
          trigger={<button type="button">Open masked gallery</button>}
          gallery={[
            { id: "first", src: "first.png", alt: "First masked image" },
            { id: "second", src: "second.png", alt: "Second masked image" },
          ]}
          selectedItemId="first"
          masks={[
            { id: "collar", name: "Collar", imageKey: "first", strokes: [] },
            { id: "sleeve", name: "Sleeve", imageKey: "second", strokes: [] },
          ]}
          onMasksChange={() => undefined}
        />,
      );
    });

    await act(async () => {
      document.querySelector<HTMLButtonElement>("button")?.click();
    });

    const collarButton = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "Collar",
    );
    expect(collarButton).not.toBeNull();
    expect(document.body.textContent).not.toContain("Sleeve");

    await act(async () => {
      collarButton?.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
    });
    expect(collarButton?.parentElement?.className).toContain("bg-cyan-400/20");

    await act(async () => {
      collarButton?.click();
    });
    expect(collarButton?.getAttribute("aria-pressed")).toBe("true");

    await act(async () => {
      root.unmount();
    });
  });
});
