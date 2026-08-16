import { formatEther } from "viem";

// 0x3B4f0135465d444a5bD06Ab90fC59B73916C85F5 → 0x3B4f…C85F5
export const pendek = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

// wei → "10 RWD"
export const rwd = (wei: string | bigint) => `${Number(formatEther(BigInt(wei))).toLocaleString("id-ID")} RWD`;

// Di luar materi. `rulesURI` dan `proofURI` ditulis SIAPA PUN ke kontrak, lalu materi
// memasangnya apa adanya di atribut href.
//
// Koreksi atas dugaan awal saya: React 19 SUDAH memblokir `javascript:` sendiri.
// `sanitizeURL` di react-dom-client menukar nilai href yang cocok dengan pola
// `javascript:` (termasuk yang disisipi karakter kendali) menjadi URL yang melempar
// error. Jadi lubang yang saya kira menganga itu tidak ada.
//
// Penyaring ini tetap dipakai, tapi alasannya yang jujur: React cuma memblokir SATU
// skema, sedangkan yang lain (`data:`, `vbscript:`, `blob:`, dan apa pun yang muncul
// nanti) diteruskan apa adanya, dan perilaku internal React bisa berubah kapan saja.
// Daftar skema yang lolos sengaja disamakan dengan `uriAman()` di backend. Karakter
// kendali dibuang lebih dulu karena browser mengabaikannya saat membaca skema.
const KENDALI = new RegExp("[\\u0000-\\u001F\\u007F-\\u009F]", "g");

export const tautanAman = (url?: string) => {
  if (!url) return undefined;
  const bersih = url.replace(KENDALI, "").trim();
  return /^(https?|ipfs):/i.test(bersih) ? bersih : undefined;
};

// Beda dari materi: materi menulis `new Date(ms)`, dan itu meleset 1000 kali untuk
// backend kita. `bounties.created_at` dan `submissions.created_at` diisi
// `Math.floor(Date.now() / 1000)` di indexer/handlers.ts, jadi satuannya DETIK, dan
// tanpa pengali semua submission tampil sebagai "21 Jan 1970". (Kolom
// `verdicts.created_at` justru milidetik - dua satuan di satu basis data, hati-hati.)
//
// Catatan kedua: nilai ini waktu SAAT DIINDEKS, bukan timestamp block. Jadi artinya
// "kapan backend melihatnya", bukan "kapan terjadi di chain".
export const waktu = (detik: number) =>
  new Date(detik * 1000).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
