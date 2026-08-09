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
  updateGeneralSettings: vi.fn(),
}));

vi.mock("../../../../hooks/useUpdateRuntime", () => ({
  useUpdateSnapshot: () => mocks.snapshot,
}));

vi.mock("../../../../services/update/updateRuntime", () => ({
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
    mocks.updateGeneralSettings.mockReset();
  });

  it("展示版本与平台，但不提供手动检查或更新动作", () => {
    renderPanel();

    expect(screen.getByText("v4.0.1")).toBeInTheDocument();
    expect(screen.getByText("v4.1.0")).toBeInTheDocument();
    expect(screen.getByText("Web / PWA")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "检查更新" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /立即更新|重启并安装/ })).not.toBeInTheDocument();
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
