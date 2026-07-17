import { describe, it, expect } from "vitest";

import type { WeatherAlertResponse } from "../../types/weather";
import {
  buildAlertSignature,
  normalizeStationKey,
  selectLatestAlertsPerStation,
  summarizeWeatherAlert,
} from "../weatherAlert";

/**
 * 单测：按站点选取最新预警（函数级注释）
 * - 验证同站点多条时选择时间更晚的一条
 * - 验证缺失 issuedTime 时使用 effectiveTime/expireTime 作为替代
 */
describe("selectLatestAlertsPerStation", () => {
  it("选择同站点中时间最新的一条", () => {
    const alerts: NonNullable<WeatherAlertResponse["alerts"]> = [
      {
        senderName: "气象站A",
        id: "a1",
        issuedTime: "2025-12-14T08:00:00+08:00",
        eventType: { name: "暴雨", code: "RAIN" },
        headline: "暴雨预警",
        description: "注意降雨",
      },
      {
        senderName: "气象站A",
        id: "a2",
        issuedTime: "2025-12-14T10:00:00+08:00",
        eventType: { name: "暴雨", code: "RAIN" },
        headline: "暴雨预警升级",
        description: "降雨更强",
      },
      {
        senderName: "气象站B",
        id: "b1",
        effectiveTime: "2025-12-14T09:00:00+08:00",
        eventType: { name: "大风", code: "WIND" },
        headline: "大风预警",
        description: "注意大风",
      },
    ];
    const res = selectLatestAlertsPerStation(alerts);
    const keys = res.map((r) => r.stationKey);
    expect(keys).toContain("气象站A");
    expect(keys).toContain("气象站B");
    const a = res.find((r) => r.stationKey === "气象站A")!;
    expect(a.alert.id).toBe("a2");
  });
});

/**
 * 单测：构造预警签名（函数级注释）
 * - id 存在时直接使用 id
 * - 缺失 id 时使用组合键
 */
describe("buildAlertSignature", () => {
  it("优先使用 id", () => {
    const a: NonNullable<WeatherAlertResponse["alerts"]>[number] = {
      id: "x1",
      senderName: "气象站X",
      eventType: { code: "RAIN" },
      headline: "暴雨",
      issuedTime: "2025-12-14T10:00:00+08:00",
    };
    expect(buildAlertSignature(a)).toBe("id:x1");
  });
  it("无 id 使用组合键", () => {
    const a: NonNullable<WeatherAlertResponse["alerts"]>[number] = {
      senderName: "气象站X",
      eventType: { code: "RAIN" },
      headline: "暴雨",
      issuedTime: "2025-12-14T10:00:00+08:00",
    };
    expect(buildAlertSignature(a)).toContain("sig:RAIN|暴雨|2025-12-14");
  });
});

/**
 * 单测：站点键归一化（函数级注释）
 * - senderName 存在时直接使用
 * - 缺失时使用坐标兜底键
 */
describe("normalizeStationKey", () => {
  it("使用 senderName", () => {
    expect(normalizeStationKey("  气象站C  ")).toBe("气象站C");
  });
  it("缺失 senderName 使用坐标兜底", () => {
    expect(normalizeStationKey(undefined, { lat: 31.1234, lon: 121.5678 })).toBe(
      "unknown:121.57,31.12"
    );
  });
});

describe("summarizeWeatherAlert", () => {
  it("提炼未来时段与降雨阈值", () => {
    expect(
      summarizeWeatherAlert({
        eventType: { name: "暴雨" },
        issuedTime: "2026-07-17T00:32:00+08:00",
        description:
          "成都市气象台发布青羊区暴雨橙色预警信号：青羊区多个街道未来3小时降雨量将达50毫米以上（或降雨强度将达40毫米/小时以上）。请注意防范。",
      })
    ).toBe("至03:32降雨≥50毫米");
  });

  it("缺少发布时间或生效时间时不把相对时段伪装成当前时间", () => {
    expect(
      summarizeWeatherAlert({
        eventType: { name: "暴雨" },
        description: "预计未来6小时降雨量将达50毫米以上。",
      })
    ).toBe("降雨≥50毫米");
  });

  it("保留跨日预警的绝对结束时间和局地最严重量级", () => {
    expect(
      summarizeWeatherAlert({
        eventType: { name: "暴雨" },
        description:
          "四川省气象台发布暴雨蓝色预警：7月16日20时到17日20时，部分地方有暴雨（雨量50～90毫米），局地大暴雨（雨量200～240毫米），最大小时雨强70～90毫米。",
      })
    ).toBe("至17日20时局地大暴雨200～240毫米");
  });

  it("从真实多区域预警中选择最高等级和最大量级", () => {
    expect(
      summarizeWeatherAlert({
        eventType: { name: "暴雨" },
        issuedTime: "2026-07-16T16:40:00+08:00",
        description: `成都市气象台2026年07
月16日16时40分发布暴
雨蓝色预警：预计今天傍
晚到明天白天，高新区、
青羊区、金牛区、武侯
区、青白江区、新都区、
温江区、双流区、郫都
区、新津区、都江堰市、
彭州市、邛崃市、崇州
市、大邑县、蒲江县的部
分地方有大雨到暴雨
(40~80毫米)，其中
新都区、温江区、郫都
区、新津区、彭州市、邛
崃市、大邑县、蒲江县的
个别地方有大暴雨(130
~160毫米)，最大小时
雨量60~80毫米；雷雨
时伴有短时阵性大风。我
市其余区（市）县以中雨
为主。请注意防范。`,
      })
    ).toBe("至17日白天个别地方大暴雨130～160毫米");
  });

  it("没有量化风险时使用简短风险描述或防范建议", () => {
    expect(
      summarizeWeatherAlert({
        eventType: { name: "雷电" },
        description: "请注意防范雷电活动。",
      })
    ).toBe("雷电活动，注意防范");
    expect(
      summarizeWeatherAlert({
        eventType: { name: "大风" },
        description: "发布范围较广，请结合当地情况关注后续信息。",
        defenses: [{ text: "远离临时搭建物和广告牌" }],
      })
    ).toBe("远离临时搭建物和广告牌");
  });

  it.each([
    {
      name: "持续降雨优先展示雨强",
      alert: {
        eventType: { name: "暴雨" },
        issuedTime: "2026-07-17T03:35:00+08:00",
        description: "预计未来6小时降雨仍将持续（10毫米/小时以上），并伴有雷电和阵性大风。",
      },
      expected: "至09:35雨强≥10毫米/小时",
    },
    {
      name: "已发生降雨与后续持续时间同时保留",
      alert: {
        eventType: { name: "暴雨" },
        issuedTime: "2026-07-17T03:08:00+08:00",
        description: "过去3小时降雨量已达90.2毫米，预计未来3小时降雨持续。",
      },
      expected: "至06:08降雨持续，累计90.2毫米",
    },
    {
      name: "小时窗口在降水量之前",
      alert: {
        eventType: { name: "暴雨" },
        issuedTime: "2026-07-17T04:20:00+08:00",
        description: "预计1-2小时内将出现30-50毫米降水，存在山洪风险。",
      },
      expected: "至06:20降水30～50毫米",
    },
    {
      name: "雷暴大风识别可达等级",
      alert: {
        eventType: { name: "雷暴大风" },
        issuedTime: "2026-07-17T00:35:00+08:00",
        description: "预计未来6小时将出现雷暴大风天气，阵风可达8级以上，并伴有冰雹。",
      },
      expected: "至06:35阵风≥8级",
    },
    {
      name: "强对流选择个别点最大降水",
      alert: {
        eventType: { name: "强对流" },
        issuedTime: "2026-07-16T12:00:00+08:00",
        description:
          "预计16日14时至17日14时，将有40到70毫米短时强降水（个别点90毫米以上），局地伴有雷暴大风和冰雹。",
      },
      expected: "至17日14时短时强降水≥90毫米",
    },
    {
      name: "摄氏度的另一种单位写法",
      alert: {
        eventType: { name: "高温" },
        issuedTime: "2026-07-14T09:29:00+08:00",
        description: "预计未来三天，大部分地区日最高气温将达35°C以上。",
      },
      expected: "至17日最高气温≥35℃",
    },
    {
      name: "浓雾选择最低能见度",
      alert: {
        eventType: { name: "大雾" },
        issuedTime: "2026-07-17T00:50:00+08:00",
        description:
          "预计17日1时到17日10时将出现能见度小于200米的浓雾，个别乡镇将出现能见度小于50米的强浓雾。",
      },
      expected: "至17日10时能见度<50米",
    },
    {
      name: "地质灾害保留绝对时段与风险等级",
      alert: {
        eventType: { name: "地质灾害气象风险" },
        issuedTime: "2026-07-16T16:51:00+08:00",
        description:
          "预计7月16日20时-7月17日20时，部分地区发生滑坡、崩塌、泥石流等地质灾害的风险高。",
      },
      expected: "至7月17日20时地质灾害风险高",
    },
    {
      name: "干旱按发布时刻换算未来一周",
      alert: {
        eventType: { name: "干旱" },
        issuedTime: "2026-07-15T12:49:00+08:00",
        description: "部分地区已达到重旱等级，预计未来一周无有效降水，气象干旱将进一步加剧。",
      },
      expected: "至22日重旱，干旱将加剧",
    },
  ])("$name", ({ alert, expected }) => {
    const summary = summarizeWeatherAlert(alert);
    expect(summary).toBe(expected);
    expect(summary.length).toBeLessThanOrEqual(24);
  });
});
