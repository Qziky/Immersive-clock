import type { ReactNode } from "react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { LEGAL_DOCUMENTS, getLegalDocumentByPath } from "../../constants/legal";
import { initializeClarityIfAllowed } from "../../services/clarityAnalytics";
import { Button, Checkbox, Inline, Modal, Stack } from "../../ui";
import { hasCurrentLegalConsent, saveLegalConsent } from "../../utils/legalConsent";

import styles from "./LegalConsentGate.module.css";

const LegalDocumentPage = lazy(() =>
  import("./LegalDocumentPage").then((module) => ({ default: module.LegalDocumentPage }))
);

interface LegalConsentGateProps {
  children: ReactNode;
}

const CONSENT_DOCUMENTS = [LEGAL_DOCUMENTS.terms, LEGAL_DOCUMENTS.privacy];

function LegalDocumentLoadingFallback() {
  return (
    <main className={styles.legalPageLoading} data-ui-root>
      <p role="status">正在加载法律文档…</p>
    </main>
  );
}

function LegalDocumentLinks() {
  return (
    <span className={styles.documentLinks}>
      <Link to={LEGAL_DOCUMENTS.terms.path}>《用户使用协议》</Link>
      <Link to={LEGAL_DOCUMENTS.privacy.path}>《隐私政策》</Link>
    </span>
  );
}

export function LegalConsentGate({ children }: LegalConsentGateProps) {
  const { pathname } = useLocation();
  const legalDocument = getLegalDocumentByPath(pathname);
  const declineButtonRef = useRef<HTMLButtonElement>(null);
  const [accepted, setAccepted] = useState(hasCurrentLegalConsent);
  const [acknowledged, setAcknowledged] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [showDialog, setShowDialog] = useState(true);
  const [suppressInitialFocusRing, setSuppressInitialFocusRing] = useState(true);

  useEffect(() => {
    if (accepted) void initializeClarityIfAllowed();
  }, [accepted]);

  const handleAccept = useCallback(() => {
    saveLegalConsent();
    setAccepted(true);
    setShowDialog(false);
    void initializeClarityIfAllowed();
  }, []);

  if (legalDocument) {
    return (
      <Suspense fallback={<LegalDocumentLoadingFallback />}>
        <LegalDocumentPage document={legalDocument} />
      </Suspense>
    );
  }
  if (accepted) return <>{children}</>;

  return (
    <main className={styles.gate} data-ui-root>
      {blocked ? (
        <section className={styles.blockedCard} aria-labelledby="legal-consent-blocked-title">
          <Stack gap="lg">
            <div>
              <p className={styles.eyebrow}>沉浸式时钟</p>
              <h1 id="legal-consent-blocked-title">暂时无法继续使用</h1>
              <p>
                你尚未同意《用户使用协议》和《隐私政策》，因此应用功能暂不可用。你仍可阅读公开文档，并在准备好后重新选择。
              </p>
            </div>
            <LegalDocumentLinks />
            <Inline gap="sm" wrap>
              <Button
                variant="primary"
                onClick={() => {
                  setSuppressInitialFocusRing(true);
                  setShowDialog(true);
                }}
              >
                重新阅读并选择
              </Button>
              <Link className={styles.textLink} to={LEGAL_DOCUMENTS.privacy.path}>
                查看隐私政策
              </Link>
            </Inline>
          </Stack>
        </section>
      ) : null}

      <Modal
        isOpen={showDialog}
        title="在开始使用前"
        width="md"
        surface="strong"
        showCloseButton={false}
        closeOnBackdrop={false}
        closeOnEscape={false}
        initialFocusRef={declineButtonRef}
        bodyPadding="compact"
        footerPadding="compact"
        onClose={() => undefined}
        footer={
          <div className={styles.modalFooter}>
            <Button
              ref={declineButtonRef}
              className={suppressInitialFocusRing ? styles.initialFocusButton : undefined}
              size="sm"
              variant="secondary"
              onBlur={() => setSuppressInitialFocusRing(false)}
              onClick={() => {
                setShowDialog(false);
                setBlocked(true);
              }}
            >
              不同意
            </Button>
            <Button size="sm" variant="primary" disabled={!acknowledged} onClick={handleAccept}>
              同意并进入
            </Button>
          </div>
        }
      >
        <Stack gap="md">
          <p className={styles.intro}>请阅读以下协议后勾选确认。</p>
          <div
            className={styles.documentViewer}
            role="region"
            aria-label="用户使用协议和隐私政策全文"
            tabIndex={0}
          >
            {CONSENT_DOCUMENTS.map((document) => (
              <article
                className={styles.documentText}
                data-consent-document={document.key}
                key={document.key}
                dangerouslySetInnerHTML={{ __html: document.html }}
              />
            ))}
          </div>
          <Checkbox
            checked={acknowledged}
            label={
              <span>
                我已阅读并同意
                <Link className={styles.consentLink} to={LEGAL_DOCUMENTS.terms.path}>
                  《用户使用协议》
                </Link>
                和
                <Link className={styles.consentLink} to={LEGAL_DOCUMENTS.privacy.path}>
                  《隐私政策》
                </Link>
                ，并知悉用户体验改进计划默认开启。
              </span>
            }
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
        </Stack>
      </Modal>
    </main>
  );
}
