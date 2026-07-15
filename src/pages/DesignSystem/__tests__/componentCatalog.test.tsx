import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import * as ui from "../../../ui";
import {
  COMPONENT_CATALOG,
  COMPONENT_CATALOG_SECTIONS,
  getCatalogPublicExports,
  getCatalogStateCoverage,
} from "../componentCatalog";
import { DesignSystemPage } from "../DesignSystemPage";

function findDuplicates(values: readonly string[]) {
  return values.filter((value, index) => values.indexOf(value) !== index);
}

describe("component catalog contract", () => {
  it("精确登记 src/ui 的全部运行时导出", () => {
    const catalogExports = getCatalogPublicExports().sort();
    const runtimeExports = Object.keys(ui).sort();

    expect(findDuplicates(catalogExports)).toEqual([]);
    expect(catalogExports).toEqual(runtimeExports);
  });

  it("条目与示例 ID 全局唯一", () => {
    const entryIds = COMPONENT_CATALOG.map((entry) => entry.id);
    const exampleIds = COMPONENT_CATALOG.flatMap((entry) =>
      entry.examples.map((example) => example.id)
    );

    expect(findDuplicates(entryIds)).toEqual([]);
    expect(findDuplicates(exampleIds)).toEqual([]);
  });

  it("每个必需状态都由真实示例声明覆盖", () => {
    for (const entry of COMPONENT_CATALOG) {
      const coverage = getCatalogStateCoverage(entry);
      const missingStates = entry.requiredStates.filter((state) => !coverage.has(state));

      expect(missingStates, `${entry.id} 缺少状态示例`).toEqual([]);
      expect(entry.examples.length, `${entry.id} 必须包含确定性示例`).toBeGreaterThan(0);
    }
  });

  it("基础设施、常量与上下文导出登记覆盖关系和原因", () => {
    const entryIds = new Set(COMPONENT_CATALOG.map((entry) => entry.id));

    for (const entry of COMPONENT_CATALOG) {
      for (const coveredBy of entry.coveredBy ?? []) {
        expect(entryIds.has(coveredBy), `${entry.id} 引用了不存在的 ${coveredBy}`).toBe(true);
      }

      const requiresCoverageReason =
        entry.kind === "infrastructure" ||
        entry.kind === "constant" ||
        entry.publicExports.includes("FeedbackProvider") ||
        entry.publicExports.includes("useFeedback");

      if (requiresCoverageReason) {
        expect(entry.coveredBy?.length, `${entry.id} 缺少 coveredBy`).toBeGreaterThan(0);
        expect(entry.reason?.trim(), `${entry.id} 缺少覆盖原因`).toBeTruthy();
      }
    }
  });

  it("DesignSystemPage 完全渲染 Catalog 中的条目与示例", () => {
    const { container } = render(<DesignSystemPage />);

    expect(container.querySelectorAll("[data-catalog-entry]")).toHaveLength(
      COMPONENT_CATALOG.length
    );
    expect(container.querySelectorAll("[data-catalog-example]")).toHaveLength(
      COMPONENT_CATALOG.flatMap((entry) => entry.examples).length
    );

    for (const section of COMPONENT_CATALOG_SECTIONS) {
      expect(container.querySelector(`#${section.id}`)).not.toBeNull();
    }
  });
});
