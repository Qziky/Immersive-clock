import { beforeEach, describe, expect, it } from "vitest";

import type { NoiseCalibrationProfile, NoiseTrackMetadata } from "../../../types/noise";
import {
  clearNoiseCalibration,
  clearNoiseDeviceProfiles,
  getNoiseCalibration,
  LEGACY_NOISE_DEVICE_PROFILE_STORAGE_KEY,
  NOISE_DEVICE_PROFILE_STORAGE_KEY,
  saveNoiseCalibration,
} from "../noiseDeviceProfileService";

function metadata(overrides: Partial<NoiseTrackMetadata> = {}): NoiseTrackMetadata {
  return {
    deviceKey: "device-a",
    persistentDeviceKey: true,
    sampleRate: 48_000,
    channelCount: 1,
    processingSignature: "processing-off",
    processingRequestedOff: true,
    processingDisabled: true,
    ...overrides,
    frameSamples: overrides.frameSamples ?? 4_800,
  };
}

function calibration(overrides: Partial<NoiseCalibrationProfile> = {}): NoiseCalibrationProfile {
  return {
    id: "calibration-a",
    referenceDbA: 60,
    measuredDbfsA: -40,
    offsetDb: 100,
    sampleRate: 48_000,
    processingSignature: "processing-off",
    createdAt: 1_000,
    ...overrides,
  };
}

describe("noiseDeviceProfileService", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("独立保存 dB(A) 校准且不写入相对基线字段", () => {
    saveNoiseCalibration(metadata(), calibration());

    expect(getNoiseCalibration(metadata())).toEqual(calibration());
    const serialized = localStorage.getItem(NOISE_DEVICE_PROFILE_STORAGE_KEY) ?? "";
    expect(serialized).toContain('"schemaVersion":2');
    expect(serialized).not.toContain("relativeBaseline");
    expect(serialized).not.toContain("baselineUpdatedAt");
  });

  it("校准只绑定持久设备、采样率和处理配置", () => {
    saveNoiseCalibration(metadata(), calibration());

    expect(getNoiseCalibration(metadata({ deviceKey: "device-b" }))).toBeNull();
    expect(getNoiseCalibration(metadata({ sampleRate: 44_100 }))).toBeNull();
    expect(getNoiseCalibration(metadata({ processingSignature: "processing-on" }))).toBeNull();
    expect(getNoiseCalibration(metadata({ persistentDeviceKey: false }))).toBeNull();
    expect(
      saveNoiseCalibration(metadata({ persistentDeviceKey: false }), calibration())
    ).toBeNull();
  });

  it("从旧画像只迁移有效校准并删除旧基线存储", () => {
    localStorage.setItem(
      LEGACY_NOISE_DEVICE_PROFILE_STORAGE_KEY,
      JSON.stringify({
        "device-a": {
          schemaVersion: 1,
          deviceKey: "device-a",
          relativeBaselineDbfsA: -55,
          baselineUpdatedAt: 500,
          sampleRate: 48_000,
          processingSignature: "processing-off",
          calibration: calibration(),
        },
      })
    );

    expect(getNoiseCalibration(metadata())).toEqual(calibration());
    expect(localStorage.getItem(LEGACY_NOISE_DEVICE_PROFILE_STORAGE_KEY)).toBeNull();
    const serialized = localStorage.getItem(NOISE_DEVICE_PROFILE_STORAGE_KEY) ?? "";
    expect(serialized).not.toContain("relativeBaseline");
    expect(serialized).not.toContain("baselineUpdatedAt");
  });

  it("支持按设备清除校准和清空全部校准存储", () => {
    saveNoiseCalibration(metadata(), calibration());
    saveNoiseCalibration(metadata({ deviceKey: "device-b" }), calibration({ id: "calibration-b" }));

    clearNoiseCalibration(metadata());
    expect(getNoiseCalibration(metadata())).toBeNull();
    expect(getNoiseCalibration(metadata({ deviceKey: "device-b" }))?.id).toBe("calibration-b");

    clearNoiseDeviceProfiles();
    expect(localStorage.getItem(NOISE_DEVICE_PROFILE_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_NOISE_DEVICE_PROFILE_STORAGE_KEY)).toBeNull();
  });
});
