import { logger } from "../../utils/logger";

import { recoverAbandonedNoiseCaptureSessions } from "./noiseFeatureRepository";
import { scheduleNoiseRescore } from "./noiseRescoreService";

const LEGACY_NOISE_STORAGE_KEYS = [
  "noise-slices",
  "noise-slices-v2",
  "noise-score-slices-v3",
  "immersive-clock:noise-history-message:v3",
] as const;

let initializationStarted = false;

async function runNoiseDataMaintenance(): Promise<void> {
  await recoverAbandonedNoiseCaptureSessions();
  await scheduleNoiseRescore();
}

export function initializeNoiseDataMaintenance(): void {
  if (initializationStarted) return;
  initializationStarted = true;

  try {
    LEGACY_NOISE_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
  } catch (error) {
    logger.warn("Failed to remove legacy noise storage keys:", error);
  }

  void runNoiseDataMaintenance().catch((error) => {
    logger.warn("Noise data maintenance failed:", error);
  });
}
