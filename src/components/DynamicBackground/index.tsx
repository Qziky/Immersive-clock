import { lazy, Suspense } from "react";

import type { AppearanceBackground } from "../../types/appearance";

const BackgroundRenderer = lazy(() =>
  import("./DynamicBackgroundLayer").then((module) => ({ default: module.DynamicBackgroundLayer }))
);

export function DynamicBackgroundLayer(props: {
  background: AppearanceBackground;
  mutedPreview?: boolean;
}) {
  if (props.background.mode !== "dynamic") return null;
  return (
    <Suspense fallback={null}>
      <BackgroundRenderer {...props} />
    </Suspense>
  );
}
