import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AboutSettingsPanel from "../sections/AboutSettingsPanel";

const aboutMocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
}));

vi.mock("../../../contexts/AppContext", () => ({
  useAppDispatch: () => aboutMocks.dispatch,
  useAppState: () => ({
    study: {
      errorCenterMode: "off",
      errorPopupEnabled: false,
    },
  }),
}));

vi.mock("../../../utils/errorCenter", () => ({
  clearErrorCenter: vi.fn(),
  exportErrorCenterJson: vi.fn(() => "{}"),
  getErrorCenterRecords: vi.fn(() => []),
  subscribeErrorCenter: vi.fn(() => () => undefined),
}));

vi.mock("../../../utils/weatherStorage", () => ({
  getWeatherCache: vi.fn(() => ({})),
}));

describe("AboutSettingsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("在项目信息中展示今日诗词服务与隐私说明", () => {
    render(<AboutSettingsPanel section="project" />);

    expect(screen.getByText("服务与隐私说明")).toBeInTheDocument();
    expect(
      screen.getByText(/今日诗词免费版仅限非商业使用。启用后会由服务方处理公开 IP/)
    ).toHaveTextContent("Token/Cookie");
  });
});
