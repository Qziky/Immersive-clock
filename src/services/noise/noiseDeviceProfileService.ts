import type { NoiseCalibrationProfile, NoiseTrackMetadata } from "../../types/noise";

const STORAGE_KEY = "immersive-clock:noise-calibrations:v2";
const LEGACY_STORAGE_KEY = "immersive-clock:noise-device-profiles:v1";
export const NOISE_DEVICE_PROFILE_STORAGE_KEY = STORAGE_KEY;
export const LEGACY_NOISE_DEVICE_PROFILE_STORAGE_KEY = LEGACY_STORAGE_KEY;

interface NoiseCalibrationRecord {
  schemaVersion: 2;
  deviceKey: string;
  sampleRate: number;
  processingSignature: string;
  calibration: NoiseCalibrationProfile;
}

interface LegacyNoiseDeviceProfile {
  deviceKey?: string;
  sampleRate?: number;
  processingSignature?: string;
  calibration?: NoiseCalibrationProfile | null;
}

function readRecords(): Record<string, NoiseCalibrationRecord> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, NoiseCalibrationRecord>;
  } catch {
    return {};
  }
}

function migrateLegacyRecords(): Record<string, NoiseCalibrationRecord> {
  const records = readRecords();
  try {
    const legacy: unknown = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) ?? "{}");
    if (legacy && typeof legacy === "object" && !Array.isArray(legacy)) {
      for (const value of Object.values(legacy as Record<string, LegacyNoiseDeviceProfile>)) {
        if (
          value.calibration &&
          typeof value.deviceKey === "string" &&
          typeof value.sampleRate === "number" &&
          typeof value.processingSignature === "string"
        ) {
          records[value.deviceKey] = {
            schemaVersion: 2,
            deviceKey: value.deviceKey,
            sampleRate: value.sampleRate,
            processingSignature: value.processingSignature,
            calibration: value.calibration,
          };
        }
      }
    }
  } catch {
    // Invalid legacy data is ignored; it never affects scoring.
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  return records;
}

function records(): Record<string, NoiseCalibrationRecord> {
  return localStorage.getItem(LEGACY_STORAGE_KEY) === null ? readRecords() : migrateLegacyRecords();
}

function compatible(record: NoiseCalibrationRecord, metadata: NoiseTrackMetadata): boolean {
  return (
    record.schemaVersion === 2 &&
    record.sampleRate === metadata.sampleRate &&
    record.processingSignature === metadata.processingSignature
  );
}

export function getNoiseCalibration(metadata: NoiseTrackMetadata): NoiseCalibrationProfile | null {
  if (!metadata.persistentDeviceKey) return null;
  const record = records()[metadata.deviceKey];
  return record && compatible(record, metadata) ? record.calibration : null;
}

export function saveNoiseCalibration(
  metadata: NoiseTrackMetadata,
  calibration: NoiseCalibrationProfile
): NoiseCalibrationProfile | null {
  if (!metadata.persistentDeviceKey) return null;
  const next = records();
  next[metadata.deviceKey] = {
    schemaVersion: 2,
    deviceKey: metadata.deviceKey,
    sampleRate: metadata.sampleRate,
    processingSignature: metadata.processingSignature,
    calibration,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return calibration;
}

export function clearNoiseCalibration(metadata: NoiseTrackMetadata): void {
  const next = records();
  delete next[metadata.deviceKey];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function clearNoiseDeviceProfiles(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
}

export async function createNoiseDeviceIdentity(
  settings: MediaTrackSettings,
  label: string
): Promise<{ deviceKey: string; persistent: boolean }> {
  const source = settings.deviceId || settings.groupId || label;
  if (!source) {
    return {
      deviceKey: `ephemeral:${crypto.randomUUID?.() ?? `${Date.now()}:${Math.random()}`}`,
      persistent: false,
    };
  }
  if (!crypto.subtle) return { deviceKey: source, persistent: true };
  const bytes = new TextEncoder().encode(source);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const deviceKey = Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0")
  ).join("");
  return { deviceKey, persistent: true };
}
