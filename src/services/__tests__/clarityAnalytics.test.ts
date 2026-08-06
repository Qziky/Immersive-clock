import { describe, expect, it } from "vitest";

import { isClarityEligible } from "../clarityAnalytics";

describe("clarityAnalytics eligibility", () => {
  const allowed = {
    deploymentEnabled: true,
    experienceProgramEnabled: true,
    legalConsentAccepted: true,
    production: true,
    projectId: "clarity-project",
  };

  it("只有五项启用条件全部满足时才允许 Clarity", () => {
    expect(isClarityEligible(allowed)).toBe(true);
    expect(isClarityEligible({ ...allowed, production: false })).toBe(false);
    expect(isClarityEligible({ ...allowed, deploymentEnabled: false })).toBe(false);
    expect(isClarityEligible({ ...allowed, projectId: " " })).toBe(false);
    expect(isClarityEligible({ ...allowed, legalConsentAccepted: false })).toBe(false);
    expect(isClarityEligible({ ...allowed, experienceProgramEnabled: false })).toBe(false);
  });
});
