export interface PowerSaveBlockerApi {
  isStarted(id: number): boolean;
  start(type: "prevent-display-sleep"): number;
  stop(id: number): boolean;
}

export interface KeepAwakeController {
  release: () => void;
  setEnabled: (enabled: boolean) => boolean;
}

/** Keeps one display-sleep blocker active and makes repeated requests idempotent. */
export function createKeepAwakeController(api: PowerSaveBlockerApi): KeepAwakeController {
  let blockerId: number | null = null;

  const release = () => {
    if (blockerId === null) return;

    const currentId = blockerId;
    blockerId = null;
    try {
      if (api.isStarted(currentId)) api.stop(currentId);
    } catch {
      // The blocker may already have been released while Electron is shutting down.
    }
  };

  const setEnabled = (enabled: boolean): boolean => {
    if (!enabled) {
      release();
      return false;
    }

    if (blockerId !== null) {
      try {
        if (api.isStarted(blockerId)) return true;
      } catch {
        // Recreate a stale blocker below.
      }
      release();
    }

    try {
      blockerId = api.start("prevent-display-sleep");
      return true;
    } catch {
      blockerId = null;
      return false;
    }
  };

  return { release, setEnabled };
}
