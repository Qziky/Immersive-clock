import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CountdownManagerPanel } from "../CountdownManagerPanel";

const dispatch = vi.hoisted(() => vi.fn());
const studyState = vi.hoisted(() => ({
  countdownItems: [
    {
      id: "gaokao-default",
      kind: "gaokao" as const,
      name: "高考倒计时",
      order: 0,
    },
  ],
}));

vi.mock("../../../../contexts/AppContext", () => ({
  useAppDispatch: () => dispatch,
  useAppState: () => ({ study: studyState }),
}));

describe("CountdownManagerPanel", () => {
  let registeredSave: (() => void) | undefined;

  beforeEach(() => {
    dispatch.mockReset();
    registeredSave = undefined;
    vi.spyOn(Date, "now").mockReturnValue(1234);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("在多事件模式中提供全部快捷事件并保存新增项目", () => {
    render(
      <CountdownManagerPanel
        onRegisterSave={(save) => {
          registeredSave = save;
        }}
      />
    );

    for (const label of ["添加高考", "添加中考", "添加考研", "添加考公"]) {
      expect(screen.getByRole("button", { name: label })).toBeEnabled();
    }

    fireEvent.click(screen.getByRole("button", { name: "添加中考" }));
    expect(screen.getByText("中考倒计时")).toBeInTheDocument();
    expect(screen.getByText("常用日期：每年 6 月 20 日")).toBeInTheDocument();

    act(() => registeredSave?.());

    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_COUNTDOWN_ITEMS",
      payload: [
        {
          id: "gaokao-default",
          kind: "gaokao",
          name: "高考倒计时",
          order: 0,
          targetDate: undefined,
        },
        {
          id: "zhongkao-1234",
          kind: "zhongkao",
          name: "中考倒计时",
          order: 1,
          targetDate: undefined,
        },
      ],
    });
  });
});
