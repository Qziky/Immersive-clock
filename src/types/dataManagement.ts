export type DataDomainId =
  | "settings"
  | "assets"
  | "noiseHistory"
  | "cache"
  | "diagnostics"
  | "deviceState";

export type BackupDomainId = Extract<DataDomainId, "settings" | "assets" | "noiseHistory">;

export type BackupScope = "full" | "settings-and-assets";

export type ClearableDataScope = "cache" | "noiseHistory" | "diagnostics" | "unusedAssets";

export interface DataDomainInspection {
  id: DataDomainId;
  label: string;
  schemaVersion: number;
  itemCount: number;
  bytes: number;
  updatedAt?: number;
  includedInBackup: boolean;
}

export interface StorageEstimateSnapshot {
  supported: boolean;
  usage?: number;
  quota?: number;
}

export interface DataOverview {
  domains: DataDomainInspection[];
  appDataBytes: number;
  userDataBytes: number;
  cacheBytes: number;
  storageEstimate: StorageEstimateSnapshot;
}

export interface AppearanceBackupAsset {
  id: string;
  kind: "background" | "font";
  name: string;
  mimeType: string;
  dataUrl: string;
  family?: string;
  format?: "truetype" | "opentype" | "woff" | "woff2";
}

export interface BackupDomainPayload<T = unknown> {
  schemaVersion: number;
  data: T;
}

export interface BackupManifestEntry {
  id: BackupDomainId;
  schemaVersion: number;
  itemCount: number;
  bytes: number;
}

export interface ImmersiveClockBackupV1 {
  format: "immersive-clock-backup";
  backupVersion: 1;
  appVersion: string;
  exportedAt: string;
  scope: BackupScope;
  manifest: BackupManifestEntry[];
  domains: {
    settings: BackupDomainPayload<Record<string, unknown>>;
    assets: BackupDomainPayload<AppearanceBackupAsset[]>;
    noiseHistory?: BackupDomainPayload<unknown[]>;
  };
}

export type BackupSourceFormat =
  | "immersive-clock-backup-v1"
  | "immersive-clock-settings-v2"
  | "legacy-app-settings";

export interface BackupPreviewDomain {
  id: BackupDomainId;
  itemCount: number;
  bytes: number;
}

export interface BackupPreview {
  format: ImmersiveClockBackupV1["format"];
  backupVersion: ImmersiveClockBackupV1["backupVersion"];
  appVersion: string;
  exportedAt: string;
  scope: BackupScope;
  domains: BackupPreviewDomain[];
  totalItems: number;
  totalBytes: number;
  hasNoiseHistory: boolean;
  containsSensitiveData: boolean;
  warnings: string[];
}

export interface PreparedBackup {
  backup: ImmersiveClockBackupV1;
  sourceFormat: BackupSourceFormat;
  preview: BackupPreview;
  /** Worker 预检生成的内容指纹，仅用于本次恢复，不会写入备份文件。 */
  resourceFingerprints?: Readonly<Record<string, string>>;
}

export interface RestoreBackupOptions {
  includeNoiseHistory?: boolean;
}

export interface DataOperationResult {
  affectedDomains: DataDomainId[];
  itemCount: number;
  bytesFreed?: number;
}

export interface UnusedAssetItem {
  id: string;
  kind: AppearanceBackupAsset["kind"];
  name: string;
  mimeType: string;
  bytes: number;
  status: "unused";
}

export interface UnusedAssetInspection {
  assets: UnusedAssetItem[];
  itemCount: number;
  bytes: number;
  referencedAssetIds: string[];
}

export interface QuarantinedSettingsRecovery {
  createdAt: number;
  reason: "invalid-json" | "unsupported-version";
  raw: string;
  fileName: string;
}

export interface DataDomain<T = unknown> {
  readonly id: DataDomainId;
  readonly label: string;
  readonly schemaVersion: number;
  readonly includedInBackup: boolean;
  inspect(): Promise<DataDomainInspection>;
  export(): Promise<T>;
  validate(value: unknown): Promise<T>;
  replace(value: T): Promise<void>;
  clear(): Promise<DataOperationResult>;
  migrate(value: unknown, fromSchemaVersion: number): Promise<T>;
}
