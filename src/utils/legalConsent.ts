import { LEGAL_DOCUMENT_VERSION } from "../constants/legal";

export const LEGAL_CONSENT_STORAGE_KEY = "immersive-clock:legal-consent:v1";

export interface LegalConsentRecord {
  schemaVersion: 1;
  documentVersion: string;
  acceptedAt: number;
}

export function getLegalConsent(): LegalConsentRecord | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(LEGAL_CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const candidate = parsed as Partial<LegalConsentRecord>;
    if (
      candidate.schemaVersion !== 1 ||
      typeof candidate.documentVersion !== "string" ||
      typeof candidate.acceptedAt !== "number" ||
      !Number.isFinite(candidate.acceptedAt)
    ) {
      return null;
    }
    return {
      schemaVersion: 1,
      documentVersion: candidate.documentVersion,
      acceptedAt: candidate.acceptedAt,
    };
  } catch {
    return null;
  }
}

export function hasCurrentLegalConsent(): boolean {
  return getLegalConsent()?.documentVersion === LEGAL_DOCUMENT_VERSION;
}

export function saveLegalConsent(acceptedAt = Date.now()): LegalConsentRecord {
  const record: LegalConsentRecord = {
    schemaVersion: 1,
    documentVersion: LEGAL_DOCUMENT_VERSION,
    acceptedAt,
  };
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(LEGAL_CONSENT_STORAGE_KEY, JSON.stringify(record));
  }
  return record;
}

export function clearLegalConsent(): void {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(LEGAL_CONSENT_STORAGE_KEY);
  }
}
