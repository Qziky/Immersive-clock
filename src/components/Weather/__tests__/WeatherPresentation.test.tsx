import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WeatherPresentation } from "../WeatherPresentation";

describe("WeatherPresentation", () => {
  it("使用原天气图片资源展示天气图标", () => {
    render(<WeatherPresentation iconCode="04d" temperatureText="27°" weatherText="阴" />);

    const icon = screen.getByRole("img", { name: "阴" });
    expect(icon).toHaveAttribute("src", "/weather-icons/fill/04d.svg");
    expect(icon).toHaveAttribute("loading", "lazy");
    expect(icon).toHaveAttribute("decoding", "async");
  });
});
