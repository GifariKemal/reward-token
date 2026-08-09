// services/bounty.ts = business logic: baca state chain + gabungan data on/off chain

import type { Address } from "viem";
import { CONTRACTS } from "../config";
import { bountyEscrowAbi, bountyFactoryAbi, rewardTokenAbi, statusLabel } from "../contracts";
import { client } from "../lib/chain";
import { getBoard } from "../lib/db";

// readContract = membaca function view di kontrak (gratis, tanpa gas)

// Detail escrow live dari chain - 6 view dalam SATU request via multicall
export const readEscrow = async (escrow: Address) => {
  const contract = { address: escrow, abi: bountyEscrowAbi } as const;
  const [status, creator, rewardAmount, rulesURI, worker, proofURI] = await client.multicall({
    contracts: [
      { ...contract, functionName: "status" },
      { ...contract, functionName: "creator" },
      { ...contract, functionName: "rewardAmount" },
      { ...contract, functionName: "rulesURI" },
      { ...contract, functionName: "worker" },
      { ...contract, functionName: "proofURI" },
    ],
    allowFailure: false,
  });
  return { status: statusLabel[status], creator, rewardAmount: rewardAmount.toString(), rulesURI, worker, proofURI };
};

// Gabungan: total live dari chain + data historis hasil indexing
export const board = async () => ({
  total: Number(await client.readContract({
    address: CONTRACTS.bountyFactory, abi: bountyFactoryAbi, functionName: "totalBounties",
  })),
  ...getBoard(),
});

// Penjaga sebelum relayer menandatangani apa pun ke alamat yang datang dari luar.
// Dua alasan, keduanya dari temuan uji Sesi 6:
// (1) alamat tanpa bytecode menerima calldata apa pun tanpa revert, jadi satu alamat
//     salah tempel membuat POST submit membalas {"sukses": true} untuk transaksi yang
//     tidak melakukan apa-apa;
// (2) memastikan ada bytecode saja tidak cukup, karena kontrak mana pun yang punya
//     fungsi submitWork(string) tetap lolos. Kontrak jahat bisa membakar gas relayer
//     tanpa revert, dan escrow sah milik orang lain bisa direbut worker-nya.
// Karena itu yang ditanya ke rantai adalah asal-usulnya: escrow sah selalu menyimpan
// alamat factory pembuatnya di `factory` immutable. Ini otoritatif dan tidak balapan
// dengan indexer, berbeda dari mencocokkan ke daftar escrow di basis data yang baru
// terisi beberapa detik setelah bounty dibuat.
export const escrowSah = async (addr: Address) => {
  try {
    const factory = await client.readContract({ address: addr, abi: bountyEscrowAbi, functionName: "factory" });
    return factory.toLowerCase() === CONTRACTS.bountyFactory.toLowerCase();
  } catch {
    return false; // tanpa bytecode, atau punya bytecode tapi bukan escrow
  }
};

// Saldo RWD sebuah wallet
export const balanceOf = (addr: Address) =>
  client.readContract({ address: CONTRACTS.rewardToken, abi: rewardTokenAbi, functionName: "balanceOf", args: [addr] });
