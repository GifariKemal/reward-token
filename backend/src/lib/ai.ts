// lib/ai.ts = SATU-SATUNYA pintu ke LLM di seluruh backend (pola Sesi 8).
// Fitur AI berikutnya (ringkas bounty, deteksi spam, apa pun) memanggil `tanyaAI`,
// tidak menyalin `fetch` dan `JSON.parse` ke mana-mana. Berkas ini memisahkan dua
// hal yang di Sesi 6 tercampur di satu fungsi juri gemuk:
//   - langkah 3 (panggil LLM) dan langkah 4 (pastikan bentuk jawaban) -> `tanyaAI`
//   - pengambilan data mentah dari URL/IPFS yang tak dipercaya          -> `ambilTeks`
// Sisa 5-langkah (ambil data, susun konteks, lakukan aksi) tetap di pemanggil.
//
// Perbedaan dari materi, dan alasannya, ada di tiap penjaga di bawah. Ringkasnya:
// materi mengandaikan OpenAI gpt-4o-mini yang menegakkan json_schema dan URL yang
// jinak; backend ini menghadapi gateway yang bisa diganti dan URI yang ditentukan
// penyerang di kontrak, jadi penjaganya lebih tebal.

import { lookup } from "node:dns/promises";
import { LLM } from "../config";

// ---------------------------------------------------------------------------
// Bagian 1: mengambil teks dari URI luar dengan aman (dulu fetchText di judge.ts).
// Dipindah ke sini karena ini transport yang tak dipercaya, sama derajatnya dengan
// panggilan LLM, dan route serta juri sama-sama memakainya.
// ---------------------------------------------------------------------------

const MAKS_URI = 512; // rulesURI dan proofURI disimpan di storage escrow, panjangnya = biaya gas

// Penjaga lapis pertama, murni sintaksis dan tanpa jaringan, supaya route bisa
// membalas 400 sebelum transaksi apa pun dikirim.
const HOST_TERLARANG =
  /^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|::|::1|::ffff:|f[cd][0-9a-f]{0,2}:|fe[89ab][0-9a-f]?:)/i;

export const uriAman = (uri: string) => {
  if (uri.length > MAKS_URI) return false;
  if (uri.startsWith("ipfs://")) return uri.length > "ipfs://".length;
  try {
    const u = new URL(uri);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return !HOST_TERLARANG.test(u.hostname.replace(/^\[|\]$/g, ""));
  } catch {
    return false;
  }
};

const ipv4Privat = (ip: string) => {
  const [a, b] = ip.split(".").map(Number);
  // Bentuk yang tidak dikenali dianggap TIDAK aman. Tanpa baris ini, alamat IPv6 yang
  // mengandung titik (mis. `::127.0.0.1` atau `64:ff9b::10.0.0.1`) dirutekan ke sini,
  // `Number("::127")` menghasilkan NaN, semua perbandingan terhadap NaN bernilai false,
  // dan fungsi yang kontraknya gagal-tertutup malah menjawab "publik".
  if (!Number.isFinite(a) || !Number.isFinite(b)) return true;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b! >= 16 && b! <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b! >= 64 && b! <= 127) // CGNAT
  );
};

// `::ffff:7f00:1` adalah 127.0.0.1 yang ditulis heksa. Membuang prefiksnya saja tidak
// cukup, sisanya harus diterjemahkan dulu ke bentuk bertitik.
const heksaKeIpv4 = (s: string) => {
  const [hi, lo] = s.split(":").map((x) => parseInt(x, 16));
  if (s.split(":").length !== 2 || !Number.isFinite(hi) || !Number.isFinite(lo)) return null;
  return `${hi! >> 8}.${hi! & 255}.${lo! >> 8}.${lo! & 255}`;
};

export const ipPrivat = (ip: string) => {
  const bersih = ip.toLowerCase();
  const tanpaPrefiks = bersih.replace(/^::ffff:/, "");
  if (tanpaPrefiks.includes(".")) return ipv4Privat(tanpaPrefiks);
  if (bersih.startsWith("::ffff:")) return ipv4Privat(heksaKeIpv4(tanpaPrefiks) ?? "?");
  if (tanpaPrefiks === "::" || tanpaPrefiks === "::1") return true;
  if (/^f[cd]/.test(tanpaPrefiks)) return true; // unique local
  if (/^fe[89ab]/.test(tanpaPrefiks)) return true; // link local
  if (/^fec/.test(tanpaPrefiks)) return true; // site-local lama, usang tapi bisa dirutekan
  // Apa pun yang bentuknya tidak dikenali dianggap TIDAK aman. Fungsi ini kontraknya
  // gagal-tertutup, jadi tebakan yang salah harus jatuh ke sisi menolak.
  return !/^[0-9a-f:]+$/.test(tanpaPrefiks);
};

// ponytail: masih ada celah waktu antara pemeriksaan dan pengambilan (DNS rebinding),
// karena fetch me-resolve ulang sendiri. Menutupnya butuh menyambung ke IP yang sudah
// diperiksa dan mengirim Host header manual. Naikkan ke sana kalau backend ini pernah
// dijalankan di server yang punya jaringan internal.
const tujuanAman = async (url: string) => {
  try {
    const alamat = await lookup(new URL(url).hostname, { all: true, verbatim: true });
    return alamat.length > 0 && !alamat.some((a) => ipPrivat(a.address));
  } catch {
    return false; // nama tidak bisa diresolusi, tidak ada yang perlu diambil
  }
};

// Beda dari `ambilTeks` materi yang cuma `fetch().text().slice()`: penjaga SSRF dua
// lapis, dibaca mengalir lalu dihentikan (materi mengunduh badan respons UTF-8 PENUH
// sebelum memotong, jadi berkas 400 MB cukup untuk OOM proses juri), dan redirect
// ditolak (penjaga di atas hanya memeriksa URL pertama).
export const ambilTeks = async (uri: string, maksKarakter = 8000) => {
  if (!uriAman(uri)) return null;
  const url = uri.startsWith("ipfs://") ? `https://ipfs.io/ipfs/${uri.slice(7)}` : uri;
  if (!(await tujuanAman(url))) return null;
  try {
    const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(20_000) });
    if (!res.ok) {
      // badan respons dibatalkan dulu, kalau tidak soketnya ditahan sampai GC dan
      // setiap 404 (kejadian normal untuk URI bukti) menyisakan satu
      await res.body?.cancel().catch(() => {});
      throw new Error(String(res.status));
    }
    if (!res.body) return null;
    const pembaca = res.body.getReader();
    const dekoder = new TextDecoder();
    let teks = "";
    try {
      while (teks.length < maksKarakter) {
        const { done, value } = await pembaca.read();
        if (done) break;
        teks += dekoder.decode(value, { stream: true });
      }
    } finally {
      await pembaca.cancel().catch(() => {});
    }
    // ambilTeks dibatasi maksKarakter. Bukan cuma soal hemat token - dokumen raksasa
    // itu sendiri permukaan serangan (perintah bisa disembunyikan di baris ke-40.000).
    return teks.slice(0, maksKarakter);
  } catch (e) {
    // Sebabnya dicatat: isi yang gagal diambil menjadi teks pengganti di prompt, dan
    // instruksi juri menolak yang tidak bisa dicek - jadi satu gangguan sesaat di
    // raw.githubusercontent.com berubah jadi penolakan on-chain. Tanpa baris ini
    // operator tidak punya cara membedakannya dari penolakan yang sah.
    console.error(`gagal mengambil ${uri}: ${e}`);
    return null;
  }
};

// ---------------------------------------------------------------------------
// Bagian 2: satu pintu ke LLM (langkah 3 + 4 dari pola 5-langkah).
// ---------------------------------------------------------------------------

type Opsi = {
  instruksi: string; // peran + aturan main AI (system prompt)
  data: unknown; // bahan yang dinilai - dikirim sebagai DATA, bukan perintah
  skema: object; // JSON Schema: bentuk jawaban yang kita terima
  nama?: string;
};

// Beda dari materi: hasil tidak langsung `JSON.parse(...) as T`. Kita UKUR (2 panggilan
// sungguhan ke gateway, 27 Agustus 2026) bahwa bandelbanget.xyz/gpt-5.6 MEMANG
// menegakkan json_schema strict - model yang disuruh membalas prosa tetap dipaksa ke
// bentuk JSON. Jadi response_format itu tambalan yang beneran jalan di provider kita,
// bukan diminta lewat prompt. Tapi parse tetap gagal-tertutup, karena:
//   (1) provider bisa diganti kapan saja ke yang TIDAK menegakkan schema;
//   (2) `Boolean("false")` bernilai true, jadi model yang mengembalikan boolean sebagai
//       string berubah dari MENOLAK jadi MEMBAYAR - guard boolean ada di pemanggil;
//   (3) balasan berisi prosa + JSON campur harus ditolak, bukan dipungut kurungnya.
const uraiJSON = (content: string) => {
  const bersih = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  let hasil: unknown;
  try {
    hasil = JSON.parse(bersih);
  } catch {
    throw new Error(`jawaban LLM bukan JSON utuh: ${bersih.slice(0, 200)}`);
  }
  if (typeof hasil !== "object" || hasil === null)
    throw new Error(`jawaban LLM bukan objek: ${bersih.slice(0, 200)}`);
  return hasil;
};

export const tanyaAI = async <T>({ instruksi, data, skema, nama = "jawaban" }: Opsi): Promise<T> => {
  const res = await fetch(`${LLM.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${LLM.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: LLM.model,
      // instruksi = system (aturan main kita), data = user dan di-JSON.stringify.
      // Pemisahan ini disengaja: data dari orang asing tidak pernah menempel jadi satu
      // pesan dengan instruksi kita.
      messages: [
        { role: "system", content: instruksi },
        { role: "user", content: JSON.stringify(data) },
      ],
      temperature: 0, // keputusan yang ada duitnya: sekonsisten mungkin, bukan sekreatif mungkin
      response_format: { type: "json_schema", json_schema: { name: nama, strict: true, schema: skema } },
    }),
    signal: AbortSignal.timeout(120_000), // request nggantung tak boleh bikin escrow nunggu selamanya
  });

  // Badan error dipotong: sebagian gateway OpenAI-compatible menggemakan potongan kunci
  // API di balasan 401, dan pesan ini ikut tercetak di terminal saat demo.
  if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const hasil = (await res.json()) as {
    choices?: { message?: { content?: string; refusal?: string }; finish_reason?: string }[];
  };
  const pilihan = hasil.choices?.[0];
  // Dua kegagalan yang bentuknya BUKAN error HTTP. Kalau tidak dicek, keduanya muncul
  // sebagai JSON.parse gagal dengan pesan yang membingungkan.
  if (pilihan?.message?.refusal) throw new Error(`LLM menolak: ${pilihan.message.refusal}`);
  if (pilihan?.finish_reason === "length") throw new Error("jawaban terpotong - perpendek input");
  const content = pilihan?.message?.content;
  if (!content) throw new Error("LLM tidak mengembalikan isi jawaban");

  return uraiJSON(content) as T;
};
