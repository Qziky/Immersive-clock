import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { isDeveloperPagePath } from "../../utils/developerPages";
import { applyRouteSeo } from "../../utils/seo/routeSeo";

/**
 * 路由级 SEO 元数据组件
 *
 * 依据当前路由命令式地更新 <head> 中的 title、描述、canonical、
 * Open Graph / Twitter 标签与路由级 JSON-LD，确保各路由拥有唯一、
 * 自引用的元数据，且不与 index.html 的静态标签重复。
 * 开发者路由（/design-system、/debug/*）不应用 SEO。
 * 该组件不渲染任何可见内容。
 */
export function RouteSeo(): null {
  const location = useLocation();

  useEffect(() => {
    if (isDeveloperPagePath(location.pathname)) {
      return;
    }
    applyRouteSeo(location.pathname);
  }, [location.pathname]);

  return null;
}
