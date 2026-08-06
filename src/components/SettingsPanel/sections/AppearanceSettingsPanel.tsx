import React, { useEffect, useMemo, useState } from "react";

import { useAppDispatch, useAppState } from "../../../contexts/AppContext";
import { useAppearance } from "../../../contexts/AppearanceContext";
import type { TimeDisplaySettings } from "../../../types";
import type {
  AppearanceBackground,
  AppearanceComponentId,
  AppearanceSceneId,
  AppearanceSlotKind,
  AppearanceStyle,
  FontReference,
} from "../../../types/appearance";
import {
  Button as FormButton,
  Dropdown,
  type DropdownGroup,
  FormSection,
  InfoPanel,
  IconButton as FormIconButton,
  Inline as FormButtonGroup,
  Input as FormInput,
  RadioGroup as FormSegmented,
  SettingGrid,
  SettingItem,
  Slider as FormSlider,
  StatusPill,
  Switch as FormSwitch,
  Tabs,
  useFeedback,
} from "../../../ui";
import {
  type AppearanceBackgroundMetadata,
  type AppearanceFontMetadata,
  loadAppearanceAssetCatalog,
  loadBackgroundAsset,
  removeAppearanceAsset,
  saveBackgroundAsset,
  subscribeAppearanceAssetsChanged,
} from "../../../utils/appearanceAssets";
import {
  APPEARANCE_COMPONENTS,
  resolveAppearanceBackground,
  resolveAppearanceEditorStyle,
} from "../../../utils/appearanceModel";
import { importFontFile, removeImportedFont } from "../../../utils/studyFontStorage";

import { AppearancePreview } from "./AppearancePreview";
import styles from "./AppearanceSettingsPanel.module.css";
import { AppearanceStyleFields } from "./AppearanceStyleFields";

export type AppearanceSettingsSection = "overview" | "time" | AppearanceComponentId;

interface AppearanceSettingsPanelProps {
  section?: AppearanceSettingsSection;
  onRegisterSave?: (save: () => void) => void;
}

const DEFAULT_TIME_DISPLAY: TimeDisplaySettings = {
  showClockSeconds: true,
  showStudySeconds: true,
};

const SCENE_LABELS: Record<AppearanceSceneId, string> = {
  clock: "时钟",
  countdown: "倒计时",
  stopwatch: "秒表",
  study: "自习",
};

const TIME_COMPONENT_OPTIONS = [
  { label: "时钟", value: "clock" },
  { label: "倒计时", value: "countdown" },
  { label: "秒表", value: "stopwatch" },
  { label: "自习时间", value: "studyTime" },
] as const;

const TOP_DOCK_COMPONENT_OPTIONS = [
  { label: "栏体", value: "studyTopDock" },
  { label: "天气", value: "studyWeather" },
  { label: "噪音监测", value: "studyNoise" },
  { label: "顶部进度与信息", value: "studyStatus" },
  { label: "事件倒计时", value: "studyCountdown" },
] as const;

const BUILT_IN_FONTS = [
  { label: "Inter", value: "builtin:Inter" },
  { label: "Roboto Mono", value: "builtin:Roboto Mono" },
  { label: "系统无衬线", value: "builtin:system-ui" },
  { label: "等宽字体", value: "builtin:monospace" },
  { label: "宋体", value: "builtin:SimSun" },
  { label: "黑体", value: "builtin:SimHei" },
];

function readStyle(
  appearance: ReturnType<typeof useAppearance>["activeAppearance"],
  scene: AppearanceSceneId,
  componentId: AppearanceComponentId,
  slot: string,
  state: string,
  instanceId: string
): AppearanceStyle {
  const component =
    componentId === "studyCountdown" && instanceId
      ? appearance.instances.studyCountdown[instanceId]
      : appearance.scenes[scene].components[componentId];
  if (state) return component?.states?.[state] ?? {};
  if (slot === "__container") return component?.container ?? {};
  return component?.slots?.[slot] ?? {};
}

function fontValue(font: FontReference | undefined): string {
  return font ? `${font.source}:${font.id}` : "";
}

function fontFromValue(
  value: string,
  importedFonts: AppearanceFontMetadata[]
): FontReference | undefined {
  if (!value) return undefined;
  const [source, ...idParts] = value.split(":");
  const id = idParts.join(":");
  if (source === "imported") {
    const font = importedFonts.find((item) => item.id === id);
    return font ? { id: font.id, family: font.family, source: "imported" } : undefined;
  }
  if (source === "builtin") return { id, family: id, source: "builtin" };
  return undefined;
}

function collectAppearanceResourceIds(
  appearance: ReturnType<typeof useAppearance>["activeAppearance"]
): { backgrounds: Set<string>; fonts: Set<string> } {
  const backgrounds = new Set<string>();
  const fonts = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (typeof record.assetId === "string") backgrounds.add(record.assetId);
    if (record.source === "imported" && typeof record.id === "string") fonts.add(record.id);
    Object.values(record).forEach(visit);
  };
  visit(appearance);
  return { backgrounds, fonts };
}

function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const value = hex.slice(1);
    const expanded =
      value.length === 3
        ? value
            .split("")
            .map((char) => char + char)
            .join("")
        : value;
    const channels = [0, 2, 4].map(
      (offset) => Number.parseInt(expanded.slice(offset, offset + 2), 16) / 255
    );
    const linear = channels.map((channel) =>
      channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    );
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

interface BackgroundEditorProps {
  assets: AppearanceBackgroundMetadata[];
  background: AppearanceBackground;
  description: string;
  path: readonly string[];
  title: string;
  allowInherit?: boolean;
  onUpdate: (path: readonly string[], value: unknown) => void;
  onError: (error: unknown) => void;
}

function BackgroundEditor({
  assets,
  background,
  description,
  path,
  title,
  allowInherit = false,
  onUpdate,
  onError,
}: BackgroundEditorProps) {
  const options = [
    ...(allowInherit ? [{ label: "跟随整体", value: "inherit" }] : []),
    { label: "默认深灰", value: "default" },
    { label: "深绿预设", value: "green" },
    { label: "纯黑", value: "black" },
    { label: "深灰（手动）", value: "dark" },
    { label: "纯色", value: "color" },
    { label: "图片", value: "image" },
  ];

  return (
    <FormSection title={title} description={description} variant="plain">
      <SettingItem icon="appearance.background" title="背景类型">
        <FormSegmented
          value={background.type}
          options={options}
          onChange={(value) => onUpdate([...path, "type"], value)}
        />
      </SettingItem>
      {background.type === "color" && (
        <SettingGrid className={styles.editorGrid} columns={2}>
          <SettingItem icon="appearance.color" title="背景颜色">
            <FormInput
              label="背景颜色"
              type="color"
              value={background.color ?? "#121212"}
              onChange={(event) => onUpdate([...path, "color"], event.target.value)}
            />
          </SettingItem>
          <SettingItem icon="appearance.color" title="背景透明度">
            <FormSlider
              label="背景透明度"
              min={0}
              max={1}
              step={0.01}
              value={background.colorAlpha ?? 1}
              onChange={(value) => onUpdate([...path, "colorAlpha"], value)}
              formatValue={(value) => `${Math.round(value * 100)}%`}
            />
          </SettingItem>
        </SettingGrid>
      )}
      {background.type === "image" && (
        <SettingItem icon="action.upload" title="背景图片">
          <Dropdown
            label="已导入背景"
            placeholder={assets.length > 0 ? "选择已导入背景" : "暂无已导入背景"}
            value={background.assetId}
            options={assets.map((asset) => ({ label: asset.name, value: asset.id }))}
            disabled={assets.length === 0}
            searchable={assets.length > 8}
            onChange={(value) => {
              const asset = assets.find((candidate) => candidate.id === value);
              if (!asset) return;
              onUpdate(path, {
                type: "image",
                assetId: asset.id,
                imageFileName: asset.name,
              });
            }}
          />
          <FormInput
            label="选择图片"
            type="file"
            accept="image/*"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              try {
                const asset = await saveBackgroundAsset(file);
                onUpdate(path, {
                  type: "image",
                  assetId: asset.id,
                  imageFileName: asset.name,
                });
              } catch (error) {
                onError(error);
              }
            }}
          />
          {background.imageFileName && (
            <InfoPanel tone="info">当前图片：{background.imageFileName}</InfoPanel>
          )}
        </SettingItem>
      )}
    </FormSection>
  );
}

export function AppearanceSettingsPanel({
  section = "overview",
  onRegisterSave,
}: AppearanceSettingsPanelProps) {
  const { mode, study, timeDisplay } = useAppState();
  const dispatch = useAppDispatch();
  const {
    activeAppearance,
    beginAppearancePreview,
    setPreviewScene,
    updateAppearanceDraft,
    resetAppearance,
  } = useAppearance();
  const { confirm, notify } = useFeedback();
  const isOverview = section === "overview";
  const isTime = section === "time";
  const isTopDock = section === "studyTopDock";
  const [timeView, setTimeView] =
    useState<(typeof TIME_COMPONENT_OPTIONS)[number]["value"]>("clock");
  const [draftTimeDisplay, setDraftTimeDisplay] = useState<TimeDisplaySettings>(() => ({
    ...(timeDisplay ?? DEFAULT_TIME_DISPLAY),
  }));
  const [topDockView, setTopDockView] =
    useState<(typeof TOP_DOCK_COMPONENT_OPTIONS)[number]["value"]>("studyTopDock");
  const componentId: AppearanceComponentId = isOverview
    ? "clock"
    : isTime
      ? timeView
      : isTopDock
        ? topDockView
        : section;
  const definition =
    APPEARANCE_COMPONENTS.find((item) => item.id === componentId) ?? APPEARANCE_COMPONENTS[0];
  const scene = definition.scene;
  const slotOptions = useMemo(
    () => [
      ...(definition.supportsSurface
        ? [
            {
              label: definition.containerLabel ?? "整体容器",
              value: "__container",
              kind: "surface" as const,
            },
          ]
        : []),
      ...definition.slots.map((item) => ({
        label: item.label,
        value: item.id,
        kind: item.kind,
      })),
    ],
    [definition]
  );
  const [slot, setSlot] = useState(slotOptions[0]?.value ?? "");
  const [selectedState, setSelectedState] = useState(definition.states?.[0]?.id ?? "");
  const [previewMode, setPreviewMode] = useState<"object" | "state">("object");
  const [instanceScope, setInstanceScope] = useState<"all" | "specific">("all");
  const [instanceId, setInstanceId] = useState("");
  const [fonts, setFonts] = useState<AppearanceFontMetadata[]>([]);
  const [backgroundAssets, setBackgroundAssets] = useState<AppearanceBackgroundMetadata[]>([]);
  const [previewedBackground, setPreviewedBackground] = useState<{
    id: string;
    name: string;
    dataUrl: string;
  } | null>(null);
  const [resourceOperation, setResourceOperation] = useState<string | null>(null);
  const [fontAlias, setFontAlias] = useState("");
  const [fontFile, setFontFile] = useState<File | null>(null);
  const countdownItems = study.countdownItems ?? [];
  const showSeconds =
    timeView === "clock"
      ? draftTimeDisplay.showClockSeconds
      : timeView === "studyTime"
        ? draftTimeDisplay.showStudySeconds
        : undefined;
  const isTimeDisplaySettingSlot =
    isTime &&
    ((definition.id === "clock" && slot === "time") ||
      (definition.id === "studyTime" && slot === "seconds"));
  const selectedSlot = slotOptions.find((item) => item.value === slot) ?? slotOptions[0];
  const kind: AppearanceSlotKind = selectedSlot?.kind ?? "text";
  const currentOverrideStyle = readStyle(
    activeAppearance,
    scene,
    definition.id,
    slot,
    "",
    instanceId
  );
  const currentStyle = resolveAppearanceEditorStyle(
    activeAppearance,
    scene,
    definition.id,
    slot,
    kind,
    { instanceId: instanceId || undefined }
  );
  const selectedStateDefinition = definition.states?.find((item) => item.id === selectedState);
  const firstStateSlot = definition.slots.find(
    (item) => item.id === selectedStateDefinition?.slotIds[0]
  );
  const stateKind: AppearanceSlotKind = firstStateSlot?.kind ?? "text";
  const stateOverrideStyle = selectedState
    ? readStyle(activeAppearance, scene, definition.id, "", selectedState, instanceId)
    : {};
  const stateStyle = selectedState
    ? resolveAppearanceEditorStyle(
        activeAppearance,
        scene,
        definition.id,
        firstStateSlot?.id ?? definition.slots[0]?.id ?? "",
        stateKind,
        { instanceId: instanceId || undefined, state: selectedState }
      )
    : {};
  const stateSupportsTypography = (selectedStateDefinition?.slotIds ?? [])
    .map((slotId) => definition.slots.find((item) => item.id === slotId)?.kind)
    .filter((value): value is AppearanceSlotKind => Boolean(value))
    .every((slotKind) => slotKind === "text" || slotKind === "numeric");
  const currentBackground = resolveAppearanceBackground(activeAppearance, scene);
  const pageBackground = activeAppearance.scenes[scene].background;
  const currentOverrideCount = Object.keys(currentOverrideStyle).length;
  const stateOverrideCount = Object.keys(stateOverrideStyle).length;
  const previewStateId = previewMode === "state" ? selectedState : undefined;
  const selectedInstance = countdownItems.find((item) => item.id === instanceId);
  const referencedResources = useMemo(
    () => collectAppearanceResourceIds(activeAppearance),
    [activeAppearance]
  );

  useEffect(() => {
    onRegisterSave?.(() => {
      dispatch({ type: "SET_TIME_DISPLAY", payload: draftTimeDisplay });
    });
  }, [dispatch, draftTimeDisplay, onRegisterSave]);

  useEffect(() => {
    beginAppearancePreview(mode);
    let active = true;
    const refreshAssets = async () => {
      try {
        const catalog = await loadAppearanceAssetCatalog();
        if (!active) return;
        setFonts(catalog.fonts);
        setBackgroundAssets(catalog.backgrounds);
      } catch {
        if (!active) return;
        setFonts([]);
        setBackgroundAssets([]);
      }
    };
    void refreshAssets();
    const unsubscribe = subscribeAppearanceAssetsChanged(() => {
      void refreshAssets();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [beginAppearancePreview, mode]);

  useEffect(() => {
    setPreviewScene(isOverview ? mode : scene);
  }, [isOverview, mode, scene, setPreviewScene]);

  useEffect(() => {
    setSlot(definition.supportsSurface ? "__container" : (definition.slots[0]?.id ?? ""));
    setSelectedState(definition.states?.[0]?.id ?? "");
    setPreviewMode("object");
    setInstanceScope("all");
    setInstanceId("");
  }, [definition]);

  const styleOwnerPath = (): string[] =>
    instanceId
      ? ["instances", "studyCountdown", instanceId]
      : ["scenes", scene, "components", definition.id];

  const stylePath = (property?: string): string[] => {
    const branch = slot === "__container" ? ["container"] : ["slots", slot];
    const ownerPath = instanceId
      ? ["instances", "studyCountdown", instanceId]
      : ["scenes", scene, "components", definition.id];
    return [...ownerPath, ...branch, ...(property ? [property] : [])];
  };

  const stateStylePath = (property?: string): string[] => [
    ...styleOwnerPath(),
    "states",
    selectedState,
    ...(property ? [property] : []),
  ];

  const updateStyle = (property: keyof AppearanceStyle, value: unknown) => {
    updateAppearanceDraft(stylePath(property), value);
  };

  const updateStateStyle = (property: keyof AppearanceStyle, value: unknown) => {
    updateAppearanceDraft(stateStylePath(property), value);
  };

  const handleGlobalReset = async () => {
    if (
      await confirm({
        title: "恢复整体样式",
        description: "将恢复所有页面共用的字体和背景，页面与组件的单独调整不受影响。",
        confirmLabel: "恢复整体样式",
        variant: "danger",
      })
    ) {
      resetAppearance({ type: "global" });
    }
  };

  const handleAllReset = async () => {
    if (
      await confirm({
        title: "重置全部外观",
        description: "整体样式、页面背景和所有组件的单独调整都将恢复为应用预设。",
        confirmLabel: "全部重置",
        variant: "danger",
      })
    ) {
      resetAppearance({ type: "all" });
    }
  };

  const handleFontImport = async () => {
    if (!fontFile || !fontAlias.trim()) {
      notify({ variant: "warning", title: "请填写字体名称并选择字体文件" });
      return;
    }
    try {
      await importFontFile(fontFile, fontAlias.trim());
      setFontAlias("");
      setFontFile(null);
      notify({ variant: "success", title: "字体已导入" });
    } catch (error) {
      notify({
        variant: "danger",
        title: "字体导入失败",
        description: error instanceof Error ? error.message : "无法读取字体文件",
      });
    }
  };

  const fontGroups: DropdownGroup[] = [
    { label: "内置字体", options: BUILT_IN_FONTS },
    {
      label: "已导入字体",
      options:
        fonts.length > 0
          ? fonts.map((font) => ({ label: font.family, value: `imported:${font.id}` }))
          : [{ label: "暂无已导入字体", value: "__none__", disabled: true }],
    },
  ];

  const colorContrastWarning =
    currentStyle.color &&
    currentBackground.type === "color" &&
    currentBackground.color &&
    contrastRatio(currentStyle.color, currentBackground.color) < 3;

  const reportBackgroundError = (error: unknown) => {
    notify({
      variant: "danger",
      title: "背景图片导入失败",
      description: error instanceof Error ? error.message : "无法读取图片",
    });
  };

  const handlePreviewBackground = async (asset: AppearanceBackgroundMetadata) => {
    setResourceOperation(`preview:${asset.id}`);
    try {
      const stored = await loadBackgroundAsset(asset.id);
      if (!stored) throw new Error("背景资源不存在或已被清理");
      setPreviewedBackground({ id: asset.id, name: asset.name, dataUrl: stored.dataUrl });
    } catch (error) {
      reportBackgroundError(error);
    } finally {
      setResourceOperation(null);
    }
  };

  const handleApplyBackground = (asset: AppearanceBackgroundMetadata) => {
    updateAppearanceDraft(["global", "background"], {
      type: "image",
      assetId: asset.id,
      imageFileName: asset.name,
    });
    notify({
      variant: "success",
      title: "背景已应用到草稿",
      description: "保存设置后将作为整体背景使用。",
    });
  };

  const handleDeleteResource = async (
    asset: AppearanceBackgroundMetadata | AppearanceFontMetadata
  ) => {
    const isUsed =
      asset.kind === "background"
        ? referencedResources.backgrounds.has(asset.id)
        : referencedResources.fonts.has(asset.id);
    if (isUsed || resourceOperation) return;
    const accepted = await confirm({
      title: `删除${asset.kind === "background" ? "背景" : "字体"}资源`,
      description: `“${asset.name}”当前未被外观设置引用，删除后无法撤销。`,
      confirmLabel: "删除资源",
      variant: "danger",
    });
    if (!accepted) return;

    setResourceOperation(`delete:${asset.id}`);
    try {
      if (asset.kind === "font") await removeImportedFont(asset.id);
      else await removeAppearanceAsset(asset.id, "background");
      if (previewedBackground?.id === asset.id) setPreviewedBackground(null);
      notify({ variant: "success", title: "资源已删除" });
    } catch (error) {
      notify({
        variant: "danger",
        title: "删除资源失败",
        description: error instanceof Error ? error.message : "无法删除本地资源",
      });
    } finally {
      setResourceOperation(null);
    }
  };

  const objectTabs = slotOptions.map((item) => {
    const override = readStyle(activeAppearance, scene, definition.id, item.value, "", instanceId);
    const adjusted = Object.keys(override).length > 0;
    return {
      value: item.value,
      ariaLabel: `${item.label}${adjusted ? "，已单独调整" : ""}`,
      label: (
        <span className={styles.objectTabLabel}>
          {item.label}
          {adjusted ? <span className={styles.overrideDot} aria-hidden="true" /> : null}
        </span>
      ),
    };
  });
  const objectStatus =
    currentOverrideCount > 0
      ? `已单独调整 ${currentOverrideCount} 项`
      : instanceId
        ? "使用所有事件的样式"
        : kind === "text" || kind === "numeric"
          ? "使用整体样式"
          : "使用应用预设";
  const stateTargetLabels = (selectedStateDefinition?.slotIds ?? [])
    .map((slotId) => definition.slots.find((item) => item.id === slotId)?.label)
    .filter((label): label is string => Boolean(label));
  const stateTabs = (definition.states ?? []).map((item) => ({
    value: item.id,
    label: item.label,
    ariaLabel: `${item.label}${Object.keys(readStyle(activeAppearance, scene, definition.id, "", item.id, instanceId)).length > 0 ? "，已单独调整" : ""}`,
  }));
  const resetCurrentComponent = () =>
    instanceId
      ? resetAppearance({
          type: "property",
          path: ["instances", "studyCountdown", instanceId],
        })
      : resetAppearance({ type: "component", scene, componentId: definition.id });
  const handleInstanceScopeChange = (value: string) => {
    const scope = value === "specific" ? "specific" : "all";
    setInstanceScope(scope);
    setInstanceId(scope === "specific" ? (countdownItems[0]?.id ?? "") : "");
    setPreviewMode("object");
  };

  return (
    <div className={styles.panel}>
      {isOverview ? (
        <>
          <FormSection
            title="实时预览"
            description="这里展示所有页面共用的字体与整体背景。"
            variant="plain"
          >
            <AppearancePreview
              overview
              showClockSeconds={draftTimeDisplay.showClockSeconds}
              showStudySeconds={draftTimeDisplay.showStudySeconds}
            />
          </FormSection>

          <FormSection
            title="字体设置"
            description="没有单独调整的文字会使用这里的字体。"
            variant="plain"
          >
            <SettingGrid className={styles.editorGrid} columns={2}>
              {(["numeric", "text"] as const).map((category) => (
                <SettingItem
                  key={category}
                  icon={category === "numeric" ? "appearance.font" : "feature.file"}
                  title={category === "numeric" ? "主显示字体" : "信息字体"}
                  description={
                    category === "numeric"
                      ? "用于时钟、倒计时和秒表的主要数字"
                      : "用于日期、天气和其他辅助信息"
                  }
                >
                  <div
                    className={styles.fontPreview}
                    data-font-role={category}
                    style={{ fontFamily: activeAppearance.global[category]?.font?.family }}
                    aria-label={`${category === "numeric" ? "主显示" : "信息"}字体预览`}
                  >
                    {category === "numeric" ? "12:45:09" : "周一 · 7月13日 · 26°C"}
                  </div>
                  <Dropdown
                    label={category === "numeric" ? "主显示字体" : "信息字体"}
                    placeholder="使用应用预设"
                    value={fontValue(activeAppearance.global[category]?.font)}
                    groups={fontGroups}
                    onChange={(value) =>
                      updateAppearanceDraft(
                        ["global", category, "font"],
                        fontFromValue(String(value), fonts)
                      )
                    }
                  />
                </SettingItem>
              ))}
            </SettingGrid>
          </FormSection>

          <BackgroundEditor
            assets={backgroundAssets}
            title="整体背景"
            description="所有页面默认使用此背景；页面仍可进行单独调整。"
            background={activeAppearance.global.background}
            path={["global", "background"]}
            onUpdate={updateAppearanceDraft}
            onError={reportBackgroundError}
          />

          <FormSection
            title="字体资源"
            description="导入字体后，可用于整体样式或任一组件。"
            variant="plain"
          >
            <SettingGrid className={styles.editorGrid} columns={2}>
              <FormInput
                label="字体名称"
                value={fontAlias}
                placeholder="例如 JetBrains Mono"
                onChange={(event) => setFontAlias(event.target.value)}
              />
              <FormInput
                label="字体文件"
                type="file"
                accept=".ttf,.otf,.woff,.woff2"
                onChange={(event) => setFontFile(event.target.files?.[0] ?? null)}
              />
            </SettingGrid>
            <FormButton icon="action.upload" onClick={handleFontImport}>
              导入字体
            </FormButton>
          </FormSection>

          <FormSection
            title="资源清单"
            description="查看资源状态、预览或重新应用背景，并删除未使用的本地资源。"
            variant="plain"
          >
            {backgroundAssets.length === 0 && fonts.length === 0 ? (
              <InfoPanel tone="neutral">暂无已导入资源。</InfoPanel>
            ) : (
              <div className={styles.resourceList}>
                {backgroundAssets.map((asset) => {
                  const isUsed = referencedResources.backgrounds.has(asset.id);
                  return (
                    <div
                      key={`background:${asset.id}`}
                      className={styles.resourceRow}
                      aria-label={`背景资源 ${asset.name}`}
                    >
                      <div className={styles.resourceInfo}>
                        <strong>{asset.name}</strong>
                        <StatusPill tone={isUsed ? "accent" : "neutral"}>
                          {isUsed ? "正在使用" : "未使用"}
                        </StatusPill>
                      </div>
                      <FormButtonGroup gap="sm" align="left">
                        <FormButton
                          size="sm"
                          variant="secondary"
                          icon="appearance.preview"
                          loading={resourceOperation === `preview:${asset.id}`}
                          disabled={resourceOperation !== null}
                          aria-label={`预览背景 ${asset.name}`}
                          onClick={() => void handlePreviewBackground(asset)}
                        >
                          预览
                        </FormButton>
                        <FormButton
                          size="sm"
                          variant="secondary"
                          icon="action.apply"
                          disabled={resourceOperation !== null}
                          aria-label={`应用背景 ${asset.name}`}
                          onClick={() => handleApplyBackground(asset)}
                        >
                          应用
                        </FormButton>
                        <FormIconButton
                          size="sm"
                          variant="danger"
                          icon="action.delete"
                          loading={resourceOperation === `delete:${asset.id}`}
                          disabled={isUsed || resourceOperation !== null}
                          aria-label={`删除背景 ${asset.name}`}
                          title={isUsed ? "正在使用的资源不能删除" : "删除背景"}
                          onClick={() => void handleDeleteResource(asset)}
                        />
                      </FormButtonGroup>
                    </div>
                  );
                })}
                {fonts.map((font) => {
                  const isUsed = referencedResources.fonts.has(font.id);
                  return (
                    <div
                      key={`font:${font.id}`}
                      className={styles.resourceRow}
                      aria-label={`字体资源 ${font.family}`}
                    >
                      <div className={styles.resourceInfo}>
                        <strong style={{ fontFamily: font.family }}>{font.family}</strong>
                        <StatusPill tone={isUsed ? "accent" : "neutral"}>
                          {isUsed ? "正在使用" : "未使用"}
                        </StatusPill>
                      </div>
                      <FormIconButton
                        size="sm"
                        variant="danger"
                        icon="action.delete"
                        loading={resourceOperation === `delete:${font.id}`}
                        disabled={isUsed || resourceOperation !== null}
                        aria-label={`删除字体 ${font.family}`}
                        title={isUsed ? "正在使用的资源不能删除" : "删除字体"}
                        onClick={() => void handleDeleteResource(font)}
                      />
                    </div>
                  );
                })}
              </div>
            )}
            {previewedBackground ? (
              <figure className={styles.resourcePreview}>
                <img src={previewedBackground.dataUrl} alt={`${previewedBackground.name}预览`} />
                <figcaption>{previewedBackground.name}</figcaption>
              </figure>
            ) : null}
          </FormSection>

          <FormSection
            title="恢复外观"
            description="恢复操作只修改草稿，保存后才会生效。"
            variant="plain"
          >
            <FormButtonGroup align="left">
              <FormButton variant="secondary" icon="action.reset" onClick={handleGlobalReset}>
                恢复整体样式
              </FormButton>
              <FormButton variant="danger" icon="action.delete" onClick={handleAllReset}>
                重置全部外观
              </FormButton>
            </FormButtonGroup>
          </FormSection>
        </>
      ) : (
        <>
          {isTime ? (
            <FormSection
              title="显示内容"
              description="分别调整四个主要时间页面的显示样式。"
              variant="plain"
            >
              <FormSegmented
                ariaLabel="时间显示类型"
                value={timeView}
                options={TIME_COMPONENT_OPTIONS}
                onChange={(value) => setTimeView(value)}
              />
            </FormSection>
          ) : null}

          {isTopDock ? (
            <FormSection
              title="信息栏内容"
              description="分别调整顶部信息栏的栏体与各项辅助信息。"
              variant="plain"
            >
              <FormSegmented
                ariaLabel="顶部信息栏内容"
                value={topDockView}
                options={TOP_DOCK_COMPONENT_OPTIONS}
                onChange={(value) => setTopDockView(value)}
              />
            </FormSection>
          ) : null}

          <FormSection
            title={definition.label}
            description={definition.description}
            variant="plain"
          >
            <div className={styles.editor}>
              <AppearancePreview
                componentId={definition.id}
                instanceId={instanceId}
                instanceLabel={
                  selectedInstance?.name ||
                  (selectedInstance?.kind === "gaokao" ? "高考" : selectedInstance?.id)
                }
                selectedSlot={slot}
                showClockSeconds={draftTimeDisplay.showClockSeconds}
                showStudySeconds={draftTimeDisplay.showStudySeconds}
                stateId={previewStateId}
              />

              {definition.id === "studyCountdown" && countdownItems.length > 0 ? (
                <SettingGrid className={styles.editorGrid} columns={2}>
                  <SettingItem icon="appearance.applyTo" title="应用到">
                    <FormSegmented
                      value={instanceScope}
                      options={[
                        { label: "所有事件", value: "all" },
                        { label: "指定事件", value: "specific" },
                      ]}
                      onChange={handleInstanceScopeChange}
                    />
                  </SettingItem>
                  {instanceScope === "specific" ? (
                    <SettingItem icon="feature.event" title="选择事件">
                      <Dropdown
                        label="指定事件"
                        value={instanceId}
                        options={countdownItems.map((item) => ({
                          label: item.name || (item.kind === "gaokao" ? "高考倒计时" : item.id),
                          value: item.id,
                        }))}
                        onChange={(value) => {
                          setInstanceId(String(value));
                          setPreviewMode("object");
                        }}
                      />
                    </SettingItem>
                  ) : null}
                </SettingGrid>
              ) : null}

              <div className={styles.objectSelector}>
                <div className={styles.selectorHeading}>
                  <strong>调整对象</strong>
                  <span>选择画面中需要调整的内容</span>
                </div>
                <Tabs
                  label={`${definition.label}调整对象`}
                  size="sm"
                  value={slot}
                  items={objectTabs}
                  onChange={(value) => {
                    setSlot(value);
                    setPreviewMode("object");
                  }}
                />
              </div>

              {isTimeDisplaySettingSlot && showSeconds !== undefined ? (
                <SettingGrid columns={1}>
                  <SettingItem
                    icon="feature.time"
                    title="显示秒数"
                    description={
                      timeView === "clock"
                        ? "关闭后，时钟页只显示小时和分钟。"
                        : "关闭后，自习页中央时间只显示小时和分钟。"
                    }
                    control={
                      <FormSwitch
                        checked={showSeconds}
                        aria-label={`${timeView === "clock" ? "时钟" : "自习时间"}显示秒数`}
                        onCheckedChange={(checked) =>
                          setDraftTimeDisplay((current) => ({
                            ...current,
                            ...(timeView === "clock"
                              ? { showClockSeconds: checked }
                              : { showStudySeconds: checked }),
                          }))
                        }
                      />
                    }
                  />
                </SettingGrid>
              ) : null}

              <div className={styles.overrideStatus}>
                <StatusPill tone={currentOverrideCount > 0 ? "accent" : "neutral"}>
                  {objectStatus}
                </StatusPill>
                {currentOverrideCount > 0 ? (
                  <FormButton
                    size="sm"
                    variant="secondary"
                    icon="action.reset"
                    onClick={() => resetAppearance({ type: "property", path: stylePath() })}
                  >
                    恢复此对象
                  </FormButton>
                ) : null}
              </div>

              <AppearanceStyleFields
                fontGroups={fontGroups}
                kind={kind}
                overrideStyle={currentOverrideStyle}
                style={currentStyle}
                onFontChange={(value) => updateStyle("font", fontFromValue(value, fonts))}
                onReset={(property) =>
                  resetAppearance({ type: "property", path: stylePath(property) })
                }
                onUpdate={updateStyle}
              />

              {colorContrastWarning && (
                <InfoPanel tone="warning">
                  当前文字与页面背景的对比度较低，可能影响可读性。
                </InfoPanel>
              )}

              <FormButtonGroup align="left" className={styles.componentReset}>
                <FormButton variant="secondary" icon="action.reset" onClick={resetCurrentComponent}>
                  {instanceId ? "恢复此事件样式" : `恢复${definition.label}样式`}
                </FormButton>
              </FormButtonGroup>
            </div>
          </FormSection>

          {definition.states?.length ? (
            <FormSection
              title="状态样式"
              description="为组件在特定运行状态下设置统一的颜色与显示效果。"
              variant="plain"
            >
              <div className={styles.editor}>
                <Tabs
                  label={`${definition.label}状态样式`}
                  size="sm"
                  value={selectedState}
                  items={stateTabs}
                  onChange={(value) => {
                    setSelectedState(value);
                    setPreviewMode("state");
                  }}
                />
                <p className={styles.stateTargets}>作用于：{stateTargetLabels.join("、")}</p>
                <div className={styles.overrideStatus}>
                  <StatusPill tone={stateOverrideCount > 0 ? "accent" : "neutral"}>
                    {stateOverrideCount > 0
                      ? `已单独调整 ${stateOverrideCount} 项`
                      : "使用应用预设"}
                  </StatusPill>
                  {stateOverrideCount > 0 ? (
                    <FormButton
                      size="sm"
                      variant="secondary"
                      icon="action.reset"
                      onClick={() => resetAppearance({ type: "property", path: stateStylePath() })}
                    >
                      恢复此状态
                    </FormButton>
                  ) : null}
                </div>
                <AppearanceStyleFields
                  fontGroups={fontGroups}
                  kind={stateKind}
                  overrideStyle={stateOverrideStyle}
                  simpleOnly={!stateSupportsTypography}
                  style={stateStyle}
                  onFontChange={(value) => updateStateStyle("font", fontFromValue(value, fonts))}
                  onReset={(property) =>
                    resetAppearance({ type: "property", path: stateStylePath(property) })
                  }
                  onUpdate={updateStateStyle}
                />
              </div>
            </FormSection>
          ) : null}

          {isTime ? (
            <BackgroundEditor
              assets={backgroundAssets}
              title={`${SCENE_LABELS[scene]}页面背景`}
              description="当前页面可使用整体背景、默认深灰、深绿预设或单独设置的背景。"
              background={pageBackground}
              path={["scenes", scene, "background"]}
              allowInherit
              onUpdate={updateAppearanceDraft}
              onError={reportBackgroundError}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
