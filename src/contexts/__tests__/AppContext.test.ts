/**
 * AppContext 单元测试
 * 测试全局状态管理的 Reducer 逻辑
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

import { getDefaultQuoteChannels } from "../../services/quotes/quoteRegistry";
import { type AppAction, type AppState } from "../../types";
import { APP_SETTINGS_KEY } from "../../utils/appSettings";
import { nowMs } from "../../utils/timeSource";
import { appReducer, getInitialState } from "../AppContext";

vi.mock("../../utils/timeSource");

describe("appReducer", () => {
  let state: AppState;

  beforeEach(() => {
    localStorage.clear();
    state = {
      mode: "clock",
      isHudVisible: false,
      countdown: {
        initialTime: 60,
        currentTime: 60,
        isActive: false,
      },
      stopwatch: {
        elapsedTime: 0,
        isActive: false,
      },
      study: {
        targetYear: 2026,
        countdownType: "gaokao",
        customName: "",
        customDate: "",
        display: {
          showStatusBar: true,
          showNoiseMonitor: true,
          showCountdown: true,
          showQuote: true,
          showTime: true,
          showDate: true,
        },
        countdownItems: [],
        carouselIntervalSec: 6,
        weatherAlertEnabled: true,
        minutelyPrecipEnabled: true,
      },
      quoteChannels: {
        channels: [],
      },
      quoteSettings: {
        autoRefreshEnabled: false,
        autoRefreshIntervalSec: 600,
      },
      announcement: {
        isVisible: false,
        activeTab: "announcement",
        dontShowAgain: false,
        lastShownTime: 0,
      },
      isModalOpen: false,
    };
    vi.mocked(nowMs).mockReturnValue(1000);
  });

  describe("模式切换", () => {
    it("SET_MODE 应该切换模式并保留 HUD 可见状态", () => {
      state.isHudVisible = true;
      const action: AppAction = { type: "SET_MODE", payload: "study" };
      const newState = appReducer(state, action);

      expect(newState.mode).toBe("study");
      expect(newState.isHudVisible).toBe(true);
    });
  });

  describe("HUD 控制", () => {
    it("TOGGLE_HUD 应该切换 HUD 可见性", () => {
      const action: AppAction = { type: "TOGGLE_HUD" };
      const newState = appReducer(state, action);

      expect(newState.isHudVisible).toBe(true);
    });

    it("SHOW_HUD 应该显示 HUD", () => {
      const action: AppAction = { type: "SHOW_HUD" };
      const newState = appReducer(state, action);

      expect(newState.isHudVisible).toBe(true);
    });

    it("HIDE_HUD 应该隐藏 HUD", () => {
      state.isHudVisible = true;
      const action: AppAction = { type: "HIDE_HUD" };
      const newState = appReducer(state, action);

      expect(newState.isHudVisible).toBe(false);
    });
  });

  describe("倒计时管理", () => {
    it("SET_COUNTDOWN 应该设置倒计时时间", () => {
      const action: AppAction = { type: "SET_COUNTDOWN", payload: 120 };
      const newState = appReducer(state, action);

      expect(newState.countdown.initialTime).toBe(120);
      expect(newState.countdown.currentTime).toBe(120);
      expect(newState.countdown.isActive).toBe(false);
      expect(newState.countdown.endTimestamp).toBeUndefined();
    });

    it("START_COUNTDOWN 应该激活倒计时并设置结束时间戳", () => {
      vi.mocked(nowMs).mockReturnValue(1000);
      const action: AppAction = { type: "START_COUNTDOWN" };
      const newState = appReducer(state, action);

      expect(newState.countdown.isActive).toBe(true);
      expect(newState.countdown.endTimestamp).toBe(61000);
    });

    it("PAUSE_COUNTDOWN 应该暂停并收敛剩余时间", () => {
      state.countdown.isActive = true;
      state.countdown.endTimestamp = 61000;
      vi.mocked(nowMs).mockReturnValue(35000);

      const action: AppAction = { type: "PAUSE_COUNTDOWN" };
      const newState = appReducer(state, action);

      expect(newState.countdown.isActive).toBe(false);
      expect(newState.countdown.currentTime).toBe(26);
      expect(newState.countdown.endTimestamp).toBeUndefined();
    });

    it("RESET_COUNTDOWN 应该重置到初始时间", () => {
      state.countdown.currentTime = 30;
      const action: AppAction = { type: "RESET_COUNTDOWN" };
      const newState = appReducer(state, action);

      expect(newState.countdown.currentTime).toBe(60);
      expect(newState.countdown.isActive).toBe(false);
      expect(newState.countdown.endTimestamp).toBeUndefined();
    });

    it("FINISH_COUNTDOWN 应该结束倒计时", () => {
      const action: AppAction = { type: "FINISH_COUNTDOWN" };
      const newState = appReducer(state, action);

      expect(newState.countdown.currentTime).toBe(0);
      expect(newState.countdown.isActive).toBe(false);
    });
  });

  describe("秒表管理", () => {
    it("START_STOPWATCH 应该激活秒表", () => {
      const action: AppAction = { type: "START_STOPWATCH" };
      const newState = appReducer(state, action);

      expect(newState.stopwatch.isActive).toBe(true);
    });

    it("PAUSE_STOPWATCH 应该暂停秒表", () => {
      state.stopwatch.isActive = true;
      const action: AppAction = { type: "PAUSE_STOPWATCH" };
      const newState = appReducer(state, action);

      expect(newState.stopwatch.isActive).toBe(false);
    });

    it("RESET_STOPWATCH 应该重置秒表", () => {
      state.stopwatch.elapsedTime = 5000;
      state.stopwatch.isActive = true;
      const action: AppAction = { type: "RESET_STOPWATCH" };
      const newState = appReducer(state, action);

      expect(newState.stopwatch.elapsedTime).toBe(0);
      expect(newState.stopwatch.isActive).toBe(false);
    });

    it("TICK_STOPWATCH 应该增加经过时间", () => {
      const action: AppAction = { type: "TICK_STOPWATCH" };
      const newState = appReducer(state, action);

      expect(newState.stopwatch.elapsedTime).toBe(10);
    });

    it("TICK_STOPWATCH_BY 应该增加指定次数的经过时间", () => {
      const action: AppAction = { type: "TICK_STOPWATCH_BY", payload: 5 };
      const newState = appReducer(state, action);

      expect(newState.stopwatch.elapsedTime).toBe(50);
    });
  });

  describe("语录设置", () => {
    it("初始化时会解析 v3 偏好、自定义频道和刷新状态", () => {
      localStorage.setItem(
        APP_SETTINGS_KEY,
        JSON.stringify({
          version: 3,
          general: {
            quote: {
              autoRefreshEnabled: false,
              autoRefreshIntervalSec: 90,
              channels: [{ id: "hitokoto-api", enabled: false, weight: 23 }],
              customChannels: [
                {
                  id: "custom-txt",
                  name: "导入语录",
                  enabled: true,
                  weight: 7,
                  quotes: ["自定义句子"],
                  orderMode: "sequential",
                },
              ],
            },
          },
        })
      );

      const initialState = getInitialState();

      expect(initialState.quoteSettings).toEqual({
        autoRefreshEnabled: false,
        autoRefreshIntervalSec: 90,
      });
      expect(initialState.quoteChannels.channels).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "hitokoto-api",
            kind: "remote",
            enabled: false,
            weight: 23,
          }),
          expect.objectContaining({
            id: "custom-txt",
            kind: "local",
            quotes: ["自定义句子"],
            orderMode: "sequential",
          }),
        ])
      );
    });

    it("UPDATE_QUOTE_CHANNELS 只更新内存状态且不写入存储", () => {
      const channels = getDefaultQuoteChannels();
      const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

      const newState = appReducer(state, { type: "UPDATE_QUOTE_CHANNELS", payload: channels });

      expect(newState.quoteChannels).toEqual({ channels });
      expect(state.quoteChannels).toEqual({ channels: [] });
      expect(setItemSpy).not.toHaveBeenCalled();
      setItemSpy.mockRestore();
    });

    it("SET_QUOTE_REFRESH_SETTINGS 只更新完整刷新状态且不写入存储", () => {
      const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
      const refreshSettings = {
        autoRefreshEnabled: true,
        autoRefreshIntervalSec: 1800,
      };

      const newState = appReducer(state, {
        type: "SET_QUOTE_REFRESH_SETTINGS",
        payload: refreshSettings,
      });

      expect(newState.quoteSettings).toEqual(refreshSettings);
      expect(state.quoteSettings).toEqual({
        autoRefreshEnabled: false,
        autoRefreshIntervalSec: 600,
      });
      expect(setItemSpy).not.toHaveBeenCalled();
      setItemSpy.mockRestore();
    });
  });

  describe("模态框管理", () => {
    it("OPEN_MODAL 应该打开模态框", () => {
      const action: AppAction = { type: "OPEN_MODAL" };
      const newState = appReducer(state, action);

      expect(newState.isModalOpen).toBe(true);
    });

    it("CLOSE_MODAL 应该关闭模态框", () => {
      state.isModalOpen = true;
      const action: AppAction = { type: "CLOSE_MODAL" };
      const newState = appReducer(state, action);

      expect(newState.isModalOpen).toBe(false);
    });
  });
});
