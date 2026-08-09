// oracle.ts = entry point KEDUA (`bun oracle`), proses terpisah dari API.
// Loop: ambil antrean dari SQLite → cek ulang ke chain → LLM menilai →
// kirim fulfillVerification → simpan alasan ke tabel verdicts.

import { getAddress } from "viem";
import { LLM, POLL_INTERVAL_MS } from "./config";
import { getPending, insertVerdict } from "./lib/db";
import { oracleWallet } from "./lib/wallet";
import { readEscrow } from "./services/bounty";
import { judgeSubmission } from "./services/judge";
import { oracleOnchain, sendVerdict } from "./services/oracle";

if (!oracleWallet) throw new Error("ORACLE_PK belum diisi - cek .env");
// Diperiksa di sini juga (di luar materi), kalau tidak juri mencetak semua tanda
// sehat lalu diam-diam melempar LLM 401 tiap 15 detik, dan pemakai menyimpulkan
// antreannya kosong.
if (!LLM.apiKey) throw new Error("LLM_API_KEY belum diisi - cek .env");

const oracle = await oracleOnchain();
console.log(`Wallet juri    : ${oracleWallet.account.address}`);
console.log(`Oracle on-chain: ${oracle}`);
// Beda dari materi: berhenti, bukan sekadar memperingatkan. Kalau wallet juri bukan
// oracle terdaftar, SETIAP fulfillVerification pasti revert BukanOracle. Meneruskan
// berarti satu putaran polling membakar biaya LLM untuk seluruh antrean lalu gagal
// mengirim semuanya, dan tiap kegagalan menambah hitungan menyerah di bawah.
if (oracle.toLowerCase() !== oracleWallet.account.address.toLowerCase())
  throw new Error("wallet juri BUKAN oracle di factory, semua verdict akan revert BukanOracle");

const judged = new Set<string>();
// Kegagalan sesaat (RPC ngadat, LLM timeout) tidak boleh disamakan dengan bukti
// beracun. Item baru benar-benar dilepas setelah gagal tiga kali berturut-turut.
const gagal = new Map<string, number>();
const BATAS_GAGAL = 3;

console.log(`Juri AI jalan, polling tiap ${POLL_INTERVAL_MS / 1000} detik.`);
while (true) {
  try {
    // antrean langsung dari SQLite, tanpa lewat HTTP
    for (const item of getPending()) {
      // Berkunci tx_hash, bukan proof_uri seperti materi: setelah ditolak escrow
      // kembali ke Dibuka, jadi worker boleh memperbaiki isi berkas lalu submit lagi
      // dengan URL yang sama. Kunci berbasis URL membuat submission kedua itu
      // diabaikan permanen sampai proses juri direstart.
      const key = item.tx_hash;
      if (judged.has(key)) continue;

      // Beda dari materi: try/catch PER ITEM. Di materi, gagalnya satu item melompat
      // keluar dari for sebelum `judged.add`, sehingga item itu dicoba ulang tiap
      // polling selamanya dan semua submission di belakangnya (urutan block naik)
      // tidak pernah dinilai. Satu berkas bukti yang membuat balasan LLM tidak bisa
      // diurai cukup untuk membekukan juri sambil terus menagih biaya LLM.
      try {
        // getAddress ikut di dalam try: alamat cacat di satu baris basis data tidak
        // boleh melempar keluar dari perulangan dan membekukan seluruh antrean
        const escrow = getAddress(item.escrow);
        // basis data itu cache → cek ulang ke chain sebelum kirim tx
        const e = await readEscrow(escrow);
        if (e.status !== "Disubmit") {
          judged.add(key);
          continue;
        }

        console.log(`\n[${escrow}]\n  worker: ${e.worker}\n  proof : ${e.proofURI}`);

        const { eligible, alasan } = await judgeSubmission(e.rulesURI, e.proofURI, e.worker);
        console.log(`  verdict AI: ${eligible ? "ELIGIBLE" : "DITOLAK"} (${alasan})`);

        // Penandaan dilakukan SETELAH pengiriman berhasil, dan itu keputusan sadar.
        // Menandai sebelum kirim melindungi dari satu skenario (menunggu receipt
        // kehabisan waktu padahal transaksi sudah tersiar, lalu polling berikutnya
        // mengirim verdict kedua), tapi harganya jauh lebih mahal: gangguan RPC
        // sesaat ikut membuang bounty itu selamanya sehingga dananya terkunci di
        // escrow tanpa ada yang bisa memutuskan lagi. Skenario tx ganda sendiri sudah
        // dijinakkan dua lapis: pembacaan status di baris atas melewati escrow yang
        // sudah diputus, dan kontrak menolak verdict kedua karena statusnya bukan
        // Disubmit lagi, jadi kerugian terburuknya satu transaksi revert.
        const { hash, sukses } = await sendVerdict(escrow, eligible);
        console.log(`  tx: ${hash} (${sukses ? "sukses" : "GAGAL"})`);
        if (!sukses) throw new Error(`verdict revert on-chain, tx ${hash}`);
        judged.add(key);

        // Penulisan alasan dibungkus sendiri: gagalnya tulis (mis. SQLITE_BUSY karena
        // proses indexer sedang menulis) tidak boleh terlihat seperti gagalnya
        // putusan, dan harus berteriak karena pembayarannya sudah terjadi.
        try {
          insertVerdict.run({
            escrow: escrow.toLowerCase(),
            worker: e.worker.toLowerCase(),
            eligible: eligible ? 1 : 0,
            alasan,
            txHash: hash,
            ts: Date.now(),
          });
        } catch (e) {
          console.error(`PENTING: verdict ${hash} sudah on-chain tapi alasannya gagal disimpan: ${e}`);
        }
      } catch (e) {
        // Tidak langsung dilepas: gangguan sesaat pantas dicoba lagi, bukti beracun
        // tidak. Setelah BATAS_GAGAL kali berturut-turut barulah item ini ditandai
        // supaya tidak menyandera antrean di belakangnya.
        const n = (gagal.get(key) ?? 0) + 1;
        gagal.set(key, n);
        if (n >= BATAS_GAGAL) judged.add(key);
        const pesan = (e as { shortMessage?: string })?.shortMessage ?? e;
        console.error(`  gagal ${n}/${BATAS_GAGAL} (${key}): ${pesan}${n >= BATAS_GAGAL ? " - dilepas" : ""}`);
      }
    }
  } catch (e) {
    console.error(`Error loop (lanjut lagi): ${(e as { shortMessage?: string })?.shortMessage ?? e}`);
  }
  await Bun.sleep(POLL_INTERVAL_MS);
}
