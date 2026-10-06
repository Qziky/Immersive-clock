import { describe, expect, it, vi } from "vitest";

import {
  createDisplayCaptureMenuTemplate,
  resolveDisplayCaptureSource,
  type DisplayCaptureSourceOption,
} from "../../../electron/displayCaptureSource";

const screens: DisplayCaptureSourceOption[] = [
  { id: "screen:1", name: "Display 1" },
  { id: "screen:2", name: "Display 2" },
];

describe("displayCaptureSource", () => {
  it("lists every screen and returns only the screen the user chose", () => {
    const onSelect = vi.fn();
    const menu = createDisplayCaptureMenuTemplate(screens, onSelect);
    const screenItems = menu.filter((item) => item.type !== "separator").slice(1, -1);

    expect(screenItems.map((item) => item.label)).toEqual([
      "屏幕 1 — Display 1",
      "屏幕 2 — Display 2",
    ]);
    screenItems[1].click?.({} as never, {} as never, {} as never);
    expect(onSelect).toHaveBeenCalledWith("screen:2");
    expect(resolveDisplayCaptureSource(screens, "screen:2")).toBe(screens[1]);
  });

  it("uses an explicit screen choice even when only one screen is available", () => {
    const menu = createDisplayCaptureMenuTemplate([screens[0]], vi.fn());
    const screenItem = menu.find((item) => item.label === "屏幕 1 — Display 1");

    expect(screenItem).toBeDefined();
    expect(screenItem?.click).toBeDefined();
    expect(resolveDisplayCaptureSource([screens[0]], null)).toBeNull();
  });

  it("rejects cancellation and source identifiers outside the offered list", () => {
    const onSelect = vi.fn();
    const menu = createDisplayCaptureMenuTemplate(screens, onSelect);
    const cancelItem = menu.find((item) => item.label === "取消共享");

    cancelItem?.click?.({} as never, {} as never, {} as never);

    expect(onSelect).toHaveBeenCalledWith(null);
    expect(resolveDisplayCaptureSource(screens, "screen:unknown")).toBeNull();
  });

  it("provides a stable label for unnamed screens", () => {
    const menu = createDisplayCaptureMenuTemplate([{ id: "screen:1", name: "  " }], vi.fn());

    expect(menu.some((item) => item.label === "屏幕 1")).toBe(true);
  });
});
