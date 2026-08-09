// routes/api.ts = definisi endpoint REST (Hono)

import { Hono } from "hono";
import { cors } from "hono/cors";
import { isAddress } from "viem";
import { getBoard, getLeaderboard, getPending, getVerdicts, insertVerdict } from "../lib/db";
import { relayerWallet } from "../lib/wallet";
import { balanceOf, board, escrowSah, readEscrow } from "../services/bounty";
import { createBounty, relayerAddress, submitWork } from "../services/relayer";
import { uriAman } from "../services/judge";

export const app = new Hono();

// Izinkan frontend localhost memanggil API. Beda dari materi yang memakai `cors()`
// telanjang: default itu membalas `Allow-Origin: *`, sehingga situs mana pun yang
// dibuka di browser mesin ini bisa memanggil /relay/* yang membelanjakan gas dan
// hadiah, tanpa penyerang perlu akses jaringan ke port 3000.
app.use("/*", cors({ origin: (o) => (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o) ? o : "") }));

// Pembatasan origin di atas SAJA tidak menutup CSRF, dan sempat saya klaim begitu.
// CORS memblokir PEMBACAAN respons lintas origin, bukan pengirimannya. Halaman jahat
// bisa mengirim POST dengan `content-type: text/plain`, itu simple request sehingga
// tidak memicu preflight, dan Hono `c.req.json()` mem-parse badan tanpa memeriksa
// content-type. Transaksinya tetap jalan walau penyerang tidak bisa membaca balasan.
// Dengan syarat ini, dua jalurnya tertutup: `text/plain` ditolak di sini, sedangkan
// `application/json` bukan simple request sehingga wajib preflight dan preflight-nya
// gagal di pembatasan origin.
app.use("/*", async (c, next) => {
  if (c.req.method === "POST" && !c.req.header("content-type")?.toLowerCase().startsWith("application/json"))
    return c.json({ error: "content-type harus application/json" }, 415);
  await next();
});

app.onError((err, c) => {
  console.error("api error:", err);
  return c.json({ error: "internal error" }, 500);
});
app.notFound((c) => c.json({ error: "route tidak ditemukan" }, 404));

// GET /board → semua bounty + submission (hasil indexing + total live)
app.get("/board", async (c) => c.json(await board()));

// GET /bounty/:escrow → detail satu bounty (live dari chain)
app.get("/bounty/:escrow", async (c) => {
  // toLowerCase dulu, seragam dengan route lain: `isAddress` default strict menolak
  // alamat bercampur huruf yang checksum-nya keliru, dan tanpa ini route yang satu
  // membalas 400 sementara route lain membalas 200 untuk alamat yang sama.
  const escrow = c.req.param("escrow").toLowerCase();
  if (!isAddress(escrow)) return c.json({ error: "alamat tidak valid" }, 400);
  return c.json(await readEscrow(escrow));
});

// GET /wallet/:address → bounty yang dibuat + submission milik wallet tersebut
app.get("/wallet/:address", (c) => {
  const addr = c.req.param("address").toLowerCase();
  if (!isAddress(addr)) return c.json({ error: "alamat tidak valid" }, 400);
  const { bounties, submissions } = getBoard();
  return c.json({
    bounties: bounties.filter((b) => b.creator.toLowerCase() === addr),
    submissions: submissions.filter((s) => s.worker.toLowerCase() === addr),
  });
});

// GET /balance/:address → saldo token RWD
app.get("/balance/:address", async (c) => {
  // toLowerCase dulu supaya konsisten dengan /wallet/:address. `isAddress` default
  // strict, jadi tanpa ini alamat huruf besar semua ditolak di sini tapi diterima di
  // sana, padahal keduanya alamat yang sama.
  const addr = c.req.param("address").toLowerCase();
  if (!isAddress(addr)) return c.json({ error: "alamat tidak valid" }, 400);
  return c.json({ balance: (await balanceOf(addr)).toString() });
});

// GET /pending → submission yang menunggu penilaian (dikonsumsi juri AI)
app.get("/pending", (c) => c.json({ pending: getPending() }));

// GET /leaderboard → peringkat worker berdasarkan reward yang sudah diterima
app.get("/leaderboard", (c) => c.json({ leaderboard: getLeaderboard() }));

// POST /verdicts → juri AI melaporkan hasil + alasan (chain cuma simpan true/false)
app.post("/verdicts", async (c) => {
  const b = await c.req.json().catch(() => null);
  // typeof diperiksa SEBELUM regex apa pun. `RegExp.test` dan `isAddress` memaksa
  // argumennya jadi string lebih dulu, jadi `["0x..."]` lolos pemeriksaan bentuk lalu
  // melempar di driver SQLite yang strict, dan hasilnya 500 padahal ini masukan salah.
  const teks = (v: unknown): v is string => typeof v === "string";
  const valid = b && teks(b.escrow) && teks(b.worker) && isAddress(b.escrow) && isAddress(b.worker)
    && typeof b.eligible === "boolean" && teks(b.alasan);
  if (!valid) return c.json({ error: "butuh: escrow, worker, eligible (boolean), alasan" }, 400);
  // Beda dari materi: batas panjang alasan. Endpoint ini tanpa autentikasi, jadi
  // tanpa batas satu POST bisa menulis teks sebesar apa pun ke basis data.
  if (b.alasan.length > 2000) return c.json({ error: "alasan maksimal 2000 karakter" }, 400);
  // tx_hash juga wajib divalidasi, kalau tidak batas di atas cuma hiasan: badan
  // request bisa menitipkan megabyte lewat field sebelahnya, dan nilai bukan-string
  // bikin driver SQLite melempar sehingga jadi 500 padahal ini masukan salah.
  if (b.tx_hash != null && (!teks(b.tx_hash) || !/^0x[0-9a-f]{64}$/i.test(b.tx_hash)))
    return c.json({ error: "tx_hash harus hash 32 byte berawalan 0x" }, 400);
  // lowercase supaya konsisten dengan tabel submissions (alamat dari body bisa checksummed)
  insertVerdict.run({
    escrow: b.escrow.toLowerCase(), worker: b.worker.toLowerCase(), eligible: b.eligible ? 1 : 0,
    alasan: b.alasan, txHash: b.tx_hash ?? null, ts: Date.now(),
  });
  return c.json({ ok: true }, 201);
});

// GET /verdicts/:escrow → riwayat penilaian AI untuk satu bounty, beserta alasannya
app.get("/verdicts/:escrow", (c) => {
  const escrow = c.req.param("escrow").toLowerCase();
  if (!isAddress(escrow)) return c.json({ error: "alamat tidak valid" }, 400);
  return c.json({ verdicts: getVerdicts(escrow) });
});

// --- Endpoint TULIS: backend yang tanda tangan & bayar gas (relayer) ---

// Semua route di bawah butuh RELAYER_PK; tanpa itu backend cuma bisa membaca
app.use("/relay/*", async (c, next) => {
  if (!relayerWallet) return c.json({ error: "relayer mati: isi RELAYER_PK di .env" }, 503);
  await next();
});

// POST /relay/bounty → bikin bounty baru (approve + createBounty dalam satu panggilan)
app.post("/relay/bounty", async (c) => {
  const b = await c.req.json().catch(() => null);
  if (!b || typeof b.reward !== "string" || typeof b.rules_uri !== "string")
    return c.json({ error: 'butuh: reward (string, mis. "10"), rules_uri' }, 400);
  // Beda dari materi: route ini membelanjakan gas DAN hadiah RWD tanpa autentikasi.
  // Batas angka + skema URI menahan satu panggilan iseng menghabiskan saldo relayer.
  // Yang divalidasi harus STRING yang nanti dipakai parseEther, bukan hasil Number():
  // "1e2" dan "0x64" lolos Number.isFinite tapi artinya beda di parseEther.
  // maksimal 18 desimal: lebih dari itu dipangkas parseEther, dan "0.0000000000000000001"
  // lolos batas angka tapi lahir jadi bounty berhadiah nol wei
  if (typeof b.reward !== "string" || !/^\d+(\.\d{1,18})?$/.test(b.reward) ||
      Number(b.reward) <= 0 || Number(b.reward) > 100)
    return c.json({ error: "reward harus angka desimal > 0, <= 100, maksimal 18 desimal" }, 400);
  if (!uriAman(b.rules_uri)) return c.json({ error: "rules_uri harus http(s) atau ipfs publik" }, 400);
  // Bilangan bulat: pecahan seperti 0,0001 jam dibulatkan ke bawah menjadi 0 detik,
  // jadi bounty lahir dengan tenggat yang sudah lewat dan submitWork langsung revert.
  const jam = Number(b.deadline_jam ?? 24);
  if (!Number.isInteger(jam) || jam <= 0 || jam > 24 * 30)
    return c.json({ error: "deadline_jam harus bilangan bulat > 0 dan <= 720" }, 400);
  return c.json(await createBounty(b.reward, b.rules_uri, jam), 201);
});

// POST /relay/bounty/:escrow/submit → kirim bukti kerjaan ke satu bounty
app.post("/relay/bounty/:escrow/submit", async (c) => {
  const escrow = c.req.param("escrow");
  const b = await c.req.json().catch(() => null);
  if (!isAddress(escrow)) return c.json({ error: "alamat tidak valid" }, 400);
  if (!b || typeof b.proof_uri !== "string") return c.json({ error: "butuh: proof_uri" }, 400);
  if (!uriAman(b.proof_uri)) return c.json({ error: "proof_uri harus http(s) atau ipfs publik" }, 400);
  // ponytail: pemeriksaan di route karena cuma ada satu pemanggil. Kalau nanti ada
  // pemanggil lain, turunkan ke services/relayer.ts supaya tidak bisa dilewati.
  if (!(await escrowSah(escrow)))
    return c.json({ error: "escrow bukan hasil factory ini" }, 400);
  return c.json(await submitWork(escrow, b.proof_uri));
});

// GET /health → cek server hidup + status relayer
app.get("/health", (c) =>
  c.json({ ok: true, relayer: relayerAddress() ?? "mati", time: new Date().toISOString() }));
