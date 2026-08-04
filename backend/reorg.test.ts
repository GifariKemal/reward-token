// Uji logika reorg tanpa jaringan: hash kanonik diinjeksi, bukan diambil dari chain.
// Basis datanya sementara, diarahkan lewat DB_PATH sebelum modul db diimpor.

import { afterAll, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DB = join(tmpdir(), `uji-reorg-${process.pid}.db`);
process.env.DB_PATH = DB;

const { db, getCheckpoint, insertSubmission, setCheckpoint, upsertBounty } = await import("./src/lib/db");
const { reconcile } = await import("./src/indexer/reorg");

afterAll(() => {
  db.close();
  for (const s of ["", "-wal", "-shm"]) rmSync(DB + s, { force: true });
});

const HASH_LAMA = "0xaaaa000000000000000000000000000000000000000000000000000000000001";
const HASH_BARU = "0xbbbb000000000000000000000000000000000000000000000000000000000002";

const bikinBounty = (id: number, block: number, hash: string | null) =>
  upsertBounty.run({
    bountyId: id, escrow: `0xesc${id}`, creator: "0xcreator", rewardAmount: "1",
    txHash: `0xtx${id}`, blockNumber: block, blockHash: hash, ts: 0,
  });

test("block yang masih kanonik dibiarkan utuh", async () => {
  bikinBounty(1, 1000, HASH_LAMA);
  setCheckpoint(1100n);

  const hasil = await reconcile(async () => HASH_LAMA, 1100n);

  expect(hasil.direorg).toBe(0);
  expect(db.prepare("SELECT COUNT(*) c FROM bounties").get()).toEqual({ c: 1 });
  expect(getCheckpoint()).toBe(1100n); // checkpoint tidak diganggu
});

test("block yang ter-reorg dihapus dan checkpoint diputar ke belakang", async () => {
  const hasil = await reconcile(async () => HASH_BARU, 1100n); // hash kanonik berubah

  expect(hasil.direorg).toBe(1);
  expect(db.prepare("SELECT COUNT(*) c FROM bounties").get()).toEqual({ c: 0 }); // baris basi dibuang
  expect(getCheckpoint()).toBe(999n); // backfill akan mengindeks ulang dari block itu
});

test("submission ikut terhapus, dan baris tanpa block_hash tidak disentuh", async () => {
  bikinBounty(2, 2000, HASH_LAMA);
  insertSubmission.run({
    escrow: "0xesc2", worker: "0xworker", proofUri: "bukti", txHash: "0xtxs2",
    blockNumber: 2000, blockHash: HASH_LAMA, ts: 0,
  });
  bikinBounty(3, 2001, null); // skema lama, hash tidak tercatat
  setCheckpoint(2100n);

  const hasil = await reconcile(async (n) => (n === 2000n ? HASH_BARU : HASH_LAMA), 2100n);

  expect(hasil.direorg).toBe(1);
  expect(db.prepare("SELECT COUNT(*) c FROM submissions").get()).toEqual({ c: 0 });
  expect(db.prepare("SELECT bounty_id FROM bounties").all()).toEqual([{ bounty_id: 3 }]); // yang tanpa hash tetap
  expect(getCheckpoint()).toBe(1999n);
});

test("block di luar jendela SAFETY_BLOCKS tidak diperiksa", async () => {
  const hasil = await reconcile(async () => HASH_BARU, 999_999n); // 2001 jauh di bawah jendela
  expect(hasil.diperiksa).toBe(0);
  expect(db.prepare("SELECT COUNT(*) c FROM bounties").get()).toEqual({ c: 1 }); // bounty 3 selamat
});
