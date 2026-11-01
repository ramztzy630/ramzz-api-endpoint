// Renderer IQC2: tampilan long-press pesan WhatsApp iPhone mode gelap
// (bar reaksi emoji + bubble pesan + menu Beri Bintang / Balas / ... / Hapus).
// File ini berdiri sendiri (hanya butuh sharp), dipakai bareng oleh:
//   - bot:    lib/imageApi.js, api.js, commands/iqc2.js   (taruh di lib/)
//   - vercel: api/index.js                                (taruh di lib/)
// Aset dibaca dari ../assets/ :
//   Inter-Regular.ttf (utama), LiberationSans-Regular.ttf (cadangan), NotoColorEmoji.ttf
import sharp from 'sharp'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const asset = (n) => fileURLToPath(new URL(`../assets/${n}`, import.meta.url))

// ---------- ukuran dan warna (lebar 1080, diukur dari screenshot asli) ----------
const W = 1080
const H = 1920
const K = 3 // teks dirender K kali lebih besar lalu dikecilkan supaya tajam

const STYLE = {
  msgSize: 46, // isi pesan
  msgLine: 58, // tinggi baris pesan
  timeSize: 33, // jam di bubble
  menuSize: 51, // teks menu
  maxText: 859, // lebar bubble (area teks + ruang jam)
  wrapW: 760, // teks dipatahkan ke baris baru di lebar ini
  padX: 28,
  bubbleColor: '#2b2e33',
  pillColor: '#2a2c30',
  menuColor: '#25282c',
  lineColor: '#42474c',
  text: '#f5f5f7',
  gray: '#8e9196',
  red: '#ff5f3f'
}

const GEO = {
  pillY: 522, // atas bar reaksi
  pillW: 855,
  pillH: 163,
  bubbleBottom: 914, // bawah bubble (tetap; bubble yang panjang tumbuh ke atas)
  menuY: 940,
  menuW: 810,
  row: 141
}

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏']
const REACTION_X = [93, 225, 358, 490, 623, 756]

const MENU = [
  ['Beri Bintang', 'star', STYLE.text],
  ['Balas', 'replyO', STYLE.text],
  ['Teruskan', 'forwardO', STYLE.text],
  ['Salin', 'copyO', STYLE.text],
  ['Ucapkan', 'speech', STYLE.text],
  ['Laporkan', 'warn', STYLE.text],
  ['Hapus', 'trashO', STYLE.red]
]

// ---------- font ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const svg = (w, h, inner, defs = '') =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${defs}</defs>${inner}</svg>`
  )

const probe = async (spec, file) =>
  createHash('sha1')
    .update(
      await sharp({ text: { text: 'Rama iya sayang 123', font: `${spec} 60`, fontfile: file, dpi: 72, rgba: true } })
        .png()
        .toBuffer()
    )
    .digest('hex')

// Pilih font yang benar-benar terbaca Pango (hasilnya harus beda dari font cadangan bawaan)
async function pickFont() {
  const sets = [
    { label: 'Inter', file: asset('Inter-Regular.ttf'), specs: ['Inter 24pt', 'Inter 24pt Regular', 'Inter', 'Inter Regular'] },
    { label: 'Liberation Sans', file: asset('LiberationSans-Regular.ttf'), specs: ['Liberation Sans'] }
  ]
  for (const s of sets) {
    if (!fs.existsSync(s.file)) continue
    try {
      const base = await probe('ZzFontTidakAda', s.file)
      for (const spec of s.specs) {
        if ((await probe(spec, s.file)) !== base) return { label: s.label, file: s.file, spec }
      }
    } catch {}
  }
  return { label: 'sistem', file: undefined, spec: 'sans' }
}

const FONT = await pickFont()
console.log(`[iqc2] font dipakai: ${FONT.label}`)

const FONT_EMOJI = asset('NotoColorEmoji.ttf')
const HAS_EMOJI = fs.existsSync(FONT_EMOJI)
if (HAS_EMOJI) {
  await sharp({ text: { text: 'x', font: 'Noto Color Emoji 20', fontfile: FONT_EMOJI, dpi: 72, rgba: true } })
    .png()
    .toBuffer()
}

// ---------- teks dan emoji ----------
async function textImage(text, { size, color = '#fff', width = 0, lineHeight = 0, trim = false }) {
  const opts = {
    text: `<span foreground="${color}">${esc(text)}</span>`,
    font: `${FONT.spec} ${Math.round(size * K)}`,
    dpi: 72,
    rgba: true,
    wrap: 'word-char',
    align: 'left'
  }
  if (FONT.file) opts.fontfile = FONT.file
  if (width) opts.width = Math.round(width * K)
  if (lineHeight) {
    const nat = await naturalLine(size)
    opts.spacing = Math.max(0, Math.round(K * (lineHeight - nat)))
  }
  // tambah sedikit ruang kanan supaya ujung huruf (mis. "g") tidak kepotong
  const big = await sharp(await sharp({ text: opts }).png().toBuffer())
    .extend({ right: K * 3, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  let img = sharp(big)
  if (trim) img = sharp(await img.trim().png().toBuffer())
  const meta = await img.metadata()
  const w = Math.max(1, Math.round(meta.width / K))
  const h = Math.max(1, Math.round(meta.height / K))
  return { input: await img.resize(w, h).png().toBuffer(), width: w, height: h }
}

// Tinggi satu baris bawaan font (untuk menghitung jarak antarbaris)
const lineCache = new Map()
async function naturalLine(size) {
  if (lineCache.has(size)) return lineCache.get(size)
  const opts = { text: 'Hg', font: `${FONT.spec} ${Math.round(size * K)}`, dpi: 72, rgba: true }
  if (FONT.file) opts.fontfile = FONT.file
  const meta = await sharp(await sharp({ text: opts }).png().toBuffer()).metadata()
  const v = meta.height / K
  lineCache.set(size, v)
  return v
}

async function emojiImage(ch, box) {
  if (!HAS_EMOJI) return null
  const raw = await sharp({ text: { text: ch, font: 'Noto Color Emoji 100', fontfile: FONT_EMOJI, dpi: 72, rgba: true } })
    .png()
    .toBuffer()
  const { data, info } = await sharp(raw).trim().resize(box, box, { fit: 'inside' }).png().toBuffer({ resolveWithObject: true })
  return { input: data, width: info.width, height: info.height }
}

// ---------- bentuk ----------
const rrect = (w, h, r, fill, opacity = 1) =>
  svg(w, h, `<rect width="${w}" height="${h}" rx="${r}" ry="${r}" fill="${fill}" fill-opacity="${opacity}"/>`)

async function softBox(x, y, w, h, r, fill, opacity, blur) {
  const m = Math.ceil(blur * 3)
  const png = await sharp(
    svg(w + m * 2, h + m * 2, `<rect x="${m}" y="${m}" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="${fill}" fill-opacity="${opacity}"/>`)
  )
    .blur(blur)
    .png()
    .toBuffer()
  return { input: png, left: Math.round(x - m), top: Math.round(y - m) }
}

const ICONS = {
  star: (c) => `<polygon points="12,2.5 14.9,8.8 21.8,9.6 16.7,14.3 18.1,21.2 12,17.8 5.9,21.2 7.3,14.3 2.2,9.6 9.1,8.8" fill="none" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/>`,
  replyO: (c) => `<path d="M9.5 8.5V4.5L3 11l6.5 6.5v-4c5 0 8 1.4 10.5 5C19 13 15.5 9 9.5 8.5z" fill="none" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/>`,
  forwardO: (c) => `<g transform="translate(24,0) scale(-1,1)"><path d="M9.5 8.5V4.5L3 11l6.5 6.5v-4c5 0 8 1.4 10.5 5C19 13 15.5 9 9.5 8.5z" fill="none" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/></g>`,
  copyO: (c) => `<rect x="8" y="8" width="12" height="13" rx="2.2" fill="none" stroke="${c}" stroke-width="1.6"/><path d="M16 8V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2" fill="none" stroke="${c}" stroke-width="1.6"/>`,
  speech: (c) => `<path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8l-5 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="none" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/>`,
  warn: (c) => `<path d="M12 3.2L22 20.3H2L12 3.2z" fill="none" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 9.8v5M12 17.4v.6" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/>`,
  trashO: (c) => `<path d="M4 7h16M10 7V4h4v3M6 7l1 14h10l1-14M10 11v6M14 11v6" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`
}
const icon = (name, color, size) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">${ICONS[name](color)}</svg>`)

// Rapikan parameter dari mana saja (perintah bot, GET query, POST JSON)
const nowTime = () =>
  new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }).replace(':', '.')

export function normalizeIqc2Params(p = {}) {
  const s = (v) => String(v ?? '').trim()
  const t = s(p.time)
  return {
    text: s(p.text ?? p.message).slice(0, 300) || '...',
    time: /^\d{1,2}[.:]\d{2}$/.test(t) ? t.replace('.', ':') : nowTime().replace('.', ':')
  }
}

// ---------- latar buram (chat di belakang menu) ----------
async function background() {
  const bubbles =
    `<rect x="580" y="140" width="480" height="260" rx="44" fill="#0b4540" fill-opacity=".85"/>` +
    `<rect x="40" y="440" width="380" height="80" rx="30" fill="#2a2b30"/>` +
    `<rect x="190" y="700" width="870" height="280" rx="44" fill="#0a3a38" fill-opacity=".8"/>` +
    `<rect x="810" y="1150" width="250" height="410" rx="44" fill="#0b4540" fill-opacity=".75"/>` +
    `<rect x="0" y="0" width="${W}" height="130" fill="#10151c"/>` +
    `<circle cx="235" cy="68" r="40" fill="#8d9096"/><rect x="310" y="48" width="230" height="40" rx="14" fill="#555961"/>` +
    `<rect x="860" y="1840" width="160" height="70" rx="30" fill="#1a2c44"/>`
  const blurred = await sharp(svg(W, H, `<rect width="${W}" height="${H}" fill="#040506"/>${bubbles}`)).blur(26).png().toBuffer()
  // gelapkan sedikit supaya mirip lapisan blur iOS
  return sharp(blurred)
    .composite([{ input: svg(W, H, `<rect width="${W}" height="${H}" fill="#000" fill-opacity=".38"/>`), left: 0, top: 0 }])
    .png()
    .toBuffer()
}

// ---------- gambar utama ----------
export async function renderIqc2({ text = 'halo', time = '12:00', image = null }) {
  const layers = [{ input: await background(), left: 0, top: 0 }]
  const t = String(time).replace('.', ':')

  // Bubble: ukuran mengikuti teks
  const body = await textImage(text, { size: STYLE.msgSize, color: STYLE.text, width: STYLE.wrapW, lineHeight: STYLE.msgLine })
  const stamp = await textImage(t, { size: STYLE.timeSize, color: STYLE.gray })
  const oneLine = body.height < STYLE.msgLine * 1.5

  let pic = null
  if (image) {
    const r = await sharp(image).rotate().resize({ width: STYLE.maxText, withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true })
    const mask = svg(r.info.width, r.info.height, `<rect width="${r.info.width}" height="${r.info.height}" rx="22" ry="22" fill="#fff"/>`)
    pic = {
      input: await sharp(r.data).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer(),
      width: r.info.width,
      height: r.info.height
    }
  }

  const padX = STYLE.padX
  // Satu baris: jam di sebelah kanan teks. Beberapa baris: bubble selebar area teks, jam di pojok kanan bawah.
  const innerW = Math.max(pic ? pic.width : 0, oneLine ? body.width + 36 + stamp.width : STYLE.maxText)
  const bubbleW = Math.min(innerW, STYLE.maxText) + padX * 2
  const topPad = 22
  const bubbleH = topPad + (pic ? pic.height + 10 : 0) + body.height + (oneLine ? 24 : 42)
  const bx = 0
  const by = GEO.bubbleBottom - bubbleH

  // Bar reaksi di atas bubble
  const py = by - 43 - GEO.pillH
  layers.push(await softBox(bx, py + 4, GEO.pillW, GEO.pillH, GEO.pillH / 2, '#000', 0.5, 10))
  layers.push({ input: rrect(GEO.pillW, GEO.pillH, GEO.pillH / 2, STYLE.pillColor, 0.97), left: bx, top: py })
  for (let i = 0; i < REACTIONS.length; i++) {
    const e = await emojiImage(REACTIONS[i], 100)
    if (e) layers.push({ input: e.input, left: REACTION_X[i] - Math.round(e.width / 2), top: py + Math.round((GEO.pillH - e.height) / 2) })
  }

  // Bubble pesan
  layers.push({ input: rrect(bubbleW, bubbleH, 42, STYLE.bubbleColor), left: bx, top: by })
  let cy = by + topPad
  if (pic) {
    layers.push({ input: pic.input, left: bx + padX, top: cy })
    cy += pic.height + 10
  }
  layers.push({ input: body.input, left: bx + padX, top: cy })
  const stampTop = oneLine ? cy + body.height - stamp.height - 2 : by + bubbleH - stamp.height - 12
  layers.push({ input: stamp.input, left: bx + bubbleW - padX - stamp.width, top: Math.round(stampTop) })

  // Menu konteks (7 baris, baris terakhir terpotong tepi gambar seperti aslinya)
  const MH = GEO.row * MENU.length
  layers.push(await softBox(0, GEO.menuY + 6, GEO.menuW, MH, 44, '#000', 0.45, 12))
  layers.push({
    input: svg(
      GEO.menuW,
      MH,
      `<rect width="${GEO.menuW}" height="${MH}" rx="44" ry="44" fill="url(#g)"/>`,
      `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a2d32" stop-opacity=".97"/><stop offset="1" stop-color="#1e2527" stop-opacity=".97"/></linearGradient>`
    ),
    left: 0,
    top: GEO.menuY
  })
  for (let i = 0; i < MENU.length; i++) {
    const [label, ic, color] = MENU[i]
    const rowTop = Math.round(GEO.menuY + GEO.row * i)
    const tx = await textImage(label, { size: STYLE.menuSize, color })
    layers.push({ input: tx.input, left: 50, top: rowTop + Math.round((GEO.row - tx.height) / 2) })
    layers.push({ input: icon(ic, color, 62), left: GEO.menuW - 62 - 48, top: rowTop + Math.round((GEO.row - 62) / 2) })
    if (i < MENU.length - 1) {
      layers.push({ input: svg(GEO.menuW, 2, `<rect width="${GEO.menuW}" height="2" fill="${STYLE.lineColor}" fill-opacity=".85"/>`), left: 0, top: rowTop + GEO.row - 1 })
    }
  }

  return sharp({ create: { width: W, height: H, channels: 3, background: '#040506' } })
    .composite(layers)
    .png()
    .toBuffer()
}

export const iqc2Font = FONT.label
