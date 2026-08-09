import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LEGAL_CONSENT_STORAGE_KEY } from "../../../utils/legalConsent";
import { LegalConsentGate } from "../LegalConsentGate";

const legalGateMocks = vi.hoisted(() => ({
  initializeClarityIfAllowed: vi.fn(async () => true),
}));

vi.mock("../../../services/clarityAnalytics", () => ({
  initializeClarityIfAllowed: legalGateMocks.initializeClarityIfAllowed,
}));

function renderGate(initialPath = "/") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <LegalConsentGate>
        <div>应用功能已挂载</div>
      </LegalConsentGate>
    </MemoryRouter>
  );
}

describe("LegalConsentGate", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("首次使用不可跳过，明确同意后才挂载应用", () => {
    renderGate();

    expect(screen.getByRole("dialog", { name: "在开始使用前" })).toBeInTheDocument();
    expect(screen.queryByText("应用功能已挂载")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "不同意" })).toHaveFocus();

    const documentViewer = screen.getByRole("region", {
      name: "用户使用协议和隐私政策全文",
    });
    expect(documentViewer).toHaveAttribute("tabindex", "0");
    expect(
      within(documentViewer).getByRole("heading", { name: "用户使用协议", level: 1 })
    ).toBeInTheDocument();
    expect(
      within(documentViewer).getByRole("heading", { name: "隐私政策", level: 1 })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "《用户使用协议》" })).toHaveAttribute(
      "href",
      "/terms"
    );
    expect(screen.getByRole("link", { name: "《隐私政策》" })).toHaveAttribute("href", "/privacy");
    expect(screen.queryByRole("link", { name: "《分析服务说明》" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toHaveAccessibleName(
      "我已阅读并同意《用户使用协议》和《隐私政策》"
    );
    expect(document.querySelector("[data-legal-document]")).toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "在开始使用前" })).toBeInTheDocument();

    const acceptButton = screen.getByRole("button", { name: "同意并进入" });
    expect(acceptButton).toBeDisabled();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /我已阅读并同意《用户使用协议》和《隐私政策》/,
      })
    );
    fireEvent.click(acceptButton);

    expect(screen.getByText("应用功能已挂载")).toBeInTheDocument();
    expect(localStorage.getItem(LEGAL_CONSENT_STORAGE_KEY)).not.toBeNull();
    expect(legalGateMocks.initializeClarityIfAllowed).toHaveBeenCalled();
  });

  it("拒绝后阻断功能并允许重新选择", () => {
    renderGate();

    fireEvent.click(screen.getByRole("button", { name: "不同意" }));
    expect(screen.getByRole("heading", { name: "暂时无法继续使用" })).toBeInTheDocument();
    expect(screen.queryByText("应用功能已挂载")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "重新阅读并选择" }));
    expect(screen.getByRole("dialog", { name: "在开始使用前" })).toBeInTheDocument();
  });

  it("未同意时按需加载并直接访问公开隐私政策", async () => {
    renderGate("/privacy");

    expect(await screen.findAllByRole("heading", { name: "隐私政策", level: 1 })).toHaveLength(2);
    expect(screen.getByText(/本隐私政策由作者制定/)).toBeInTheDocument();
    expect(
      screen.getByText(/普通页面内容的可见性取决于 Clarity 后台的屏蔽模式/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/使用页面遮罩降低暴露风险/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Qziky|1816078482@qq\.com/)).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "在开始使用前" })).not.toBeInTheDocument();
  });

  it("旧分析说明地址按需加载已合并的隐私政策", async () => {
    renderGate("/analytics");

    expect(await screen.findAllByRole("heading", { name: "隐私政策", level: 1 })).toHaveLength(2);
    expect(
      screen.getByRole("heading", { name: "4. 用户体验改进计划", level: 2 })
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "在开始使用前" })).not.toBeInTheDocument();
  });
});
