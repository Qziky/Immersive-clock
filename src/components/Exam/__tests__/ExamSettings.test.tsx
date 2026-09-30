import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_EXAM } from "../../../utils/exam";
import { ExamSettings } from "../ExamSettings";

describe("考试设置", () => {
  it("自定义选项聚焦科目输入并保留时长，填写后可保存并重新识别", async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockResolvedValue(undefined);
    const { unmount } = render(
      <ExamSettings initial={DEFAULT_EXAM.config} onSave={save} onClose={() => {}} />
    );
    await user.click(screen.getByRole("button", { name: "物理 · 75分" }));
    await user.click(screen.getByRole("button", { name: "自定义" }));
    const subject = screen.getByLabelText("考试科目");
    expect(subject).toHaveFocus();
    expect(subject).toHaveValue("");
    expect(screen.getByLabelText("小时")).toHaveValue(1);
    expect(screen.getByLabelText("分钟")).toHaveValue(15);
    await user.type(subject, "综合能力测试");
    await user.click(screen.getByRole("button", { name: "自定义" }));
    expect(subject).toHaveValue("综合能力测试");
    await user.click(screen.getByRole("button", { name: "开始考试" }));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "综合能力测试", minutes: 75 })
    );
    unmount();
    render(
      <ExamSettings
        initial={{ ...DEFAULT_EXAM.config, subject: "综合能力测试", minutes: 75 }}
        onSave={save}
        onClose={() => {}}
      />
    );
    expect(screen.getByRole("button", { name: "自定义" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "语文 · 150分" }));
    expect(screen.getByRole("button", { name: "自定义" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByLabelText("考试科目")).toHaveValue("语文");
  });

  it("重开固定时间段默认新的有效日期，修改立即开始时长后使用新的建议结束时间", async () => {
    const user = userEvent.setup();
    render(
      <ExamSettings
        initial={{ ...DEFAULT_EXAM.config, kind: "scheduled" }}
        onSave={vi.fn()}
        onClose={() => {}}
      />
    );
    const start = screen.getByLabelText("开始时间") as HTMLInputElement;
    const end = screen.getByLabelText("结束时间") as HTMLInputElement;
    expect(Date.parse(end.value) - Date.parse(start.value)).toBe(150 * 60000);
    await user.selectOptions(screen.getByLabelText("开始方式"), "immediate");
    fireEvent.change(screen.getByLabelText("小时"), { target: { value: "0" } });
    await user.selectOptions(screen.getByLabelText("开始方式"), "scheduled");
    expect(
      Date.parse((screen.getByLabelText("结束时间") as HTMLInputElement).value) -
        Date.parse((screen.getByLabelText("开始时间") as HTMLInputElement).value)
    ).toBe(30 * 60000);
  });
  it("预设填入科目和时长，允许自定义名称并提交", async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockResolvedValue(undefined);
    render(<ExamSettings initial={DEFAULT_EXAM.config} onSave={save} onClose={() => {}} />);
    await user.click(screen.getByRole("button", { name: "物理 · 75分" }));
    expect(screen.getByLabelText("小时")).toHaveValue(1);
    expect(screen.getByLabelText("分钟")).toHaveValue(15);
    await user.clear(screen.getByLabelText("考试科目"));
    await user.type(screen.getByLabelText("考试科目"), "物理周测");
    fireEvent.submit(screen.getByLabelText("考试科目").closest("form")!);
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "物理周测", minutes: 75 })
    );
  });
  it("阻止越界分钟、空科目和零时长提交", async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockResolvedValue(undefined);
    render(<ExamSettings initial={DEFAULT_EXAM.config} onSave={save} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("分钟"), { target: { value: "60" } });
    await user.click(screen.getByRole("button", { name: "开始考试" }));
    expect(screen.getByRole("alert")).toHaveTextContent("分钟须为 0 至 59");
    fireEvent.change(screen.getByLabelText("分钟"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("小时"), { target: { value: "0" } });
    await user.click(screen.getByRole("button", { name: "开始考试" }));
    expect(screen.getByRole("alert")).toHaveTextContent("时长");
    await user.clear(screen.getByLabelText("考试科目"));
    await user.click(screen.getByRole("button", { name: "开始考试" }));
    expect(screen.getByRole("alert")).toHaveTextContent("请输入考试科目");
    expect(save).not.toHaveBeenCalled();
  });
  it("固定时间段自动建议结束时间，手动覆盖后不随预设变化", async () => {
    const user = userEvent.setup();
    render(<ExamSettings initial={DEFAULT_EXAM.config} onSave={vi.fn()} onClose={() => {}} />);
    await user.selectOptions(screen.getByLabelText("开始方式"), "scheduled");
    fireEvent.change(screen.getByLabelText("开始时间"), { target: { value: "2099-01-01T09:00" } });
    expect(screen.getByLabelText("结束时间")).toHaveValue("2099-01-01T11:30");
    await user.click(screen.getByRole("button", { name: "数学 · 120分" }));
    expect(screen.getByLabelText("结束时间")).toHaveValue("2099-01-01T11:00");
    fireEvent.change(screen.getByLabelText("结束时间"), { target: { value: "2099-01-01T12:00" } });
    await user.click(screen.getByRole("button", { name: "物理 · 75分" }));
    fireEvent.change(screen.getByLabelText("开始时间"), { target: { value: "2099-01-01T10:00" } });
    expect(screen.getByLabelText("结束时间")).toHaveValue("2099-01-01T12:00");
  });
});
