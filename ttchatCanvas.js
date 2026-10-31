// Renderer baris chat TikTok (nama, foto profil, streak, pesan, badge).
// File ini berdiri sendiri (hanya butuh sharp), dipakai bareng oleh:
//   - bot:    lib/imageApi.js, api.js, commands/ttchat.js   (taruh di lib/)
//   - vercel: api/index.js                                   (taruh di lib/)
// Aset dibaca dari ../assets/ :
//   TikTokSans-Regular.ttf + TikTokSans-Bold.ttf   (utama; font asli TikTok, gratis)
//   Inter-Regular.ttf + Inter-Bold.ttf             (cadangan 1)
//   LiberationSans-Regular.ttf + LiberationSans-Bold.ttf (cadangan 2)
//   NotoColorEmoji.ttf, streak_merah.png, streak_ungu.jpg, streak_abu.jpg
import sharp from 'sharp'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const asset = (n) => fileURLToPath(new URL(`../assets/${n}`, import.meta.url))

// ---------- pengaturan tampilan (ubah di sini kalau mau menyesuaikan) ----------
export const STYLE = {
  nameSize: 44, // nama (tebal)
  numSize: 44, // angka streak (tebal)
  msgSize: 40, // isi pesan
  timeSize: 38, // "• Baru saja"
  // Jarak antar huruf dalam em. 0 = bawaan font, -0.01 = sedikit lebih rapat, 0.01 = lebih renggang
  trackName: 0,
  trackMsg: 0,
  trackTime: 0
}

// ---------- font ----------
// Baca nama font langsung dari tabel "name" di file .ttf
function readFontNames(file) {
  const out = {}
  try {
    const b = fs.readFileSync(file)
    const tables = b.readUInt16BE(4)
    for (let i = 0; i < tables; i++) {
      const o = 12 + i * 16
      if (b.toString('latin1', o, o + 4) !== 'name') continue
      const off = b.readUInt32BE(o + 8)
      const count = b.readUInt16BE(off + 2)
      const strOff = off + b.readUInt16BE(off + 4)
      const rank = {}
      for (let j = 0; j < count; j++) {
        const r = off + 6 + j * 12
        const platform = b.readUInt16BE(r)
        const id = b.readUInt16BE(r + 6)
        if (![1, 2, 4, 6, 16, 17].includes(id)) continue
        const len = b.readUInt16BE(r + 8)
        const start = strOff + b.readUInt16BE(r + 10)
        const raw = Buffer.from(b.subarray(start, start + len))
        const wide = (platform === 3 || platform === 0) && len % 2 === 0
        const str = wide ? raw.swap16().toString('utf16le') : raw.toString('latin1')
        const score = platform === 3 ? 2 : 1
        if (!(id in rank) || score > rank[id]) {
          out[id] = str
          rank[id] = score
        }
      }
      break
    }
  } catch {}
  return out
}

function fileInfo(file) {
  try {
    const b = fs.readFileSync(file)
    return { exists: true, size: b.length, magic: b.subarray(0, 4).toString('latin1'), hex: b.subarray(0, 4).toString('hex') }
  } catch {
    return { exists: false }
  }
}

const uniq = (a) => [...new Set(a.filter(Boolean).map((x) => String(x).trim()).filter(Boolean))]

// Daftar kemungkinan nama keluarga font yang bisa dikenali Pango untuk file ini
function candidateNames(n, bold) {
  const withStyle = (fam, sty) => (fam && sty && sty !== 'Regular' ? `${fam} ${sty}` : fam)
  return uniq([
    withStyle(n[1], n[2]),
    withStyle(n[16], n[17]),
    n[1],
    n[16],
    bold && n[1] && `${n[1]} Bold`,
    bold && n[16] && `${n[16]} Bold`,
    n[4],
    n[6]
  ])
}

const PROBE_TEXT = 'Rama iya sayang 123'
async function probe(spec, file) {
  const png = await sharp({
    text: { text: PROBE_TEXT, font: `${spec} 60`, fontfile: file, dpi: 72, rgba: true }
  })
    .png()
    .toBuffer()
  return createHash('sha1').update(png).digest('hex')
}

// Cari nama font yang benar-benar terbaca: hasil render harus beda dari font cadangan bawaan Pango
async function loadFont(file, bold, avoidHash = null) {
  const names = readFontNames(file)
  const cands = candidateNames(names, bold)
  let bases
  try {
    bases = [await probe('ZzFontTidakAda', file), await probe('ZzFontTidakAda Bold', file)]
  } catch {
    return { file, names, cands, spec: cands[0] || 'sans', ok: false }
  }
  const results = []
  for (const spec of cands) {
    try {
      results.push({ spec, hash: await probe(spec, file) })
    } catch {}
  }
  const resolved = results.filter((r) => !bases.includes(r.hash))
  const best = resolved.find((r) => r.hash !== avoidHash) || resolved[0]
  if (best) return { file, names, cands, spec: best.spec, hash: best.hash, ok: true }
  return { file, names, cands, spec: cands[0] || 'sans', ok: false }
}

// Urutan prioritas: font asli TikTok, lalu Inter, lalu Liberation
const SETS = [
  { label: 'TikTok Sans', reg: 'TikTokSans-Regular.ttf', bold: 'TikTokSans-Bold.ttf' },
  { label: 'Inter', reg: 'Inter-Regular.ttf', bold: 'Inter-Bold.ttf' },
  { label: 'Liberation Sans', reg: 'LiberationSans-Regular.ttf', bold: 'LiberationSans-Bold.ttf' }
]

const reports = []
let CHOSEN = null
for (const set of SETS) {
  const regFile = asset(set.reg)
  const boldFile = asset(set.bold)
  if (!fs.existsSync(regFile) || !fs.existsSync(boldFile)) {
    reports.push({ set, regFile, boldFile, missing: true })
    continue
  }
  const reg = await loadFont(regFile, false)
  const bold = await loadFont(boldFile, true, reg?.hash)
  const ok = !!(reg?.ok && bold?.ok)
  reports.push({ set, regFile, boldFile, reg, bold, ok })
  if (ok) {
    CHOSEN = { label: set.label, reg, bold }
    break
  }
}
if (!CHOSEN) {
  CHOSEN = { label: 'sistem', reg: { spec: 'sans', file: undefined }, bold: { spec: 'sans Bold', file: undefined } }
}

export const fontStatus = {
  label: CHOSEN.label,
  preferred: CHOSEN.label === SETS[0].label, // true = pakai TikTok Sans
  fallback: CHOSEN.label === 'Liberation Sans' || CHOSEN.label === 'sistem'
}
console.log(`[ttchat] font dipakai: ${fontStatus.label}${fontStatus.preferred ? '' : ' (TikTok Sans belum terbaca/terpasang)'}`)

const FONT_EMOJI = asset('NotoColorEmoji.ttf')
if (fs.existsSync(FONT_EMOJI)) {
  await sharp({ text: { text: 'x', font: 'Noto Color Emoji 20', fontfile: FONT_EMOJI, dpi: 72, rgba: true } })
    .png()
    .toBuffer()
}

export function describeFonts() {
  const one = (label, f, file) => {
    const fi = fileInfo(file)
    if (!fi.exists) return `  ${label}: FILE TIDAK ADA`
    let kind = 'file font TTF'
    if (fi.hex === '4f54544f') kind = 'OTF (CFF)'
    else if (fi.magic === 'wOFF' || fi.magic === 'wOF2') kind = 'WEBFONT, bukan TTF (salah file)'
    else if (fi.magic === 'ttcf') kind = 'TTC (koleksi font)'
    else if (fi.hex !== '00010000' && fi.magic !== 'true') kind = 'BUKAN file font (mungkin halaman web)'
    const n = f?.names || {}
    return (
      `  ${label}: ${(fi.size / 1024).toFixed(0)} KB, header ${fi.hex}, ${kind}\n` +
      `    nama dalam file: "${n[1] || '-'}" / "${n[2] || '-'}"\n` +
      `    hasil: ${f?.ok ? `TERBACA sebagai "${f.spec}"` : 'TIDAK TERBACA oleh Pango'}`
    )
  }
  const lines = [`Font dipakai: ${fontStatus.label}`, '']
  for (const r of reports) {
    lines.push(`[${r.set.label}] ${r.missing ? 'file belum ada di assets' : r.ok ? 'OK' : 'GAGAL'}`)
    if (!r.missing) {
      lines.push(one(r.set.reg, r.reg, r.regFile))
      lines.push(one(r.set.bold, r.bold, r.boldFile))
    }
    lines.push('')
  }
  const checked = new Set(reports.map((r) => r.set.label))
  for (const set of SETS) if (!checked.has(set.label)) lines.push(`[${set.label}] tidak dicek (sudah ada yang dipakai di atasnya)`)
  return lines.join('\n').trim()
}

// ---------- gambar ----------
const K = 3 // teks dirender K kali lebih besar lalu dikecilkan supaya tajam
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const svg = (w, h, inner) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${inner}</svg>`)

// Satu baris teks -> PNG transparan (tanpa wrap, jadi lebarnya = lebar teks asli)
async function textImage(text, { size, color = '#fff', bold = false, track = 0 }) {
  const f = bold ? CHOSEN.bold : CHOSEN.reg
  const ls = track ? ` letter_spacing="${Math.round(track * size * K * 1024)}"` : ''
  const opts = {
    text: `<span foreground="${color}"${ls}>${esc(text)}</span>`,
    font: `${f.spec} ${Math.round(size * K)}`,
    dpi: 72,
    rgba: true
  }
  if (f.file) opts.fontfile = f.file
  const big = await sharp({ text: opts }).png().toBuffer()
  const meta = await sharp(big).metadata()
  const width = Math.max(1, Math.round(meta.width / K))
  const height = Math.max(1, Math.round(meta.height / K))
  return { input: await sharp(big).resize(width, height).png().toBuffer(), width, height }
}

// Potong teks sampai muat di maxW lalu tambah "…" (supaya tidak nabrak badge)
async function fitText(text, maxW, opts) {
  const full = await textImage(text, opts)
  if (full.width <= maxW) return full
  const chars = Array.from(text)
  let lo = 0
  let hi = chars.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    const t = await textImage(chars.slice(0, mid).join('').trimEnd() + '…', opts)
    if (t.width <= maxW) lo = mid
    else hi = mid - 1
  }
  return textImage(chars.slice(0, lo).join('').trimEnd() + '…', opts)
}

async function circleAvatar(buf, d, name) {
  const mask = svg(d, d, `<circle cx="${d / 2}" cy="${d / 2}" r="${d / 2}" fill="#fff"/>`)
  if (buf) {
    return sharp(buf).rotate().resize(d, d, { fit: 'cover' }).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer()
  }
  const base = svg(d, d, `<circle cx="${d / 2}" cy="${d / 2}" r="${d / 2}" fill="#6b5b95"/>`)
  const ini = await textImage((Array.from(name || '?')[0] || '?').toUpperCase(), { size: d * 0.46, bold: true })
  return sharp(base)
    .composite([{ input: ini.input, left: Math.round((d - ini.width) / 2), top: Math.round((d - ini.height) / 2) }])
    .png()
    .toBuffer()
}

// ---------- api (streak) ----------
const FLAMES = {
  merah: { file: 'streak_merah.png', screen: false, color: '#ff5b2e' },
  ungu: { file: 'streak_ungu.jpg', screen: true, color: '#7b3ff2' },
  abu: { file: 'streak_abu.jpg', screen: true, color: '#8e8e93' }
}

// Muat gambar api, pangkas ruang kosongnya, lalu skala ke tinggi `h`
async function loadFlame(kind, h) {
  const def = FLAMES[kind]
  const file = asset(def.file)
  if (!fs.existsSync(file)) return null
  // JPG berlatar hitam dipangkas dengan toleransi; PNG transparan dipangkas dari tepi transparan
  const trimmed = def.screen
    ? sharp(file).trim({ background: '#000000', threshold: 40 })
    : sharp(file).ensureAlpha().trim()
  const { data, info } = await trimmed.resize({ height: h }).png().toBuffer({ resolveWithObject: true })
  return { input: data, width: info.width, height: info.height, blend: def.screen ? 'screen' : 'over' }
}

// Rapikan parameter dari mana saja (perintah bot, GET query, POST JSON)
export function normalizeTtchatParams(p = {}) {
  const s = (v) => String(v ?? '').trim()
  const flameRaw = s(p.flame ?? p.warna ?? p.color).toLowerCase()
  const dead = p.dead === true || /^(true|1|ya)$/i.test(s(p.dead)) || /mati|abu|grey|gray|dead/.test(flameRaw)
  const flame = dead ? 'abu' : /ungu|purple/.test(flameRaw) ? 'ungu' : 'merah'
  const sn = parseInt(s(p.streak).replace(/\D/g, ''), 10)
  const bn = parseInt(s(p.badge), 10)
  return {
    name: s(p.name).slice(0, 40) || 'User',
    message: s(p.text ?? p.message).slice(0, 300) || '...',
    streak: Number.isFinite(sn) ? Math.min(sn, 99999) : 100,
    flame,
    time: s(p.time).slice(0, 20) || 'Baru saja',
    badge: Number.isFinite(bn) ? Math.max(0, Math.min(bn, 999)) : 1
  }
}

// ---------- gambar utama ----------
export async function renderTtchat({
  name = 'User',
  message = 'halo',
  streak = 100,
  flame = 'merah', // 'merah' | 'ungu' | 'abu'
  time = 'Baru saja',
  badge = 1,
  avatar = null
}) {
  const W = 1080
  const CARD_X = 38
  const CARD_Y = 40
  const CARD_W = 1004
  const CARD_H = 172
  const H = CARD_Y * 2 + CARD_H
  const TEXT_X = 227 // awal nama dan pesan
  const RIGHT_LIMIT = badge > 0 ? 915 : 1000 // batas kanan teks (sebelum badge)
  const FLAME_H = 54

  const layers = []
  layers.push({
    input: svg(
      CARD_W,
      CARD_H,
      `<rect x="1" y="1" width="${CARD_W - 2}" height="${CARD_H - 2}" rx="38" ry="38" fill="#16161a" stroke="#222228" stroke-width="2"/>`
    ),
    left: CARD_X,
    top: CARD_Y
  })

  const AV = 144
  layers.push({ input: await circleAvatar(avatar, AV, name), left: 62, top: CARD_Y + (CARD_H - AV) / 2 })

  // Baris nama: nama + api + angka streak. Nama dipotong kalau terlalu panjang.
  const kind = flame in FLAMES ? flame : 'merah'
  const def = FLAMES[kind]
  const flameImg = await loadFlame(kind, FLAME_H)
  const flameW = flameImg ? flameImg.width : 0
  const numImg = await textImage(String(streak), { size: STYLE.numSize, bold: true, color: def.color, track: STYLE.trackName })
  const nameMax = RIGHT_LIMIT - TEXT_X - (flameW + 10 + numImg.width + 14)
  const nameImg = await fitText(name, nameMax, { size: STYLE.nameSize, bold: true, color: '#ffffff', track: STYLE.trackName })
  const rowY = CARD_Y + 42
  layers.push({ input: nameImg.input, left: TEXT_X, top: rowY })

  const flameX = TEXT_X + nameImg.width + 14
  const nameCenter = rowY + nameImg.height / 2
  if (flameImg) {
    layers.push({
      input: flameImg.input,
      left: flameX,
      top: Math.round(nameCenter - flameImg.height / 2),
      blend: flameImg.blend
    })
  }
  layers.push({ input: numImg.input, left: flameX + flameW + 6, top: Math.round(nameCenter - numImg.height / 2) })

  // Baris pesan: pesan dipotong "…" supaya "• waktu" tetap muat
  const timeImg = await textImage(`•  ${time}`, { size: STYLE.timeSize, color: '#8e8e93', track: STYLE.trackTime })
  const msgMax = RIGHT_LIMIT - TEXT_X - timeImg.width - 18
  const msgImg = await fitText(message, Math.max(80, msgMax), { size: STYLE.msgSize, color: '#ffffff', track: STYLE.trackMsg })
  const msgY = rowY + nameImg.height + 22
  layers.push({ input: msgImg.input, left: TEXT_X, top: msgY })
  layers.push({
    input: timeImg.input,
    left: TEXT_X + msgImg.width + 18,
    top: msgY + Math.round((msgImg.height - timeImg.height) / 2)
  })

  // Badge merah
  if (badge > 0) {
    const label = badge > 99 ? '99+' : String(badge)
    const D = 52
    const bx = CARD_X + CARD_W - 28 - D
    const by = CARD_Y + (CARD_H - D) / 2
    layers.push({
      input: svg(D, D, `<circle cx="${D / 2}" cy="${D / 2}" r="${D / 2}" fill="#fe2c55"/>`),
      left: bx,
      top: Math.round(by)
    })
    const b = await textImage(label, { size: label.length > 2 ? 24 : 32, bold: true, color: '#fff' })
    layers.push({
      input: b.input,
      left: Math.round(bx + (D - b.width) / 2),
      top: Math.round(by + (D - b.height) / 2)
    })
  }

  return sharp({ create: { width: W, height: H, channels: 4, background: '#000000' } })
    .composite(layers)
    .png()
    .toBuffer()
}
