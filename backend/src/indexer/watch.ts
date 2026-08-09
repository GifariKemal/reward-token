// indexer/watch.ts = pantau event baru real-time (watchEvent)

import type { Address } from "viem";
import { CONTRACTS } from "../config";
import { bountyCreatedEvent, escrowEvents } from "../contracts";
import { client } from "../lib/chain";
import { knownEscrows } from "../lib/db";
import { getEscrowLogs, handleBountyCreated, handleEscrowLog } from "./handlers";

export const watch = () => {
  const onError = (err: Error) => console.error("⚠️ watch error:", err.message);

  const watchEscrow = (address: Address) =>
    client.watchEvent({ address, events: escrowEvents, strict: true, onLogs: (logs) => logs.forEach(handleEscrowLog), onError });

  // Susulan sekali jalan untuk satu escrow, dari block kelahirannya sampai sekarang.
  // Insert idempoten, jadi tumpang tindih dengan watcher aman.
  const susulEscrow = async (address: Address, sejak: bigint) => {
    const log = await getEscrowLogs([address], sejak, await client.getBlockNumber());
    log.forEach(handleEscrowLog);
  };

  const escrows = knownEscrows();
  escrows.forEach((e) => watchEscrow(e));

  // Escrow baru dari factory langsung ikut dipantau, plus disusulkan sekali.
  //
  // Beda dari materi: ada balapan yang bukan teori, terbukti 9 Agustus 2026. Watcher
  // escrow baru hanya bisa mulai SETELAH log BountyCreated sampai ke sini, dan
  // penyampaiannya menunggu satu putaran polling. Kalau worker submit dalam sela itu
  // (alur paling wajar: bikin bounty lalu langsung submit), event WorkSubmitted-nya
  // tidak pernah tertangkap, submission tidak masuk antrean, dan juri AI tidak pernah
  // menilainya sampai proses direstart supaya backfill menyusul.
  //
  // Sempat ditambal dengan `fromBlock` pada watchEvent, dan itu TIDAK bisa diandalkan:
  // viem hanya menghormati `fromBlock` di jalur cadangan getLogs, yaitu ketika RPC
  // menolak eth_newFilter. Dari empat RPC di config, dua menerima filter (fromBlock
  // diabaikan) dan dua menolaknya (fromBlock dihormati), sementara yang aktif dipilih
  // peringkat kesehatan saat jalan. Jadi tambalan itu kadang bekerja kadang tidak,
  // tanpa cara membedakannya dari log. Susulan eksplisit di bawah deterministik.
  client.watchEvent({
    address: CONTRACTS.bountyFactory,
    event: bountyCreatedEvent,
    strict: true,
    onLogs: (logs) =>
      logs.forEach((log) => {
        handleBountyCreated(log);
        watchEscrow(log.args.escrow);
        susulEscrow(log.args.escrow, log.blockNumber).catch((e) =>
          console.error("⚠️ susulan escrow baru gagal:", e?.shortMessage ?? e),
        );
      }),
    onError,
  });

  console.log("👀 watchEvent jalan: factory + %d escrow", escrows.length);
};
