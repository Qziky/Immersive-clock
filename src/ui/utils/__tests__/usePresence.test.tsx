import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { UiMotionMode } from "../../types";
import { usePresence } from "../usePresence";

interface PresenceHarnessProps {
  isOpen: boolean;
  motion?: UiMotionMode;
}

const originalMatchMedia = window.matchMedia;

function mockReducedMotion(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation(
      (query: string): MediaQueryList => ({
        matches: query === "(prefers-reduced-motion: reduce)" ? matches : false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      })
    ),
  });
}

function mockDynamicReducedMotion(initialMatches: boolean) {
  const listeners = new Set<EventListenerOrEventListenerObject>();
  const mediaQuery = {
    matches: initialMatches,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
      listeners.delete(listener);
    },
    dispatchEvent: () => false,
  } as MediaQueryList;

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockReturnValue(mediaQuery),
  });

  return (matches: boolean) => {
    Object.defineProperty(mediaQuery, "matches", { configurable: true, value: matches });
    const event = { matches, media: mediaQuery.media } as MediaQueryListEvent;
    listeners.forEach((listener) => {
      if (typeof listener === "function") {
        listener(event);
      } else {
        listener.handleEvent(event);
      }
    });
  };
}

function PresenceHarness({ isOpen, motion = "default" }: PresenceHarnessProps) {
  const presence = usePresence({ isOpen, motion, exitDuration: 180 });

  return (
    <div
      data-testid="presence"
      data-animate={String(presence.shouldAnimate)}
      data-present={String(presence.isPresent)}
      data-state={presence.presenceState}
    />
  );
}

describe("usePresence", () => {
  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: originalMatchMedia,
    });
  });

  it("keeps content mounted until the exit duration finishes", () => {
    vi.useFakeTimers();

    const { rerender } = render(<PresenceHarness isOpen={false} />);

    expect(screen.getByTestId("presence")).toHaveAttribute("data-present", "false");

    rerender(<PresenceHarness isOpen />);

    expect(screen.getByTestId("presence")).toHaveAttribute("data-present", "true");
    expect(screen.getByTestId("presence")).toHaveAttribute("data-state", "entering");

    rerender(<PresenceHarness isOpen={false} />);

    expect(screen.getByTestId("presence")).toHaveAttribute("data-present", "true");
    expect(screen.getByTestId("presence")).toHaveAttribute("data-state", "exiting");

    act(() => {
      vi.advanceTimersByTime(179);
    });

    expect(screen.getByTestId("presence")).toHaveAttribute("data-present", "true");

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(screen.getByTestId("presence")).toHaveAttribute("data-present", "false");
  });

  it("unmounts immediately when motion is disabled", () => {
    vi.useFakeTimers();

    const { rerender } = render(<PresenceHarness isOpen motion="none" />);

    expect(screen.getByTestId("presence")).toHaveAttribute("data-present", "true");
    expect(screen.getByTestId("presence")).toHaveAttribute("data-animate", "false");

    rerender(<PresenceHarness isOpen={false} motion="none" />);

    expect(screen.getByTestId("presence")).toHaveAttribute("data-present", "false");
  });

  it("unmounts immediately when reduced motion is preferred", () => {
    vi.useFakeTimers();
    mockReducedMotion(true);

    const { rerender } = render(<PresenceHarness isOpen />);

    expect(screen.getByTestId("presence")).toHaveAttribute("data-present", "true");
    expect(screen.getByTestId("presence")).toHaveAttribute("data-animate", "false");

    rerender(<PresenceHarness isOpen={false} />);

    expect(screen.getByTestId("presence")).toHaveAttribute("data-present", "false");
  });

  it("reacts to reduced motion preference changes at runtime", () => {
    const setReducedMotion = mockDynamicReducedMotion(false);
    render(<PresenceHarness isOpen />);

    expect(screen.getByTestId("presence")).toHaveAttribute("data-animate", "true");

    act(() => setReducedMotion(true));
    expect(screen.getByTestId("presence")).toHaveAttribute("data-animate", "false");

    act(() => setReducedMotion(false));
    expect(screen.getByTestId("presence")).toHaveAttribute("data-animate", "true");
  });
});
