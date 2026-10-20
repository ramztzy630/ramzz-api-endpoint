import path from 'node:path'
import sharp from 'sharp'
import { renderIqc, renderTtqc, renderWindows } from '../lib/canvas.js'

const MAX_TEXT = 300
const MAX_IMAGE = 5 * 1024 * 1024
const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...CORS_HEADERS
  })
  res.end(JSON.stringify(body))
}

const nowTime = () =>
  new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }).replace(':', '.')

async function fetchImageSafe(raw) {
  const url = new URL(raw)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('hanya http dan https')
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(10000), headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  if (!(res.headers.get('content-type') || '').startsWith('image/')) throw new Error('bukan gambar')
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > MAX_IMAGE) throw new Error('gambar terlalu besar')
  return buf
}

async function loadPhoto(url, base64, warnings, label) {
  try {
    let buf = null
    if (base64) buf = Buffer.from(String(base64).replace(/^data:[^,]+,/, ''), 'base64')
    else if (url) buf = await fetchImageSafe(url)
    if (!buf) return null
    if (buf.length > MAX_IMAGE) throw new Error('gambar terlalu besar')
    await sharp(buf).metadata()
    return buf
  } catch (err) {
    warnings.push(`${label} tidak dipakai: ${err.message}`)
    return null
  }
}

export const handleIqc = async (p) => {
  const warnings = []
  const image = await loadPhoto(p.image, p.image_base64, warnings, 'image')
  const time = /^\d{1,2}[.:]\d{2}$/.test(p.time || '') ? p.time.replace(':', '.') : nowTime()
  return { png: await renderIqc({ text: p.text, time, image }), warnings }
}

export const handleTtqc = async (p) => {
  const warnings = []
  const avatar = await loadPhoto(p.avatar, p.avatar_base64, warnings, 'avatar')
  const name = (p.name || 'User').trim().slice(0, 40) || 'User'
  return { png: await renderTtqc({ name, text: p.text, avatar }), warnings }
}

export const handleWindows = async (p) => ({
  png: await renderWindows({ text: p.text }),
  warnings: []
})

const routes = {
  '/canvas/iqc': handleIqc,
  '/iqc': handleIqc,
  '/canvas/ttqc': handleTtqc,
  '/ttqc': handleTtqc,
  '/canvas/windows': handleWindows,
  '/windows': handleWindows
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(200, CORS_HEADERS)
    return res.end()
  }

  try {
    const url = new URL(req.url || '/', `http://${req.headers['x-forwarded-host'] || req.headers.host || 'localhost'}`)
    const pathname = url.pathname.replace(/\/+$/, '') || '/'

    if (pathname === '' || pathname === '/' || pathname === '/api') {
      return sendJson(res, 200, {
        status: true,
        message: 'Canvas API Serverless (Vercel) Online!',
        endpoints: ['/canvas/iqc', '/canvas/ttqc', '/canvas/windows']
      })
    }

    let cleanPath = pathname
    if (cleanPath.startsWith('/api')) {
      cleanPath = cleanPath.slice(4) || '/'
    }

    const route = routes[cleanPath] || routes[pathname]
    if (!route) {
      return sendJson(res, 404, { status: false, message: `Endpoint ${pathname} tidak ditemukan` })
    }

    if (!['GET', 'POST'].includes(req.method)) {
      return sendJson(res, 405, { status: false, message: 'Metode tidak didukung' })
    }

    let params = Object.fromEntries(url.searchParams)
    if (req.method === 'POST') {
      let bodyData = req.body
      if (typeof bodyData === 'string' && bodyData) {
        try { bodyData = JSON.parse(bodyData) } catch {}
      } else if (!bodyData) {
        const chunks = []
        for await (const chunk of req) chunks.push(chunk)
        const raw = Buffer.concat(chunks).toString('utf8')
        if (raw) {
          try { bodyData = JSON.parse(raw) } catch {}
        }
      }
      if (bodyData && typeof bodyData === 'object') {
        Object.assign(params, bodyData)
      }
    }

    const text = String(params.text ?? '').trim()
    if (!text) return sendJson(res, 400, { status: false, message: 'parameter text wajib diisi' })
    if (text.length > MAX_TEXT) return sendJson(res, 400, { status: false, message: `text maksimal ${MAX_TEXT} karakter` })
    params.text = text

    const { png, warnings } = await route(params)
    const headers = { 'Content-Type': 'image/png', 'Cache-Control': 'no-store', ...CORS_HEADERS }
    if (warnings.length) headers['X-Warning'] = encodeURIComponent(warnings.join('; '))
    res.writeHead(200, headers)
    res.end(png)
  } catch (err) {
    console.error('[vercel-api error]:', err)
    if (!res.headersSent) {
      sendJson(res, 500, { status: false, message: err.message || 'Terjadi kesalahan di server' })
    }
  }
}
