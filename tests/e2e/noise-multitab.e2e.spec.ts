import { expect, test, type BrowserContext, type Page } from "@playwright/test";

async function installDeterministicNoiseCapture(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const settings = {
      version: 9,
      general: { startup: { initialMode: "study" } },
      study: { display: { showNoiseMonitor: true } },
      noiseControl: {
        monitoringEnabled: true,
        historyEnabled: true,
        primaryMetric: "quietness-score",
        showRealtimeValue: true,
        scoreAlertThreshold: 70,
        reportAutoPopup: false,
        alertSoundEnabled: false,
      },
    };
    localStorage.setItem("AppSettings", JSON.stringify(settings));
    localStorage.setItem("immersive-clock:has-seen-tour", "true");

    class FakeTrack extends EventTarget {
      readonly label = "Deterministic microphone";

      getSettings(): MediaTrackSettings {
        return {
          autoGainControl: false,
          channelCount: 1,
          deviceId: "noise-e2e-device",
          echoCancellation: false,
          noiseSuppression: false,
          sampleRate: 1_000,
        };
      }

      stop(): void {}
    }

    const track = new FakeTrack();
    const getUserMedia = async () => {
      const calls = Number(localStorage.getItem("noise-e2e:get-user-media-count") ?? "0") + 1;
      localStorage.setItem("noise-e2e:get-user-media-count", String(calls));
      sessionStorage.setItem("noise-e2e:is-capturing", "true");
      return {
        getAudioTracks: () => [track],
        getTracks: () => [track],
      } as unknown as MediaStream;
    };
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });

    class FakeMessagePort extends EventTarget {
      private active = false;
      private sequence = 0;

      start(): void {
        if (this.active) return;
        this.active = true;
        const emitBatch = (): void => {
          if (!this.active) return;
          for (let index = 0; index < 10 && this.sequence < 650; index += 1) {
            this.sequence += 1;
            this.dispatchEvent(
              new MessageEvent("message", {
                data: {
                  frameSequence: this.sequence,
                  startSample: (this.sequence - 1) * 100,
                  rmsDbfs: -50,
                  aWeightedDbfs: -50,
                  sampleP01Dbfs: -70,
                  zeroRatio: 0,
                  clippedRatio: 0,
                },
              })
            );
          }
          if (this.sequence < 650) queueMicrotask(emitBatch);
          else this.active = false;
        };
        queueMicrotask(emitBatch);
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

async function snapshot(page: Page) {
  return page.evaluate(() => {
    const monitor = document.querySelector<HTMLElement>('[data-tour="noise-monitor"]');
    return {
      capturing: sessionStorage.getItem("noise-e2e:is-capturing") === "true",
      monitorText: monitor?.innerText.replace(/\s+/g, " ").trim() ?? "",
    };
  });
}

async function historyCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    // eslint-disable-next-line import/no-unresolved -- This module is loaded by the Vite page runtime.
    const service = await import("/src/utils/noiseSliceService.ts");
    return (await service.readNoiseSlices()).length;
  });
}

async function captureSessions(page: Page) {
  return page.evaluate(async () => {
    // eslint-disable-next-line import/no-unresolved -- This module is loaded by the Vite page runtime.
    const repository = await import("/src/services/noise/noiseFeatureRepository.ts");
    return repository.listNoiseCaptureSessions();
  });
}

test("双标签只采集和写入一次，关闭 Leader 后 5 秒内接管", async ({ context }) => {
  test.setTimeout(30_000);
  await installDeterministicNoiseCapture(context);
  const first = await context.newPage();
  const second = await context.newPage();
  await Promise.all([first.goto("/study"), second.goto("/study")]);
  await Promise.all([
    expect(first.locator("#study-panel")).toBeVisible(),
    expect(second.locator("#study-panel")).toBeVisible(),
  ]);

  await expect
    .poll(async () =>
      [(await snapshot(first)).capturing, (await snapshot(second)).capturing].sort()
    )
    .toEqual([false, true]);
  await expect
    .poll(() =>
      first.evaluate(() => Number(localStorage.getItem("noise-e2e:get-user-media-count")))
    )
    .toBe(1);

  await expect
    .poll(async () => {
      const firstSnapshot = await snapshot(first);
      const secondSnapshot = await snapshot(second);
      return {
        hasScore: /\d+ 分/.test(firstSnapshot.monitorText),
        sameSummary:
          firstSnapshot.monitorText.length > 0 &&
          firstSnapshot.monitorText === secondSnapshot.monitorText,
      };
    })
    .toEqual({ hasScore: true, sameSummary: true });
  await expect.poll(() => historyCount(first), { timeout: 8_000 }).toBe(2);
  expect(await historyCount(second)).toBe(2);
  await expect.poll(async () => (await captureSessions(first)).length).toBe(1);

  const crossTabPayload = await first.evaluate(() =>
    localStorage.getItem("immersive-clock:noise-monitoring-message:v2")
  );
  expect(crossTabPayload).not.toContain("Float32Array");
  expect(crossTabPayload).not.toContain('"pcm"');

  const firstSnapshot = await snapshot(first);
  const leader = firstSnapshot.capturing ? first : second;
  const follower = leader === first ? second : first;
  await leader.close();

  await expect
    .poll(async () => (await snapshot(follower)).capturing, { timeout: 5_000 })
    .toBe(true);
  await expect
    .poll(() =>
      follower.evaluate(() => Number(localStorage.getItem("noise-e2e:get-user-media-count")))
    )
    .toBe(2);
  await expect
    .poll(async () => {
      const sessions = await captureSessions(follower);
      return {
        distinctIds: new Set(sessions.map((session) => session.captureSessionId)).size,
        endedSessions: sessions.filter((session) => session.endedAt !== null).length,
        total: sessions.length,
      };
    })
    .toEqual({ distinctIds: 2, endedSessions: 1, total: 2 });
});
