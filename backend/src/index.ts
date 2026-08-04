// index.ts = entry point: jalankan indexer, lalu sajikan API

import { PORT } from "./config";
import { backfill } from "./indexer/backfill";
import { watch } from "./indexer/watch";
import { app } from "./routes/api";

// Bila backfill gagal (RPC bermasalah), API tetap hidup - checkpoint melanjutkan di run berikutnya
await backfill().catch((e) => console.error("⚠️ backfill gagal, API tetap jalan:", e?.shortMessage ?? e));

// Beda dari materi: `bun run --hot` menjalankan ulang modul ini tanpa menutup watcher
// lama, jadi satu event memicu handler sebanyak jumlah reload. Penanda di globalThis
// bertahan lintas reload, jadi watcher hanya didaftarkan sekali.
// Batasnya: sunting watch.ts butuh restart penuh, bukan cukup hot reload.
const g = globalThis as { __watcherAktif?: boolean };
if (!g.__watcherAktif) {
  g.__watcherAktif = true;
  watch();
}

console.log(`🚀 API jalan di http://localhost:${PORT}/board`);
export default { port: PORT, fetch: app.fetch };
