import type { ComponentType } from "react";
import { useState } from "react";

import {
  APP_ICON_SIZES,
  Alert,
  AppIcon,
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  Dropdown,
  FeedbackProvider,
  Field,
  FormSection,
  Grid,
  IconButton,
  InfoPanel,
  Inline,
  Input,
  KeyboardShortcut,
  ListItem,
  Menu,
  MetricCard,
  Modal,
  Popover,
  Portal,
  Progress,
  RadioGroup,
  Select,
  SettingGrid,
  SettingItem,
  SettingsShell,
  Slider,
  Stack,
  StatusPill,
  Stepper,
  Switch,
  Tabs,
  Textarea,
  TimePicker,
  Toast,
  ToastViewport,
  Tooltip,
  VisuallyHidden,
  useFeedback,
  type AppIconName,
  type AppIconSize,
  type ButtonOverlayEmphasis,
  type ButtonVariant,
  type ConfirmDialogProps,
  type IconButtonProps,
  type ModalProps,
  type RadioGroupProps,
  type TabsProps,
  type TimePickerValue,
  type ToastMessage,
} from "../../ui";
import { APP_ICON_NAMES } from "../../ui/icons/appIconRegistry";

import styles from "./DesignSystemPage.module.css";

export const COMPONENT_CATALOG_SECTIONS = [
  { id: "foundation", label: "设计基础", description: "令牌、图标、布局与可访问性" },
  { id: "actions", label: "操作控件", description: "命令、选择与数值调整" },
  { id: "forms", label: "表单输入", description: "字段、输入和设置表单" },
  { id: "feedback", label: "反馈浮层", description: "状态、通知、确认与浮层" },
  { id: "navigation", label: "导航列表", description: "选项卡、列表与设置导航" },
  { id: "compositions", label: "公共组合", description: "跨功能复用的信息和设置组合" },
] as const;

export type ComponentCatalogSection = (typeof COMPONENT_CATALOG_SECTIONS)[number]["id"];
export type ComponentCatalogKind =
  | "visual"
  | "foundation"
  | "behavior"
  | "infrastructure"
  | "constant";

export interface ComponentCatalogExample {
  id: string;
  label: string;
  description?: string;
  covers: readonly string[];
  component: ComponentType;
}

export interface ComponentCatalogEntry {
  id: string;
  title: string;
  description: string;
  section: ComponentCatalogSection;
  kind: ComponentCatalogKind;
  publicExports: readonly string[];
  requiredStates: readonly string[];
  examples: readonly ComponentCatalogExample[];
  coveredBy?: readonly string[];
  reason?: string;
}

const COLOR_TOKENS = [
  ["--ui-color-bg", "页面背景"],
  ["--ui-color-bg-raised", "抬升表面"],
  ["--ui-color-bg-elevated", "浮层表面"],
  ["--ui-color-border", "边框"],
  ["--ui-color-text-muted", "次要文本"],
  ["--ui-color-text", "主要文本"],
  ["--ui-color-accent", "强调"],
  ["--ui-color-success", "成功"],
  ["--ui-color-warning", "警告"],
  ["--ui-color-danger", "危险"],
  ["--ui-color-static-white", "静态白色"],
] as const;

const SPACE_TOKENS = [
  "--ui-space-1",
  "--ui-space-2",
  "--ui-space-3",
  "--ui-space-4",
  "--ui-space-5",
] as const;

const MOTION_TOKENS = [
  ["--ui-motion-duration-fast", "悬停与焦点"],
  ["--ui-motion-duration-normal", "常规状态切换"],
  ["--ui-motion-duration-slow", "强调进入"],
  ["--ui-motion-duration-exit", "退出卸载"],
  ["--ui-motion-duration-ambient-fast", "环境动效：快速"],
  ["--ui-motion-duration-ambient-normal", "环境动效：常规"],
  ["--ui-motion-duration-ambient-slow", "环境动效：缓慢"],
  ["--ui-motion-ease-ambient", "环境动效缓动"],
  ["--ui-motion-hover-scale", "悬停轻微放大"],
  ["--ui-transition-gentle", "柔和交互过渡"],
] as const;

const RADIUS_TOKENS = [["--ui-radius-round", "全圆角"]] as const;

const DROPDOWN_GROUPS = [
  {
    label: "页面",
    options: [
      { value: "clock", label: "时钟", description: "时间、日期与天气" },
      { value: "study", label: "自习", description: "专注统计与课程状态" },
      { value: "settings", label: "设置", description: "高密度参数面板" },
    ],
  },
  {
    label: "能力",
    options: [
      { value: "audio", label: "声音播报" },
      { value: "weather", label: "天气组件" },
      { value: "noise", label: "噪音监测", disabled: true },
    ],
  },
] as const;

const BUTTON_OVERLAY_STATE_BY_EMPHASIS = {
  subtle: "overlay-subtle",
  strong: "overlay-strong",
} satisfies Record<ButtonOverlayEmphasis, string>;

const BUTTON_STATE_BY_VARIANT = {
  primary: "primary",
  secondary: "secondary",
  ghost: "ghost",
  danger: "danger",
  success: "success",
  text: "text",
  minimal: "minimal",
  overlay: "overlay",
} satisfies Record<ButtonVariant, string>;

const ICON_BUTTON_STATE_BY_VARIANT = {
  default: "default",
  ghost: "ghost",
  danger: "danger",
  overlay: "overlay",
  minimal: "minimal",
} satisfies Record<NonNullable<IconButtonProps["variant"]>, string>;

const RADIO_GROUP_STATE_BY_VARIANT = {
  segmented: "segmented",
  list: "list",
} satisfies Record<NonNullable<RadioGroupProps["variant"]>, string>;

const CONFIRM_DIALOG_STATE_BY_VARIANT = {
  default: "default",
  danger: "danger",
} satisfies Record<NonNullable<ConfirmDialogProps["variant"]>, string>;

const MODAL_WIDTH_STATE_BY_VALUE = {
  sm: "width-sm",
  md: "width-md",
  lg: "width-lg",
  xl: "width-xl",
  xxl: "width-xxl",
} satisfies Record<NonNullable<ModalProps["width"]>, string>;

const MODAL_PLACEMENT_STATE_BY_VALUE = {
  center: "placement-center",
  left: "placement-left",
} satisfies Record<NonNullable<ModalProps["placement"]>, string>;

const MODAL_SURFACE_STATE_BY_VALUE = {
  default: "surface-default",
  strong: "surface-strong",
} satisfies Record<NonNullable<ModalProps["surface"]>, string>;

const MODAL_BODY_PADDING_STATE_BY_VALUE = {
  default: "body-padding-default",
  compact: "body-padding-compact",
  none: "body-padding-none",
} satisfies Record<NonNullable<ModalProps["bodyPadding"]>, string>;

const MODAL_FOOTER_PADDING_STATE_BY_VALUE = {
  default: "footer-padding-default",
  compact: "footer-padding-compact",
} satisfies Record<NonNullable<ModalProps["footerPadding"]>, string>;

const TABS_VARIANT_STATE_BY_VALUE = {
  underlined: "underlined",
  pill: "pill",
  browser: "browser",
  announcement: "announcement",
  overlay: "overlay",
} satisfies Record<NonNullable<TabsProps["variant"]>, string>;

const TABS_SIZE_STATE_BY_VALUE = {
  sm: "size-sm",
  md: "size-md",
  lg: "size-lg",
} satisfies Record<NonNullable<TabsProps["size"]>, string>;

type ModalWidth = NonNullable<ModalProps["width"]>;
type ModalPlacement = NonNullable<ModalProps["placement"]>;
type ModalSurface = NonNullable<ModalProps["surface"]>;
type ModalBodyPadding = NonNullable<ModalProps["bodyPadding"]>;
type ModalFooterPadding = NonNullable<ModalProps["footerPadding"]>;
type ModalHeaderMode = "divider" | "flat" | "hidden";

const MODAL_WIDTH_OPTIONS = (Object.keys(MODAL_WIDTH_STATE_BY_VALUE) as ModalWidth[]).map(
  (value) => ({ value, label: value.toUpperCase() })
);

const MODAL_PLACEMENT_OPTIONS = [
  { value: "center", label: "居中" },
  { value: "left", label: "左侧抽屉" },
] satisfies Array<{ value: ModalPlacement; label: string }>;

const MODAL_SURFACE_OPTIONS = [
  { value: "default", label: "默认玻璃" },
  { value: "strong", label: "高对比玻璃" },
] satisfies Array<{ value: ModalSurface; label: string }>;

const MODAL_HEADER_OPTIONS = [
  { value: "divider", label: "标准标题栏" },
  { value: "flat", label: "无标题分隔" },
  { value: "hidden", label: "隐藏标题栏" },
] satisfies Array<{ value: ModalHeaderMode; label: string }>;

const MODAL_BODY_PADDING_OPTIONS = [
  { value: "default", label: "默认" },
  { value: "compact", label: "紧凑" },
  { value: "none", label: "无" },
] satisfies Array<{ value: ModalBodyPadding; label: string }>;

const MODAL_FOOTER_PADDING_OPTIONS = [
  { value: "default", label: "默认" },
  { value: "compact", label: "紧凑" },
] satisfies Array<{ value: ModalFooterPadding; label: string }>;

function TokenExample() {
  return (
    <Stack gap="lg">
      <div className={styles.swatches}>
        {COLOR_TOKENS.map(([token, label]) => (
          <div className={styles.swatch} key={token}>
            <span className={styles.swatchColor} style={{ background: `var(${token})` }} />
            <strong>{label}</strong>
            <code>{token}</code>
          </div>
        ))}
        {RADIUS_TOKENS.map(([token, label]) => (
          <div className={styles.swatch} key={token}>
            <span
              className={styles.swatchColor}
              style={{
                background: "var(--ui-color-bg-elevated)",
                borderRadius: `var(${token})`,
              }}
            />
            <strong>{label}</strong>
            <code>{token}</code>
          </div>
        ))}
      </div>
      <Inline>
        {SPACE_TOKENS.map((token) => (
          <span className={styles.spaceToken} key={token}>
            <i style={{ height: `var(${token})`, width: `var(${token})` }} />
            <code>{token}</code>
          </span>
        ))}
      </Inline>
      <div className={styles.motionTokenGrid}>
        {MOTION_TOKENS.map(([token, usage]) => (
          <div className={styles.motionToken} key={token}>
            <code>{token}</code>
            <span>{usage}</span>
          </div>
        ))}
      </div>
    </Stack>
  );
}

function IconSizeExample() {
  return (
    <div className={styles.iconGrid}>
      {(Object.entries(APP_ICON_SIZES) as Array<[AppIconSize, number]>).map(([size, pixels]) => (
        <span className={styles.iconItem} key={size}>
          <AppIcon name="feature.time" size={size} />
          <code>{size}</code>
          <small>{pixels}px</small>
        </span>
      ))}
    </div>
  );
}

function IconRegistryExample() {
  return (
    <div className={styles.iconRegistry}>
      {APP_ICON_NAMES.map((name) => (
        <span className={styles.iconItem} key={name}>
          <AppIcon name={name} />
          <code>{name}</code>
        </span>
      ))}
    </div>
  );
}

function AccessibilityExample() {
  return (
    <Stack>
      <Inline>
        <KeyboardShortcut keys={["Ctrl", "K"]} />
        <KeyboardShortcut keys={["Shift", "Tab"]} label="反向移动焦点" />
        <Button icon="feature.command">
          <VisuallyHidden>打开</VisuallyHidden>
          快捷命令
        </Button>
      </Inline>
      <Alert variant="info">隐藏文本仍为图标和快捷操作提供完整名称。</Alert>
    </Stack>
  );
}

function LayoutExample() {
  return (
    <Stack gap="lg">
      <Inline>
        <Badge>Inline</Badge>
        <Badge variant="accent">可换行</Badge>
        <Badge variant="success">间距稳定</Badge>
      </Inline>
      <Grid minColumnWidth={160}>
        <InfoPanel title="自动列">内容一</InfoPanel>
        <InfoPanel title="响应式">内容二</InfoPanel>
        <InfoPanel title="窄屏单列">一段用于验证长内容换行而不撑破网格的确定性文案。</InfoPanel>
      </Grid>
    </Stack>
  );
}

function CardExample() {
  return (
    <Grid minColumnWidth={180}>
      <Card>
        <strong>抬高表面</strong>
        <p className={styles.muted}>默认使用 raised 表面，并渲染为 div。</p>
      </Card>
      <Card as="article" surface="base">
        <strong>基础表面</strong>
        <p className={styles.muted}>使用 base 表面和 article 语义。</p>
      </Card>
      <Card as="section" padded={false}>
        <div className={styles.unpaddedCardContent}>无内边距 section，由消费者负责内容布局。</div>
      </Card>
    </Grid>
  );
}

function ButtonExample() {
  return (
    <Stack>
      <Inline>
        <Button variant="primary">主要</Button>
        <Button variant="secondary">次要</Button>
        <Button variant="ghost">幽灵</Button>
        <Button variant="text">文本</Button>
        <Button variant="minimal">极简</Button>
        <Button variant="success">成功</Button>
        <Button variant="danger">危险</Button>
      </Inline>
      <div className={styles.overlayStage}>
        <Inline>
          {(Object.keys(BUTTON_OVERLAY_STATE_BY_EMPHASIS) as ButtonOverlayEmphasis[]).map(
            (emphasis) => (
              <Button
                key={emphasis}
                variant="overlay"
                overlayEmphasis={emphasis}
                icon={emphasis === "strong" ? "action.apply" : "action.configure"}
              >
                {emphasis === "strong" ? "强覆盖层" : "弱覆盖层"}
              </Button>
            )
          )}
        </Inline>
      </div>
      <Inline>
        <Button size="sm" icon="action.add">
          小
        </Button>
        <Button size="md">中</Button>
        <Button size="lg">大</Button>
        <Button loading>保存中</Button>
        <Button disabled>不可用</Button>
        <Button>这是用于验证按钮长标签换行和稳定高度的文本</Button>
      </Inline>
    </Stack>
  );
}

function IconButtonExample() {
  return (
    <Stack>
      <Inline>
        <IconButton icon="action.configure" aria-label="小型默认设置按钮" size="sm" />
        <IconButton icon="feature.audio" aria-label="中型幽灵声音按钮" size="md" variant="ghost" />
        <IconButton icon="action.delete" aria-label="大型危险删除按钮" size="lg" variant="danger" />
        <IconButton icon="status.help" aria-label="极简 HUD 帮助按钮" variant="minimal" />
        <IconButton icon="feature.notification" aria-label="已选择通知按钮" pressed />
        <IconButton icon="feature.sync" aria-label="加载同步按钮" loading />
        <IconButton icon="feature.weather" aria-label="禁用天气按钮" disabled />
      </Inline>
      <div className={styles.overlayStage}>
        <Inline>
          <IconButton icon="action.minimize" aria-label="覆盖层最小化按钮" variant="overlay" />
          <IconButton icon="action.maximize" aria-label="覆盖层最大化按钮" variant="overlay" />
        </Inline>
      </div>
    </Stack>
  );
}

function SelectionExample() {
  const [checked, setChecked] = useState(true);
  const [radio, setRadio] = useState("auto");
  const [listRadio, setListRadio] = useState("day");
  const [switchValue, setSwitchValue] = useState(true);

  return (
    <Grid minColumnWidth={220}>
      <Stack>
        <Checkbox
          label="记录专注状态"
          checked={checked}
          onChange={(event) => setChecked(event.target.checked)}
        />
        <Checkbox label="禁用选项" disabled />
        <Checkbox label="存在错误的选项" error="请先完成前置设置" />
      </Stack>
      <RadioGroup
        label="分段模式"
        value={radio}
        onChange={setRadio}
        options={[
          { value: "auto", label: "自动" },
          { value: "manual", label: "手动" },
          { value: "locked", label: "锁定", disabled: true },
        ]}
      />
      <RadioGroup
        label="列表模式"
        variant="list"
        value={listRadio}
        onChange={setListRadio}
        error="“计划进度”暂不可用"
        options={[
          { value: "day", label: "24 小时进度" },
          { value: "schedule", label: "课时与课间进度" },
          { value: "plan", label: "计划进度", disabled: true },
        ]}
      />
      <Stack>
        <Switch checked={switchValue} onCheckedChange={setSwitchValue} label="启用播报" />
        <Switch checked={false} onCheckedChange={() => undefined} label="不可用" disabled />
      </Stack>
    </Grid>
  );
}

function FieldInputExample() {
  const [fileName, setFileName] = useState("");

  return (
    <Grid minColumnWidth={240}>
      <Stack>
        <Input label="空值" placeholder="请输入计划名称" hint="最多 40 个字符" />
        <Input label="已有值" defaultValue="夜间专注计划" readOnly />
        <Input label="错误状态" defaultValue="无效内容" error="请检查输入内容" />
        <Input label="禁用状态" defaultValue="不可编辑" disabled />
      </Stack>
      <Stack>
        <Input
          label="搜索"
          type="search"
          prefix={<AppIcon name="action.search" size="sm" />}
          suffix="⌘K"
          placeholder="搜索组件"
        />
        <Input label="数值边界" type="number" defaultValue={30} min={1} max={120} suffix="min" />
        <Input
          label="导入配置"
          type="file"
          fileName={fileName}
          onFileChange={(file) => setFileName(file?.name ?? "")}
        />
        <Field label="Field 渲染函数" hint="关联自定义控件" error="确定性错误示例">
          {({ controlId, describedBy, invalid }) => (
            <Button
              id={controlId}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
            >
              自定义控件
            </Button>
          )}
        </Field>
      </Stack>
      <Textarea
        label="长文案"
        hint="最多 80 字"
        defaultValue="一段用于验证文本域、换行和长内容布局的确定性文案。"
        rows={5}
      />
    </Grid>
  );
}

function SelectDropdownExample() {
  const [single, setSingle] = useState<string | number>("study");
  const [multiple, setMultiple] = useState<Array<string | number>>(["audio", "weather"]);

  return (
    <Grid minColumnWidth={260}>
      <Stack>
        <Select
          label="原生选择"
          defaultValue="study"
          options={[
            { value: "clock", label: "时钟" },
            { value: "study", label: "自习" },
            { value: "settings", label: "设置" },
            { value: "disabled", label: "禁用项", disabled: true },
          ]}
        />
        <Select
          label="错误状态"
          error="请选择可用页面"
          options={[{ value: "", label: "请选择" }]}
        />
        <Select label="禁用状态" disabled options={[{ value: "clock", label: "时钟" }]} />
      </Stack>
      <Stack>
        <Dropdown
          label="分组单选"
          value={single}
          groups={DROPDOWN_GROUPS}
          searchable
          menuWidth={260}
          width="min(100%, 320px)"
          onChange={(value) => {
            if (typeof value === "string" || typeof value === "number") setSingle(value);
          }}
        />
        <Dropdown
          label="分组多选"
          mode="multiple"
          value={multiple}
          groups={DROPDOWN_GROUPS}
          searchable
          menuWidth={280}
          width="min(100%, 320px)"
          onChange={(value) => setMultiple(Array.isArray(value) ? value : [])}
        />
        <div className={styles.overlayStage}>
          <Dropdown
            variant="ghost"
            value="clock"
            options={DROPDOWN_GROUPS[0].options}
            menuWidth={220}
            width={180}
          />
        </div>
        <Dropdown
          label="禁用状态"
          disabled
          placeholder="不可选择"
          options={DROPDOWN_GROUPS[0].options}
        />
      </Stack>
    </Grid>
  );
}

function DropdownEdgeCasesExample() {
  return (
    <Grid minColumnWidth={240}>
      <Dropdown
        label="下拉错误状态"
        error="请选择一个可用的信息来源"
        options={DROPDOWN_GROUPS[0].options}
        width="min(100%, 320px)"
      />
      <Dropdown
        label="空搜索结果"
        searchable
        options={[]}
        menuWidth={280}
        width="min(100%, 320px)"
      />
    </Grid>
  );
}

function RangeTimeExample() {
  const [sliderValue, setSliderValue] = useState(55);
  const [stepperValue, setStepperValue] = useState(25);
  const [timeValue, setTimeValue] = useState<TimePickerValue>({
    hours: "12",
    minutes: "30",
    seconds: "00",
  });

  return (
    <Grid minColumnWidth={230}>
      <Stack>
        <Slider
          label="提醒阈值"
          min={30}
          max={80}
          value={sliderValue}
          onChange={setSliderValue}
          formatValue={(value) => `${value} dB`}
        />
        <Slider
          aria-label="禁用边界滑块"
          disabled
          min={0}
          max={0}
          value={0}
          onChange={() => undefined}
        />
      </Stack>
      <Stack>
        <Stepper
          label="专注分钟"
          value={stepperValue}
          onChange={setStepperValue}
          min={24}
          max={26}
          formatValue={(value) => `${value} min`}
        />
        <TimePicker value={timeValue} onChange={setTimeValue} />
      </Stack>
    </Grid>
  );
}

function FormSectionExample() {
  return (
    <Grid minColumnWidth={260}>
      <FormSection
        title="柔和分区"
        description="适合设置页面中的相关字段。"
        action={<Button size="sm">重置</Button>}
      >
        <Input label="计划名称" defaultValue="晨间计划" />
      </FormSection>
      <FormSection title="无底色分区" description="用于已经具有容器的上下文。" variant="plain">
        <Switch checked onCheckedChange={() => undefined} label="保持唤醒" />
      </FormSection>
    </Grid>
  );
}

function AlertBadgeExample() {
  return (
    <Stack>
      <Inline>
        <Badge variant="neutral">默认</Badge>
        <Badge variant="accent">组件库</Badge>
        <Badge variant="success" icon="status.success">
          已保存
        </Badge>
        <Badge variant="warning">待同步</Badge>
        <Badge variant="danger">异常</Badge>
      </Inline>
      <Alert variant="info">信息提示</Alert>
      <Alert variant="success">操作已完成</Alert>
      <Alert variant="warning">设置即将过期</Alert>
      <Alert variant="danger">无法读取配置</Alert>
    </Stack>
  );
}

function ProgressExample() {
  return (
    <Stack>
      <Progress value={0} label="空进度" />
      <Progress value={72} label="当前进度" />
      <Progress value={130} max={120} label="钳制后的进度" />
      <Progress value={1} max={0} label="无效最大值" />
    </Stack>
  );
}

function ToastExample() {
  return (
    <Stack>
      <Toast variant="info" title="信息通知" description="中央时间已同步。" />
      <Toast variant="success" title="设置已保存" onClose={() => undefined} />
      <Toast variant="warning" title="降雨临近" description="预计 20 分钟后开始。" />
      <Toast
        variant="danger"
        title="同步失败"
        description="请检查网络连接。"
        action={<Button size="sm">重试</Button>}
        onClose={() => undefined}
      />
    </Stack>
  );
}

function ToastViewportExample() {
  const [visible, setVisible] = useState(false);
  const toasts: readonly ToastMessage[] = visible
    ? [
        {
          id: "catalog-toast",
          revision: 1,
          variant: "info",
          title: "来自 ToastViewport 的通知",
          description: "最多显示三条，并在页面浮层中统一管理。",
          duration: null,
          action: (
            <Button size="sm" onClick={() => setVisible(false)}>
              完成
            </Button>
          ),
        },
      ]
    : [];

  return (
    <Inline>
      <Button variant="primary" onClick={() => setVisible(true)}>
        显示通知队列
      </Button>
      <Button variant="text" disabled={!visible} onClick={() => setVisible(false)}>
        清空
      </Button>
      <ToastViewport toasts={toasts} onDismiss={() => setVisible(false)} />
    </Inline>
  );
}

function ConfirmDialogExample() {
  const [openVariant, setOpenVariant] = useState<NonNullable<ConfirmDialogProps["variant"]> | null>(
    null
  );
  const [pending, setPending] = useState(false);

  return (
    <Inline>
      <Button variant="primary" onClick={() => setOpenVariant("default")}>
        打开常规确认
      </Button>
      <Button variant="danger" onClick={() => setOpenVariant("danger")}>
        打开危险确认
      </Button>
      <Switch checked={pending} onCheckedChange={setPending} label="待处理状态" />
      <ConfirmDialog
        isOpen={openVariant === "default"}
        title="应用组件设置？"
        description="常规确认使用主要操作按钮，并将取消操作作为初始焦点。"
        confirmLabel="应用"
        variant="default"
        pending={pending}
        onCancel={() => setOpenVariant(null)}
        onConfirm={() => setOpenVariant(null)}
      />
      <ConfirmDialog
        isOpen={openVariant === "danger"}
        title="删除本地记录？"
        description="此操作仅用于展示真实确认对话框，不会修改任何数据。"
        confirmLabel="删除"
        variant="danger"
        pending={pending}
        onCancel={() => setOpenVariant(null)}
        onConfirm={() => setOpenVariant(null)}
      />
    </Inline>
  );
}

function FeedbackConsumer() {
  const feedback = useFeedback();

  return (
    <Inline>
      <Button
        variant="success"
        onClick={() =>
          feedback.notify({
            id: "catalog-feedback",
            title: "Provider 通知",
            description: "由 useFeedback 调用并交给 ToastViewport 渲染。",
            variant: "success",
            duration: null,
          })
        }
      >
        调用 notify
      </Button>
      <Button
        onClick={() =>
          void feedback.confirm({
            title: "确认应用设置？",
            description: "该 Promise 会在用户选择后返回结果。",
          })
        }
      >
        调用 confirm
      </Button>
    </Inline>
  );
}

function FeedbackProviderExample() {
  return (
    <FeedbackProvider>
      <FeedbackConsumer />
    </FeedbackProvider>
  );
}

function ModalExample() {
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState<ModalWidth>("sm");
  const [placement, setPlacement] = useState<ModalPlacement>("center");
  const [surface, setSurface] = useState<ModalSurface>("default");
  const [headerMode, setHeaderMode] = useState<ModalHeaderMode>("divider");
  const [fullScreen, setFullScreen] = useState(false);
  const [bodyPadding, setBodyPadding] = useState<ModalBodyPadding>("compact");
  const [bodyDividers, setBodyDividers] = useState(true);
  const [footerPadding, setFooterPadding] = useState<ModalFooterPadding>("default");
  const [footerDivider, setFooterDivider] = useState(false);

  return (
    <Stack>
      <Grid minColumnWidth={180}>
        <Select
          label="宽度"
          value={width}
          options={MODAL_WIDTH_OPTIONS}
          onChange={(event) => setWidth(event.target.value as ModalWidth)}
        />
        <Select
          label="位置"
          value={placement}
          options={MODAL_PLACEMENT_OPTIONS}
          onChange={(event) => setPlacement(event.target.value as ModalPlacement)}
        />
        <Select
          label="表面"
          value={surface}
          options={MODAL_SURFACE_OPTIONS}
          onChange={(event) => setSurface(event.target.value as ModalSurface)}
        />
        <Select
          label="标题栏"
          value={headerMode}
          options={MODAL_HEADER_OPTIONS}
          onChange={(event) => setHeaderMode(event.target.value as ModalHeaderMode)}
        />
        <Select
          label="正文内边距"
          value={bodyPadding}
          options={MODAL_BODY_PADDING_OPTIONS}
          onChange={(event) => setBodyPadding(event.target.value as ModalBodyPadding)}
        />
        <Select
          label="页脚内边距"
          value={footerPadding}
          options={MODAL_FOOTER_PADDING_OPTIONS}
          onChange={(event) => setFooterPadding(event.target.value as ModalFooterPadding)}
        />
        <Stack gap="sm">
          <Switch checked={fullScreen} onCheckedChange={setFullScreen} label="全屏弹窗" />
          <Switch checked={bodyDividers} onCheckedChange={setBodyDividers} label="显示正文分隔线" />
          <Switch
            checked={footerDivider}
            onCheckedChange={setFooterDivider}
            label="显示页脚分隔线"
          />
        </Stack>
      </Grid>
      <Button variant="primary" onClick={() => setOpen(true)}>
        打开弹窗
      </Button>
      <Modal
        isOpen={open}
        title="弹窗组件"
        width={width}
        placement={placement}
        surface={surface}
        headerDivider={headerMode === "divider"}
        hideHeader={headerMode === "hidden"}
        fullScreen={fullScreen}
        bodyPadding={bodyPadding}
        bodyDividers={bodyDividers}
        bodyClassName={styles.modalBodyExample}
        footerPadding={footerPadding}
        footerDivider={footerDivider}
        onClose={() => setOpen(false)}
        footer={
          <Inline justify="flex-end">
            <Button onClick={() => setOpen(false)}>取消</Button>
            <Button variant="primary" onClick={() => setOpen(false)}>
              保存
            </Button>
          </Inline>
        }
      >
        <Stack gap="sm">
          <p className={styles.muted}>真实 Portal、焦点圈定、Escape 和焦点恢复行为。</p>
          <Inline gap="sm">
            <StatusPill tone="accent">{width.toUpperCase()}</StatusPill>
            <StatusPill tone="neutral">{placement === "left" ? "左侧" : "居中"}</StatusPill>
            <StatusPill tone="neutral">{fullScreen ? "全屏" : "窗口"}</StatusPill>
          </Inline>
        </Stack>
      </Modal>
    </Stack>
  );
}

function PopoverMenuTooltipExample() {
  return (
    <Inline>
      <Popover
        ariaLabel="外观快速设置"
        width={280}
        trigger={
          <>
            <AppIcon name="appearance.effects" size="sm" />
            <span>打开浮层</span>
          </>
        }
      >
        <Stack>
          <strong>快速设置</strong>
          <Switch checked onCheckedChange={() => undefined} label="减少动态效果" />
        </Stack>
      </Popover>
      <Menu
        triggerLabel="操作菜单"
        items={[
          { value: "edit", label: "编辑", icon: "action.edit" },
          { value: "sync", label: "同步", icon: "feature.sync", selected: true },
          { value: "disabled", label: "禁用项", disabled: true },
        ]}
      />
      <Tooltip content="Tooltip 用于解释图标按钮">
        <IconButton icon="status.help" aria-label="查看提示" />
      </Tooltip>
    </Inline>
  );
}

function TabsVariantsExample() {
  const [value, setValue] = useState("base");
  const items = [
    { value: "base", label: "基础", icon: "feature.appearance" as AppIconName },
    { value: "forms", label: "表单", icon: "feature.file" as AppIconName },
    { value: "feedback", label: "反馈", icon: "feature.notification" as AppIconName },
  ];
  const variants = [
    {
      id: "underlined",
      label: "下划线",
      description: "页面与内容分区",
      variant: "underlined" as const,
    },
    { id: "pill", label: "药丸", description: "紧凑模式切换", variant: "pill" as const },
    { id: "browser", label: "浏览器", description: "相邻工作区", variant: "browser" as const },
    {
      id: "announcement",
      label: "公告",
      description: "弹窗内导航",
      variant: "announcement" as const,
    },
    { id: "overlay", label: "覆盖层", description: "画布悬浮导航", variant: "overlay" as const },
  ];

  return (
    <div className={styles.tabsShowcase}>
      {variants.map((entry) => (
        <div className={styles.tabsShowcaseRow} key={entry.id}>
          <div className={styles.tabsShowcaseMeta}>
            <strong>{entry.label}</strong>
            <span>{entry.description}</span>
          </div>
          <div
            className={`${styles.tabsShowcaseControl} ${
              entry.variant === "overlay" ? styles.tabsShowcaseOverlay : ""
            }`}
          >
            <Tabs
              label={`${entry.label}选项卡`}
              variant={entry.variant}
              value={value}
              onChange={setValue}
              items={items}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function TabsStatesExample() {
  const [value, setValue] = useState("forms");
  const items = [
    { value: "base", label: "基础" },
    { value: "forms", label: "表单" },
  ];
  const rows = [
    { id: "sm", label: "小", size: "sm" as const, items, scrollable: true },
    {
      id: "md",
      label: "中",
      size: "md" as const,
      items: [...items, { value: "disabled", label: "禁用", disabled: true }],
      scrollable: true,
    },
    { id: "lg", label: "大 / 静态", size: "lg" as const, items, scrollable: false },
  ];

  return (
    <div className={styles.tabsShowcase}>
      {rows.map((entry) => (
        <div className={styles.tabsShowcaseRow} key={entry.id}>
          <div className={styles.tabsShowcaseMeta}>
            <strong>{entry.label}</strong>
            <span>{entry.size.toUpperCase()}</span>
          </div>
          <div className={styles.tabsShowcaseControl}>
            <Tabs
              label={`${entry.label}尺寸选项卡`}
              size={entry.size}
              scrollable={entry.scrollable}
              value={value}
              onChange={setValue}
              items={entry.items}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function TabsOverflowExample() {
  const [overflowValue, setOverflowValue] = useState("overview");
  const [stickyValue, setStickyValue] = useState("overview");
  const overflowItems = [
    { value: "overview", label: "组件总览" },
    { value: "interaction", label: "交互与键盘行为" },
    { value: "responsive", label: "响应式与窄屏布局" },
    { value: "accessibility", label: "无障碍语义" },
    { value: "visual", label: "视觉回归基线" },
  ];
  const stickyItems = [
    { value: "overview", label: "总览" },
    { value: "interaction", label: "交互" },
    { value: "responsive", label: "响应式" },
  ];

  return (
    <Grid minColumnWidth={280}>
      <Stack gap="sm">
        <strong>横向溢出</strong>
        <div className={styles.tabsOverflowStage}>
          <Tabs
            label="横向滚动选项卡"
            scrollable
            value={overflowValue}
            onChange={setOverflowValue}
            items={overflowItems}
          />
        </div>
      </Stack>
      <Stack gap="sm">
        <strong>滚动容器内吸顶</strong>
        <div
          className={styles.tabsStickyStage}
          ref={(element) => {
            if (element && element.scrollTop === 0) element.scrollTop = 56;
          }}
        >
          <p className={styles.tabsStickyLead}>滚动前内容</p>
          <Tabs
            label="吸顶选项卡"
            sticky
            scrollable
            value={stickyValue}
            onChange={setStickyValue}
            items={stickyItems}
          />
          <div className={styles.tabsStickyContent}>
            <InfoPanel title="当前区域">吸顶导航会保留在滚动容器顶部。</InfoPanel>
            <InfoPanel title="后续内容">继续滚动时，选项卡仍保持可见。</InfoPanel>
          </div>
        </div>
      </Stack>
    </Grid>
  );
}

function ListItemExample() {
  return (
    <Stack gap="sm">
      <ListItem
        title="系统通知"
        description="组件库公共入口发生变化时提醒用户。"
        icon="feature.notification"
        trailing={<Badge variant="success">新</Badge>}
      />
      <ListItem
        title="这是一条用于验证长标题、长描述和窄屏换行表现的列表项目"
        description="描述会保持清晰的信息层级，并为尾部状态留出稳定空间。"
        icon="feature.data"
        trailing={<StatusPill tone="warning">待同步</StatusPill>}
      />
      <ListItem title="禁用项目" icon="feature.privacy" disabled />
    </Stack>
  );
}

function SettingsCompositesExample() {
  const [enabled, setEnabled] = useState(true);

  return (
    <SettingGrid>
      <SettingItem
        icon="feature.notification"
        title="通知提醒"
        description="跨设置页面复用的标准行。"
        tone="accent"
        control={<Switch checked={enabled} onCheckedChange={setEnabled} aria-label="通知提醒" />}
      />
      <SettingItem
        icon="feature.audio"
        title="声音播报"
        description="缺少权限时保持可解释的禁用状态。"
        disabled
        control={
          <Switch
            checked={false}
            onCheckedChange={() => undefined}
            disabled
            aria-label="声音播报"
          />
        }
      />
      <SettingItem
        icon="feature.schedule"
        title="课程表来源"
        description="支持在行内承载更复杂的配置内容。"
      >
        <Dropdown
          value="local"
          options={[
            { value: "local", label: "本地课程表" },
            { value: "remote", label: "远程同步" },
          ]}
          menuWidth={220}
          width="min(100%, 260px)"
        />
      </SettingItem>
    </SettingGrid>
  );
}

function MetricsInfoExample() {
  return (
    <Stack>
      <SettingGrid columns={3}>
        <MetricCard
          icon="feature.studyMetrics"
          label="专注时长"
          value="125 min"
          meta="今日累计"
          tone="accent"
        />
        <MetricCard
          icon="feature.noise"
          label="环境噪音"
          value="42 dB"
          meta="安静"
          tone="success"
        />
        <MetricCard
          icon="feature.weatherWind"
          iconRotation={45}
          label="风速"
          value="3.2 m/s"
          meta="东北风"
          tone="info"
        />
      </SettingGrid>
      <Inline>
        <StatusPill tone="neutral">待机</StatusPill>
        <StatusPill tone="accent" icon="status.selected">
          当前
        </StatusPill>
        <StatusPill tone="success" icon="status.success">
          正常
        </StatusPill>
        <StatusPill tone="warning" icon="status.warning">
          注意
        </StatusPill>
        <StatusPill tone="danger" icon="status.error">
          异常
        </StatusPill>
      </Inline>
      <Grid minColumnWidth={220}>
        <InfoPanel tone="info" title="提示信息">
          课表范围外仍会忠实显示空进度。
        </InfoPanel>
        <InfoPanel tone="warning" title="较长内容">
          一段用于验证提示面板在窄屏下换行、保持标题层级并且不横向溢出的文案。
        </InfoPanel>
      </Grid>
    </Stack>
  );
}

function SettingsShellDemo({
  variant,
  disabled = false,
}: {
  variant?: "drawer";
  disabled?: boolean;
}) {
  const [activeItem, setActiveItem] = useState("appearance");

  return (
    <SettingsShell
      variant={variant}
      title={disabled ? "设置中心（整体禁用）" : "设置中心"}
      disabled={disabled}
      contentTitle="显示与外观"
      contentDescription="分组导航、紧凑 rail 和移动端抽屉由公共组合统一处理。"
      activeItem={activeItem}
      onItemChange={setActiveItem}
      groups={[
        {
          value: "display",
          label: "显示",
          description: "画布与界面外观",
          icon: "feature.appearance",
          items: [
            { value: "appearance", label: "外观", icon: "appearance.color" },
            { value: "clock", label: "时钟", icon: "feature.time" },
          ],
        },
        {
          value: "services",
          label: "服务",
          description: "设备与在线能力",
          icon: "feature.sync",
          items: [
            { value: "weather", label: "天气", icon: "feature.weather" },
            { value: "audio", label: "声音", icon: "feature.audio", disabled: true },
          ],
        },
        {
          value: "experiments",
          label: "实验功能",
          description: "当前环境不可用",
          icon: "feature.data",
          disabled: true,
          items: [{ value: "sync-lab", label: "同步实验", icon: "feature.sync" }],
        },
      ]}
      footer={
        <Inline justify="flex-end">
          <Button>取消</Button>
          <Button variant="primary">保存</Button>
        </Inline>
      }
    >
      <FormSection title="设置内容" description={`当前条目：${activeItem}`}>
        <Input label="字段" placeholder="输入内容" />
        <Switch checked onCheckedChange={() => undefined} label="开关项" />
      </FormSection>
    </SettingsShell>
  );
}

function SettingsShellExample() {
  return <SettingsShellDemo />;
}

function SettingsShellDrawerExample() {
  return <SettingsShellDemo variant="drawer" />;
}

function SettingsShellDisabledExample() {
  return <SettingsShellDemo disabled />;
}

function PortalExample() {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  return (
    <div ref={setContainer} className={styles.portalStage}>
      <span className={styles.muted}>下面的状态标签通过 Portal 渲染到这个明确容器：</span>
      {container && (
        <Portal container={container}>
          <StatusPill tone="accent" icon="status.selected">
            Portal 内容
          </StatusPill>
        </Portal>
      )}
    </div>
  );
}

function makeExample(
  id: string,
  label: string,
  covers: readonly string[],
  component: ComponentType,
  description?: string
): ComponentCatalogExample {
  return { id, label, covers, component, description };
}

export const COMPONENT_CATALOG: readonly ComponentCatalogEntry[] = [
  {
    id: "design-tokens",
    title: "Design tokens",
    description: "公共颜色、间距和动效只能从 tokens.css 取得。",
    section: "foundation",
    kind: "foundation",
    publicExports: [],
    requiredStates: ["color", "spacing", "radius", "motion", "ambient-motion"],
    examples: [
      makeExample(
        "token-matrix",
        "令牌矩阵",
        ["color", "spacing", "radius", "motion", "ambient-motion"],
        TokenExample
      ),
    ],
  },
  {
    id: "app-icon-sizes",
    title: "APP_ICON_SIZES",
    description: "语义图标尺寸的唯一运行时常量。",
    section: "foundation",
    kind: "constant",
    publicExports: ["APP_ICON_SIZES"],
    requiredStates: ["all-sizes"],
    examples: [makeExample("icon-size-matrix", "全部尺寸", ["all-sizes"], IconSizeExample)],
    coveredBy: ["app-icon"],
    reason: "尺寸常量通过 AppIcon 的真实 size API 展示。",
  },
  {
    id: "app-icon",
    title: "AppIcon",
    description: "展厅从语义注册表动态枚举全部图标名称。",
    section: "foundation",
    kind: "visual",
    publicExports: ["AppIcon"],
    requiredStates: ["all-semantics"],
    examples: [
      makeExample("semantic-icon-registry", "语义注册表", ["all-semantics"], IconRegistryExample),
    ],
  },
  {
    id: "accessibility",
    title: "KeyboardShortcut / VisuallyHidden",
    description: "为视觉精简的命令提供可读的快捷键和名称。",
    section: "foundation",
    kind: "foundation",
    publicExports: ["KeyboardShortcut", "VisuallyHidden"],
    requiredStates: ["shortcut", "custom-label", "hidden-name"],
    examples: [
      makeExample(
        "accessibility-helpers",
        "辅助语义",
        ["shortcut", "custom-label", "hidden-name"],
        AccessibilityExample
      ),
    ],
  },
  {
    id: "layout-primitives",
    title: "Stack / Inline / Grid",
    description: "统一间距、换行和响应式列布局。",
    section: "foundation",
    kind: "foundation",
    publicExports: ["Stack", "Inline", "Grid"],
    requiredStates: ["vertical", "horizontal", "responsive-grid", "long-content"],
    examples: [
      makeExample(
        "layout-composition",
        "组合布局",
        ["vertical", "horizontal", "responsive-grid", "long-content"],
        LayoutExample
      ),
    ],
  },
  {
    id: "card",
    title: "Card",
    description: "用于真正需要边界的独立内容，支持基础或抬高表面及受限语义元素。",
    section: "foundation",
    kind: "visual",
    publicExports: ["Card"],
    requiredStates: [
      "surface-raised",
      "surface-base",
      "padded",
      "unpadded",
      "div",
      "article",
      "section",
    ],
    examples: [
      makeExample(
        "card-semantics",
        "内边距与语义",
        ["surface-raised", "surface-base", "padded", "unpadded", "div", "article", "section"],
        CardExample
      ),
    ],
  },
  {
    id: "button",
    title: "Button",
    description: "统一命令按钮的优先级、尺寸、图标和等待状态。",
    section: "actions",
    kind: "visual",
    publicExports: ["Button"],
    requiredStates: [
      ...Object.values(BUTTON_STATE_BY_VARIANT),
      ...Object.values(BUTTON_OVERLAY_STATE_BY_EMPHASIS),
      "sizes",
      "icon",
      "loading",
      "disabled",
      "long-label",
    ],
    examples: [
      makeExample(
        "button-matrix",
        "公开状态",
        [
          ...Object.values(BUTTON_STATE_BY_VARIANT),
          ...Object.values(BUTTON_OVERLAY_STATE_BY_EMPHASIS),
          "sizes",
          "icon",
          "loading",
          "disabled",
          "long-label",
        ],
        ButtonExample
      ),
    ],
  },
  {
    id: "icon-button",
    title: "IconButton",
    description: "图标命令始终通过可访问名称表达行为。",
    section: "actions",
    kind: "visual",
    publicExports: ["IconButton"],
    requiredStates: [
      ...Object.values(ICON_BUTTON_STATE_BY_VARIANT),
      "size-sm",
      "size-md",
      "size-lg",
      "pressed",
      "loading",
      "disabled",
    ],
    examples: [
      makeExample(
        "icon-button-matrix",
        "公开状态",
        [
          ...Object.values(ICON_BUTTON_STATE_BY_VARIANT),
          "size-sm",
          "size-md",
          "size-lg",
          "pressed",
          "loading",
          "disabled",
        ],
        IconButtonExample
      ),
    ],
  },
  {
    id: "selection-controls",
    title: "Checkbox / RadioGroup / Switch",
    description: "二元和单选设置使用对应语义控件。",
    section: "actions",
    kind: "visual",
    publicExports: ["Checkbox", "RadioGroup", "Switch"],
    requiredStates: [
      "checked",
      "unchecked",
      ...Object.values(RADIO_GROUP_STATE_BY_VARIANT),
      "disabled",
      "error",
    ],
    examples: [
      makeExample(
        "selection-matrix",
        "选择状态",
        [
          "checked",
          "unchecked",
          ...Object.values(RADIO_GROUP_STATE_BY_VARIANT),
          "disabled",
          "error",
        ],
        SelectionExample
      ),
    ],
  },
  {
    id: "range-time-controls",
    title: "Slider / Stepper / TimePicker",
    description: "连续数值、离散步进和时间输入。",
    section: "actions",
    kind: "visual",
    publicExports: ["Slider", "Stepper", "TimePicker"],
    requiredStates: ["value", "range", "boundary", "disabled", "time"],
    examples: [
      makeExample(
        "range-time-matrix",
        "数值与时间",
        ["value", "range", "boundary", "disabled", "time"],
        RangeTimeExample
      ),
    ],
  },
  {
    id: "field-input-textarea",
    title: "Field / Input / Textarea",
    description: "标签、说明、错误和控件关联由字段组件统一提供。",
    section: "forms",
    kind: "visual",
    publicExports: ["Field", "Input", "Textarea"],
    requiredStates: [
      "empty",
      "value",
      "hint",
      "error",
      "disabled",
      "readonly",
      "affix",
      "file",
      "long-text",
      "render-props",
    ],
    examples: [
      makeExample(
        "text-fields",
        "字段状态",
        [
          "empty",
          "value",
          "hint",
          "error",
          "disabled",
          "readonly",
          "affix",
          "file",
          "long-text",
          "render-props",
        ],
        FieldInputExample
      ),
    ],
  },
  {
    id: "select-dropdown",
    title: "Select / Dropdown",
    description: "简单原生选择和高级可搜索选择具有明确边界。",
    section: "forms",
    kind: "visual",
    publicExports: ["Select", "Dropdown"],
    requiredStates: [
      "selected",
      "grouped",
      "multiple",
      "searchable",
      "ghost",
      "disabled",
      "select-error",
      "dropdown-error",
      "empty-search",
      "bounded-width",
      "flip",
      "viewport-clamp",
      "focus-restore",
    ],
    examples: [
      makeExample(
        "selection-fields",
        "选择器状态",
        [
          "selected",
          "grouped",
          "multiple",
          "searchable",
          "ghost",
          "disabled",
          "select-error",
          "bounded-width",
          "flip",
          "viewport-clamp",
          "focus-restore",
        ],
        SelectDropdownExample
      ),
      makeExample(
        "dropdown-edge-cases",
        "下拉错误与空结果",
        ["dropdown-error", "empty-search", "bounded-width"],
        DropdownEdgeCasesExample
      ),
    ],
  },
  {
    id: "form-section",
    title: "FormSection",
    description: "设置表单的标题、说明、操作和密度组合。",
    section: "forms",
    kind: "visual",
    publicExports: ["FormSection"],
    requiredStates: ["soft", "plain", "action", "description"],
    examples: [
      makeExample(
        "form-section-variants",
        "分区变体",
        ["soft", "plain", "action", "description"],
        FormSectionExample
      ),
    ],
  },
  {
    id: "alert-badge",
    title: "Alert / Badge",
    description: "行内状态和需要关注的消息使用统一语义色。",
    section: "feedback",
    kind: "visual",
    publicExports: ["Alert", "Badge"],
    requiredStates: ["neutral", "accent", "info", "success", "warning", "danger", "icon"],
    examples: [
      makeExample(
        "status-tones",
        "语义色",
        ["neutral", "accent", "info", "success", "warning", "danger", "icon"],
        AlertBadgeExample
      ),
    ],
  },
  {
    id: "progress",
    title: "Progress",
    description: "进度值在组件内处理上下界和无效最大值。",
    section: "feedback",
    kind: "visual",
    publicExports: ["Progress"],
    requiredStates: ["empty", "partial", "clamped", "invalid-max"],
    examples: [
      makeExample(
        "progress-boundaries",
        "边界状态",
        ["empty", "partial", "clamped", "invalid-max"],
        ProgressExample
      ),
    ],
  },
  {
    id: "toast",
    title: "Toast",
    description: "单条通知的语义、操作与关闭入口。",
    section: "feedback",
    kind: "visual",
    publicExports: ["Toast"],
    requiredStates: ["info", "success", "warning", "danger", "action", "dismiss"],
    examples: [
      makeExample(
        "toast-tones",
        "通知状态",
        ["info", "success", "warning", "danger", "action", "dismiss"],
        ToastExample
      ),
    ],
  },
  {
    id: "toast-viewport",
    title: "ToastViewport",
    description: "通知队列通过真实 Portal 呈现并支持暂停和关闭。",
    section: "feedback",
    kind: "behavior",
    publicExports: ["ToastViewport"],
    requiredStates: ["closed", "open", "action", "dismiss"],
    examples: [
      makeExample(
        "toast-viewport-interactive",
        "可操作队列",
        ["closed", "open", "action", "dismiss"],
        ToastViewportExample
      ),
    ],
  },
  {
    id: "confirm-dialog",
    title: "ConfirmDialog",
    description: "危险和常规确认共享焦点、键盘和等待行为。",
    section: "feedback",
    kind: "behavior",
    publicExports: ["ConfirmDialog"],
    requiredStates: [
      "closed",
      "open",
      ...Object.values(CONFIRM_DIALOG_STATE_BY_VARIANT),
      "pending",
      "focus",
    ],
    examples: [
      makeExample(
        "confirm-dialog-interactive",
        "可操作确认",
        ["closed", "open", ...Object.values(CONFIRM_DIALOG_STATE_BY_VARIANT), "pending", "focus"],
        ConfirmDialogExample
      ),
    ],
  },
  {
    id: "feedback-provider",
    title: "FeedbackProvider / useFeedback",
    description: "业务通过上下文触发通知和异步确认，不直接管理浮层栈。",
    section: "feedback",
    kind: "behavior",
    publicExports: ["FeedbackProvider", "useFeedback"],
    requiredStates: ["notify", "confirm", "consumer"],
    examples: [
      makeExample(
        "feedback-consumer",
        "真实消费者",
        ["notify", "confirm", "consumer"],
        FeedbackProviderExample
      ),
    ],
    coveredBy: ["toast-viewport", "confirm-dialog"],
    reason: "Provider 和 hook 的结果分别由 ToastViewport 与 ConfirmDialog 呈现。",
  },
  {
    id: "modal",
    title: "Modal",
    description: "模态层统一负责 Portal、焦点圈定、关闭和正文密度。",
    section: "feedback",
    kind: "behavior",
    publicExports: ["Modal"],
    requiredStates: [
      "closed",
      "open",
      "escape",
      "focus-restore",
      ...Object.values(MODAL_WIDTH_STATE_BY_VALUE),
      ...Object.values(MODAL_PLACEMENT_STATE_BY_VALUE),
      ...Object.values(MODAL_SURFACE_STATE_BY_VALUE),
      "header-divider",
      "header-flat",
      "header-hidden",
      "fullscreen",
      ...Object.values(MODAL_BODY_PADDING_STATE_BY_VALUE),
      "body-dividers-on",
      "body-dividers-off",
      ...Object.values(MODAL_FOOTER_PADDING_STATE_BY_VALUE),
      "footer-divider",
      "footer",
    ],
    examples: [
      makeExample(
        "modal-interactive",
        "可操作弹窗",
        [
          "closed",
          "open",
          "escape",
          "focus-restore",
          ...Object.values(MODAL_WIDTH_STATE_BY_VALUE),
          ...Object.values(MODAL_PLACEMENT_STATE_BY_VALUE),
          ...Object.values(MODAL_SURFACE_STATE_BY_VALUE),
          "header-divider",
          "header-flat",
          "header-hidden",
          "fullscreen",
          ...Object.values(MODAL_BODY_PADDING_STATE_BY_VALUE),
          "body-dividers-on",
          "body-dividers-off",
          ...Object.values(MODAL_FOOTER_PADDING_STATE_BY_VALUE),
          "footer-divider",
          "footer",
        ],
        ModalExample
      ),
    ],
  },
  {
    id: "popover-menu-tooltip",
    title: "Popover / Menu / Tooltip",
    description: "轻量浮层、命令菜单和补充说明共用语义图标与层级。",
    section: "feedback",
    kind: "behavior",
    publicExports: ["Popover", "Menu", "Tooltip"],
    requiredStates: [
      "closed",
      "open",
      "escape",
      "outside-click",
      "popover-focus-restore",
      "popover-flip",
      "popover-viewport-clamp",
      "selected",
      "disabled",
      "tooltip",
      "tooltip-focus",
      "tooltip-viewport-clamp",
    ],
    examples: [
      makeExample(
        "floating-overlays",
        "可操作浮层",
        [
          "closed",
          "open",
          "escape",
          "outside-click",
          "popover-focus-restore",
          "popover-flip",
          "popover-viewport-clamp",
          "selected",
          "disabled",
          "tooltip",
          "tooltip-focus",
          "tooltip-viewport-clamp",
        ],
        PopoverMenuTooltipExample
      ),
    ],
  },
  {
    id: "tabs",
    title: "Tabs",
    description: "选项卡包含视觉变体、尺寸、禁用项和键盘导航。",
    section: "navigation",
    kind: "behavior",
    publicExports: ["Tabs"],
    requiredStates: [
      ...Object.values(TABS_VARIANT_STATE_BY_VALUE),
      ...Object.values(TABS_SIZE_STATE_BY_VALUE),
      "selected",
      "disabled",
      "keyboard",
      "scrollable",
      "static",
      "sticky",
      "overflow",
    ],
    examples: [
      makeExample(
        "tabs-variants",
        "变体对比",
        [...Object.values(TABS_VARIANT_STATE_BY_VALUE), "selected"],
        TabsVariantsExample
      ),
      makeExample(
        "tabs-states",
        "尺寸与状态",
        [...Object.values(TABS_SIZE_STATE_BY_VALUE), "disabled", "keyboard", "static"],
        TabsStatesExample
      ),
      makeExample(
        "tabs-overflow",
        "滚动与吸顶",
        ["scrollable", "sticky", "overflow"],
        TabsOverflowExample
      ),
    ],
  },
  {
    id: "list-item",
    title: "ListItem",
    description: "可操作列表项支持说明、图标、尾部状态和长内容。",
    section: "navigation",
    kind: "visual",
    publicExports: ["ListItem"],
    requiredStates: ["default", "trailing", "disabled", "long-content"],
    examples: [
      makeExample(
        "list-item-states",
        "列表状态",
        ["default", "trailing", "disabled", "long-content"],
        ListItemExample
      ),
    ],
  },
  {
    id: "settings-composites",
    title: "SettingGrid / SettingItem",
    description: "高密度设置行和响应式列布局。",
    section: "compositions",
    kind: "visual",
    publicExports: ["SettingGrid", "SettingItem"],
    requiredStates: ["grid", "control", "tone", "disabled", "body"],
    examples: [
      makeExample(
        "setting-composition",
        "设置组合",
        ["grid", "control", "tone", "disabled", "body"],
        SettingsCompositesExample
      ),
    ],
  },
  {
    id: "metrics-info",
    title: "MetricCard / StatusPill / InfoPanel",
    description: "跨报告和设置页面复用的指标、状态和提示组合。",
    section: "compositions",
    kind: "visual",
    publicExports: ["MetricCard", "StatusPill", "InfoPanel"],
    requiredStates: ["metric", "icon", "meta", "tones", "title", "long-content"],
    examples: [
      makeExample(
        "information-composition",
        "信息组合",
        ["metric", "icon", "meta", "tones", "title", "long-content"],
        MetricsInfoExample
      ),
    ],
  },
  {
    id: "settings-shell",
    title: "SettingsShell",
    description: "分组导航、禁用状态、响应式抽屉和页脚操作的公共设置骨架。",
    section: "compositions",
    kind: "behavior",
    publicExports: ["SettingsShell"],
    requiredStates: [
      "groups",
      "active",
      "group-disabled",
      "item-disabled",
      "shell-disabled",
      "content",
      "footer",
      "responsive",
      "default",
      "drawer",
      "compact",
    ],
    examples: [
      makeExample(
        "settings-shell-grouped",
        "默认分组设置骨架",
        [
          "groups",
          "active",
          "group-disabled",
          "item-disabled",
          "content",
          "footer",
          "responsive",
          "default",
        ],
        SettingsShellExample
      ),
      makeExample(
        "settings-shell-drawer",
        "Modal 内嵌抽屉",
        ["drawer", "compact", "responsive"],
        SettingsShellDrawerExample
      ),
      makeExample(
        "settings-shell-disabled",
        "整体禁用",
        ["shell-disabled"],
        SettingsShellDisabledExample
      ),
    ],
  },
  {
    id: "portal",
    title: "Portal",
    description: "底层基础设施将浮层内容放入明确容器并保留 UI scope。",
    section: "compositions",
    kind: "infrastructure",
    publicExports: ["Portal"],
    requiredStates: ["custom-container", "ui-scope", "consumer"],
    examples: [
      makeExample(
        "portal-container",
        "真实容器",
        ["custom-container", "ui-scope", "consumer"],
        PortalExample
      ),
    ],
    coveredBy: ["modal", "popover-menu-tooltip", "toast-viewport"],
    reason: "Portal 同时由浮层消费者覆盖，并提供自定义容器的真实示例。",
  },
] as const;

export function getCatalogEntriesBySection(section: ComponentCatalogSection) {
  return COMPONENT_CATALOG.filter((entry) => entry.section === section);
}

export function getCatalogPublicExports(): string[] {
  return COMPONENT_CATALOG.flatMap((entry) => [...entry.publicExports]);
}

export function getCatalogStateCoverage(entry: ComponentCatalogEntry): Set<string> {
  return new Set(entry.examples.flatMap((example) => [...example.covers]));
}
