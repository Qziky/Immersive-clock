import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  listNoiseInputDevices,
  openNoiseInputStream,
  requestNoiseInputDeviceAccess,
  subscribeNoiseInputDeviceChanges,
} from "../noiseInputDeviceService";

const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");

function device(kind: MediaDeviceKind, deviceId: string, label = ""): MediaDeviceInfo {
  return { kind, deviceId, label, groupId: "", toJSON: () => ({}) } as MediaDeviceInfo;
}

function installMediaDevices(value: Partial<MediaDevices>): void {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value,
  });
}

describe("noiseInputDeviceService", () => {
  beforeEach(() => vi.restoreAllMocks());

  afterEach(() => {
    if (originalMediaDevices) {
      Object.defineProperty(navigator, "mediaDevices", originalMediaDevices);
    } else {
      Reflect.deleteProperty(navigator, "mediaDevices");
    }
  });

  it("只返回去重后的物理麦克风并为无标签设备生成占位名称", async () => {
    installMediaDevices({
      enumerateDevices: vi
        .fn()
        .mockResolvedValue([
          device("audioinput", "default", "默认设备"),
          device("audioinput", "mic-a", "桌面麦克风"),
          device("audioinput", "mic-a", "重复设备"),
          device("audioinput", "mic-b"),
          device("videoinput", "camera", "摄像头"),
        ]),
    });

    await expect(listNoiseInputDevices()).resolves.toEqual([
      { deviceId: "mic-a", label: "桌面麦克风" },
      { deviceId: "mic-b", label: "麦克风 2" },
    ]);
  });

  it("显式授权后停止临时轨道并返回刷新后的列表", async () => {
    const lifecycle: string[] = [];
    const stop = vi.fn(() => lifecycle.push("stop"));
    installMediaDevices({
      getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }),
      enumerateDevices: vi.fn(async () => {
        lifecycle.push("enumerate");
        return [device("audioinput", "mic-after-access", "USB 麦克风")];
      }),
    });

    await expect(requestNoiseInputDeviceAccess()).resolves.toEqual([
      { deviceId: "mic-after-access", label: "USB 麦克风" },
    ]);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(lifecycle).toEqual(["stop", "enumerate"]);
  });

  it("设备 API 不支持时返回明确错误", async () => {
    installMediaDevices({});

    await expect(listNoiseInputDevices()).rejects.toThrow("当前环境不支持列出麦克风设备");
    await expect(requestNoiseInputDeviceAccess()).rejects.toThrow("当前环境不支持申请麦克风权限");
  });

  it("显式授权被拒绝时不继续枚举设备", async () => {
    const error = Object.assign(new Error("denied"), { name: "NotAllowedError" });
    const enumerateDevices = vi.fn();
    installMediaDevices({
      getUserMedia: vi.fn().mockRejectedValue(error),
      enumerateDevices,
    });

    await expect(requestNoiseInputDeviceAccess()).rejects.toBe(error);
    expect(enumerateDevices).not.toHaveBeenCalled();
  });

  it("优先请求指定设备，并在设备缺失时回退系统默认", async () => {
    const fallbackStream = { getTracks: () => [] } as unknown as MediaStream;
    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("missing"), { name: "NotFoundError" }))
      .mockResolvedValueOnce(fallbackStream);
    installMediaDevices({ getUserMedia });

    await expect(openNoiseInputStream("preferred-mic")).resolves.toBe(fallbackStream);
    expect(getUserMedia).toHaveBeenNthCalledWith(1, {
      audio: expect.objectContaining({ deviceId: { exact: "preferred-mic" } }),
      video: false,
    });
    expect(getUserMedia).toHaveBeenNthCalledWith(2, {
      audio: expect.not.objectContaining({ deviceId: expect.anything() }),
      video: false,
    });
  });

  it("权限拒绝时不尝试其他设备", async () => {
    const error = Object.assign(new Error("denied"), { name: "NotAllowedError" });
    const getUserMedia = vi.fn().mockRejectedValue(error);
    installMediaDevices({ getUserMedia });

    await expect(openNoiseInputStream("preferred-mic")).rejects.toBe(error);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("订阅并解除设备变化事件", () => {
    const mediaDevices = new EventTarget() as MediaDevices;
    installMediaDevices(mediaDevices);
    const listener = vi.fn();

    const unsubscribe = subscribeNoiseInputDeviceChanges(listener);
    mediaDevices.dispatchEvent(new Event("devicechange"));
    unsubscribe();
    mediaDevices.dispatchEvent(new Event("devicechange"));

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
