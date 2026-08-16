import { formatEther } from "viem";

// 0x3B4f0135465d444a5bD06Ab90fC59B73916C85F5 → 0x3B4f…C85F5
export const pendek = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

// wei → "10 RWD"
export const rwd = (wei: string | bigint) => `${Number(formatEther(BigInt(wei))).toLocaleString("id-ID")} RWD`;

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
