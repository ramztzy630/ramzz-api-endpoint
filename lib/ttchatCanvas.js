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
// Angka diukur dari screenshot TikTok asli (lebar 1080 px).
export const STYLE = {
  nameSize: 39, // nama akun (tebal)
  numSize: 38, // angka streak (tebal)
  msgSize: 38, // isi pesan (tebal kalau belum dibaca / badge > 0)
  timeSize: 35, // "Baru saja"
  badgeSize: 29, // angka di badge merah
  // Jarak antar huruf dalam em. 0 = bawaan font, -0.01 = sedikit lebih rapat, 0.01 = lebih renggang
  trackName: 0,
  trackMsg: 0,
  trackTime: 0,
  card: false // true = ada kartu gelap membulat di belakang baris (tampilan long-press); false = latar hitam polos seperti daftar DM asli
}

// Posisi (px, lebar 1080). Baseline dihitung relatif terhadap titik tengah foto profil.
const GEO = {
  W: 1080,
  H: 204,
  cy: 102, // titik tengah vertikal foto profil
  avatarD: 143,
  avatarX: 40,
  textX: 214, // awal nama dan pesan
  nameBase: -15, // baseline nama = cy - 15
  msgBase: 43, // baseline pesan & waktu = cy + 43
  badgeD: 47,
  badgeCx: 1007,
  textRight: 960 // batas kanan teks kalau ada badge (badge mulai di x=984)
}
const COLOR = { text: '#f7f7f7', gray: '#999999', badge: '#fe2c55' }

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
  if (full.width <= maxW) return { ...full, truncated: false }
  const chars = Array.from(text)
  let lo = 0
  let hi = chars.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    const t = await textImage(chars.slice(0, mid).join('').trimEnd() + '…', opts)
    if (t.width <= maxW) lo = mid
    else hi = mid - 1
  }
  return { ...(await textImage(chars.slice(0, lo).join('').trimEnd() + '…', opts)), truncated: true }
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
    time: (t => t.charAt(0).toUpperCase() + t.slice(1))(s(p.time).slice(0, 20) || 'Baru saja'),
    badge: Number.isFinite(bn) ? Math.max(0, Math.min(bn, 999)) : 1,
    card: p.card === undefined || s(p.card) === '' ? undefined : /^(1|true|ya|card|kartu)$/i.test(s(p.card))
  }
}

// Ukur huruf "H": jarak dari atas gambar teks ke baseline, dan tinggi huruf kapital.
// Dipakai supaya baris teks bisa ditaruh tepat di baseline yang diinginkan.
const metricCache = new Map()
async function textMetrics(bold, size) {
  const key = `${bold ? 'b' : 'r'}${size}`
  if (metricCache.has(key)) return metricCache.get(key)
  const t = await textImage('H', { size, bold })
  const { data, info } = await sharp(t.input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let top = -1
  let bottom = -1
  for (let y = 0; y < info.height; y++) {
    let any = false
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 40) {
        any = true
        break
      }
    }
    if (any) {
      if (top < 0) top = y
      bottom = y
    }
  }
  const m = { base: bottom + 1, cap: bottom - top + 1 }
  metricCache.set(key, m)
  return m
}
const baselineOffset = async (bold, size) => (await textMetrics(bold, size)).base

// ---------- gambar utama ----------
export async function renderTtchat({
  name = 'User',
  message = 'halo',
  streak = 100, // 0 = tanpa streak
  flame = 'merah', // 'merah' | 'ungu' | 'abu'
  time = 'Baru saja',
  badge = 1, // 0 = tanpa badge (pesan dianggap sudah dibaca)
  avatar = null,
  card
}) {
  const { W, H, cy, avatarD, avatarX, textX } = GEO
  const useCard = card ?? STYLE.card
  const unread = badge > 0
  const right = unread ? GEO.textRight : 1040
  const layers = []

  if (useCard) {
    layers.push({
      input: svg(1048, 172, '<rect x="1" y="1" width="1046" height="170" rx="38" ry="38" fill="#16161a" stroke="#222228" stroke-width="2"/>'),
      left: 16,
      top: cy - 86
    })
  }

  layers.push({ input: await circleAvatar(avatar, avatarD, name), left: avatarX, top: Math.round(cy - avatarD / 2) })

  // Baris nama (+ api + angka streak). Nama dipotong "…" kalau terlalu panjang.
  const nameBaseY = cy + GEO.nameBase
  const msgBaseY = cy + GEO.msgBase
  const kind = flame in FLAMES ? flame : 'merah'
  const def = FLAMES[kind]
  const showStreak = streak > 0
  const flameH = Math.round(STYLE.nameSize * 1.02)
  const flameImg = showStreak ? await loadFlame(kind, flameH) : null
  const flameW = flameImg ? flameImg.width : 0
  const numImg = showStreak
    ? await textImage(String(streak), { size: STYLE.numSize, bold: true, color: def.color, track: STYLE.trackName })
    : null
  const streakW = showStreak ? 16 + flameW + 4 + numImg.width : 0
  const nameImg = await fitText(name, right - textX - streakW - 6, {
    size: STYLE.nameSize,
    bold: true,
    color: COLOR.text,
    track: STYLE.trackName
  })
  const nameOff = await baselineOffset(true, STYLE.nameSize)
  layers.push({ input: nameImg.input, left: textX, top: Math.round(nameBaseY - nameOff) })

  if (showStreak) {
    const flameX = textX + nameImg.width + 16
    if (flameImg) {
      layers.push({
        input: flameImg.input,
        left: flameX,
        top: Math.round(nameBaseY - flameH * 0.66),
        blend: flameImg.blend
      })
    }
    const numOff = await baselineOffset(true, STYLE.numSize)
    layers.push({ input: numImg.input, left: flameX + flameW + 4, top: Math.round(nameBaseY + 4 - numOff) })
  }

  // Baris pesan: pesan, titik tengah kecil, lalu waktu. Pesan dipotong "…" supaya waktu tetap muat.
  const timeImg = await textImage(time, { size: STYLE.timeSize, color: COLOR.gray, track: STYLE.trackTime })
  const DOT = 5
  const msgMax = right - textX - (20 + DOT + 14 + timeImg.width)
  const msgImg = await fitText(message, Math.max(80, msgMax), {
    size: STYLE.msgSize,
    bold: unread,
    color: COLOR.text,
    track: STYLE.trackMsg
  })
  const msgOff = await baselineOffset(unread, STYLE.msgSize)
  layers.push({ input: msgImg.input, left: textX, top: Math.round(msgBaseY - msgOff) })

  const dotX = textX + msgImg.width + (msgImg.truncated ? 20 : 12) // setelah "…" jaraknya lebih renggang seperti aslinya
  layers.push({
    input: svg(DOT, DOT, `<circle cx="${DOT / 2}" cy="${DOT / 2}" r="${DOT / 2}" fill="${COLOR.gray}"/>`),
    left: Math.round(dotX),
    top: Math.round(msgBaseY - 10.5 - DOT / 2)
  })
  const timeOff = await baselineOffset(false, STYLE.timeSize)
  layers.push({ input: timeImg.input, left: Math.round(dotX + DOT + 14), top: Math.round(msgBaseY - timeOff) })

  // Badge merah
  if (unread) {
    const label = badge > 99 ? '99+' : String(badge)
    const D = GEO.badgeD
    const bx = Math.round(GEO.badgeCx - D / 2)
    const by = Math.round(cy - D / 2)
    layers.push({
      input: svg(D, D, `<circle cx="${D / 2}" cy="${D / 2}" r="${D / 2}" fill="${COLOR.badge}"/>`),
      left: bx,
      top: by
    })
    const bs = label.length > 2 ? STYLE.badgeSize * 0.75 : STYLE.badgeSize
    const b = await textImage(label, { size: bs, bold: true, color: '#fff' })
    const m = await textMetrics(true, Math.round(bs))
    // tengah tinggi angka (cap) tepat di tengah lingkaran
    layers.push({
      input: b.input,
      left: Math.round(bx + (D - b.width) / 2),
      top: Math.round(by + D / 2 + m.cap / 2 - m.base)
    })
  }

  return sharp({ create: { width: W, height: H, channels: 4, background: '#000000' } })
    .composite(layers)
    .png()
    .toBuffer()
}
