import { Link } from "react-router-dom";

import type { LegalDocumentDefinition } from "../../constants/legal";
import { LEGAL_DOCUMENTS } from "../../constants/legal";
import { Button, Inline } from "../../ui";

import styles from "./LegalDocumentPage.module.css";

interface LegalDocumentPageProps {
  document: LegalDocumentDefinition;
}

export function LegalDocumentPage({ document }: LegalDocumentPageProps) {
  return (
    <main className={styles.page} data-ui-root>
      <article className={styles.document} data-legal-document={document.key}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>沉浸式时钟 · 法律与隐私</p>
          <h1>{document.title}</h1>
          <p>{document.summary}</p>
          <Inline gap="sm" wrap>
            {Object.values(LEGAL_DOCUMENTS).map((item) => (
              <Link
                key={item.key}
                className={item.key === document.key ? styles.currentLink : styles.documentLink}
                to={item.path}
              >
                {item.title}
              </Link>
            ))}
          </Inline>
        </header>
        <div className={styles.content} dangerouslySetInnerHTML={{ __html: document.html }} />
        <footer className={styles.footer}>
          <Button variant="secondary" onClick={() => window.location.assign("/")}>
            返回应用
          </Button>
        </footer>
      </article>
    </main>
  );
}
