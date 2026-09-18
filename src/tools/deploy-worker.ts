type AssetsBinding = {
  fetch: (request: Request) => Promise<Response>
}

type WorkerEnv = {
  ASSETS: AssetsBinding
}

const BASE_PATH = '/baba'
const ENTRY_PATH = '/baba-is-you'

// Workers assets 对 `*.html` 有 canonical 重定向（`/x.html` → `/x`），
// 取资源必须走无扩展名形式，否则 307 会把请求带出 `/baba` 路由。
const assetPath = (relativePath: string) =>
  relativePath.endsWith('.html') ? relativePath.slice(0, -'.html'.length) : relativePath

const serveApp = async (request: Request, env: WorkerEnv): Promise<Response> => {
  const url = new URL(request.url)
  if (url.pathname !== BASE_PATH && !url.pathname.startsWith(`${BASE_PATH}/`)) {
    return new Response('not_found', { status: 404 })
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('method_not_allowed', { status: 405 })
  }

  const relativePath = url.pathname.slice(BASE_PATH.length) || '/'
  url.pathname = relativePath === '/' ? ENTRY_PATH : assetPath(relativePath)
  let response = await env.ASSETS.fetch(new Request(url.toString(), request))
  if (!response.ok && relativePath !== '/') {
    url.pathname = ENTRY_PATH
    response = await env.ASSETS.fetch(new Request(url.toString(), request))
  }
  if (!response.ok) return response

  const headers = new Headers(response.headers)
  headers.set('Cache-Control', 'public, max-age=300, s-maxage=600, stale-while-revalidate=300')
  return new Response(response.body, { status: response.status, headers })
}

export default { fetch: (request: Request, env: WorkerEnv) => serveApp(request, env) }
