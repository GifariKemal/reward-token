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
// Yang ditanya adalah REGISTRI FACTORY, bukan escrow-nya sendiri. Sempat saya tulis
// dengan membaca `factory()` di alamat itu lalu mencocokkannya, dan itu tidak
// otoritatif: yang ditanya justru tersangkanya, jadi kontrak jahat tinggal
// mengembalikan alamat factory kita dan lolos. Registri factory tidak bisa dipalsukan
// siapa pun. Tidak balapan dengan indexer juga, karena dibaca dari chain.
//
// ponytail: satu multicall berisi N pembacaan, jadi tetap satu permintaan RPC berapa
// pun jumlah bounty-nya, cuma calldata-nya tumbuh. Kalau jumlah bounty pernah mencapai
// ribuan, simpan hasilnya di memori dan segarkan saat totalBounties bertambah.
export const escrowSah = async (addr: Address) => {
  try {
    const total = await client.readContract({
      address: CONTRACTS.bountyFactory,
      abi: bountyFactoryAbi,
      functionName: "totalBounties",
    });
    if (total === 0n) return false;
    const daftar = await client.multicall({
      contracts: Array.from({ length: Number(total) }, (_, i) => ({
        address: CONTRACTS.bountyFactory,
        abi: bountyFactoryAbi,
        functionName: "bounties" as const,
        args: [BigInt(i)] as const,
      })),
      allowFailure: false,
    });
    return daftar.some((e) => e.toLowerCase() === addr.toLowerCase());
  } catch {
    return false;
  }
};

// Saldo RWD sebuah wallet
export const balanceOf = (addr: Address) =>
  client.readContract({ address: CONTRACTS.rewardToken, abi: rewardTokenAbi, functionName: "balanceOf", args: [addr] });
