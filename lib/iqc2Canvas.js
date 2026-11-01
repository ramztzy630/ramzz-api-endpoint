// Renderer IQC2: tampilan long-press pesan WhatsApp iPhone mode gelap (gaya liquid glass)
// (bar reaksi emoji + bubble pesan + menu Beri Bintang / Balas / ... / Hapus).
// File ini berdiri sendiri (hanya butuh sharp), dipakai bareng oleh:
//   - bot:    lib/imageApi.js, api.js, commands/iqc2.js   (taruh di lib/)
//   - vercel: api/index.js                                (taruh di lib/)
// Aset dibaca dari ../assets/ :
//   Inter-Regular.ttf (utama), LiberationSans-Regular.ttf (cadangan), NotoColorEmoji.ttf (cadangan emoji)
//   emoji/<kode>.png  (opsional) emoji iPhone, mis. emoji/1f44d.png. Kalau tidak ada, diunduh otomatis
//   dari paket emoji-datasource-apple (jsDelivr/unpkg) lalu disimpan. Gagal semua -> pakai Noto.
// Env opsional: IQC2_EMOJI_BASE = folder URL tempat PNG emoji iPhone (dicoba paling dulu)
import sharp from 'sharp'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const asset = (n) => fileURLToPath(new URL(`../assets/${n}`, import.meta.url))

// ---------- ukuran dan warna (lebar 1080, diukur dari screenshot asli) ----------
const W = 1080
const H = 1920
const K = 3 // teks dirender K kali lebih besar lalu dikecilkan supaya tajam

const STYLE = {
  msgSize: 46, // isi pesan
  msgLine: 58, // jarak antar baris pesan
  timeSize: 33, // jam di bubble
  menuSize: 51, // teks menu
  maxText: 859, // lebar bubble (area teks + ruang jam)
  wrapW: 760, // teks dipatahkan ke baris baru di lebar ini
  padX: 28,
  text: '#f5f5f7',
  gray: '#9a9da3',
  red: '#ff5f3f',
  emojiBox: 104 // ukuran gambar emoji di bar reaksi
}

const GEO = {
  pillH: 163,
  pillW: 855,
  pillGap: 43, // jarak bawah bar reaksi ke atas bubble
  bubbleBottom: 914, // bawah bubble (tetap; bubble yang panjang tumbuh ke atas)
  menuY: 940,
  menuW: 810,
  menuH: 970, // sampai y=1910, baris terakhir terpotong seperti aslinya
  row: 141
}

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏']
const REACTION_X = [95, 225, 358, 490, 623, 756]

const MENU = [
  ['Beri Bintang', 'star', STYLE.text],
  ['Balas', 'replyO', STYLE.text],
  ['Teruskan', 'forwardO', STYLE.text],
  ['Salin', 'copyO', STYLE.text],
  ['Ucapkan', 'speech', STYLE.text],
  ['Laporkan', 'warn', STYLE.text],
  ['Hapus', 'trashO', STYLE.red]
]

// ---------- util ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const svg = (w, h, inner, defs = '') =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${defs}</defs>${inner}</svg>`
  )
const rrect = (w, h, r, fill, opacity = 1) =>
  svg(w, h, `<rect width="${w}" height="${h}" rx="${r}" ry="${r}" fill="${fill}" fill-opacity="${opacity}"/>`)

// ---------- font ----------
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

// ---------- teks ----------
const fontOpts = (size) => {
  const o = { font: `${FONT.spec} ${Math.round(size * K)}`, dpi: 72, rgba: true }
  if (FONT.file) o.fontfile = FONT.file
  return o
}
const heightOf = async (text, size, extra = {}) =>
  (await sharp({ text: { text: `<span foreground="#fff">${esc(text)}</span>`, ...fontOpts(size), ...extra } }).png().metadata()).height / K

// Jarak antar baris bawaan font pada ukuran ini (px)
const pitchCache = new Map()
async function naturalPitch(size) {
  if (pitchCache.has(size)) return pitchCache.get(size)
  const v = (await heightOf('Hg\nHg', size)) - (await heightOf('Hg', size))
  pitchCache.set(size, v)
  return v
}

async function textImage(text, { size, color = '#fff', width = 0, lineHeight = 0 }) {
  const opts = {
    text: `<span foreground="${color}">${esc(text)}</span>`,
    ...fontOpts(size),
    wrap: 'word-char',
    align: 'left'
  }
  if (width) opts.width = Math.round(width * K)
  // spacing boleh negatif: jarak antar baris dikunci tepat ke lineHeight
  if (lineHeight) opts.spacing = Math.round(K * (lineHeight - (await naturalPitch(size))))
  // ruang kanan ekstra supaya ujung huruf (mis. "g") tidak kepotong
  const big = await sharp(await sharp({ text: opts }).png().toBuffer())
    .extend({ right: K * 3, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  const meta = await sharp(big).metadata()
  const w = Math.max(1, Math.round(meta.width / K))
  const h = Math.max(1, Math.round(meta.height / K))
  return { input: await sharp(big).resize(w, h).png().toBuffer(), width: w, height: h }
}

// Ukur huruf "H": jarak dari atas gambar teks ke baseline, dan tinggi huruf kapital
const metricCache = new Map()
async function metrics(size) {
  if (metricCache.has(size)) return metricCache.get(size)
  const t = await textImage('H', { size })
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
  const m = { base: bottom + 1, cap: bottom - top + 1, one: t.height }
  metricCache.set(size, m)
  return m
}

// ---------- emoji ----------
async function notoEmoji(ch, box) {
  if (!HAS_EMOJI) return null
  const raw = await sharp({ text: { text: ch, font: 'Noto Color Emoji 100', fontfile: FONT_EMOJI, dpi: 72, rgba: true } })
    .png()
    .toBuffer()
  const { data, info } = await sharp(raw).trim().resize(box, box, { fit: 'inside' }).png().toBuffer({ resolveWithObject: true })
  return { input: data, width: info.width, height: info.height }
}

const EMOJI_VER = '14.0.0'
const EMOJI_BASES = [
  process.env.IQC2_EMOJI_BASE && process.env.IQC2_EMOJI_BASE.replace(/\/+$/, ''),
  `https://cdn.jsdelivr.net/npm/emoji-datasource-apple@${EMOJI_VER}/img/apple/64`,
  `https://unpkg.com/emoji-datasource-apple@${EMOJI_VER}/img/apple/64`
].filter(Boolean)
const EMOJI_DIRS = [asset('emoji'), path.join(os.tmpdir(), 'iqc2-emoji')]
const emojiMem = new Map() // nama file -> Buffer
const emojiFailed = new Map() // nama file -> waktu gagal terakhir (coba lagi setelah 60 dtk)

const codeName = (ch) =>
  Array.from(ch)
    .map((c) => c.codePointAt(0).toString(16))
    .join('-')

async function validPng(buf) {
  try {
    const m = await sharp(buf).metadata()
    return m.width >= 16 && m.height >= 16
  } catch {
    return false
  }
}

// Ambil PNG emoji iPhone: memori -> folder lokal -> unduh. Tidak ketemu -> null
async function appleEmojiBuffer(ch) {
  const full = codeName(ch)
  const names = [...new Set([full, full.replace(/-fe0f/g, '')])]
  for (const n of names) if (emojiMem.has(n)) return emojiMem.get(n)

  for (const n of names) {
    for (const dir of EMOJI_DIRS) {
      try {
        const buf = fs.readFileSync(path.join(dir, `${n}.png`))
        if (await validPng(buf)) {
          emojiMem.set(n, buf)
          return buf
        }
      } catch {}
    }
  }

  if (Date.now() - (emojiFailed.get(full) || 0) < 60000) return null
  for (const n of names) {
    try {
      const buf = await Promise.any(
        EMOJI_BASES.map(async (base) => {
          const res = await fetch(`${base}/${n}.png`, { signal: AbortSignal.timeout(4500) })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const b = Buffer.from(await res.arrayBuffer())
          if (!(await validPng(b))) throw new Error('bukan PNG')
          return b
        })
      )
      emojiMem.set(n, buf)
      for (const dir of EMOJI_DIRS) {
        try {
          fs.mkdirSync(dir, { recursive: true })
          fs.writeFileSync(path.join(dir, `${n}.png`), buf)
          break
        } catch {}
      }
      return buf
    } catch {}
  }
  emojiFailed.set(full, Date.now())
  return null
}

// Satu emoji untuk bar reaksi. Gaya iPhone kalau ada, kalau tidak Noto.
async function reactionEmoji(ch, box, usedFallback) {
  const buf = await appleEmojiBuffer(ch)
  if (buf) {
    const input = await sharp(buf).resize(box, box, { fit: 'contain', kernel: 'lanczos3', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
    return { input, width: box, height: box }
  }
  usedFallback.value = true
  return notoEmoji(ch, Math.round(box * 0.94))
}

// ---------- ikon ----------
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

// ---------- parameter ----------
const nowTime = () =>
  new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }).replace(':', '.')

// Rapikan parameter dari mana saja (perintah bot, GET query, POST JSON)
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
  const teal = '#0b4140'
  const shapes =
    // pita atas: panah, avatar, nama, tombol
    `<rect x="0" y="0" width="${W}" height="135" fill="#0c1118"/>` +
    `<rect x="10" y="48" width="110" height="46" rx="16" fill="#1f4fb8" fill-opacity=".75"/>` +
    `<circle cx="235" cy="68" r="40" fill="#b4b7bd"/>` +
    `<rect x="305" y="50" width="235" height="42" rx="16" fill="#8b8f96" fill-opacity=".8"/>` +
    `<rect x="830" y="48" width="90" height="46" rx="16" fill="#1f4fb8" fill-opacity=".55"/>` +
    `<rect x="960" y="48" width="100" height="46" rx="16" fill="#5d6b88" fill-opacity=".6"/>` +
    // bubble hijau kanan atas + garis teks samar di dalamnya
    `<rect x="580" y="140" width="480" height="265" rx="46" fill="${teal}"/>` +
    `<rect x="620" y="195" width="230" height="36" rx="14" fill="#2c7f7c" fill-opacity=".55"/>` +
    `<rect x="620" y="255" width="300" height="36" rx="14" fill="#2c7f7c" fill-opacity=".45"/>` +
    `<rect x="810" y="345" width="200" height="34" rx="14" fill="#35918d" fill-opacity=".6"/>` +
    // bubble abu kiri
    `<rect x="40" y="455" width="380" height="70" rx="28" fill="#5a5d63" fill-opacity=".55"/>` +
    // bubble hijau tengah (di belakang bubble pesan) dan bawah (di belakang menu)
    `<rect x="190" y="700" width="870" height="290" rx="46" fill="${teal}" fill-opacity=".9"/>` +
    `<rect x="270" y="1150" width="790" height="430" rx="46" fill="${teal}" fill-opacity=".95"/>` +
    `<rect x="330" y="1290" width="420" height="40" rx="14" fill="#35918d" fill-opacity=".5"/>` +
    `<rect x="330" y="1400" width="460" height="40" rx="14" fill="#35918d" fill-opacity=".45"/>` +
    // kolom ketik di bawah
    `<rect x="860" y="1840" width="170" height="70" rx="30" fill="#2456c9" fill-opacity=".6"/>`
  const blurred = await sharp(svg(W, H, `<rect width="${W}" height="${H}" fill="#020304"/>${shapes}`)).blur(24).png().toBuffer()
  return sharp(blurred)
    .composite([{ input: svg(W, H, `<rect width="${W}" height="${H}" fill="#000" fill-opacity=".12"/>`), left: 0, top: 0 }])
    .png()
    .toBuffer()
}

// ---------- kaca (liquid glass) ----------
async function shadow(x, y, w, h, r, opacity, blur, dy = 8) {
  const m = Math.ceil(blur * 3)
  const png = await sharp(
    svg(w + m * 2, h + m * 2, `<rect x="${m}" y="${m}" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="#000" fill-opacity="${opacity}"/>`)
  )
    .blur(blur)
    .png()
    .toBuffer()
  return { input: png, left: Math.round(x - m), top: Math.round(y - m + dy) }
}

// Panel kaca transparan: latar di belakangnya diambil lalu dicerahkan, diberi tint gelap,
// kilau diagonal, dan garis tepi tipis yang terang di sisi atas-kiri.
async function glass(bg, x, y, w, h, r, { tint = '#23262a', alpha = 0.7, sheen = 0.1 } = {}) {
  const region = await sharp(bg)
    .extract({ left: Math.round(x), top: Math.round(y), width: Math.round(w), height: Math.round(h) })
    .modulate({ brightness: 1.3, saturation: 1.25 })
    .blur(14)
    .png()
    .toBuffer()
  const defs =
    `<linearGradient id="s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="${sheen}"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
    `<linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".3"/><stop offset=".5" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#fff" stop-opacity=".18"/></linearGradient>`
  const overlay = svg(
    w,
    h,
    `<rect width="${w}" height="${h}" fill="${tint}" fill-opacity="${alpha}"/>` +
      `<rect width="${w}" height="${h}" fill="url(#s)"/>` +
      `<rect x="1.25" y="1.25" width="${w - 2.5}" height="${h - 2.5}" rx="${r - 1}" fill="none" stroke="url(#rim)" stroke-width="2.5"/>`,
    defs
  )
  const input = await sharp(region)
    .composite([{ input: overlay }, { input: rrect(w, h, r, '#fff'), blend: 'dest-in' }])
    .png()
    .toBuffer()
  return { input, left: Math.round(x), top: Math.round(y) }
}

// ---------- gambar utama ----------
export async function renderIqc2({ text = 'halo', time = '12:00', image = null, warnings = [] }) {
  const t = String(time).replace('.', ':')
  const bg = await background()
  const layers = []

  // ----- ukuran bubble -----
  const mTxt = await metrics(STYLE.msgSize)
  const mTime = await metrics(STYLE.timeSize)
  const body = await textImage(text, { size: STYLE.msgSize, color: STYLE.text, width: STYLE.wrapW, lineHeight: STYLE.msgLine })
  const stamp = await textImage(t, { size: STYLE.timeSize, color: STYLE.gray })
  const lines = Math.max(1, Math.round((body.height - mTxt.one) / STYLE.msgLine) + 1)
  const oneLine = lines === 1

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
  const picShift = pic ? pic.height + 12 : 0

  // Satu baris: jam di sebelah kanan teks. Beberapa baris: bubble selebar area teks, jam di pojok kanan bawah.
  const padR = 25
  const innerW = Math.max(pic ? pic.width : 0, oneLine ? body.width + 36 + stamp.width : STYLE.maxText)
  const bubbleW = Math.min(innerW, STYLE.maxText) + STYLE.padX + padR
  const firstBase = oneLine ? 70 : 72
  const bubbleH = oneLine ? picShift + firstBase + 42 : picShift + firstBase + (lines - 1) * STYLE.msgLine + 56
  const bx = 0
  const by = GEO.bubbleBottom - bubbleH
  const pillY = by - GEO.pillGap - GEO.pillH

  // ----- bayangan + panel kaca -----
  layers.push(await shadow(0, pillY, GEO.pillW, GEO.pillH, GEO.pillH / 2, 0.4, 14))
  layers.push(await shadow(bx, by, bubbleW, bubbleH, 44, 0.3, 10, 5))
  layers.push(await shadow(0, GEO.menuY, GEO.menuW, GEO.menuH, 46, 0.45, 16))
  layers.push(await glass(bg, 0, pillY, GEO.pillW, GEO.pillH, GEO.pillH / 2, { alpha: 0.68, sheen: 0.1 }))
  layers.push(await glass(bg, bx, by, bubbleW, bubbleH, 44, { alpha: 0.8, sheen: 0.07 }))
  layers.push(await glass(bg, 0, GEO.menuY, GEO.menuW, GEO.menuH, 46, { alpha: 0.67, sheen: 0.11 }))

  // ----- emoji bar reaksi -----
  const fb = { value: false }
  const emojis = await Promise.all(REACTIONS.map((ch) => reactionEmoji(ch, STYLE.emojiBox, fb)))
  emojis.forEach((e, i) => {
    if (e) layers.push({ input: e.input, left: REACTION_X[i] - Math.round(e.width / 2), top: Math.round(pillY + (GEO.pillH - e.height) / 2) })
  })
  if (fb.value) warnings.push('emoji iPhone tidak bisa diambil, pakai emoji Noto')

  // ----- isi bubble -----
  let cy = by
  if (pic) {
    layers.push({ input: pic.input, left: bx + STYLE.padX, top: by + 14 })
    cy += picShift
  }
  const baseY = cy + firstBase // baseline baris pertama
  layers.push({ input: body.input, left: bx + STYLE.padX, top: Math.round(baseY - mTxt.base) })
  const timeBase = oneLine ? baseY + 12 : by + bubbleH - 17
  layers.push({ input: stamp.input, left: bx + bubbleW - padR - stamp.width, top: Math.round(timeBase - mTime.base) })

  // ----- menu -----
  const mMenu = await metrics(STYLE.menuSize)
  for (let i = 0; i < MENU.length; i++) {
    const [label, ic, color] = MENU[i]
    const rowTop = GEO.menuY + GEO.row * i
    const mid = rowTop + GEO.row / 2
    const tx = await textImage(label, { size: STYLE.menuSize, color })
    layers.push({ input: tx.input, left: 49, top: Math.round(mid + mMenu.cap / 2 - mMenu.base) })
    layers.push({ input: icon(ic, color === STYLE.red ? color : '#ececee', 62), left: GEO.menuW - 62 - 48, top: Math.round(mid - 31) })
    if (i < MENU.length - 1) {
      layers.push({ input: svg(GEO.menuW, 2, `<rect width="${GEO.menuW}" height="2" fill="#fff" fill-opacity=".14"/>`), left: 0, top: Math.round(rowTop + GEO.row - 1) })
    }
  }

  return sharp(bg).composite(layers).removeAlpha().png().toBuffer()
}

export const iqc2Font = FONT.label
