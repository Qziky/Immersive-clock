import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createPwaUpdateControl } from "../pwaUpdateController";

class Worker extends EventTarget {
  constructor(public state: ServiceWorkerState) {
    super();
  }
  postMessage = vi.fn();
  advance(state: ServiceWorkerState) {
    this.state = state;
    this.dispatchEvent(new Event("statechange"));
  }
}

class Registration extends EventTarget {
  active: Worker | null = null;
  waiting: Worker | null = null;
  installing: Worker | null = null;
  update = vi.fn(async () => undefined);
  install(worker: Worker) {
    this.installing = worker;
    this.dispatchEvent(new Event("updatefound"));
  }
  finishInstalling() {
    const worker = this.installing!;
    this.installing = null;
    this.waiting = worker;
    worker.advance("installed");
  }
}

class Container extends EventTarget {
  readonly registration = new Registration();
  controller: Worker | null = null;
  register = vi.fn(async () => this.registration);
  takeControl(worker: Worker) {
    this.registration.active = worker;
    this.registration.waiting = null;
    this.controller = worker;
    this.dispatchEvent(new Event("controllerchange"));
    worker.advance("activated");
  }
}

function harness(hasPreviousWorker = true) {
  const workers = new Container();
  const registration = workers.registration;
  if (hasPreviousWorker) workers.takeControl(new Worker("activated"));
  const control = createPwaUpdateControl(workers as unknown as ServiceWorkerContainer, "/sw.js");
  return { workers, registration, control };
}

describe("PWA native worker lifecycle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("首次安装与首次接管不是新版本", async () => {
    const { workers, registration, control } = harness(false);
    await control.check();
    const first = new Worker("installing");
    registration.install(first);
    expect(control.getSnapshot().status).toBe("idle");
    registration.finishInstalling();
    workers.takeControl(first);
    expect(control.getSnapshot().status).toBe("idle");
  });

  it("浏览器检查先返回，仍能跟踪随后开始和等待的新版", async () => {
    const { workers, registration, control } = harness();
    await control.check();
    expect(workers.register).toHaveBeenCalledWith("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
    expect(control.getSnapshot().status).toBe("idle");

    const next = new Worker("installing");
    registration.install(next);
    expect(control.getSnapshot().status).toBe("preparing");
    registration.finishInstalling();
    expect(control.getSnapshot().status).toBe("waiting");
    expect(next.postMessage).not.toHaveBeenCalled();
  });

  it("发出消息不算成功，收到同一个候选 Worker 的接管后才成功", async () => {
    const { workers, registration, control } = harness();
    await control.check();
    const next = new Worker("installing");
    registration.install(next);
    registration.finishInstalling();

    const completed = vi.fn();
    const activation = control.activate().then(completed);
    expect(next.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    await Promise.resolve();
    expect(completed).not.toHaveBeenCalled();

    workers.takeControl(next);
    await activation;
    expect(completed).toHaveBeenCalledTimes(1);
    expect(control.getSnapshot().status).toBe("controlled");
  });

  it("接管超时后等待态仍能重试，不会因第一次无响应而锁住", async () => {
    const { workers, registration, control } = harness();
    await control.check();
    const next = new Worker("installing");
    registration.install(next);
    registration.finishInstalling();

    const timeout = expect(control.activate()).rejects.toThrow("尚未确认新版接管");
    await vi.advanceTimersByTimeAsync(12_000);
    await timeout;
    expect(control.getSnapshot().status).toBe("waiting");

    const retry = control.activate();
    expect(next.postMessage).toHaveBeenCalledTimes(2);
    workers.takeControl(next);
    await expect(retry).resolves.toBeUndefined();
  });

  it("安装失败后可重试，超时也不会丢失随后就绪的候选", async () => {
    const { registration, control } = harness();
    await control.check();
    const failed = new Worker("installing");
    registration.install(failed);
    registration.installing = null;
    failed.advance("redundant");
    expect(control.getSnapshot().status).toBe("error");
    await control.check();

    registration.install(new Worker("installing"));
    await vi.advanceTimersByTimeAsync(45_000);
    expect(control.getSnapshot().status).toBe("error");
    await control.check();
    expect(control.getSnapshot().status).toBe("preparing");
    await vi.advanceTimersByTimeAsync(45_000);
    expect(control.getSnapshot().status).toBe("error");
    registration.finishInstalling();
    expect(control.getSnapshot().status).toBe("waiting");
  });

  it("注册失败不丢掉控制器，下次可重新注册", async () => {
    const { workers, control } = harness();
    workers.register.mockRejectedValueOnce(new Error());
    await control.check();
    expect(control.getSnapshot().status).toBe("error");
    await control.check();
    expect(workers.register).toHaveBeenCalledTimes(2);
    expect(control.getSnapshot().status).toBe("idle");
  });

  it("另一个窗口接管后只报告可刷新，后续等待版本优先", async () => {
    const { workers, registration, control } = harness();
    await control.check();
    const next = new Worker("activated");
    workers.takeControl(next); // another tab activated N+1
    expect(control.getSnapshot().status).toBe("controlled");
    expect(next.postMessage).not.toHaveBeenCalled();

    const newer = new Worker("installing");
    registration.install(newer);
    registration.finishInstalling();
    expect(control.getSnapshot().status).toBe("waiting");
    const activation = control.activate();
    expect(newer.postMessage).toHaveBeenCalledTimes(1);
    workers.takeControl(newer);
    await activation;
  });
});
