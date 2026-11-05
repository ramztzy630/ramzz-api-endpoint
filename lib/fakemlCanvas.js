// FAKECHATML: renderer chat teman Mobile Legends, 940x1080. Hanya sharp; tanpa jaringan dan tanpa file sementara.
// Aset (../assets/): Inter-Regular/Bold.ttf, DejaVuSerif-Bold.ttf, NotoColorEmoji.ttf. Aset mentahan opsional di assets/ml/
// (kalau tidak ada, dipakai gambar vektor bawaan): ranks/<rank>.png, rank.png, borders/<frame>.png (gold, pink, stardom,
// fireice; area foto dicari otomatis dari lubang PNG), border.png, star.png, translate.png, bunny.png.
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
  tag: '#e1c683',
  name: '#a3bbd2',
  chat: '#f4f4fe',
  stamp: '#4a5d7c',
  notice: '#96a5c3',
  tabText: '#cff4ff',
  tabOff: '#aadcff',
  kirim: '#d0f8ff'
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

const RANK_NAMES = ['warrior', 'elite', 'master', 'grandmaster', 'epic', 'legend', 'mythic', 'mythicalhonor', 'mythicalglory', 'mythicalimmortal']

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
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 }

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
// Pango memotong gambar teks mengikuti "tinta" glyph, jadi tinggi atas gambar bergantung isi teks
// ("ramzz" tidak punya huruf tinggi, "DC" punya). Supaya baseline selalu konsisten, tiap teks diberi satu baris
// pertama yang tak terlihat (alpha 1) berisi huruf tertinggi; baseline baris asli = base0 + jarak baris.
const INV_TEXT = 'Hlkdb'
const INV = `<span alpha="1">${INV_TEXT}</span>`

const fontOpts = (f, size) => {
  const o = { font: `${f.spec} ${Math.round(size * K)}`, dpi: 72, rgba: true }
  if (f.file) o.fontfile = f.file
  return o
}
const inkHeight = async (f, size, markup, extra = {}) =>
  (await sharp({ text: { text: markup, ...fontOpts(f, size), ...extra } }).png().metadata()).height / K

const pitchCache = new Map()
async function naturalPitch(f, size) {
  const key = `${f.spec}:${size}`
  if (pitchCache.has(key)) return pitchCache.get(key)
  const h = (t) => inkHeight(f, size, `<span foreground="#fff">${t}</span>`)
  const v = (await h('Hg\nHg')) - (await h('Hg'))
  pitchCache.set(key, v)
  return v
}

const metricCache = new Map()
async function metrics(f, size) {
  const key = `${f.spec}:${size}`
  if (metricCache.has(key)) return metricCache.get(key)
  const h = (t) => inkHeight(f, size, `<span foreground="#fff">${t}</span>`)
  const m = { cap: await h('H'), base0: await h(INV_TEXT) }
  metricCache.set(key, m)
  return m
}

const tone = (hex) => {
  const h = String(hex).replace('#', '')
  const f = h.length === 3 ? h.replace(/./g, (c) => c + c) : h
  const v = [0, 2, 4].map((i) => Math.min(255, Math.round(parseInt(f.slice(i, i + 2), 16) * 0.905)))
  return `#${v.map((n) => n.toString(16).padStart(2, '0')).join('')}`
}

// Hasil: { input, width, height, base } ; base = jarak atas gambar ke baseline baris teks pertama (px)
async function textImage(f, text, { size, color = '#fff', width = 0, lineHeight = 0 }) {
  const nat = await naturalPitch(f, size)
  const m = await metrics(f, size)
  const opts = {
    text: `${INV}\n<span foreground="${tone(color)}">${esc(text)}</span>`,
    ...fontOpts(f, size),
    wrap: 'word-char',
    align: 'left'
  }
  if (width) opts.width = Math.round(width * K)
  if (lineHeight) opts.spacing = Math.round(K * (lineHeight - nat))
  const { data, info } = await sharp({ text: opts }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  // potong sisi kanan sampai kolom terakhir yang benar-benar berisi teks (glyph tak terlihat tidak dihitung)
  let last = 0
  for (let x = info.width - 1; x >= 0 && last === 0; x--) {
    for (let y = 0; y < info.height; y++) {
      if (data[(y * info.width + x) * 4 + 3] > 8) {
        last = x
        break
      }
    }
  }
  const cropped = Math.min(info.width, last + 1)
  const big = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract({ left: 0, top: 0, width: cropped, height: info.height })
    .extend({ right: K * 3, background: CLEAR })
    .png()
    .toBuffer()
  const w = Math.max(1, Math.round((cropped + K * 3) / K))
  const h = Math.max(1, Math.round(info.height / K))
  return { input: await sharp(big).resize(w, h).png().toBuffer(), width: w, height: h, base: m.base0 + (lineHeight || nat) }
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

async function soften(img, { blur = 0, opacity = 1, pad = 6 }) {
  let s = sharp(img.input).ensureAlpha().extend({ top: pad, bottom: pad, left: pad, right: pad, background: CLEAR })
  if (blur > 0) s = s.blur(blur)
  const input = await s.linear([1, 1, 1, opacity], [0, 0, 0, 0]).png().toBuffer()
  return { input, pad }
}

// ---------- bendera sederhana ----------
const bands = (dir, ...c) => (s) =>
  c.map((f, i) => (dir === 'h' ? `<rect y="${(i * s) / c.length}" width="${s}" height="${s / c.length + 1}" fill="${f}"/>` : `<rect x="${(i * s) / c.length}" width="${s / c.length + 1}" height="${s}" fill="${f}"/>`)).join('')
const FLAGS = {
  id: bands('h', '#e70011', '#fff'),
  de: bands('h', '#111', '#dd0000', '#ffce00'),
  nl: bands('h', '#ae1c28', '#fff', '#21468b'),
  ru: bands('h', '#fff', '#0039a6', '#d52b1e'),
  fr: bands('v', '#0055a4', '#fff', '#ef4135'),
  it: bands('v', '#009246', '#fff', '#ce2b37'),
  pl: bands('h', '#fff', '#dc143c'),
  ua: bands('h', '#0057b7', '#ffd700'),
  at: bands('h', '#ed2939', '#fff', '#ed2939'),
  hu: bands('h', '#cd2a3e', '#fff', '#436f4d'),
  th: (s) => [['#a51931', 0, 1], ['#f4f5f8', 1, 2], ['#2d2a4a', 2, 4], ['#f4f5f8', 4, 5], ['#a51931', 5, 6]].map(([f, a, b]) => `<rect y="${(a * s) / 6}" width="${s}" height="${((b - a) * s) / 6 + 1}" fill="${f}"/>`).join(''),
  jp: (s) => `<rect width="${s}" height="${s}" fill="#fff"/><circle cx="${s / 2}" cy="${s / 2}" r="${s * 0.26}" fill="#bc002d"/>`,
  sg: (s) => `${bands('h', '#ef3340', '#fff')(s)}<circle cx="${s * 0.3}" cy="${s * 0.26}" r="${s * 0.13}" fill="#fff"/>`,
  us: (s) => `<rect width="${s}" height="${s}" fill="#fff"/>${[0, 1, 2, 3, 4, 5, 6].map((i) => `<rect y="${(i * 2 * s) / 13}" width="${s}" height="${s / 13}" fill="#b22234"/>`).join('')}<rect width="${s * 0.5}" height="${(7 * s) / 13}" fill="#3c3b6e"/>`
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

const scaled = (buf, px, vb) =>
  Buffer.from(buf.toString().replace(/width="\d+" height="\d+"/, `width="${px}" height="${px}"`).replace(/viewBox="[^"]+"/, `viewBox="0 0 ${vb} ${vb}"`))

const STAR_RAW = svg(
  44,
  44,
  `<circle cx="22" cy="22" r="12" fill="#8a5cf5" fill-opacity=".16"/>
 <polygon points="${starPoints(22, 22, 20, 9.6)}" fill="url(#sg)" stroke="#9b8d9d" stroke-width="1" stroke-linejoin="round"/>
 <polygon points="${starPoints(22, 22, 11, 5.2)}" fill="url(#sp)" stroke="#2a0f78" stroke-width=".7" stroke-linejoin="round"/>`,
  `<linearGradient id="sg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4ecf3"/><stop offset="1" stop-color="#ad9cb0"/></linearGradient>
 <radialGradient id="sp" cx=".5" cy=".5" r=".6"><stop offset="0" stop-color="#8240f2"/><stop offset="1" stop-color="#36108a"/></radialGradient>`
)
const STAR_SVG = scaled(STAR_RAW, 36, 44)

const TRANSLATE_RAW = svg(
  46,
  46,
  `<circle cx="23" cy="23" r="21.5" fill="#14223a" stroke="#27405f" stroke-width="1.6"/>
 <g transform="translate(23 23) scale(1.2) translate(-23 -23)">
 <path d="M11 30.5c-2.4 0-4-1.7-4-3.7 0-2.2 1.6-3.8 3.8-3.8h3.2c.8-3.8 3.8-6.4 7.6-6.4 2.8 0 5 1.3 6.4 3.4h5.6c3.2 0 5.6 2.3 5.6 5.2 0 2.7-2 5.3-4.6 5.3z" fill="#fff"/>
 <path d="M17.2 17.4 13.8 24.6h3.2l-1.4 4.8 5-6.8h-3.2z" fill="#7d8798"/>
 <path d="M24.6 28 29 17.4 33.4 28M26.4 24.4h5.2" fill="none" stroke="#6b7586" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>
 </g>`
)
const TRANSLATE_SVG = scaled(TRANSLATE_RAW, 44, 46)

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
  `<circle cx="31" cy="31" r="29" fill="url(#gb)"/>
 <circle cx="31" cy="31" r="27.5" fill="none" stroke="#6a4b99" stroke-width="3"/>
 <circle cx="31" cy="31" r="25.5" fill="none" stroke="#2a1745" stroke-width="1.4" stroke-opacity=".7"/>
 <rect x="26" y="2.4" width="10" height="3" rx="1.5" fill="#22123a"/><rect x="26" y="56.6" width="10" height="3" rx="1.5" fill="#22123a"/>
 <rect x="19" y="29.5" width="24" height="17" rx="2" fill="url(#gi)"/>
 <rect x="16" y="22.5" width="30" height="9" rx="2" fill="url(#gl)"/>
 <rect x="29" y="22.5" width="4" height="24" fill="#f3e4ff" fill-opacity=".55"/>
 <path d="M19 38.5h24" stroke="#f3e4ff" stroke-opacity=".35" stroke-width="1.5"/>
 <path d="M31 22.5c-9-1-10-11-3-11 4 0 5 6 3 11zM31 22.5c9-1 10-11 3-11-4 0-5 6-3 11z" fill="none" stroke="#f1dcff" stroke-width="2.2" stroke-linejoin="round"/>
 <ellipse cx="22" cy="14" rx="9" ry="4" transform="rotate(-30 22 14)" fill="#fff" fill-opacity=".1"/>`,
  `<radialGradient id="gb" cx=".5" cy=".42" r=".62"><stop offset="0" stop-color="#6b4693"/><stop offset="1" stop-color="#321e4e"/></radialGradient>
 <linearGradient id="gi" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bf90fb"/><stop offset="1" stop-color="#7a3fd6"/></linearGradient>
 <linearGradient id="gl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2c6ff"/><stop offset="1" stop-color="#a874ee"/></linearGradient>`
)

// ---------- ikon rank (lazy, cache kecil) ----------
const rankCache = new Map() // kunci file -> Buffer PNG yang sudah dikecilkan (maks 8 entri)
async function rankImage(rank) {
  const keys = [...(rank ? withExt(`ranks/${rank}`) : []), ...withExt('rank')]
  for (const k of keys) {
    if (rankCache.has(k)) {
      const v = rankCache.get(k)
      rankCache.delete(k)
      rankCache.set(k, v)
      return v
    }
    const raw = optional(k)
    if (!raw) continue
    try {
      let src = await withAlpha(raw)
      try {
        src = await sharp(src).trim({ threshold: 5 }).png().toBuffer() // buang ruang transparan di sekeliling
      } catch {}
      const out = await sharp(src).resize(46, 48, { fit: 'contain', kernel: 'lanczos3', background: CLEAR }).png().toBuffer()
      rankCache.set(k, out)
      while (rankCache.size > 8) rankCache.delete(rankCache.keys().next().value)
      return out
    } catch {
      continue
    }
  }
  return null
}

// ---------- parameter ----------
const nowStamp = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Jakarta' })
const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|\uFE0F|\u200D|\s)+$/u

export function normalizeFakemlParams(p = {}) {
  const s = (v) => String(v ?? '').trim()
  const one = (v) => s(v).replace(/[\r\n]+/g, ' ')
  const rawTime = s(p.time ?? p.waktu)
  let time = nowStamp()
  if (/^\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}(:\d{2})?$/.test(rawTime)) time = rawTime.length <= 16 ? `${rawTime}:00` : rawTime
  else if (/^\d{1,2}[.:]\d{2}$/.test(rawTime)) time = `${nowStamp().slice(0, 10)} ${rawTime.replace('.', ':').padStart(5, '0')}:00`
  const flag = s(p.flag ?? p.bendera).toLowerCase()
  const g = s(p.gender ?? p.jk).toLowerCase()
  const gender = /^(m|l|pria|cowok|male)/.test(g) ? 'm' : /^(f|p|wanita|cewek|female)/.test(g) ? 'f' : /^(-|0|none|tanpa|no)/.test(g) ? 'none' : 'f'
  const rk = s(p.rank ?? p.pangkat).toLowerCase().replace(/[\s_-]+/g, '')
  const fm = s(p.frame ?? p.bingkai).toLowerCase().replace(/[\s_-]+/g, '')
  const messages = s(p.text ?? p.message)
    .split(/\r?\n/)
    .map((m) => m.trim())
    .filter(Boolean)
    .slice(0, GEO.maxRows)
    .map((m) => m.slice(0, 160))
  return {
    name: one(p.name).slice(0, 30) || 'Player',
    tag: one(p.tag).slice(0, 6),
    messages: messages.length ? messages : ['...'],
    time,
    flag: FLAGS[flag] ? flag : 'id',
    gender,
    badge: one(p.badge ?? p.season).slice(0, 5) || 'S41',
    rank: RANK_NAMES.includes(rk) ? rk : '',
    frame: FRAME_NAMES.includes(fm) ? fm : /^(none|tanpa|polos|no)$/.test(fm) ? 'none' : ''
  }
}

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
 <rect x="148" y="0" width="265" height="76" fill="url(#glow)"/>
 <path d="M146,0 V70 Q146,78 154,78 M415,0 V70 Q415,78 407,78" fill="none" stroke="#4f8dbd" stroke-width="2.2"/>
 <rect x="152" y="72" width="256" height="2.6" fill="#78bddb"/>
 <path d="M256,73 L280,66 L304,73" fill="none" stroke="#8fd6f2" stroke-width="1.6" stroke-linejoin="round"/>
 <polygon points="269,75 280,69 291,75 280,81" fill="#cdf1ff"/>
 <polygon points="149,65 158,72 149,72" fill="#8fd3ee"/><polygon points="412,65 403,72 412,72" fill="#8fd3ee"/>
 <rect y="961" width="${W}" height="${H - 961}" fill="#273f61"/>
 <rect y="961" width="${W}" height="3" fill="#2f4a72"/>
 <rect x="0" y="1000" width="157" height="47" fill="#1f3453"/>
 <circle cx="127" cy="1025" r="14" fill="none" stroke="#7ea6cf" stroke-width="2.8"/>
 <ellipse cx="121.6" cy="1020.5" rx="2.3" ry="3.1" fill="#7ea6cf"/><ellipse cx="132.4" cy="1020.5" rx="2.3" ry="3.1" fill="#7ea6cf"/>
 <path d="M118.8 1026.4 Q127 1039.5 135.2 1026.4 Z" fill="#7ea6cf" stroke="#7ea6cf" stroke-width="1.4" stroke-linejoin="round"/>
 <rect x="209" y="993" width="219" height="57" rx="3" fill="url(#kirim)" stroke="#5aa9d9" stroke-width="2"/>
 <rect x="214.5" y="998.5" width="208" height="46" rx="2" fill="none" stroke="#8fcdf0" stroke-opacity=".4" stroke-width="1.5"/>
 <rect x="211" y="995" width="215" height="2" fill="#bfe8fb" fill-opacity=".4"/>
 <rect x="211" y="1038" width="215" height="10" fill="url(#kglow)"/>`
  const defs = `
 <linearGradient id="tab" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#36618b"/><stop offset=".55" stop-color="#4c80aa"/><stop offset="1" stop-color="#4b86ae"/></linearGradient>
 <radialGradient id="glow" cx="280" cy="46" r="135" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#b4dff5" stop-opacity=".3"/><stop offset="1" stop-color="#b4dff5" stop-opacity="0"/></radialGradient>
 <linearGradient id="kirim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a8db6"/><stop offset=".7" stop-color="#4789b3"/><stop offset="1" stop-color="#53b4ea"/></linearGradient>
 <linearGradient id="kglow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6fd0ff" stop-opacity="0"/><stop offset="1" stop-color="#7fd8ff" stop-opacity=".6"/></linearGradient>`
  const layers = []
  if (bunnyAsset) {
    try {
      const b = await sharp(bunnyAsset).resize({ height: 560, fit: 'inside' }).png().toBuffer({ resolveWithObject: true })
      layers.push({ input: b.data, left: W - b.info.width, top: 960 - b.info.height })
    } catch {}
  }
  layers.push({ input: GIFT_SVG, left: 483, top: 990 })
  const base = await sharp(svg(W, H, inner, defs)).composite(layers).png().toBuffer()

  const t = []
  const mTab = await metrics(SERIFB, s.tab)
  const teman = await textImage(SERIFB, 'Teman', { size: s.tab, color: COLORS.tabText })
  const tmLeft = Math.round(280 - teman.width / 2)
  const tmTop = Math.round(38 + mTab.cap / 2 - teman.base)
  const glow = await soften(teman, { blur: 3, opacity: 0.55 })
  t.push({ input: glow.input, left: tmLeft - glow.pad, top: tmTop - glow.pad })
  t.push({ input: teman.input, left: tmLeft, top: tmTop })
  const squad = await textImage(SERIFB, 'Squad', { size: s.tab, color: COLORS.tabOff })
  t.push({ input: squad.input, left: Math.round(103 - squad.width), top: Math.round(38 + mTab.cap / 2 - squad.base) })
  const mK = await metrics(SANS, s.kirim)
  const kirim = await textImage(SANS, 'Kirim', { size: s.kirim, color: COLORS.kirim })
  const kShadow = await soften(await textImage(SANS, 'Kirim', { size: s.kirim, color: '#0a2742' }), { blur: 0.8, opacity: 0.6, pad: 2 })
  const kLeft = Math.round(318 - kirim.width / 2)
  const kTop = Math.round(1021 + mK.cap / 2 - kirim.base)
  t.push({ input: kShadow.input, left: kLeft - kShadow.pad, top: kTop - kShadow.pad + 2 })
  t.push({ input: kirim.input, left: kLeft, top: kTop })
  const ph = await textImage(SANS, name, { size: 24, color: '#5d86b3' })
  const mP = await metrics(SANS, 24)
  const phLeft = 15 - ph.width
  const crop = Math.max(0, -phLeft)
  if (crop < ph.width - 2) {
    const piece = await sharp(ph.input).extract({ left: crop, top: 0, width: ph.width - crop, height: ph.height }).png().toBuffer()
    t.push({ input: piece, left: Math.max(0, phLeft), top: Math.round(1024 + mP.cap / 2 - ph.base) })
  }
  return sharp(base).composite(t).png().toBuffer()
}

const IMG_EXT = ['png', 'jpg', 'jpeg', 'webp']
const withExt = (base) => IMG_EXT.map((e) => `${base}.${e}`)

// Gambar datar (mis. JPG, atau PNG yang transparansinya hilang) dengan latar polos: latar luar dan lubang tengahnya
// dibuang jadi transparan. Gambar yang sudah transparan dikembalikan apa adanya.
async function withAlpha(buf) {
  try {
    const { data, info } = await sharp(buf).ensureAlpha().resize(420, 420, { fit: 'inside', withoutEnlargement: true }).raw().toBuffer({ resolveWithObject: true })
    const w = info.width
    const h = info.height
    const n = w * h
    let clear = 0
    for (let i = 0; i < n; i++) if (data[i * 4 + 3] < 250) clear++
    if (clear > n * 0.01) return buf
    const cs = [0, w - 1, n - w, n - 1].map((i) => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]])
    const bg = [0, 1, 2].map((k) => Math.round(cs.reduce((a, c) => a + c[k], 0) / 4))
    const dist = (i) => Math.abs(data[i * 4] - bg[0]) + Math.abs(data[i * 4 + 1] - bg[1]) + Math.abs(data[i * 4 + 2] - bg[2])
    if (cs.some((c) => Math.abs(c[0] - bg[0]) + Math.abs(c[1] - bg[1]) + Math.abs(c[2] - bg[2]) > 60)) return buf // pojok tidak seragam: bukan latar polos
    const near = new Uint8Array(n)
    for (let i = 0; i < n; i++) near[i] = Math.abs(data[i * 4] - bg[0]) <= 30 && Math.abs(data[i * 4 + 1] - bg[1]) <= 30 && Math.abs(data[i * 4 + 2] - bg[2]) <= 30 ? 1 : 0
    const gone = new Uint8Array(n)
    const q = new Int32Array(n)
    let head = 0
    let tail = 0
    const push = (i) => {
      if (near[i] && !gone[i]) {
        gone[i] = 1
        q[tail++] = i
      }
    }
    for (let x = 0; x < w; x++) {
      push(x)
      push(n - w + x)
    }
    for (let y = 0; y < h; y++) {
      push(y * w)
      push(y * w + w - 1)
    }
    push((h >> 1) * w + (w >> 1)) // lubang di tengah ikut dibuang kalau warnanya sama dengan latar
    while (head < tail) {
      const p = q[head++]
      const x = p % w
      if (x > 0) push(p - 1)
      if (x < w - 1) push(p + 1)
      if (p >= w) push(p - w)
      if (p < n - w) push(p + w)
    }
    if (tail < n * 0.05 || tail > n * 0.92) return buf
    const out = Buffer.from(data)
    const edge = new Uint8Array(n)
    for (let r = 0; r < 2; r++) {
      const prev = r === 0 ? gone : edge
      const mark = []
      for (let i = 0; i < n; i++) {
        if (gone[i] || edge[i]) continue
        const x = i % w
        const y = (i - x) / w
        if ((x > 0 && prev[i - 1]) || (x < w - 1 && prev[i + 1]) || (y > 0 && prev[i - w]) || (y < h - 1 && prev[i + w])) mark.push(i)
      }
      for (const i of mark) edge[i] = 1
    }
    for (let i = 0; i < n; i++) {
      if (gone[i]) out[i * 4 + 3] = 0
      else if (edge[i]) out[i * 4 + 3] = Math.round(Math.max(0, Math.min(1, (dist(i) - 45) / 100)) * 255) // sisa tepi gelap dipudarkan
      else out[i * 4 + 3] = 255
    }
    return await sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer()
  } catch {
    return buf
  }
}

// ---------- bingkai foto (PNG transparan; area foto dicari otomatis dari lubang di tengahnya) ----------
const FRAME_NAMES = ['gold', 'pink', 'stardom', 'fireice']
const FB = 122 // kotak bingkai (px)
const frameCache = new Map() // kunci file -> hasil olahan (maks 8 entri)

function grow(src, n, r) {
  const tmp = new Uint8Array(n * n)
  const out = new Uint8Array(n * n)
  const pre = new Int32Array(n + 1)
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) pre[x + 1] = pre[x] + src[y * n + x]
    for (let x = 0; x < n; x++) tmp[y * n + x] = pre[Math.min(n, x + r + 1)] - pre[Math.max(0, x - r)] > 0 ? 1 : 0
  }
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) pre[y + 1] = pre[y] + tmp[y * n + x]
    for (let y = 0; y < n; y++) out[y * n + x] = pre[Math.min(n, y + r + 1)] - pre[Math.max(0, y - r)] > 0 ? 1 : 0
  }
  return out
}

// Hasil: { img, x, y, w, h, mask } atau null kalau lubang di tengah tidak ketemu / bocor ke luar
async function prepareFrame(buf) {
  const N = FB * 2
  let src = buf
  try {
    src = await sharp(buf).ensureAlpha().trim({ threshold: 5 }).png().toBuffer() // buang ruang transparan di sekeliling
  } catch {}
  const img = await sharp(src).resize(FB, FB, { fit: 'contain', kernel: 'lanczos3', background: CLEAR }).png().toBuffer()
  const raw = await sharp(src).resize(N, N, { fit: 'contain', background: CLEAR }).ensureAlpha().raw().toBuffer()
  const solid = new Uint8Array(N * N)
  const strong = new Uint8Array(N * N)
  for (let i = 0; i < N * N; i++) {
    const a = raw[i * 4 + 3]
    solid[i] = a > 40 ? 1 : 0
    strong[i] = a > 128 ? 1 : 0
  }
  const closed = grow(solid, N, 5) // celah kecil di bingkai ditutup dulu
  const c = (N >> 1) * N + (N >> 1)
  if (closed[c]) return null
  const seen = new Uint8Array(N * N)
  const q = new Int32Array(N * N)
  let head = 0
  let tail = 0
  q[tail++] = c
  seen[c] = 1
  while (head < tail) {
    const p = q[head++]
    const x = p % N
    const nb = [x > 0 ? p - 1 : -1, x < N - 1 ? p + 1 : -1, p >= N ? p - N : -1, p < N * (N - 1) ? p + N : -1]
    for (const m of nb) {
      if (m >= 0 && !closed[m] && !seen[m]) {
        seen[m] = 1
        q[tail++] = m
      }
    }
  }
  for (let i = 0; i < N; i++) if (seen[i] || seen[(N - 1) * N + i] || seen[i * N] || seen[i * N + N - 1]) return null // bocor
  const area = tail / (N * N)
  if (area < 0.05 || area > 0.8) return null
  const wide = grow(seen, N, 5)
  const hole = new Uint8Array(N * N)
  for (let i = 0; i < N * N; i++) hole[i] = wide[i] && !solid[i] ? 1 : 0
  const tuck = grow(hole, N, 8) // foto sedikit masuk ke bawah bingkai supaya tidak ada celah
  const mask = new Uint8Array(N * N)
  let x0 = N
  let y0 = N
  let x1 = 0
  let y1 = 0
  for (let i = 0; i < N * N; i++) {
    if (hole[i] || (tuck[i] && strong[i])) {
      mask[i] = 255
      const x = i % N
      const y = (i - x) / N
      x0 = Math.min(x0, x)
      y0 = Math.min(y0, y)
      x1 = Math.max(x1, x)
      y1 = Math.max(y1, y)
    }
  }
  const bx = x0 >> 1
  const by = y0 >> 1
  const bw = (x1 >> 1) + 1 - bx
  const bh = (y1 >> 1) + 1 - by
  const rgba = Buffer.alloc(bw * 2 * bh * 2 * 4, 255)
  for (let yy = 0; yy < bh * 2; yy++) {
    for (let xx = 0; xx < bw * 2; xx++) {
      const sx = bx * 2 + xx
      const sy = by * 2 + yy
      rgba[(yy * bw * 2 + xx) * 4 + 3] = sx < N && sy < N ? mask[sy * N + sx] : 0
    }
  }
  const maskPng = await sharp(rgba, { raw: { width: bw * 2, height: bh * 2, channels: 4 } }).resize(bw, bh).png().toBuffer()
  return { img, x: bx, y: by, w: bw, h: bh, mask: maskPng }
}

async function frameInfo(key, buf) {
  let r = null
  try {
    r = await prepareFrame(buf)
  } catch {}
  if (key && r) {
    frameCache.set(key, r)
    while (frameCache.size > 8) frameCache.delete(frameCache.keys().next().value)
  }
  return r
}

async function pickFrame(name) {
  for (const k of [...(name ? withExt(`borders/${name}`) : []), ...withExt('border'), ...withExt('borders/pink')]) {
    if (frameCache.has(k)) {
      const v = frameCache.get(k)
      frameCache.delete(k)
      frameCache.set(k, v)
      return { fr: v }
    }
    const buf = optional(k)
    if (buf) return { key: k, buf }
  }
  return null
}

// ---------- gambar utama ----------
export async function renderFakeml({ name = 'Player', tag = '', messages = ['halo'], time, flag = 'id', gender = 'f', badge = 'S41', rank = '', frame = '', avatar = null, border = null, warnings = [] }) {
  const s = await sizes()
  const stampText = time || nowStamp()
  const layers = []

  const rankKey = RANK_NAMES.includes(String(rank)) ? String(rank) : ''
  const rankPng = await rankImage(rankKey)
  const starBuf = optional('star.png')
  const translateBuf = optional('translate.png')
  const fit = async (buf, w, h) => sharp(buf).resize(w, h, { fit: 'contain', background: CLEAR }).png().toBuffer()

  // Foto profil: sumber = foto kiriman atau siluet bawaan
  let photoSrc = DEFAULT_PHOTO_SVG
  if (avatar) {
    try {
      await sharp(avatar).metadata()
      photoSrc = avatar
    } catch (err) {
      warnings.push(`foto tidak dipakai: ${err.message}`)
    }
  }
  // Bingkai: border dari parameter > frame pilihan > border.png > pink.png > vektor bawaan
  let fr = null
  let legacyBuf = null
  const sel = border ? { buf: border } : frame === 'none' ? null : await pickFrame(String(frame))
  if (sel) {
    if (sel.fr) fr = sel.fr
    else {
      const keyed = await withAlpha(sel.buf)
      fr = await frameInfo(sel.key, keyed)
      if (!fr) legacyBuf = keyed // lubang tidak terdeteksi: pakai cara lama (foto kotak + bingkai di atasnya)
    }
  }
  let framePhoto = null
  let photoRound = null
  let borderFit = null
  if (fr) {
    const ph = await sharp(photoSrc).rotate().resize(fr.w, fr.h, { fit: 'cover', position: 'attention' }).png().toBuffer()
    framePhoto = await sharp(ph).composite([{ input: fr.mask, blend: 'dest-in' }]).png().toBuffer()
  } else {
    const ph = await sharp(photoSrc).rotate().resize(94, 88, { fit: 'cover', position: 'attention' }).png().toBuffer()
    photoRound = await sharp(ph).composite([{ input: svg(94, 88, `<rect width="94" height="88" rx="8" fill="#fff"/>`), blend: 'dest-in' }]).png().toBuffer()
    borderFit = legacyBuf ? await fit(legacyBuf, 128, 128).catch(() => null) : null
    if (legacyBuf && !borderFit) warnings.push('border tidak dipakai: gambar tidak valid')
  }

  const tagImg = tag ? await textImage(SANS, tag, { size: s.name, color: COLORS.tag }) : null
  const nameImg = await textImage(SANS, name, { size: s.name, color: COLORS.name })
  const mBadge = await metrics(SANSB, s.badge)
  let badgeTxt = await textImage(SANSB, badge, { size: s.badge, color: '#fff' })
  try {
    const sheared = await sharp(badgeTxt.input).affine([[1, -0.2], [0, 1]], { background: CLEAR }).png().toBuffer({ resolveWithObject: true })
    badgeTxt = { ...badgeTxt, input: sheared.data, width: sheared.info.width, height: sheared.info.height }
  } catch {}
  const flagBuf = flagSvg(flag, 38)
  const rankBuf2 = rankPng || RANK_SVG
  const starBuf2 = starBuf ? await fit(starBuf, 36, 36).catch(() => STAR_SVG) : STAR_SVG
  const translateBuf2 = translateBuf ? await fit(translateBuf, 44, 44).catch(() => TRANSLATE_SVG) : TRANSLATE_SVG
  const badgeBox = svg(
    56,
    26,
    `<polygon points="6,1 55,1 51,25 1,25" fill="url(#bb)" stroke="#52c6dc" stroke-width="1.6" stroke-linejoin="round"/>`,
    `<linearGradient id="bb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b4a82"/><stop offset="1" stop-color="#0b1f45"/></linearGradient>`
  )

  const mName = await metrics(SANS, s.name)
  const mChat = await metrics(SANS, s.chat)
  let rowTop = GEO.firstRow
  let used = 0
  for (const msg of messages) {
    if (used > 0 && rowTop > 800) break
    used++
    // Pesan yang isinya hanya emoji ditampilkan besar di tengah bubble kecil (seperti stiker)
    const emojiOnly = EMOJI_ONLY.test(msg)
    let body
    let lines = 1
    let bw
    let glyph = null
    if (emojiOnly) {
      body = await textImage(SANS, msg, { size: Math.round(s.chat * 1.6 * 10) / 10, color: COLORS.chat })
      glyph = await sharp(body.input).trim({ threshold: 10 }).png().toBuffer({ resolveWithObject: true })
      bw = Math.max(glyph.info.width + GEO.textPadL + GEO.textPadR, 133)
    } else {
      body = await textImage(SANS, msg, { size: s.chat, color: COLORS.chat, width: GEO.maxText, lineHeight: 36 })
      lines = Math.max(1, Math.floor((body.height - mChat.base0) / 36 + 0.15))
      bw = Math.max(body.width - 3 + GEO.textPadL + GEO.textPadR, 133) // lebar badan bubble
    }
    const bh = 74 + (lines - 1) * 36
    const bTop = rowTop + GEO.bubbleTop
    const bx = GEO.bubbleX

    if (fr) {
      layers.push({ input: framePhoto, left: 19 + fr.x, top: rowTop - 7 + fr.y })
      layers.push({ input: fr.img, left: 19, top: rowTop - 7 })
    } else {
      layers.push({ input: photoRound, left: 33, top: rowTop + 10 })
      if (borderFit) layers.push({ input: borderFit, left: Math.round(79.5 - 64), top: Math.round(rowTop + 54 - 64) })
      else layers.push({ input: FRAME_SVG, left: 22, top: rowTop - 2 })
    }
    layers.push({ input: flagBuf, left: 22, top: rowTop })
    layers.push({ input: badgeBox, left: 83, top: rowTop + 4 })
    layers.push({ input: badgeTxt.input, left: Math.round(111 - badgeTxt.width / 2), top: Math.round(rowTop + 17 + mBadge.cap / 2 - badgeTxt.base) })
    if (gender !== 'none') layers.push({ input: genderSvg(gender), left: 106, top: rowTop + 79 })

    layers.push({ input: rankBuf2, left: 156, top: rowTop - 2 })
    const baseY = rowTop + 29
    let nx = 235
    if (tagImg) {
      layers.push({ input: tagImg.input, left: nx, top: Math.round(baseY - tagImg.base) })
      nx += tagImg.width - 3 + 9
    }
    layers.push({ input: nameImg.input, left: nx, top: Math.round(baseY - nameImg.base) })

    const c = 6
    // badan bubble bersudut potong + ekor melengkung di kiri atas (satu path, jadi garis tepinya menyambung)
    const shape = (x, y, w, h, cc, tx, th) =>
      `M${x - tx},${y} L${x + w - cc},${y} L${x + w},${y + cc} L${x + w},${y + h - cc} L${x + w - cc},${y + h} L${x + cc},${y + h} L${x},${y + h - cc} L${x},${y + th} Q${x + 1},${y + th * 0.3} ${x - tx},${y} Z`
    const pad = 12
    layers.push({
      input: svg(
        bw + pad * 2,
        bh + 4,
        `<path d="${shape(pad, 2, bw, bh, c, 10, 24)}" fill="url(#bo)"/>
 <path d="${shape(pad + 2, 4, bw - 4, bh - 4, c - 1, 7, 20)}" fill="url(#bi)"/>`,
        `<linearGradient id="bo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a199b6"/><stop offset="1" stop-color="#82769c"/></linearGradient>
 <linearGradient id="bi" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#54537b"/><stop offset="1" stop-color="#5f618b"/></linearGradient>`
      ),
      left: bx - pad,
      top: bTop - 2
    })
    if (glyph) {
      layers.push({
        input: glyph.data,
        left: Math.round(bx + (bw - glyph.info.width) / 2),
        top: Math.round(bTop + 35 - glyph.info.height / 2)
      })
    } else {
      layers.push({ input: body.input, left: bx + GEO.textPadL, top: Math.round(bTop + 43 - body.base) })
    }

    layers.push({ input: starBuf2, left: Math.round(bx + bw + 1.5 - 18), top: Math.round(bTop + 4 - 18) })
    layers.push({ input: translateBuf2, left: Math.round(bx + bw + 29 - 22), top: Math.round(bTop + 44 - 22) })

    rowTop = bTop + bh + 33
  }

  const mStamp = await metrics(SANS, s.stamp)
  const stamp = await textImage(SANS, stampText, { size: s.stamp, color: COLORS.stamp })
  layers.push({ input: stamp.input, left: Math.round(GEO.chatCenterX - stamp.width / 2), top: Math.round(137 + mStamp.cap / 2 - stamp.base) })

  const mN = await metrics(SANS, s.notice)
  const noticeLines = [
    'Staf resmi MLBB tidak akan pernah meminta ID dan kata sandi akunmu dengan cara apa pun.',
    'Dimohon untuk tidak memberitahukan informasi pribadimu kepada siapa pun saat chat.'
  ]
  const nTop = rowTop + 44
  for (let i = 0; i < noticeLines.length; i++) {
    const ni = await textImage(SANS, noticeLines[i], { size: s.notice, color: COLORS.notice })
    layers.push({ input: ni.input, left: Math.round(GEO.chatCenterX - ni.width / 2), top: Math.round(nTop + i * 22 + mN.cap / 2 - ni.base) })
  }

  const bg = await background(s, name)
  return sharp(bg).composite(layers).removeAlpha().png().toBuffer()
}

export const fakemlFont = `${SANS.label} + ${SERIFB.label}`
