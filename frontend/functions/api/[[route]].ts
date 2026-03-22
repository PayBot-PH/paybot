/**
 * Cloudflare Pages Function — API proxy
 *
 * All requests to /api/* are forwarded to the backend specified by the
 * BACKEND_URL environment variable set in Cloudflare Pages settings.
 *
 * Required Cloudflare Pages environment variable:
 *   BACKEND_URL — the public URL of your backend, e.g. https://paybot.railway.app
 */
export async function onRequest(context: {
  request: Request;
  env: { BACKEND_URL?: string };
}): Promise<Response> {
  const { request, env } = context;
  const url = new URL(request.url);

  const backendUrl = (env.BACKEND_URL ?? '').replace(/\/$/, '');
  if (!backendUrl) {
    return new Response(
      JSON.stringify({ error: 'BACKEND_URL is not configured on Cloudflare Pages.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const targetUrl = `${backendUrl}${url.pathname}${url.search}`;

  // Forward all headers except `host` (the host header must match the target origin)
  const headers = new Headers(request.headers);
  headers.delete('host');

  return fetch(targetUrl, {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'follow',
  });
}
