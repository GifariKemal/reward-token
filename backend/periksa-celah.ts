// periksa-celah.ts = bukti bahwa rentang block yang belum di-backfill memang kosong.
//
// Dipakai sekali di Sesi 7: checkpoint indexer tertinggal 1,3 juta block sejak Sesi 6,
// dan backfill berurutan butuh berjam-jam. Alih-alih percaya "kayaknya tidak ada apa-apa",
// keadaan on-chain SEKARANG dibandingkan dengan isi basis data. Kalau keduanya sama,
// tidak ada event yang terlewat, karena setiap event mengubah keadaan.
//
// Jalankan: bun periksa-celah.ts

import { getAddress } from "viem";
import { CONTRACTS } from "./src/config";
import { bountyEscrowAbi, bountyFactoryAbi, statusLabel } from "./src/contracts";
import { client } from "./src/lib/chain";
import { db } from "./src/lib/db";

const total = Number(
  await client.readContract({
    address: CONTRACTS.bountyFactory,
    abi: bountyFactoryAbi,
    functionName: "totalBounties",
  }),
);

const barisBounty = db.prepare("SELECT bounty_id, escrow FROM bounties ORDER BY bounty_id").all() as {
  bounty_id: number;
  escrow: string;
}[];

let bermasalah = 0;
const lapor = (pesan: string) => {
  console.error(`❌ ${pesan}`);
  bermasalah++;
};

console.log(`totalBounties on-chain = ${total}, baris di basis data = ${barisBounty.length}`);
if (total !== barisBounty.length) lapor("jumlah bounty beda: ada BountyCreated yang belum terindeks");

for (let i = 0; i < total; i++) {
  const escrow = await client.readContract({
    address: CONTRACTS.bountyFactory,
    abi: bountyFactoryAbi,
    functionName: "bounties",
    args: [BigInt(i)],
  });
  const baris = barisBounty.find((b) => b.bounty_id === i);
  if (!baris) {
    lapor(`bounty #${i} (${escrow}) tidak ada di basis data`);
    continue;
  }
  if (getAddress(baris.escrow) !== getAddress(escrow)) lapor(`bounty #${i}: alamat escrow beda`);

  const kontrak = { address: escrow, abi: bountyEscrowAbi } as const;
  const [status, worker, proofURI] = await client.multicall({
    contracts: [
      { ...kontrak, functionName: "status" },
      { ...kontrak, functionName: "worker" },
      { ...kontrak, functionName: "proofURI" },
    ],
    allowFailure: false,
  });

  const subs = db
    .prepare("SELECT worker, proof_uri, status FROM submissions WHERE lower(escrow) = ? ORDER BY id")
    .all(escrow.toLowerCase()) as { worker: string; proof_uri: string; status: string }[];

  const label = statusLabel[status];
  const adaWorker = worker !== "0x0000000000000000000000000000000000000000";

  // Escrow yang punya worker aktif WAJIB punya baris submission yang cocok.
  if (adaWorker) {
    const cocok = subs.some((s) => getAddress(s.worker) === getAddress(worker) && s.proof_uri === proofURI);
    if (!cocok) lapor(`bounty #${i}: on-chain worker ${worker} proof ${proofURI} tidak ada di submissions`);
  }
  // Escrow yang sudah Selesai WAJIB punya baris rewarded.
  if (label === "Selesai" && !subs.some((s) => s.status === "rewarded"))
    lapor(`bounty #${i}: status Selesai tapi tidak ada submission rewarded`);

  console.log(
    `#${i} ${escrow} status=${label} worker=${adaWorker ? worker : "-"} submissions=${subs.length}` +
      ` [${subs.map((s) => s.status).join(",")}]`,
  );
}

console.log(
  bermasalah === 0
    ? "✅ keadaan on-chain cocok dengan basis data: tidak ada event yang terlewat di celah backfill"
    : `❌ ${bermasalah} ketidakcocokan - backfill penuh WAJIB dijalankan`,
);
process.exit(bermasalah === 0 ? 0 : 1);
