import { describe, expect, it } from "vitest";

import type { CustomQuoteChannel, QuoteChannelPreference } from "../../../types/quote";
import {
  getDefaultQuoteChannels,
  resolveQuoteChannels,
  serializeQuoteChannels,
} from "../quoteRegistry";

describe("quoteRegistry", () => {
  it("提供两个本地频道和四个默认启用的独立在线频道", () => {
    const channels = getDefaultQuoteChannels();
    const remote = channels.filter((channel) => channel.kind === "remote");

    expect(channels).toHaveLength(6);
    expect(remote.map((channel) => channel.providerId)).toEqual([
      "hitokoto",
      "jinrishici",
      "chinese-poetry",
      "advice-slip",
    ]);
    expect(remote.map((channel) => channel.weight)).toEqual([20, 10, 10, 10]);
    expect(remote.every((channel) => channel.enabled)).toBe(true);
  });

  it("用偏好覆盖内置字段并保留新增内置频道", () => {
    const preferences: QuoteChannelPreference[] = [
      {
        id: "hitokoto-api",
        enabled: false,
        weight: 88,
        hitokotoCategories: ["a", "h", "j", "l"],
      },
      {
        id: "chinese-poetry-api",
        enabled: true,
        weight: 33,
        chinesePoetryDynasty: "宋",
        chinesePoetryTypes: ["宋词", "七言绝句"],
      },
      {
        id: "local-inspirational",
        enabled: true,
        weight: 12,
        orderMode: "sequential",
        quotesOverride: ["自定义第一句", "自定义第二句"],
      },
    ];

    const channels = resolveQuoteChannels(preferences, []);
    const hitokoto = channels.find((channel) => channel.id === "hitokoto-api");
    const chinesePoetry = channels.find((channel) => channel.id === "chinese-poetry-api");
    const local = channels.find((channel) => channel.id === "local-inspirational");

    expect(channels).toHaveLength(6);
    expect(hitokoto).toMatchObject({ enabled: false, weight: 88 });
    expect(hitokoto?.kind === "remote" ? hitokoto.hitokotoCategories : []).toEqual([
      "a",
      "h",
      "j",
      "l",
    ]);
    expect(chinesePoetry).toMatchObject({
      enabled: true,
      weight: 33,
      chinesePoetryDynasty: "宋",
      chinesePoetryTypes: ["宋词", "七言绝句"],
    });
    expect(local).toMatchObject({ weight: 12, orderMode: "sequential" });
    expect(local?.kind === "local" ? local.quotes : []).toEqual(["自定义第一句", "自定义第二句"]);
  });

  it("过滤重复或空自定义频道并限制权重", () => {
    const customChannels: CustomQuoteChannel[] = [
      {
        id: "local-inspirational",
        name: "冲突频道",
        enabled: true,
        weight: 10,
        quotes: ["不应出现"],
        orderMode: "random",
      },
      {
        id: "custom-txt-demo",
        name: "演示",
        enabled: true,
        weight: 20_000,
        quotes: ["第一句", ""],
        orderMode: "sequential",
      },
      {
        id: "custom-empty",
        name: "空频道",
        enabled: true,
        weight: 1,
        quotes: [],
        orderMode: "random",
      },
    ];

    const channels = resolveQuoteChannels([], customChannels);
    const custom = channels.find((channel) => channel.id === "custom-txt-demo");

    expect(channels).toHaveLength(7);
    expect(custom).toMatchObject({ weight: 9999, orderMode: "sequential" });
    expect(custom?.kind === "local" ? custom.quotes : []).toEqual(["第一句"]);
  });

  it("归一诗泉筛选并丢弃未知朝代、体裁和重复项", () => {
    const channels = resolveQuoteChannels(
      [
        {
          id: "chinese-poetry-api",
          enabled: true,
          weight: 10,
          chinesePoetryDynasty: "明",
          chinesePoetryTypes: ["宋词", "未知体裁", "宋词"],
        } as unknown as QuoteChannelPreference,
      ],
      []
    );
    const chinesePoetry = channels.find((channel) => channel.id === "chinese-poetry-api");

    expect(chinesePoetry).toMatchObject({ chinesePoetryTypes: ["宋词"] });
    expect(
      chinesePoetry?.kind === "remote" ? chinesePoetry.chinesePoetryDynasty : "unexpected"
    ).toBeUndefined();
  });

  it("序列化时只持久化内置偏好与本地内容覆盖", () => {
    const channels = getDefaultQuoteChannels().map((channel) => {
      if (channel.id === "university-mottos" && channel.kind === "local") {
        return { ...channel, quotes: ["新的校训"], orderMode: "sequential" as const };
      }
      return channel;
    });

    const persisted = serializeQuoteChannels(channels);
    const university = persisted.channels.find((channel) => channel.id === "university-mottos");
    const chinesePoetry = persisted.channels.find((channel) => channel.id === "chinese-poetry-api");

    expect(university).toMatchObject({
      orderMode: "sequential",
      quotesOverride: ["新的校训"],
    });
    expect(chinesePoetry).toMatchObject({
      enabled: true,
      weight: 10,
      chinesePoetryTypes: [],
    });
    expect(persisted.customChannels).toEqual([]);
  });
});
