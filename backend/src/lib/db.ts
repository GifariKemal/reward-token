// lib/db.ts = SQLite (bun:sqlite): skema, prepared statement, dan query
// 3 tabel: bounties, submissions, sync_checkpoint (block terakhir yang diproses)

import { Database } from "bun:sqlite";
import type { Address } from "viem";

// strict: bind {param} tanpa prefix "@" + error bila ada parameter terlewat
// DB_PATH bisa ditimpa lewat env supaya test tidak menyentuh basis data sungguhan
export const db = new Database(process.env.DB_PATH ?? "papan-sayembara.db", { create: true, strict: true });

db.exec("PRAGMA journal_mode = WAL;");

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
`);

// Migrasi untuk basis data yang dibuat sebelum kolom block_hash ada.
// CREATE TABLE IF NOT EXISTS tidak menambah kolom ke tabel yang sudah berdiri.
for (const t of ["bounties", "submissions"]) {
  const kolom = db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[];
  if (!kolom.some((k) => k.name === "block_hash")) db.exec(`ALTER TABLE ${t} ADD COLUMN block_hash TEXT`);
}

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

// Isi block_hash baris lama sekali jalan, selagi RPC masih menyajikan block itu
export const setBlockHash = (table: "bounties" | "submissions", block: number, hash: string) =>
  db.prepare(`UPDATE ${table} SET block_hash = ? WHERE block_number = ? AND block_hash IS NULL`).run(hash, block);
