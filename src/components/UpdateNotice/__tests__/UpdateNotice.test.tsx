import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UpdateSnapshot } from "../../../types/update";
import { FeedbackProvider } from "../../../ui";
import { UpdateNotice } from "../UpdateNotice";

const mocks = vi.hoisted(() => ({
  snapshot: {
    platform: "web",
    currentVersion: "4.0.0",
    status: "idle",
    source: "auto",
  } as UpdateSnapshot,
  executeUpdateAction: vi.fn(),
  suppressed: false,
}));

vi.mock("../../../hooks/useUpdateRuntime", () => ({
  useUpdateSnapshot: () => mocks.snapshot,
}));

vi.mock("../../../services/update/updateRuntime", () => ({
  dismissUpdateNotice: vi.fn(),
  executeUpdateAction: mocks.executeUpdateAction,
  isAutomaticCheckEnabled: () => true,
  isUpdateNoticeSuppressed: () => mocks.suppressed,
  startUpdateRuntime: () => vi.fn(),
  UPDATE_NOTICE_ID_EXPORT: "app-update-notice",
}));

function renderNotice() {
  return render(
    <FeedbackProvider>
      <UpdateNotice />
    </FeedbackProvider>
  );
}

describe("UpdateNotice", () => {
  beforeEach(() => {
    mocks.executeUpdateAction.mockReset();
    mocks.suppressed = false;
  });

  it("Web 更新由 Service Worker 直接应用，不展示通知或操作", () => {
    mocks.snapshot = {
      platform: "web",
      currentVersion: "4.0.0",
      latestVersion: "4.1.0",
      status: "available",
      source: "platform",
    };
    renderNotice();

    expect(screen.queryByText("发现新版本")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "更新" })).not.toBeInTheDocument();
  });

  it("Electron 自动下载完成后仅持久提醒重启", () => {
    mocks.snapshot = {
      platform: "electron",
      currentVersion: "4.0.0",
      latestVersion: "4.1.0",
      status: "ready",
      source: "auto",
      action: "install",
    };
    renderNotice();

    expect(screen.getByText("新版本已下载")).toBeInTheDocument();
    expect(screen.getByText("v4.1.0")).toBeInTheDocument();
    expect(screen.getByText("请重启应用，退出时会自动安装。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /更新|重启|安装/ })).not.toBeInTheDocument();
  });

  it.each([
    { status: "available" as const, action: "download" as const, progress: undefined },
    { status: "downloading" as const, action: undefined, progress: 42 },
  ])("Electron 后台下载阶段 $status 不展示操作通知", ({ status, action, progress }) => {
    mocks.snapshot = {
      platform: "electron",
      currentVersion: "4.0.0",
      latestVersion: "4.1.0",
      status,
      source: "auto",
      action,
      progress,
    };
    renderNotice();

    expect(screen.queryByText("发现新版本")).not.toBeInTheDocument();
    expect(screen.queryByText("新版本已下载")).not.toBeInTheDocument();
  });

  it("Android 保留下载入口", async () => {
    mocks.snapshot = {
      platform: "android",
      currentVersion: "4.0.0",
      latestVersion: "4.1.0",
      status: "available",
      source: "auto",
      action: "download",
    };
    const user = userEvent.setup();
    renderNotice();

    expect(screen.getByText("发现新版本")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "下载" }));
    expect(mocks.executeUpdateAction).toHaveBeenCalledTimes(1);
  });

  it("不支持自替换的 Electron 包保留发布页入口", async () => {
    mocks.snapshot = {
      platform: "electron",
      currentVersion: "4.0.0",
      latestVersion: "4.1.0",
      status: "available",
      source: "auto",
      action: "open",
    };
    const user = userEvent.setup();
    renderNotice();

    await user.click(screen.getByRole("button", { name: "发布页" }));
    expect(mocks.executeUpdateAction).toHaveBeenCalledTimes(1);
  });

  it("自动提醒可在当前实例内抑制", () => {
    mocks.suppressed = true;
    mocks.snapshot = {
      platform: "electron",
      currentVersion: "4.0.0",
      latestVersion: "4.1.0",
      status: "ready",
      source: "auto",
      action: "install",
    };
    renderNotice();

    expect(screen.queryByText("新版本已下载")).not.toBeInTheDocument();
  });
});
