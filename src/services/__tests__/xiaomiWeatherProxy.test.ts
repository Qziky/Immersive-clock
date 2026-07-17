import { describe, expect, it } from "vitest";

import { resolveXiaomiWeatherUpstreamUrl } from "../../../electron/xiaomiWeatherProxy";

describe("resolveXiaomiWeatherUpstreamUrl", () => {
  it("将 Electron 同源天气路径转发到固定小米上游并保留查询参数", () => {
    expect(
      resolveXiaomiWeatherUpstreamUrl(
        "app://local/api/xiaomi-weather/wtr-v3/weather/all?locationKey=weathercn%3A101270101"
      )
    ).toBe(
      "https://weatherapi.market.xiaomi.com/wtr-v3/weather/all?locationKey=weathercn%3A101270101"
    );
  });

  it("拒绝天气前缀以外和伪装成天气前缀的路径", () => {
    expect(
      resolveXiaomiWeatherUpstreamUrl("app://local/api/xiaomi-weather-admin/wtr-v3/test")
    ).toBeNull();
    expect(resolveXiaomiWeatherUpstreamUrl("app://local/api/xiaomi-weather/other/test")).toBeNull();
  });
});
