// Pembuat gambar fake chat dan meme. Semua digambar sendiri dengan sharp:
// bentuk lewat SVG (tanpa teks), teks lewat Pango dengan font dari folder assets.
import sharp from 'sharp'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

import path from 'node:path'

const asset = (name) => {
  const p1 = fileURLToPath(new URL(`../assets/${name}`, import.meta.url))
  if (fs.existsSync(p1)) return p1
  const p2 = fileURLToPath(new URL(`./assets/${name}`, import.meta.url))
  if (fs.existsSync(p2)) return p2
  const p3 = path.join(process.cwd(), 'assets', name)
  if (fs.existsSync(p3)) return p3
  return p1
}
const FONT_REG = asset('LiberationSans-Regular.ttf')
const FONT_BOLD = asset('LiberationSans-Bold.ttf')
const FONT_EMOJI = asset('NotoColorEmoji.ttf')
const HAS_EMOJI = fs.existsSync(FONT_EMOJI)

// Teks dirender K kali lebih besar lalu dikecilkan: hasilnya tajam, dan emoji
// (bitmap berukuran tetap) tampil proporsional terhadap teks.
const K = 3
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 }

// Mendaftarkan font ke sistem font (sekali saat modul dimuat)
for (const [file, family] of [[FONT_REG, 'Liberation Sans'], [FONT_BOLD, 'Liberation Sans Bold'], [FONT_EMOJI, 'Noto Color Emoji']]) {
  if (!fs.existsSync(file)) continue
  await sharp({ text: { text: 'x', font: `${family} 20`, fontfile: file, dpi: 72, rgba: true } }).png().toBuffer()
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const svg = (w, h, inner, defs = '') =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${defs}</defs>${inner}</svg>`
  )

// ---------- teks dan emoji ----------

async function textImage(text, { size, color = '#ffffff', bold = false, width = 0, lineHeight = 0, trim = false }) {
  const opts = {
    text: `<span foreground="${color}">${esc(text)}</span>`,
    font: `${bold ? 'Liberation Sans Bold' : 'Liberation Sans'} ${Math.round(size * K)}`,
    fontfile: bold ? FONT_BOLD : FONT_REG,
    dpi: 72,
    rgba: true,
    wrap: 'word-char',
    align: 'left'
  }
  if (width) opts.width = Math.round(width * K)
  // spacing = tambahan jarak antarbaris (px), bukan tinggi baris. Tinggi baris bawaan font sekitar 1.014 x ukuran.
  if (lineHeight) opts.spacing = Math.max(0, Math.round(K * (lineHeight - 1.014 * size)))

  const big = await sharp({ text: opts }).png().toBuffer({ resolveWithObject: true })
  let img = sharp(big.data)
  if (trim) img = sharp(await img.trim().png().toBuffer())
  const meta = await img.metadata()
  const w = Math.max(1, Math.round(meta.width / K))
  const h = Math.max(1, Math.round(meta.height / K))
  const input = await img.resize(w, h).png().toBuffer()
  return { input, width: w, height: h }
}

// Satu emoji, dikecilkan ke kotak box x box. Tanpa font emoji, hasilnya null.
async function emojiImage(ch, box) {
  if (!HAS_EMOJI) return null
  const raw = await sharp({ text: { text: ch, font: 'Noto Color Emoji 100', fontfile: FONT_EMOJI, dpi: 72, rgba: true } }).png().toBuffer()
  const { data, info } = await sharp(raw)
    .trim()
    .resize(box, box, { fit: 'inside' })
    .png()
    .toBuffer({ resolveWithObject: true })
  return { input: data, width: info.width, height: info.height }
}

// ---------- bentuk ----------

// Bentuk lembut (bayangan atau latar buram). Mengembalikan layer dengan margin supaya blur tidak terpotong.
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

const rrect = (w, h, r, fill) =>
  svg(w, h, `<rect width="${w}" height="${h}" rx="${r}" ry="${r}" fill="${fill}"/>`)

// Foto bulat. Kalau tidak ada foto: lingkaran berwarna dengan huruf awal nama.
async function circleAvatar(buf, d, name, color = '#a7a2b8') {
  const mask = svg(d, d, `<circle cx="${d / 2}" cy="${d / 2}" r="${d / 2}" fill="#fff"/>`)
  if (buf) {
    return sharp(buf)
      .resize(d, d, { fit: 'cover' })
      .composite([{ input: mask, blend: 'dest-in' }])
      .png()
      .toBuffer()
  }
  const base = svg(d, d, `<circle cx="${d / 2}" cy="${d / 2}" r="${d / 2}" fill="${color}"/>`)
  const ini = await textImage((Array.from(name || '?')[0] || '?').toUpperCase(), { size: d * 0.46, bold: true, trim: true })
  return sharp(base)
    .composite([{ input: ini.input, left: Math.round((d - ini.width) / 2), top: Math.round((d - ini.height) / 2) }])
    .png()
    .toBuffer()
}

// Ikon kecil dalam kotak 24x24, diskalakan ke ukuran yang diminta
const ICONS = {
  star: (c) => `<polygon points="12,2.5 14.9,8.8 21.8,9.6 16.7,14.3 18.1,21.2 12,17.8 5.9,21.2 7.3,14.3 2.2,9.6 9.1,8.8" fill="none" stroke="${c}" stroke-width="1.8" stroke-linejoin="round"/>`,
  replyO: (c) => `<path d="M9.5 8.5V4.5L3 11l6.5 6.5v-4c5 0 8 1.4 10.5 5C19 13 15.5 9 9.5 8.5z" fill="none" stroke="${c}" stroke-width="1.8" stroke-linejoin="round"/>`,
  forwardO: (c) => `<g transform="translate(24,0) scale(-1,1)"><path d="M9.5 8.5V4.5L3 11l6.5 6.5v-4c5 0 8 1.4 10.5 5C19 13 15.5 9 9.5 8.5z" fill="none" stroke="${c}" stroke-width="1.8" stroke-linejoin="round"/></g>`,
  copyO: (c) => `<rect x="8" y="8" width="12" height="13" rx="2" fill="none" stroke="${c}" stroke-width="1.8"/><path d="M16 8V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2" fill="none" stroke="${c}" stroke-width="1.8"/>`,
  trashO: (c) => `<path d="M4 7h16M10 7V4h4v3M6 7l1 14h10l1-14M10 11v6M14 11v6" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
  reply: (c) => `<path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z" fill="${c}"/>`,
  forward: (c) => `<g transform="translate(24,0) scale(-1,1)"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z" fill="${c}"/></g>`,
  copy: (c) => `<path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" fill="${c}"/>`,
  translate: (c) => `<rect x="2" y="5" width="20" height="14" rx="3" fill="${c}"/><path d="M5.5 15l2.2-6 2.2 6M6.3 13h2.8" stroke="#fff" stroke-width="1.4" fill="none"/><path d="M13 9h5M15.5 8v1.5M14 14c2-1 3.2-2.5 3.8-4.5M14.5 11c.6 1.7 1.8 3 3.5 3.8" stroke="#fff" stroke-width="1.2" fill="none"/>`,
  trash: (c) => `<path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="${c}"/>`,
  flag: (c) => `<path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z" fill="${c}"/>`,
  camera: (c) => `<path d="M9 4L7.2 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3.2L15 4H9z" fill="${c}"/><circle cx="12" cy="13" r="3.6" fill="#fff"/>`,
  image: (c) => `<rect x="2" y="3" width="20" height="18" rx="3" fill="${c}"/><circle cx="8" cy="9" r="2" fill="#fff"/><path d="M3 18l6-6 4 4 3-3 5 5z" fill="#fff"/>`,
  palette: (c) => `<circle cx="12" cy="12" r="10" fill="${c}"/><circle cx="8" cy="10" r="1.6" fill="#fff"/><circle cx="16" cy="10" r="1.6" fill="#fff"/><path d="M7.5 15c1.2 2.6 7.8 2.6 9 0" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round"/>`,
  mic: (c) => `<rect x="9" y="2" width="6" height="12" rx="3" fill="${c}"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8" stroke="${c}" stroke-width="2" fill="none" stroke-linecap="round"/>`
}
const icon = (name, color, size) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">${ICONS[name](color)}</svg>`)

// ===================================================================
// IQC: chat iPhone mode gelap
// ===================================================================
export async function renderIqc({ text, time = '12.00', image = null }) {
  const W = 941
  const H = 1671
  const layers = []

  // Latar buram: avatar abu-abu, bubble samar, dan bubble hijau di kanan
  const blurred = await sharp(
    svg(
      W,
      H,
      `<circle cx="200" cy="112" r="36" fill="#3a3a3c"/><circle cx="105" cy="265" r="36" fill="#3a3a3c"/><circle cx="105" cy="522" r="36" fill="#3a3a3c"/>
       <rect x="150" y="90" width="480" height="40" rx="20" fill="#151517"/><rect x="170" y="230" width="520" height="70" rx="26" fill="#111113"/>
       <rect x="170" y="470" width="480" height="110" rx="26" fill="#111113"/><rect x="170" y="700" width="420" height="60" rx="26" fill="#0e0e10"/>
       <rect x="640" y="1010" width="250" height="175" rx="40" fill="#0b2a2a"/><rect x="640" y="1260" width="130" height="90" rx="30" fill="#0d0d0d"/>`
    )
  )
    .blur(16)
    .png()
    .toBuffer()
  layers.push({ input: blurred, left: 0, top: 0 })

  // Bilah status: pesawat, wifi, jam, kunci rotasi, persen baterai
  const clock = await textImage(time.replace('.', ':'), { size: 25, bold: true })
  layers.push({ input: clock.input, left: Math.round(W / 2 - clock.width / 2), top: 8 })
  const pct = await textImage('70%', { size: 24 })
  layers.push({
    input: svg(
      W,
      44,
      `<g transform="translate(14,6) rotate(0)"><path d="M24 15v-2l-9-5.5V3a1.6 1.6 0 0 0-3.2 0v4.5L3 13v2l8.8-2.6V18l-2.3 1.7V21l3.9-1 3.9 1v-1.3L15 18v-5.6z" fill="#fff" transform="scale(1.05) rotate(90 12 12) translate(0,0)"/></g>
       <g transform="translate(62,10)" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round"><path d="M1 8a15 15 0 0 1 28 0"/><path d="M6 13.5a9 9 0 0 1 18 0"/><circle cx="15" cy="19" r="2" fill="#fff" stroke="none"/></g>
       <g transform="translate(748,8)"><circle cx="14" cy="14" r="11" fill="none" stroke="#fff" stroke-width="2.4"/><rect x="9" y="12" width="10" height="8" rx="1.5" fill="#fff"/><path d="M11 12v-2.5a3 3 0 0 1 6 0V12" stroke="#fff" stroke-width="2" fill="none"/></g>
       <g transform="translate(868,10)"><rect x="0" y="0" width="52" height="25" rx="7" fill="none" stroke="#8e8e93" stroke-width="2"/><rect x="3" y="3" width="46" height="19" rx="4.5" fill="#fff"/><rect x="54" y="8" width="3.5" height="9" rx="1.5" fill="#8e8e93"/></g>`
    ),
    left: 0,
    top: 0
  })
  layers.push({ input: pct.input, left: 782, top: 9 })

  // Bubble pesan (kanan atas diratakan: bubble masuk dari lawan bicara)
  const padX = 22
  const maxText = 520
  const body = await textImage(text, { size: 30, color: '#f2f2f7', width: maxText, lineHeight: 35 })
  const stamp = await textImage(time, { size: 19, color: '#8e8e93' })
  let pic = null
  if (image) {
    const resized = await sharp(image).rotate().resize({ width: maxText, withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true })
    const mask = svg(resized.info.width, resized.info.height, `<rect width="${resized.info.width}" height="${resized.info.height}" rx="16" ry="16" fill="#fff"/>`)
    pic = {
      input: await sharp(resized.data).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer(),
      width: resized.info.width,
      height: resized.info.height
    }
  }
  const oneLine = body.height < 52
  const innerW = Math.max(pic ? pic.width : 0, oneLine ? body.width + 40 + stamp.width : Math.max(body.width, stamp.width))
  const bubbleW = innerW + padX * 2
  const bubbleH = 17 + (pic ? pic.height + 8 : 0) + body.height + 7 + stamp.height + 15

  const BUBBLE_BOTTOM = 946
  const bx = 43
  const by = BUBBLE_BOTTOM - bubbleH
  const BUBBLE = '#1f1f21'

  // Reaksi di atas bubble
  const pillW = 545
  const pillH = 100
  const py = by - 20 - pillH
  layers.push(await softBox(bx, py, pillW, pillH, 50, '#000', 0.5, 8))
  layers.push({ input: rrect(pillW, pillH, 50, '#1c1c1e'), left: bx, top: py })
  const reactions = ['👍', '❤️', '😂', '😮', '😢', '🙏']
  const centers = [98, 173, 250, 326, 402, 477]
  for (let i = 0; i < reactions.length; i++) {
    const e = await emojiImage(reactions[i], 58)
    if (e) layers.push({ input: e.input, left: centers[i] - Math.round(e.width / 2), top: py + Math.round((pillH - e.height) / 2) })
  }
  const plus = await textImage('+', { size: 36, color: '#8e8e93', trim: true })
  layers.push({ input: plus.input, left: 546 - Math.round(plus.width / 2), top: py + Math.round((pillH - plus.height) / 2) })

  // Bubble + ekor di kiri bawah
  layers.push({ input: rrect(bubbleW, bubbleH, 26, BUBBLE), left: bx, top: by })
  layers.push({
    input: svg(30, 30, `<path d="M30 0 L30 30 L8 30 C20 26 26 18 30 0Z" fill="${BUBBLE}" transform="translate(0,0)"/><path d="M30 12 C26 22 18 28 4 30 C14 22 18 18 22 8Z" fill="${BUBBLE}"/>`),
    left: bx - 14,
    top: BUBBLE_BOTTOM - 30
  })
  let cy = by + 17
  if (pic) {
    layers.push({ input: pic.input, left: bx + padX, top: cy })
    cy += pic.height + 8
  }
  layers.push({ input: body.input, left: bx + padX, top: cy })
  layers.push({ input: stamp.input, left: bx + bubbleW - padX - stamp.width, top: cy + body.height + 7 })

  // Menu konteks
  const MX = 38
  const MY = 990
  const MW = 629
  const ROW = 101.5
  const rows = [
    ['Beri Bintang', 'star', '#f2f2f7'],
    ['Balas', 'replyO', '#f2f2f7'],
    ['Teruskan', 'forwardO', '#f2f2f7'],
    ['Salin', 'copyO', '#f2f2f7'],
    ['Hapus', 'trashO', '#ff6259']
  ]
  const MH = Math.round(ROW * rows.length)
  layers.push(await softBox(MX, MY + 6, MW, MH, 36, '#000', 0.45, 10))
  layers.push({ input: rrect(MW, MH, 36, '#1c1c1e'), left: MX, top: MY })
  for (let i = 0; i < rows.length; i++) {
    const [label, ic, color] = rows[i]
    const t = await textImage(label, { size: 35, color })
    const top = Math.round(MY + ROW * i)
    layers.push({ input: t.input, left: MX + 36, top: top + Math.round((ROW - t.height) / 2) })
    layers.push({ input: icon(ic, color, 46), left: MX + MW - 46 - 24, top: top + Math.round((ROW - 46) / 2) })
    if (i < rows.length - 1) layers.push({ input: svg(MW, 2, `<rect width="${MW}" height="2" fill="#0c0c0d"/>`), left: MX, top: top + Math.round(ROW) - 1 })
  }
  const LY = MY + MH + 18
  layers.push({ input: rrect(MW, 104, 36, '#1c1c1e'), left: MX, top: LY })
  const more = await textImage('Lainnya...', { size: 35, color: '#f2f2f7' })
  layers.push({ input: more.input, left: MX + 36, top: LY + Math.round((104 - more.height) / 2) })

  return sharp({ create: { width: W, height: H, channels: 3, background: '#050505' } })
    .composite(layers)
    .png()
    .toBuffer()
}


// ===================================================================
// TTQC: chat bergaya TikTok mode terang
// ===================================================================
export async function renderTtqc({ name = 'User', text, avatar = null }) {
  const W = 1080
  const H = 2280
  const layers = []
  const DARK = '#1b1b1f'

  // Latar buram: bubble ungu di kanan dan blok teks di kiri
  const bg = await sharp(
    svg(
      W,
      H,
      `<rect x="700" y="518" width="318" height="115" rx="57" fill="#dccdfa"/><rect x="742" y="1270" width="276" height="125" rx="57" fill="#dccdfa"/><rect x="848" y="1650" width="170" height="125" rx="57" fill="#dccdfa"/>
       <rect x="164" y="265" width="480" height="100" rx="20" fill="#e6e1ea"/><rect x="164" y="425" width="290" height="50" rx="20" fill="#e6e1ea"/>
       <circle cx="75" cy="452" r="38" fill="#cfb7b9"/><circle cx="75" cy="1518" r="38" fill="#cfb7b9"/><rect x="164" y="1900" width="150" height="40" rx="20" fill="#e6e1ea"/>`
    )
  )
    .blur(13)
    .png()
    .toBuffer()
  layers.push({ input: bg, left: 0, top: 0 })

  // Header: panah kembali, foto, nama, titik tiga
  layers.push({
    input: svg(W, 170, `<polyline points="88,56 64,84 88,112" fill="none" stroke="${DARK}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="976" cy="85" r="7" fill="#3a3a40"/><circle cx="1001" cy="85" r="7" fill="#3a3a40"/><circle cx="1026" cy="85" r="7" fill="#3a3a40"/>`),
    left: 0,
    top: 0
  })
  layers.push({ input: await circleAvatar(avatar, 84, name), left: 140, top: 41 })
  const title = await textImage(name, { size: 33, bold: true, color: DARK, width: 600 })
  layers.push({ input: title.input, left: 248, top: 83 - Math.round(title.height / 2) })

  // Bubble pesan
  const BX = 146
  const BY = 938
  const PAD = 26
  const body = await textImage(text, { size: 30, color: '#1f1f24', width: 470, lineHeight: 40 })
  const bubbleW = Math.max(body.width + PAD * 2 + 8, 150)
  const bubbleH = body.height + PAD * 2 - 4
  const radius = Math.min(40, Math.round(bubbleH / 2))
  layers.push({ input: rrect(bubbleW, bubbleH, radius, '#ffffff'), left: BX, top: BY })
  layers.push({ input: body.input, left: BX + PAD + 4, top: BY + PAD - 2 })
  layers.push({ input: await circleAvatar(avatar, 76, name), left: 37, top: BY + Math.round((bubbleH - 76) / 2) })

  // Reaksi di atas bubble
  const PX = 126
  const PY = 759
  layers.push(await softBox(PX, PY + 8, 824, 139, 70, '#000', 0.13, 12))
  layers.push({ input: rrect(824, 139, 70, '#fdfdfd'), left: PX, top: PY })
  const reacts = ['❤️', '😂', '😭', '👍', '😡', '🤔']
  const rc = [212, 345, 474, 602, 727, 851]
  for (let i = 0; i < reacts.length; i++) {
    const e = await emojiImage(reacts[i], 86)
    if (e) layers.push({ input: e.input, left: rc[i] - Math.round(e.width / 2), top: PY + Math.round((139 - e.height) / 2) })
  }

  // Menu konteks di bawah bubble
  const MX = 90
  const MY = BY + bubbleH + 30
  const MW = 564
  const MH = 577
  layers.push(await softBox(MX, MY + 8, MW, MH, 40, '#000', 0.13, 14))
  layers.push({ input: rrect(MW, MH, 40, '#ffffff'), left: MX, top: MY })
  const items = [
    ['Balas', 'reply', DARK],
    ['Teruskan', 'forward', DARK],
    ['Salin', 'copy', DARK],
    ['Terjemahkan', 'translate', DARK],
    ['Hapus untuk saya', 'trash', DARK],
    ['Laporkan', 'flag', '#f0402f']
  ]
  for (let i = 0; i < items.length; i++) {
    const [label, ic, color] = items[i]
    const cy = MY + 69 + i * 90
    const t = await textImage(label, { size: 35, color })
    layers.push({ input: t.input, left: MX + 130, top: cy - Math.round(t.height / 2) })
    layers.push({ input: icon(ic, color, 40), left: MX + 40, top: cy - 20 })
  }

  // Baris reaksi cepat di bawah
  const QY = 1993
  const QH = 85
  const quick = [[39, 131, '❤️'], [192, 130, '😂'], [345, 126, '👍'], [492, 128, '👆']]
  for (const [x, w, em] of quick) {
    layers.push({ input: rrect(w, QH, 43, '#f1eff2'), left: x, top: QY })
    const e = await emojiImage(em, 54)
    if (e) layers.push({ input: e.input, left: x + Math.round((w - e.width) / 2), top: QY + Math.round((QH - e.height) / 2) })
  }
  layers.push({ input: rrect(279, QH, 43, '#f1eff2'), left: 641, top: QY })
  layers.push({ input: svg(52, 52, `<circle cx="26" cy="26" r="26" fill="#f6a23a"/><circle cx="26" cy="26" r="16" fill="#f9c46d"/>`), left: 655, top: QY + 17 })
  const streak = await textImage('Streak Pet', { size: 28, bold: true, color: DARK })
  layers.push({ input: streak.input, left: 718, top: QY + Math.round((QH - streak.height) / 2) })
  layers.push({ input: rrect(108, QH, 43, '#f1eff2'), left: 943, top: QY })
  layers.push({ input: svg(52, 48, `<rect x="2" y="8" width="42" height="34" rx="10" fill="#8a5cf6"/><rect x="8" y="2" width="42" height="34" rx="10" fill="#6d3df0"/><path d="M22 12l14 8-14 8z" fill="#fff"/>`), left: 971, top: QY + 19 })

  // Kolom ketik
  layers.push({ input: icon('camera', DARK, 56), left: 49, top: 2139 })
  layers.push({ input: rrect(848, 106, 53, '#efedf0'), left: 136, top: 2115 })
  const ph = await textImage('Kirim pesan...', { size: 30, color: '#9a98a0' })
  layers.push({ input: ph.input, left: 171, top: 2168 - Math.round(ph.height / 2) })
  layers.push({ input: icon('image', '#3a3a40', 52), left: 698, top: 2142 })
  layers.push({ input: icon('palette', '#3a3a40', 52), left: 797, top: 2142 })
  layers.push({ input: icon('mic', '#3a3a40', 50), left: 898, top: 2143 })

  return sharp({ create: { width: W, height: H, channels: 3, background: '#f6f4f7' } })
    .composite(layers)
    .png()
    .toBuffer()
}


// ===================================================================
// WINDOWS: meme Windows Media Player
// ===================================================================
function arcPath(cx, cy, r, a0, a1) {
  const rad = (a) => (a * Math.PI) / 180
  const x0 = cx + r * Math.cos(rad(a0))
  const y0 = cy + r * Math.sin(rad(a0))
  const x1 = cx + r * Math.cos(rad(a1))
  const y1 = cy + r * Math.sin(rad(a1))
  return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`
}

export async function renderWindows({ text }) {
  const W = 1080
  const H = 1347
  const layers = []

  // Latar buram: desktop biru dengan pita terang di atas dan bawah
  const bg = await sharp(
    svg(
      W,
      H,
      `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#93a7dc"/><stop offset=".12" stop-color="#6b86e4"/><stop offset=".35" stop-color="#1a3fe0"/><stop offset=".85" stop-color="#2a50e6"/><stop offset="1" stop-color="#9db0e8"/></linearGradient></defs>
       <rect width="${W}" height="${H}" fill="url(#bg)"/>
       <rect x="0" y="20" width="${W}" height="95" fill="#e9edf8" opacity=".85"/><rect x="20" y="55" width="120" height="30" rx="8" fill="#9aa3bd"/><rect x="170" y="55" width="100" height="30" rx="8" fill="#9aa3bd"/><rect x="300" y="55" width="110" height="30" rx="8" fill="#9aa3bd"/>
       <rect x="0" y="1215" width="${W}" height="132" fill="#c5d0f2" opacity=".8"/><rect x="40" y="1250" width="170" height="40" rx="10" fill="#7d93da"/><rect x="420" y="1255" width="230" height="45" rx="10" fill="#4f9a55" opacity=".8"/>`
    )
  )
    .blur(18)
    .png()
    .toBuffer()
  layers.push({ input: bg, left: 0, top: 0 })

  // Bayangan jendela
  layers.push(await softBox(32, 152, 1016, 1060, 22, '#000', 0.35, 10))

  // Bingkai jendela, bilah judul, dan panel kontrol
  layers.push({
    input: svg(
      W,
      H,
      `<defs>
        <linearGradient id="title" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3f77ff"/><stop offset=".45" stop-color="#1a50ee"/><stop offset="1" stop-color="#0c3fdc"/></linearGradient>
        <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7d9cee"/><stop offset=".25" stop-color="#4a6ad0"/><stop offset="1" stop-color="#2b45a6"/></linearGradient>
        <linearGradient id="prog" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e6ebf8"/><stop offset="1" stop-color="#a9b8de"/></linearGradient>
       </defs>
       <rect x="18" y="133" width="1044" height="1072" rx="22" ry="22" fill="#0b3fd9"/>
       <path d="M18 155a22 22 0 0 1 22-22h1000a22 22 0 0 1 22 22v78H18z" fill="url(#title)"/>
       <rect x="32" y="234" width="1016" height="66" fill="#f3f3f5"/>
       <rect x="36" y="302" width="660" height="33" fill="url(#prog)"/>
       <rect x="696" y="302" width="348" height="33" fill="#2a4fc8"/>
       <g stroke="#9bb2ee" stroke-width="2"><line x1="768" y1="304" x2="768" y2="333"/><line x1="830" y1="304" x2="830" y2="333"/><line x1="896" y1="304" x2="896" y2="333"/></g>
       <g fill="none" stroke="#e8eeff" stroke-width="2"><rect x="788" y="309" width="24" height="18" rx="2"/><rect x="852" y="312" width="16" height="12" rx="2"/><rect x="926" y="309" width="22" height="18" rx="2"/></g>
       <rect x="36" y="335" width="1008" height="673" fill="#fcfcfc"/>
       <path d="M36 335V1008H1044" fill="none" stroke="#2b2b30" stroke-width="3"/>
       <rect x="36" y="1012" width="1008" height="30" rx="8" fill="#f2f5fc" stroke="#6f86cf" stroke-width="2"/>
       <rect x="30" y="1046" width="1020" height="152" rx="16" fill="url(#panel)" stroke="#1d3190" stroke-width="3"/>
       <rect x="36" y="1052" width="1008" height="140" rx="12" fill="none" stroke="#7f9ff0" stroke-width="2" opacity=".6"/>`
    ),
    left: 0,
    top: 0
  })

  // Judul dan logo
  const title = await textImage('Windows Media Player', { size: 40, bold: true, color: '#ffffff' })
  layers.push({ input: title.input, left: 108, top: 183 - Math.round(title.height / 2) })
  layers.push({
    input: svg(80, 80, `<g fill="none" stroke-width="9" stroke-linecap="butt"><path d="${arcPath(40, 40, 27, 200, 320)}" stroke="#f08a1d"/><path d="${arcPath(40, 40, 27, 320, 80)}" stroke="#35b44a"/><path d="${arcPath(40, 40, 27, 80, 200)}" stroke="#2f6fe8"/></g><circle cx="40" cy="40" r="20" fill="#f4f6fb"/><path d="M33 29l19 11-19 11z" fill="#2f6fe8"/>`),
    left: 24,
    top: 144
  })
  // Tombol minimize, maximize, close
  const winBtn = (x, fill, glyph) =>
    svg(70, 70, `<rect x="2" y="2" width="66" height="66" rx="9" fill="${fill}" stroke="#fff" stroke-width="3.5"/>${glyph}`)
  layers.push({ input: winBtn(0, '#2b62f0', '<rect x="21" y="44" width="28" height="8" fill="#fff"/>'), left: 823, top: 152 })
  layers.push({ input: winBtn(0, '#2b62f0', '<rect x="18" y="16" width="34" height="34" fill="none" stroke="#fff" stroke-width="5"/><rect x="18" y="16" width="34" height="9" fill="#fff"/>'), left: 900, top: 152 })
  layers.push({ input: winBtn(0, '#d9452b', '<path d="M20 20L50 50M50 20L20 50" stroke="#fff" stroke-width="7" stroke-linecap="round"/>'), left: 975, top: 152 })

  // Bilah menu dengan huruf pertama bergaris bawah
  let mx = 50
  for (const word of ['File', 'View', 'Play', 'Tools', 'Help']) {
    const t = await textImage(word, { size: 34, color: '#111111' })
    const first = await textImage(word[0], { size: 34, color: '#111111', trim: true })
    layers.push({ input: t.input, left: mx, top: 267 - Math.round(t.height / 2) })
    layers.push({ input: svg(first.width + 2, 3, `<rect width="${first.width + 2}" height="3" fill="#111"/>`), left: mx + 1, top: 267 + Math.round(t.height / 2) - 3 })
    mx += t.width + 48
  }

  // Teks utama: tebal, rata kiri, ukuran menyesuaikan panjang teks
  const len = text.length
  const size = len <= 16 ? 98 : len <= 40 ? 84 : len <= 80 ? 64 : len <= 140 ? 50 : 40
  const main = await textImage(text, { size, bold: true, color: '#161616', width: 480, lineHeight: Math.round(size * 1.36) })
  const maxH = 600
  let mainImg = main.input
  let mainH = main.height
  if (main.height > maxH) {
    const sc = maxH / main.height
    mainImg = await sharp(main.input).resize(Math.round(main.width * sc), maxH).png().toBuffer()
    mainH = maxH
  }
  layers.push({ input: mainImg, left: 122, top: 385 })

  // Tokoh putih 3D yang mengangkat bahu (digambar dengan gradasi)
  layers.push(await softBox(640, 925, 300, 36, 18, '#6b6e80', 0.55, 14))
  layers.push({
    input: svg(
      W,
      H,
      `<defs>
        <radialGradient id="sph" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#d9dadf"/><stop offset="1" stop-color="#a3a4ad"/></radialGradient>
        <linearGradient id="lim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6f6f8"/><stop offset=".6" stop-color="#d4d5da"/><stop offset="1" stop-color="#b3b4bc"/></linearGradient>
       </defs>
       <g fill="none" stroke="url(#lim)" stroke-linecap="round" stroke-linejoin="round">
         <path d="M765 625 C720 645 690 640 640 610" stroke-width="34"/><path d="M830 625 C875 645 905 640 955 610" stroke-width="34"/>
         <path d="M780 790 L772 920" stroke-width="42"/><path d="M815 790 L826 920" stroke-width="42"/>
       </g>
       <ellipse cx="797" cy="700" rx="62" ry="135" fill="url(#lim)"/>
       <ellipse cx="620" cy="600" rx="30" ry="18" fill="url(#lim)" transform="rotate(-18 620 600)"/><ellipse cx="975" cy="600" rx="30" ry="18" fill="url(#lim)" transform="rotate(18 975 600)"/>
       <ellipse cx="760" cy="925" rx="38" ry="17" fill="url(#lim)"/><ellipse cx="840" cy="925" rx="38" ry="17" fill="url(#lim)"/>
       <rect x="781" y="560" width="32" height="40" rx="14" fill="url(#lim)"/>
       <circle cx="797" cy="506" r="72" fill="url(#sph)"/>`
    ),
    left: 0,
    top: 0
  })

  // Kontrol pemutar di panel bawah
  layers.push({
    input: svg(
      W,
      H,
      `<defs>
        <radialGradient id="btn" cx=".4" cy=".3" r=".9"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#c9d2ee"/><stop offset="1" stop-color="#6f83c8"/></radialGradient>
        <linearGradient id="thumb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8f8d9"/><stop offset="1" stop-color="#8fcf6a"/></linearGradient>
        <linearGradient id="vol" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#bff0a4"/><stop offset="1" stop-color="#3fae3a"/></linearGradient>
       </defs>
       <circle cx="100" cy="1112" r="54" fill="#2a3f9c"/><circle cx="100" cy="1112" r="49" fill="url(#btn)"/><path d="M85 1088l42 24-42 24z" fill="#1f4ed6"/>
       <ellipse cx="188" cy="1130" rx="27" ry="37" fill="#2a3f9c"/><ellipse cx="188" cy="1130" rx="23" ry="33" fill="url(#btn)"/><rect x="179" y="1121" width="18" height="18" fill="#1f4ed6"/>
       <rect x="270" y="1072" width="695" height="10" rx="5" fill="#2a3f9c" opacity=".85"/><rect x="270" y="1074" width="695" height="4" rx="2" fill="#6f8cea"/>
       <g fill="#eaf0ff"><path d="M225 1062l-18 11 18 11zM243 1062l-18 11 18 11z"/><path d="M985 1062l18 11-18 11zM1003 1062l18 11-18 11z"/></g>
       <rect x="262" y="1052" width="30" height="52" rx="9" fill="url(#thumb)" stroke="#5a7fb8" stroke-width="2.5"/>
       <ellipse cx="265" cy="1148" rx="36" ry="21" fill="#2a3f9c"/><ellipse cx="265" cy="1148" rx="32" ry="17" fill="url(#btn)"/><path d="M252 1139v18M258 1139v18l14-9z" stroke="#1f4ed6" stroke-width="3.5" fill="#1f4ed6"/>
       <ellipse cx="340" cy="1148" rx="36" ry="21" fill="#2a3f9c"/><ellipse cx="340" cy="1148" rx="32" ry="17" fill="url(#btn)"/><path d="M328 1139l14 9-14 9zM350 1139v18" stroke="#1f4ed6" stroke-width="3.5" fill="#1f4ed6"/>
       <ellipse cx="457" cy="1146" rx="38" ry="23" fill="#2a3f9c"/><ellipse cx="457" cy="1146" rx="34" ry="19" fill="url(#btn)"/><path d="M440 1146l14-10v20zM460 1136h20M460 1146h20M460 1156h20" stroke="#1f4ed6" stroke-width="3.5" fill="#1f4ed6"/>
       <path d="M520 1160l108-14v14z" fill="url(#vol)" stroke="#2f7f2a" stroke-width="1.5"/><rect x="618" y="1118" width="26" height="54" rx="9" fill="url(#thumb)" stroke="#5a7fb8" stroke-width="2.5"/>`
    ),
    left: 0,
    top: 0
  })

  return sharp({ create: { width: W, height: H, channels: 3, background: '#2a50e6' } })
    .composite(layers)
    .png()
    .toBuffer()
}
