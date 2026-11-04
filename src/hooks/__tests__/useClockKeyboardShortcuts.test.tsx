import { act, fireEvent, renderHook } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import { AppContextProvider, useAppDispatch, useAppState } from "../../contexts/AppContext";
import { getAppSettings, updateGeneralSettings } from "../../utils/appSettings";
import { broadcastSettingsEvent, SETTINGS_EVENTS } from "../../utils/settingsEvents";
import { useClockKeyboardShortcuts } from "../useClockKeyboardShortcuts";

const feedback = vi.hoisted(() => ({ notify: vi.fn(() => "reset-hint"), dismiss: vi.fn() }));
const fullscreen = vi.hoisted(() => vi.fn());
vi.mock("../../ui", () => ({ useFeedback: () => feedback }));
vi.mock("../useFullscreen", () => ({ useFullscreen: () => [false, fullscreen] }));

function press(code: string, target: HTMLElement | Window = window) {
  fireEvent.keyDown(target, { code });
  fireEvent.keyUp(target, { code });
}

function setup() {
  const showHud = vi.fn();
  const hook = renderHook(
    ({ blocked }) => {
      useClockKeyboardShortcuts(blocked, showHud);
      return { state: useAppState(), dispatch: useAppDispatch() };
    },
    { initialProps: { blocked: false }, wrapper: AppContextProvider }
  );
  act(() => {
    hook.result.current.dispatch({ type: "SET_MODE", payload: "countdown" });
    hook.result.current.dispatch({ type: "SET_COUNTDOWN", payload: 600 });
  });
  return { ...hook, showHud };
}

describe("计时页面快捷键", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("空格开始、暂停和继续，未设时长时打开设置", () => {
    const { result } = setup();
    press("Space");
    expect(result.current.state.countdown.isActive).toBe(true);
    act(() => vi.advanceTimersByTime(2000));
    press("Space");
    expect(result.current.state.countdown).toMatchObject({ isActive: false, currentTime: 598 });
    press("Space");
    expect(result.current.state.countdown.isActive).toBe(true);
    act(() => result.current.dispatch({ type: "SET_COUNTDOWN", payload: 0 }));
    press("Space");
    expect(result.current.state.isModalOpen).toBe(true);
  });

  it("只控制当前页面，后台倒计时不受秒表快捷键影响", () => {
    const { result } = setup();
    press("Space");
    act(() => result.current.dispatch({ type: "SET_MODE", payload: "stopwatch" }));
    press("Space");
    expect(result.current.state.stopwatch.isActive).toBe(true);
    expect(result.current.state.countdown.isActive).toBe(true);
    press("Space");
    expect(result.current.state.stopwatch.isActive).toBe(false);
    press("KeyR");
    press("KeyR");
    expect(result.current.state.countdown.isActive).toBe(true);
  });

  it("重置需要松开再按，长按不会确认，首次按键不中断计时", () => {
    const { result } = setup();
    press("Space");
    fireEvent.keyDown(window, { code: "KeyR" });
    expect(result.current.state.countdown.isActive).toBe(true);
    expect(feedback.notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: "再按一次 R，重置为 10:00" })
    );
    fireEvent.keyDown(window, { code: "KeyR", repeat: true });
    fireEvent.keyDown(window, { code: "KeyR" });
    expect(result.current.state.countdown.isActive).toBe(true);
    fireEvent.keyUp(window, { code: "KeyR" });
    press("KeyR");
    expect(result.current.state.countdown).toMatchObject({ isActive: false, currentTime: 600 });
  });

  it("超时、切换页面、失焦及打开弹窗会取消旧确认，暂停时仍须双按", () => {
    const { result, rerender } = setup();
    act(() => {
      result.current.dispatch({ type: "START_COUNTDOWN" });
      vi.advanceTimersByTime(1000);
    });
    act(() => result.current.dispatch({ type: "PAUSE_COUNTDOWN" }));
    const remaining = result.current.state.countdown.currentTime;
    press("KeyR");
    act(() => vi.advanceTimersByTime(2001));
    press("KeyR");
    expect(result.current.state.countdown.currentTime).toBe(remaining);
    fireEvent.blur(window);
    press("KeyR");
    expect(result.current.state.countdown.currentTime).toBe(remaining);
    rerender({ blocked: true });
    rerender({ blocked: false });
    press("KeyR");
    expect(result.current.state.countdown.currentTime).toBe(remaining);
    act(() => result.current.dispatch({ type: "SET_MODE", payload: "clock" }));
    act(() => result.current.dispatch({ type: "SET_MODE", payload: "countdown" }));
    press("KeyR");
    expect(result.current.state.countdown.currentTime).toBe(remaining);
    press("KeyR");
    expect(result.current.state.countdown.currentTime).toBe(600);
  });

  it("输入、按钮、弹窗、组合键和中文输入不触发计时", () => {
    const { result, rerender } = setup();
    for (const tag of ["input", "textarea", "select", "button", "a"]) {
      const target = document.createElement(tag);
      document.body.append(target);
      press("Space", target);
      target.remove();
    }
    fireEvent.keyDown(window, { code: "Space", ctrlKey: true });
    fireEvent.keyUp(window, { code: "Space" });
    fireEvent.keyDown(window, { code: "Space", isComposing: true });
    fireEvent.keyUp(window, { code: "Space" });
    rerender({ blocked: true });
    press("Space");
    expect(result.current.state.countdown.isActive).toBe(false);
  });

  it("自定义保存后立即生效，清除绑定后停用，Enter 唤出控制栏", () => {
    const { result, showHud } = setup();
    act(() => {
      updateGeneralSettings({ keyboardShortcuts: { toggleTimer: "KeyT", resetCountdown: null } });
      broadcastSettingsEvent(SETTINGS_EVENTS.SettingsSaved);
    });
    press("Space");
    expect(result.current.state.countdown.isActive).toBe(false);
    press("KeyT");
    expect(result.current.state.countdown.isActive).toBe(true);
    press("KeyR");
    press("KeyR");
    expect(result.current.state.countdown.isActive).toBe(true);
    press("Enter");
    expect(showHud).toHaveBeenCalledOnce();
    press("KeyF");
    expect(fullscreen).toHaveBeenCalledOnce();
    expect(getAppSettings().general.keyboardShortcuts.toggleTimer).toBe("KeyT");
  });
});
