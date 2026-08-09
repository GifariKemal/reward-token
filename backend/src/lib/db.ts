// lib/db.ts = SQLite (bun:sqlite): skema, prepared statement, dan query
// 3 tabel: bounties, submissions, sync_checkpoint (block terakhir yang diproses)

import { Database } from "bun:sqlite";
import type { Address } from "viem";

// strict: bind {param} tanpa prefix "@" + error bila ada parameter terlewat
// DB_PATH bisa ditimpa lewat env supaya test tidak menyentuh basis data sungguhan
//
// Handle disimpan di globalThis dengan alasan yang sama seperti penjaga watcher di
// src/index.ts: `bun run --hot` mengevaluasi ulang SELURUH graf impor, bukan hanya
// berkas yang disunting, jadi tanpa ini setiap simpan berkas membuka satu handle
// SQLite baru tanpa menutup yang lama. Akibatnya terlihat nyata: WAL tidak pernah
// bisa checkpoint karena selalu ada pembaca sisa yang menahannya (terukur 994 KB WAL
// untuk 36 KB data), dan prepared statement lama menunjuk handle yang sudah mati.
const g = globalThis as { __db?: Database };
export const db = (g.__db ??= new Database(process.env.DB_PATH ?? "papan-sayembara.db", {
  create: true,
  strict: true,
}));

// WAL = baca & tulis barengan; busy_timeout = sabar antre kalau proses lain lagi nulis
// (dua proses memakai file ini: `bun dev` untuk indexer/API dan `bun oracle` untuk juri)
db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");

db.exec(`
  CREATE TABLE IF NOT EXISTS bounties (
    bounty_id    INTEGER PRIMARY KEY,
    escrow       TEXT UNIQUE NOT NULL,
    creator      TEXT NOT NULL,
    reward_amount TEXT NOT NULL,
    tx_hash      TEXT NOT NULL,
    block_number INTEGER NOT NULL,
    block_hash   TEXT,
    created_at   INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS submissions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    escrow        TEXT NOT NULL,
    worker        TEXT NOT NULL,
    proof_uri     TEXT NOT NULL,
    status        TEXT NOT NULL, -- 'submitted' | 'rewarded' | 'rejected'
    reward_amount TEXT,
    tx_hash       TEXT UNIQUE NOT NULL, -- UNIQUE → tidak ada baris ganda
    block_number  INTEGER NOT NULL,
    block_hash    TEXT,
    created_at    INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_submissions_escrow ON submissions(escrow);
  CREATE INDEX IF NOT EXISTS idx_submissions_worker ON submissions(worker);

  CREATE TABLE IF NOT EXISTS sync_checkpoint (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    last_block  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS verdicts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    escrow     TEXT NOT NULL,
    worker     TEXT NOT NULL,
    eligible   INTEGER NOT NULL, -- 0/1; chain cuma simpan hasilnya, alasan AI hidup di sini
    alasan     TEXT NOT NULL,
    tx_hash    TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_verdicts_escrow ON verdicts(escrow);
`);

// Migrasi untuk basis data yang dibuat sebelum kolom block_hash ada.
// CREATE TABLE IF NOT EXISTS tidak menambah kolom ke tabel yang sudah berdiri.
for (const t of ["bounties", "submissions"]) {
  const kolom = db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[];
  if (!kolom.some((k) => k.name === "block_hash")) db.exec(`ALTER TABLE ${t} ADD COLUMN block_hash TEXT`);
}

// Samakan kapitalisasi alamat escrow. `bounties.escrow` dulu diisi dari
// `log.args.escrow` yang sudah dinormalkan viem ke checksum, sedangkan
// `submissions.escrow` dan `verdicts.escrow` diisi dari `log.address` yang huruf
// kecil apa adanya. Keduanya bertipe Address di mata TypeScript, jadi tidak ada yang
// mengeluh, tapi setiap konsumen yang menyambungkan dua tabel itu dengan
// perbandingan string mentah akan mendapat NOL baris. Ini ranjau untuk frontend
// Sesi 7, jadi diberesi di sumbernya (lihat indexer/handlers.ts) sekaligus di baris
// yang sudah tersimpan.
// OR IGNORE: kolomnya UNIQUE, jadi kalau bentuk checksum dan bentuk huruf kecil dari
// alamat yang sama pernah bersanding, UPDATE biasa akan melempar di tingkat modul dan
// membuat KEDUA proses menolak start tanpa cara membetulkannya lewat aplikasi.
db.exec("UPDATE OR IGNORE bounties SET escrow = lower(escrow) WHERE escrow <> lower(escrow)");

// Bentuk baris tabel (dipakai di services/routes)
export type BountyRow = {
  bounty_id: number; escrow: string; creator: string; reward_amount: string;
  tx_hash: string; block_number: number; block_hash: string | null; created_at: number;
};
export type SubmissionRow = {
  id: number; escrow: string; worker: string; proof_uri: string; status: string;
  reward_amount: string | null; tx_hash: string; block_number: number; block_hash: string | null; created_at: number;
};

// Block terakhir yang sudah diproses (untuk backfill)
export const getCheckpoint = (): bigint => {
  const row = db.prepare("SELECT last_block FROM sync_checkpoint WHERE id = 1").get() as { last_block: number } | undefined;
  return BigInt(row?.last_block ?? 0);
};

export const setCheckpoint = (block: bigint) =>
  db.prepare("INSERT INTO sync_checkpoint (id, last_block) VALUES (1, ?1) ON CONFLICT(id) DO UPDATE SET last_block = ?1")
    .run(Number(block));

// Daftar alamat escrow yang sudah dikenal indexer
export const knownEscrows = () =>
  (db.prepare("SELECT escrow FROM bounties").all() as { escrow: string }[]).map((r) => r.escrow as Address);

// Insert bounty (ON CONFLICT DO NOTHING = idempotent)
export const upsertBounty = db.prepare(`
  INSERT INTO bounties (bounty_id, escrow, creator, reward_amount, tx_hash, block_number, block_hash, created_at)
  VALUES (@bountyId, @escrow, @creator, @rewardAmount, @txHash, @blockNumber, @blockHash, @ts)
  ON CONFLICT(bounty_id) DO NOTHING
`);

// Insert submission (OR IGNORE + tx_hash UNIQUE = idempotent)
export const insertSubmission = db.prepare(`
  INSERT OR IGNORE INTO submissions (escrow, worker, proof_uri, status, tx_hash, block_number, block_hash, created_at)
  VALUES (@escrow, @worker, @proofUri, 'submitted', @txHash, @blockNumber, @blockHash, @ts)
`);

// Update status submission terakhir pada escrow tertentu (tanpa match = no-op)
export const markLatestSubmission = (escrow: string, status: string, rewardAmount?: string) =>
  db.prepare(`
    UPDATE submissions SET status = ?, reward_amount = ?
    WHERE id = (SELECT id FROM submissions WHERE escrow = ? ORDER BY id DESC LIMIT 1)
  `).run(status, rewardAmount ?? null, escrow);

// Query untuk API: daftar bounty + submission hasil indexing
export const getBoard = () => ({
  bounties: db.prepare("SELECT * FROM bounties ORDER BY block_number DESC").all() as BountyRow[],
  submissions: db.prepare("SELECT * FROM submissions ORDER BY block_number DESC").all() as SubmissionRow[],
});

// Submission yang masih menunggu penilaian (dikonsumsi juri AI via GET /pending)
// tx_hash ikut diambil (di luar materi) karena juri memakainya sebagai kunci
// idempoten. Kunci berbasis proof_uri tidak cukup: setelah ditolak, escrow kembali ke
// status Dibuka, jadi worker boleh memperbaiki isi berkas lalu submit lagi dengan URL
// yang sama, dan submission baru itu tidak akan pernah dinilai. tx_hash sudah UNIQUE
// di skema, jadi ia unik per submission.
export type PendingRow = Pick<
  SubmissionRow,
  "escrow" | "worker" | "proof_uri" | "tx_hash" | "block_number" | "created_at"
>;

export const getPending = () =>
  db.prepare(`
    SELECT escrow, worker, proof_uri, tx_hash, block_number, created_at FROM submissions
    WHERE status = 'submitted' ORDER BY block_number ASC, id ASC
  `).all() as PendingRow[];

// Peringkat worker: jumlah menang + total reward
// (BigInt di JS - nilai wei kelewat besar untuk SUM() SQLite yang cuma 64-bit)
export const getLeaderboard = () => {
  const rows = db.prepare("SELECT worker, reward_amount FROM submissions WHERE status = 'rewarded'")
    .all() as { worker: string; reward_amount: string | null }[];
  const skor = new Map<string, { wins: number; total: bigint }>();
  for (const r of rows) {
    const s = skor.get(r.worker) ?? { wins: 0, total: 0n };
    // Nilai yang tidak bisa jadi BigInt tidak boleh menjatuhkan seluruh peringkat.
    // Tanpa penjaga ini satu baris rusak membuat GET /leaderboard 500 untuk semua.
    let hadiah = 0n;
    try {
      hadiah = BigInt(r.reward_amount ?? 0);
    } catch {
      console.error(`reward_amount tidak bisa dibaca untuk ${r.worker}: ${r.reward_amount}`);
    }
    skor.set(r.worker, { wins: s.wins + 1, total: s.total + hadiah });
  }
  return [...skor]
    .map(([worker, s]) => ({ worker, wins: s.wins, total_reward: s.total.toString() }))
    // Seri jumlah menang dipecah oleh total hadiah, lalu oleh alamat worker supaya
    // urutannya tidak bergantung pada urutan penyisipan Map. Cabang terakhir WAJIB
    // ada: pembanding yang mengembalikan -1 untuk dua nilai yang sama bukan cuma
    // salah urut, ia tidak antisimetris sehingga hasil sort jadi tidak terdefinisi
    // dan berubah-ubah mengikuti urutan masukan.
    .sort((a, b) => {
      if (a.wins !== b.wins) return b.wins - a.wins;
      const ta = BigInt(a.total_reward);
      const tb = BigInt(b.total_reward);
      if (ta !== tb) return tb > ta ? 1 : -1;
      return a.worker < b.worker ? -1 : a.worker > b.worker ? 1 : 0;
    });
};

// Verdict AI: hasil + alasan (chain cuma tahu true/false, alasannya disimpan di sini)
export const insertVerdict = db.prepare(`
  INSERT INTO verdicts (escrow, worker, eligible, alasan, tx_hash, created_at)
  VALUES (@escrow, @worker, @eligible, @alasan, @txHash, @ts)
`);

export const getVerdicts = (escrow: string) =>
  db.prepare("SELECT * FROM verdicts WHERE escrow = ? ORDER BY id DESC").all(escrow);

// --- dukungan deteksi reorg (lihat indexer/reorg.ts) ---

// Block terindeks yang masih dalam jendela rawan reorg, beserta hash yang tercatat.
// Baris tanpa block_hash (dari versi skema lama) dilewati, umurnya sudah jauh di
// belakang jendela itu sehingga praktis final.
export const indexedBlocksSince = (block: number) =>
  db.prepare(`
    SELECT block_number AS n, block_hash AS h FROM bounties
      WHERE block_hash IS NOT NULL AND block_number >= ?1
    UNION
    SELECT block_number AS n, block_hash AS h FROM submissions
      WHERE block_hash IS NOT NULL AND block_number >= ?1
    ORDER BY n
  `).all(block) as { n: number; h: string }[];

export const deleteRowsAtBlock = (block: number) => {
  db.prepare("DELETE FROM bounties WHERE block_number = ?").run(block);
  db.prepare("DELETE FROM submissions WHERE block_number = ?").run(block);
};

// Catatan: `setBlockHash` (pengisian block_hash baris lama, sekali jalan pada 4 Agustus
// 2026) dihapus setelah tugasnya selesai. Ia satu-satunya query yang menyusun nama
// tabel lewat template string, dan jaminan union `"bounties" | "submissions"` hanya
// berlaku saat kompilasi, jadi membiarkannya menganggur berarti menyimpan calon
// lubang injeksi tanpa pemakai.
