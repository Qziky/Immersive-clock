import { useState } from "react";

import { Badge, Button, Inline, Stack } from "../../ui";

import {
  COMPONENT_CATALOG_SECTIONS,
  getCatalogEntriesBySection,
  getCatalogPublicExports,
  type ComponentCatalogKind,
  type ComponentCatalogSection,
} from "./componentCatalog";
import styles from "./DesignSystemPage.module.css";

const KIND_LABELS: Record<ComponentCatalogKind, string> = {
  visual: "视觉组件",
  foundation: "设计基础",
  behavior: "交互行为",
  infrastructure: "基础设施",
  constant: "运行时常量",
};

const KIND_BADGES: Record<ComponentCatalogKind, "neutral" | "accent" | "success" | "warning"> = {
  visual: "accent",
  foundation: "neutral",
  behavior: "success",
  infrastructure: "warning",
  constant: "neutral",
};

function DesignSystemPage() {
  const [activeSection, setActiveSection] = useState<ComponentCatalogSection>("foundation");
  const publicExportCount = getCatalogPublicExports().length;

  const scrollToSection = (section: ComponentCatalogSection) => {
    setActiveSection(section);
    const target = document.getElementById(section);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className={styles.page} data-ui-root>
      <aside className={styles.sidebar} aria-label="组件分类">
        <Stack gap="lg">
          <Stack gap="sm">
            <Badge variant="accent">src/ui</Badge>
            <h1>组件规范</h1>
            <p className={styles.muted}>
              所有公共导出、公开状态和基础设施覆盖关系都由同一份 Catalog 登记。
            </p>
          </Stack>
          <nav className={styles.nav} aria-label="展厅分区">
            {COMPONENT_CATALOG_SECTIONS.map((section) => (
              <Button
                className={styles.navButton}
                key={section.id}
                size="sm"
                variant={activeSection === section.id ? "primary" : "ghost"}
                aria-current={activeSection === section.id ? "page" : undefined}
                onClick={() => scrollToSection(section.id)}
              >
                {section.label}
              </Button>
            ))}
          </nav>
        </Stack>
      </aside>

      <section className={styles.content} aria-label="组件示例">
        <header className={styles.header}>
          <Stack gap="xs">
            <span className={styles.kicker}>Immersive Clock UI</span>
            <h2>公共组件总览</h2>
            <p className={styles.muted}>
              Catalog 当前登记 {publicExportCount} 个运行时导出；每个示例都调用真实公共 API。
            </p>
          </Stack>
          <Inline justify="flex-end">
            <Badge variant="success" icon="status.success">
              Catalog 驱动
            </Badge>
            <Badge variant="neutral">确定性示例</Badge>
          </Inline>
        </header>

        {COMPONENT_CATALOG_SECTIONS.map((section) => {
          const entries = getCatalogEntriesBySection(section.id);

          return (
            <section
              className={styles.section}
              data-catalog-section={section.id}
              id={section.id}
              key={section.id}
            >
              <header className={styles.sectionHeader}>
                <div>
                  <h2>{section.label}</h2>
                  <p>{section.description}</p>
                </div>
                <Badge>{entries.length} 项</Badge>
              </header>

              <div className={styles.componentList}>
                {entries.map((entry) => (
                  <article
                    className={styles.componentBlock}
                    data-catalog-entry={entry.id}
                    key={entry.id}
                  >
                    <header className={styles.componentHeader}>
                      <Stack gap="xs">
                        <Inline gap="sm">
                          <h3>{entry.title}</h3>
                          <Badge variant={KIND_BADGES[entry.kind]}>{KIND_LABELS[entry.kind]}</Badge>
                        </Inline>
                        <p className={styles.muted}>{entry.description}</p>
                      </Stack>
                      {entry.publicExports.length > 0 && (
                        <div className={styles.exportList} aria-label="公共导出">
                          {entry.publicExports.map((exportName) => (
                            <code key={exportName}>{exportName}</code>
                          ))}
                        </div>
                      )}
                    </header>

                    {entry.reason && (
                      <p className={styles.coverageNote}>
                        <strong>覆盖说明：</strong>
                        {entry.reason}
                        {entry.coveredBy?.length ? ` 关联 ${entry.coveredBy.join("、")}。` : ""}
                      </p>
                    )}

                    <div className={styles.exampleList}>
                      {entry.examples.map((example) => {
                        const Example = example.component;

                        return (
                          <section
                            className={styles.example}
                            data-catalog-example={example.id}
                            key={example.id}
                            aria-label={`${entry.title}：${example.label}`}
                          >
                            <header className={styles.exampleHeader}>
                              <div>
                                <h4>{example.label}</h4>
                                {example.description && <p>{example.description}</p>}
                              </div>
                              <div className={styles.stateList} aria-label="覆盖状态">
                                {example.covers.map((state) => (
                                  <code key={state}>{state}</code>
                                ))}
                              </div>
                            </header>
                            <div className={styles.exampleCanvas}>
                              <Example />
                            </div>
                          </section>
                        );
                      })}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </section>
    </main>
  );
}

export { DesignSystemPage };
