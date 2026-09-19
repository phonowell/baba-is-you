import assert from 'node:assert/strict'
import test from 'node:test'

import worker from './deploy-worker.js'

type AssetsFetch = (request: Request) => Promise<Response>

const serveFromAssets: AssetsFetch = (request) => {
  const { pathname } = new URL(request.url)
  if (pathname === '/baba-is-you') return Promise.resolve(new Response('<html>shell</html>'))
  if (pathname === '/baba-is-you.js') return Promise.resolve(new Response('bundle'))
  return Promise.resolve(new Response('missing', { status: 404 }))
}

const createEnv = (fetchImpl: AssetsFetch) => ({ ASSETS: { fetch: fetchImpl } })

const get = (path: string, headers: Record<string, string> = {}, method = 'GET') =>
  worker.fetch(
    new Request(`https://auvya.com${path}`, { method, headers }),
    createEnv(serveFromAssets),
  )

test('deploy worker serves the shell entry under /baba', async () => {
  const response = await get('/baba')
  assert.equal(response.status, 200)
  assert.equal(await response.text(), '<html>shell</html>')
})

test('deploy worker serves the bundle to same-origin subresource requests', async () => {
  const response = await get('/baba/baba-is-you.js', { 'sec-fetch-site': 'same-origin' })
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'bundle')
})

test('deploy worker rejects the bundle without a same-origin fetch site', async () => {
  for (const site of ['cross-site', 'same-site', 'none']) {
    const response = await get('/baba/baba-is-you.js', { 'sec-fetch-site': site })
    assert.equal(response.status, 403, `sec-fetch-site: ${site}`)
  }
})

test('deploy worker rejects the bundle when the header is absent', async () => {
  let assetsCalled = false
  const env = {
    ASSETS: {
      fetch: (request: Request) => {
        assetsCalled = true
        return serveFromAssets(request)
      },
    },
  }
  const response = await worker.fetch(
    new Request('https://auvya.com/baba/baba-is-you.js'),
    env,
  )
  assert.equal(response.status, 403)
  assert.equal(assetsCalled, false)
})

test('deploy worker marks the gated bundle as privately cacheable only', async () => {
  const response = await get('/baba/baba-is-you.js', { 'sec-fetch-site': 'same-origin' })
  assert.equal(response.headers.get('cache-control'), 'private, max-age=300')
  assert.equal(response.headers.get('vary'), 'sec-fetch-site')
})

test('deploy worker limits framing to same origin', async () => {
  const response = await get('/baba')
  assert.equal(response.headers.get('content-security-policy'), "frame-ancestors 'self'")
})

test('deploy worker still falls back to the entry for unknown paths', async () => {
  const response = await get('/baba/anything')
  assert.equal(response.status, 200)
  assert.equal(await response.text(), '<html>shell</html>')
})

test('deploy worker rejects paths outside /baba and non-GET methods', async () => {
  assert.equal((await get('/elsewhere')).status, 404)
  assert.equal((await get('/baba', {}, 'POST')).status, 405)
})
