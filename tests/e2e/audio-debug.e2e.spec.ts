import { expect, test, type BrowserContext, type Page } from "@playwright/test";

async function installDeterministicAudioDiagnostics(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    localStorage.setItem(
      "AppSettings",
      JSON.stringify({
        version: 11,
        general: {
          developerModeEnabled: true,
          startup: { initialMode: "study" },
        },
        study: { display: { showNoiseMonitor: false } },
        noiseControl: {
          monitoringEnabled: false,
          historyEnabled: true,
          primaryMetric: "quietness-score",
          showRealtimeValue: true,
          scoreAlertThreshold: 70,
          reportAutoPopup: false,
          alertSoundEnabled: false,
        },
      })
    );
    localStorage.setItem("immersive-clock:has-seen-tour", "true");

    class FakeTrack extends EventTarget {
      constructor(
        readonly deviceId: string,
        readonly label: string
      ) {
        super();
      }

      getSettings(): MediaTrackSettings {
        return {
          autoGainControl: false,
          channelCount: 1,
          deviceId: this.deviceId,
          echoCancellation: false,
          noiseSuppression: false,
          sampleRate: 1_000,
        };
      }

      stop(): void {
        sessionStorage.setItem("audio-debug:is-capturing", "false");
      }
    }

    const devices = [
      { deviceId: "audio-debug-device", label: "Audio debug microphone" },
      { deviceId: "usb-debug-device", label: "USB debug microphone" },
    ];
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        addEventListener: () => undefined,
        enumerateDevices: async () =>
          devices.map(
            (device) =>
              ({
                ...device,
                groupId: "audio-debug-group",
                kind: "audioinput",
                toJSON: () => ({}),
              }) as MediaDeviceInfo
          ),
        getUserMedia: async (constraints: MediaStreamConstraints) => {
          const calls = Number(localStorage.getItem("audio-debug:get-user-media-count") ?? "0") + 1;
          localStorage.setItem("audio-debug:get-user-media-count", String(calls));
          const audio = constraints.audio;
          const requestedDeviceId =
            audio &&
            typeof audio === "object" &&
            audio.deviceId &&
            typeof audio.deviceId === "object"
              ? String(audio.deviceId.exact ?? "")
              : "";
          const selectedDevice =
            devices.find((device) => device.deviceId === requestedDeviceId) ?? devices[0];
          localStorage.setItem("audio-debug:last-device-id", selectedDevice.deviceId);
          sessionStorage.setItem("audio-debug:is-capturing", "true");
          const track = new FakeTrack(selectedDevice.deviceId, selectedDevice.label);
          return {
            getAudioTracks: () => [track],
            getTracks: () => [track],
          } as unknown as MediaStream;
        },
        removeEventListener: () => undefined,
      },
    });

    const ports: FakeMessagePort[] = [];

    class FakeMessagePort extends EventTarget {
      private timer: number | null = null;
      private sequence = 0;

      constructor() {
        super();
        ports.push(this);
      }

      start(): void {
        if (this.timer !== null) return;
        this.timer = window.setInterval(() => {
          this.sequence += 1;
          const level = -50;
          this.dispatchEvent(
            new MessageEvent("message", {
              data: {
                frameSequence: this.sequence,
                startSample: (this.sequence - 1) * 100,
                rmsDbfs: level + 1,
                aWeightedDbfs: level,
                sampleP01Dbfs: level - 20,
                zeroRatio: 0.002,
                clippedRatio: 0,
              },
            })
          );
          if (this.sequence >= 180) this.stop();
        }, 25);
      }

      stop(): void {
        if (this.timer !== null) window.clearInterval(this.timer);
        this.timer = null;
      }

      postMessage(): void {}
    }

    class FakeAudioWorkletNode {
      readonly port = new FakeMessagePort();
      connect(): void {}
    }

    class FakeAudioContext extends EventTarget {
      readonly sampleRate = 1_000;
      readonly destination = {};
      readonly audioWorklet = { addModule: async () => undefined };
      state: AudioContextState = "running";

      createMediaStreamSource(): { connect: () => void } {
        return { connect: () => undefined };
      }

      createGain(): { gain: { value: number }; connect: () => void } {
        return { gain: { value: 1 }, connect: () => undefined };
      }

      async resume(): Promise<void> {
        this.state = "running";
      }

      async close(): Promise<void> {
        this.state = "closed";
        ports.forEach((port) => port.stop());
      }
    }

    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: FakeAudioContext as unknown as typeof AudioContext,
    });
    Object.defineProperty(window, "AudioWorkletNode", {
      configurable: true,
      value: FakeAudioWorkletNode as unknown as typeof AudioWorkletNode,
    });
  });
}

async function historyCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    // eslint-disable-next-line import/no-unresolved -- This module is loaded by the Vite page runtime.
    const service = await import("/src/utils/noiseSliceService.ts");
    return (await service.readNoiseSlices()).length;
  });
}

test("音频调试页按需采集、显示特征且临时会话不写历史", async ({ context }) => {
  test.setTimeout(30_000);
  await installDeterministicAudioDiagnostics(context);
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/debug/audio");
  await expect(page.locator("[data-audio-debug-page]")).toBeVisible();
  await expect(page.getByRole("heading", { name: "音频采集诊断" })).toBeVisible();
  const flowOverview = page.getByRole("list", { name: "音频数据处理流程" });
  await expect(flowOverview.getByRole("listitem")).toHaveCount(6);
  await expect(flowOverview.locator("strong")).toHaveText([
    "输入设备",
    "采集会话",
    "特征提取",
    "信号诊断",
    "评分与校准",
    "分发与持久化",
  ]);
  await expect(page.locator("[data-flow-section] h2")).toHaveText([
    "输入设备",
    "采集会话",
    "特征提取",
    "信号诊断",
    "评分与校准",
    "分发与持久化",
  ]);
  await expect(page.getByText("跨标签快照", { exact: true })).toBeVisible();
  await expect(page.getByText("IndexedDB", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "运行轨迹" })).toBeVisible();
  expect(await page.locator('a[href="/debug/audio"]').count()).toBe(0);
  expect(
    await page.evaluate(() => localStorage.getItem("audio-debug:get-user-media-count"))
  ).toBeNull();
  const microphoneDropdown = page.getByRole("button", { name: "麦克风设备", exact: true });
  await expect(microphoneDropdown).toHaveText("系统默认");

  await page.getByRole("button", { name: "开始临时采集" }).click();
  await expect(page.getByText("Leader").first()).toBeVisible();
  await expect(page.getByText("设备键", { exact: true }).locator("..").locator("dd")).toHaveText(
    /^[a-f0-9]{64}$/
  );
  await expect(page.getByText(/-\d+\.\d dBFS/).first()).toBeVisible();
  await expect(page.getByText("1% 谷值", { exact: true })).toHaveCount(2);
  await expect(page.getByText("关闭", { exact: true })).toHaveCount(3);
  await expect
    .poll(() =>
      page.evaluate(() => Number(localStorage.getItem("audio-debug:get-user-media-count")))
    )
    .toBe(1);

  const referenceInput = page.getByRole("spinbutton", { name: "参考声级" });
  await referenceInput.fill("60");
  await page.getByRole("button", { name: "开始校准", exact: true }).click();
  const calibrationDialog = page.getByRole("dialog", { name: "开始外部参考校准" });
  await calibrationDialog.getByRole("button", { name: "开始校准" }).click();
  await expect(page.getByText("校准完成", { exact: true })).toBeVisible({ timeout: 6_000 });
  await expect(page.getByText("已校准", { exact: true })).toBeVisible();

  await expect
    .poll(() =>
      page.locator("[data-audio-debug-page]").evaluate((element) => {
        const match = element.textContent?.match(/帧 (\d+)/);
        return match ? Number(match[1]) : 0;
      })
    )
    .toBeGreaterThan(120);

  await microphoneDropdown.click();
  await page.getByRole("option", { name: "USB debug microphone" }).click();
  await expect(microphoneDropdown).toHaveText("USB debug microphone");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("audio-debug:last-device-id")))
    .toBe("usb-debug-device");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const settings = JSON.parse(localStorage.getItem("AppSettings") ?? "{}");
        return settings.noiseControl?.preferredInputDevice?.deviceId ?? null;
      })
    )
    .toBe("usb-debug-device");

  const curveControls = page.getByRole("group", { name: "曲线显示" });
  await expect(curveControls.getByRole("switch")).toHaveCount(3);
  const chart = page.getByRole("img", { name: "最近三十秒音频数字电平" });
  for (const id of ["a-weighted-dbfs", "raw-rms-dbfs", "sample-p01-dbfs"]) {
    await expect(chart.locator(`[data-chart-series="${id}"]`)).toHaveCount(1);
  }

  const valleySwitch = curveControls.getByRole("switch", { name: "1% 谷值曲线", exact: true });
  await expect(valleySwitch).toHaveAttribute("aria-checked", "true");
  await valleySwitch.click();
  await expect(valleySwitch).toHaveAttribute("aria-checked", "false");
  await expect(chart.locator('[data-chart-series="sample-p01-dbfs"]')).toHaveCount(0);
  await expect(chart.locator('[data-chart-series="raw-rms-dbfs"]')).toHaveCount(1);
  await valleySwitch.click();
  await expect(chart.locator('[data-chart-series="sample-p01-dbfs"]')).toHaveCount(1);

  await expect.poll(() => historyCount(page), { timeout: 5_000 }).toBe(0);

  const crossTabPayload = await page.evaluate(() =>
    localStorage.getItem("immersive-clock:noise-monitoring-message:v2")
  );
  expect(crossTabPayload).not.toContain("Float32Array");
  expect(crossTabPayload).not.toContain('"pcm"');

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.locator("[data-audio-debug-page]")).toBeVisible();
    await expect(microphoneDropdown).toBeVisible();
    await expect(page.locator("[data-flow-trace] ol")).toBeVisible();
    const geometry = await page.evaluate(() => {
      const track = document.querySelector<HTMLElement>("[data-flow-overview] ol");
      const visibleButtons = Array.from(
        document.querySelectorAll<HTMLElement>("[data-audio-debug-page] button")
      ).filter((button) => button.getClientRects().length > 0);
      const eventLog = document.querySelector<HTMLElement>("[data-flow-trace] ol");
      const flowOverview = document.querySelector<HTMLElement>("[data-flow-overview]");
      const chart = document.querySelector<HTMLElement>(
        '[role="img"][aria-label="最近三十秒音频数字电平"]'
      );
      const inputDetails = document.querySelector<HTMLElement>('[data-flow-section="input"] dl');
      const compactDetailRow = document.querySelector<HTMLElement>(
        '[data-flow-section="input"] dl > div:nth-child(3)'
      );
      const withinViewport = (element: HTMLElement | null) => {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        return rect.left >= -1 && rect.right <= window.innerWidth + 1;
      };
      return {
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        trackColumns: track ? getComputedStyle(track).gridTemplateColumns.split(" ").length : 0,
        buttonsWithinViewport: visibleButtons.every(withinViewport),
        eventLogWithinViewport: withinViewport(eventLog),
        chartHeight: chart?.getBoundingClientRect().height ?? 0,
        flowOverviewHeight: flowOverview?.getBoundingClientRect().height ?? 0,
        inputDetailColumns: inputDetails
          ? getComputedStyle(inputDetails).gridTemplateColumns.split(" ").length
          : 0,
        compactDetailRowHeight: compactDetailRow?.getBoundingClientRect().height ?? 0,
      };
    });
    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.trackColumns).toBe(viewport.width > 900 ? 6 : 1);
    expect(geometry.buttonsWithinViewport).toBe(true);
    expect(geometry.eventLogWithinViewport).toBe(true);
    expect(geometry.chartHeight).toBeGreaterThanOrEqual(184);
    if (viewport.width > 900) {
      expect(geometry.flowOverviewHeight).toBeLessThanOrEqual(170);
      expect(geometry.inputDetailColumns).toBe(2);
      expect(geometry.compactDetailRowHeight).toBeLessThanOrEqual(38);
    } else {
      expect(geometry.inputDetailColumns).toBe(1);
    }
  }

  await page.getByRole("button", { name: "停止临时采集" }).click();
  await expect(page.getByRole("button", { name: "开始临时采集" })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem("audio-debug:is-capturing")))
    .toBe("false");
  expect(consoleErrors).toEqual([]);
});
