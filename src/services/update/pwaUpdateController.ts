export type PwaWorkerStatus = "idle" | "preparing" | "waiting" | "controlled" | "error";

export interface PwaWorkerSnapshot {
  status: PwaWorkerStatus;
  error?: string;
}

export interface PwaUpdateControl {
  getSnapshot: () => PwaWorkerSnapshot;
  subscribe: (listener: () => void) => () => void;
  check: () => Promise<void>;
  activate: () => Promise<void>;
}

const INSTALL_TIMEOUT_MS = 45_000;
const ACTIVATE_TIMEOUT_MS = 12_000;
const PREPARE_ERROR = "新版资源未准备完成。请确认网络正常后重试。";

/**
 * Observe the real browser registration, without any navigation side effects.
 * A controller change can originate in a different tab. Each page decides
 * independently whether and when to reload.
 */
export function createPwaUpdateControl(
  container: ServiceWorkerContainer,
  scriptUrl: string
): PwaUpdateControl {
  let registration: ServiceWorkerRegistration | undefined;
  let registering: Promise<ServiceWorkerRegistration> | undefined;
  let checking: Promise<void> | undefined;
  let activating: Promise<void> | undefined;
  let installing: ServiceWorker | null = null;
  let installTimeout: ReturnType<typeof setTimeout> | undefined;
  let lastController = container.controller;
  let hasObservedUpdate = false;
  let replacementController: ServiceWorker | null = null;
  let error: string | undefined;
  let snapshot: PwaWorkerSnapshot = { status: "idle" };
  const listeners = new Set<() => void>();

  function publish() {
    // The first install on a fresh page isn't an update.
    const hasPreviousWorker = Boolean(registration?.active || lastController);
    const waiting = Boolean(registration?.waiting && hasPreviousWorker);
    const preparing = Boolean(installing && hasPreviousWorker);
    if (waiting || preparing) hasObservedUpdate = true;
    const status: PwaWorkerStatus = waiting
      ? "waiting"
      : replacementController && container.controller === replacementController
        ? "controlled"
        : error
          ? "error"
          : preparing
            ? "preparing"
            : "idle";
    const reportedError = status === "error" ? error : undefined;
    if (snapshot.status === status && snapshot.error === reportedError) return;
    snapshot = { status, error: reportedError };
    listeners.forEach((listener) => listener());
  }

  function releaseInstaller() {
    installing?.removeEventListener("statechange", onInstallState);
    clearTimeout(installTimeout);
    installing = null;
  }

  function onInstallState() {
    const state = installing?.state;
    if (state === "redundant") {
      error = PREPARE_ERROR;
      releaseInstaller();
    } else if (state === "installed" || state === "activating" || state === "activated") {
      releaseInstaller();
    }
    publish();
  }

  function watchInstallTimeout() {
    clearTimeout(installTimeout);
    installTimeout = setTimeout(() => {
      // Keep the listener: a slow installation can still finish after timeout.
      error = PREPARE_ERROR;
      publish();
    }, INSTALL_TIMEOUT_MS);
  }

  function observeInstaller() {
    const next = registration?.installing ?? null;
    if (next && next !== installing) {
      releaseInstaller();
      error = undefined;
      installing = next;
      next.addEventListener("statechange", onInstallState);
      watchInstallTimeout();
      onInstallState();
      return;
    }
    publish();
  }

  container.addEventListener("controllerchange", () => {
    const next = container.controller;
    if (next && next !== lastController && (lastController || hasObservedUpdate)) {
      replacementController = next;
      error = undefined;
    }
    lastController = next;
    publish();
  });

  function getRegistration(): Promise<ServiceWorkerRegistration> {
    if (registration) return Promise.resolve(registration);
    registering ??= Promise.resolve()
      .then(() => container.register(scriptUrl, { scope: "/", updateViaCache: "none" }))
      .then((registered) => {
        registration = registered;
        registered.addEventListener("updatefound", observeInstaller);
        observeInstaller();
        return registered;
      })
      .finally(() => {
        registering = undefined;
      });
    return registering;
  }

  function check(): Promise<void> {
    if (checking) return checking;
    error = undefined;
    if (installing) watchInstallTimeout();
    publish();
    checking = getRegistration()
      .then(async (registered) => {
        // update() can resolve before installation does; updatefound/statechange
        // above keep the UI in sync, including with late waiting workers.
        if (!registered.waiting && !registered.installing) {
          await registered.update();
        }
        observeInstaller();
      })
      .catch(() => {
        error = registration ? PREPARE_ERROR : "网页更新服务无法启动。请联网后重试。";
        publish();
      })
      .finally(() => {
        checking = undefined;
      });
    return checking;
  }

  function activate(): Promise<void> {
    if (activating) return activating;
    publish();
    if (snapshot.status === "controlled") return Promise.resolve();

    const waiting = registration?.waiting;
    if (!waiting) return Promise.reject(new Error("新版资源尚未准备好，请重新检查。"));
    const candidate: ServiceWorker = waiting;

    activating = new Promise<void>((resolve, reject) => {
      const finish = (failure?: Error) => {
        clearTimeout(timeout);
        container.removeEventListener("controllerchange", verify);
        candidate.removeEventListener("statechange", verify);
        if (failure) reject(failure);
        else resolve();
      };
      function verify() {
        if (container.controller === candidate) {
          finish();
        } else if (candidate.state === "redundant") {
          finish(new Error("新版资源未能接管此窗口，请重试。"));
        }
      }
      const timeout = setTimeout(
        () => finish(new Error("尚未确认新版接管此窗口，请重试。")),
        ACTIVATE_TIMEOUT_MS
      );
      container.addEventListener("controllerchange", verify);
      candidate.addEventListener("statechange", verify);
      if (container.controller === candidate) {
        verify();
      } else {
        try {
          candidate.postMessage({ type: "SKIP_WAITING" });
        } catch {
          finish(new Error("无法启动新版，请重试。"));
        }
      }
    }).finally(() => {
      // Sending the message isn't success. Timeout/no-op can always be retried.
      activating = undefined;
      publish();
    });
    return activating;
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    check,
    activate,
  };
}
