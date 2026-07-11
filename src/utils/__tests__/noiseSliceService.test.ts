import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_NOISE_REPORT_RETENTION_DAYS } from "../../constants/noiseReport";
import type { NoiseSliceSummary } from "../../types/noise";

interface FakeStoredSlice extends NoiseSliceSummary {
  id: string;
}

interface FakeQuery {
  endFrom?: number;
  endTo?: number;
  direction?: "asc" | "desc";
  limit?: number;
}

let records = new Map<string, FakeStoredSlice>();

const list = vi.fn(async (query: FakeQuery = {}) => {
  const direction = query.direction === "desc" ? -1 : 1;
  const limit = query.limit ?? Infinity;
  return [...records.values()]
    .filter(
      (slice) =>
        (query.endFrom === undefined || slice.end >= query.endFrom) &&
        (query.endTo === undefined || slice.end <= query.endTo)
    )
    .sort((first, second) => (first.end - second.end) * direction)
    .slice(0, limit);
});
const put = vi.fn(async (record: FakeStoredSlice) => {
  records.set(record.id, structuredClone(record));
});
const putAll = vi.fn(async (nextRecords: FakeStoredSlice[]) => {
  const next = new Map(records);
  nextRecords.forEach((record) => next.set(record.id, structuredClone(record)));
  records = next;
});
const replaceAll = vi.fn(async (nextRecords: FakeStoredSlice[]) => {
  records = new Map(nextRecords.map((record) => [record.id, structuredClone(record)] as const));
});
const deleteEndedBefore = vi.fn(async (cutoff: number) => {
  records.forEach((record, id) => {
    if (record.end < cutoff) records.delete(id);
  });
});
const clear = vi.fn(async () => {
  records.clear();
});

const fakeNoiseHistoryDb = { list, put, putAll, replaceAll, deleteEndedBefore, clear };

function resetFakeDb(): void {
  records.clear();
  list.mockClear();
  put.mockClear();
  putAll.mockClear();
  replaceAll.mockClear();
  deleteEndedBefore.mockClear();
  clear.mockClear();
}

async function loadService() {
  vi.resetModules();
  vi.doMock("../db", () => ({ noiseHistoryDb: fakeNoiseHistoryDb }));
  return import("../noiseSliceService");
}

function makeSlice(params: { start: number; end: number; score: number }): NoiseSliceSummary {
  return {
    start: params.start,
    end: params.end,
    frames: 1,
    raw: {
      avgDbfs: -40,
      maxDbfs: -20,
      p50Dbfs: -40,
      p95Dbfs: -25,
      overRatioDbfs: 0,
      segmentCount: 0,
    },
    display: {
      avgDb: 40,
      p95Db: 50,
    },
    score: params.score,
    scoreDetail: {
      sustainedPenalty: 0,
      timePenalty: 0,
      segmentPenalty: 0,
      thresholdsUsed: {
        scoreThresholdDbfs: -35,
        segmentMergeGapMs: 5000,
        maxSegmentsPerMin: 6,
      },
      sustainedLevelDbfs: -40,
      overRatioDbfs: 0,
      segmentCount: 0,
      minutes: 1,
    },
  };
}

describe("noiseSliceService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(0);
    localStorage.clear();
    resetFakeDb();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("首次读取应将旧 localStorage 数据幂等迁移到 IndexedDB", async () => {
    const legacy = [makeSlice({ start: 1, end: 2, score: 90 })];
    localStorage.setItem("noise-slices", JSON.stringify(legacy));

    let service = await loadService();
    expect(await service.readNoiseSlices()).toEqual(legacy);
    expect(localStorage.getItem("noise-slices")).toBeNull();
    expect(records.size).toBe(1);

    localStorage.setItem("noise-slices", JSON.stringify(legacy));
    service = await loadService();
    expect(await service.readNoiseSlices()).toEqual(legacy);
    expect(records.size).toBe(1);
  });

  it("迁移事务失败时应保留旧键并回退到 localStorage", async () => {
    const legacy = [makeSlice({ start: 1, end: 2, score: 90 })];
    localStorage.setItem("noise-slices", JSON.stringify(legacy));
    putAll.mockRejectedValueOnce(new Error("transaction failed"));

    const service = await loadService();
    expect(await service.readNoiseSlices()).toEqual(legacy);
    expect(localStorage.getItem("noise-slices")).not.toBeNull();
  });

  it("迁移时应按当前时间裁剪过期记录", async () => {
    const dayMs = 24 * 60 * 60 * 1000;
    const now = DEFAULT_NOISE_REPORT_RETENTION_DAYS * dayMs + 10_000;
    vi.mocked(Date.now).mockReturnValue(now);
    const expired = makeSlice({ start: 0, end: 1, score: 90 });
    const recent = makeSlice({ start: now - 2, end: now - 1, score: 80 });
    localStorage.setItem("noise-slices", JSON.stringify([expired, recent]));

    const service = await loadService();

    expect(await service.readNoiseSlices()).toEqual([recent]);
    expect(deleteEndedBefore).toHaveBeenCalledWith(
      now - DEFAULT_NOISE_REPORT_RETENTION_DAYS * dayMs
    );
  });

  it("主路径追加单条记录，不应重写完整历史数组", async () => {
    const service = await loadService();
    await service.readNoiseSlices();
    list.mockClear();

    const slice = makeSlice({ start: 1, end: 2, score: 90 });
    await service.writeNoiseSlice(slice);

    expect(put).toHaveBeenCalledTimes(1);
    expect(deleteEndedBefore).toHaveBeenCalledTimes(1);
    expect(list).not.toHaveBeenCalled();
    expect(await service.readNoiseSlices()).toEqual([slice]);
  });

  it("默认应只保留最近指定天数的切片摘要", async () => {
    const service = await loadService();
    const dayMs = 24 * 60 * 60 * 1000;
    await service.writeNoiseSlice(makeSlice({ start: 0, end: 1, score: 90 }));
    vi.mocked(Date.now).mockReturnValue(DEFAULT_NOISE_REPORT_RETENTION_DAYS * dayMs + 3);
    await service.writeNoiseSlice(
      makeSlice({
        start: DEFAULT_NOISE_REPORT_RETENTION_DAYS * dayMs + 2,
        end: DEFAULT_NOISE_REPORT_RETENTION_DAYS * dayMs + 3,
        score: 80,
      })
    );

    const history = await service.readNoiseSlices();
    expect(history).toHaveLength(1);
    expect(history[0].end).toBe(DEFAULT_NOISE_REPORT_RETENTION_DAYS * dayMs + 3);
  });

  it("切片结束时间等于 cutoff 时应被保留", async () => {
    const service = await loadService();
    const dayMs = 24 * 60 * 60 * 1000;
    await service.writeNoiseSlice(makeSlice({ start: 2, end: 3, score: 90 }));
    vi.mocked(Date.now).mockReturnValue(DEFAULT_NOISE_REPORT_RETENTION_DAYS * dayMs + 3);
    await service.writeNoiseSlice(
      makeSlice({
        start: DEFAULT_NOISE_REPORT_RETENTION_DAYS * dayMs + 2,
        end: DEFAULT_NOISE_REPORT_RETENTION_DAYS * dayMs + 3,
        score: 80,
      })
    );

    expect(await service.readNoiseSlices()).toHaveLength(2);
  });

  it("保存天数设置为 1 天时应按 1 天裁剪", async () => {
    localStorage.setItem(
      "AppSettings",
      JSON.stringify({
        noiseControl: {
          reportRetentionDays: 1,
        },
      })
    );
    const service = await loadService();
    const dayMs = 24 * 60 * 60 * 1000;
    await service.writeNoiseSlice(makeSlice({ start: 0, end: 1, score: 90 }));
    vi.mocked(Date.now).mockReturnValue(dayMs + 3);
    await service.writeNoiseSlice(makeSlice({ start: dayMs + 2, end: dayMs + 3, score: 80 }));

    const history = await service.readNoiseSlices();
    expect(history).toHaveLength(1);
    expect(history[0].end).toBe(dayMs + 3);
  });

  it("应支持索引范围、倒序和数量限制查询", async () => {
    const service = await loadService();
    await service.replaceNoiseSlices([
      makeSlice({ start: 0, end: 1, score: 90 }),
      makeSlice({ start: 1, end: 2, score: 80 }),
      makeSlice({ start: 2, end: 3, score: 70 }),
    ]);

    const history = await service.readNoiseSlices({ endFrom: 2, direction: "desc", limit: 1 });
    expect(history.map((slice) => slice.end)).toEqual([3]);
  });

  it("恢复备份时会严格替换全部历史，不按当前保留期限裁剪", async () => {
    localStorage.setItem(
      "AppSettings",
      JSON.stringify({ noiseControl: { reportRetentionDays: 1 } })
    );
    const service = await loadService();
    const dayMs = 24 * 60 * 60 * 1000;
    const archived = makeSlice({ start: 0, end: 1, score: 90 });
    const recent = makeSlice({ start: dayMs * 10, end: dayMs * 10 + 1, score: 80 });

    await service.replaceNoiseSlices([archived, recent]);

    expect(await service.exportNoiseSlices()).toEqual([archived, recent]);
  });

  it("替换前应完整校验，失败时保留原记录", async () => {
    const service = await loadService();
    const original = makeSlice({ start: 1, end: 2, score: 90 });
    await service.replaceNoiseSlices([original]);

    await expect(service.replaceNoiseSlices([{ end: 3 }])).rejects.toThrow("有效的切片数组");
    expect(await service.exportNoiseSlices()).toEqual([original]);
    expect(replaceAll).toHaveBeenCalledTimes(1);
  });

  it("规范化后 ID 相同的切片应在写入前拒绝", async () => {
    const service = await loadService();
    const first = makeSlice({ start: 1.2, end: 2.2, score: 90 });
    const duplicate = makeSlice({ start: 1.4, end: 2.4, score: 90 });

    expect(() => service.validateNoiseSlicesForReplacement([first, duplicate])).toThrow("重复切片");
    await expect(service.replaceNoiseSlices([first, duplicate])).rejects.toThrow("重复切片");
    expect(replaceAll).not.toHaveBeenCalled();
  });

  it("IndexedDB 替换事务失败时应保留原记录", async () => {
    const service = await loadService();
    const original = makeSlice({ start: 1, end: 2, score: 90 });
    await service.replaceNoiseSlices([original]);
    replaceAll.mockRejectedValueOnce(new Error("quota exceeded"));

    await expect(
      service.replaceNoiseSlices([makeSlice({ start: 3, end: 4, score: 70 })])
    ).rejects.toThrow("quota exceeded");
    expect(await service.exportNoiseSlices()).toEqual([original]);
  });

  it("检查、写入和清空应返回正确元数据并持续发送更新事件", async () => {
    const service = await loadService();
    const listener = vi.fn();
    const unsubscribe = service.subscribeNoiseSlicesUpdated(listener);

    await service.writeNoiseSlice(makeSlice({ start: 1, end: 2, score: 90 }));
    const inspection = await service.inspectNoiseSlices();
    expect(inspection.count).toBe(1);
    expect(inspection.itemCount).toBe(1);
    expect(inspection.bytes).toBeGreaterThan(0);
    expect(inspection.updatedAt).toBe(2);

    localStorage.setItem("unrelated-sentinel", "keep");
    await service.clearNoiseSlices();
    expect(await service.readNoiseSlices()).toEqual([]);
    expect(localStorage.getItem("unrelated-sentinel")).toBe("keep");
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("IndexedDB 不可用时应保留 localStorage 兼容路径", async () => {
    list.mockRejectedValueOnce(new Error("IndexedDB unavailable"));
    const service = await loadService();
    const slice = makeSlice({ start: 1, end: 2, score: 90 });

    await service.writeNoiseSlice(slice);
    expect(JSON.parse(localStorage.getItem("noise-slices") ?? "[]")).toEqual([slice]);
    expect(await service.readNoiseSlices()).toEqual([slice]);

    await service.clearNoiseSlices();
    expect(localStorage.getItem("noise-slices")).toBeNull();
  });

  it("localStorage 回退替换遇配额错误时应抛错并保留原历史", async () => {
    const original = makeSlice({ start: 1, end: 2, score: 90 });
    localStorage.setItem("noise-slices", JSON.stringify([original]));
    list.mockRejectedValueOnce(new Error("IndexedDB unavailable"));
    const service = await loadService();
    expect(await service.readNoiseSlices()).toEqual([original]);

    const nativeSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === "noise-slices") {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      }
      return nativeSetItem.call(this, key, value);
    });

    await expect(
      service.replaceNoiseSlices([makeSlice({ start: 3, end: 4, score: 70 })])
    ).rejects.toMatchObject({ name: "QuotaExceededError" });
    expect(JSON.parse(localStorage.getItem("noise-slices") ?? "[]")).toEqual([original]);
  });
});
