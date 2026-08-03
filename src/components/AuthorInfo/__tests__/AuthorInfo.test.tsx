import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AuthorInfo } from "../AuthorInfo";

describe("AuthorInfo", () => {
  it("展示 Qziky 并链接到当前项目仓库", () => {
    render(<AuthorInfo />);

    expect(screen.getByRole("link", { name: "Qziky" })).toHaveAttribute(
      "href",
      "https://github.com/Qziky/Immersive-clock"
    );
  });

  it("点击版本号时触发公告回调", () => {
    const onVersionClick = vi.fn();
    render(<AuthorInfo onVersionClick={onVersionClick} />);

    fireEvent.click(screen.getByRole("button", { name: /点击查看更新公告/ }));

    expect(onVersionClick).toHaveBeenCalledTimes(1);
  });
});
