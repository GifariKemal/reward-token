// index.ts = entry point: jalankan indexer, lalu sajikan API

import { PORT } from "./config";
import { backfill } from "./indexer/backfill";
import { reconcile } from "./indexer/reorg";
import { watch } from "./indexer/watch";
import { app } from "./routes/api";

// Buang dulu baris dari block yang sudah ter-reorg keluar dari chain, supaya
// backfill di bawah mengisi ulang versi yang kanonik.
await reconcile().catch((e) => console.error("⚠️ pemeriksaan reorg gagal:", e?.shortMessage ?? e));

// Bila backfill gagal (RPC bermasalah), API tetap hidup - checkpoint melanjutkan di run berikutnya
await backfill().catch((e) => console.error("⚠️ backfill gagal, API tetap jalan:", e?.shortMessage ?? e));

// Beda dari materi: `bun run --hot` menjalankan ulang modul ini tanpa menutup watcher
// lama, jadi satu event memicu handler sebanyak jumlah reload. Penanda di globalThis
// bertahan lintas reload, jadi watcher hanya didaftarkan sekali.
// Batasnya: sunting watch.ts butuh restart penuh, bukan cukup hot reload.
const g = globalThis as { __watcherAktif?: boolean; __reorgTimer?: ReturnType<typeof setInterval> };
if (!g.__watcherAktif) {
  g.__watcherAktif = true;
  watch();
  // watchEvent bersifat optimistis: event langsung diindeks tanpa menunggu final.
  // Pemeriksaan berkala inilah yang membersihkannya kalau ternyata ter-reorg.
  g.__reorgTimer = setInterval(
    () => reconcile().catch((e) => console.error("⚠️ pemeriksaan reorg gagal:", e?.shortMessage ?? e)),
    5 * 60_000,
  );
}

console.log(`🚀 API jalan di http://localhost:${PORT}/board`);
export default { port: PORT, fetch: app.fetch };
