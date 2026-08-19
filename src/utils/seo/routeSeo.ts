/**
 * 路由级 SEO / GEO 数据与应用逻辑
 *
 * 本模块集中定义各公共路由的标题、描述、可爬取正文与 FAQ，
 * 并提供 `applyRouteSeo` 以命令式方式更新 <head> 中的元数据与结构化数据，
 * 确保任意时刻文档只存在唯一的 title / canonical / 路由级 JSON-LD，
 * 避免与 index.html 中的静态标签重复。
 */

export const SITE_URL = "https://clock.qqhkx.com";
export const SITE_NAME = "沉浸式时钟";
export const AUTHOR_NAME = "Qziky";
export const AUTHOR_URL = "https://github.com/Qziky";
export const OG_IMAGE_URL = `${SITE_URL}/og-image.png`;

/** 路由级 JSON-LD 脚本的固定 id，便于命令式替换。 */
export const ROUTE_STRUCTURED_DATA_ID = "route-structured-data";
/** index.html 中静态首页 JSON-LD 的 id，运行时会被移除以避免重复。 */
export const HOME_FAQ_JSONLD_ID = "home-faq-jsonld";
export const HOME_BREADCRUMB_JSONLD_ID = "home-breadcrumb-jsonld";
/** index.html 中静态首页可爬取正文块的 id，React 挂载后会移除以避免重复。 */
export const HOME_STATIC_CONTENT_ID = "seo-home-static";

export interface FaqItem {
  question: string;
  answer: string;
}

export interface RouteSeoData {
  /** 规范化后的路由路径（无尾部斜杠，首页为 "/"）。 */
  path: string;
  title: string;
  description: string;
  keywords: string;
  /** 页面主标题，用于可爬取正文的 <h1>。 */
  h1: string;
  /** 答案先行的简介段落。 */
  intro: string;
  featureList: string[];
  faq: FaqItem[];
}

const SHARED_FAQ: FaqItem[] = [
  {
    question: "沉浸式时钟是免费的吗？",
    answer: "是。沉浸式时钟完全免费且开源（GPL-3.0 许可），无需注册或登录即可在浏览器中直接使用。",
  },
  {
    question: "支持离线使用吗？",
    answer:
      "支持。它是 PWA 应用，可安装到桌面或手机主屏，首次访问后缓存资源，可离线运行时钟、倒计时与秒表等核心功能。",
  },
  {
    question: "支持哪些平台？",
    answer:
      "提供 Web 网页版、可安装的 PWA，以及基于 Electron 的 Windows 与 Linux 桌面版和 Android 版本。",
  },
];

/** 公共路由的 SEO 数据表，键为规范化路径。 */
export const PUBLIC_ROUTE_SEO: Record<string, RouteSeoData> = {
  "/": {
    path: "/",
    title: "沉浸式时钟 - 全屏专注时钟⏰｜自习模式·倒计时·秒表 | 教室多媒体大屏",
    description:
      "沉浸式时钟是一款免费开源的全屏数字时钟、倒计时与秒表工具，含自习模式、天气展示、噪音监测、励志语录与课程表管理。轻量高速，支持 PWA 离线与安装，助力校园投屏与专注学习。",
    keywords:
      "沉浸式时钟,全屏时钟,数字时钟,倒计时,秒表,时间管理,全屏显示,自习,教室投屏,校园,噪音监测,天气,励志语录,课程表,PWA,专注学习,电子时钟,全屏数字时钟",
    h1: "沉浸式时钟 — 全屏专注时钟",
    intro:
      "沉浸式时钟是一款免费开源的全屏时间工具，集时钟、倒计时、秒表与教室自习模式于一体，支持 PWA 离线安装，专为校园多媒体大屏与专注学习设计。",
    featureList: [
      "全屏数字时钟显示",
      "精准倒计时与秒表",
      "校园自习模式与课程表管理",
      "实时天气预报展示",
      "环境噪音实时监测与报告",
      "精选励志语录轮播",
      "PWA 离线支持与桌面安装",
      "HUD 便捷交互控制",
    ],
    faq: [
      {
        question: "沉浸式时钟是免费的吗？",
        answer:
          "是。沉浸式时钟完全免费且开源（GPL-3.0 许可），无需注册或登录即可在浏览器中直接使用。",
      },
      {
        question: "支持离线使用吗？",
        answer:
          "支持。它是 PWA 应用，可安装到桌面或手机主屏，首次访问后缓存资源，可离线运行时钟、倒计时与秒表等核心功能。",
      },
      {
        question: "如何全屏显示时钟？",
        answer:
          "打开页面后点击 HUD 中的全屏按钮即可进入全屏，适合教室多媒体大屏、会议与直播看板长时间展示。",
      },
      {
        question: "能导入课程表吗？",
        answer:
          "可以。自习模式支持基于 CSES v2 的 YAML 导入和导出，并支持单休周期（rest_count: 1）；它会按周期锚点自动解析当天课程，用于显示下一课程与课程进度。",
      },
      {
        question: "支持哪些平台？",
        answer:
          "提供 Web 网页版、可安装的 PWA，以及基于 Electron 的 Windows 与 Linux 桌面版和 Android 版本。",
      },
      {
        question: "噪音监测准确吗？",
        answer:
          "默认显示相对的“环境安静评分”，经外部声级计校准后可估算 dB(A)；它面向课堂氛围参考，不定位为专业声级计。",
      },
    ],
  },
  "/clock": {
    path: "/clock",
    title: "全屏数字时钟 - 沉浸式时钟｜大屏电子时钟",
    description:
      "沉浸式时钟的全屏数字时钟模式，超大字号显示当前时间与日期，可自定义字体、颜色、透明度与背景，适合教室大屏、会议与直播看板。免费、支持 PWA 离线。",
    keywords: "全屏数字时钟,大屏时钟,电子时钟,在线时钟,全屏时钟,时钟显示,教室时钟",
    h1: "全屏数字时钟",
    intro:
      "全屏数字时钟以超大字号显示当前时间与日期，支持是否显示秒数，并可自定义字体、颜色、透明度与背景，适合教室多媒体大屏与看板长时间展示。",
    featureList: [
      "超大全屏时间与日期显示",
      "可选择是否显示秒数",
      "自定义字体、颜色与透明度",
      "自定义纯色、渐变或图片背景",
      "通过 /clock 直达，便于书签与固定入口",
    ],
    faq: [
      {
        question: "如何全屏显示时钟？",
        answer: "打开时钟模式后点击 HUD 中的全屏按钮即可进入全屏，适合教室大屏与看板展示。",
      },
      {
        question: "可以隐藏秒数吗？",
        answer: "可以。在设置中开启或关闭秒数显示，以适应不同的展示需求。",
      },
      {
        question: "能更换字体和颜色吗？",
        answer: "能。可自定义显示字体、颜色、透明度以及纯色、渐变或图片背景。",
      },
      ...SHARED_FAQ.slice(0, 2),
    ],
  },
  "/countdown": {
    path: "/countdown",
    title: "全屏倒计时 - 沉浸式时钟｜考试与课堂计时器",
    description:
      "沉浸式时钟的倒计时模式，设置时长后可启动、暂停与重置，结束提供声音提示，全屏大字显示，适合考试、课堂活动、演讲与烹饪计时。免费、支持 PWA 离线。",
    keywords: "全屏倒计时,倒计时器,在线倒计时,考试计时,课堂计时,倒数计时,计时器",
    h1: "全屏倒计时",
    intro:
      "倒计时模式可设置任意时长并启动、暂停与重置，结束时给出声音提示，全屏大字清晰展示剩余时间，适合考试、课堂活动、演讲与烹饪计时。",
    featureList: [
      "自定义倒计时时长",
      "启动、暂停与重置",
      "结束时声音提示",
      "全屏大字显示剩余时间",
      "运行、暂停、结束状态清晰可辨",
    ],
    faq: [
      {
        question: "倒计时结束会有提示音吗？",
        answer: "会。倒计时结束时提供声音提示，避免错过重要节点。",
      },
      {
        question: "可以暂停倒计时吗？",
        answer: "可以。倒计时支持随时启动、暂停与重置。",
      },
      {
        question: "如何全屏显示倒计时？",
        answer: "进入倒计时模式后点击 HUD 中的全屏按钮即可全屏展示。",
      },
      ...SHARED_FAQ.slice(0, 2),
    ],
  },
  "/stopwatch": {
    path: "/stopwatch",
    title: "全屏秒表 - 沉浸式时钟｜在线计时器",
    description:
      "沉浸式时钟的秒表模式，支持启动、暂停与重置，高频刷新显示，全屏大字清晰易读，适合运动、实验与课堂计时。免费、支持 PWA 离线。",
    keywords: "全屏秒表,秒表,在线秒表,计时器,运动计时,实验计时,正计时",
    h1: "全屏秒表",
    intro:
      "秒表模式支持启动、暂停与重置，以高频刷新满足短时计量，全屏大字清晰易读，适合体育运动、实验记录与课堂活动计时。",
    featureList: ["启动、暂停与重置", "高频刷新计时", "全屏大字显示", "长时间运行保持计时准确"],
    faq: [
      {
        question: "秒表可以暂停后继续吗？",
        answer: "可以。秒表支持启动、暂停与重置，暂停后可继续计时。",
      },
      {
        question: "秒表的精度如何？",
        answer: "秒表以高频刷新显示，满足短时计量，并将长期运行的正确性放在首位。",
      },
      {
        question: "如何全屏显示秒表？",
        answer: "进入秒表模式后点击 HUD 中的全屏按钮即可全屏展示。",
      },
      ...SHARED_FAQ.slice(0, 2),
    ],
  },
  "/study": {
    path: "/study",
    title: "自习模式 - 沉浸式时钟｜教室大屏学习看板",
    description:
      "沉浸式时钟的自习模式，将时间、天气、噪音监测、励志语录、课程进度与目标日期整合为学习看板，专为教室多媒体大屏与专注自习设计。免费、支持 PWA 离线。",
    keywords:
      "自习模式,学习看板,教室大屏,课程表,目标日期,高考倒计时,噪音监测,天气,励志语录,专注学习",
    h1: "自习模式（教室学习看板）",
    intro:
      "自习模式把时间、日期、天气、噪音监测、励志语录、课程进度与目标日期倒计时整合为一个学习看板，各辅助组件可独立显示或隐藏，主时间始终居中，专为教室多媒体大屏与专注自习设计。",
    featureList: [
      "集中式学习看板",
      "CSES v2 课程表导入导出与“下一课程”提示",
      "高考及自定义目标日期倒计时",
      "实时天气与分钟级降水、气象预警",
      "环境噪音实时监测与历史报告",
      "在线与本地励志语录轮播",
      "顶部信息栏轮播学习进度与自定义文本",
    ],
    faq: [
      {
        question: "自习模式能显示天气吗？",
        answer: "能。自习模式可展示当前天气、分钟级降水、气象预警与空气质量等提醒。",
      },
      {
        question: "能导入课程表吗？",
        answer:
          "可以。支持基于 CSES v2 的 YAML 导入和导出，并支持单休周期（rest_count: 1）；在应用草稿前会校验周期、课程引用、时间和重叠。",
      },
      {
        question: "噪音监测准确吗？",
        answer:
          "默认显示相对的“环境安静评分”，经外部声级计校准后可估算 dB(A)；面向课堂氛围参考，不定位为专业声级计。",
      },
      {
        question: "支持目标日期倒计时吗？",
        answer: "支持。可设置高考目标、单个自定义事件或多个事件轮播，提供方向性提醒。",
      },
      SHARED_FAQ[0],
    ],
  },
};

/** 规范化路径：去除尾部斜杠，空路径回退为 "/"。 */
export function normalizeSeoPath(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

/**
 * 获取给定路径的路由 SEO 数据；未命中的公共路径回退到首页数据，
 * 以保证任意路由都有可用的元数据。
 */
export function getRouteSeo(pathname: string): RouteSeoData {
  const normalized = normalizeSeoPath(pathname);
  return PUBLIC_ROUTE_SEO[normalized] ?? PUBLIC_ROUTE_SEO["/"];
}

/** 构造某路由的绝对 canonical URL。 */
export function getCanonicalUrl(pathname: string): string {
  const normalized = normalizeSeoPath(pathname);
  return normalized === "/" ? `${SITE_URL}/` : `${SITE_URL}${normalized}`;
}

/** 构造 SoftwareApplication + FAQPage + BreadcrumbList 结构化数据数组。 */
export function buildRouteStructuredData(seo: RouteSeoData): Record<string, unknown>[] {
  const canonical = getCanonicalUrl(seo.path);
  const breadcrumbItems: Record<string, unknown>[] = [
    {
      "@type": "ListItem",
      position: 1,
      name: "首页",
      item: `${SITE_URL}/`,
    },
  ];
  if (seo.path !== "/") {
    breadcrumbItems.push({
      "@type": "ListItem",
      position: 2,
      name: seo.h1,
      item: canonical,
    });
  }

  return [
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: seo.faq.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: breadcrumbItems,
    },
  ];
}

type MetaSelector = { attr: "name" | "property"; key: string };

function upsertMeta(doc: Document, selector: MetaSelector, content: string): void {
  const existing = doc.head.querySelector<HTMLMetaElement>(
    `meta[${selector.attr}="${selector.key}"]`
  );
  const meta = existing ?? doc.createElement("meta");
  if (!existing) {
    meta.setAttribute(selector.attr, selector.key);
    doc.head.appendChild(meta);
  }
  meta.setAttribute("content", content);
}

function upsertCanonical(doc: Document, href: string): void {
  const existing = doc.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  const link = existing ?? doc.createElement("link");
  if (!existing) {
    link.setAttribute("rel", "canonical");
    doc.head.appendChild(link);
  }
  link.setAttribute("href", href);
}

/**
 * 命令式地将路由 SEO 应用到文档：更新 title、描述、关键词、canonical、
 * Open Graph / Twitter 标签，并以唯一的路由级 JSON-LD 替换静态首页结构化数据。
 * 在真实浏览器（含预渲染）与 jsdom 下均可运行。
 */
export function applyRouteSeo(pathname: string, doc: Document = document): void {
  const seo = getRouteSeo(pathname);
  const canonical = getCanonicalUrl(seo.path);

  doc.title = seo.title;
  upsertMeta(doc, { attr: "name", key: "description" }, seo.description);
  upsertMeta(doc, { attr: "name", key: "keywords" }, seo.keywords);
  upsertCanonical(doc, canonical);

  upsertMeta(doc, { attr: "property", key: "og:title" }, seo.title);
  upsertMeta(doc, { attr: "property", key: "og:description" }, seo.description);
  upsertMeta(doc, { attr: "property", key: "og:url" }, canonical);
  upsertMeta(doc, { attr: "name", key: "twitter:title" }, seo.title);
  upsertMeta(doc, { attr: "name", key: "twitter:description" }, seo.description);

  // 移除 index.html 中的静态首页 JSON-LD，避免与路由级结构化数据重复。
  doc.getElementById(HOME_FAQ_JSONLD_ID)?.remove();
  doc.getElementById(HOME_BREADCRUMB_JSONLD_ID)?.remove();

  doc.getElementById(ROUTE_STRUCTURED_DATA_ID)?.remove();
  const script = doc.createElement("script");
  script.type = "application/ld+json";
  script.id = ROUTE_STRUCTURED_DATA_ID;
  script.textContent = JSON.stringify(buildRouteStructuredData(seo));
  doc.head.appendChild(script);
}
