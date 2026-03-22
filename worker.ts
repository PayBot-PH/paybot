/**
 * Cloudflare Worker — API proxy + static asset server
 *
 * Requests to /api/* are forwarded to the backend specified by the
 * BACKEND_URL environment variable (set as a Cloudflare Workers secret or
 * in the Workers dashboard under Settings → Variables).
 *
 * All other requests are served from the static assets bundled during build
 * (see wrangler.jsonc → assets.directory).
 *
 * Required Cloudflare Workers secret / variable:
 *   BACKEND_URL — the public URL of your backend, e.g. https://paybot.railway.app
 */

export interface Env {
  BACKEND_URL?: string;
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      return proxyToBackend(request, url, env);
    }

    // Serve the React SPA for all non-API paths
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

async function proxyToBackend(
  request: Request,
  url: URL,
  env: Env,
): Promise<Response> {
  const backendUrl = (env.BACKEND_URL ?? '').replace(/\/$/, '');
  if (!backendUrl) {
    return new Response(
      JSON.stringify({ error: 'BACKEND_URL is not configured on Cloudflare Workers.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const targetUrl = `${backendUrl}${url.pathname}${url.search}`;

  // Forward all headers except `host` (must match the target origin)
  const headers = new Headers(request.headers);
  headers.delete('host');

  return fetch(targetUrl, {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.clone().body,
    redirect: 'follow',
  });
}
