// Renderer FAKECHATML: tampilan chat teman Mobile Legends (tab Teman, bubble ungu, bintang, ikon translate)
// Ukuran 940x1080 (sama dengan screenshot referensi). Hanya butuh sharp.
// Aset dibaca dari ../assets/ :
//   Inter-Regular.ttf, Inter-Bold.ttf  (teks)   DejaVuSerif-Bold.ttf (tab "Teman"/"Squad")   NotoColorEmoji.ttf (emoji)
//   Aset MENTAHAN opsional (kalau ada, otomatis dipakai menggantikan gambar vektor bawaan):
//     assets/ml/border.png     border/frame foto profil (PNG transparan, dibuat 'contain' di kotak 128x128)
//     assets/ml/rank.png       ikon rank di samping nama
//     assets/ml/star.png       bintang di pojok kanan atas bubble
//     assets/ml/translate.png  ikon terjemah di kanan bubble
//     assets/ml/bunny.png      siluet kelinci di latar (PNG transparan, ditaruh di kanan bawah)
import sharp from 'sharp'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const asset = (n) => fileURLToPath(new URL(`../assets/${n}`, import.meta.url))
const W = 940
const H = 1080
const K = 3 // teks dirender K kali lebih besar lalu dikecilkan supaya tajam

const COLORS = {
  bg: '#1e2d44',
  tag: '#e8c46a',
  name: '#a9bfd8',
  chat: '#f1f1f6',
  stamp: '#4f6489',
  notice: '#c6cedb',
  tabText: '#c9ecff',
  tabOff: '#a8c6e6'
}

const GEO = {
  firstRow: 152, // atas avatar baris pertama
  bubbleTop: 51, // atas bubble relatif ke atas avatar
  bubbleX: 152, // sisi kiri badan bubble
  textPadL: 29,
  textPadR: 37,
  maxText: 520, // lebar maksimal teks pesan sebelum turun baris
  chatCenterX: 478, // titik tengah area chat (jam & pengumuman)
  maxRows: 4
}

// ---------- util ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const svg = (w, h, inner, defs = '') =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${defs}</defs>${inner}</svg>`
  )
const optional = (name) => {
  try {
    const p = asset(`ml/${name}`)
    return fs.existsSync(p) ? fs.readFileSync(p) : null
  } catch {
    return null
  }
}

// ---------- font ----------
const probe = async (spec, file) =>
  createHash('sha1')
    .update(
      await sharp({ text: { text: 'Rama iya sayang 123', font: `${spec} 60`, fontfile: file, dpi: 72, rgba: true } })
        .png()
        .toBuffer()
    )
    .digest('hex')

// Pilih font pertama yang benar-benar terbaca Pango (hasilnya harus beda dari font cadangan bawaan)
async function pickFont(sets) {
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

const SANS = await pickFont([
  { label: 'Inter', file: asset('Inter-Regular.ttf'), specs: ['Inter 24pt', 'Inter 24pt Regular', 'Inter', 'Inter Regular'] },
  { label: 'Liberation Sans', file: asset('LiberationSans-Regular.ttf'), specs: ['Liberation Sans'] }
])
const SANSB = await pickFont([
  { label: 'Inter Bold', file: asset('Inter-Bold.ttf'), specs: ['Inter 24pt Bold', 'Inter Bold', 'Inter'] },
  { label: 'Liberation Sans Bold', file: asset('LiberationSans-Bold.ttf'), specs: ['Liberation Sans Bold'] }
])
const SERIFB = await pickFont([
  { label: 'DejaVu Serif Bold', file: asset('DejaVuSerif-Bold.ttf'), specs: ['DejaVu Serif Bold', 'DejaVu Serif'] },
  { label: 'Inter Bold', file: asset('Inter-Bold.ttf'), specs: ['Inter 24pt Bold', 'Inter Bold', 'Inter'] },
  { label: 'Liberation Sans Bold', file: asset('LiberationSans-Bold.ttf'), specs: ['Liberation Sans Bold'] }
])
console.log(`[fakeml] font: teks=${SANS.label}, tab=${SERIFB.label}`)

const FONT_EMOJI = asset('NotoColorEmoji.ttf')
if (fs.existsSync(FONT_EMOJI)) {
  await sharp({ text: { text: 'x', font: 'Noto Color Emoji 20', fontfile: FONT_EMOJI, dpi: 72, rgba: true } }).png().toBuffer()
}

// ---------- teks ----------
const fontOpts = (f, size) => {
  const o = { font: `${f.spec} ${Math.round(size * K)}`, dpi: 72, rgba: true }
  if (f.file) o.fontfile = f.file
  return o
}

const pitchCache = new Map()
async function naturalPitch(f, size) {
  const key = `${f.spec}:${size}`
  if (pitchCache.has(key)) return pitchCache.get(key)
  const h = async (t) =>
    (await sharp({ text: { text: `<span foreground="#fff">${t}</span>`, ...fontOpts(f, size) } }).png().metadata()).height / K
  const v = (await h('Hg\nHg')) - (await h('Hg'))
  pitchCache.set(key, v)
  return v
}

async function textImage(f, text, { size, color = '#fff', width = 0, lineHeight = 0 }) {
  const opts = { text: `<span foreground="${color}">${esc(text)}</span>`, ...fontOpts(f, size), wrap: 'word-char', align: 'left' }
  if (width) opts.width = Math.round(width * K)
  if (lineHeight) opts.spacing = Math.round(K * (lineHeight - (await naturalPitch(f, size))))
  // ruang kanan ekstra supaya ujung huruf tidak kepotong
  const big = await sharp(await sharp({ text: opts }).png().toBuffer())
    .extend({ right: K * 3, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  const meta = await sharp(big).metadata()
  const w = Math.max(1, Math.round(meta.width / K))
  const h = Math.max(1, Math.round(meta.height / K))
  return { input: await sharp(big).resize(w, h).png().toBuffer(), width: w, height: h }
}

// Ukur huruf "H": jarak atas gambar ke baseline, dan tinggi huruf kapital
const metricCache = new Map()
async function metrics(f, size) {
  const key = `${f.spec}:${size}`
  if (metricCache.has(key)) return metricCache.get(key)
  const t = await textImage(f, 'H', { size })
  const { data, info } = await sharp(t.input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let top = -1
  let bottom = -1
  for (let y = 0; y < info.height; y++) {
    let any = false
    for (let x = 0; x < info.width && !any; x++) any = data[(y * info.width + x) * 4 + 3] > 40
    if (any) {
      if (top < 0) top = y
      bottom = y
    }
  }
  const m = { base: bottom + 1, cap: bottom - top + 1, one: t.height }
  metricCache.set(key, m)
  return m
}

// Cari ukuran font supaya teks contoh selebar target (dikalibrasi ke screenshot asli)
const calCache = new Map()
async function calibrated(key, f, sample, targetW, startSize) {
  if (calCache.has(key)) return calCache.get(key)
  const t = await textImage(f, sample, { size: startSize })
  const size = Math.round(startSize * (targetW / (t.width - 3)) * 10) / 10
  calCache.set(key, size)
  return size
}
const sizes = async () => ({
  name: await calibrated('name', SANS, 'Kaito x Vermouth', 230, 28),
  chat: await calibrated('chat', SANS, 'abcdefg hijk', 160, 29),
  stamp: await calibrated('stamp', SANS, '2026-11-01 10:00:27', 252, 25),
  notice: await calibrated('notice', SANS, 'Staf resmi MLBB tidak akan pernah meminta ID dan kata sandi akunmu dengan cara apa pun.', 850, 19),
  tab: await calibrated('tab', SERIFB, 'Teman', 104, 28),
  kirim: await calibrated('kirim', SANS, 'Kirim', 68, 26),
  badge: 17
})

// ---------- bendera sederhana ----------
const FLAGS = {
  id: (s) => `<rect width="${s}" height="${s / 2}" fill="#e70011"/><rect y="${s / 2}" width="${s}" height="${s / 2}" fill="#fff"/>`,
  de: (s) => `<rect width="${s}" height="${s / 3}" fill="#111"/><rect y="${s / 3}" width="${s}" height="${s / 3}" fill="#dd0000"/><rect y="${(2 * s) / 3}" width="${s}" height="${s / 3 + 1}" fill="#ffce00"/>`,
  nl: (s) => `<rect width="${s}" height="${s / 3}" fill="#ae1c28"/><rect y="${s / 3}" width="${s}" height="${s / 3}" fill="#fff"/><rect y="${(2 * s) / 3}" width="${s}" height="${s / 3 + 1}" fill="#21468b"/>`,
  ru: (s) => `<rect width="${s}" height="${s / 3}" fill="#fff"/><rect y="${s / 3}" width="${s}" height="${s / 3}" fill="#0039a6"/><rect y="${(2 * s) / 3}" width="${s}" height="${s / 3 + 1}" fill="#d52b1e"/>`,
  fr: (s) => `<rect width="${s / 3}" height="${s}" fill="#0055a4"/><rect x="${s / 3}" width="${s / 3}" height="${s}" fill="#fff"/><rect x="${(2 * s) / 3}" width="${s / 3 + 1}" height="${s}" fill="#ef4135"/>`,
  it: (s) => `<rect width="${s / 3}" height="${s}" fill="#009246"/><rect x="${s / 3}" width="${s / 3}" height="${s}" fill="#fff"/><rect x="${(2 * s) / 3}" width="${s / 3 + 1}" height="${s}" fill="#ce2b37"/>`,
  pl: (s) => `<rect width="${s}" height="${s / 2}" fill="#fff"/><rect y="${s / 2}" width="${s}" height="${s / 2}" fill="#dc143c"/>`,
  ua: (s) => `<rect width="${s}" height="${s / 2}" fill="#0057b7"/><rect y="${s / 2}" width="${s}" height="${s / 2}" fill="#ffd700"/>`,
  at: (s) => `<rect width="${s}" height="${s / 3}" fill="#ed2939"/><rect y="${s / 3}" width="${s}" height="${s / 3}" fill="#fff"/><rect y="${(2 * s) / 3}" width="${s}" height="${s / 3 + 1}" fill="#ed2939"/>`,
  hu: (s) => `<rect width="${s}" height="${s / 3}" fill="#cd2a3e"/><rect y="${s / 3}" width="${s}" height="${s / 3}" fill="#fff"/><rect y="${(2 * s) / 3}" width="${s}" height="${s / 3 + 1}" fill="#436f4d"/>`,
  th: (s) => `<rect width="${s}" height="${s}" fill="#a51931"/><rect y="${s / 6}" width="${s}" height="${(2 * s) / 3}" fill="#f4f5f8"/><rect y="${(1.33 * s) / 3}" width="${s}" height="${s / 3}" fill="#2d2a4a"/>`,
  jp: (s) => `<rect width="${s}" height="${s}" fill="#fff"/><circle cx="${s / 2}" cy="${s / 2}" r="${s * 0.26}" fill="#bc002d"/>`,
  sg: (s) => `<rect width="${s}" height="${s / 2}" fill="#ef3340"/><rect y="${s / 2}" width="${s}" height="${s / 2}" fill="#fff"/><circle cx="${s * 0.3}" cy="${s * 0.26}" r="${s * 0.13}" fill="#fff"/>`,
  us: (s) => {
    let r = `<rect width="${s}" height="${s}" fill="#fff"/>`
    for (let i = 0; i < 7; i++) r += `<rect y="${(i * 2 * s) / 13}" width="${s}" height="${s / 13}" fill="#b22234"/>`
    return r + `<rect width="${s * 0.5}" height="${(7 * s) / 13}" fill="#3c3b6e"/>`
  }
}
export const FLAG_CODES = Object.keys(FLAGS)

const flagSvg = (code, d) =>
  svg(
    d,
    d,
    `<g clip-path="url(#c)">${(FLAGS[code] || FLAGS.id)(d)}</g><circle cx="${d / 2}" cy="${d / 2}" r="${d / 2 - 1}" fill="none" stroke="#10182a" stroke-width="2"/>`,
    `<clipPath id="c"><circle cx="${d / 2}" cy="${d / 2}" r="${d / 2}"/></clipPath>`
  )

// ---------- gambar vektor (pengganti aset mentahan) ----------
const starPoints = (cx, cy, ro, ri) => {
  const pts = []
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2
    const r = i % 2 === 0 ? ro : ri
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`)
  }
  return pts.join(' ')
}

const scaled = (buf, px, vb) => Buffer.from(buf.toString().replace(/width="\d+" height="\d+"/, `width="${px}" height="${px}"`).replace(/viewBox="[^"]+"/, `viewBox="0 0 ${vb} ${vb}"`))
const STAR_RAW = svg(
  44,
  44,
  `<circle cx="22" cy="22" r="14" fill="#7a5cf0" fill-opacity=".28"/>
   <polygon points="${starPoints(22, 22, 19, 8.5)}" fill="url(#sg)" stroke="#8c8cae" stroke-width="1.2" stroke-linejoin="round"/>
   <polygon points="${starPoints(22, 22, 8.5, 3.6)}" fill="#5a3fd0" stroke="#3a2a9a" stroke-width=".8"/>`,
  `<linearGradient id="sg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f4fb"/><stop offset="1" stop-color="#a6a6c2"/></linearGradient>`
)

const STAR_SVG = scaled(STAR_RAW, 34, 44)
const TRANSLATE_RAW = svg(
  46,
  46,
  `<circle cx="23" cy="23" r="21.5" fill="#16233d" stroke="#2b4266" stroke-width="2"/>
   <path d="M10 18c0-3.3 2.7-6 6-6h14c3.3 0 6 2.7 6 6v7c0 3.3-2.7 6-6 6h-3l-5 5v-5h-6c-3.3 0-6-2.7-6-6z" fill="#fff"/>
   <path d="M17.5 15.5 L13.5 23.5 H17 L15.3 29 L21 21 H17.4 Z" fill="#16233d"/>
   <path d="M23.5 27.5 L28.2 16 L32.9 27.5 M25.4 23.6 H31" fill="none" stroke="#16233d" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`
)

const TRANSLATE_SVG = scaled(TRANSLATE_RAW, 42, 46)
const RANK_SVG = svg(
  46,
  48,
  `<path d="M23 38C11 37 5 28 3 11c6 7 11 9 16 9-4 6-2 13 4 16z" fill="url(#gw)"/>
   <path d="M23 38c12-1 18-10 20-27-6 7-11 9-16 9 4 6 2 13-4 16z" fill="url(#gw)"/>
   <polygon points="15,11 18,2 22,9 25,2 28,11" fill="#e9c970" stroke="#8a6a2a" stroke-width=".8" stroke-linejoin="round"/>
   <path d="M23 7l12 5.5v13c0 7-6 12-12 16-6-4-12-9-12-16v-13z" fill="url(#gt)" stroke="#e9c970" stroke-width="2" stroke-linejoin="round"/>
   <polygon points="23,15 29.5,23 23,34 16.5,23" fill="#c4f4ff" fill-opacity=".85"/>`,
  `<linearGradient id="gw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1d98a"/><stop offset="1" stop-color="#8a6a2a"/></linearGradient>
   <linearGradient id="gt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6fdbe6"/><stop offset="1" stop-color="#1f6f8f"/></linearGradient>`
)

// Frame foto bawaan (dipakai sampai aset border mentahan ditaruh di assets/ml/border.png)
const FRAME_SVG = svg(
  115,
  112,
  `<rect x="5" y="5" width="105" height="102" rx="11" fill="none" stroke="url(#fr)" stroke-width="9"/>
   <rect x="1.5" y="1.5" width="112" height="109" rx="14" fill="none" stroke="#f4c8ff" stroke-opacity=".35" stroke-width="1.5"/>
   <ellipse cx="14" cy="94" rx="14" ry="6.5" transform="rotate(-35 14 94)" fill="#e04fa8"/>
   <ellipse cx="27" cy="101" rx="14" ry="6" transform="rotate(-8 27 101)" fill="#f08a3a"/>
   <ellipse cx="9" cy="78" rx="9" ry="4.5" transform="rotate(-70 9 78)" fill="#c63ccf"/>
   <ellipse cx="98" cy="20" rx="12" ry="5" transform="rotate(30 98 20)" fill="#2aa8d8" fill-opacity=".8"/>`,
  `<linearGradient id="fr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ea5fc8"/><stop offset=".55" stop-color="#8450e8"/><stop offset="1" stop-color="#2fb0e0"/></linearGradient>`
)

// Foto profil bawaan kalau tidak ada foto: siluet kepala + bahu
const DEFAULT_PHOTO_SVG = svg(
  94,
  88,
  `<rect width="94" height="88" fill="url(#bg)"/><circle cx="47" cy="34" r="17" fill="#8d8aa8"/><path d="M12 88c2-22 16-30 35-30s33 8 35 30z" fill="#8d8aa8"/>`,
  `<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b3566"/><stop offset="1" stop-color="#1e1a38"/></linearGradient>`
)

const genderSvg = (g) => {
  const female = g === 'f'
  const fill = female ? '#9a52c8' : '#3d82d6'
  const sym = female
    ? `<circle cx="13" cy="10.5" r="5" fill="none" stroke="#fff" stroke-width="2"/><path d="M13 15.5v7M9.6 19.5h6.8" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`
    : `<circle cx="11.5" cy="14.5" r="5" fill="none" stroke="#fff" stroke-width="2"/><path d="M15.2 10.8L21 5M16 5h5v5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`
  return svg(
    26,
    26,
    `<rect x="1" y="1" width="24" height="24" rx="4" fill="${fill}" stroke="#d9b7f2" stroke-opacity=".7" stroke-width="1.5"/>${sym}`
  )
}

const GIFT_SVG = svg(
  62,
  62,
  `<circle cx="31" cy="31" r="28" fill="#47306a" stroke="#6a4c9c" stroke-width="4"/>
   <rect x="19" y="29" width="24" height="17" rx="2" fill="#a97ee8"/>
   <rect x="16" y="22" width="30" height="9" rx="2" fill="#c3a0f6"/>
   <rect x="29" y="22" width="4" height="24" fill="#47306a" fill-opacity=".65"/>
   <path d="M31 22c-9-1-10-11-3-11 4 0 5 6 3 11zM31 22c9-1 10-11 3-11-4 0-5 6-3 11z" fill="none" stroke="#c3a0f6" stroke-width="2.2" stroke-linejoin="round"/>`
)

// ---------- latar (header, tab, sidebar, kelinci, footer) ----------
async function background(s, name) {
  const bunnyAsset = optional('bunny.png')
  const bunny = bunnyAsset
    ? ''
    : `<g fill="#243751">
         <ellipse cx="676" cy="640" rx="52" ry="118" transform="rotate(-12 676 640)"/>
         <ellipse cx="892" cy="528" rx="62" ry="112" transform="rotate(18 892 528)"/>
         <ellipse cx="850" cy="790" rx="160" ry="190"/>
       </g>
       <g fill="#1d2d46"><ellipse cx="796" cy="758" rx="17" ry="30" transform="rotate(-20 796 758)"/><ellipse cx="882" cy="706" rx="14" ry="24" transform="rotate(25 882 706)"/>
       <ellipse cx="690" cy="610" rx="12" ry="70" transform="rotate(-12 690 610)"/><ellipse cx="905" cy="500" rx="14" ry="62" transform="rotate(18 905 500)"/></g>`
  const inner = `
    <rect width="${W}" height="${H}" fill="${COLORS.bg}"/>
    ${bunny}
    <rect x="0" y="78" width="12" height="884" fill="#1b2943"/>
    <rect x="0" y="120" width="12" height="177" fill="#223f67"/>
    <rect x="0" y="474" width="12" height="2" fill="#2f4165"/><rect x="0" y="654" width="12" height="2" fill="#2f4165"/><rect x="0" y="831" width="12" height="2" fill="#2f4165"/>
    <rect width="${W}" height="78" fill="#171e2e"/>
    <rect y="78" width="${W}" height="2" fill="#1c2840"/>
    <path d="M146,0 V70 Q146,78 154,78 H407 Q415,78 415,70 V0 Z" fill="url(#tab)"/>
    <path d="M146,0 V70 Q146,78 154,78 H407 Q415,78 415,70 V0" fill="none" stroke="#7fbfe6" stroke-width="2.2"/>
    <rect x="148" y="0" width="265" height="76" fill="url(#glow)"/>
    <rect x="258" y="76" width="44" height="2" fill="#a8e2f6" fill-opacity=".7"/>
    <polygon points="268,77 280,70 292,77 280,83" fill="#c6eefb"/>
    <rect x="148" y="66" width="6" height="2" fill="#a8e2f6"/><rect x="407" y="66" width="6" height="2" fill="#a8e2f6"/>
    <rect y="961" width="${W}" height="${H - 961}" fill="#273f61"/>
    <rect y="961" width="${W}" height="3" fill="#2f4a72"/>
    <rect x="0" y="1000" width="157" height="47" fill="#1f3453"/>
    <circle cx="127" cy="1025" r="14" fill="none" stroke="#7ea6cf" stroke-width="2.6"/>
    <circle cx="121.5" cy="1020" r="2.2" fill="#7ea6cf"/><circle cx="132.5" cy="1020" r="2.2" fill="#7ea6cf"/>
    <path d="M119.5 1027.5q7.5 8 15 0" fill="none" stroke="#7ea6cf" stroke-width="2.4" stroke-linecap="round"/>
    <rect x="209" y="993" width="219" height="57" rx="3" fill="url(#kirim)" stroke="#73bde8" stroke-width="2"/>
    <rect x="211" y="995" width="215" height="2" fill="#a6dcf6" fill-opacity=".55"/>`
  const defs = `
    <linearGradient id="tab" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#386288"/><stop offset=".55" stop-color="#5a8bad"/><stop offset="1" stop-color="#4883ac"/></linearGradient>
    <radialGradient id="glow" cx="280" cy="46" r="135" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#b4dff5" stop-opacity=".34"/><stop offset="1" stop-color="#b4dff5" stop-opacity="0"/></radialGradient>
    <linearGradient id="kirim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a8cb6"/><stop offset=".62" stop-color="#4688b2"/><stop offset="1" stop-color="#4faee4"/></linearGradient>`
  const layers = []
  if (bunnyAsset) {
    const b = await sharp(bunnyAsset).resize({ height: 560, fit: 'inside' }).png().toBuffer({ resolveWithObject: true })
    layers.push({ input: b.data, left: W - b.info.width, top: 960 - b.info.height })
  }
  layers.push({ input: GIFT_SVG, left: 483, top: 990 })
  const base = await sharp(svg(W, H, inner, defs)).composite(layers).png().toBuffer()

  // Teks tab, tombol Kirim, dan potongan nama di kolom ketik
  const t = []
  const mTab = await metrics(SERIFB, s.tab)
  const teman = await textImage(SERIFB, 'Teman', { size: s.tab, color: COLORS.tabText })
  t.push({ input: teman.input, left: Math.round(280 - teman.width / 2), top: Math.round(38 + mTab.cap / 2 - mTab.base) })
  const squad = await textImage(SERIFB, 'Squad', { size: s.tab, color: COLORS.tabOff })
  t.push({ input: squad.input, left: Math.round(103 - squad.width), top: Math.round(38 + mTab.cap / 2 - mTab.base) })
  const mK = await metrics(SANS, s.kirim)
  const kirim = await textImage(SANS, 'Kirim', { size: s.kirim, color: '#eaf6ff' })
  t.push({ input: kirim.input, left: Math.round(318 - kirim.width / 2), top: Math.round(1021 + mK.cap / 2 - mK.base) })
  // placeholder kolom ketik terpotong di tepi kiri: yang kelihatan cuma ujung nama
  const ph = await textImage(SANS, name, { size: 24, color: '#5d86b3' })
  const mP = await metrics(SANS, 24)
  const phLeft = 15 - ph.width
  const crop = Math.max(0, -phLeft)
  if (crop < ph.width - 2) {
    const piece = await sharp(ph.input).extract({ left: crop, top: 0, width: ph.width - crop, height: ph.height }).png().toBuffer()
    t.push({ input: piece, left: Math.max(0, phLeft), top: Math.round(1024 + mP.cap / 2 - mP.base) })
  }
  return sharp(base).composite(t).png().toBuffer()
}

// ---------- parameter ----------
const nowStamp = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Jakarta' })

export function normalizeFakemlParams(p = {}) {
  const s = (v) => String(v ?? '').trim()
  const rawTime = s(p.time ?? p.waktu)
  let time = nowStamp()
  if (/^\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}(:\d{2})?$/.test(rawTime)) time = rawTime.length <= 16 ? `${rawTime}:00` : rawTime
  else if (/^\d{1,2}[.:]\d{2}$/.test(rawTime)) time = `${nowStamp().slice(0, 10)} ${rawTime.replace('.', ':').padStart(5, '0')}:00`
  const flag = s(p.flag ?? p.bendera).toLowerCase()
  const g = s(p.gender ?? p.jk).toLowerCase()
  const gender = /^(m|l|pria|cowok|male)/.test(g) ? 'm' : /^(f|p|wanita|cewek|female)/.test(g) ? 'f' : /^(-|0|none|tanpa|no)/.test(g) ? 'none' : 'f'
  const messages = s(p.text ?? p.message)
    .split(/\r?\n/)
    .map((m) => m.trim())
    .filter(Boolean)
    .slice(0, GEO.maxRows)
    .map((m) => m.slice(0, 160))
  return {
    name: s(p.name).slice(0, 30) || 'Player',
    tag: s(p.tag).slice(0, 6),
    messages: messages.length ? messages : ['...'],
    time,
    flag: FLAGS[flag] ? flag : 'id',
    gender,
    badge: s(p.badge ?? p.season).slice(0, 5) || 'S41'
  }
}

// ---------- gambar utama ----------
export async function renderFakeml({ name = 'Player', tag = '', messages = ['halo'], time, flag = 'id', gender = 'f', badge = 'S41', avatar = null, border = null, warnings = [] }) {
  const s = await sizes()
  const stampText = time || nowStamp()
  const layers = []

  // Aset opsional
  const borderBuf = border || optional('border.png')
  const rankBuf = optional('rank.png')
  const starBuf = optional('star.png')
  const translateBuf = optional('translate.png')
  const fit = async (buf, w, h) => sharp(buf).resize(w, h, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()

  // Foto profil (dipotong kotak, sudut membulat)
  let photo = DEFAULT_PHOTO_SVG
  if (avatar) {
    try {
      photo = await sharp(avatar).rotate().resize(94, 88, { fit: 'cover', position: 'attention' }).png().toBuffer()
    } catch (err) {
      warnings.push(`foto tidak dipakai: ${err.message}`)
    }
  }
  const photoMask = svg(94, 88, `<rect width="94" height="88" rx="8" fill="#fff"/>`)
  const photoRound = await sharp(photo).composite([{ input: photoMask, blend: 'dest-in' }]).png().toBuffer()
  const borderFit = borderBuf ? await fit(borderBuf, 128, 128).catch(() => null) : null
  if (borderBuf && !borderFit) warnings.push('border tidak dipakai: gambar tidak valid')

  // Elemen yang sama di tiap baris
  const mName = await metrics(SANS, s.name)
  const mChat = await metrics(SANS, s.chat)
  const tagImg = tag ? await textImage(SANS, tag, { size: s.name, color: COLORS.tag }) : null
  const nameImg = await textImage(SANS, name, { size: s.name, color: COLORS.name })
  const badgeTxt = await textImage(SANSB, badge, { size: s.badge, color: '#fff' })
  const flagBuf = flagSvg(flag, 38)
  const rankBuf2 = rankBuf ? await fit(rankBuf, 46, 48) : RANK_SVG
  const starBuf2 = starBuf ? await fit(starBuf, 34, 34) : STAR_SVG
  const translateBuf2 = translateBuf ? await fit(translateBuf, 42, 42) : TRANSLATE_SVG
  const badgeBox = svg(
    56,
    26,
    `<polygon points="6,1 55,1 51,25 1,25" fill="url(#bb)" stroke="#52c6dc" stroke-width="1.6" stroke-linejoin="round"/>`,
    `<linearGradient id="bb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b4a82"/><stop offset="1" stop-color="#0b1f45"/></linearGradient>`
  )

  let rowTop = GEO.firstRow
  let used = 0
  for (const msg of messages) {
    if (used > 0 && rowTop > 800) break
    used++
    const body = await textImage(SANS, msg, { size: s.chat, color: COLORS.chat, width: GEO.maxText, lineHeight: 36 })
    const lines = Math.max(1, Math.round((body.height - mChat.one) / 36) + 1)
    const bw = Math.max(body.width - 3 + GEO.textPadL + GEO.textPadR, 133) // lebar badan bubble
    const bh = 74 + (lines - 1) * 36
    const bTop = rowTop + GEO.bubbleTop
    const bx = GEO.bubbleX

    // Foto + frame
    layers.push({ input: photoRound, left: 33, top: rowTop + 10 })
    if (borderFit) layers.push({ input: borderFit, left: Math.round(79.5 - 64), top: Math.round(rowTop + 54 - 64) })
    else layers.push({ input: FRAME_SVG, left: 22, top: rowTop - 2 })
    layers.push({ input: flagBuf, left: 22, top: rowTop })
    layers.push({ input: badgeBox, left: 83, top: rowTop + 4 })
    layers.push({ input: badgeTxt.input, left: Math.round(111 - badgeTxt.width / 2), top: Math.round(rowTop + 17 - 8 - (await metrics(SANSB, s.badge)).base / 2 + 0) })
    if (gender !== 'none') layers.push({ input: genderSvg(gender), left: 106, top: rowTop + 79 })

    // Rank + nama
    layers.push({ input: rankBuf2, left: 156, top: rowTop - 2 })
    const baseY = rowTop + 29
    let nx = 235
    if (tagImg) {
      layers.push({ input: tagImg.input, left: nx, top: Math.round(baseY - mName.base) })
      nx += tagImg.width - 3 + 9
    }
    layers.push({ input: nameImg.input, left: nx, top: Math.round(baseY - mName.base) })

    // Bubble: border terang tipis + isi gradasi, sudut dipotong, ada tab kecil di kiri atas
    const c = 6
    const path = (x, y, w, h, cc) =>
      `M${x + cc},${y} L${x + w - cc},${y} L${x + w},${y + cc} L${x + w},${y + h - cc} L${x + w - cc},${y + h} L${x + cc},${y + h} L${x},${y + h - cc} L${x},${y + cc} Z`
    const pad = 12
    layers.push({
      input: svg(
        bw + pad * 2,
        bh + 4,
        `<polygon points="${pad - 10},2 ${pad + 8},2 ${pad + 8},24" fill="#9a91b2"/>
         <path d="${path(pad, 2, bw, bh, c)}" fill="url(#bo)"/>
         <polygon points="${pad - 7},4.5 ${pad + 6},4.5 ${pad + 6},20" fill="#55557f"/>
         <path d="${path(pad + 2, 4, bw - 4, bh - 4, c - 1)}" fill="url(#bi)"/>`,
        `<linearGradient id="bo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a199b6"/><stop offset="1" stop-color="#82769c"/></linearGradient>
         <linearGradient id="bi" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#54537b"/><stop offset="1" stop-color="#5f618b"/></linearGradient>`
      ),
      left: bx - pad,
      top: bTop - 2
    })
    const shortBubble = body.width - 3 + GEO.textPadL + GEO.textPadR < 133
    const textLeft = shortBubble ? bx + Math.round((bw - (body.width - 3)) / 2) : bx + GEO.textPadL
    layers.push({ input: body.input, left: textLeft, top: Math.round(bTop + 43 - mChat.base) })

    // Bintang di pojok kanan atas + ikon translate
    layers.push({ input: starBuf2, left: Math.round(bx + bw + 3 - 17), top: Math.round(bTop + 3 - 17) })
    layers.push({ input: translateBuf2, left: Math.round(bx + bw + 29 - 21), top: Math.round(bTop + 44 - 21) })

    rowTop = bTop + bh + 33
  }

  // Jam di atas + pengumuman di bawah baris terakhir
  const mStamp = await metrics(SANS, s.stamp)
  const stamp = await textImage(SANS, stampText, { size: s.stamp, color: COLORS.stamp })
  layers.push({ input: stamp.input, left: Math.round(GEO.chatCenterX - stamp.width / 2), top: Math.round(137 + mStamp.cap / 2 - mStamp.base) })

  const mN = await metrics(SANS, s.notice)
  const noticeLines = [
    'Staf resmi MLBB tidak akan pernah meminta ID dan kata sandi akunmu dengan cara apa pun.',
    'Dimohon untuk tidak memberitahukan informasi pribadimu kepada siapa pun saat chat.'
  ]
  const nTop = rowTop + 44
  for (let i = 0; i < noticeLines.length; i++) {
    const ni = await textImage(SANS, noticeLines[i], { size: s.notice, color: COLORS.notice })
    layers.push({ input: ni.input, left: Math.round(GEO.chatCenterX - ni.width / 2), top: Math.round(nTop + i * 22 + mN.cap / 2 - mN.base) })
  }

  const bg = await background(s, name)
  return sharp(bg).composite(layers).removeAlpha().png().toBuffer()
}

export const fakemlFont = `${SANS.label} + ${SERIFB.label}`
