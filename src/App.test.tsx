import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

const appMocks = vi.hoisted(() => ({
  developerModeEnabled: false,
}));

vi.mock("./components/AnnouncementModal", () => ({ default: () => null }));
vi.mock("./components/Confetti/Confetti", () => ({ Confetti: () => null }));
vi.mock("./pages/ClockPage/ClockPage", () => ({
  ClockPage: () => <div data-testid="clock-page">时钟页面</div>,
}));
vi.mock("./pages/DesignSystem", () => ({
  DesignSystemPage: () => <div data-testid="design-system-page">组件规范页面</div>,
}));
vi.mock("./pages/Debug/AudioDebugPage", () => ({
  AudioDebugPage: () => <div data-testid="audio-debug-page">音频诊断页面</div>,
}));
vi.mock("./utils/announcementStorage", () => ({ shouldShowAnnouncement: () => false }));
vi.mock("./utils/appSettings", () => ({
  getAppSettings: () => ({
    general: { developerModeEnabled: appMocks.developerModeEnabled },
  }),
}));
vi.mock("./utils/tour", () => ({ hasSeenTour: () => true }));

describe("App 调试路由", () => {
  beforeEach(() => {
    appMocks.developerModeEnabled = false;
  });

  it("开发者模式关闭时拒绝直接访问音频调试页", async () => {
    render(
      <MemoryRouter initialEntries={["/debug/audio"]}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByTestId("clock-page")).toBeVisible();
    expect(screen.queryByTestId("audio-debug-page")).not.toBeInTheDocument();
  });

  it("开发者模式开启时允许访问音频调试页", async () => {
    appMocks.developerModeEnabled = true;

    render(
      <MemoryRouter initialEntries={["/debug/audio"]}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByTestId("audio-debug-page")).toBeVisible();
  });

  it("开发者模式关闭时拒绝直接访问组件规范页", async () => {
    render(
      <MemoryRouter initialEntries={["/design-system"]}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByTestId("clock-page")).toBeVisible();
    expect(screen.queryByTestId("design-system-page")).not.toBeInTheDocument();
  });

  it("开发者模式开启时允许访问组件规范页", async () => {
    appMocks.developerModeEnabled = true;

    render(
      <MemoryRouter initialEntries={["/design-system"]}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByTestId("design-system-page")).toBeVisible();
  });
});
