import {
  Brush,
  FileText,
  Image as ImageIcon,
  Palette,
  RotateCcw,
  Trash2,
  Type,
  Upload,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";

import { useAppState } from "../../../contexts/AppContext";
import { useAppearance } from "../../../contexts/AppearanceContext";
import type {
  AppearanceComponentId,
  AppearanceSceneId,
  AppearanceSlotKind,
  AppearanceStyle,
  FontReference,
} from "../../../types/appearance";
import {
  Button as FormButton,
  Dropdown,
  FormSection,
  InfoPanel,
  Inline as FormButtonGroup,
  Input as FormInput,
  RadioGroup as FormSegmented,
  SettingGrid,
  SettingItem,
  Slider as FormSlider,
  Switch as FormSwitch,
  useFeedback,
} from "../../../ui";
import { saveBackgroundAsset } from "../../../utils/appearanceAssets";
import {
  APPEARANCE_COMPONENTS,
  resolveAppearanceEditorStyle,
} from "../../../utils/appearanceModel";
import {
  importFontFile,
  loadImportedFonts,
  removeImportedFont,
  type ImportedFontMeta,
} from "../../../utils/studyFontStorage";

import styles from "./AppearanceSettingsPanel.module.css";

export type AppearanceSettingsSection = "components" | "fonts" | "background";

interface AppearanceSettingsPanelProps {
  section?: AppearanceSettingsSection;
}

const SCENE_OPTIONS = [
  { label: "时钟", value: "clock" },
  { label: "倒计时", value: "countdown" },
  { label: "秒表", value: "stopwatch" },
  { label: "自习", value: "study" },
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
  importedFonts: ImportedFontMeta[]
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

export function AppearanceSettingsPanel({ section = "components" }: AppearanceSettingsPanelProps) {
  const { mode, study } = useAppState();
  const {
    activeAppearance,
    beginAppearancePreview,
    setPreviewScene,
    updateAppearanceDraft,
    resetAppearance,
  } = useAppearance();
  const { confirm, notify } = useFeedback();
  const [scene, setScene] = useState<AppearanceSceneId>(mode);
  const definitions = useMemo(
    () => APPEARANCE_COMPONENTS.filter((item) => item.scene === scene),
    [scene]
  );
  const [componentId, setComponentId] = useState<AppearanceComponentId>(
    definitions[0]?.id ?? "clock"
  );
  const definition =
    definitions.find((item) => item.id === componentId) ??
    definitions[0] ??
    APPEARANCE_COMPONENTS[0];
  const slotOptions = useMemo(
    () => [
      ...(definition.supportsSurface
        ? [{ label: "组件表面", value: "__container", kind: "surface" as const }]
        : []),
      ...definition.slots.map((slot) => ({
        label: slot.label,
        value: slot.id,
        kind: slot.kind,
      })),
    ],
    [definition]
  );
  const [slot, setSlot] = useState(slotOptions[0]?.value ?? "");
  const [state, setState] = useState("");
  const [instanceId, setInstanceId] = useState("");
  const [fonts, setFonts] = useState<ImportedFontMeta[]>([]);
  const [fontAlias, setFontAlias] = useState("");
  const [fontFile, setFontFile] = useState<File | null>(null);
  const countdownItems = study.countdownItems ?? [];
  const selectedSlot = slotOptions.find((item) => item.value === slot) ?? slotOptions[0];
  const kind: AppearanceSlotKind = selectedSlot?.kind ?? "text";
  const currentOverrideStyle = readStyle(
    activeAppearance,
    scene,
    definition.id,
    slot,
    state,
    instanceId
  );
  const currentStyle = resolveAppearanceEditorStyle(
    activeAppearance,
    scene,
    definition.id,
    slot,
    kind,
    { state: state || undefined, instanceId: instanceId || undefined }
  );
  const isInheriting = Object.keys(currentOverrideStyle).length === 0;
  const currentBackground = activeAppearance.scenes[scene].background;

  useEffect(() => {
    beginAppearancePreview(mode);
    void loadImportedFonts().then(setFonts);
  }, [beginAppearancePreview, mode]);

  useEffect(() => {
    setPreviewScene(scene);
    const nextDefinitions = APPEARANCE_COMPONENTS.filter((item) => item.scene === scene);
    const nextDefinition = nextDefinitions[0];
    if (nextDefinition && !nextDefinitions.some((item) => item.id === componentId)) {
      setComponentId(nextDefinition.id);
      setSlot(nextDefinition.supportsSurface ? "__container" : (nextDefinition.slots[0]?.id ?? ""));
      setState("");
      setInstanceId("");
    }
  }, [componentId, scene, setPreviewScene]);

  useEffect(() => {
    const nextSlot = definition.supportsSurface ? "__container" : (definition.slots[0]?.id ?? "");
    setSlot(nextSlot);
    setState("");
    setInstanceId("");
  }, [definition.id, definition.slots, definition.supportsSurface]);

  const stylePath = (property?: string): string[] => {
    const branch = state
      ? ["states", state]
      : slot === "__container"
        ? ["container"]
        : ["slots", slot];
    const ownerPath = instanceId
      ? ["instances", "studyCountdown", instanceId]
      : ["scenes", scene, "components", definition.id];
    return [...ownerPath, ...branch, ...(property ? [property] : [])];
  };

  const updateStyle = (property: keyof AppearanceStyle, value: unknown) => {
    updateAppearanceDraft(stylePath(property), value);
  };

  const handleSceneReset = async () => {
    if (
      await confirm({
        title: "重置当前页面外观",
        description: `将清除${SCENE_OPTIONS.find((item) => item.value === scene)?.label}页面的全部外观覆盖。`,
        confirmLabel: "重置页面",
        variant: "danger",
      })
    ) {
      resetAppearance({ type: "scene", scene });
    }
  };

  const handleAllReset = async () => {
    if (
      await confirm({
        title: "重置全部外观",
        description: "四个页面的组件和背景外观都会恢复默认。",
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
      setFonts(await loadImportedFonts());
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

  const fontGroups = [
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

  return (
    <div className={styles.panel}>
      <FormSection title="预览页面" description="切换页面只影响预览，不会改变当前应用模式。">
        <FormSegmented
          value={scene}
          options={SCENE_OPTIONS.map((item) => ({ ...item }))}
          onChange={(value) => setScene(value as AppearanceSceneId)}
        />
      </FormSection>

      <div hidden={section !== "components"}>
        <FormSection title="组件样式" description="选择组件、子元素和状态后调整其独立外观。">
          <div className={styles.editorLayout}>
            <nav className={styles.componentList} aria-label="内容组件">
              {definitions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={item.id === definition.id ? styles.componentActive : styles.component}
                  aria-current={item.id === definition.id ? "page" : undefined}
                  onClick={() => setComponentId(item.id)}
                >
                  <strong>{item.label}</strong>
                  <span>{item.description}</span>
                </button>
              ))}
            </nav>
            <div className={styles.editor}>
              <SettingGrid className={styles.editorGrid} columns={2}>
                {definition.id === "studyCountdown" && countdownItems.length > 0 && (
                  <SettingItem icon={<Brush size={18} />} title="倒计时实例">
                    <Dropdown
                      label="选择实例"
                      value={instanceId}
                      options={[
                        { label: "组件默认样式", value: "" },
                        ...countdownItems.map((item) => ({
                          label: item.name || (item.kind === "gaokao" ? "高考倒计时" : item.id),
                          value: item.id,
                        })),
                      ]}
                      onChange={(value) => {
                        setInstanceId(String(value));
                        setState("");
                      }}
                    />
                  </SettingItem>
                )}
                <SettingItem icon={<Brush size={18} />} title="子元素">
                  <Dropdown
                    label="选择子元素"
                    value={slot}
                    options={slotOptions.map((item) => ({ label: item.label, value: item.value }))}
                    onChange={(value) => {
                      setSlot(String(value));
                      setState("");
                    }}
                  />
                </SettingItem>
                {definition.states && (
                  <SettingItem icon={<Palette size={18} />} title="状态覆盖">
                    <Dropdown
                      label="选择状态"
                      value={state}
                      options={[
                        { label: "默认状态", value: "" },
                        ...definition.states.map((item) => ({
                          label: item.label,
                          value: item.id,
                        })),
                      ]}
                      onChange={(value) => setState(String(value))}
                    />
                  </SettingItem>
                )}
              </SettingGrid>

              <InfoPanel tone="info">
                {isInheriting
                  ? "当前控件展示的是实际生效的内置或上级继承值；修改后才会创建覆盖。"
                  : "当前子元素包含自定义覆盖；未覆盖的属性继续显示继承后的实际值。"}
              </InfoPanel>

              {kind !== "surface" && (
                <SettingGrid className={styles.editorGrid} columns={2}>
                  <SettingItem icon={<Palette size={18} />} title="颜色">
                    <div className={styles.colorFields}>
                      <FormInput
                        label="色板"
                        type="color"
                        value={currentStyle.color ?? "#ffffff"}
                        onChange={(event) => updateStyle("color", event.target.value)}
                      />
                      <FormInput
                        label="颜色代码"
                        value={currentStyle.color ?? ""}
                        placeholder="无默认颜色"
                        onChange={(event) => updateStyle("color", event.target.value || undefined)}
                      />
                    </div>
                  </SettingItem>
                  <SettingItem icon={<Palette size={18} />} title="透明度">
                    <FormSlider
                      label="透明度"
                      min={0}
                      max={1}
                      step={0.01}
                      value={currentStyle.opacity ?? 1}
                      onChange={(value) => updateStyle("opacity", value)}
                      formatValue={(value) => `${Math.round(value * 100)}%`}
                    />
                  </SettingItem>
                </SettingGrid>
              )}

              {(kind === "text" || kind === "numeric") && (
                <SettingGrid className={styles.editorGrid} columns={2}>
                  <SettingItem icon={<Type size={18} />} title="字体">
                    <Dropdown
                      label="字体"
                      placeholder="跟随上级"
                      value={fontValue(currentStyle.font)}
                      groups={fontGroups}
                      onChange={(value) => updateStyle("font", fontFromValue(String(value), fonts))}
                    />
                  </SettingItem>
                  <SettingItem icon={<Type size={18} />} title="字重与字形">
                    <FormSlider
                      label="字重"
                      min={100}
                      max={900}
                      step={100}
                      value={currentStyle.fontWeight ?? 400}
                      onChange={(value) => updateStyle("fontWeight", value)}
                    />
                    <FormSwitch
                      checked={currentStyle.fontStyle === "italic"}
                      onCheckedChange={(checked) =>
                        updateStyle("fontStyle", checked ? "italic" : undefined)
                      }
                      aria-label="使用斜体"
                    />
                  </SettingItem>
                  <SettingItem icon={<FileText size={18} />} title="字间距">
                    <FormSlider
                      label="字间距"
                      min={0}
                      max={12}
                      step={0.25}
                      value={currentStyle.letterSpacing ?? 0}
                      onChange={(value) => updateStyle("letterSpacing", value)}
                      formatValue={(value) => `${value}px`}
                    />
                  </SettingItem>
                  <SettingItem icon={<Brush size={18} />} title="文字阴影">
                    <FormSwitch
                      checked={Boolean(currentStyle.textShadow)}
                      onCheckedChange={(checked) =>
                        updateStyle(
                          "textShadow",
                          checked
                            ? { color: "#000000", blur: 12, offsetX: 0, offsetY: 4 }
                            : undefined
                        )
                      }
                      aria-label="启用文字阴影"
                    />
                  </SettingItem>
                </SettingGrid>
              )}

              {kind === "icon" && (
                <SettingItem icon={<Brush size={18} />} title="图标效果">
                  <FormSegmented
                    value={currentStyle.filter ?? "none"}
                    options={[
                      { label: "默认", value: "none" },
                      { label: "灰度", value: "grayscale" },
                      { label: "复古", value: "sepia" },
                    ]}
                    onChange={(value) => updateStyle("filter", value)}
                  />
                </SettingItem>
              )}

              {kind === "surface" && (
                <SettingGrid className={styles.editorGrid} columns={2}>
                  <SettingItem icon={<Palette size={18} />} title="背景颜色">
                    <FormInput
                      label="背景颜色"
                      type="color"
                      value={currentStyle.backgroundColor ?? "#111317"}
                      onChange={(event) => updateStyle("backgroundColor", event.target.value)}
                    />
                    <FormSlider
                      label="背景透明度"
                      min={0}
                      max={1}
                      step={0.01}
                      value={currentStyle.backgroundOpacity ?? 1}
                      onChange={(value) => updateStyle("backgroundOpacity", value)}
                    />
                  </SettingItem>
                  <SettingItem icon={<Brush size={18} />} title="边框">
                    <FormInput
                      label="边框颜色"
                      type="color"
                      value={currentStyle.borderColor ?? "#ffffff"}
                      onChange={(event) => updateStyle("borderColor", event.target.value)}
                    />
                    <FormSlider
                      label="边框宽度"
                      min={0}
                      max={8}
                      step={1}
                      value={currentStyle.borderWidth ?? 0}
                      onChange={(value) => updateStyle("borderWidth", value)}
                      formatValue={(value) => `${value}px`}
                    />
                  </SettingItem>
                  <SettingItem icon={<Brush size={18} />} title="圆角">
                    <FormSlider
                      label="圆角"
                      min={0}
                      max={32}
                      step={1}
                      value={currentStyle.borderRadius ?? 0}
                      onChange={(value) => updateStyle("borderRadius", value)}
                      formatValue={(value) => `${value}px`}
                    />
                  </SettingItem>
                  <SettingItem icon={<Brush size={18} />} title="背景模糊">
                    <FormSlider
                      label="模糊"
                      min={0}
                      max={40}
                      step={1}
                      value={currentStyle.backdropBlur ?? 0}
                      onChange={(value) => updateStyle("backdropBlur", value)}
                      formatValue={(value) => `${value}px`}
                    />
                  </SettingItem>
                </SettingGrid>
              )}

              {colorContrastWarning && (
                <InfoPanel tone="warning">
                  当前文字与页面背景的对比度较低，可能影响可读性。
                </InfoPanel>
              )}

              <FormButtonGroup align="left">
                <FormButton
                  variant="secondary"
                  icon={<RotateCcw size={16} />}
                  onClick={() => resetAppearance({ type: "property", path: stylePath() })}
                >
                  重置当前子元素
                </FormButton>
                <FormButton
                  variant="secondary"
                  icon={<RotateCcw size={16} />}
                  onClick={() =>
                    instanceId
                      ? resetAppearance({
                          type: "property",
                          path: ["instances", "studyCountdown", instanceId],
                        })
                      : resetAppearance({ type: "component", scene, componentId: definition.id })
                  }
                >
                  {instanceId ? "重置实例" : "重置组件"}
                </FormButton>
              </FormButtonGroup>
            </div>
          </div>
        </FormSection>
      </div>

      <div hidden={section !== "background"}>
        <FormSection title="页面背景" description="每个页面独立保存背景来源。">
          <SettingItem icon={<ImageIcon size={18} />} title="背景类型">
            <FormSegmented
              value={currentBackground.type}
              options={[
                { label: "默认", value: "default" },
                { label: "纯黑", value: "black" },
                { label: "深灰", value: "dark" },
                { label: "纯色", value: "color" },
                { label: "图片", value: "image" },
              ]}
              onChange={(value) =>
                updateAppearanceDraft(["scenes", scene, "background", "type"], value)
              }
            />
          </SettingItem>
          {currentBackground.type === "color" && (
            <SettingGrid className={styles.editorGrid} columns={2}>
              <SettingItem icon={<Palette size={18} />} title="背景颜色">
                <FormInput
                  label="背景颜色"
                  type="color"
                  value={currentBackground.color ?? "#121212"}
                  onChange={(event) =>
                    updateAppearanceDraft(
                      ["scenes", scene, "background", "color"],
                      event.target.value
                    )
                  }
                />
              </SettingItem>
              <SettingItem icon={<Palette size={18} />} title="背景透明度">
                <FormSlider
                  label="背景透明度"
                  min={0}
                  max={1}
                  step={0.01}
                  value={currentBackground.colorAlpha ?? 1}
                  onChange={(value) =>
                    updateAppearanceDraft(["scenes", scene, "background", "colorAlpha"], value)
                  }
                  formatValue={(value) => `${Math.round(value * 100)}%`}
                />
              </SettingItem>
            </SettingGrid>
          )}
          {currentBackground.type === "image" && (
            <SettingItem icon={<Upload size={18} />} title="背景图片">
              <FormInput
                label="选择图片"
                type="file"
                accept="image/*"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  try {
                    const asset = await saveBackgroundAsset(file);
                    updateAppearanceDraft(["scenes", scene, "background"], {
                      type: "image",
                      assetId: asset.id,
                      imageFileName: asset.name,
                    });
                  } catch (error) {
                    notify({
                      variant: "danger",
                      title: "背景图片导入失败",
                      description: error instanceof Error ? error.message : "无法读取图片",
                    });
                  }
                }}
              />
              {currentBackground.imageFileName && (
                <InfoPanel tone="info">当前图片：{currentBackground.imageFileName}</InfoPanel>
              )}
            </SettingItem>
          )}
        </FormSection>
      </div>

      <div hidden={section !== "fonts"}>
        <FormSection title="全局字体" description="组件未单独指定字体时继承这里的设置。">
          <SettingGrid className={styles.editorGrid} columns={2}>
            {(["numeric", "text"] as const).map((category) => (
              <SettingItem
                key={category}
                icon={category === "numeric" ? <Type size={18} /> : <FileText size={18} />}
                title={category === "numeric" ? "数字字体" : "文本字体"}
              >
                <Dropdown
                  label={category === "numeric" ? "数字字体" : "文本字体"}
                  placeholder="跟随应用默认"
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
        <FormSection title="导入字体" description="字体文件保存在本机 IndexedDB 中。">
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
          <FormButton icon={<Upload size={16} />} onClick={handleFontImport}>
            导入字体
          </FormButton>
          {fonts.length > 0 && (
            <div className={styles.fontList}>
              {fonts.map((font) => (
                <div key={font.id} className={styles.fontRow}>
                  <span style={{ fontFamily: font.family }}>{font.family}</span>
                  <FormButton
                    variant="secondary"
                    icon={<Trash2 size={15} />}
                    aria-label={`删除字体 ${font.family}`}
                    onClick={async () => {
                      await removeImportedFont(font.id);
                      setFonts(await loadImportedFonts());
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </FormSection>
      </div>

      <FormSection title="重置外观" description="重置只修改草稿，点击保存后才会生效。">
        <FormButtonGroup align="left">
          <FormButton variant="secondary" icon={<RotateCcw size={16} />} onClick={handleSceneReset}>
            重置当前页面
          </FormButton>
          <FormButton variant="danger" icon={<Trash2 size={16} />} onClick={handleAllReset}>
            重置全部外观
          </FormButton>
        </FormButtonGroup>
      </FormSection>
    </div>
  );
}
