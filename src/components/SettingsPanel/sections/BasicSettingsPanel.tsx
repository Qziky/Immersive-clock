import {
  BookOpen,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Eye,
  FileText,
  Image as ImageIcon,
  Palette,
  RotateCw,
  TimerReset,
  Type,
  Upload,
  Wifi,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";

import { useAppDispatch, useAppState } from "../../../contexts/AppContext";
import { AppMode, CountdownItem } from "../../../types";
import {
  Button as FormButton,
  Dropdown,
  FormSection,
  InfoPanel,
  Inline as FormButtonGroup,
  Input as FormFilePicker,
  Input as FormInput,
  MetricCard,
  RadioGroup as FormSegmented,
  SettingGrid,
  SettingItem,
  Slider as FormSlider,
  StatusPill,
  Switch as FormSwitch,
} from "../../../ui";
import {
  getAppSettings,
  updateGeneralSettings,
  updateStudySettings,
  updateTimeSyncSettings,
} from "../../../utils/appSettings";
import { resolveStartupMode } from "../../../utils/startupMode";
import { readStudyBackground, saveStudyBackground } from "../../../utils/studyBackgroundStorage";
import {
  ImportedFontMeta,
  importFontFile,
  loadImportedFonts,
} from "../../../utils/studyFontStorage";
import ScheduleSettings from "../../ScheduleSettings";
import styles from "../SettingsPanel.module.css";

import { CountdownManagerPanel } from "./CountdownManagerPanel";

/**
 * 基础设置分段组件的属性
 * - `targetYear`：目标高考年份
 * - `onTargetYearChange`：更新目标年份的回调
 */
export interface BasicSettingsPanelProps {
  targetYear: number;
  onTargetYearChange: (year: number) => void;
  onRegisterSave?: (fn: () => void) => void;
  section?: BasicSettingsSection;
}

export type BasicSettingsSection =
  | "startup"
  | "display"
  | "countdown"
  | "colors"
  | "fonts"
  | "background"
  | "timeSync"
  | "schedule";

/**
 * 基础设置分段组件
 * - 倒计时类型与目标年份/自定义事件设置
 * - 自习组件显示开关（时间始终显示）
 * - 背景设置
 * - 课表设置入口
 */
export const BasicSettingsPanel: React.FC<BasicSettingsPanelProps> = ({
  targetYear,
  onTargetYearChange,
  onRegisterSave,
  section,
}) => {
  const { study } = useAppState();
  const dispatch = useAppDispatch();

  const [startupMode, setStartupMode] = useState<AppMode>("clock");

  // 倒计时模式（重构）：'gaokao' | 'single' | 'multi'
  const [countdownMode, setCountdownMode] = useState<"gaokao" | "single" | "multi">("gaokao");

  // 倒计时设置草稿（保留兼容字段）
  const [draftCustomName, setDraftCustomName] = useState<string>(study.customName ?? "");
  const [draftCustomDate, setDraftCustomDate] = useState<string>(study.customDate ?? "");
  const [singleBgColor, setSingleBgColor] = useState<string>("");
  const [singleTextColor, setSingleTextColor] = useState<string>("");
  // 新增：轮播间隔（秒）与倒计时数字颜色（全局覆盖）
  const [carouselIntervalSec, setCarouselIntervalSec] = useState<number>(
    study.carouselIntervalSec ?? 6
  );
  const [digitColor, setDigitColor] = useState<string>(study.digitColor ?? "");
  const [timeColorMode, setTimeColorMode] = useState<"default" | "custom">(
    study.timeColor ? "custom" : "default"
  );
  const [timeColor, setTimeColor] = useState<string>(study.timeColor ?? "#ffffff");
  const [dateColorMode, setDateColorMode] = useState<"default" | "custom">(
    study.dateColor ? "custom" : "default"
  );
  const [dateColor, setDateColor] = useState<string>(study.dateColor ?? "#bbbbbb");

  // 自习组件显示草稿（时间始终显示，不提供开关）
  const defaultDisplay = useMemo(
    () => ({
      showStatusBar: true,
      showNoiseMonitor: true,
      showCountdown: true,
      showQuote: true,
      showTime: true,
      showDate: true,
    }),
    []
  );
  const [draftDisplay, setDraftDisplay] = useState<typeof defaultDisplay>({
    ...(study.display || defaultDisplay),
  });

  // 背景设置草稿
  const [bgType, setBgType] = useState<"default" | "color" | "image">("default");
  const [bgColor, setBgColor] = useState<string>("#121212");
  const [bgAlpha, setBgAlpha] = useState<number>(1);
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [bgImageFileName, setBgImageFileName] = useState<string>("");

  // 课表设置弹窗
  const [scheduleOpen, setScheduleOpen] = useState<boolean>(false);

  // 子分区保存注册
  const countdownSaveRef = React.useRef<() => void>(() => {});

  // 单事件颜色透明度草稿
  const [singleBgOpacity, setSingleBgOpacity] = useState<number>(0);
  const [singleTextOpacity, setSingleTextOpacity] = useState<number>(1);
  // 全局数字透明度草稿
  const [digitOpacity, setDigitOpacity] = useState<number>(1);
  const [countdownStyleMode, setCountdownStyleMode] = useState<"default" | "custom">("default");
  // 字体设置草稿（来源分段：默认 / 自定义字体）
  const [numericFontMode, setNumericFontMode] = useState<"default" | "custom">("default");
  const [textFontMode, setTextFontMode] = useState<"default" | "custom">("default");
  const [importedFonts, setImportedFonts] = useState<ImportedFontMeta[]>([]);
  const [numericFontSelected, setNumericFontSelected] = useState<string>("");
  const [textFontSelected, setTextFontSelected] = useState<string>("");
  const [fontFile, setFontFile] = useState<File | null>(null);
  const [fontAlias, setFontAlias] = useState<string>("");
  const [systemFonts, setSystemFonts] = useState<{ label: string; value: string }[]>([]);
  const [systemFontSupported, setSystemFontSupported] = useState<boolean>(false);
  const [loadingSystemFonts, setLoadingSystemFonts] = useState<boolean>(false);

  const isDesktop = useMemo(() => {
    if (typeof window === "undefined") return false;
    const anyWindow = window as unknown as { electronAPI?: { platform?: string } };
    const hasBridge = typeof anyWindow.electronAPI?.platform === "string";
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const isElectronUa = /\bElectron\b/i.test(ua);
    return hasBridge || isElectronUa;
  }, []);

  const ntpAvailable = useMemo(() => {
    if (typeof window === "undefined") return false;
    const anyWindow = window as unknown as { electronAPI?: { timeSync?: { ntp?: unknown } } };
    return typeof anyWindow.electronAPI?.timeSync?.ntp === "function";
  }, []);

  const [timeSyncEnabled, setTimeSyncEnabled] = useState<boolean>(false);
  const [timeSyncProvider, setTimeSyncProvider] = useState<"httpDate" | "timeApi" | "ntp">(
    "httpDate"
  );
  const [timeSyncHttpDateUrl, setTimeSyncHttpDateUrl] = useState<string>("/");
  const [timeSyncApiUrl, setTimeSyncApiUrl] = useState<string>("");
  const [timeSyncNtpHost, setTimeSyncNtpHost] = useState<string>("pool.ntp.org");
  const [timeSyncNtpPort, setTimeSyncNtpPort] = useState<number>(123);
  const [timeSyncManualOffsetSec, setTimeSyncManualOffsetSec] = useState<number>(0);
  const [timeSyncAutoEnabled, setTimeSyncAutoEnabled] = useState<boolean>(false);
  const [timeSyncAutoIntervalMin, setTimeSyncAutoIntervalMin] = useState<number>(60);
  const [timeSyncStatus, setTimeSyncStatus] = useState(getAppSettings().general.timeSync);

  // 打开时优先从 AppSettings 读取上次选择的倒计时模式
  useEffect(() => {
    try {
      setStartupMode(resolveStartupMode(getAppSettings().general.startup.initialMode));
      const saved = getAppSettings().study.countdownMode;
      if (saved === "gaokao" || saved === "single" || saved === "multi") {
        setCountdownMode(saved);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      const saved = getAppSettings().general.timeSync;
      const provider =
        saved.provider === "timeApi" || saved.provider === "httpDate" || saved.provider === "ntp"
          ? saved.provider
          : "httpDate";
      const providerAllowed = provider !== "ntp" || ntpAvailable;

      setTimeSyncEnabled(!!saved.enabled && providerAllowed);
      setTimeSyncProvider(providerAllowed ? provider : "httpDate");
      setTimeSyncHttpDateUrl(typeof saved.httpDateUrl === "string" ? saved.httpDateUrl : "/");
      setTimeSyncApiUrl(typeof saved.timeApiUrl === "string" ? saved.timeApiUrl : "");
      setTimeSyncNtpHost(typeof saved.ntpHost === "string" ? saved.ntpHost : "pool.ntp.org");
      setTimeSyncNtpPort(Number.isFinite(saved.ntpPort) ? Math.trunc(saved.ntpPort) : 123);
      setTimeSyncManualOffsetSec(
        Number.isFinite(saved.manualOffsetMs) ? Math.trunc(saved.manualOffsetMs) / 1000 : 0
      );
      setTimeSyncAutoEnabled(!!saved.autoSyncEnabled);
      setTimeSyncAutoIntervalMin(
        Number.isFinite(saved.autoSyncIntervalSec)
          ? Math.max(1, Math.round(saved.autoSyncIntervalSec / 60))
          : 60
      );
      setTimeSyncStatus(saved);
    } catch {}
  }, [ntpAvailable]);

  useEffect(() => {
    const refresh = () => {
      try {
        setTimeSyncStatus(getAppSettings().general.timeSync);
      } catch {}
    };
    refresh();
    window.addEventListener("timeSync:updated", refresh as EventListener);
    window.addEventListener("settingsSaved", refresh as EventListener);
    return () => {
      window.removeEventListener("timeSync:updated", refresh as EventListener);
      window.removeEventListener("settingsSaved", refresh as EventListener);
    };
  }, []);

  // 独立加载字体列表
  useEffect(() => {
    loadImportedFonts().then(setImportedFonts);
  }, []);

  /**
   * 探测当前环境是否支持本地字体读取（函数级注释：检查浏览器是否提供 queryLocalFonts 接口，用于后续系统字体列表的读取）
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const anyWindow = window as unknown as { queryLocalFonts?: () => Promise<unknown[]> };
    setSystemFontSupported(typeof anyWindow.queryLocalFonts === "function");
  }, []);

  useEffect(() => {
    // 同步草稿为当前应用状态（打开面板或刷新时）

    setDraftCustomName(study.customName ?? "");
    setDraftCustomDate(study.customDate ?? "");
    setDraftDisplay({ ...(study.display || defaultDisplay), showTime: true });
    // 背景设置
    const bg = readStudyBackground();
    setBgType(bg.type);
    if (bg.color) setBgColor(bg.color);
    setBgAlpha(typeof bg.colorAlpha === "number" ? bg.colorAlpha : 1);
    setBgImage(bg.imageDataUrl ?? null);
    setBgImageFileName("");

    const nextDigitColor = study.digitColor ?? "";
    setDigitColor(nextDigitColor);

    // 根据现有 countdownItems 推断模式，并填充单项颜色
    const items = study.countdownItems || [];
    let nextSingleBgColor = "";
    let nextSingleTextColor = "";
    let nextSingleBgOpacity = 0;
    let nextSingleTextOpacity = 1;
    if (Array.isArray(items) && items.length > 1) {
      setCountdownMode("multi");
      setSingleBgColor(nextSingleBgColor);
      setSingleTextColor(nextSingleTextColor);
      setSingleBgOpacity(nextSingleBgOpacity);
      setSingleTextOpacity(nextSingleTextOpacity);
    } else if (Array.isArray(items) && items.length === 1) {
      const it = items[0];
      if (it.kind === "gaokao") {
        setCountdownMode("gaokao");
        nextSingleBgColor = it.bgColor || "";
        nextSingleTextColor = it.textColor || "";
        nextSingleBgOpacity = typeof it.bgOpacity === "number" ? it.bgOpacity : 0;
        nextSingleTextOpacity = typeof it.textOpacity === "number" ? it.textOpacity : 1;
        setSingleBgColor(nextSingleBgColor);
        setSingleTextColor(nextSingleTextColor);
        setSingleBgOpacity(nextSingleBgOpacity);
        setSingleTextOpacity(nextSingleTextOpacity);
        // 名称可编辑但不需要日期
        setDraftCustomName(it.name || "");
        setDraftCustomDate("");
      } else {
        setCountdownMode("single");
        setDraftCustomName(it.name || study.customName || "");
        setDraftCustomDate(it.targetDate || study.customDate || "");
        nextSingleBgColor = it.bgColor || "";
        nextSingleTextColor = it.textColor || "";
        nextSingleBgOpacity = typeof it.bgOpacity === "number" ? it.bgOpacity : 0;
        nextSingleTextOpacity = typeof it.textOpacity === "number" ? it.textOpacity : 1;
        setSingleBgColor(nextSingleBgColor);
        setSingleTextColor(nextSingleTextColor);
        setSingleBgOpacity(nextSingleBgOpacity);
        setSingleTextOpacity(nextSingleTextOpacity);
      }
    } else {
      // 兼容旧逻辑：无 items 时用 countdownType 决定模式
      setCountdownMode((study.countdownType ?? "gaokao") === "gaokao" ? "gaokao" : "single");
      setSingleBgColor(nextSingleBgColor);
      setSingleTextColor(nextSingleTextColor);
      setSingleBgOpacity(nextSingleBgOpacity);
      setSingleTextOpacity(nextSingleTextOpacity);
    }
    const nextDigitOpacity = typeof study.digitOpacity === "number" ? study.digitOpacity : 1;
    setDigitOpacity(nextDigitOpacity);
    const hasCountdownCustomStyle =
      nextDigitColor.trim().length > 0 ||
      nextDigitOpacity !== 1 ||
      nextSingleBgColor.trim().length > 0 ||
      nextSingleTextColor.trim().length > 0 ||
      nextSingleBgOpacity !== 0 ||
      nextSingleTextOpacity !== 1;
    setCountdownStyleMode(hasCountdownCustomStyle ? "custom" : "default");
    setTimeColorMode(study.timeColor ? "custom" : "default");
    setTimeColor(study.timeColor ?? "#ffffff");
    setDateColorMode(study.dateColor ? "custom" : "default");
    setDateColor(study.dateColor ?? "#bbbbbb");
    // 初始化字体来源分段（函数级注释：根据当前状态决定使用默认或自定义字体，并填充自定义内容）
    const initMode = (
      current: string | undefined
    ): { mode: "default" | "custom"; custom: string } => {
      if (!current || current.trim().length === 0) return { mode: "default", custom: "" };
      return { mode: "custom", custom: current };
    };
    const nf = initMode(study.numericFontFamily);
    const tf = initMode(study.textFontFamily);
    setNumericFontMode(nf.mode);
    setTextFontMode(tf.mode);

    // 异步加载字体列表
    loadImportedFonts().then(setImportedFonts);

    setNumericFontSelected(nf.custom);
    setTextFontSelected(tf.custom);
  }, [
    study.countdownType,
    study.customName,
    study.customDate,
    study.display,
    defaultDisplay,
    study.countdownItems,
    study.digitColor,
    study.digitOpacity,
    study.timeColor,
    study.dateColor,
    study.numericFontFamily,
    study.textFontFamily,
  ]);

  // 注册保存动作：统一在父组件保存时派发
  useEffect(() => {
    onRegisterSave?.(() => {
      // 倒计时模式映射到旧字段：多事件作为自定义类型
      const nextType: "gaokao" | "custom" = countdownMode === "gaokao" ? "gaokao" : "custom";
      dispatch({ type: "SET_COUNTDOWN_TYPE", payload: nextType });

      // 单事件时更新旧字段（用于兼容回退显示）
      if (countdownMode === "single") {
        dispatch({
          type: "SET_CUSTOM_COUNTDOWN",
          payload: { name: draftCustomName, date: draftCustomDate },
        });
      }

      // 保存组件显示设置（强制时间显示）
      dispatch({ type: "SET_STUDY_DISPLAY", payload: { ...draftDisplay, showTime: true } });
      // 保存轮播间隔与数字颜色（多事件不再统一修改数字颜色）
      if (countdownMode === "multi") {
        dispatch({ type: "SET_CAROUSEL_INTERVAL", payload: carouselIntervalSec });
      } else {
        dispatch({
          type: "SET_COUNTDOWN_DIGIT_COLOR",
          payload: countdownStyleMode === "custom" ? digitColor || undefined : undefined,
        });
        dispatch({
          type: "SET_COUNTDOWN_DIGIT_OPACITY",
          payload: countdownStyleMode === "custom" ? digitOpacity : 1,
        });
      }
      dispatch({
        type: "SET_STUDY_TIME_COLOR",
        payload: timeColorMode === "custom" ? timeColor : undefined,
      });
      dispatch({
        type: "SET_STUDY_DATE_COLOR",
        payload: dateColorMode === "custom" ? dateColor : undefined,
      });
      // 保存背景设置
      saveStudyBackground({
        type: bgType,
        color: bgType === "color" ? bgColor : undefined,
        colorAlpha: bgType === "color" ? bgAlpha : undefined,
        imageDataUrl: bgType === "image" ? (bgImage ?? undefined) : undefined,
      });
      // 通知学习页面刷新背景
      window.dispatchEvent(new CustomEvent("study-background-updated"));

      // 保存倒计时项目
      if (countdownMode === "gaokao") {
        const one: CountdownItem[] = [
          {
            id: "gaokao-default",
            kind: "gaokao",
            name: "高考倒计时",
            bgColor: countdownStyleMode === "custom" ? singleBgColor || undefined : undefined,
            bgOpacity: countdownStyleMode === "custom" ? singleBgOpacity : 0,
            textColor: countdownStyleMode === "custom" ? singleTextColor || undefined : undefined,
            textOpacity: countdownStyleMode === "custom" ? singleTextOpacity : 1,
            order: 0,
          },
        ];
        dispatch({ type: "SET_COUNTDOWN_ITEMS", payload: one });
      } else if (countdownMode === "single") {
        const one: CountdownItem[] = [
          {
            id: "custom-default",
            kind: "custom",
            name: (draftCustomName && draftCustomName.trim()) || "自定义事件",
            targetDate: (draftCustomDate && draftCustomDate.trim()) || "",
            bgColor: countdownStyleMode === "custom" ? singleBgColor || undefined : undefined,
            bgOpacity: countdownStyleMode === "custom" ? singleBgOpacity : 0,
            textColor: countdownStyleMode === "custom" ? singleTextColor || undefined : undefined,
            textOpacity: countdownStyleMode === "custom" ? singleTextOpacity : 1,
            order: 0,
          },
        ];
        dispatch({ type: "SET_COUNTDOWN_ITEMS", payload: one });
      } else {
        // 多事件：由子面板负责收集并保存
        countdownSaveRef.current?.();
      }
      // 记录最近启用的模式，确保下次打开直接显示
      try {
        updateStudySettings({ countdownMode });
      } catch {}

      // 保存字体设置（函数级注释：根据选择与自定义输入计算最终的 font-family 并派发到全局状态）
      const resolveFont = (mode: "default" | "custom", selected: string): string | undefined => {
        if (mode === "default") return undefined;
        const v = selected.trim();
        return v.length > 0 ? v : undefined;
      };
      const nextNumeric = resolveFont(numericFontMode, numericFontSelected);
      const nextText = resolveFont(textFontMode, textFontSelected);
      dispatch({ type: "SET_STUDY_NUMERIC_FONT", payload: nextNumeric });
      dispatch({ type: "SET_STUDY_TEXT_FONT", payload: nextText });

      updateGeneralSettings({ startup: { initialMode: startupMode } });

      updateTimeSyncSettings((current) => ({
        enabled: timeSyncEnabled,
        provider: timeSyncProvider,
        httpDateUrl: timeSyncHttpDateUrl.trim() || current.httpDateUrl,
        timeApiUrl: timeSyncApiUrl.trim(),
        ntpHost: timeSyncNtpHost.trim() || current.ntpHost,
        ntpPort: Math.max(1, Math.min(65535, Math.trunc(timeSyncNtpPort || 123))),
        manualOffsetMs: Math.round(
          (Number.isFinite(timeSyncManualOffsetSec) ? timeSyncManualOffsetSec : 0) * 1000
        ),
        autoSyncEnabled: timeSyncAutoEnabled,
        autoSyncIntervalSec: Math.max(
          60,
          Math.round((Number.isFinite(timeSyncAutoIntervalMin) ? timeSyncAutoIntervalMin : 60) * 60)
        ),
      }));
    });
  }, [
    onRegisterSave,
    countdownMode,
    draftCustomName,
    draftCustomDate,
    draftDisplay,
    carouselIntervalSec,
    digitColor,
    digitOpacity,
    countdownStyleMode,
    timeColorMode,
    timeColor,
    dateColorMode,
    dateColor,
    bgType,
    bgColor,
    bgAlpha,
    bgImage,
    singleBgColor,
    singleTextColor,
    singleBgOpacity,
    singleTextOpacity,
    dispatch,
    numericFontMode,
    numericFontSelected,
    textFontMode,
    textFontSelected,
    startupMode,
    timeSyncEnabled,
    timeSyncProvider,
    timeSyncHttpDateUrl,
    timeSyncApiUrl,
    timeSyncNtpHost,
    timeSyncNtpPort,
    timeSyncManualOffsetSec,
    timeSyncAutoEnabled,
    timeSyncAutoIntervalMin,
  ]);

  /** 构建字体选择列表（函数级注释：合并已导入字体与内置字体，供下拉选择使用） */
  const builtInNumericFonts = useMemo(
    () => [
      { label: "Roboto Mono", value: "'Roboto Mono', monospace" },
      { label: "JetBrains Mono", value: "'JetBrains Mono', monospace" },
      { label: "Source Code Pro", value: "'Source Code Pro', monospace" },
      { label: "SFMono-Regular", value: "'SFMono-Regular', monospace" },
      { label: "Consolas", value: "Consolas, monospace" },
      { label: "Menlo", value: "Menlo, monospace" },
      { label: "Cascadia Mono", value: "'Cascadia Mono', monospace" },
    ],
    []
  );
  const builtInTextFonts = useMemo(
    () => [
      { label: "Inter", value: "'Inter', sans-serif" },
      { label: "Segoe UI", value: "'Segoe UI', sans-serif" },
      { label: "Microsoft YaHei", value: "'Microsoft YaHei', sans-serif" },
      { label: "PingFang SC", value: "'PingFang SC', sans-serif" },
      { label: "Noto Sans SC", value: "'Noto Sans SC', sans-serif" },
      { label: "Noto Serif SC", value: "'Noto Serif SC', serif" },
      { label: "Helvetica Neue", value: "'Helvetica Neue', sans-serif" },
      { label: "Arial", value: "Arial, sans-serif" },
      { label: "system-ui", value: "system-ui, sans-serif" },
    ],
    []
  );

  /** 导入字体文件（函数级注释：读取所选字体文件为DataURL并保存为指定家族名） */
  const handleImportFont = async () => {
    if (!fontFile) {
      alert("请选择要导入的字体文件（TTF/OTF/WOFF/WOFF2）");
      return;
    }
    const family =
      (fontAlias && fontAlias.trim()) || fontFile.name.replace(/\.(ttf|otf|woff2?|)$/i, "");
    try {
      await importFontFile(fontFile, family);
      const fonts = await loadImportedFonts();
      setImportedFonts(fonts);
      alert(`已导入字体：${family}`);
      setFontFile(null);
      setFontAlias("");
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : typeof error === "string" ? error : "未知错误";
      alert(`导入字体失败：${message}`);
    }
  };

  /**
   * 读取系统已安装字体列表（函数级注释：通过浏览器的 queryLocalFonts 接口请求本机字体家族名，并转换为下拉选项供选择）
   */
  const handleLoadSystemFonts = async () => {
    if (typeof window === "undefined") {
      alert("当前环境不支持读取系统字体");
      return;
    }
    const anyWindow = window as unknown as {
      queryLocalFonts?: () => Promise<
        {
          family?: string;
        }[]
      >;
    };
    if (typeof anyWindow.queryLocalFonts !== "function") {
      alert("当前浏览器不支持直接读取系统字体，请使用导入字体或手动输入字体名称。");
      return;
    }
    try {
      setLoadingSystemFonts(true);
      const fonts = await anyWindow.queryLocalFonts();
      const seen = new Set<string>();
      const options: { label: string; value: string }[] = [];
      for (const f of fonts) {
        const rawFamily = typeof f?.family === "string" ? f.family.trim() : "";
        if (!rawFamily || seen.has(rawFamily)) continue;
        seen.add(rawFamily);
        const safeFamily = rawFamily.replace(/"/g, '\\"');
        options.push({
          label: rawFamily,
          value: `"${safeFamily}"`,
        });
      }
      options.sort((a, b) => a.label.localeCompare(b.label, "zh-Hans-CN"));
      setSystemFonts(options);
      if (options.length === 0) {
        alert("未能从系统中读取到可用字体，请检查浏览器权限设置。");
      } else {
        alert(`已读取到 ${options.length} 个系统字体，可在下拉列表中选择。`);
      }
    } catch (error: unknown) {
      console.error("Failed to load system fonts:", error);
      const message =
        error instanceof Error ? error.message : typeof error === "string" ? error : "未知错误";
      alert(`读取系统字体失败：${message}`);
    } finally {
      setLoadingSystemFonts(false);
    }
  };

  const renderCountdownStyleControls = () => (
    <SettingGrid columns={2}>
      <SettingItem
        icon={<Palette size={18} />}
        title="背景色"
        description="为倒计时块设置独立背景颜色。"
      >
        <FormInput
          label="选择颜色"
          type="color"
          value={singleBgColor || "#121212"}
          onChange={(e) => setSingleBgColor(e.target.value)}
        />
      </SettingItem>
      <SettingItem
        icon={<Palette size={18} />}
        title="背景透明度"
        description="控制背景覆盖强度，0% 表示透明。"
        tone="info"
      >
        <FormSlider
          label="透明度"
          min={0}
          max={1}
          step={0.01}
          value={singleBgOpacity}
          onChange={(v) => setSingleBgOpacity(v)}
          formatValue={(v) => `${Math.round(v * 100)}%`}
        />
      </SettingItem>
      <SettingItem
        icon={<Type size={18} />}
        title="文字色"
        description="用于倒计时名称和说明文字。"
      >
        <FormInput
          label="选择颜色"
          type="color"
          value={singleTextColor || "#E0E0E0"}
          onChange={(e) => setSingleTextColor(e.target.value)}
        />
      </SettingItem>
      <SettingItem
        icon={<Type size={18} />}
        title="文字透明度"
        description="降低文字存在感或保持清晰可读。"
        tone="info"
      >
        <FormSlider
          label="透明度"
          min={0}
          max={1}
          step={0.01}
          value={singleTextOpacity}
          onChange={(v) => setSingleTextOpacity(v)}
          formatValue={(v) => `${Math.round(v * 100)}%`}
        />
      </SettingItem>
      <SettingItem
        icon={<TimerReset size={18} />}
        title="数字颜色"
        description="用于天数和时间数字。"
        tone="accent"
      >
        <FormInput
          label="选择颜色"
          type="color"
          value={digitColor || "#03DAC6"}
          onChange={(e) => setDigitColor(e.target.value)}
        />
      </SettingItem>
      <SettingItem
        icon={<TimerReset size={18} />}
        title="数字透明度"
        description="控制倒计时数字的显示强度。"
        tone="accent"
      >
        <FormSlider
          label="透明度"
          min={0}
          max={1}
          step={0.01}
          value={digitOpacity}
          onChange={(v) => setDigitOpacity(v)}
          formatValue={(v) => `${Math.round(v * 100)}%`}
        />
      </SettingItem>
    </SettingGrid>
  );

  const timeSyncProviderLabel =
    timeSyncProvider === "httpDate" ? "HTTP Date" : timeSyncProvider === "timeApi" ? "时间 API" : "NTP";
  const timeSyncOffsetText = timeSyncStatus?.enabled
    ? `${Math.trunc((timeSyncStatus.offsetMs || 0) + (timeSyncStatus.manualOffsetMs || 0))} ms`
    : "未启用";
  const timeSyncLastText = timeSyncStatus?.lastSyncAt
    ? new Date(timeSyncStatus.lastSyncAt).toLocaleString("zh-CN")
    : "无";
  const isSectionHidden = (candidate: BasicSettingsSection) =>
    section ? section !== candidate : undefined;

  return (
    <div id="basic-panel" role="tabpanel" aria-labelledby="basic">
      {/* 显示设置分区已前移到倒计时设置之前 */}

      <FormSection title="启动设置" hidden={isSectionHidden("startup")}>
        <SettingItem
          icon={<Clock3 size={18} />}
          title="启动时默认页面"
          description="该设置将在下次启动或刷新页面后生效。"
          tone="accent"
        >
          <FormSegmented
            value={startupMode}
            options={[
              { label: "时钟", value: "clock" },
              { label: "倒计时", value: "countdown" },
              { label: "秒表", value: "stopwatch" },
              { label: "自习", value: "study" },
            ]}
            onChange={(v) => setStartupMode(v as AppMode)}
          />
        </SettingItem>
      </FormSection>

      {/* 倒计时设置 */}
      <FormSection
        title="倒计时设置"
        description="配置自习页面的倒计时来源、轮播和局部样式。"
        hidden={isSectionHidden("countdown")}
      >
        <SettingItem
          icon={<TimerReset size={18} />}
          title="倒计时模式"
          description="选择自习页面的倒计时来源与展示方式。"
          tone="info"
        >
          <FormSegmented
            value={countdownMode}
            options={[
              { label: "高考", value: "gaokao" },
              { label: "单事件", value: "single" },
              { label: "多事件", value: "multi" },
            ]}
            onChange={(v) => setCountdownMode(v as "gaokao" | "single" | "multi")}
          />
        </SettingItem>

        {countdownMode === "multi" && (
          <SettingItem
            icon={<RotateCw size={18} />}
            title="轮播间隔"
            description="多事件模式下，每个倒计时项目停留的时间。"
            tone="accent"
          >
            <FormSlider
              label="轮播间隔"
              min={1}
              max={60}
              step={1}
              value={carouselIntervalSec}
              onChange={(v) => setCarouselIntervalSec(Math.round(v))}
              formatValue={(v) => `${Math.round(v)} 秒`}
              rangeLabels={[`1 秒`, `60 秒`]}
            />
          </SettingItem>
        )}

        {countdownMode === "gaokao" && (
          <>
            <InfoPanel tone="neutral" title="自动目标">
              使用高考日期（6月7日）自动计算，目标年份保存后即时应用到倒计时。
            </InfoPanel>
            <SettingGrid columns={2}>
              <SettingItem
                icon={<CalendarClock size={18} />}
                title="目标年份"
                description="用于计算下一次高考倒计时。"
              >
                <FormInput
                  label="年份"
                  type="number"
                  variant="number"
                  value={String(targetYear)}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!Number.isNaN(v)) onTargetYearChange?.(v);
                  }}
                  min={1900}
                  max={2100}
                  step={1}
                  placeholder="例如 2026"
                />
              </SettingItem>
              <SettingItem
                icon={<Palette size={18} />}
                title="样式模式"
                description="默认跟随主题，自定义可覆盖颜色与透明度。"
                tone="accent"
              >
                <FormSegmented
                  value={countdownStyleMode}
                  options={[
                    { label: "默认", value: "default" },
                    { label: "自定义", value: "custom" },
                  ]}
                  onChange={(v) => setCountdownStyleMode(v as "default" | "custom")}
                />
              </SettingItem>
            </SettingGrid>
            {countdownStyleMode === "custom" && renderCountdownStyleControls()}
          </>
        )}

        {countdownMode === "single" && (
          <>
            <SettingGrid columns={2}>
              <SettingItem
                icon={<FileText size={18} />}
                title="事件名称"
                description="显示在自习页倒计时标题处。"
              >
                <FormInput
                  label="名称"
                  type="text"
                  value={draftCustomName}
                  onChange={(e) => setDraftCustomName(e.target.value)}
                  placeholder="例如：期末考试"
                />
              </SettingItem>
              <SettingItem
                icon={<CalendarDays size={18} />}
                title="事件日期"
                description="用于计算剩余天数。"
              >
                <FormInput
                  label="日期"
                  type="date"
                  value={draftCustomDate}
                  onChange={(e) => setDraftCustomDate(e.target.value)}
                />
              </SettingItem>
              <SettingItem
                icon={<Palette size={18} />}
                title="样式模式"
                description="默认跟随主题，自定义可覆盖颜色与透明度。"
                tone="accent"
              >
                <FormSegmented
                  value={countdownStyleMode}
                  options={[
                    { label: "默认", value: "default" },
                    { label: "自定义", value: "custom" },
                  ]}
                  onChange={(v) => setCountdownStyleMode(v as "default" | "custom")}
                />
              </SettingItem>
            </SettingGrid>
            {countdownStyleMode === "custom" && renderCountdownStyleControls()}
          </>
        )}

        {countdownMode === "multi" && (
          <CountdownManagerPanel
            onRegisterSave={(fn) => {
              countdownSaveRef.current = fn;
            }}
          />
        )}
      </FormSection>

      <FormSection
        title="显示设置"
        description="选择自习页面显示的组件，时间始终显示。"
        hidden={isSectionHidden("display")}
      >
        <SettingGrid columns={2}>
          <SettingItem
            icon={<Eye size={18} />}
            title="状态栏"
            description="显示顶部学习状态与辅助信息。"
            control={
              <FormSwitch
                checked={!!draftDisplay.showStatusBar}
                onCheckedChange={(checked) =>
                  setDraftDisplay((prev) => ({ ...prev, showStatusBar: checked }))
                }
                aria-label="状态栏"
              />
            }
          />
          <SettingItem
            icon={<Eye size={18} />}
            title="噪音监测"
            description="显示实时噪音状态与分贝信息。"
            control={
              <FormSwitch
                id="tour-noise-monitor-checkbox"
                checked={!!draftDisplay.showNoiseMonitor}
                onCheckedChange={(checked) =>
                  setDraftDisplay((prev) => ({ ...prev, showNoiseMonitor: checked }))
                }
                aria-label="噪音监测"
              />
            }
          />
          <SettingItem
            icon={<TimerReset size={18} />}
            title="倒计时"
            description="在自习页显示高考或自定义事件倒计时。"
            control={
              <FormSwitch
                checked={!!draftDisplay.showCountdown}
                onCheckedChange={(checked) =>
                  setDraftDisplay((prev) => ({ ...prev, showCountdown: checked }))
                }
                aria-label="倒计时"
              />
            }
          />
          <SettingItem
            icon={<FileText size={18} />}
            title="励志语录"
            description="显示语录渠道生成的提示文本。"
            control={
              <FormSwitch
                checked={!!draftDisplay.showQuote}
                onCheckedChange={(checked) =>
                  setDraftDisplay((prev) => ({ ...prev, showQuote: checked }))
                }
                aria-label="励志语录"
              />
            }
          />
          <SettingItem
            icon={<CalendarDays size={18} />}
            title="日期"
            description="在中央时间下方显示当前日期。"
            control={
              <FormSwitch
                checked={!!draftDisplay.showDate}
                onCheckedChange={(checked) =>
                  setDraftDisplay((prev) => ({ ...prev, showDate: checked }))
                }
                aria-label="日期"
              />
            }
          />
        </SettingGrid>
      </FormSection>

      <FormSection
        title="时间与日期颜色"
        description="为自习页面中央时间与日期单独设置颜色，默认跟随主题。"
        hidden={isSectionHidden("colors")}
      >
        <SettingGrid columns={2}>
          <SettingItem icon={<Palette size={18} />} title="时间颜色" tone="accent">
            <FormSegmented
              value={timeColorMode}
              options={[
                { label: "默认", value: "default" },
                { label: "自定义", value: "custom" },
              ]}
              onChange={(v) => setTimeColorMode(v as "default" | "custom")}
            />
            {timeColorMode === "custom" && (
              <FormInput
                label="选择颜色"
                type="color"
                value={timeColor || "#ffffff"}
                onChange={(e) => setTimeColor(e.target.value)}
              />
            )}
          </SettingItem>
          <SettingItem icon={<CalendarDays size={18} />} title="日期颜色" tone="info">
            <FormSegmented
              value={dateColorMode}
              options={[
                { label: "默认", value: "default" },
                { label: "自定义", value: "custom" },
              ]}
              onChange={(v) => setDateColorMode(v as "default" | "custom")}
            />
            {dateColorMode === "custom" && (
              <FormInput
                label="选择颜色"
                type="color"
                value={dateColor || "#bbbbbb"}
                onChange={(e) => setDateColor(e.target.value)}
              />
            )}
          </SettingItem>
        </SettingGrid>
      </FormSection>

      <FormSection
        title="字体设置"
        description="分别控制数字与普通文本字体，保存后应用到自习页面。"
        hidden={isSectionHidden("fonts")}
      >
        <SettingGrid columns={2}>
          <SettingItem
            icon={<Type size={18} />}
            title="数字字体"
            description="用于时间、倒计时数字等高识别度内容。"
            tone="accent"
          >
            <FormSegmented
              value={numericFontMode}
              options={[
                { label: "默认", value: "default" },
                { label: "自定义字体", value: "custom" },
              ]}
              onChange={(v) => setNumericFontMode(v as "default" | "custom")}
            />
            {numericFontMode === "custom" && (
              <Dropdown
                label="选择字体"
                placeholder="请选择数字字体"
                value={numericFontSelected}
                onChange={(v) => setNumericFontSelected((v as string) || "")}
                searchable
                groups={[
                  {
                    label: "已导入",
                    options:
                      importedFonts.length > 0
                        ? importedFonts.map((f) => ({ label: f.family, value: f.family }))
                        : [{ label: "暂无已导入字体", value: "__none__", disabled: true }],
                  },
                  {
                    label: "系统字体（实验性）",
                    options:
                      systemFonts.length > 0
                        ? systemFonts
                        : [
                            systemFontSupported
                              ? {
                                  label: loadingSystemFonts
                                    ? "正在读取系统字体..."
                                    : "点击“读取系统字体”按钮后刷新此列表",
                                  value: "__sys_hint__",
                                  disabled: true,
                                }
                              : {
                                  label: "当前浏览器不支持系统字体读取",
                                  value: "__sys_hint__",
                                  disabled: true,
                                },
                          ],
                  },
                  {
                    label: "内置",
                    options: builtInNumericFonts,
                  },
                ]}
              />
            )}
          </SettingItem>

          <SettingItem
            icon={<FileText size={18} />}
            title="文本字体"
            description="用于日期、语录、状态文字等普通文本。"
            tone="info"
          >
            <FormSegmented
              value={textFontMode}
              options={[
                { label: "默认", value: "default" },
                { label: "自定义字体", value: "custom" },
              ]}
              onChange={(v) => setTextFontMode(v as "default" | "custom")}
            />
            {textFontMode === "custom" && (
              <Dropdown
                label="选择字体"
                placeholder="请选择文本字体"
                value={textFontSelected}
                onChange={(v) => setTextFontSelected((v as string) || "")}
                searchable
                groups={[
                  {
                    label: "已导入",
                    options:
                      importedFonts.length > 0
                        ? importedFonts.map((f) => ({ label: f.family, value: f.family }))
                        : [{ label: "暂无已导入字体", value: "__none__", disabled: true }],
                  },
                  {
                    label: "系统字体（实验性）",
                    options:
                      systemFonts.length > 0
                        ? systemFonts
                        : [
                            systemFontSupported
                              ? {
                                  label: loadingSystemFonts
                                    ? "正在读取系统字体..."
                                    : "点击“读取系统字体”按钮后刷新此列表",
                                  value: "__sys_hint__",
                                  disabled: true,
                                }
                              : {
                                  label: "当前浏览器不支持系统字体读取",
                                  value: "__sys_hint__",
                                  disabled: true,
                                },
                          ],
                  },
                  {
                    label: "内置",
                    options: builtInTextFonts,
                  },
                ]}
              />
            )}
          </SettingItem>
        </SettingGrid>

        {(numericFontMode === "custom" || textFontMode === "custom") && (
          <SettingItem
            icon={<Upload size={18} />}
            title="导入与系统字体"
            description="导入本地字体文件，或在支持的浏览器中读取系统字体列表。"
            tone="neutral"
          >
            <SettingGrid columns={2}>
              <FormInput
                label="字体别名"
                type="text"
                value={fontAlias}
                onChange={(e) => setFontAlias(e.target.value)}
                placeholder='例如："JetBrains Mono"'
              />
              <FormFilePicker
                label="字体文件"
                accept=".ttf,.otf,.woff,.woff2"
                fileName={fontFile?.name}
                placeholder="未选择字体文件"
                buttonText="选择字体文件"
                onFileChange={(file) => setFontFile(file)}
              />
            </SettingGrid>
            <FormButtonGroup align="left">
              <FormButton variant="secondary" onClick={handleImportFont}>
                导入字体文件
              </FormButton>
              <FormButton
                variant="secondary"
                onClick={handleLoadSystemFonts}
                disabled={!systemFontSupported || loadingSystemFonts}
              >
                {loadingSystemFonts ? "正在读取系统字体..." : "读取系统字体"}
              </FormButton>
            </FormButtonGroup>
            <InfoPanel tone={systemFontSupported ? "info" : "warning"}>
              系统字体读取基于浏览器 Local Font Access 接口，仅部分 Chromium
              浏览器在安全上下文中支持。
            </InfoPanel>
          </SettingItem>
        )}
      </FormSection>

      {/* 背景设置 */}
      <FormSection
        title="背景设置"
        description="选择自习页面背景来源，支持纯色与本地图片。"
        hidden={isSectionHidden("background")}
      >
        <SettingItem
          icon={<ImageIcon size={18} />}
          title="背景来源"
          description="保存后应用到自习页面，默认模式会回到系统背景。"
          tone="accent"
        >
          <FormSegmented
            value={bgType}
            options={[
              { label: "系统默认", value: "default" },
              { label: "自定义颜色", value: "color" },
              { label: "背景图片", value: "image" },
            ]}
            onChange={(v) => setBgType(v as "default" | "color" | "image")}
          />
        </SettingItem>

        {bgType === "color" && (
          <SettingGrid columns={2}>
            <SettingItem
              icon={<Palette size={18} />}
              title="背景颜色"
              description="支持调色盘或十六进制颜色代码。"
            >
              <SettingGrid columns={2}>
                <FormInput
                  label="调色盘"
                  type="color"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                />
                <FormInput
                  label="颜色代码"
                  type="text"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  placeholder="#121212"
                />
              </SettingGrid>
            </SettingItem>
            <SettingItem
              icon={<Palette size={18} />}
              title="背景透明度"
              description="降低纯色背景的不透明度，让主体信息更轻。"
              tone="info"
            >
              <FormSlider
                label="透明度"
                min={0}
                max={1}
                step={0.01}
                value={bgAlpha}
                onChange={(v) => setBgAlpha(v)}
                formatValue={(v) => `${Math.round(v * 100)}%`}
              />
            </SettingItem>
          </SettingGrid>
        )}

        {bgType === "image" && (
          <SettingItem
            icon={<ImageIcon size={18} />}
            title="背景图片"
            description="选择本地图片作为自习页背景，保存后写入本地缓存。"
          >
            <FormFilePicker
              label="选择图片"
              accept="image/*"
              fileName={bgImageFileName}
              placeholder="未选择图片"
              buttonText="选择图片"
              onFileChange={(file) => {
                if (!file) return;
                setBgImageFileName(file.name);
                const reader = new FileReader();
                reader.onload = () => setBgImage(reader.result as string);
                reader.readAsDataURL(file);
              }}
            />
            {bgImage && (
              <>
                <img className={styles.backgroundPreview} src={bgImage} alt="背景预览" />
                <FormButtonGroup align="left">
                  <FormButton variant="secondary" onClick={() => setBgImage(null)}>
                    移除图片
                  </FormButton>
                </FormButtonGroup>
              </>
            )}
          </SettingItem>
        )}
      </FormSection>

      <FormSection
        title="时间与校时"
        description="按需启用外部时间源，并保留手动偏移修正。"
        hidden={isSectionHidden("timeSync")}
      >
        <SettingItem
          icon={<Wifi size={18} />}
          title="校时来源"
          description="默认跟随本机时间；启用外部来源后会在保存时更新校时配置。"
          tone={timeSyncEnabled ? "success" : "neutral"}
          control={
            <StatusPill
              tone={timeSyncEnabled ? "success" : "neutral"}
              icon={timeSyncEnabled ? <CheckCircle2 size={14} /> : <Clock3 size={14} />}
            >
              {timeSyncEnabled ? timeSyncProviderLabel : "默认"}
            </StatusPill>
          }
        >
          <FormSegmented
            value={timeSyncEnabled ? timeSyncProvider : "default"}
            options={[
              { label: "默认", value: "default" },
              { label: "HTTP Date", value: "httpDate" },
              { label: "时间 API", value: "timeApi" },
              ...(isDesktop
                ? [
                    {
                      label: "NTP（桌面端）",
                      value: "ntp",
                      disabled: !ntpAvailable,
                    },
                  ]
                : []),
            ]}
            onChange={(v) => {
              if (v === "default") {
                setTimeSyncEnabled(false);
              } else {
                setTimeSyncEnabled(true);
                setTimeSyncProvider(v as "httpDate" | "timeApi" | "ntp");
              }
            }}
          />
        </SettingItem>

        {timeSyncEnabled && (
          <>
            {timeSyncProvider === "httpDate" ? (
              <SettingItem
                icon={<Wifi size={18} />}
                title="HTTP Date URL"
                description="读取响应头 Date 字段，同源路径可直接填写为 /。"
              >
                <FormInput
                  label="URL"
                  value={timeSyncHttpDateUrl}
                  placeholder="/"
                  onChange={(e) => setTimeSyncHttpDateUrl(e.target.value)}
                />
              </SettingItem>
            ) : timeSyncProvider === "timeApi" ? (
              <SettingItem
                icon={<Wifi size={18} />}
                title="时间 API URL"
                description="支持 epochMs、epochSeconds、unixtime 或 datetime 字段。"
              >
                <FormInput
                  label="URL"
                  value={timeSyncApiUrl}
                  placeholder="https://example.com/time"
                  onChange={(e) => setTimeSyncApiUrl(e.target.value)}
                />
              </SettingItem>
            ) : (
              <SettingItem
                icon={<Wifi size={18} />}
                title="NTP 服务"
                description="桌面端通过 NTP Host 与端口同步网络时间。"
              >
                <SettingGrid columns={2}>
                  <FormInput
                    label="NTP Host"
                    value={timeSyncNtpHost}
                    placeholder="pool.ntp.org"
                    onChange={(e) => setTimeSyncNtpHost(e.target.value)}
                  />
                  <FormInput
                    label="端口"
                    type="number"
                    variant="number"
                    min={1}
                    max={65535}
                    step={1}
                    value={String(timeSyncNtpPort)}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const n = raw.trim() ? Number(raw) : 123;
                      setTimeSyncNtpPort(Number.isFinite(n) ? Math.trunc(n) : 123);
                    }}
                  />
                </SettingGrid>
              </SettingItem>
            )}

            <SettingGrid columns={2}>
              <SettingItem
                icon={<Clock3 size={18} />}
                title="手动偏移"
                description="以秒为单位微调最终生效时间。"
              >
                <FormInput
                  label="偏移秒数"
                  type="number"
                  variant="number"
                  step="0.1"
                  value={String(timeSyncManualOffsetSec)}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const n = raw.trim() ? Number(raw) : 0;
                    setTimeSyncManualOffsetSec(Number.isFinite(n) ? n : 0);
                  }}
                />
              </SettingItem>
              <SettingItem
                icon={<RotateCw size={18} />}
                title="自动校时"
                description="按固定间隔触发后台校时。"
                control={
                  <FormSwitch
                    checked={timeSyncAutoEnabled}
                    onCheckedChange={setTimeSyncAutoEnabled}
                    aria-label="自动校时"
                  />
                }
              >
                <FormInput
                  label="间隔（分钟）"
                  type="number"
                  variant="number"
                  min={1}
                  step={1}
                  value={String(timeSyncAutoIntervalMin)}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const n = raw.trim() ? Number(raw) : 60;
                    setTimeSyncAutoIntervalMin(Number.isFinite(n) ? n : 60);
                  }}
                />
              </SettingItem>
            </SettingGrid>

            <FormButtonGroup align="left">
              <FormButton
                type="button"
                variant="secondary"
                onClick={() => window.dispatchEvent(new CustomEvent("timeSync:syncNow"))}
              >
                立即校时
              </FormButton>
            </FormButtonGroup>

            <SettingGrid columns={2}>
              <MetricCard
                icon={<Clock3 size={16} />}
                label="当前有效偏移"
                value={timeSyncOffsetText}
                meta="已保存配置"
                tone={timeSyncStatus?.enabled ? "success" : "neutral"}
              />
              <MetricCard
                icon={<RotateCw size={16} />}
                label="上次校时"
                value={timeSyncLastText}
                meta={
                  typeof timeSyncStatus?.lastRttMs === "number"
                    ? `RTT ${timeSyncStatus.lastRttMs} ms`
                    : "无 RTT 记录"
                }
                tone="info"
              />
            </SettingGrid>

            {timeSyncStatus?.lastError && timeSyncStatus.lastError.trim() && (
              <InfoPanel tone="danger" title="最近错误">
                {timeSyncStatus.lastError}
              </InfoPanel>
            )}
            {isDesktop && !ntpAvailable && (
              <InfoPanel tone="warning" title="NTP 能力未就绪">
                检测到桌面端环境，但 NTP preload 未加载到最新版本；请重新启动桌面端或重新构建桌面端产物。
              </InfoPanel>
            )}
            {timeSyncProvider === "httpDate" && (
              <InfoPanel tone="info" title="HTTP Date 提示">
                跨域读取 HTTP Date 需要服务端配置 Expose-Headers: Date；建议同源或自建接口。
              </InfoPanel>
            )}
            {timeSyncProvider === "ntp" && (
              <InfoPanel tone="warning" title="NTP 网络提示">
                NTP 使用 UDP/123，可能会被防火墙或网络策略拦截；若提示桌面端不可用，请先重建桌面端产物。
              </InfoPanel>
            )}
          </>
        )}
      </FormSection>

      <FormSection
        title="课表设置"
        description="管理自习课程时间段，保存后即时生效。"
        hidden={isSectionHidden("schedule")}
      >
        <SettingItem
          icon={<BookOpen size={18} />}
          title="课程时间表"
          description="打开弹窗编辑、导入或重排自习课程时间段。"
          tone="accent"
          control={
            <FormButton variant="primary" onClick={() => setScheduleOpen(true)}>
              打开
            </FormButton>
          }
        />
        <ScheduleSettings
          isOpen={scheduleOpen}
          onClose={() => setScheduleOpen(false)}
          onSave={() => {
            /* 已在弹窗内持久化 */
          }}
        />
      </FormSection>
    </div>
  );
};

export default BasicSettingsPanel;
