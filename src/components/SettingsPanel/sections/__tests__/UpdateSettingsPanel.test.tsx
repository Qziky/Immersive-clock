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
      source: "auto",
    };
    mocks.checkForUpdates.mockReset().mockResolvedValue(mocks.snapshot);
    mocks.updateGeneralSettings.mockReset();
    mocks.executeUpdateAction.mockReset().mockResolvedValue(undefined);
  });

  it("展示版本与平台，并提供手动检查入口", () => {
    renderPanel();

    expect(screen.getByText("v4.0.1")).toBeInTheDocument();
    expect(screen.getByText("v4.1.0")).toBeInTheDocument();
    expect(screen.getByText("Web / PWA")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "检查更新" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "准备更新" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "刷新并更新" })).not.toBeInTheDocument();
  });

  it.each([
    ["available", "准备更新"],
    ["ready", "刷新并更新"],
    ["error", "重试更新"],
  ] as const)("Web 阶段 %s 提供可执行入口", async (status, label) => {
    mocks.snapshot = { ...mocks.snapshot, status };
    renderPanel();

    await userEvent.click(screen.getByRole("button", { name: label }));
    expect(mocks.executeUpdateAction).toHaveBeenCalledTimes(1);
  });

  it("准备中说明可以继续使用，不显示刷新操作", () => {
    mocks.snapshot = { ...mocks.snapshot, status: "preparing" };
    renderPanel();

    expect(screen.getByText("正在准备新版资源")).toBeVisible();
    expect(screen.queryByRole("button", { name: "刷新并更新" })).not.toBeInTheDocument();
  });

  it("本窗计时未结束时保留就绪状态，但阻止手动刷新", async () => {
    mocks.snapshot = { ...mocks.snapshot, status: "ready", webReloadBlocked: true };
    renderPanel();
    const apply = screen.getByRole("button", { name: "刷新并更新" });
    expect(apply).toBeDisabled();
    expect(screen.getByText(/当前窗口有计时或编辑未结束/)).toBeInTheDocument();
    await userEvent.click(apply);
    expect(mocks.executeUpdateAction).not.toHaveBeenCalled();
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
