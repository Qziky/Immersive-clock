import { act, render, screen } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppContextProvider } from "../../../contexts/AppContext";
import { FeedbackProvider } from "../../../ui";
import { ClockPage } from "../ClockPage";

vi.mock("../../../utils/timeSync", () => ({
  startTimeSyncManager: () => () => {},
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
    sessionStorage.clear();
  });

  it("保持 messagePopup 事件协议并投递到统一通知视口", () => {
    vi.useFakeTimers();
    render(
      <MemoryRouter>
        <AppContextProvider>
          <FeedbackProvider>
            <ClockPage />
          </FeedbackProvider>
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

    expect(screen.getByRole("status")).toHaveTextContent("天气提醒");
    expect(screen.getByRole("status")).toHaveTextContent("测试内容");
    expect(screen.getByRole("status").style.getPropertyValue("--ui-toast-accent-color")).toBe(
      "#8ec5ff"
    );

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

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("手动关闭分钟级降雨通知时同步会话标记", () => {
    render(
      <MemoryRouter>
        <AppContextProvider>
          <FeedbackProvider>
            <ClockPage />
          </FeedbackProvider>
        </AppContextProvider>
      </MemoryRouter>
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent("messagePopup:open", {
          detail: {
            id: "weather:minutelyPrecip",
            type: "weatherForecast",
            title: "分钟级降雨",
          },
        })
      );
    });

    expect(sessionStorage.getItem("weather.minutely.popupOpen")).toBe("1");
    act(() => screen.getByRole("button", { name: "关闭通知" }).click());
    expect(sessionStorage.getItem("weather.minutely.popupOpen")).toBe("0");
    expect(sessionStorage.getItem("weather.minutely.popupDismissed")).toBe("1");
  });

  it("分钟级降雨通知超时后只清理打开标记", () => {
    vi.useFakeTimers();
    render(
      <MemoryRouter>
        <AppContextProvider>
          <FeedbackProvider>
            <ClockPage />
          </FeedbackProvider>
        </AppContextProvider>
      </MemoryRouter>
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent("messagePopup:open", {
          detail: {
            id: "weather:minutelyPrecip",
            type: "weatherForecast",
            title: "分钟级降雨",
          },
        })
      );
    });

    act(() => {
      vi.advanceTimersByTime(6000);
    });

    expect(screen.queryByText("分钟级降雨")).not.toBeInTheDocument();
    expect(sessionStorage.getItem("weather.minutely.popupOpen")).toBe("0");
    expect(sessionStorage.getItem("weather.minutely.popupDismissed")).toBeNull();
  });
});
