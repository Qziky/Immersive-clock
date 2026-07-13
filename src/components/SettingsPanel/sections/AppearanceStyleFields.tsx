import { Brush, FileText, Palette, RotateCcw, Type } from "lucide-react";
import type { ReactNode } from "react";

import type { AppearanceSlotKind, AppearanceStyle } from "../../../types/appearance";
import {
  Dropdown,
  type DropdownGroup,
  IconButton,
  Input,
  RadioGroup,
  SettingGrid,
  SettingItem,
  Slider,
  Switch,
} from "../../../ui";

import styles from "./AppearanceSettingsPanel.module.css";

interface AppearanceStyleFieldsProps {
  fontGroups: DropdownGroup[];
  kind: AppearanceSlotKind;
  onFontChange: (value: string) => void;
  onReset: (property: keyof AppearanceStyle) => void;
  onUpdate: (property: keyof AppearanceStyle, value: unknown) => void;
  overrideStyle: AppearanceStyle;
  simpleOnly?: boolean;
  style: AppearanceStyle;
}

interface PropertySettingProps {
  children: ReactNode;
  icon: ReactNode;
  overridden: boolean;
  onReset: () => void;
  title: string;
}

function fontValue(style: AppearanceStyle): string {
  const font = style.font;
  return font ? `${font.source}:${font.id}` : "";
}

function PropertySetting({ children, icon, overridden, onReset, title }: PropertySettingProps) {
  return (
    <SettingItem
      icon={icon}
      tone={overridden ? "accent" : "neutral"}
      title={
        <span className={styles.propertyTitle}>
          <span>{title}</span>
          {overridden ? (
            <>
              <span className={styles.overrideDot} aria-hidden="true" />
              <IconButton
                className={styles.propertyReset}
                aria-label={`恢复${title}`}
                icon={<RotateCcw size={13} aria-hidden="true" />}
                title={`恢复${title}`}
                onClick={onReset}
              />
            </>
          ) : null}
        </span>
      }
    >
      {children}
    </SettingItem>
  );
}

export function AppearanceStyleFields({
  fontGroups,
  kind,
  onFontChange,
  onReset,
  onUpdate,
  overrideStyle,
  simpleOnly = false,
  style,
}: AppearanceStyleFieldsProps) {
  const isText = kind === "text" || kind === "numeric";

  if (kind === "surface") {
    return (
      <div className={styles.styleGroups}>
        <section className={styles.styleGroup} aria-label="常用容器设置">
          <h4>常用设置</h4>
          <SettingGrid className={styles.editorGrid} columns={2}>
            <PropertySetting
              icon={<Palette size={18} />}
              overridden={overrideStyle.backgroundColor !== undefined}
              title="背景颜色"
              onReset={() => onReset("backgroundColor")}
            >
              <Input
                label="背景颜色"
                type="color"
                value={style.backgroundColor ?? "#111317"}
                onChange={(event) => onUpdate("backgroundColor", event.target.value)}
              />
            </PropertySetting>
            <PropertySetting
              icon={<Palette size={18} />}
              overridden={overrideStyle.backgroundOpacity !== undefined}
              title="背景透明度"
              onReset={() => onReset("backgroundOpacity")}
            >
              <Slider
                label="背景透明度"
                min={0}
                max={1}
                step={0.01}
                value={style.backgroundOpacity ?? 1}
                onChange={(value) => onUpdate("backgroundOpacity", value)}
                formatValue={(value) => `${Math.round(value * 100)}%`}
              />
            </PropertySetting>
            <PropertySetting
              icon={<Brush size={18} />}
              overridden={overrideStyle.borderRadius !== undefined}
              title="圆角"
              onReset={() => onReset("borderRadius")}
            >
              <Slider
                label="圆角"
                min={0}
                max={32}
                step={1}
                value={style.borderRadius ?? 0}
                onChange={(value) => onUpdate("borderRadius", value)}
                formatValue={(value) => `${value}px`}
              />
            </PropertySetting>
          </SettingGrid>
        </section>
        {!simpleOnly ? (
          <details className={styles.advancedSettings}>
            <summary>更多容器设置</summary>
            <SettingGrid className={styles.editorGrid} columns={2}>
              <PropertySetting
                icon={<Brush size={18} />}
                overridden={overrideStyle.borderColor !== undefined}
                title="边框颜色"
                onReset={() => onReset("borderColor")}
              >
                <Input
                  label="边框颜色"
                  type="color"
                  value={style.borderColor ?? "#ffffff"}
                  onChange={(event) => onUpdate("borderColor", event.target.value)}
                />
              </PropertySetting>
              <PropertySetting
                icon={<Brush size={18} />}
                overridden={overrideStyle.borderWidth !== undefined}
                title="边框宽度"
                onReset={() => onReset("borderWidth")}
              >
                <Slider
                  label="边框宽度"
                  min={0}
                  max={8}
                  step={1}
                  value={style.borderWidth ?? 0}
                  onChange={(value) => onUpdate("borderWidth", value)}
                  formatValue={(value) => `${value}px`}
                />
              </PropertySetting>
              <PropertySetting
                icon={<Brush size={18} />}
                overridden={overrideStyle.backdropBlur !== undefined}
                title="背景模糊"
                onReset={() => onReset("backdropBlur")}
              >
                <Slider
                  label="背景模糊"
                  min={0}
                  max={40}
                  step={1}
                  value={style.backdropBlur ?? 0}
                  onChange={(value) => onUpdate("backdropBlur", value)}
                  formatValue={(value) => `${value}px`}
                />
              </PropertySetting>
            </SettingGrid>
          </details>
        ) : null}
      </div>
    );
  }

  return (
    <div className={styles.styleGroups}>
      <section className={styles.styleGroup} aria-label="常用内容设置">
        <h4>常用设置</h4>
        <SettingGrid className={styles.editorGrid} columns={2}>
          <PropertySetting
            icon={<Palette size={18} />}
            overridden={overrideStyle.color !== undefined}
            title="颜色"
            onReset={() => onReset("color")}
          >
            <div className={styles.colorFields}>
              <Input
                label="色板"
                type="color"
                value={style.color ?? "#ffffff"}
                onChange={(event) => onUpdate("color", event.target.value)}
              />
              <Input
                label="颜色代码"
                value={style.color ?? ""}
                placeholder="使用当前颜色"
                onChange={(event) => onUpdate("color", event.target.value || undefined)}
              />
            </div>
          </PropertySetting>
          <PropertySetting
            icon={<Palette size={18} />}
            overridden={overrideStyle.opacity !== undefined}
            title="透明度"
            onReset={() => onReset("opacity")}
          >
            <Slider
              label="透明度"
              min={0}
              max={1}
              step={0.01}
              value={style.opacity ?? 1}
              onChange={(value) => onUpdate("opacity", value)}
              formatValue={(value) => `${Math.round(value * 100)}%`}
            />
          </PropertySetting>
          {isText && !simpleOnly ? (
            <>
              <PropertySetting
                icon={<Type size={18} />}
                overridden={overrideStyle.font !== undefined}
                title="字体"
                onReset={() => onReset("font")}
              >
                <Dropdown
                  label="字体"
                  placeholder="使用整体字体"
                  value={fontValue(style)}
                  groups={fontGroups}
                  onChange={(value) => onFontChange(String(value ?? ""))}
                />
              </PropertySetting>
              <PropertySetting
                icon={<Type size={18} />}
                overridden={overrideStyle.fontWeight !== undefined}
                title="字重"
                onReset={() => onReset("fontWeight")}
              >
                <Slider
                  label="字重"
                  min={100}
                  max={900}
                  step={100}
                  value={style.fontWeight ?? 400}
                  onChange={(value) => onUpdate("fontWeight", value)}
                />
              </PropertySetting>
            </>
          ) : null}
          {kind === "icon" && !simpleOnly ? (
            <PropertySetting
              icon={<Brush size={18} />}
              overridden={overrideStyle.filter !== undefined}
              title="图标效果"
              onReset={() => onReset("filter")}
            >
              <RadioGroup
                value={style.filter ?? "none"}
                variant="segmented"
                options={[
                  { label: "默认", value: "none" },
                  { label: "灰度", value: "grayscale" },
                  { label: "复古", value: "sepia" },
                ]}
                onChange={(value) => onUpdate("filter", value)}
              />
            </PropertySetting>
          ) : null}
        </SettingGrid>
      </section>

      {isText && !simpleOnly ? (
        <details className={styles.advancedSettings}>
          <summary>更多文字设置</summary>
          <SettingGrid className={styles.editorGrid} columns={2}>
            <PropertySetting
              icon={<Type size={18} />}
              overridden={overrideStyle.fontStyle !== undefined}
              title="斜体"
              onReset={() => onReset("fontStyle")}
            >
              <Switch
                checked={style.fontStyle === "italic"}
                onCheckedChange={(checked) => onUpdate("fontStyle", checked ? "italic" : undefined)}
                aria-label="使用斜体"
              />
            </PropertySetting>
            <PropertySetting
              icon={<FileText size={18} />}
              overridden={overrideStyle.letterSpacing !== undefined}
              title="字间距"
              onReset={() => onReset("letterSpacing")}
            >
              <Slider
                label="字间距"
                min={0}
                max={12}
                step={0.25}
                value={style.letterSpacing ?? 0}
                onChange={(value) => onUpdate("letterSpacing", value)}
                formatValue={(value) => `${value}px`}
              />
            </PropertySetting>
            <PropertySetting
              icon={<Brush size={18} />}
              overridden={overrideStyle.textShadow !== undefined}
              title="文字阴影"
              onReset={() => onReset("textShadow")}
            >
              <Switch
                checked={Boolean(style.textShadow)}
                onCheckedChange={(checked) =>
                  onUpdate(
                    "textShadow",
                    checked ? { color: "#000000", blur: 12, offsetX: 0, offsetY: 4 } : undefined
                  )
                }
                aria-label="启用文字阴影"
              />
            </PropertySetting>
          </SettingGrid>
        </details>
      ) : null}
    </div>
  );
}
