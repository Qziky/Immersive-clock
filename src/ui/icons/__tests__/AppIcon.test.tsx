import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { APP_ICON_SIZES, AppIcon, type AppIconSize } from "../AppIcon";
import { appIconRegistry } from "../appIconRegistry";

describe("AppIcon", () => {
  it("renders every registered semantic icon", () => {
    const names = Object.keys(appIconRegistry) as Array<keyof typeof appIconRegistry>;
    const { container } = render(
      <>
        {names.map((name) => (
          <AppIcon key={name} name={name} />
        ))}
      </>
    );

    expect(container.querySelectorAll("svg")).toHaveLength(names.length);
  });

  it.each(Object.entries(APP_ICON_SIZES) as Array<[AppIconSize, number]>)(
    "maps %s to %ipx",
    (size, pixels) => {
      const { container } = render(<AppIcon name="action.search" size={size} />);
      const icon = container.querySelector("svg");

      expect(icon).toHaveAttribute("width", String(pixels));
      expect(icon).toHaveAttribute("height", String(pixels));
    }
  );

  it("keeps rendering decorative and color-inheriting", () => {
    const { container } = render(<AppIcon name="status.success" />);
    const icon = container.querySelector("svg");

    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon).toHaveAttribute("focusable", "false");
    expect(icon).toHaveAttribute("stroke", "currentColor");
    expect(icon).toHaveAttribute("fill", "none");
    expect(icon).toHaveAttribute("stroke-width", "2");
    expect(icon).toHaveAttribute("data-app-icon", "status.success");
  });
});
