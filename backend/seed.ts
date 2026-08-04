// seed.ts = ekspor/impor isi indeks sebagai SQL.
//
// Kenapa data turunan perlu dicadangkan: RPC publik BSC Testnet memangkas riwayat
// block lama. Per 4 Agustus 2026 hanya thirdweb yang masih menyajikan block deploy
// 121410684, tiga RPC lain sudah menolak. Begitu yang terakhir menyusul memangkas,
// riwayat awal tidak bisa diindeks ulang oleh siapa pun. Seed inilah satu-satunya
// jalan bagi klon baru untuk punya riwayat itu.
//
// Seed menyertakan sync_checkpoint, jadi klon baru langsung melanjutkan ke depan
// dan tidak mencoba memindai riwayat yang sudah tidak tersedia.
//
//   bun run seed:export   -> tulis seed.sql dari basis data sekarang
//   bun run seed:import   -> muat seed.sql ke basis data (aman diulang, idempotent)

import { db } from "./src/lib/db";

const FILE = "seed.sql";
const q = (v: unknown) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

const ekspor = async () => {
  const baris: string[] = [
    "-- Dibuat oleh `bun run seed:export`. Jangan disunting tangan.",
    "-- Snapshot indeks riwayat on-chain yang block-nya sudah/akan dipangkas RPC publik.",
    "",
  ];
  const tabel = {
    bounties: ["bounty_id", "escrow", "creator", "reward_amount", "tx_hash", "block_number", "block_hash", "created_at"],
    submissions: ["escrow", "worker", "proof_uri", "status", "reward_amount", "tx_hash", "block_number", "block_hash", "created_at"],
  } as const;

  for (const [nama, kolom] of Object.entries(tabel)) {
    const rows = db.prepare(`SELECT ${kolom.join(", ")} FROM ${nama} ORDER BY block_number`).all() as Record<string, unknown>[];
    baris.push(`-- ${nama}: ${rows.length} baris`);
    for (const r of rows) {
      baris.push(`INSERT OR IGNORE INTO ${nama} (${kolom.join(", ")}) VALUES (${kolom.map((k) => q(r[k])).join(", ")});`);
    }
    baris.push("");
  }

  const cp = db.prepare("SELECT last_block FROM sync_checkpoint WHERE id = 1").get() as { last_block: number } | undefined;
  if (cp) {
    baris.push("-- checkpoint: klon baru melanjutkan dari sini, tidak memindai riwayat yang sudah dipangkas");
    baris.push(`INSERT INTO sync_checkpoint (id, last_block) VALUES (1, ${cp.last_block})`);
    baris.push(`  ON CONFLICT(id) DO UPDATE SET last_block = MAX(last_block, ${cp.last_block});`);
  }

  await Bun.write(FILE, baris.join("\n") + "\n");
  console.log(`tertulis ${FILE}`);
};

const impor = async () => {
  const f = Bun.file(FILE);
  if (!(await f.exists())) throw new Error(`${FILE} tidak ada, jalankan seed:export dulu`);
  db.exec(await f.text());
  const n = (t: string) => (db.prepare(`SELECT COUNT(*) c FROM ${t}`).get() as { c: number }).c;
  console.log(`terimpor | bounties: ${n("bounties")} | submissions: ${n("submissions")}`);
};

const mode = process.argv[2];
if (mode === "export") await ekspor();
else if (mode === "import") await impor();
else {
  console.error("pakai: bun seed.ts export|import");
  process.exit(1);
}
