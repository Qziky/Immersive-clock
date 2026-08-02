# UI 组件与图标系统

Immersive Clock 将可复用视觉原语集中在 `src/ui`，领域组件集中在 `src/components`。
组件规范 Skill、`src/ui/index.ts` 和 Design System Catalog 是公共 UI API 的共同事实源。

## 归属决策

| 层级     | 目录                                            | 责任                                               |
| -------- | ----------------------------------------------- | -------------------------------------------------- |
| 设计基础 | `src/ui/tokens.css`、`global-ui.css`、`icons/`  | 令牌、全局基础、语义图标                           |
| 公共组件 | `src/ui/components/`                            | Button、Input、Modal、Dropdown、Tabs、反馈、表单等 |
| 公共组合 | `SettingComponents.tsx`、`SettingsShell.tsx` 等 | 跨页面稳定组合                                     |
| 业务组件 | `src/components/`、`src/pages/`                 | 时钟、天气、噪音、课表等领域呈现                   |

决策顺序：已有公共组件可表达需求则复用；缺少跨场景状态则扩展语义 prop/variant；只有两个
真实消费者以上才考虑抽象；单一领域样式留在业务层。

## 公共入口

业务代码从 `src/ui/index.ts` 导入。该入口导出：

- 基础布局：`Stack`、`Inline`、`Grid`；
- 操作与表单：`Button`、`IconButton`、`Input`、`Textarea`、`Select`、`Dropdown`、`Switch`、
  `Checkbox`、`RadioGroup`、`Slider`、`Stepper`、`TimePicker`；
- 表面与反馈：`Card`、`Modal`、`Popover`、`Menu`、`Toast`、`Alert`、`Badge`、`ConfirmDialog`；
- 设置组合：`SettingsShell`、`FormSection`、`SettingItem`、`MetricCard`、`InfoPanel`；
- 图表、无障碍和基础设施：`LineChart`、`FeedbackProvider`、`Portal`、`VisuallyHidden`、
  `KeyboardShortcut`。

业务 TSX 不得深层导入 `src/ui/components/*`，也不得直接导入 `lucide-react`。

## 令牌与表面层级

`src/ui/tokens.css` 定义深色背景、文字、边框、accent、状态色、玻璃表面、字体、字号、间距、
圆角、阴影、focus ring、动效和 z-index。业务 CSS 应使用令牌表达可复用值；领域数据色只有在
语义明确且清单允许时留在领域 CSS。

`[data-ui-root]` / `[data-ui-scope]` 提供统一字体、盒模型、selection、控件字体和 focus-visible。
公共组件拥有自身颜色、边框、圆角、阴影、排版、焦点、禁用和动效状态；业务层只控制外部布局、
宽高、定位和领域内容。

SettingsShell 已提供抬升表面：其内容区顶层 `FormSection` 必须使用 `variant="plain"`，避免
同级设置分区再套卡片；`soft` 仅用于脱离 Shell 的独立表单或明确的二级分组。

## 语义图标

`AppIcon` 是唯一运行时图标入口，名称由 `appIconRegistry.ts` 的 `AppIconName` 推导：

- `action.*`：应用、删除、上传、恢复等操作；
- `mode.*`：时钟、倒计时、秒表、自习；
- `feature.*`：天气、噪音、校时、数据、公告；
- `status.*`：选中、成功、警告、错误、帮助、加载；
- `weather.*`：天气现象和气象指标；
- `appearance.*`：颜色、边框、圆角、模糊、阴影等属性。

语义名描述“用户意图”，不要把 Lucide 图形名暴露为业务 API。新增语义必须同时更新注册表、
`src/ui/index.ts` 类型导出、Catalog 示例和图标契约测试。

图标尺寸只使用 `xs/sm/md/lg/xl/display`，由宿主组件选择；纯图标操作的命中区至少 44×44px。
`AppIcon` 固定装饰性 `aria-hidden`，`IconButton` 必须提供 `aria-label`，并将其作为 title。

## 可访问性与交互

- 使用语义 HTML；按钮、输入、选择、弹层和导航遵循原生键盘行为。
- `focus-visible` 使用全局 focus ring；不能用颜色作为唯一状态提示。
- Tab 使用 `aria-selected`，导航使用 `aria-current`，切换按钮使用 `aria-pressed`，表单错误
  同时提供文本和关联 label/description。
- Modal/Popover/Dropdown 必须处理 Escape、外部点击、Portal 层级、焦点进入/恢复、视口边缘和
  `prefers-reduced-motion`。
- 触控布局检查 390×844 和 320×568；长文本不能造成横向滚动。

## 业务层限制

业务组件不得：

- 用原生 `button/input/select/textarea` 重复实现已有公共控件；
- 通过公共组件内部类名或 `[data-ui-*]`、`[aria-*]`、`[role]` 选择器覆盖样式；
- 直接拼装通用 Toast、ConfirmDialog 或 Modal DOM；
- 让配置类别依赖彩色图标区分；
- 在不登记的情况下新增硬编码 hex/rgb/hsl 颜色。

领域原生表面只在明确例外中保留，例如整块语录刷新区域和噪音呼吸灯；必须逐行说明原因并由
UI governance 契约测试锁定。

## Design System Catalog

`/design-system` 页面读取 `src/pages/DesignSystem/componentCatalog.tsx`，展示真实公共 API 的
确定性示例。每个运行时公共导出必须展示或显式归类为非视觉基础设施；示例应覆盖适用的
variant、size、disabled、loading、error、selected、空态、长文本和窄屏状态。

新增或修改公共视觉 API 的交付顺序：类型 → 组件 → Catalog → Vitest → 视觉基线 → 文档。公共
导出、状态或尺寸不允许只改业务调用而遗漏展厅。
