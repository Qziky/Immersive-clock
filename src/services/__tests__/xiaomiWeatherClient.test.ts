import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  capacitorHttpGetJson: vi.fn(),
  executeWeatherRequest: vi.fn(),
  httpGetJson: vi.fn(),
  platform: "web" as "android" | "electron" | "web",
}));

vi.mock("../../utils/runtimePlatform", () => ({
  getRuntimePlatform: () => mocks.platform,
}));

vi.mock("../capacitorHttpClient", () => ({
  capacitorHttpGetJson: mocks.capacitorHttpGetJson,
}));

vi.mock("../httpClient", () => ({
  httpGetJson: mocks.httpGetJson,
}));

vi.mock("../weatherRequestGuard", () => ({
  executeWeatherRequest: mocks.executeWeatherRequest,
}));

describe("xiaomiWeatherClient", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.executeWeatherRequest.mockReset();
    mocks.capacitorHttpGetJson.mockReset();
    mocks.httpGetJson.mockReset();
    mocks.platform = "web";
    mocks.capacitorHttpGetJson.mockResolvedValue({ status: 0 });
    mocks.httpGetJson.mockResolvedValue({ status: 0 });
    mocks.executeWeatherRequest.mockImplementation((runner: () => Promise<unknown>) => runner());
  });

  it("按路径标记全量、分钟和城市解析请求", async () => {
    const { xiaomiWeatherGetJson } = await import("../xiaomiWeatherClient");

    await xiaomiWeatherGetJson("/weather/all?locationKey=test");
    await xiaomiWeatherGetJson("/weather/xm/forecast/minutely?locationKey=test");
    await xiaomiWeatherGetJson("/location/city/geo?latitude=31.2");

    expect(mocks.executeWeatherRequest.mock.calls.map((call) => call[1])).toEqual([
      "all",
      "minutely",
      "geoResolve",
    ]);
    expect(mocks.httpGetJson.mock.calls.map((call) => call[0])).toEqual([
      "/api/xiaomi-weather/wtr-v3/weather/all?locationKey=test",
      "/api/xiaomi-weather/wtr-v3/weather/xm/forecast/minutely?locationKey=test",
      "/api/xiaomi-weather/wtr-v3/location/city/geo?latitude=31.2",
    ]);
  });

  it("规范化缺少开头斜杠的路径", async () => {
    const { xiaomiWeatherGetJson } = await import("../xiaomiWeatherClient");

    await xiaomiWeatherGetJson("weather/all?locationKey=test");

    expect(mocks.httpGetJson).toHaveBeenCalledWith(
      "/api/xiaomi-weather/wtr-v3/weather/all?locationKey=test",
      undefined,
      10000
    );
  });

  it("Android 使用原生 HTTP 直连小米天气绝对地址", async () => {
    mocks.platform = "android";
    const { xiaomiWeatherGetJson } = await import("../xiaomiWeatherClient");

    await xiaomiWeatherGetJson("/weather/all?locationKey=test", 4321);

    expect(mocks.capacitorHttpGetJson).toHaveBeenCalledWith(
      "https://weatherapi.market.xiaomi.com/wtr-v3/weather/all?locationKey=test",
      undefined,
      4321
    );
    expect(mocks.httpGetJson).not.toHaveBeenCalled();
  });

  it("Electron 继续使用 app 协议可转发的同源代理路径", async () => {
    mocks.platform = "electron";
    const { xiaomiWeatherGetJson } = await import("../xiaomiWeatherClient");

    await xiaomiWeatherGetJson("/location/city/search?name=成都");

    expect(mocks.httpGetJson).toHaveBeenCalledWith(
      "/api/xiaomi-weather/wtr-v3/location/city/search?name=成都",
      undefined,
      10000
    );
    expect(mocks.capacitorHttpGetJson).not.toHaveBeenCalled();
  });
});
