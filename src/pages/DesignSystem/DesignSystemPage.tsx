import { useMemo, useRef, useState } from "react";

import {
  APP_ICON_SIZES,
  Alert,
  AppIcon,
  Badge,
  Button,
  Card,
  Checkbox,
  Dropdown,
  FormSection,
  Grid,
  IconButton,
  Inline,
  Input,
  KeyboardShortcut,
  ListItem,
  Menu,
  Modal,
  Popover,
  Progress,
  RadioGroup,
  Select,
  SettingItem,
  SettingsShell,
  Slider,
  Stack,
  Stepper,
  Switch,
  Tabs,
  Textarea,
  TimePicker,
  Toast,
  Tooltip,
  VisuallyHidden,
  type AppIconName,
  type AppIconSize,
  type TimePickerValue,
} from "../../ui";

import styles from "./DesignSystemPage.module.css";

type ComponentSection =
  | "foundation"
  | "icons"
  | "motion"
  | "actions"
  | "forms"
  | "feedback"
  | "navigation"
  | "layout";

const navItems = [
  { value: "foundation", label: "设计基础" },
  { value: "icons", label: "图标系统" },
  { value: "motion", label: "动效系统" },
  { value: "actions", label: "操作控件" },
  { value: "forms", label: "表单输入" },
  { value: "feedback", label: "浮层反馈" },
  { value: "navigation", label: "导航列表" },
  { value: "layout", label: "布局工具" },
] satisfies Array<{ value: ComponentSection; label: string }>;

const swatches = [
  ["#0B0C0E", "背景"],
  ["#111317", "面板"],
  ["#1A1D22", "浮层"],
  ["#2A2E35", "边框"],
  ["#8E9098", "弱文本"],
  ["#EAECF0", "主文本"],
  ["#2FECC6", "强调"],
] as const;

const motionTokens = [
  ["fast", "140ms", "hover / focus"],
  ["normal", "200ms", "浮层进入"],
  ["slow", "240ms", "Toast / Modal"],
  ["exit", "180ms", "关闭退出"],
] as const;

const iconSizes = Object.entries(APP_ICON_SIZES) as Array<[AppIconSize, number]>;

const iconSemantics: Array<{ name: AppIconName; label: string }> = [
  { name: "action.apply", label: "应用" },
  { name: "action.sort", label: "排序" },
  { name: "action.restoreSaved", label: "恢复" },
  { name: "feature.weatherLive", label: "实时天气" },
  { name: "feature.timeCalibration", label: "时间校准" },
  { name: "feature.noiseReport", label: "噪音报告" },
];

const dropdownGroups = [
  {
    label: "页面",
    options: [
      { value: "clock", label: "时钟", description: "时间、日期、天气入口" },
      { value: "study", label: "自习", description: "专注统计与任务状态" },
      { value: "settings", label: "设置", description: "高密度参数面板" },
    ],
  },
  {
    label: "能力",
    options: [
      { value: "audio", label: "声音播报" },
      { value: "weather", label: "天气组件" },
      { value: "noise", label: "噪音监测" },
    ],
  },
];

function DesignSystemPage() {
  const contentRef = useRef<HTMLElement>(null);
  const [activeSection, setActiveSection] = useState<ComponentSection>("foundation");
  const [iconSlotTabValue, setIconSlotTabValue] = useState("general");
  const [tabValue, setTabValue] = useState("base");
  const [switchValue, setSwitchValue] = useState(true);
  const [checkboxValue, setCheckboxValue] = useState(true);
  const [radioValue, setRadioValue] = useState("auto");
  const [sliderValue, setSliderValue] = useState(55);
  const [stepperValue, setStepperValue] = useState(25);
  const [dropdownValue, setDropdownValue] = useState<string | number>("study");
  const [multiDropdownValue, setMultiDropdownValue] = useState<Array<string | number>>([
    "audio",
    "noise",
  ]);
  const [textareaValue, setTextareaValue] = useState("整点播报开启，专注提醒在 25 分钟后触发。");
  const [timeValue, setTimeValue] = useState<TimePickerValue>({
    hours: "12",
    minutes: "30",
    seconds: "00",
  });
  const [settingsSection, setSettingsSection] = useState("general");
  const [modalOpen, setModalOpen] = useState(false);

  const settingsItems = useMemo(
    () => [
      { value: "general", label: "基础", icon: "action.configure" as const },
      { value: "display", label: "显示", icon: "feature.appearance" as const },
      { value: "audio", label: "声音", icon: "feature.audio" as const },
    ],
    []
  );

  const scrollToSection = (section: ComponentSection) => {
    setActiveSection(section);
    const content = contentRef.current;
    const target = document.getElementById(section);
    if (!content || !target) return;
    const contentBounds = content.getBoundingClientRect();
    const targetBounds = target.getBoundingClientRect();
    content.scrollTo({
      behavior: "smooth",
      top: content.scrollTop + targetBounds.top - contentBounds.top,
    });
  };

  return (
    <main className={styles.page} data-ui-root>
      <aside className={styles.sidebar} aria-label="组件分类">
        <Stack gap="lg">
          <Stack gap="sm">
            <Badge variant="accent">src/ui</Badge>
            <h1>精简组件库</h1>
            <p>只保留时钟和设置页迁移真正需要的基础组件，复杂业务容器不进入公共 UI 库。</p>
          </Stack>
          <nav className={styles.nav}>
            {navItems.map((item) => (
              <button
                className={activeSection === item.value ? styles.navItemActive : styles.navItem}
                key={item.value}
                type="button"
                onClick={() => scrollToSection(item.value)}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </Stack>
      </aside>

      <section ref={contentRef} className={styles.content}>
        <header className={styles.header}>
          <Stack gap="xs">
            <span className={styles.kicker}>Immersive Clock UI</span>
            <h2>核心组件总览</h2>
            <p className={styles.muted}>删除重复组件后，公共入口只暴露少量可组合原语。</p>
          </Stack>
          <Inline justify="flex-end">
            <Tooltip content="搜索入口后续由业务组合实现">
              <IconButton icon="action.search" aria-label="搜索" />
            </Tooltip>
            <IconButton icon="feature.settings" aria-label="设置" />
            <Button size="sm" variant="primary" icon="action.apply">
              已精简
            </Button>
          </Inline>
        </header>

        <section className={styles.section} id="foundation">
          <SectionHeader title="设计基础" meta="tokens.css / global-ui.css" />
          <Grid minColumnWidth={320}>
            <Card className={styles.cardStack}>
              <h3>色彩</h3>
              <div className={styles.swatches}>
                {swatches.map(([color, label]) => (
                  <div className={styles.swatch} key={color}>
                    <span className={styles.swatchColor} style={{ background: color }} />
                    <span>{label}</span>
                    <code>{color}</code>
                  </div>
                ))}
              </div>
            </Card>
            <Card className={styles.cardStack}>
              <h3>字体与密度</h3>
              <Grid columns={2}>
                <Stack gap="sm">
                  <strong className={styles.typeSample}>Aa</strong>
                  <span className={styles.muted}>Inter / Source Han Sans</span>
                </Stack>
                <Stack gap="sm">
                  <strong className={styles.numberSample}>15:39:52</strong>
                  <span className={styles.muted}>Roboto Mono 数字时间</span>
                </Stack>
              </Grid>
              <Inline>
                {[4, 8, 12, 16, 24, 32].map((size) => (
                  <span className={styles.spaceToken} key={size}>
                    <i style={{ width: size, height: size }} />
                    {size}
                  </span>
                ))}
              </Inline>
            </Card>
          </Grid>
        </section>

        <section className={styles.section} id="icons">
          <SectionHeader title="图标系统" meta="semantic registry / size / state" />
          <Grid minColumnWidth={320}>
            <Card className={styles.cardStack}>
              <h3>尺寸令牌</h3>
              <div className={styles.iconScale}>
                {iconSizes.map(([size, pixels]) => (
                  <div className={styles.iconScaleItem} key={size}>
                    <AppIcon name="action.search" size={size} />
                    <span>{size}</span>
                    <code>{pixels}px</code>
                  </div>
                ))}
              </div>
            </Card>
            <Card className={styles.cardStack}>
              <h3>语义映射</h3>
              <div className={styles.iconSemanticGrid}>
                {iconSemantics.map((item) => (
                  <div className={styles.iconSemanticItem} key={item.name}>
                    <AppIcon name={item.name} size="lg" />
                    <span>{item.label}</span>
                    <code>{item.name}</code>
                  </div>
                ))}
              </div>
            </Card>
            <Card className={styles.cardStack}>
              <h3>颜色与状态</h3>
              <Inline>
                <span className={styles.iconToneNeutral}>
                  <AppIcon name="action.search" />
                  普通
                </span>
                <span className={styles.iconToneAccent}>
                  <AppIcon name="status.selected" />
                  选中
                </span>
                <span className={styles.iconToneSuccess}>
                  <AppIcon name="status.success" />
                  成功
                </span>
                <span className={styles.iconToneWarning}>
                  <AppIcon name="status.warning" />
                  警告
                </span>
                <span className={styles.iconToneDanger}>
                  <AppIcon name="action.delete" />
                  危险
                </span>
              </Inline>
            </Card>
            <Card className={styles.iconSlotCard}>
              <h3>宿主槽位矩阵</h3>
              <div className={styles.iconSlotMatrix}>
                <div className={styles.iconSlotItem}>
                  <code>Button</code>
                  <Button size="sm" variant="primary" icon="action.apply">
                    应用
                  </Button>
                </div>
                <div className={styles.iconSlotItem}>
                  <code>IconButton</code>
                  <IconButton aria-label="配置" icon="action.configure" size="sm" />
                </div>
                <div className={styles.iconSlotItem}>
                  <code>Tabs</code>
                  <Tabs
                    label="图标槽位标签页"
                    value={iconSlotTabValue}
                    onChange={setIconSlotTabValue}
                    scrollable={false}
                    size="sm"
                    items={[
                      { value: "general", label: "常规", icon: "feature.settings" },
                      { value: "weather", label: "天气", icon: "feature.weather" },
                    ]}
                  />
                </div>
                <div className={styles.iconSlotItem}>
                  <code>Menu</code>
                  <Menu
                    triggerLabel="更多"
                    items={[
                      { value: "edit", label: "编辑", icon: "action.edit" },
                      { value: "delete", label: "删除", icon: "action.delete" },
                    ]}
                  />
                </div>
                <div className={styles.iconSlotItem}>
                  <code>SettingItem</code>
                  <SettingItem icon="feature.weatherLive" title="实时天气" />
                </div>
              </div>
            </Card>
          </Grid>
        </section>

        <section className={styles.section} id="motion">
          <SectionHeader title="动效系统" meta="motion tokens / presence / reduced motion" />
          <Grid minColumnWidth={320}>
            <Card className={styles.cardStack}>
              <h3>Motion tokens</h3>
              <div className={styles.motionTokenGrid}>
                {motionTokens.map(([name, duration, usage]) => (
                  <div className={styles.motionToken} key={name}>
                    <strong>{duration}</strong>
                    <span>{name}</span>
                    <small>{usage}</small>
                  </div>
                ))}
              </div>
              <Inline>
                <span className={styles.motionDot} />
                <span className={styles.muted}>
                  优先 opacity / transform，退出动画默认保留 180ms。
                </span>
              </Inline>
            </Card>
            <Card className={styles.cardStack}>
              <h3>组件动效</h3>
              <Inline>
                <Popover
                  ariaLabel="动效弹出层"
                  trigger={
                    <>
                      <AppIcon name="appearance.effects" size="sm" />
                      <span>打开浮层</span>
                    </>
                  }
                >
                  <Stack gap="sm">
                    <strong>Presence</strong>
                    <span className={styles.muted}>关闭时延迟卸载，让退出动画完整播放。</span>
                  </Stack>
                </Popover>
                <Button variant="primary" icon="appearance.effects">
                  按压反馈
                </Button>
              </Inline>
              <Toast
                variant="info"
                title="Toast 进入动画"
                description="使用统一 duration、easing 和 reduced-motion 兜底。"
              />
            </Card>
            <Card className={styles.cardStack}>
              <h3>Reduced motion</h3>
              <Alert variant="info">
                系统偏好减少动态效果时，UI 动画会缩短或关闭，状态变化仍保留。
              </Alert>
              <Inline>
                <Badge variant="neutral">motion=&quot;none&quot;</Badge>
                <Badge variant="accent">prefers-reduced-motion</Badge>
              </Inline>
            </Card>
          </Grid>
        </section>

        <section className={styles.section} id="actions">
          <SectionHeader title="操作控件" meta="Button / IconButton / Switch / Slider / Stepper" />
          <Grid>
            <Card className={styles.cardStack}>
              <h3>Button</h3>
              <Inline>
                <Button variant="primary">主按钮</Button>
                <Button variant="secondary">次按钮</Button>
                <Button variant="ghost">幽灵按钮</Button>
                <Button variant="danger">危险按钮</Button>
                <Button loading>加载中</Button>
              </Inline>
            </Card>
            <Card className={styles.cardStack}>
              <h3>IconButton</h3>
              <Inline>
                <IconButton icon="action.configure" aria-label="设置" pressed />
                <IconButton icon="feature.audio" aria-label="声音" variant="ghost" />
                <IconButton icon="feature.notification" aria-label="通知" disabled />
              </Inline>
            </Card>
            <Card className={styles.cardStack}>
              <h3>选择与数值</h3>
              <Switch checked={switchValue} onCheckedChange={setSwitchValue} label="启用播报" />
              <Checkbox
                label="记录状态"
                checked={checkboxValue}
                onChange={(event) => setCheckboxValue(event.target.checked)}
              />
              <RadioGroup
                label="运行模式"
                value={radioValue}
                onChange={setRadioValue}
                options={[
                  { value: "auto", label: "自动" },
                  { value: "manual", label: "手动" },
                ]}
              />
              <Slider
                label="提醒阈值"
                min={30}
                max={80}
                value={sliderValue}
                onChange={setSliderValue}
                formatValue={(value) => `${value} dB`}
              />
              <Inline>
                <Stepper value={stepperValue} onChange={setStepperValue} min={0} max={99} />
                <TimePicker value={timeValue} onChange={setTimeValue} />
              </Inline>
            </Card>
          </Grid>
        </section>

        <section className={styles.section} id="forms">
          <SectionHeader title="表单输入" meta="Field / Input / Select / Dropdown / Textarea" />
          <Grid minColumnWidth={360}>
            <FormSection
              title="组合表单"
              description="用 Grid / Inline / Stack 组合字段，不再保留 FormRow。"
            >
              <Grid columns={2}>
                <Input label="计划名称" placeholder="例如：夜间专注计划" />
                <Select
                  label="默认页面"
                  defaultValue="clock"
                  options={[
                    { value: "clock", label: "时钟" },
                    { value: "study", label: "自习" },
                    { value: "settings", label: "设置" },
                  ]}
                />
              </Grid>
              <Grid columns={2}>
                <Input
                  label="搜索"
                  type="search"
                  prefix={<AppIcon name="action.search" size="sm" />}
                  placeholder="组件名"
                />
                <Input label="休息时长" type="number" suffix="min" defaultValue={5} min={1} />
              </Grid>
              <Grid columns={2}>
                <Input label="强调色" type="color" defaultValue="#2fecc6" />
                <Input label="导入配置" type="file" />
              </Grid>
              <Textarea
                label="播报文案"
                value={textareaValue}
                onChange={(event) => setTextareaValue(event.target.value)}
              />
              <Inline justify="flex-end">
                <Button variant="ghost">重置</Button>
                <Button variant="primary">保存</Button>
              </Inline>
            </FormSection>

            <FormSection
              title="Dropdown"
              description="一个组件覆盖单选、多选、分组、搜索和禁用状态。"
            >
              <Dropdown
                label="分组单选"
                value={dropdownValue}
                groups={dropdownGroups}
                searchable
                onChange={(nextValue) => {
                  if (typeof nextValue === "string" || typeof nextValue === "number") {
                    setDropdownValue(nextValue);
                  }
                }}
              />
              <Dropdown
                label="多选能力"
                mode="multiple"
                value={multiDropdownValue}
                groups={dropdownGroups}
                searchable
                onChange={(nextValue) =>
                  setMultiDropdownValue(Array.isArray(nextValue) ? nextValue : [])
                }
              />
              <Input label="错误状态" defaultValue="错误示例" error="请检查输入内容" />
            </FormSection>
          </Grid>
        </section>

        <section className={styles.section} id="feedback">
          <SectionHeader
            title="浮层反馈"
            meta="Modal / Popover / Menu / Tooltip / Toast-like Alert"
          />
          <Grid>
            <Card className={styles.cardStack}>
              <h3>Badge / Alert / Progress</h3>
              <Inline>
                <Badge variant="neutral">默认</Badge>
                <Badge variant="accent">组件库</Badge>
                <Badge variant="success">已保存</Badge>
                <Badge variant="warning">待同步</Badge>
                <Badge variant="danger">异常</Badge>
              </Inline>
              <Alert variant="success">操作成功提示文案</Alert>
              <Alert variant="warning">警告提示文案</Alert>
              <Progress value={70} label="示例进度" />
            </Card>
            <Card className={styles.cardStack}>
              <h3>Modal / Popover</h3>
              <Inline>
                <Button variant="secondary" onClick={() => setModalOpen(true)}>
                  打开弹窗
                </Button>
                <Popover ariaLabel="弹出内容" trigger={<span>打开弹出层</span>}>
                  <Stack>
                    <strong>弹出层内容</strong>
                    <span className={styles.muted}>用于轻量设置、筛选和上下文信息。</span>
                    <Button size="sm" variant="primary">
                      应用
                    </Button>
                  </Stack>
                </Popover>
              </Inline>
            </Card>
            <Card className={styles.cardStack}>
              <h3>Menu / Tooltip</h3>
              <Inline>
                <Menu
                  triggerLabel="菜单"
                  items={[
                    { value: "edit", label: "编辑", icon: "action.edit" },
                    { value: "sync", label: "同步", icon: "feature.sync", selected: true },
                    { value: "disabled", label: "禁用项", disabled: true },
                  ]}
                />
                <Tooltip content="Tooltip 用于解释图标按钮">
                  <IconButton icon="action.search" aria-label="查看提示" />
                </Tooltip>
              </Inline>
            </Card>
          </Grid>
        </section>

        <section className={styles.section} id="navigation">
          <SectionHeader title="导航列表" meta="Tabs / ListItem" />
          <Grid>
            <Card className={styles.cardStack}>
              <h3>Tabs</h3>
              <Tabs
                label="组件分类"
                value={tabValue}
                onChange={setTabValue}
                items={[
                  { value: "base", label: "基础", icon: "feature.appearance" },
                  { value: "forms", label: "表单", icon: "feature.file" },
                  { value: "feedback", label: "反馈", icon: "feature.notification" },
                ]}
              />
            </Card>
            <Card className={styles.cardStack}>
              <h3>ListItem</h3>
              <Stack gap="sm">
                <ListItem
                  title="系统通知"
                  description="组件库公共入口已精简"
                  icon="feature.notification"
                  trailing={<Badge variant="success">新</Badge>}
                />
                <ListItem
                  title="迁移准备"
                  description="业务页后续按真实场景组合"
                  icon="action.configure"
                  trailing={<AppIcon name="status.success" />}
                />
              </Stack>
            </Card>
          </Grid>
        </section>

        <section className={styles.section} id="layout">
          <SectionHeader
            title="布局工具"
            meta="Stack / Inline / Grid / FormSection / SettingsShell"
          />
          <Grid minColumnWidth={360}>
            <SettingsShell
              title="SettingsShell"
              activeItem={settingsSection}
              items={settingsItems}
              onItemChange={setSettingsSection}
              footer={
                <>
                  <Button variant="secondary">取消</Button>
                  <Button variant="primary">保存</Button>
                </>
              }
            >
              <FormSection title="设置页容器" description="用于后续承载高密度设置页面。">
                <Input label="字段" placeholder="输入内容" />
                <Switch checked={switchValue} onCheckedChange={setSwitchValue} label="开关项" />
              </FormSection>
            </SettingsShell>
            <Card className={styles.cardStack}>
              <h3>工具组件</h3>
              <Stack>
                <Button icon="feature.command">
                  <VisuallyHidden>打开快捷命令</VisuallyHidden>
                  快捷命令
                </Button>
                <Inline>
                  <KeyboardShortcut keys={["Ctrl", "K"]} />
                  <KeyboardShortcut keys={["Esc"]} />
                  <KeyboardShortcut keys={["Shift", "Tab"]} />
                </Inline>
                <Alert variant="info">
                  Portal 作为底层工具保留，由 Modal、Popover 等组件复用。
                </Alert>
              </Stack>
            </Card>
          </Grid>
        </section>
      </section>

      <Modal
        isOpen={modalOpen}
        title="弹窗组件"
        onClose={() => setModalOpen(false)}
        footer={
          <Inline justify="flex-end">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              取消
            </Button>
            <Button variant="primary" onClick={() => setModalOpen(false)}>
              确认
            </Button>
          </Inline>
        }
      >
        <p className={styles.modalText}>标准弹窗只提供标题、内容、关闭按钮和 footer 插槽。</p>
      </Modal>
    </main>
  );
}

function SectionHeader({ title, meta }: { title: string; meta: string }) {
  return (
    <header className={styles.sectionHeader}>
      <h2>{title}</h2>
      <span>{meta}</span>
    </header>
  );
}

export { DesignSystemPage };
