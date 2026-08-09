// indexer/watch.ts = pantau event baru real-time (watchEvent)

import type { Address } from "viem";
import { CONTRACTS } from "../config";
import { bountyCreatedEvent, escrowEvents } from "../contracts";
import { client } from "../lib/chain";
import { knownEscrows } from "../lib/db";
import { handleBountyCreated, handleEscrowLog } from "./handlers";

export const watch = () => {
  const onError = (err: Error) => console.error("⚠️ watch error:", err.message);

  const watchEscrow = (address: Address, fromBlock?: bigint) =>
    client.watchEvent({ address, events: escrowEvents, strict: true, fromBlock, onLogs: (logs) => logs.forEach(handleEscrowLog), onError });

  const escrows = knownEscrows();
  escrows.forEach((e) => watchEscrow(e));

  // Escrow baru dari factory langsung ikut dipantau.
  //
  // Beda dari materi: `fromBlock` diisi block kelahiran escrow. Tanpa itu ada balapan
  // yang bukan teori - terbukti 9 Agustus 2026. Watcher escrow baru hanya bisa mulai
  // SETELAH log BountyCreated sampai ke sini, dan penyampaiannya menunggu satu putaran
  // polling. Kalau worker submit dalam sela itu (alur paling wajar: bikin bounty lalu
  // langsung submit), event WorkSubmitted-nya tidak pernah tertangkap, submission tidak
  // masuk antrean, dan juri AI tidak pernah menilainya sampai proses direstart supaya
  // backfill menyusul. `fromBlock` membuat watcher memutar ulang dari block itu, jadi
  // selanya tertutup. Insert idempoten, jadi pemutaran ulang aman.
  client.watchEvent({
    address: CONTRACTS.bountyFactory,
    event: bountyCreatedEvent,
    strict: true,
    onLogs: (logs) =>
      logs.forEach((log) => {
        handleBountyCreated(log);
        watchEscrow(log.args.escrow, log.blockNumber);
      }),
    onError,
  });

  console.log("👀 watchEvent jalan: factory + %d escrow", escrows.length);
};
