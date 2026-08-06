import { beforeEach, describe, expect, it } from "vitest";

import { LEGAL_DOCUMENT_VERSION } from "../../constants/legal";
import {
  LEGAL_CONSENT_STORAGE_KEY,
  clearLegalConsent,
  getLegalConsent,
  hasCurrentLegalConsent,
  saveLegalConsent,
} from "../legalConsent";

describe("legalConsent", () => {
  beforeEach(() => localStorage.clear());

  it("保存当前文档版本和同意时间", () => {
    expect(saveLegalConsent(1_786_000_000_000)).toEqual({
      schemaVersion: 1,
      documentVersion: LEGAL_DOCUMENT_VERSION,
      acceptedAt: 1_786_000_000_000,
    });
    expect(getLegalConsent()).toEqual({
      schemaVersion: 1,
      documentVersion: LEGAL_DOCUMENT_VERSION,
      acceptedAt: 1_786_000_000_000,
    });
    expect(hasCurrentLegalConsent()).toBe(true);
  });

  it("拒绝无效记录和过期文档版本", () => {
    localStorage.setItem(LEGAL_CONSENT_STORAGE_KEY, "{bad");
    expect(getLegalConsent()).toBeNull();

    localStorage.setItem(
      LEGAL_CONSENT_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 1, documentVersion: "2025-01-01", acceptedAt: 1 })
    );
    expect(hasCurrentLegalConsent()).toBe(false);
  });

  it("可以清除设备级同意记录", () => {
    saveLegalConsent(1);
    clearLegalConsent();
    expect(localStorage.getItem(LEGAL_CONSENT_STORAGE_KEY)).toBeNull();
  });
});
