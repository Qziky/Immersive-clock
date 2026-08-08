import localInspirationalData from "../../data/quotes-1.json";
import universityMottosData from "../../data/quotes-2.json";
import type {
  ChinesePoetryDynasty,
  ChinesePoetryType,
  CustomQuoteChannel,
  HitokotoCategory,
  LocalQuoteChannel,
  QuoteChannel,
  QuoteChannelPreference,
  RemoteQuoteChannel,
} from "../../types/quote";
import {
  CHINESE_POETRY_DYNASTIES,
  CHINESE_POETRY_TYPES,
  HITOKOTO_CATEGORY_LIST,
} from "../../types/quote";

type BundledQuoteData = {
  quotes?: unknown;
};

const DEFAULT_HITOKOTO_CATEGORIES: HitokotoCategory[] = ["d", "k", "i"];

const BUILT_IN_CHANNELS: readonly QuoteChannel[] = [
  {
    id: "local-inspirational",
    name: "本地励志语录",
    kind: "local",
    weight: 40,
    enabled: true,
    builtIn: true,
    quotes: normalizeQuotes((localInspirationalData as BundledQuoteData).quotes),
    orderMode: "random",
  },
  {
    id: "university-mottos",
    name: "大学校训",
    kind: "local",
    weight: 40,
    enabled: true,
    builtIn: true,
    quotes: normalizeQuotes((universityMottosData as BundledQuoteData).quotes),
    orderMode: "random",
  },
  {
    id: "hitokoto-api",
    name: "一言",
    kind: "remote",
    providerId: "hitokoto",
    language: "zh",
    description: "支持动画、文学、影视等多种中文短句",
    weight: 20,
    enabled: true,
    builtIn: true,
    hitokotoCategories: DEFAULT_HITOKOTO_CATEGORIES,
  },
  {
    id: "jinrishici-api",
    name: "今日诗词",
    kind: "remote",
    providerId: "jinrishici",
    language: "zh",
    description: "结合时间与地点推荐的中文诗词",
    weight: 10,
    enabled: true,
    builtIn: true,
  },
  {
    id: "chinese-poetry-api",
    name: "诗泉",
    kind: "remote",
    providerId: "chinese-poetry",
    language: "zh",
    description: "随机古诗词，支持朝代与体裁筛选",
    weight: 10,
    enabled: true,
    builtIn: true,
    chinesePoetryTypes: [],
  },
  {
    id: "advice-slip-api",
    name: "Advice Slip",
    kind: "remote",
    providerId: "advice-slip",
    language: "en",
    description: "英文随机建议与生活提示",
    weight: 10,
    enabled: true,
    builtIn: true,
  },
] as const;

const BUILT_IN_IDS = new Set(BUILT_IN_CHANNELS.map((channel) => channel.id));

function clampWeight(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(9999, Math.round(parsed))) : fallback;
}

export function normalizeQuotes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 1000);
}

function normalizeCategories(value: unknown): HitokotoCategory[] {
  if (!Array.isArray(value)) return [...DEFAULT_HITOKOTO_CATEGORIES];
  const allowed = new Set(HITOKOTO_CATEGORY_LIST.map((category) => category.key));
  const categories = Array.from(
    new Set(value.filter((item): item is HitokotoCategory => allowed.has(item as HitokotoCategory)))
  );
  return categories.length > 0 ? categories : [...DEFAULT_HITOKOTO_CATEGORIES];
}

function normalizeChinesePoetryDynasty(value: unknown): ChinesePoetryDynasty | undefined {
  return CHINESE_POETRY_DYNASTIES.find((dynasty) => dynasty === value);
}

function normalizeChinesePoetryTypes(value: unknown): ChinesePoetryType[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(CHINESE_POETRY_TYPES);
  return Array.from(
    new Set(
      value.filter(
        (item): item is ChinesePoetryType => typeof item === "string" && allowed.has(item)
      )
    )
  );
}

function cloneChannel(channel: QuoteChannel): QuoteChannel {
  if (channel.kind === "local") {
    return { ...channel, quotes: [...channel.quotes] };
  }
  return {
    ...channel,
    hitokotoCategories: channel.hitokotoCategories ? [...channel.hitokotoCategories] : undefined,
    chinesePoetryTypes: channel.chinesePoetryTypes ? [...channel.chinesePoetryTypes] : undefined,
  };
}

export function getDefaultQuoteChannels(): QuoteChannel[] {
  return BUILT_IN_CHANNELS.map(cloneChannel);
}

export function isBuiltInQuoteChannelId(id: string): boolean {
  return BUILT_IN_IDS.has(id);
}

export function resolveQuoteChannels(
  preferences: readonly QuoteChannelPreference[],
  customChannels: readonly CustomQuoteChannel[]
): QuoteChannel[] {
  const preferenceMap = new Map<string, QuoteChannelPreference>();
  for (const preference of preferences) {
    if (!preference || typeof preference.id !== "string" || preferenceMap.has(preference.id)) {
      continue;
    }
    preferenceMap.set(preference.id, preference);
  }

  const builtIns = BUILT_IN_CHANNELS.map((definition) => {
    const channel = cloneChannel(definition);
    const preference = preferenceMap.get(channel.id);
    if (!preference) return channel;

    channel.enabled = Boolean(preference.enabled);
    channel.weight = clampWeight(preference.weight, channel.weight);
    if (channel.kind === "local") {
      channel.orderMode = preference.orderMode === "sequential" ? "sequential" : "random";
      if (preference.quotesOverride) {
        channel.quotes = normalizeQuotes(preference.quotesOverride);
      }
    } else if (channel.providerId === "hitokoto") {
      channel.hitokotoCategories = normalizeCategories(preference.hitokotoCategories);
    } else if (channel.providerId === "chinese-poetry") {
      channel.chinesePoetryDynasty = normalizeChinesePoetryDynasty(preference.chinesePoetryDynasty);
      channel.chinesePoetryTypes = normalizeChinesePoetryTypes(preference.chinesePoetryTypes);
    }
    return channel;
  });

  const seenIds = new Set(BUILT_IN_IDS);
  const custom: LocalQuoteChannel[] = [];
  for (const candidate of customChannels) {
    if (!candidate || typeof candidate.id !== "string" || seenIds.has(candidate.id)) continue;
    const quotes = normalizeQuotes(candidate.quotes);
    if (!quotes.length) continue;
    seenIds.add(candidate.id);
    custom.push({
      id: candidate.id,
      name: String(candidate.name || "自定义语录").trim() || "自定义语录",
      kind: "local",
      weight: clampWeight(candidate.weight, 10),
      enabled: Boolean(candidate.enabled),
      builtIn: false,
      quotes,
      orderMode: candidate.orderMode === "sequential" ? "sequential" : "random",
    });
  }

  return [...builtIns, ...custom];
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function serializeQuoteChannels(channels: readonly QuoteChannel[]): {
  channels: QuoteChannelPreference[];
  customChannels: CustomQuoteChannel[];
} {
  const defaults = new Map(BUILT_IN_CHANNELS.map((channel) => [channel.id, channel]));
  const preferences: QuoteChannelPreference[] = [];
  const customChannels: CustomQuoteChannel[] = [];

  for (const channel of channels) {
    const definition = defaults.get(channel.id);
    if (definition) {
      const preference: QuoteChannelPreference = {
        id: channel.id,
        enabled: channel.enabled,
        weight: clampWeight(channel.weight, definition.weight),
      };
      if (channel.kind === "local" && definition.kind === "local") {
        preference.orderMode = channel.orderMode;
        if (!arraysEqual(channel.quotes, definition.quotes)) {
          preference.quotesOverride = normalizeQuotes(channel.quotes);
        }
      }
      if (channel.kind === "remote" && channel.providerId === "hitokoto") {
        preference.hitokotoCategories = normalizeCategories(channel.hitokotoCategories);
      }
      if (channel.kind === "remote" && channel.providerId === "chinese-poetry") {
        preference.chinesePoetryDynasty = normalizeChinesePoetryDynasty(
          channel.chinesePoetryDynasty
        );
        preference.chinesePoetryTypes = normalizeChinesePoetryTypes(channel.chinesePoetryTypes);
      }
      preferences.push(preference);
      continue;
    }

    if (channel.kind === "local") {
      const quotes = normalizeQuotes(channel.quotes);
      if (!quotes.length) continue;
      customChannels.push({
        id: channel.id,
        name: channel.name,
        enabled: channel.enabled,
        weight: clampWeight(channel.weight, 10),
        quotes,
        orderMode: channel.orderMode,
      });
    }
  }

  return { channels: preferences, customChannels };
}

export function findRemoteChannel(
  channels: readonly QuoteChannel[],
  providerId: RemoteQuoteChannel["providerId"]
): RemoteQuoteChannel | undefined {
  return channels.find(
    (channel): channel is RemoteQuoteChannel =>
      channel.kind === "remote" && channel.providerId === providerId
  );
}
