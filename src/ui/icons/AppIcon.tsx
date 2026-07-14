import { appIconRegistry, type AppIconName } from "./appIconRegistry";

export type { AppIconName } from "./appIconRegistry";

export const APP_ICON_SIZES = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  display: 28,
} as const;

export type AppIconSize = keyof typeof APP_ICON_SIZES;

export interface AppIconProps {
  name: AppIconName;
  size?: AppIconSize;
  className?: string;
}

export function AppIcon({ name, size = "md", className }: AppIconProps) {
  const Icon = appIconRegistry[name];
  const pixelSize = APP_ICON_SIZES[size];

  return (
    <Icon
      aria-hidden="true"
      className={className}
      data-app-icon={name}
      fill="none"
      focusable="false"
      height={pixelSize}
      stroke="currentColor"
      strokeWidth={2}
      width={pixelSize}
    />
  );
}
