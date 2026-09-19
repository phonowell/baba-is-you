type AssetsBinding = {
  fetch: (request: Request) => Promise<Response>
}

type WorkerEnv = {
  ASSETS: AssetsBinding
}

const BASE_PATH = '/baba'
const ENTRY_PATH = '/baba-is-you'
const BUNDLE_SEGMENT = '/baba-is-you.js'

// Workers assets 对 `*.html` 有 canonical 重定向（`/x.html` → `/x`），
// 取资源必须走无扩展名形式，否则 307 会把请求带出 `/baba` 路由。
const assetPath = (relativePath: string) =>
  relativePath.endsWith('.html') ? relativePath.slice(0, -'.html'.length) : relativePath

const withSecurityHeaders = (response: Response, cacheControl: string): Response => {
  const headers = new Headers(response.headers)
  headers.set('Cache-Control', cacheControl)
  // 只允许同源页面嵌套，挡住外站 iframe 套壳
  headers.set('Content-Security-Policy', "frame-ancestors 'self'")
  return new Response(response.body, { status: response.status, headers })
}

// 游戏 bundle 只允许被 auvya.com 页面发起的子资源请求加载：
// 直接访问（none）、外站嵌入（cross-site/same-site）或无该头（curl 等）一律 403。
// 响应用 private + Vary，防止共享缓存把 200 泄漏给无 header 的请求。
const serveBundle = async (request: Request, env: WorkerEnv, url: URL): Promise<Response> => {
  if (request.headers.get('sec-fetch-site') !== 'same-origin') {
    return new Response('forbidden', { status: 403 })
  }
  url.pathname = BUNDLE_SEGMENT
  const response = await env.ASSETS.fetch(new Request(url.toString(), request))
  if (!response.ok) return response
  const gated = withSecurityHeaders(response, 'private, max-age=300')
  gated.headers.set('Vary', 'sec-fetch-site')
  return gated
}

const serveApp = async (request: Request, env: WorkerEnv): Promise<Response> => {
  const url = new URL(request.url)
  if (url.pathname !== BASE_PATH && !url.pathname.startsWith(`${BASE_PATH}/`)) {
    return new Response('not_found', { status: 404 })
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('method_not_allowed', { status: 405 })
  }

  const relativePath = url.pathname.slice(BASE_PATH.length) || '/'
  if (relativePath === BUNDLE_SEGMENT) return serveBundle(request, env, url)

  url.pathname = relativePath === '/' ? ENTRY_PATH : assetPath(relativePath)
  let response = await env.ASSETS.fetch(new Request(url.toString(), request))
  if (!response.ok && relativePath !== '/') {
    url.pathname = ENTRY_PATH
    response = await env.ASSETS.fetch(new Request(url.toString(), request))
  }
  if (!response.ok) return response

  return withSecurityHeaders(response, 'public, max-age=300, s-maxage=600, stale-while-revalidate=300')
}

export default { fetch: (request: Request, env: WorkerEnv) => serveApp(request, env) }
