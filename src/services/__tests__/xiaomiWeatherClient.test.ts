import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeWeatherRequest: vi.fn(),
  httpGetJson: vi.fn(),
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
    mocks.httpGetJson.mockReset();
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
      "location",
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
});
