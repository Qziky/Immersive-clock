export type QuoteProviderId = "hitokoto" | "jinrishici" | "advice-slip";

export type QuoteLanguage = "zh" | "en";

export type QuoteOrderMode = "random" | "sequential";

export type HitokotoCategory = "d" | "i" | "k" | "l";

export const HITOKOTO_CATEGORIES: Record<HitokotoCategory, string> = {
  d: "文学",
  i: "诗词",
  k: "哲学",
  l: "抖机灵",
};

export const HITOKOTO_CATEGORY_LIST: Array<{ key: HitokotoCategory; name: string }> = [
  { key: "d", name: "文学" },
  { key: "i", name: "诗词" },
  { key: "k", name: "哲学" },
  { key: "l", name: "抖机灵" },
];

export interface Quote {
  id: string;
  text: string;
  author?: string;
  origin?: string;
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
}

export type QuoteChannel = LocalQuoteChannel | RemoteQuoteChannel;

export interface QuoteChannelPreference {
  id: string;
  enabled: boolean;
  weight: number;
  orderMode?: QuoteOrderMode;
  hitokotoCategories?: HitokotoCategory[];
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
  channels: QuoteChannelPreference[];
  customChannels: CustomQuoteChannel[];
}

export interface QuoteChannelState {
  channels: QuoteChannel[];
}

export interface QuoteSettingsState {
  autoRefreshEnabled: boolean;
  autoRefreshIntervalSec: number;
}
