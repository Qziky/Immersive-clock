import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Dropdown } from "../Dropdown";
import { Modal } from "../Modal";

function FocusHarness() {
  const [isOpen, setIsOpen] = useState(false);
  const initialFocusRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>
        打开设置
      </button>
      <Modal
        isOpen={isOpen}
        title="设置"
        initialFocusRef={initialFocusRef}
        onClose={() => setIsOpen(false)}
      >
        <button ref={initialFocusRef} type="button">
          初始操作
        </button>
        <button type="button">末尾操作</button>
      </Modal>
    </>
  );
}

describe("Modal", () => {
  it("scopes its portal, hides the background and restores focus", async () => {
    const user = userEvent.setup();
    const { container } = render(<FocusHarness />);
    const opener = screen.getByRole("button", { name: "打开设置" });

    await user.click(opener);

    const dialog = screen.getByRole("dialog", { name: "设置" });
    const backdrop = dialog.parentElement as HTMLElement;
    expect(backdrop).toHaveAttribute("data-ui-scope");
    expect(backdrop).toHaveAttribute("data-ui-overlay-root");
    expect(container).toHaveAttribute("aria-hidden", "true");
    expect(container.inert).toBe(true);
    expect(screen.getByRole("button", { name: "初始操作" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "关闭" }));

    await waitFor(() => expect(opener).toHaveFocus());
    expect(container).not.toHaveAttribute("aria-hidden");
    expect(container.inert).not.toBe(true);
  });

  it("traps focus and honors closeOnEscape", () => {
    const onClose = vi.fn();

    render(
      <Modal isOpen title="键盘弹窗" closeOnEscape={false} onClose={onClose}>
        <button type="button">第一个</button>
        <button type="button">最后一个</button>
      </Modal>
    );

    const first = screen.getByRole("button", { name: "关闭" });
    const last = screen.getByRole("button", { name: "最后一个" });
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(first).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("only lets the top overlay handle Escape and backdrop clicks", async () => {
    const closeFirst = vi.fn();
    const closeSecond = vi.fn();

    const { rerender } = render(
      <>
        <Modal isOpen title="底层" closeOnBackdrop onClose={closeFirst}>
          底层内容
        </Modal>
        <Modal isOpen title="顶层" closeOnBackdrop onClose={closeSecond}>
          顶层内容
        </Modal>
      </>
    );

    const firstDialog = screen
      .getByRole("heading", { name: "底层", hidden: true })
      .closest<HTMLElement>("[role='dialog']") as HTMLElement;
    const secondDialog = screen.getByRole("dialog", { name: "顶层" });
    const firstBackdrop = firstDialog.parentElement as HTMLElement;
    const secondBackdrop = screen.getByRole("dialog", { name: "顶层" })
      .parentElement as HTMLElement;

    expect(firstDialog).not.toHaveAttribute("aria-modal");
    expect(firstDialog).toHaveAttribute("aria-hidden", "true");
    expect(firstDialog).toHaveAttribute("inert");
    expect(secondDialog).toHaveAttribute("aria-modal", "true");
    expect(secondDialog).not.toHaveAttribute("aria-hidden");
    expect(secondDialog).not.toHaveAttribute("inert");
    expect(within(secondDialog).getByRole("button", { name: "关闭" })).toHaveFocus();

    fireEvent.mouseDown(firstBackdrop);
    expect(closeFirst).not.toHaveBeenCalled();

    fireEvent.mouseDown(secondBackdrop);
    expect(closeSecond).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(closeSecond).toHaveBeenCalledTimes(2);
    expect(closeFirst).not.toHaveBeenCalled();

    rerender(
      <>
        <Modal isOpen title="底层" closeOnBackdrop onClose={closeFirst}>
          底层内容
        </Modal>
        <Modal isOpen={false} title="顶层" closeOnBackdrop onClose={closeSecond}>
          顶层内容
        </Modal>
      </>
    );

    const restoredFirstDialog = screen.getByRole("dialog", { name: "底层" });
    expect(restoredFirstDialog).toHaveAttribute("aria-modal", "true");
    expect(restoredFirstDialog).not.toHaveAttribute("aria-hidden");
    expect(restoredFirstDialog).not.toHaveAttribute("inert");
    await waitFor(() =>
      expect(within(restoredFirstDialog).getByRole("button", { name: "关闭" })).toHaveFocus()
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(closeFirst).toHaveBeenCalledTimes(1);
  });

  it("prioritizes a nested modal even when effects mount child-first", () => {
    const closeParent = vi.fn();
    const closeNested = vi.fn();

    render(
      <Modal isOpen title="父弹窗" onClose={closeParent}>
        <Modal isOpen title="嵌套弹窗" onClose={closeNested}>
          嵌套内容
        </Modal>
      </Modal>
    );

    const parentBackdrop = screen
      .getByRole("heading", { name: "父弹窗", hidden: true })
      .closest<HTMLElement>("[role='dialog']")?.parentElement as HTMLElement;
    const nestedBackdrop = screen.getByRole("dialog", { name: "嵌套弹窗" })
      .parentElement as HTMLElement;
    expect(Number(nestedBackdrop.style.zIndex)).toBeGreaterThan(
      Number(parentBackdrop.style.zIndex)
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(closeNested).toHaveBeenCalledTimes(1);
    expect(closeParent).not.toHaveBeenCalled();
  });

  it("keeps a Dropdown portal above its owning modal and closes it first", () => {
    const onClose = vi.fn();

    render(
      <Modal isOpen title="带下拉框" onClose={onClose}>
        <Dropdown label="模式" options={[{ value: "clock", label: "时钟" }]} />
      </Modal>
    );

    const dialog = screen.getByRole("dialog", { name: "带下拉框" });
    fireEvent.click(screen.getByRole("button", { name: "模式" }));

    const listbox = screen.getByRole("listbox");
    const menu = listbox.parentElement as HTMLElement;
    expect(menu).toHaveAttribute("data-ui-scope");
    expect(Number(menu.style.zIndex)).toBeGreaterThan(
      Number((dialog.parentElement as HTMLElement).style.zIndex)
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("button", { name: "模式" })).toHaveAttribute("aria-expanded", "false");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("places a newly opened sibling modal above an older modal's Dropdown", () => {
    const closeFirst = vi.fn();
    const closeSecond = vi.fn();
    const renderOverlays = (secondOpen: boolean) => (
      <>
        <Modal isOpen title="原弹窗" onClose={closeFirst}>
          <Dropdown label="旧下拉框" options={[{ value: "clock", label: "时钟" }]} />
        </Modal>
        <Modal isOpen={secondOpen} title="新弹窗" onClose={closeSecond}>
          新弹窗内容
        </Modal>
      </>
    );
    const { rerender } = render(renderOverlays(false));

    const oldTrigger = screen.getByRole("button", { name: "旧下拉框" });
    fireEvent.click(oldTrigger);
    const menu = screen.getByRole("listbox").parentElement as HTMLElement;

    rerender(renderOverlays(true));
    const newBackdrop = screen.getByRole("dialog", { name: "新弹窗" }).parentElement as HTMLElement;
    expect(Number(newBackdrop.style.zIndex)).toBeGreaterThan(Number(menu.style.zIndex));

    fireEvent.keyDown(document, { key: "Escape" });
    expect(closeSecond).toHaveBeenCalledTimes(1);
    expect(closeFirst).not.toHaveBeenCalled();
    expect(oldTrigger).toHaveAttribute("aria-expanded", "true");
  });

  it("renders left placement as a drawer", () => {
    render(
      <Modal isOpen title="抽屉" placement="left" onClose={vi.fn()}>
        抽屉内容
      </Modal>
    );

    const dialog = screen.getByRole("dialog", { name: "抽屉" });
    expect(dialog.className).toContain("modalPanelLeft");
  });

  it.each([
    ["compact", "modalBodyPaddingCompact"],
    ["none", "modalBodyPaddingNone"],
  ] as const)("applies %s body padding and a public body class", (bodyPadding, expectedClass) => {
    render(
      <Modal
        isOpen
        title={`${bodyPadding} 内容区`}
        bodyPadding={bodyPadding}
        bodyClassName="consumer-body"
        onClose={vi.fn()}
      >
        内容
      </Modal>
    );

    const body = screen
      .getByRole("dialog", { name: `${bodyPadding} 内容区` })
      .querySelector("[data-ui-modal-body]");
    expect(body?.className).toContain(expectedClass);
    expect(body).toHaveClass("consumer-body");
  });

  it("applies public footer padding and divider options", () => {
    render(
      <Modal
        isOpen
        title="紧凑底栏"
        footer={<span>底栏操作</span>}
        footerDivider
        footerPadding="compact"
        onClose={vi.fn()}
      >
        内容
      </Modal>
    );

    const footer = screen.getByText("底栏操作").closest("footer");
    expect(footer?.className).toContain("modalFooterPaddingCompact");
    expect(footer?.className).toContain("modalFooterDivider");
  });

  it("applies public surface and body divider options", () => {
    render(
      <Modal isOpen title="强表面弹窗" surface="strong" bodyDividers={false} onClose={vi.fn()}>
        强表面内容
      </Modal>
    );

    const dialog = screen.getByRole("dialog", { name: "强表面弹窗" });
    const body = dialog.querySelector("[data-ui-modal-body]");
    expect(dialog.className).toContain("modalPanelSurfaceStrong");
    expect(body?.className).toContain("modalBodyNoDividers");
  });
});
