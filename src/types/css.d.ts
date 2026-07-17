/** CSS Module 类型定义 */
declare module "*.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
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
  /** 高德地图 API Key */
  readonly VITE_AMAP_API_KEY: string;
  /** 应用版本号 */
  readonly VITE_APP_VERSION: string;
  /** 是否启用 Clarity 埋点 */
  readonly VITE_ENABLE_CLARITY?: string;
  /** Clarity 项目 ID */
  readonly VITE_CLARITY_PROJECT_ID?: string;
  /** 天气调度默认档位 */
  readonly VITE_WEATHER_DEFAULT_PROFILE?: string;
  /** 本设备小米天气请求最小间隔（秒） */
  readonly VITE_WEATHER_MIN_REQUEST_GAP_SEC?: string;
  /** 本设备每小时小米天气请求上限 */
  readonly VITE_WEATHER_MAX_REQUESTS_PER_HOUR?: string;
}

/** 扩展 ImportMeta 接口 */
interface ImportMeta {
  readonly env: ImportMetaEnv;
  readonly glob: <T = unknown>(pattern: string) => Record<string, () => Promise<T>>;
}
