import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = [];

  readonly listeners = new Set<(event: MessageEvent) => void>();
  readonly postMessage = vi.fn();
  readonly close = vi.fn();

  constructor(readonly name: string) {
    FakeBroadcastChannel.instances.push(this);
  }

  addEventListener(_type: "message", listener: (event: MessageEvent) => void): void {
    this.listeners.add(listener);
  }

  emit(data: unknown): void {
    this.listeners.forEach((listener) => listener(new MessageEvent("message", { data })));
  }
}

describe("weatherSyncChannel", () => {
  const OriginalBroadcastChannel = globalThis.BroadcastChannel;

  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    FakeBroadcastChannel.instances = [];
    globalThis.BroadcastChannel = FakeBroadcastChannel as unknown as typeof BroadcastChannel;
  });

  afterEach(async () => {
    const sync = await import("../weatherSyncChannel");
    sync.__resetWeatherSyncChannelForTests();
    globalThis.BroadcastChannel = OriginalBroadcastChannel;
  });

  it("广播缓存更新时间，并对 BroadcastChannel 与 storage 的重复消息去重", async () => {
    const sync = await import("../weatherSyncChannel");
    const listener = vi.fn();
    const unsubscribe = sync.subscribeWeatherCacheSync(listener);

    sync.broadcastWeatherCacheUpdate("minutely", "121.5000,31.2000");

    const channel = FakeBroadcastChannel.instances[0];
    expect(channel.name).toBe("immersive-clock:weather-cache-sync:v1");
    expect(channel.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        location: "121.5000,31.2000",
        target: "minutely",
        type: "cache-updated",
      })
    );
    expect(localStorage.getItem("immersive-clock:weather-cache-sync-message:v1")).toContain(
      "minutely"
    );

    const remoteMessage = {
      id: "remote:1",
      location: "121.5000,31.2000",
      sentAt: Date.now(),
      target: "all",
      type: "cache-updated",
    };
    channel.emit(remoteMessage);
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "immersive-clock:weather-cache-sync-message:v1",
        newValue: JSON.stringify(remoteMessage),
      })
    );

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(remoteMessage);
    unsubscribe();
    expect(channel.close).toHaveBeenCalledTimes(1);
  });
});
