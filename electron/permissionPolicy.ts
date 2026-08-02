export interface FullscreenPermissionContext {
  isMainWindow: boolean;
  isMainFrame: boolean;
}

/**
 * 判断全屏权限是否可以授予：只允许应用主窗口的顶层页面。
 */
export function shouldAllowFullscreenPermission({
  isMainWindow,
  isMainFrame,
}: FullscreenPermissionContext): boolean {
  return isMainWindow && isMainFrame;
}
