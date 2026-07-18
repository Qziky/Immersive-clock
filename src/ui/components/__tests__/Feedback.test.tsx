import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Button } from "../Button";
import { FeedbackProvider, useFeedback } from "../Feedback";

function FeedbackHarness() {
  const feedback = useFeedback();
  const [result, setResult] = useState("等待确认");
  const duplicateCountRef = useRef(0);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          ["一", "二", "三", "四"].forEach((title, index) =>
            feedback.notify({ id: `queue-${index + 1}`, title })
          );
        }}
      >
        推送通知
      </button>
      <button type="button" onClick={() => feedback.notify({ id: "queue-1", title: "一（更新）" })}>
        更新首条通知
      </button>
      <button
        type="button"
        onClick={() => feedback.notify({ title: "需处理", action: <Button>查看</Button> })}
      >
        推送操作通知
      </button>
      <button
        type="button"
        onClick={() => {
          duplicateCountRef.current += 1;
          feedback.notify({
            id: "duplicate",
            title: `更新 ${duplicateCountRef.current}`,
            duration: 5000,
          });
        }}
      >
        更新同一通知
      </button>
      <button
        type="button"
        onClick={() => {
          void feedback
            .confirm({ title: "清除数据", description: "该操作无法撤销", variant: "danger" })
            .then((confirmed) => setResult(confirmed ? "已确认" : "已取消"));
        }}
      >
        请求确认
      </button>
      <output>{result}</output>
    </>
  );
}

describe("FeedbackProvider", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("limits the viewport to three notifications and applies portal scope", async () => {
    const user = userEvent.setup();
    render(
      <FeedbackProvider>
        <FeedbackHarness />
      </FeedbackProvider>
    );

    await user.click(screen.getByRole("button", { name: "推送通知" }));

    const viewport = screen.getByLabelText("通知");
    expect(within(viewport).getAllByRole("status")).toHaveLength(3);
    expect(screen.getByText("一")).toBeInTheDocument();
    expect(screen.queryByText("四")).not.toBeInTheDocument();

    await user.click(within(viewport).getAllByRole("button", { name: "关闭通知" })[0]);
    await waitFor(() => expect(screen.getByText("四")).toBeInTheDocument());
    expect(viewport).toHaveAttribute("data-ui-scope");
  });

  it("pauses auto-dismiss while hovered or focused", () => {
    vi.useFakeTimers();
    render(
      <FeedbackProvider>
        <FeedbackHarness />
      </FeedbackProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "推送通知" }));
    const toast = screen.getByText("三").closest("[role='status']") as HTMLElement;
    const toastItem = toast.parentElement as HTMLElement;

    act(() => vi.advanceTimersByTime(2000));
    fireEvent.mouseEnter(toastItem);
    act(() => vi.advanceTimersByTime(6000));
    expect(screen.getByText("三")).toBeInTheDocument();

    fireEvent.focus(toast.querySelector("button") as HTMLElement);
    fireEvent.mouseLeave(toastItem);
    act(() => vi.advanceTimersByTime(6000));
    expect(screen.getByText("三")).toBeInTheDocument();

    fireEvent.blur(toast.querySelector("button") as HTMLElement, { relatedTarget: document.body });
    act(() => vi.advanceTimersByTime(3180));
    expect(screen.queryByText("三")).not.toBeInTheDocument();
  });

  it("restarts auto-dismiss when a notification with the same id is updated", () => {
    vi.useFakeTimers();
    render(
      <FeedbackProvider>
        <FeedbackHarness />
      </FeedbackProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "更新同一通知" }));
    act(() => vi.advanceTimersByTime(4000));
    fireEvent.click(screen.getByRole("button", { name: "更新同一通知" }));

    act(() => vi.advanceTimersByTime(1500));
    expect(screen.getByText("更新 2")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(3680));
    expect(screen.queryByText("更新 2")).not.toBeInTheDocument();
  });

  it("updates a visible notification in place without moving it behind the queue", () => {
    render(
      <FeedbackProvider>
        <FeedbackHarness />
      </FeedbackProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "推送通知" }));
    fireEvent.click(screen.getByRole("button", { name: "更新首条通知" }));

    const viewport = screen.getByLabelText("通知");
    expect(
      within(viewport)
        .getAllByRole("status")
        .map((toast) => toast.textContent)
    ).toEqual([
      expect.stringContaining("一（更新）"),
      expect.stringContaining("二"),
      expect.stringContaining("三"),
    ]);
    expect(screen.queryByText("四")).not.toBeInTheDocument();
  });

  it("keeps actionable notifications open until dismissed", () => {
    vi.useFakeTimers();
    render(
      <FeedbackProvider>
        <FeedbackHarness />
      </FeedbackProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "推送操作通知" }));
    act(() => vi.advanceTimersByTime(10000));
    expect(screen.getByText("需处理")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "关闭通知" }));
    const exitingToast = screen.getByText("需处理").closest("[data-ui-presence='exiting']");
    expect(exitingToast).toHaveAttribute("data-ui-presence", "exiting");
    act(() => vi.advanceTimersByTime(180));
    expect(screen.queryByText("需处理")).not.toBeInTheDocument();
  });

  it("resolves themed confirmations and focuses the safe action first", async () => {
    const user = userEvent.setup();
    render(
      <FeedbackProvider>
        <FeedbackHarness />
      </FeedbackProvider>
    );

    await user.click(screen.getByRole("button", { name: "请求确认" }));

    expect(screen.getByRole("dialog", { name: "清除数据" })).toBeInTheDocument();
    expect(screen.getByText("该操作无法撤销")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "确定" }));
    expect(await screen.findByText("已确认")).toBeInTheDocument();
  });
});
