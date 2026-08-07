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
  checkForUpdates: vi.fn(),
  executeUpdateAction: vi.fn(),
  suppressed: false,
}));

vi.mock("../../../hooks/useUpdateRuntime", () => ({
  useUpdateSnapshot: () => mocks.snapshot,
}));

vi.mock("../../../services/update/updateRuntime", () => ({
  checkForUpdates: mocks.checkForUpdates,
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
    mocks.checkForUpdates.mockReset();
    mocks.executeUpdateAction.mockReset();
    mocks.suppressed = false;
  });

  it("持久展示新版本并执行单一主要动作", async () => {
    mocks.snapshot = {
      platform: "web",
      currentVersion: "4.0.0",
      latestVersion: "4.1.0",
      status: "available",
      source: "auto",
      action: "update",
    };
    const user = userEvent.setup();
    renderNotice();

    expect(screen.getByText("发现新版本")).toBeInTheDocument();
    expect(screen.getByText("v4.1.0")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "更新" }));
    expect(mocks.executeUpdateAction).toHaveBeenCalledTimes(1);
  });

  it("手动检查失败时即使没有最新版本也提供重试", async () => {
    mocks.snapshot = {
      platform: "web",
      currentVersion: "4.0.0",
      status: "error",
      source: "manual",
      action: "retry",
      error: "离线",
    };
    const user = userEvent.setup();
    renderNotice();

    expect(screen.getByText("更新检查失败")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重试" }));
    expect(mocks.checkForUpdates).toHaveBeenCalledWith({ manual: true });
  });

  it("自动提醒可在当前实例内抑制，但手动检查不受影响", () => {
    mocks.suppressed = true;
    mocks.snapshot = {
      platform: "web",
      currentVersion: "4.0.0",
      latestVersion: "4.1.0",
      status: "available",
      source: "auto",
      action: "update",
    };
    const { unmount } = renderNotice();
    expect(screen.queryByText("发现新版本")).not.toBeInTheDocument();
    unmount();

    mocks.snapshot = { ...mocks.snapshot, source: "manual" };
    renderNotice();
    expect(screen.getByText("发现新版本")).toBeInTheDocument();
    expect(screen.getByText("v4.1.0")).toBeInTheDocument();
  });
});
