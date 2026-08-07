import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UpdateSnapshot } from "../../../../types/update";
import { FeedbackProvider } from "../../../../ui";
import UpdateSettingsPanel from "../UpdateSettingsPanel";

const mocks = vi.hoisted(() => ({
  snapshot: {
    platform: "web",
    currentVersion: "4.0.1",
    latestVersion: "4.1.0",
    status: "available",
    source: "manual",
    action: "update",
  } as UpdateSnapshot,
  checkForUpdates: vi.fn(),
  executeUpdateAction: vi.fn(),
  updateGeneralSettings: vi.fn(),
}));

vi.mock("../../../../hooks/useUpdateRuntime", () => ({
  useUpdateSnapshot: () => mocks.snapshot,
}));

vi.mock("../../../../services/update/updateRuntime", () => ({
  checkForUpdates: mocks.checkForUpdates,
  executeUpdateAction: mocks.executeUpdateAction,
  startUpdateRuntime: () => vi.fn(),
}));

vi.mock("../../../../utils/appSettings", () => ({
  getAppSettings: () => ({ general: { update: { autoCheckEnabled: true } } }),
  updateGeneralSettings: mocks.updateGeneralSettings,
}));

vi.mock("../../../../utils/runtimePlatform", () => ({
  getRuntimePlatform: () => "web",
}));

function renderPanel(onRegisterSave?: (save: () => void) => void) {
  return render(
    <FeedbackProvider>
      <UpdateSettingsPanel onRegisterSave={onRegisterSave} />
    </FeedbackProvider>
  );
}

describe("UpdateSettingsPanel", () => {
  beforeEach(() => {
    mocks.snapshot = {
      platform: "web",
      currentVersion: "4.0.1",
      latestVersion: "4.1.0",
      status: "available",
      source: "manual",
      action: "update",
    };
    mocks.checkForUpdates.mockReset().mockResolvedValue({
      ...mocks.snapshot,
      latestVersion: "4.0.1",
      status: "current",
    });
    mocks.executeUpdateAction.mockReset();
    mocks.updateGeneralSettings.mockReset();
  });

  it("展示版本与平台，并提供手动检查和更新动作", async () => {
    const user = userEvent.setup();
    renderPanel();

    expect(screen.getByText("v4.0.1")).toBeInTheDocument();
    expect(screen.getByText("v4.1.0")).toBeInTheDocument();
    expect(screen.getByText("Web / PWA")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "检查更新" }));
    expect(mocks.checkForUpdates).toHaveBeenCalledWith({ manual: true });
    expect(await screen.findByText("已是最新版本")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "立即更新" }));
    expect(mocks.executeUpdateAction).toHaveBeenCalledTimes(1);
  });

  it("自动检查开关沿用设置页保存流程", async () => {
    let save: () => void = () => {};
    const user = userEvent.setup();
    renderPanel((registeredSave) => {
      save = registeredSave;
    });

    await user.click(screen.getByRole("switch", { name: "自动检查更新" }));
    save();
    expect(mocks.updateGeneralSettings).toHaveBeenCalledWith({
      update: { autoCheckEnabled: false },
    });
  });

  it("桌面客户端下载时展示可访问的下载进度", () => {
    mocks.snapshot = {
      platform: "electron",
      currentVersion: "4.0.1",
      latestVersion: "4.1.0",
      status: "downloading",
      source: "auto",
      progress: 42,
    };

    renderPanel();

    expect(screen.getByText("下载进度 42%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "应用更新下载进度" })).toHaveAttribute(
      "aria-valuenow",
      "42"
    );
  });
});
