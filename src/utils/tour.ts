import {
  driver,
  type Config,
  type Driver,
  type DriverHook,
  type DriveStep,
  type PopoverDOM,
  type State,
} from "driver.js";
import "driver.js/dist/driver.css";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import { AppMode } from "../types";
import { AppIcon } from "../ui";

const TOUR_STORAGE_KEY = "immersive-clock:has-seen-tour";
const TOUR_PENDING_LABEL = "处理中…";
const TOUR_ACTION_TIMEOUT_HINT = "操作未完成，请稍后重试";

let currentDriver: Driver | null = null;
let closeIconRoot: Root | null = null;
let isTourStarting = false;

/**
 * 判断引导弹窗按钮是否“可作为默认焦点”的目标
 */
const isTourButtonUsable = (button?: HTMLButtonElement | null) => {
  if (!button) return false;
  if (button.disabled) return false;
  if (button.style.display === "none") return false;

  const rect = button.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;

  return true;
};

/**
 * 以微任务方式执行回调（优先使用 queueMicrotask，避免可见的 UI 闪烁）
 */
const scheduleMicrotask = (callback: () => void) => {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(callback);
    return;
  }
  Promise.resolve().then(callback);
};

/**
 * 多次尝试聚焦按钮（函数级注释：规避 driver.js 内部异步聚焦导致焦点落在“上一步/关闭”上的竞态）
 */
const focusButtonWithRetries = (button: HTMLButtonElement, retries = 3) => {
  let remaining = Math.max(0, retries);

  const tryFocusOnce = () => {
    if (remaining <= 0) return;
    remaining -= 1;

    if (!button.isConnected) return;
    if (button.disabled) return;

    const rect = button.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    button.focus();
    if (document.activeElement === button) return;

    setTimeout(tryFocusOnce, 60);
  };

  scheduleMicrotask(tryFocusOnce);
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(tryFocusOnce);
  }
  setTimeout(tryFocusOnce, 0);
};

/**
 * 安全地点击一个 selector 对应的元素（用于“辅助完成”引导步骤）
 */
const tryClickElement = (selector: string) => {
  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el) return false;
  el.click();
  return true;
};

/**
 * 判断当前是否处于自习模式（通过 tabpanel 的动态 id 判断）
 */
const isInStudyMode = () => {
  const panel = document.getElementById("study-panel");
  return !!panel && (typeof panel.isConnected !== "boolean" || panel.isConnected);
};

/**
 * 判断设置面板是否已打开（通过容器是否存在判断）
 */
const isSettingsPanelOpen = () => {
  const panel = document.getElementById("settings-panel-container");
  return !!panel && (typeof panel.isConnected !== "boolean" || panel.isConnected);
};

/** 返回当前可交互的设置导航元素，兼容桌面侧栏与移动紧凑导航。 */
const getVisibleSettingsElement = (selector: string): HTMLElement | null => {
  const elements = Array.from(document.querySelectorAll<HTMLElement>(selector));
  return (
    elements.find(
      (element) =>
        element.getClientRects().length > 0 &&
        !element.closest('[hidden], [aria-hidden="true"], [inert]')
    ) ?? null
  );
};

/** 判断噪音设置面板已挂载且当前可见。 */
const isNoiseSettingsPanelActive = () => {
  // 主页面的自习模式与设置内噪音面板当前都使用了 #study-panel，必须限定在设置容器内，
  // 否则 Modal 将背景页面标记为 aria-hidden/inert 后会误判辅助操作未完成。
  const panel = document.querySelector<HTMLElement>("#settings-panel-container #study-panel");
  return !!panel && !panel.closest('[hidden], [aria-hidden="true"], [inert]');
};

/** 打开设置中的分组和目标面板。 */
const activateSettingsPane = (group: string, pane: string, shouldContinue: () => boolean) => {
  const paneSelector = `[data-settings-pane="${pane}"]`;
  const clickPane = () => {
    if (!shouldContinue()) return false;
    const paneElement = getVisibleSettingsElement(paneSelector);
    if (!paneElement) return false;
    paneElement.click();
    return true;
  };

  if (clickPane()) return;
  if (!shouldContinue()) return;
  getVisibleSettingsElement(`[data-settings-group="${group}"]`)?.click();

  let attempts = 0;
  const retry = () => {
    if (!shouldContinue()) return;
    if (clickPane() || attempts >= 12) return;
    attempts += 1;
    setTimeout(retry, 60);
  };
  setTimeout(retry, 0);
};

/** 判断校准子 Tab 是否已激活。 */
const isNoiseCalibrationTabActive = () =>
  document.getElementById("noise-settings-tabs-tab-calibration")?.getAttribute("aria-selected") ===
  "true";
/**
 * 判断噪音历史记录弹窗是否已打开
 */
const isNoiseHistoryModalOpen = () => {
  const modal = document.querySelector('[data-tour="noise-history-modal"]');
  return (
    !!modal &&
    (typeof (modal as HTMLElement).isConnected !== "boolean" || (modal as HTMLElement).isConnected)
  );
};

/**
 * 等待条件成立后再进入下一步（用于跨 React 状态切换后的稳定过渡）
 */
const waitForConditionThenMoveNext = (params: {
  driverObj: Driver;
  condition: () => boolean;
  isCurrent: () => boolean;
  onSatisfied: () => void;
  onTimeout: () => void;
  timeoutMs?: number;
  intervalMs?: number;
  waitAfterSatisfiedMs?: number;
}) => {
  const {
    driverObj,
    condition,
    isCurrent,
    onSatisfied,
    onTimeout,
    timeoutMs = 2400,
    intervalMs = 60,
    waitAfterSatisfiedMs = 0,
  } = params;
  const startedAt = Date.now();
  let settled = false;

  const cancelIfStale = () => {
    if (settled) return true;
    if (driverObj.isActive() && isCurrent()) return false;
    settled = true;
    return true;
  };

  const satisfy = () => {
    if (cancelIfStale()) return;
    if (!condition()) {
      settled = true;
      onTimeout();
      return;
    }
    settled = true;
    onSatisfied();
  };

  const tick = () => {
    if (cancelIfStale()) return;
    if (condition()) {
      if (waitAfterSatisfiedMs > 0) {
        setTimeout(satisfy, waitAfterSatisfiedMs);
      } else {
        satisfy();
      }
      return;
    }
    if (Date.now() - startedAt >= timeoutMs) {
      settled = true;
      onTimeout();
      return;
    }
    setTimeout(tick, intervalMs);
  };
  tick();
};

/**
 * 更新引导弹窗的辅助提示文案
 */
const applyTourAutoActionHint = (popover: PopoverDOM | undefined, hint: string) => {
  const desc = popover?.description;
  if (!desc) return;
  const current = desc.textContent ?? "";
  if (current.includes(hint)) return;
  desc.textContent = current ? `${current} ${hint}` : hint;
};

/**
 * 统一“下一步”按钮文案（例如从“帮我切换”恢复为“下一步”）
 */
const normalizeTourNextButtonLabel = (popover: PopoverDOM | undefined) => {
  const nextButton = popover?.nextButton;
  if (!nextButton) return;
  const current = nextButton.innerHTML || "";
  if (!current || current === "下一步") return;
  nextButton.innerHTML = "下一步";
};

/** 将当前引导导航标记为处理中，并返回精确恢复原状态的函数。 */
const setTourPopoverBusy = (popover: PopoverDOM) => {
  const buttons = [popover.previousButton, popover.nextButton];
  const buttonStates = buttons.map((button) => ({
    button,
    disabled: button.disabled,
    hadDisabledClass: button.classList.contains("driver-popover-btn-disabled"),
  }));
  const nextButtonLabel = popover.nextButton.innerHTML;
  const nextButtonAriaBusy = popover.nextButton.getAttribute("aria-busy");

  buttonStates.forEach(({ button }) => {
    button.disabled = true;
    button.classList.add("driver-popover-btn-disabled");
  });
  popover.nextButton.innerHTML = TOUR_PENDING_LABEL;
  popover.nextButton.setAttribute("aria-busy", "true");

  return () => {
    buttonStates.forEach(({ button, disabled, hadDisabledClass }) => {
      button.disabled = disabled;
      if (!hadDisabledClass) {
        button.classList.remove("driver-popover-btn-disabled");
      }
    });
    popover.nextButton.innerHTML = nextButtonLabel;
    if (nextButtonAriaBusy === null) {
      popover.nextButton.removeAttribute("aria-busy");
    } else {
      popover.nextButton.setAttribute("aria-busy", nextButtonAriaBusy);
    }
  };
};

/**
 * 临时禁用按钮以影响 driver.js 的默认聚焦选择，并在微任务中恢复原状态
 */
const temporarilyDisableButtons = (buttons: Array<HTMLButtonElement | null | undefined>) => {
  const previousStates = buttons.map((button) => ({
    button,
    disabled: button?.disabled ?? false,
  }));

  previousStates.forEach(({ button, disabled }) => {
    if (!button) return;
    if (disabled) return;
    button.disabled = true;
  });

  return () => {
    previousStates.forEach(({ button, disabled }) => {
      if (!button) return;
      button.disabled = disabled;
    });
  };
};

/**
 * 手动添加关闭按钮（因为 allowClose: false 禁用了所有关闭方式，需手动补回按钮以仅允许按钮退出）
 */
const ensureCloseButton = (popover: PopoverDOM, driver: Driver) => {
  if (!popover.wrapper) {
    return;
  }

  const existingCloseButton = popover.wrapper.querySelector(
    ".driver-popover-close-btn"
  ) as HTMLButtonElement | null;
  const closeBtn = existingCloseButton ?? document.createElement("button");
  if (!existingCloseButton) {
    closeBtn.className = "driver-popover-close-btn";
    popover.wrapper.appendChild(closeBtn);
  }
  closeBtn.setAttribute("aria-label", "退出指引");
  closeBtn.title = "退出指引";
  closeBtn.onclick = () => {
    driver.destroy();
  };

  closeIconRoot?.unmount();
  closeIconRoot = createRoot(closeBtn);
  closeIconRoot.render(createElement(AppIcon, { name: "action.close", size: "md" }));
};

/**
 * 让引导弹窗默认焦点落在“下一步”，而不是“上一步”或“X”
 */
const preferTourNextButtonAsDefaultFocus = (popover: PopoverDOM, opts: { driver: Driver }) => {
  // 确保关闭按钮存在（因为 allowClose: false）
  ensureCloseButton(popover, opts.driver);

  if (!opts.driver.isActive()) return;

  const canNext = isTourButtonUsable(popover.nextButton);
  const canPrev = isTourButtonUsable(popover.previousButton);

  if (canNext) {
    // 这里的 popover.closeButton 可能是 null，因为 allowClose: false
    // 如果我们手动添加了按钮，它不在 popover.closeButton 引用中，但可以通过 DOM 获取
    const manualCloseBtn = popover.wrapper?.querySelector(
      ".driver-popover-close-btn"
    ) as HTMLButtonElement | null;
    const restore = temporarilyDisableButtons([
      popover.closeButton,
      manualCloseBtn,
      popover.previousButton,
    ]);
    if (popover.nextButton) focusButtonWithRetries(popover.nextButton, 4);
    setTimeout(() => restore(), 160);
    return;
  }

  if (canPrev) {
    const manualCloseBtn = popover.wrapper?.querySelector(
      ".driver-popover-close-btn"
    ) as HTMLButtonElement | null;
    const restore = temporarilyDisableButtons([popover.closeButton, manualCloseBtn]);
    if (popover.previousButton) focusButtonWithRetries(popover.previousButton, 3);
    setTimeout(() => restore(), 160);
  }
};

type TourPopoverRenderHook = (
  popover: PopoverDOM,
  opts: { config: Config; state: State; driver: Driver }
) => void;

/**
 * 组合引导弹窗渲染回调（函数级注释：driver.js 的 step.onPopoverRender 会覆盖全局 onPopoverRender，因此需显式合并以保证默认焦点始终落在“下一步”）
 */
const composeTourPopoverRender = (
  baseRender: TourPopoverRenderHook,
  render?: TourPopoverRenderHook
): TourPopoverRenderHook => {
  return (popover, opts) => {
    render?.(popover, opts);
    baseRender(popover, opts);
  };
};

/** 合并被步骤级 hook 覆盖的 driver.js 生命周期回调。 */
const composeTourDriverHook = (baseHook: DriverHook, hook?: DriverHook): DriverHook => {
  return (element, step, opts) => {
    baseHook(element, step, opts);
    hook?.(element, step, opts);
  };
};

interface TourAutoNextParams {
  check: () => boolean;
  action: (context: { isCurrent: () => boolean }) => void;
  hint?: string;
  timeoutMs?: number;
  waitAfterSatisfiedMs?: number;
}

/** 创建单次引导运行内的步骤锁，避免过渡、辅助动作和重复点击互相穿透。 */
const createTourNavigationGuard = () => {
  let lockedStepIndex: number | null = null;
  let restorePopoverBusy: (() => void) | null = null;
  const runtimeStepIndices = new WeakMap<DriveStep, number>();

  const getStepIndex = (config: Config, step: DriveStep) => {
    const configuredStepIndex = config.steps?.indexOf(step) ?? -1;
    return configuredStepIndex >= 0 ? configuredStepIndex : (runtimeStepIndices.get(step) ?? -1);
  };
  const rememberRuntimeStepIndex = (
    step: DriveStep,
    opts: { config: Config; state: State; driver: Driver }
  ) => {
    const activeIndex = opts.driver.getActiveIndex() ?? opts.state.activeIndex;
    const stepIndex = activeIndex ?? getStepIndex(opts.config, step);
    if (stepIndex >= 0) runtimeStepIndices.set(step, stepIndex);
    return stepIndex;
  };
  const isCurrentStep = (driverObj: Driver, stepIndex: number) =>
    driverObj.isActive() && driverObj.getActiveIndex() === stepIndex;

  const clearPopoverBusy = () => {
    restorePopoverBusy?.();
    restorePopoverBusy = null;
  };

  const showPopoverBusy = (popover?: PopoverDOM) => {
    if (!popover) return;
    clearPopoverBusy();
    restorePopoverBusy = setTourPopoverBusy(popover);
  };

  const unlockStep = (
    stepIndex: number,
    opts: { state: State; driver: Driver },
    shouldRestoreFocus = true
  ) => {
    if (lockedStepIndex !== stepIndex) return;
    lockedStepIndex = null;
    clearPopoverBusy();
    if (shouldRestoreFocus && isCurrentStep(opts.driver, stepIndex) && opts.state.popover) {
      preferTourNextButtonAsDefaultFocus(opts.state.popover, { driver: opts.driver });
    }
  };

  const lockCurrentStep = (
    step: DriveStep,
    opts: { config: Config; state: State; driver: Driver },
    beforeLock?: () => void
  ) => {
    const stepIndex = getStepIndex(opts.config, step);
    if (stepIndex < 0 || lockedStepIndex !== null || !isCurrentStep(opts.driver, stepIndex)) {
      return null;
    }
    beforeLock?.();
    lockedStepIndex = stepIndex;
    showPopoverBusy(opts.state.popover);
    return stepIndex;
  };

  const onHighlightStarted: DriverHook = (_element, step, opts) => {
    const stepIndex = rememberRuntimeStepIndex(step, opts);
    lockedStepIndex = stepIndex >= 0 ? stepIndex : null;
    clearPopoverBusy();
  };

  const onHighlighted: DriverHook = (_element, step, opts) => {
    const stepIndex = rememberRuntimeStepIndex(step, opts);
    if (stepIndex < 0 || !isCurrentStep(opts.driver, stepIndex)) return;
    unlockStep(stepIndex, opts);
  };

  const onPopoverRender: TourPopoverRenderHook = (popover, opts) => {
    ensureCloseButton(popover, opts.driver);
    if (lockedStepIndex === opts.driver.getActiveIndex()) {
      showPopoverBusy(popover);
      return;
    }
    preferTourNextButtonAsDefaultFocus(popover, { driver: opts.driver });
  };

  const moveNext: DriverHook = (_element, step, opts) => {
    if (lockCurrentStep(step, opts) === null) return;
    opts.driver.moveNext();
  };

  const movePrevious: DriverHook = (_element, step, opts) => {
    if (lockCurrentStep(step, opts) === null) return;
    opts.driver.movePrevious();
  };

  const guardAction = (action: DriverHook): DriverHook => {
    return (element, step, opts) => {
      if (lockCurrentStep(step, opts) === null) return;
      action(element, step, opts);
    };
  };

  const createAutoNextClick = (params: TourAutoNextParams): DriverHook => {
    return (_element, step, opts) => {
      const stepIndex = lockCurrentStep(step, opts, () => {
        normalizeTourNextButtonLabel(opts.state.popover);
      });
      if (stepIndex === null) return;

      const isCurrent = () =>
        lockedStepIndex === stepIndex && isCurrentStep(opts.driver, stepIndex);

      if (params.hint) {
        applyTourAutoActionHint(opts.state.popover, params.hint);
      }

      if (params.check()) {
        opts.driver.moveNext();
        return;
      }

      try {
        params.action({ isCurrent });
      } catch (error) {
        unlockStep(stepIndex, opts);
        throw error;
      }

      waitForConditionThenMoveNext({
        driverObj: opts.driver,
        condition: params.check,
        isCurrent,
        onSatisfied: () => {
          if (isCurrent()) opts.driver.moveNext();
        },
        onTimeout: () => {
          if (!isCurrent()) return;
          applyTourAutoActionHint(opts.state.popover, TOUR_ACTION_TIMEOUT_HINT);
          unlockStep(stepIndex, opts);
        },
        timeoutMs: params.timeoutMs,
        waitAfterSatisfiedMs: params.waitAfterSatisfiedMs,
      });
    };
  };

  const dispose = () => {
    lockedStepIndex = null;
    clearPopoverBusy();
  };

  return {
    createAutoNextClick,
    dispose,
    guardAction,
    moveNext,
    movePrevious,
    onHighlighted,
    onHighlightStarted,
    onPopoverRender,
  };
};

/**
 * 检查用户是否已观看过指引
 */
export const hasSeenTour = () => {
  return localStorage.getItem(TOUR_STORAGE_KEY) === "true";
};

/**
 * 标记指引为已观看
 */
export const markTourAsSeen = () => {
  localStorage.setItem(TOUR_STORAGE_KEY, "true");
};

/**
 * 检查指引是否正在运行
 */
export const isTourActive = () => {
  return currentDriver ? currentDriver.isActive() : false;
};

interface TourOptions {
  onStart?: () => void;
  switchMode?: (mode: AppMode) => void;
  openSettings?: () => void;
  onEnd?: () => void;
}

/**
 * 启动新手指引
 * @param force 是否强制启动（忽略已观看状态）
 * @param options 配置选项
 */
export const startTour = (force = false, options?: TourOptions) => {
  if (isTourStarting || isTourActive()) {
    return;
  }
  if (!force && hasSeenTour()) {
    return;
  }

  isTourStarting = true;
  try {
    let isDoneClicked = false;
    const navigationGuard = createTourNavigationGuard();
    const renderTourPopover = composeTourPopoverRender(navigationGuard.onPopoverRender);

    // 指引开始时立即执行回调（显示 HUD）
    options?.onStart?.();

    // 派发全局事件通知指引开始
    window.dispatchEvent(new Event("tour:start"));

    const shouldReduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const driverObj = driver({
      showProgress: true,
      allowClose: false,
      allowKeyboardControl: false,
      // 显式配置 SVG 遮罩，兼容无法可靠匹配 driver.js 遮罩节点的浏览器内核。
      overlayColor: "#020504",
      overlayOpacity: 0.62,
      animate: !shouldReduceMotion,
      nextBtnText: "下一步",
      prevBtnText: "上一步",
      doneBtnText: "完成",
      onHighlightStarted: navigationGuard.onHighlightStarted,
      onHighlighted: navigationGuard.onHighlighted,
      onNextClick: navigationGuard.moveNext,
      onPrevClick: navigationGuard.movePrevious,
      onPopoverRender: renderTourPopover,
      steps: [
        {
          popover: {
            title: "欢迎使用 Immersive Clock",
            description: "接下来将为您介绍一些常用操作，帮助您快速上手。点击“下一步”继续。",
            side: "left",
            align: "center",
            showButtons: ["next"],
          },
        },
        {
          element: "#tour-fullscreen-btn",
          popover: {
            title: "全屏模式",
            description: "点击这里进入全屏，获得更沉浸的显示效果。",
            side: "top",
            align: "end",
          },
        },
        {
          element: "#tour-mode-selector",
          popover: {
            title: "切换模式",
            description: "点击这里切换时钟、倒计时、秒表或自习模式。",
            side: "bottom",
            align: "start",
          },
        },
        {
          element: "#mode-tab-study",
          popover: {
            title: "进入自习模式",
            description: "自习模式是我们的特色模式，接下来带你进入。",
            side: "bottom",
            align: "center",
            onPopoverRender: renderTourPopover,
            onNextClick: navigationGuard.createAutoNextClick({
              check: isInStudyMode,
              action: () => {
                const clicked = tryClickElement("#mode-tab-study");
                if (!clicked) {
                  options?.switchMode?.("study");
                }
              },
              hint: "已为您执行切换操作",
            }),
          },
        },
        {
          element: '[data-tour="clock-area"]',
          popover: {
            title: "自习模式",
            description:
              "这是专为教室多媒体大屏打造的模式，支持噪音监测与统计、在线励志语句、天气显示与预警等等。",
            side: "top",
            align: "center",
          },
          onHighlightStarted: composeTourDriverHook(navigationGuard.onHighlightStarted, () => {
            // 确保 HUD 显示
            options?.onStart?.();
          }),
        },
        {
          element: "#tour-settings-btn",
          popover: {
            title: "个性化设置",
            description: "在这个不起眼的角落藏着设置面板，这里有极度丰富的各种偏好设置。",
            side: "top",
            align: "end",
            onPopoverRender: renderTourPopover,
            onNextClick: navigationGuard.createAutoNextClick({
              check: isSettingsPanelOpen,
              action: () => {
                const clicked = tryClickElement("#tour-settings-btn");
                if (!clicked) {
                  options?.openSettings?.();
                }
              },
              hint: "已为您执行打开操作",
              waitAfterSatisfiedMs: 400, // 等待设置面板动画完成
            }),
          },
        },
        {
          element: "#settings-panel-container",
          popover: {
            title: "设置面板",
            description: "在这里可以配置各种偏好，例如界面显示、专注相关开关等。",
            side: "left",
            align: "center",
          },
        },
        {
          element: () =>
            getVisibleSettingsElement('[data-settings-group="environment"]') ?? document.body,
          popover: {
            title: "监测设置",
            description: "打开环境提醒分组后，选择噪音监测即可配置噪音与校准。",
            side: "bottom",
            align: "center",
            onPopoverRender: renderTourPopover,
            onNextClick: navigationGuard.createAutoNextClick({
              check: isNoiseSettingsPanelActive,
              action: ({ isCurrent }) => activateSettingsPane("environment", "noise", isCurrent),
              hint: "已为您执行切换操作",
              waitAfterSatisfiedMs: 400, // 等待设置分组展开与噪音面板切换动画完成
            }),
          },
        },

        {
          element: "#noise-settings-tabs-tab-calibration",
          popover: {
            title: "打开校准设置",
            description: "校准位于独立子页。点击“下一步”会为您切换到校准页。",
            side: "bottom",
            align: "center",
            onPopoverRender: renderTourPopover,
            onNextClick: navigationGuard.createAutoNextClick({
              check: isNoiseCalibrationTabActive,
              action: () => tryClickElement("#noise-settings-tabs-tab-calibration"),
              hint: "已为您切换到校准页",
            }),
          },
        },
        {
          element: '[data-tour="noise-calibration"]',
          popover: {
            title: "校准噪音值",
            description:
              "输入旁置声级计的 dB(A) 读数后，可以手动开始十秒采集。引导不会自动启动麦克风校准。",
            side: "top",
            align: "center",
            onPopoverRender: renderTourPopover,
          },
          onHighlightStarted: composeTourDriverHook(navigationGuard.onHighlightStarted, () => {
            const element = document.querySelector(
              '[data-tour="noise-calibration"]'
            ) as HTMLElement | null;
            element?.scrollIntoView?.({ block: "center", inline: "nearest", behavior: "smooth" });
          }),
        },
        {
          element: "#settings-save-btn",
          popover: {
            title: "保存设置",
            description: "点击“下一步”自动保存设置并返回自习页面，然后继续教您打开历史记录。",
            side: "top",
            align: "end",
            onPopoverRender: renderTourPopover,
            onNextClick: navigationGuard.createAutoNextClick({
              check: () => !isSettingsPanelOpen(),
              action: () => tryClickElement("#settings-save-btn"),
            }),
          },
        },
        {
          element: '[data-tour="noise-monitor"]',
          popover: {
            title: "打开历史记录",
            description: "看见这个会变色呼吸灯了吗，点击它就可以打开历史记录管理页面了。",
            side: "right",
            align: "center",
            onPopoverRender: renderTourPopover,
            onNextClick: navigationGuard.createAutoNextClick({
              check: isNoiseHistoryModalOpen,
              action: () => {
                const clicked = tryClickElement('[data-tour="noise-history-trigger"]');
                if (!clicked) {
                  tryClickElement('[data-tour="noise-monitor"]');
                }
              },
            }),
          },
          onHighlightStarted: composeTourDriverHook(navigationGuard.onHighlightStarted, () => {
            options?.onStart?.();
          }),
        },
        {
          element: '[data-tour="noise-history-modal"]',
          popover: {
            title: "历史记录管理",
            description:
              "这里可以查看最近保存天数内的噪音历史，这里有目前最先进的噪音分析报告。但如果你是新用户你应该还没有任何数据。",
            side: "left",
            align: "center",
          },
        },
        {
          element: '[data-tour="noise-history-close"]',
          popover: {
            title: "退出历史界面",
            description: "点击“下一步”自动关闭历史记录弹窗并返回自习页面。",
            side: "left",
            align: "end",
            onPopoverRender: renderTourPopover,
            onNextClick: navigationGuard.createAutoNextClick({
              check: () => !isNoiseHistoryModalOpen(),
              action: () => tryClickElement('[data-tour="noise-history-close"]'),
            }),
          },
        },
        {
          popover: {
            title: "完成新手指引",
            description: "您已完成新手指引，感谢使用沉浸式时钟！",
            side: "left",
            align: "center",
            onNextClick: navigationGuard.guardAction((_el, _step, opts) => {
              if (isDoneClicked) return;
              isDoneClicked = true;
              opts.driver.destroy();
            }),
          },
        },
      ],
      onDestroyed: () => {
        navigationGuard.dispose();
        if (currentDriver !== driverObj) return;
        closeIconRoot?.unmount();
        closeIconRoot = null;
        markTourAsSeen();
        currentDriver = null;
        options?.onEnd?.();
        if (isDoneClicked) {
          window.dispatchEvent(new Event("tour:completed"));
        }
        // 派发全局事件通知指引结束
        window.dispatchEvent(new Event("tour:end"));
      },
    });

    currentDriver = driverObj;
    driverObj.drive();
  } finally {
    isTourStarting = false;
  }
};
