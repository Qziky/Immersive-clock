export const PUBLIC_ROBOTS_CONTENT = "index, follow, max-image-preview:large";
export const DEVELOPER_PAGE_ROBOTS_CONTENT = "noindex, nofollow, noarchive";

const ROBOTS_META_NAMES = ["robots", "googlebot"] as const;

export function isDeveloperPagePath(pathname: string): boolean {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  return (
    normalizedPath === "/design-system" ||
    normalizedPath === "/debug" ||
    normalizedPath.startsWith("/debug/")
  );
}

export function applySearchIndexingPolicy(
  pathname: string,
  targetDocument: Document = document
): () => void {
  const content = isDeveloperPagePath(pathname)
    ? DEVELOPER_PAGE_ROBOTS_CONTENT
    : PUBLIC_ROBOTS_CONTENT;
  const previousMeta = ROBOTS_META_NAMES.map((name) => {
    const existing = targetDocument.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
    const meta = existing ?? targetDocument.createElement("meta");
    const previousContent = existing?.getAttribute("content") ?? null;

    if (!existing) {
      meta.setAttribute("name", name);
      targetDocument.head.appendChild(meta);
    }
    meta.setAttribute("content", content);

    return { meta, previousContent, wasCreated: !existing };
  });

  return () => {
    previousMeta.forEach(({ meta, previousContent, wasCreated }) => {
      if (wasCreated) {
        meta.remove();
      } else if (previousContent === null) {
        meta.removeAttribute("content");
      } else {
        meta.setAttribute("content", previousContent);
      }
    });
  };
}
