// indexer/reorg.ts = jaga konsistensi saat chain melakukan reorganisasi.
//
// Masalahnya: insert indexer idempotent, jadi scan ulang aman. Tapi idempotent
// tidak berarti self-healing. Kalau sebuah block ter-reorg keluar dari chain,
// barisnya tetap tinggal di basis data selamanya dan API menyajikan event yang
// sudah tidak ada. Checkpoint hanya bergerak maju, jadi tidak ada yang
// membersihkannya.
//
// Penanganannya: catat hash block saat indexing, lalu secara berkala bandingkan
// hash tercatat dengan hash kanonik pada ketinggian yang sama. Kalau beda, block
// itu bukan lagi bagian dari chain: hapus barisnya dan putar checkpoint ke
// sebelum block itu supaya backfill mengisi ulang versi yang kanonik.

import { client } from "../lib/chain";
import { deleteRowsAtBlock, indexedBlocksSince, setCheckpoint } from "../lib/db";

// Jendela yang masih dianggap rawan. BSC punya fast finality (beberapa block),
// 200 memberi margin lebar tanpa membuat pemeriksaan jadi mahal.
export const SAFETY_BLOCKS = 200n;

type HashOf = (block: bigint) => Promise<string | null>;

const hashDariChain: HashOf = (block) =>
  client.getBlock({ blockNumber: block }).then((b) => b.hash as string).catch(() => null);

// hashOf bisa diinjeksi supaya logikanya bisa diuji tanpa jaringan (lihat reorg.test.ts)
export const reconcile = async (hashOf: HashOf = hashDariChain, latestBlock?: bigint) => {
  const latest = latestBlock ?? (await client.getBlockNumber());
  const dari = latest > SAFETY_BLOCKS ? latest - SAFETY_BLOCKS : 0n;
  const blocks = indexedBlocksSince(Number(dari));
  if (!blocks.length) return { diperiksa: 0, direorg: 0 };

  let terkecil: number | null = null;
  for (const { n, h } of blocks) {
    const kanonik = await hashOf(BigInt(n));
    if (!kanonik || kanonik.toLowerCase() === h.toLowerCase()) continue; // tidak bisa dicek, atau masih kanonik
    deleteRowsAtBlock(n);
    terkecil = terkecil === null ? n : Math.min(terkecil, n);
    console.log("⟲ reorg: block %d tidak lagi kanonik, barisnya dihapus", n);
  }

  if (terkecil !== null) {
    setCheckpoint(BigInt(terkecil - 1)); // backfill berikutnya mengisi ulang dari sini
    console.log("⟲ checkpoint diputar ke %d, backfill akan mengindeks ulang", terkecil - 1);
  }
  return { diperiksa: blocks.length, direorg: terkecil === null ? 0 : 1 };
};
