export type QuoteProviderId = "hitokoto" | "jinrishici" | "chinese-poetry" | "advice-slip";

export type QuoteLanguage = "zh" | "en";

export type QuoteOrderMode = "random" | "sequential";

export type QuoteAnimationMode = "typewriter" | "crossfade" | "none";

export type QuoteTypingSpeed = "slow" | "normal" | "fast";

export const CHINESE_POETRY_DYNASTIES = [
  "先秦",
  "两汉",
  "魏晋",
  "南北朝",
  "唐",
  "宋",
  "元",
  "清",
] as const;

export type ChinesePoetryDynasty = (typeof CHINESE_POETRY_DYNASTIES)[number];

export const CHINESE_POETRY_TYPES = [
  "五言绝句",
  "七言绝句",
  "五言律诗",
  "七言律诗",
  "乐府诗",
  "宋词",
  "元曲",
  "诗经",
  "楚辞",
] as const;

export type ChinesePoetryType = (typeof CHINESE_POETRY_TYPES)[number];

export type HitokotoCategory =
  "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i" | "j" | "k" | "l";

export const HITOKOTO_CATEGORIES: Record<HitokotoCategory, string> = {
  a: "动画",
  b: "漫画",
  c: "游戏",
  d: "文学",
  e: "原创",
  f: "来自网络",
  g: "其他",
  h: "影视",
  i: "诗词",
  j: "网易云",
  k: "哲学",
  l: "抖机灵",
};

export const HITOKOTO_CATEGORY_LIST: Array<{ key: HitokotoCategory; name: string }> = [
  { key: "a", name: "动画" },
  { key: "b", name: "漫画" },
  { key: "c", name: "游戏" },
  { key: "d", name: "文学" },
  { key: "e", name: "原创" },
  { key: "f", name: "来自网络" },
  { key: "g", name: "其他" },
  { key: "h", name: "影视" },
  { key: "i", name: "诗词" },
  { key: "j", name: "网易云" },
  { key: "k", name: "哲学" },
  { key: "l", name: "抖机灵" },
];

export interface Quote {
  id: string;
  text: string;
  author?: string;
  origin?: string;
  cacheScope?: string;
  providerId: QuoteProviderId | "local";
  language: QuoteLanguage;
  fetchedAt: number;
}

interface QuoteChannelBase {
  id: string;
  name: string;
  weight: number;
  enabled: boolean;
  builtIn: boolean;
}

export interface LocalQuoteChannel extends QuoteChannelBase {
  kind: "local";
  quotes: string[];
  orderMode: QuoteOrderMode;
}

export interface RemoteQuoteChannel extends QuoteChannelBase {
  kind: "remote";
  providerId: QuoteProviderId;
  language: QuoteLanguage;
  description: string;
  hitokotoCategories?: HitokotoCategory[];
  chinesePoetryDynasty?: ChinesePoetryDynasty;
  chinesePoetryTypes?: ChinesePoetryType[];
}

export type QuoteChannel = LocalQuoteChannel | RemoteQuoteChannel;

export interface QuoteChannelPreference {
  id: string;
  enabled: boolean;
  weight: number;
  orderMode?: QuoteOrderMode;
  hitokotoCategories?: HitokotoCategory[];
  chinesePoetryDynasty?: ChinesePoetryDynasty;
  chinesePoetryTypes?: ChinesePoetryType[];
  quotesOverride?: string[];
}

export interface CustomQuoteChannel {
  id: string;
  name: string;
  enabled: boolean;
  weight: number;
  quotes: string[];
  orderMode: QuoteOrderMode;
}

export interface PersistedQuoteSettings {
  autoRefreshEnabled: boolean;
  autoRefreshIntervalSec: number;
  animationMode: QuoteAnimationMode;
  typingSpeed: QuoteTypingSpeed;
  typewriterBackspaceEnabled: boolean;
  channels: QuoteChannelPreference[];
  customChannels: CustomQuoteChannel[];
}

export interface QuoteChannelState {
  channels: QuoteChannel[];
}

export interface QuoteSettingsState {
  autoRefreshEnabled: boolean;
  autoRefreshIntervalSec: number;
  animationMode: QuoteAnimationMode;
  typingSpeed: QuoteTypingSpeed;
  typewriterBackspaceEnabled: boolean;
}
