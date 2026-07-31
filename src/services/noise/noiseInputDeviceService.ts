export interface NoiseInputDevice {
  deviceId: string;
  label: string;
}

const PSEUDO_DEVICE_IDS = new Set(["default", "communications"]);

function getMediaDevices(): MediaDevices {
  if (typeof navigator === "undefined" || !navigator.mediaDevices) {
    throw new Error("当前环境不支持麦克风设备");
  }
  return navigator.mediaDevices;
}

function createAudioConstraints(deviceId?: string): MediaTrackConstraints {
  return {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  };
}

function isUnavailableDeviceError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("name" in error)) return false;
  const name = String((error as { name?: unknown }).name);
  return name === "NotFoundError" || name === "OverconstrainedError";
}

export async function listNoiseInputDevices(): Promise<NoiseInputDevice[]> {
  const mediaDevices = getMediaDevices();
  if (typeof mediaDevices.enumerateDevices !== "function") {
    throw new Error("当前环境不支持列出麦克风设备");
  }
  const devices = await mediaDevices.enumerateDevices();
  const seen = new Set<string>();
  const inputs = devices.filter((device) => {
    if (
      device.kind !== "audioinput" ||
      !device.deviceId ||
      PSEUDO_DEVICE_IDS.has(device.deviceId) ||
      seen.has(device.deviceId)
    ) {
      return false;
    }
    seen.add(device.deviceId);
    return true;
  });

  return inputs.map((device, index) => ({
    deviceId: device.deviceId,
    label: device.label.trim() || `麦克风 ${index + 1}`,
  }));
}

export async function requestNoiseInputDeviceAccess(): Promise<NoiseInputDevice[]> {
  const mediaDevices = getMediaDevices();
  if (typeof mediaDevices.getUserMedia !== "function") {
    throw new Error("当前环境不支持申请麦克风权限");
  }
  const stream = await mediaDevices.getUserMedia({
    audio: createAudioConstraints(),
    video: false,
  });
  try {
    stream.getTracks().forEach((track) => track.stop());
  } catch {
    // Temporary permission tracks are released on a best-effort basis.
  }
  return listNoiseInputDevices();
}

export async function openNoiseInputStream(preferredDeviceId?: string): Promise<MediaStream> {
  const mediaDevices = getMediaDevices();
  if (typeof mediaDevices.getUserMedia !== "function") {
    throw new Error("当前环境不支持麦克风采集");
  }
  if (!preferredDeviceId) {
    return mediaDevices.getUserMedia({ audio: createAudioConstraints(), video: false });
  }

  try {
    return await mediaDevices.getUserMedia({
      audio: createAudioConstraints(preferredDeviceId),
      video: false,
    });
  } catch (error) {
    if (!isUnavailableDeviceError(error)) throw error;
    return mediaDevices.getUserMedia({ audio: createAudioConstraints(), video: false });
  }
}

export function subscribeNoiseInputDeviceChanges(listener: () => void): () => void {
  const mediaDevices = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
  if (!mediaDevices?.addEventListener) return () => undefined;
  mediaDevices.addEventListener("devicechange", listener);
  return () => mediaDevices.removeEventListener("devicechange", listener);
}
