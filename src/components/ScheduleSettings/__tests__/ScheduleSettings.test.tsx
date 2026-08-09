import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { FeedbackProvider } from "../../../ui";
import { ScheduleEditor } from "../ScheduleSettings";

function renderEditor(onRegisterSave?: (save: () => void) => void) {
  return render(
    <FeedbackProvider>
      <ScheduleEditor onRegisterSave={onRegisterSave} />
    </FeedbackProvider>
  );
}

describe("ScheduleEditor", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("重命名课程时同步更新课时引用，并通过统一保存写入 timetable", async () => {
    const user = userEvent.setup();
    let save: () => void = () => undefined;
    renderEditor((registeredSave) => {
      save = registeredSave;
    });

    await user.click(screen.getByRole("tab", { name: "课程库" }));
    const firstName = screen.getAllByLabelText("课程名称")[0];
    await user.clear(firstName);
    await user.type(firstName, "晨间数学");
    save();

    const settings = JSON.parse(localStorage.getItem("AppSettings") ?? "{}") as {
      study?: {
        timetable?: {
          document?: {
            subjects?: Array<{ name?: string }>;
            schedules?: Array<{ classes?: Array<{ subject?: string }> }>;
          };
        };
      };
    };
    expect(settings.study?.timetable?.document?.subjects?.[0]?.name).toBe("晨间数学");
    expect(settings.study?.timetable?.document?.schedules?.[0]?.classes?.[0]?.subject).toBe(
      "晨间数学"
    );
  });

  it("严格拒绝无效 CSES YAML，且不覆盖当前草稿", async () => {
    const user = userEvent.setup();
    renderEditor();
    const input = screen.getByLabelText("CSES YAML 文件");
    await user.upload(input, new File(["version: 1\nsubjects: []"], "invalid.yaml"));

    expect(await screen.findByText("导入被拒绝")).toBeInTheDocument();
    expect(screen.getByText("仅支持 CSES v2")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "课程库" }));
    expect(screen.getAllByLabelText("课程名称")[0]).toHaveValue("第1节自习");
  });

  it("有效 YAML 先预览，再由用户应用到草稿并保留本地锚点", async () => {
    const user = userEvent.setup();
    renderEditor();
    const yaml = `
version: 2
configuration:
  name: 导入课表
  description: 测试导入
  cycle:
    work_count: 5
    rest_count: 2
    spans:
      - activity: work
        count: 5
      - activity: rest
        count: 2
subjects:
  - name: 物理
schedules:
  - name: 周一
    enable_day: [1]
    classes:
      - subject: 物理
        start_time: "08:00:00"
        end_time: "08:45:00"
`;
    await user.upload(screen.getByLabelText("CSES YAML 文件"), new File([yaml], "valid.yaml"));

    expect(await screen.findByText("文件校验通过")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "覆盖当前草稿" }));
    await user.click(screen.getByRole("tab", { name: "课程库" }));
    await waitFor(() => expect(screen.getByLabelText("课程名称")).toHaveValue("物理"));
    await user.click(screen.getByRole("tab", { name: "周期与锚点" }));
    expect(screen.getByLabelText("周期锚点")).toHaveValue("2000-01-03");
  });
});
