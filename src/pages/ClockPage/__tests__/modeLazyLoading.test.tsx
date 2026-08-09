import { render, screen } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AppContextProvider } from "../../../contexts/AppContext";
import { AppearanceProvider } from "../../../contexts/AppearanceContext";
import type { AppMode } from "../../../types";
import { FeedbackProvider } from "../../../ui";
import { ClockPage } from "../ClockPage";

vi.mock("../../../utils/timeSync", () => ({
  startTimeSyncManager: () => () => {},
}));

vi.mock("../../../services/weatherRuntime", () => ({
  startWeatherRuntime: () => () => {},
}));

vi.mock("../../../utils/tour", () => ({
  startTour: () => {},
  isTourActive: () => false,
}));

vi.mock("../../../components/AnnouncementModal", () => ({
  default: () => null,
}));

vi.mock("../../../components/AuthorInfo/AuthorInfo", () => ({
  AuthorInfo: () => null,
}));

vi.mock("../../../components/HUD/HUD", () => ({
  HUD: () => null,
}));

vi.mock("../../../components/SettingsButton", () => ({
  SettingsButton: () => null,
}));

vi.mock("../../../components/SettingsPanel", () => ({
  SettingsPanel: () => null,
}));

vi.mock("../../../components/CountdownModal/CountdownModal", () => ({
  CountdownModal: () => null,
}));

vi.mock("../../../components/Clock/Clock", () => ({
  Clock: () => <div data-testid="mode-clock">clock</div>,
}));

vi.mock("../../../components/Countdown/Countdown", () => ({
  Countdown: () => <div data-testid="mode-countdown">countdown</div>,
}));

vi.mock("../../../components/Stopwatch/Stopwatch", () => ({
  Stopwatch: () => <div data-testid="mode-stopwatch">stopwatch</div>,
}));

vi.mock("../../../components/Study/Study", () => ({
  Study: () => <div data-testid="mode-study">study</div>,
}));

const MODE_ROUTES: Array<{ mode: AppMode; path: string }> = [
  { mode: "clock", path: "/clock" },
  { mode: "countdown", path: "/countdown" },
  { mode: "stopwatch", path: "/stopwatch" },
  { mode: "study", path: "/study" },
];

describe("主模式按需加载", () => {
  it.each(MODE_ROUTES)("加载 $path 对应的 $mode 模式", async ({ mode, path }) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <AppContextProvider>
          <AppearanceProvider>
            <FeedbackProvider>
              <ClockPage />
            </FeedbackProvider>
          </AppearanceProvider>
        </AppContextProvider>
      </MemoryRouter>
    );

    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAttribute("id", `${mode}-panel`);
    expect(panel).not.toHaveAttribute("data-clarity-mask");
    expect(await screen.findByTestId(`mode-${mode}`)).toBeVisible();
  });
});
