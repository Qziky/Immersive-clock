const PROXY_PREFIX = "/api/xiaomi-weather";
const ALLOWED_PATH_PREFIX = `${PROXY_PREFIX}/wtr-v3/`;
const UPSTREAM_ORIGIN = "https://weatherapi.market.xiaomi.com";

export default async function onRequest({ request }: { request: Request }): Promise<Response> {
  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET" } });
  }

  const url = new URL(request.url);
  if (!url.pathname.startsWith(ALLOWED_PATH_PREFIX)) {
    return new Response("Not found", { status: 404 });
  }

  const upstreamUrl = `${UPSTREAM_ORIGIN}${url.pathname.slice(PROXY_PREFIX.length)}${url.search}`;
  try {
    const upstream = await fetch(upstreamUrl, { redirect: "manual" });
    if (upstream.status >= 300 && upstream.status < 400) {
      return new Response("Weather upstream redirect rejected", { status: 502 });
    }
    const headers = new Headers({ "Cache-Control": "no-store" });
    for (const name of ["content-type", "retry-after"]) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return new Response("Weather upstream unavailable", { status: 502 });
  }
}
