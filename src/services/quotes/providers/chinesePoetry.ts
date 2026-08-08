import type { ChinesePoetryDynasty, ChinesePoetryType, Quote } from "../../../types/quote";
import {
  createStableQuoteId,
  type FetchImplementation,
  QuoteProviderError,
  requestQuoteJson,
  requireNonEmptyString,
} from "../providerTypes";

export const CHINESE_POETRY_ENDPOINT = "https://poetry.palemoky.com/api/poems/random";

interface ChinesePoetryEntity {
  id?: number | string;
  name?: string;
}

interface ChinesePoetryPoem {
  id?: number | string;
  title?: string;
  content?: unknown;
  author?: ChinesePoetryEntity | null;
  dynasty?: ChinesePoetryEntity | null;
}

interface ChinesePoetryResponse {
  data?: ChinesePoetryPoem;
  lang?: string;
}

export interface ChinesePoetryFilterOptions {
  dynasty?: ChinesePoetryDynasty;
  types?: readonly ChinesePoetryType[];
}

export interface FetchChinesePoetryQuoteOptions extends ChinesePoetryFilterOptions {
  signal?: AbortSignal;
  fetchImplementation?: FetchImplementation;
  timeoutMs?: number;
  now?: () => number;
  random?: () => number;
}

export function createChinesePoetryCacheScope(options: ChinesePoetryFilterOptions = {}): string {
  const types = Array.from(new Set(options.types ?? [])).sort();
  return JSON.stringify({ dynasty: options.dynasty ?? "", types });
}

function createChinesePoetryUrl(options: ChinesePoetryFilterOptions): string {
  const url = new URL(CHINESE_POETRY_ENDPOINT);
  url.searchParams.set("lang", "zh-Hans");
  if (options.dynasty) url.searchParams.set("dynasty", options.dynasty);
  for (const type of options.types ?? []) url.searchParams.append("type", type);
  return url.toString();
}

function selectLine(content: unknown, random: () => number): { index: number; text: string } {
  if (!Array.isArray(content)) {
    throw new QuoteProviderError("诗泉返回的正文格式无效", {
      code: "invalid-payload",
      providerId: "chinese-poetry",
    });
  }
  const lines = content
    .map((value, index) => ({ index, text: requireNonEmptyString(value) }))
    .filter((line): line is { index: number; text: string } => Boolean(line.text));
  if (!lines.length) {
    throw new QuoteProviderError("诗泉返回了空正文", {
      code: "invalid-payload",
      providerId: "chinese-poetry",
    });
  }
  const randomValue = random();
  const normalizedRandom = Number.isFinite(randomValue)
    ? Math.min(Math.max(randomValue, 0), 1 - Number.EPSILON)
    : 0;
  return lines[Math.floor(normalizedRandom * lines.length)];
}

function adaptChinesePoetryResponse(
  payload: unknown,
  options: ChinesePoetryFilterOptions,
  fetchedAt: number,
  random: () => number
): Quote {
  if (!payload || typeof payload !== "object") {
    throw new QuoteProviderError("诗泉返回数据格式无效", {
      code: "invalid-payload",
      providerId: "chinese-poetry",
    });
  }
  const response = payload as ChinesePoetryResponse;
  if (!response.data || typeof response.data !== "object") {
    throw new QuoteProviderError("诗泉返回数据格式无效", {
      code: "invalid-payload",
      providerId: "chinese-poetry",
    });
  }
  const poem = response.data;
  const line = selectLine(poem.content, random);
  const dynasty = requireNonEmptyString(poem.dynasty?.name);
  const title = requireNonEmptyString(poem.title);
  const upstreamId =
    typeof poem.id === "string" || typeof poem.id === "number"
      ? `${String(poem.id)}:${line.index}`
      : undefined;

  return {
    id: createStableQuoteId("chinese-poetry", upstreamId, line.text),
    text: line.text,
    author: requireNonEmptyString(poem.author?.name),
    origin: [dynasty, title].filter(Boolean).join(" · ") || undefined,
    cacheScope: createChinesePoetryCacheScope(options),
    providerId: "chinese-poetry",
    language: "zh",
    fetchedAt,
  };
}

export async function fetchChinesePoetryQuote(
  options: FetchChinesePoetryQuoteOptions = {}
): Promise<Quote> {
  const now = options.now ?? Date.now;
  const filters = { dynasty: options.dynasty, types: options.types };
  const payload = await requestQuoteJson({
    providerId: "chinese-poetry",
    url: createChinesePoetryUrl(filters),
    fetchImplementation: options.fetchImplementation,
    signal: options.signal,
    timeoutMs: options.timeoutMs,
    now,
  });
  return adaptChinesePoetryResponse(payload, filters, now(), options.random ?? Math.random);
}
