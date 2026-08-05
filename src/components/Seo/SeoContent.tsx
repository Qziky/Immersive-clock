import { useEffect, type ReactElement } from "react";
import { useLocation } from "react-router-dom";

import { isDeveloperPagePath } from "../../utils/developerPages";
import { getRouteSeo, HOME_STATIC_CONTENT_ID } from "../../utils/seo/routeSeo";

/**
 * 可爬取正文组件
 *
 * 以视觉隐藏（.sr-only）但语义完整的方式渲染当前路由的标题、简介、
 * 功能列表与 FAQ，供搜索引擎与生成式引擎（GEO）抓取事实密集的正文。
 * 该内容对读屏用户可用，不影响视觉界面。开发者路由不渲染。
 */
export function SeoContent(): ReactElement | null {
  const location = useLocation();
  const isDeveloperRoute = isDeveloperPagePath(location.pathname);
  const seo = getRouteSeo(location.pathname);

  useEffect(() => {
    if (isDeveloperRoute) {
      return;
    }
    // 移除 index.html 中的静态首页正文块，避免与本组件重复。
    document.getElementById(HOME_STATIC_CONTENT_ID)?.remove();
  }, [isDeveloperRoute]);

  if (isDeveloperRoute) {
    return null;
  }

  return (
    <section className="sr-only" aria-label="页面说明" data-seo-content>
      <h1>{seo.h1}</h1>
      <p>{seo.intro}</p>
      <h2>主要功能</h2>
      <ul>
        {seo.featureList.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
      <h2>常见问题</h2>
      {seo.faq.map((item) => (
        <div key={item.question}>
          <h3>{item.question}</h3>
          <p>{item.answer}</p>
        </div>
      ))}
    </section>
  );
}
