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
    source: "auto",
  } as UpdateSnapshot,
  checkForUpdates: vi.fn(),
  updateGeneralSettings: vi.fn(),
}));

vi.mock("../../../../hooks/useUpdateRuntime", () => ({
  useUpdateSnapshot: () => mocks.snapshot,
}));

vi.mock("../../../../services/update/updateRuntime", () => ({
  checkForUpdates: mocks.checkForUpdates,
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
      source: "auto",
    };
    mocks.checkForUpdates.mockReset().mockResolvedValue(mocks.snapshot);
    mocks.updateGeneralSettings.mockReset();
  });

  it("展示版本与平台，并提供手动检查入口", () => {
    renderPanel();

    expect(screen.getByText("v4.0.1")).toBeInTheDocument();
    expect(screen.getByText("v4.1.0")).toBeInTheDocument();
    expect(screen.getByText("Web / PWA")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "检查更新" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /立即更新|重启并安装/ })).not.toBeInTheDocument();
  });

  it("点击手动检查会以 manual 标记发起更新检查", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "检查更新" }));

    expect(mocks.checkForUpdates).toHaveBeenCalledWith({ manual: true });
  });

  it("检查中禁用手动检查入口", () => {
    mocks.snapshot = {
      ...mocks.snapshot,
      status: "checking",
    };
    renderPanel();

    expect(screen.getByRole("button", { name: "检查更新" })).toBeDisabled();
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

  it("桌面客户端就绪后只展示重启说明", () => {
    mocks.snapshot = {
      platform: "electron",
      currentVersion: "4.0.1",
      latestVersion: "4.1.0",
      status: "ready",
      source: "auto",
      action: "install",
    };

    renderPanel();

    expect(screen.getByText("新版本已下载")).toBeInTheDocument();
    expect(screen.getByText("请重启应用，退出时会自动安装。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /重启|安装/ })).not.toBeInTheDocument();
  });
});
