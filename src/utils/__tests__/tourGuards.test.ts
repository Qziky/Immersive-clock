import type { Config, Driver, DriveStep, State } from "driver.js";
import { afterEach, describe, expect, it, vi } from "vitest";

interface DriverMockState {
  active: boolean;
  activeIndex: number | undefined;
}

const driverMockStates = new WeakMap<Driver, DriverMockState>();

const createDriverMockImpl = (): Driver => {
  const state: DriverMockState = {
    active: false,
    activeIndex: undefined,
  };
  const driverInstance: Driver = {
    isActive: () => state.active,
    drive: vi.fn((stepIndex = 0) => {
      state.active = true;
      state.activeIndex = stepIndex;
    }),
    refresh: vi.fn(),
    setConfig: vi.fn(),
    setSteps: vi.fn(),
    getConfig: vi.fn(),
    getState: vi.fn(),
    getActiveIndex: () => state.activeIndex,
    isFirstStep: () => state.activeIndex === 0,
    isLastStep: vi.fn(),
    getActiveStep: vi.fn(),
    getActiveElement: vi.fn(),
    getPreviousElement: vi.fn(),
    getPreviousStep: vi.fn(),
    getNextStep: vi.fn(),
    moveNext: vi.fn(() => {
      if (state.activeIndex !== undefined) state.activeIndex += 1;
    }),
    movePrevious: vi.fn(() => {
      if (state.activeIndex !== undefined) state.activeIndex -= 1;
    }),
    moveTo: vi.fn((stepIndex) => {
      state.active = true;
      state.activeIndex = stepIndex;
    }),
    hasNextStep: vi.fn(),
    hasPreviousStep: vi.fn(),
    highlight: vi.fn(),
    destroy: vi.fn(() => {
      state.active = false;
    }),
  };
  driverMockStates.set(driverInstance, state);
  return driverInstance;
};

const driverMock = vi.fn((_config?: Config): Driver => createDriverMockImpl());

vi.mock("driver.js", async () => {
  const actual = await vi.importActual<typeof import("driver.js")>("driver.js");
  return {
    ...actual,
    driver: driverMock,
  };
});

const createPopoverDom = () => {
  const wrapper = document.createElement("div");
  const arrow = document.createElement("div");
  const title = document.createElement("div");
  const description = document.createElement("div");
  const footer = document.createElement("div");
  const progress = document.createElement("div");
  const previousButton = document.createElement("button");
  const nextButton = document.createElement("button");
  const closeButton = document.createElement("button");
  const footerButtons = document.createElement("div");
  previousButton.innerHTML = "上一步";
  nextButton.innerHTML = "下一步";

  return {
    wrapper,
    arrow,
    title,
    description,
    footer,
    progress,
    previousButton,
    nextButton,
    closeButton,
    footerButtons,
  };
};

const setActiveStep = (driverInstance: Driver, config: Config, step: DriveStep) => {
  const stepIndex = config.steps?.indexOf(step) ?? -1;
  const state = driverMockStates.get(driverInstance);
  if (!state || stepIndex < 0) throw new Error("无法设置 driver mock 的当前步骤");
  state.active = true;
  state.activeIndex = stepIndex;
  return stepIndex;
};

const findStep = (config: Config, predicate: (step: DriveStep) => boolean) => {
  const step = config.steps?.find(predicate);
  if (!step) throw new Error("未找到预期的引导步骤");
  return step;
};

const invokeNext = (
  config: Config,
  driverInstance: Driver,
  step: DriveStep,
  popover = createPopoverDom()
) => {
  step.popover?.onNextClick?.(undefined, step, {
    config,
    state: { activeIndex: driverInstance.getActiveIndex(), popover } as State,
    driver: driverInstance,
    index: driverInstance.getActiveIndex(),
  });
  return popover;
};

describe("tour 守卫式下一步", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    document.body.innerHTML = "";
    localStorage.clear();
  });

  it("全局禁用键盘切步", async () => {
    driverMock.mockClear();

    const { startTour } = await import("../tour");
    startTour(true);

    const config = driverMock.mock.calls[0]?.[0] as Config | undefined;
    expect(config?.allowKeyboardControl).toBe(false);
  });

  it("指引运行中再次启动不会创建新实例或重复派发开始事件", async () => {
    driverMock.mockClear();
    const startListener = vi.fn();
    window.addEventListener("tour:start", startListener);

    const { startTour } = await import("../tour");
    startTour(true);
    startTour(true);

    expect(driverMock).toHaveBeenCalledTimes(1);
    expect(startListener).toHaveBeenCalledTimes(1);
    window.removeEventListener("tour:start", startListener);
  });

  it("高亮定位完成前锁定导航，完成后只允许推进一次", async () => {
    driverMock.mockClear();

    const { startTour } = await import("../tour");
    startTour(true);

    const config = driverMock.mock.calls[0]?.[0] as Config;
    const driverInstance = driverMock.mock.results[0]?.value as Driver;
    const step = config.steps?.[1] as DriveStep;
    const runtimeStep = { ...step, popover: { ...step.popover } };
    const popover = createPopoverDom();
    setActiveStep(driverInstance, config, step);

    config.onHighlightStarted?.(undefined, runtimeStep, {
      config,
      state: { popover } as State,
      driver: driverInstance,
      index: driverInstance.getActiveIndex(),
    });
    config.onPopoverRender?.(popover, {
      config,
      state: { popover } as State,
      driver: driverInstance,
      index: driverInstance.getActiveIndex(),
    });

    expect(popover.nextButton).toBeDisabled();
    expect(popover.nextButton).toHaveTextContent("处理中…");

    config.onNextClick?.(undefined, runtimeStep, {
      config,
      state: { popover } as State,
      driver: driverInstance,
      index: driverInstance.getActiveIndex(),
    });
    expect(driverInstance.moveNext).not.toHaveBeenCalled();

    config.onHighlighted?.(undefined, runtimeStep, {
      config,
      state: { popover } as State,
      driver: driverInstance,
      index: driverInstance.getActiveIndex(),
    });
    expect(popover.nextButton).toBeEnabled();
    expect(popover.nextButton).toHaveTextContent("下一步");

    config.onNextClick?.(undefined, runtimeStep, {
      config,
      state: { popover } as State,
      driver: driverInstance,
      index: driverInstance.getActiveIndex(),
    });
    config.onNextClick?.(undefined, runtimeStep, {
      config,
      state: { popover } as State,
      driver: driverInstance,
      index: driverInstance.getActiveIndex(),
    });
    expect(driverInstance.moveNext).toHaveBeenCalledTimes(1);
  });

  it("快速点击完成按钮只销毁一次并派发一次完成事件", async () => {
    driverMock.mockClear();
    const completedListener = vi.fn();
    window.addEventListener("tour:completed", completedListener);

    const { startTour } = await import("../tour");
    startTour(true);

    const config = driverMock.mock.calls[0]?.[0] as Config;
    const driverInstance = driverMock.mock.results[0]?.value as Driver;
    const steps = config.steps ?? [];
    const lastStep = steps[steps.length - 1];
    setActiveStep(driverInstance, config, lastStep);

    invokeNext(config, driverInstance, lastStep);
    invokeNext(config, driverInstance, lastStep);
    config.onDestroyed?.(undefined, lastStep, {
      config,
      state: {} as State,
      driver: driverInstance,
      index: driverInstance.getActiveIndex(),
    });

    expect(driverInstance.destroy).toHaveBeenCalledTimes(1);
    expect(completedListener).toHaveBeenCalledTimes(1);
    window.removeEventListener("tour:completed", completedListener);
  });

  it("未完成最后一步结束时不会派发 tour:completed 事件", async () => {
    driverMock.mockClear();
    const completedListener = vi.fn();
    window.addEventListener("tour:completed", completedListener);

    const { startTour } = await import("../tour");
    startTour(true);

    const config = driverMock.mock.calls[0]?.[0] as Config;
    const driverInstance = driverMock.mock.results[0]?.value as Driver;
    const someStep = config.steps?.[2] as DriveStep;
    config.onDestroyed?.(undefined, someStep, {
      config,
      state: { activeIndex: 2 } as State,
      driver: driverInstance,
      index: driverInstance.getActiveIndex(),
    });

    expect(completedListener).not.toHaveBeenCalled();
    window.removeEventListener("tour:completed", completedListener);
  });

  it("切换监测设置：忽略背景自习节点并等待展开动画后只继续一次", async () => {
    vi.useFakeTimers();
    driverMock.mockClear();

    const visibleRects = [{}] as unknown as DOMRectList;
    const backgroundWrapper = document.createElement("div");
    backgroundWrapper.setAttribute("aria-hidden", "true");
    backgroundWrapper.setAttribute("inert", "");
    const backgroundStudyPanel = document.createElement("div");
    backgroundStudyPanel.id = "study-panel";
    backgroundWrapper.appendChild(backgroundStudyPanel);

    const settingsPanelContainer = document.createElement("div");
    settingsPanelContainer.id = "settings-panel-container";
    const environmentGroup = document.createElement("button");
    environmentGroup.setAttribute("data-settings-group", "environment");
    vi.spyOn(environmentGroup, "getClientRects").mockReturnValue(visibleRects);
    const noisePane = document.createElement("button");
    noisePane.setAttribute("data-settings-pane", "noise");
    vi.spyOn(noisePane, "getClientRects").mockReturnValue(visibleRects);
    const settingsStudyPanel = document.createElement("div");
    settingsStudyPanel.id = "study-panel";
    settingsStudyPanel.hidden = true;
    environmentGroup.addEventListener("click", () => settingsPanelContainer.appendChild(noisePane));
    noisePane.addEventListener("click", () => {
      settingsStudyPanel.hidden = false;
    });
    const groupClickSpy = vi.spyOn(environmentGroup, "click");
    const paneClickSpy = vi.spyOn(noisePane, "click");
    settingsPanelContainer.append(environmentGroup, settingsStudyPanel);
    document.body.append(backgroundWrapper, settingsPanelContainer);

    const { startTour } = await import("../tour");
    startTour(true);
    const config = driverMock.mock.calls[0]?.[0] as Config;
    const driverInstance = driverMock.mock.results[0]?.value as Driver;
    const step = findStep(config, (candidate) => candidate.popover?.title === "监测设置");
    const popover = createPopoverDom();
    setActiveStep(driverInstance, config, step);

    invokeNext(config, driverInstance, step, popover);
    invokeNext(config, driverInstance, step, popover);
    expect(groupClickSpy).toHaveBeenCalledTimes(1);
    expect(popover.nextButton).toBeDisabled();

    await vi.advanceTimersByTimeAsync(400);
    expect(paneClickSpy).toHaveBeenCalledTimes(1);
    expect(settingsStudyPanel.hidden).toBe(false);
    expect(driverInstance.moveNext).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(100);
    expect(driverInstance.moveNext).toHaveBeenCalledTimes(1);
  });

  it("噪音校准：自动切换子 Tab，但不会自动开始采集", async () => {
    driverMock.mockClear();

    const calibrationTab = document.createElement("button");
    calibrationTab.id = "noise-settings-tabs-tab-calibration";
    calibrationTab.setAttribute("aria-selected", "false");
    const tabClickSpy = vi.spyOn(calibrationTab, "click");
    calibrationTab.addEventListener("click", () => {
      calibrationTab.setAttribute("aria-selected", "true");
    });
    const calibrationPanel = document.createElement("div");
    calibrationPanel.setAttribute("data-tour", "noise-calibration");
    const calibrateButton = document.createElement("button");
    calibrateButton.setAttribute("data-tour", "noise-calibrate-button");
    const calibrateClickSpy = vi.spyOn(calibrateButton, "click");
    calibrationPanel.appendChild(calibrateButton);
    document.body.append(calibrationTab, calibrationPanel);

    const { startTour } = await import("../tour");
    startTour(true);
    const config = driverMock.mock.calls[0]?.[0] as Config;
    const driverInstance = driverMock.mock.results[0]?.value as Driver;
    const tabStep = findStep(
      config,
      (step) => step.element === "#noise-settings-tabs-tab-calibration"
    );
    const panelStep = config.steps?.find(
      (step) => step.element === '[data-tour="noise-calibration"]'
    );
    setActiveStep(driverInstance, config, tabStep);

    invokeNext(config, driverInstance, tabStep);
    expect(tabClickSpy).toHaveBeenCalledTimes(1);
    expect(driverInstance.moveNext).toHaveBeenCalledTimes(1);
    expect(panelStep?.popover?.onNextClick).toBeUndefined();
    expect(calibrateClickSpy).not.toHaveBeenCalled();
  });

  it("打开和关闭历史记录时分别只执行一次辅助点击并推进一步", async () => {
    driverMock.mockClear();

    const monitor = document.createElement("div");
    monitor.setAttribute("data-tour", "noise-monitor");
    const trigger = document.createElement("button");
    trigger.setAttribute("data-tour", "noise-history-trigger");
    trigger.addEventListener("click", () => {
      const modal = document.createElement("div");
      modal.setAttribute("data-tour", "noise-history-modal");
      const closeButton = document.createElement("button");
      closeButton.setAttribute("data-tour", "noise-history-close");
      closeButton.addEventListener("click", () => modal.remove());
      modal.appendChild(closeButton);
      document.body.appendChild(modal);
    });
    monitor.appendChild(trigger);
    document.body.appendChild(monitor);

    const { startTour } = await import("../tour");
    startTour(true);
    const config = driverMock.mock.calls[0]?.[0] as Config;
    const driverInstance = driverMock.mock.results[0]?.value as Driver;
    const openStep = findStep(config, (step) => step.element === '[data-tour="noise-monitor"]');
    const closeStep = findStep(
      config,
      (step) => step.element === '[data-tour="noise-history-close"]'
    );

    setActiveStep(driverInstance, config, openStep);
    invokeNext(config, driverInstance, openStep);
    expect(document.querySelector('[data-tour="noise-history-modal"]')).toBeTruthy();
    expect(driverInstance.moveNext).toHaveBeenCalledTimes(1);

    vi.mocked(driverInstance.moveNext).mockClear();
    setActiveStep(driverInstance, config, closeStep);
    config.onHighlightStarted?.(undefined, closeStep, {
      config,
      state: {} as State,
      driver: driverInstance,
      index: driverInstance.getActiveIndex(),
    });
    config.onHighlighted?.(undefined, closeStep, {
      config,
      state: {} as State,
      driver: driverInstance,
      index: driverInstance.getActiveIndex(),
    });
    invokeNext(config, driverInstance, closeStep);
    expect(document.querySelector('[data-tour="noise-history-modal"]')).toBeFalsy();
    expect(driverInstance.moveNext).toHaveBeenCalledTimes(1);
  });

  it("进入自习模式：快速双击只执行一次切换并只推进一步", async () => {
    vi.useFakeTimers();
    driverMock.mockClear();
    const switchMode = vi.fn(() => {
      setTimeout(() => {
        const panel = document.createElement("div");
        panel.id = "study-panel";
        document.body.appendChild(panel);
      }, 100);
    });

    const { startTour } = await import("../tour");
    startTour(true, { switchMode });
    const config = driverMock.mock.calls[0]?.[0] as Config;
    const driverInstance = driverMock.mock.results[0]?.value as Driver;
    const step = findStep(config, (candidate) => candidate.element === "#mode-tab-study");
    const popover = createPopoverDom();
    setActiveStep(driverInstance, config, step);

    invokeNext(config, driverInstance, step, popover);
    invokeNext(config, driverInstance, step, popover);
    expect(switchMode).toHaveBeenCalledTimes(1);
    expect(popover.nextButton).toBeDisabled();
    expect(popover.nextButton).toHaveTextContent("处理中…");

    await vi.runAllTimersAsync();
    expect(driverInstance.moveNext).toHaveBeenCalledTimes(1);
  });

  it("辅助动作轮询在步骤变化后失效，不能推进新的步骤", async () => {
    vi.useFakeTimers();
    driverMock.mockClear();

    const { startTour } = await import("../tour");
    startTour(true, { switchMode: vi.fn() });
    const config = driverMock.mock.calls[0]?.[0] as Config;
    const driverInstance = driverMock.mock.results[0]?.value as Driver;
    const step = findStep(config, (candidate) => candidate.element === "#mode-tab-study");
    const stepIndex = setActiveStep(driverInstance, config, step);

    invokeNext(config, driverInstance, step);
    const state = driverMockStates.get(driverInstance)!;
    state.activeIndex = stepIndex + 1;
    await vi.runAllTimersAsync();

    expect(driverInstance.moveNext).not.toHaveBeenCalled();
  });

  it("辅助动作超时后停留当前步骤、恢复按钮并提示重试", async () => {
    vi.useFakeTimers();
    driverMock.mockClear();

    const { startTour } = await import("../tour");
    startTour(true, { switchMode: vi.fn() });
    const config = driverMock.mock.calls[0]?.[0] as Config;
    const driverInstance = driverMock.mock.results[0]?.value as Driver;
    const step = findStep(config, (candidate) => candidate.element === "#mode-tab-study");
    const popover = createPopoverDom();
    popover.nextButton.innerHTML = "帮我切换";
    setActiveStep(driverInstance, config, step);

    invokeNext(config, driverInstance, step, popover);
    await vi.advanceTimersByTimeAsync(2500);

    expect(driverInstance.moveNext).not.toHaveBeenCalled();
    expect(popover.nextButton).toBeEnabled();
    expect(popover.nextButton).toHaveTextContent("下一步");
    expect(popover.description).toHaveTextContent("操作未完成，请稍后重试");
  });

  it("打开设置：未挂载入口时只调用一次备用打开动作", async () => {
    vi.useFakeTimers();
    driverMock.mockClear();
    const openSettings = vi.fn();

    const { startTour } = await import("../tour");
    startTour(true, { openSettings });
    const config = driverMock.mock.calls[0]?.[0] as Config;
    const driverInstance = driverMock.mock.results[0]?.value as Driver;
    const step = findStep(config, (candidate) => candidate.element === "#tour-settings-btn");
    const popover = createPopoverDom();
    setActiveStep(driverInstance, config, step);

    invokeNext(config, driverInstance, step, popover);
    invokeNext(config, driverInstance, step, popover);

    expect(openSettings).toHaveBeenCalledTimes(1);
    expect(popover.description).toHaveTextContent("已为您执行打开操作");
    expect(popover.nextButton).toHaveTextContent("处理中…");
  });

  it("保存设置：等待面板关闭后只进入下一步一次", async () => {
    vi.useFakeTimers();
    driverMock.mockClear();

    const panel = document.createElement("div");
    panel.id = "settings-panel-container";
    const saveButton = document.createElement("button");
    saveButton.id = "settings-save-btn";
    const clickSpy = vi.spyOn(saveButton, "click");
    saveButton.addEventListener("click", () => {
      setTimeout(() => panel.remove(), 200);
    });
    document.body.append(panel, saveButton);

    const { startTour } = await import("../tour");
    startTour(true);
    const config = driverMock.mock.calls[0]?.[0] as Config;
    const driverInstance = driverMock.mock.results[0]?.value as Driver;
    const step = findStep(config, (candidate) => candidate.element === "#settings-save-btn");
    setActiveStep(driverInstance, config, step);

    invokeNext(config, driverInstance, step);
    invokeNext(config, driverInstance, step);
    expect(clickSpy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(400);
    expect(driverInstance.moveNext).toHaveBeenCalledTimes(1);
  });
});
