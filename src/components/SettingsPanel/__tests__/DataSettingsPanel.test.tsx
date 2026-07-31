import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";

import { FeedbackProvider } from "../../../ui";
import DataSettingsPanel from "../sections/DataSettingsPanel";

const dataManagementMocks = vi.hoisted(() => ({
  clearDataScope: vi.fn(),
  createBackup: vi.fn(),
  dataDomainRegistry: {
    assets: {},
    cache: {},
    deviceState: {},
    diagnostics: {},
    noiseHistory: {},
    settings: {},
  },
  discardQuarantinedSettingsRecovery: vi.fn(),
  eraseAllData: vi.fn(),
  getQuarantinedSettingsRecovery: vi.fn(),
  inspectData: vi.fn(),
  inspectUnusedAssets: vi.fn(),
  prepareBackupFile: vi.fn(),
  resetPreferences: vi.fn(),
  restoreBackup: vi.fn(),
}));

const noiseDataMocks = vi.hoisted(() => ({
  exportArchive: vi.fn(),
  importArchive: vi.fn(),
  preflightArchive: vi.fn(),
  inspectFeatures: vi.fn(),
  getRescoreState: vi.fn(),
  subscribeRescoreState: vi.fn(() => () => {}),
}));

vi.mock("../../../services/dataManagement", () => dataManagementMocks);
vi.mock("../../../services/noise/noiseFeatureArchiveService", () => ({
  exportNoiseFeatureArchive: noiseDataMocks.exportArchive,
  importNoiseFeatureArchive: noiseDataMocks.importArchive,
  preflightNoiseFeatureArchive: noiseDataMocks.preflightArchive,
}));
vi.mock("../../../services/noise/noiseFeatureRepository", () => ({
  inspectNoiseFeatureData: noiseDataMocks.inspectFeatures,
}));
vi.mock("../../../services/noise/noiseRescoreService", () => ({
  getNoiseRescoreState: noiseDataMocks.getRescoreState,
  subscribeNoiseRescoreState: noiseDataMocks.subscribeRescoreState,
}));

const overview = {
  domains: [
    {
      id: "settings",
      label: "设置与用户内容",
      schemaVersion: 1,
      itemCount: 1,
      bytes: 1024,
      includedInBackup: true,
    },
    {
      id: "assets",
      label: "自定义资源",
      schemaVersion: 1,
      itemCount: 2,
      bytes: 1024,
      includedInBackup: true,
    },
    {
      id: "noiseHistory",
      label: "噪声历史",
      schemaVersion: 4,
      itemCount: 3,
      bytes: 1024,
      includedInBackup: true,
    },
    {
      id: "cache",
      label: "缓存",
      schemaVersion: 1,
      itemCount: 2,
      bytes: 1024,
      includedInBackup: false,
    },
    {
      id: "diagnostics",
      label: "诊断记录",
      schemaVersion: 1,
      itemCount: 0,
      bytes: 0,
      includedInBackup: false,
    },
    {
      id: "deviceState",
      label: "设备状态",
      schemaVersion: 1,
      itemCount: 1,
      bytes: 16,
      includedInBackup: false,
    },
  ],
  appDataBytes: 4096,
  userDataBytes: 3072,
  cacheBytes: 1024,
  storageEstimate: { supported: true, usage: 8192, quota: 16384 },
};

const backup = {
  format: "immersive-clock-backup",
  backupVersion: 1,
  appVersion: "3.13.3",
  exportedAt: "2026-07-11T00:00:00.000Z",
  scope: "full",
  manifest: [
    { id: "settings", schemaVersion: 1, itemCount: 1, bytes: 1024 },
    { id: "assets", schemaVersion: 1, itemCount: 2, bytes: 1024 },
    { id: "noiseHistory", schemaVersion: 4, itemCount: 3, bytes: 1024 },
  ],
  domains: {
    settings: { schemaVersion: 1, data: {} },
    assets: { schemaVersion: 1, data: [] },
    noiseHistory: { schemaVersion: 4, data: [] },
  },
} as const;

const preparedBackup = {
  backup,
  sourceFormat: "immersive-clock-backup-v1",
  preview: {
    format: "immersive-clock-backup",
    backupVersion: 1,
    appVersion: "3.13.3",
    exportedAt: "2026-07-11T00:00:00.000Z",
    scope: "full",
    domains: [
      { id: "settings", itemCount: 1, bytes: 1024 },
      { id: "assets", itemCount: 2, bytes: 1024 },
      { id: "noiseHistory", itemCount: 3, bytes: 1024 },
    ],
    totalItems: 6,
    totalBytes: 3072,
    hasNoiseHistory: true,
    containsSensitiveData: true,
    warnings: [],
  },
} as const;

const noiseArchivePreview = {
  sessionCount: 2,
  chunkCount: 3,
  frameCount: 1_200,
  requiredBytes: 33_600,
  additionalBytes: 16_800,
  startAt: new Date("2026-07-10T00:00:00.000Z").getTime(),
  endAt: new Date("2026-07-10T00:02:00.000Z").getTime(),
};

interface RenderPanelOptions {
  hasUnsavedAppearanceChanges?: boolean;
  onBusyChange?: Mock<(isBusy: boolean) => void>;
}

function renderPanel(onReloadRequired = vi.fn(), options: RenderPanelOptions = {}) {
  const onBusyChange = options.onBusyChange ?? vi.fn<(isBusy: boolean) => void>();
  const result = render(
    <FeedbackProvider>
      <DataSettingsPanel
        hasUnsavedAppearanceChanges={options.hasUnsavedAppearanceChanges ?? false}
        onBusyChange={onBusyChange}
        onReloadRequired={onReloadRequired}
      />
    </FeedbackProvider>
  );
  return { ...result, onBusyChange, onReloadRequired };
}

describe("DataSettingsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dataManagementMocks.inspectData.mockResolvedValue(overview);
    dataManagementMocks.getQuarantinedSettingsRecovery.mockReturnValue(null);
    dataManagementMocks.inspectUnusedAssets.mockResolvedValue({
      assets: [],
      itemCount: 0,
      bytes: 0,
      referencedAssetIds: [],
    });
    dataManagementMocks.createBackup.mockResolvedValue(backup);
    dataManagementMocks.prepareBackupFile.mockResolvedValue(preparedBackup);
    dataManagementMocks.restoreBackup.mockResolvedValue({
      affectedDomains: ["settings", "assets", "noiseHistory"],
      itemCount: 6,
    });
    dataManagementMocks.clearDataScope.mockResolvedValue({
      affectedDomains: ["cache"],
      itemCount: 2,
      bytesFreed: 1024,
    });
    dataManagementMocks.resetPreferences.mockResolvedValue({
      affectedDomains: ["settings"],
      itemCount: 1,
    });
    dataManagementMocks.eraseAllData.mockResolvedValue({
      affectedDomains: ["settings", "assets", "noiseHistory", "cache"],
      itemCount: 8,
      bytesFreed: 4096,
    });
    noiseDataMocks.inspectFeatures.mockResolvedValue({
      sessionCount: 2,
      chunkCount: 3,
      frameCount: 1_200,
      bytes: 33_600,
      oldestAt: noiseArchivePreview.startAt,
      newestAt: noiseArchivePreview.endAt,
    });
    noiseDataMocks.getRescoreState.mockResolvedValue(null);
    noiseDataMocks.subscribeRescoreState.mockImplementation(() => () => {});
    noiseDataMocks.preflightArchive.mockResolvedValue(noiseArchivePreview);
    noiseDataMocks.importArchive.mockResolvedValue(noiseArchivePreview);
    noiseDataMocks.exportArchive.mockResolvedValue(
      new Blob(["archive"], { type: "application/x-immersive-clock-noise-features" })
    );
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:data-backup");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  it("展示数据概览并默认选择完整备份", async () => {
    const { container } = renderPanel();

    expect(await screen.findByText("4.0 KB")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "完整备份" })).toBeChecked();
    expect(screen.getByRole("button", { name: "选择备份文件" })).toBeVisible();
    expect(screen.getByText("正在使用 2 项 · 未使用 0 项 · 0 B")).toBeInTheDocument();
    expect(screen.getByText(/备份文件为明文.*位置、课程安排、语录和噪音活动时间/)).toBeVisible();

    fireEvent.click(screen.getByRole("radio", { name: "设置与资源" }));
    expect(screen.getByText(/备份文件为明文.*位置、课程安排和语录，不包含噪音历史/)).toBeVisible();

    const nativeFileInput = container.querySelector<HTMLInputElement>(
      'input[accept=".json,application/json"]'
    );
    expect(nativeFileInput).not.toBeNull();
    expect(nativeFileInput?.className).toMatch(/fileInput/);
    expect(nativeFileInput).toHaveAttribute("accept", ".json,application/json");
  });

  it("按选定范围创建并下载备份", async () => {
    renderPanel();
    await screen.findByText("4.0 KB");

    fireEvent.click(screen.getByRole("button", { name: "创建备份" }));

    await waitFor(() => expect(dataManagementMocks.createBackup).toHaveBeenCalledWith("full"));
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:data-backup");
    expect(await screen.findByText("备份已创建")).toBeInTheDocument();
  });

  it("允许下载或删除隔离的原始设置副本", async () => {
    dataManagementMocks.getQuarantinedSettingsRecovery.mockReturnValue({
      createdAt: new Date("2026-07-11T01:00:00.000Z").getTime(),
      reason: "invalid-json",
      raw: "{broken",
      fileName: "immersive-clock-quarantined-settings.json",
    });
    renderPanel();

    expect(await screen.findByText("发现隔离的旧设置")).toBeInTheDocument();
    expect(screen.getByText(/设置文件格式损坏/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下载原始设置" }));
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "删除隔离副本" }));
    const dialog = await screen.findByRole("dialog", { name: "删除隔离设置副本" });
    fireEvent.click(within(dialog).getByRole("button", { name: "删除副本" }));

    await waitFor(() =>
      expect(dataManagementMocks.discardQuarantinedSettingsRecovery).toHaveBeenCalledTimes(1)
    );
    expect(screen.queryByText("发现隔离的旧设置")).toBeNull();
  });

  it("预检备份后默认恢复其中的噪音历史并请求刷新", async () => {
    const { container, onReloadRequired } = renderPanel();
    await screen.findByText("4.0 KB");
    const file = new File(["{}"], "clock-backup.json", { type: "application/json" });
    const nativeFileInput = container.querySelector<HTMLInputElement>(
      'input[accept=".json,application/json"]'
    );

    fireEvent.change(nativeFileInput!, { target: { files: [file] } });

    expect(await screen.findByLabelText("备份预检摘要")).toBeInTheDocument();
    expect(dataManagementMocks.prepareBackupFile).toHaveBeenCalledWith(file);
    expect(screen.getByRole("checkbox", { name: "设置与自定义资源（必选）" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "噪音历史" })).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "恢复并刷新" }));
    const dialog = await screen.findByRole("dialog", { name: "恢复本地数据" });
    expect(within(dialog).getByText(/尚未保存的更改会丢失/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "恢复并刷新" }));

    await waitFor(() =>
      expect(dataManagementMocks.restoreBackup).toHaveBeenCalledWith(preparedBackup, {
        includeNoiseHistory: true,
      })
    );
    expect(onReloadRequired).toHaveBeenCalledTimes(1);
  });

  it("确认后只清理选定的数据分类并刷新概览", async () => {
    renderPanel();
    await screen.findByText("4.0 KB");

    fireEvent.click(screen.getByRole("button", { name: "清理临时缓存" }));
    const dialog = await screen.findByRole("dialog", { name: "清理临时缓存" });
    fireEvent.click(within(dialog).getByRole("button", { name: "清理缓存" }));

    await waitFor(() => expect(dataManagementMocks.clearDataScope).toHaveBeenCalledWith("cache"));
    expect(dataManagementMocks.inspectData).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("临时缓存已清理")).toBeInTheDocument();
  });

  it("清理噪音历史前明确说明完整数据边界并刷新原始数据概览", async () => {
    dataManagementMocks.clearDataScope.mockResolvedValueOnce({
      affectedDomains: ["noiseHistory"],
      itemCount: 1_206,
      bytesFreed: 34_624,
    });
    renderPanel();
    await screen.findByText("4.0 KB");

    expect(
      screen.getByText(
        "删除采集会话、100 ms 原始帧、派生评分和重算状态；保留监测设置与 dB(A) 校准。"
      )
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "清理噪音历史" }));
    const dialog = await screen.findByRole("dialog", { name: "清理噪音历史" });
    expect(
      within(dialog).getByText(
        "采集会话、100 ms 原始帧、派生评分和重算状态将被永久删除；监测设置与 dB(A) 校准会保留。此操作无法撤销。"
      )
    ).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "删除历史" }));

    await waitFor(() =>
      expect(dataManagementMocks.clearDataScope).toHaveBeenCalledWith("noiseHistory")
    );
    await waitFor(() => expect(noiseDataMocks.inspectFeatures).toHaveBeenCalledTimes(2));
  });

  it("预检 .icnoise 后确认导入并显示后台重算状态", async () => {
    noiseDataMocks.getRescoreState.mockResolvedValue({
      modelVersion: "spectral-activity-v2",
      configDigest: "digest",
      status: "running",
      sessionId: "capture-a",
      chunkSequence: 1,
      completedSessionIds: ["capture-a"],
      completedSessionCount: 1,
      totalSessionCount: 2,
      updatedAt: 1,
      error: null,
    });
    const { container } = renderPanel();
    await screen.findByText("33 KB");
    const file = new File(["archive"], "noise.icnoise", {
      type: "application/x-immersive-clock-noise-features",
    });

    fireEvent.change(container.querySelector('input[accept^=".icnoise"]')!, {
      target: { files: [file] },
    });

    expect(await screen.findByLabelText("原始监测数据预检摘要")).toBeInTheDocument();
    expect(noiseDataMocks.preflightArchive).toHaveBeenCalledWith(file);
    expect(screen.getByText("16 KB")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "导入并重算" }));
    const dialog = await screen.findByRole("dialog", { name: "导入原始监测数据" });
    expect(within(dialog).getByText(/预计新增 16 KB/)).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "导入并重算" }));

    await waitFor(() => expect(noiseDataMocks.importArchive).toHaveBeenCalledWith(file));
    expect(await screen.findByText("原始监测数据已导入")).toBeVisible();
  });

  it("数据操作期间同步上报忙碌状态并设置数据区域语义", async () => {
    let resolveClear:
      | ((value: { affectedDomains: string[]; itemCount: number }) => void)
      | undefined;
    dataManagementMocks.clearDataScope.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveClear = resolve;
        })
    );
    const { container, onBusyChange } = renderPanel();
    await screen.findByText("4.0 KB");
    await waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(false));
    onBusyChange.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "清理临时缓存" }));
    const dialog = await screen.findByRole("dialog", { name: "清理临时缓存" });
    fireEvent.click(within(dialog).getByRole("button", { name: "清理缓存" }));

    await waitFor(() => expect(dataManagementMocks.clearDataScope).toHaveBeenCalledWith("cache"));
    await waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(true));
    expect(container.querySelector("#data-settings-panel")).toHaveAttribute("aria-busy", "true");

    act(() => {
      resolveClear?.({ affectedDomains: ["cache"], itemCount: 2 });
    });
    await waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(false));
    expect(container.querySelector("#data-settings-panel")).not.toHaveAttribute("aria-busy");
  });

  it("外观草稿未保存时禁用未使用资源清理", async () => {
    renderPanel(vi.fn(), { hasUnsavedAppearanceChanges: true });
    await screen.findByText("4.0 KB");

    expect(screen.getByRole("button", { name: "清理未使用资源" })).toBeDisabled();
    expect(screen.getByText("请先保存或取消外观更改，再清理未使用资源。")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "清理未使用资源" }));
    expect(dataManagementMocks.clearDataScope).not.toHaveBeenCalledWith("unusedAssets");
  });

  it("危险操作确认展示具体影响数量", async () => {
    renderPanel();
    await screen.findByText("4.0 KB");

    fireEvent.click(screen.getByRole("button", { name: "恢复默认" }));
    const resetDialog = await screen.findByRole("dialog", { name: "恢复默认设置" });
    expect(within(resetDialog).getByText(/将重置 1 份设置偏好/)).toBeVisible();
    expect(
      within(resetDialog).getByText(/课表、倒计时、语录内容、历史和自定义资源会保留/)
    ).toBeVisible();
    fireEvent.click(within(resetDialog).getByRole("button", { name: "取消" }));

    fireEvent.click(screen.getByRole("button", { name: "全部删除" }));
    const eraseDialog = await screen.findByRole("dialog", { name: "删除全部本地数据" });
    expect(within(eraseDialog).getByText(/将永久删除 9 项本地数据（4\.0 KB）/)).toBeVisible();
  });

  it("数据概览不可用时用已注册分类数说明全部删除范围", async () => {
    dataManagementMocks.inspectData.mockRejectedValueOnce(new Error("概览读取失败"));
    renderPanel();
    await screen.findByText("数据概览暂不可用");

    fireEvent.click(screen.getByRole("button", { name: "全部删除" }));
    const dialog = await screen.findByRole("dialog", { name: "删除全部本地数据" });
    expect(within(dialog).getByText(/6 个已注册数据分类（大小未知）/)).toBeVisible();
  });

  it("预检失败时保留错误提示且不展示恢复操作", async () => {
    dataManagementMocks.prepareBackupFile.mockRejectedValue(new Error("备份协议无效"));
    const { container } = renderPanel();
    await screen.findByText("4.0 KB");
    const file = new File(["bad"], "bad.json", { type: "application/json" });

    fireEvent.change(container.querySelector('input[accept=".json,application/json"]')!, {
      target: { files: [file] },
    });

    expect((await screen.findAllByText("备份协议无效")).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByLabelText("备份预检摘要")).toBeNull();
    expect(dataManagementMocks.restoreBackup).not.toHaveBeenCalled();
  });
});
