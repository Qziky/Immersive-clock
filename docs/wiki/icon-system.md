# 图标系统

应用功能图标统一由 `src/ui/icons/` 管理。业务代码描述图标用途，不直接依赖 Lucide
图形名称；ESLint 会阻止注册表之外导入 `lucide-react`。

## 使用方式

带文字的共享组件直接传语义名，由组件决定图标尺寸：

```tsx
<Button icon="action.apply">应用</Button>
<SettingItem icon="feature.weatherLive" title="天气数据" />
```

纯图标操作使用 `IconButton`，必须提供可访问名称：

```tsx
<IconButton aria-label="删除记录" icon="action.delete" variant="danger" />
```

只有 `trigger`、`prefix`、`suffix` 等任意内容插槽需要直接组合时，才渲染 `AppIcon`：

```tsx
<Input prefix={<AppIcon name="action.search" size="sm" />} label="搜索" />
```

## 命名

- `action.*`：应用、排序、删除、恢复、上传等用户操作。
- `mode.*`：时钟、倒计时、秒表和自习模式。
- `feature.*`：天气、噪音、校时、数据等功能对象。
- `status.*`：选中、成功、警告、错误、帮助和加载状态。
- `weather.*`：天气现象及气象指标。
- `appearance.*`：颜色、圆角、边框、模糊、字距和阴影等外观属性。

名称必须表达界面意图，不能以 Lucide 图形名作为业务 API。新增语义时，在
`appIconRegistry.ts` 中完成唯一映射，并由 `AppIconName` 自动推导类型。

## 尺寸

| 令牌      | 像素 | 使用场景                       |
| --------- | ---: | ------------------------------ |
| `xs`      |   12 | 极小勾选和辅助状态             |
| `sm`      |   14 | 输入装饰、紧凑菜单和胶囊       |
| `md`      |   16 | 默认按钮、标签页、列表和指标卡 |
| `lg`      |   18 | 设置项和常规工具栏             |
| `xl`      |   20 | 独立主操作和设置导航           |
| `display` |   28 | 加载、空态和天气展示           |

业务代码不得传数值尺寸。Button、IconButton、Tabs、Menu、SettingItem 等宿主组件负责
选择尺寸；触控环境下图标按钮命中区至少为 `44×44px`，图形本身不随命中区放大。

## 颜色与状态

- 图标固定 `strokeWidth={2}`、`fill="none"`，通过 `currentColor` 继承宿主颜色。
- 普通操作、导航和设置项使用中性色；hover 可提升为主文本色。
- 仅选中或按下状态使用 accent，仅真实结果使用 success、warning 或 danger。
- 删除等破坏性操作使用 `danger` 变体；配置类别不能用彩色图标区分类别。
- 状态必须同时有文字或可访问名称，不能只依靠颜色或图形。

## 无障碍

`AppIcon` 始终是装饰内容，固定 `aria-hidden` 且不可聚焦。带文字控件由可见文字命名；
纯图标按钮由必填的 `aria-label` 命名，并默认将该文字用作 `title`。切换按钮使用
`pressed` 输出 `aria-pressed`，导航和标签页继续分别使用 `aria-current`、`aria-selected`。

## 例外

品牌 favicon、PWA/Electron 应用图标、二维码、公告正文 emoji 和数据图表 SVG 不进入
语义图标注册表。主界面天气展示继续使用 `public/weather-icons/fill` 中的原天气图片，
Electron 构建继续保留天气图片资源的相对路径兼容处理。
