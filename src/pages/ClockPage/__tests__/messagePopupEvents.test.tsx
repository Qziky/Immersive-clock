import { act, render, screen, within } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppContextProvider } from "../../../contexts/AppContext";
import { AppearanceProvider } from "../../../contexts/AppearanceContext";
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
  Clock: () => <div>clock</div>,
}));

vi.mock("../../../components/Countdown/Countdown", () => ({
  Countdown: () => <div>countdown</div>,
}));

vi.mock("../../../components/Stopwatch/Stopwatch", () => ({
  Stopwatch: () => <div>stopwatch</div>,
}));

vi.mock("../../../components/Study/Study", () => ({
  Study: () => <div>study</div>,
}));

describe("消息事件通知适配", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("保持 messagePopup 事件协议并投递到统一通知视口", () => {
    vi.useFakeTimers();
    render(
      <MemoryRouter>
        <AppContextProvider>
          <AppearanceProvider>
            <FeedbackProvider>
              <ClockPage />
            </FeedbackProvider>
          </AppearanceProvider>
        </AppContextProvider>
      </MemoryRouter>
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent("messagePopup:open", {
          detail: {
            id: "weather:test:popup",
            type: "weatherForecast",
            title: "天气提醒",
            message: "测试内容",
            themeColor: "#8ec5ff",
          },
        })
      );
    });

    const notification = within(screen.getByLabelText("通知")).getByRole("status");
    expect(notification).toHaveTextContent("天气提醒");
    expect(notification).toHaveTextContent("测试内容");
    expect(notification.style.getPropertyValue("--ui-toast-accent-color")).toBe("#8ec5ff");

    act(() => {
      window.dispatchEvent(
        new CustomEvent("messagePopup:close", {
          detail: {
            id: "weather:test:popup",
            dismiss: false,
          },
        })
      );
    });

    expect(within(screen.getByLabelText("通知")).queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps weather reminders visible until an explicit close", () => {
    vi.useFakeTimers();
    render(
      <MemoryRouter>
        <AppContextProvider>
          <AppearanceProvider>
            <FeedbackProvider>
              <ClockPage />
            </FeedbackProvider>
          </AppearanceProvider>
        </AppContextProvider>
      </MemoryRouter>
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent("messagePopup:open", {
          detail: {
            id: "weather:air-quality:test",
            type: "weatherForecast",
            title: "空气污染提醒",
            message: "AQI：135",
          },
        })
      );
      vi.advanceTimersByTime(60000);
    });

    expect(within(screen.getByLabelText("通知")).getByRole("status")).toHaveTextContent(
      "空气污染提醒"
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent("messagePopup:close", {
          detail: { id: "weather:air-quality:test" },
        })
      );
      vi.advanceTimersByTime(180);
    });

    expect(screen.queryByText("空气污染提醒")).not.toBeInTheDocument();
  });
});
