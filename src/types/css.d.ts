/** CSS Module 类型定义 */
declare module "*.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module "*?worker&url" {
  const workerUrl: string;
  export default workerUrl;
}

/** 全局类型声明 */
declare const __ENABLE_PWA__: boolean;

/** Vite 环境变量类型定义 */
interface ImportMetaEnv {
  readonly MODE: string;
  readonly BASE_URL: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly SSR: boolean;
  /** 应用版本号 */
  readonly VITE_APP_VERSION: string;
  /** 是否启用 Clarity 埋点 */
  readonly VITE_ENABLE_CLARITY?: string;
  /** Clarity 项目 ID */
  readonly VITE_CLARITY_PROJECT_ID?: string;
  /** 更新清单地址覆盖 */
  readonly VITE_UPDATE_MANIFEST_URL?: string;
}

/** 扩展 ImportMeta 接口 */
interface ImportMeta {
  readonly env: ImportMetaEnv;
  readonly glob: <T = unknown>(pattern: string) => Record<string, () => Promise<T>>;
}
