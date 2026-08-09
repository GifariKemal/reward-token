// services/relayer.ts = transaksi tulis yang ditandatangani dan dibayari backend
// Pola relayer: pengguna tidak perlu wallet sendiri, panitia yang bayar gas dan hadiah.

import { maxUint256, parseEther, parseEventLogs, type Address } from "viem";
import { CONTRACTS } from "../config";
import { bountyCreatedEvent, bountyEscrowAbi, bountyFactoryAbi, rewardTokenAbi } from "../contracts";
import { client } from "../lib/chain";
import { relayerWallet } from "../lib/wallet";

// ponytail: pengiriman transaksi tidak diserikan, jadi dua permintaan tulis yang
// bersamaan berlomba mengambil nonce pending yang sama di satu wallet dan salah
// satunya tergusur. Dibiarkan karena demo dijalankan berurutan. Kalau nanti frontend
// Sesi 7 bisa memicu dua permintaan sekaligus, naikkan ke rantai promise di tingkat
// modul, sekitar tiga baris, yang menyerikan semua writeContract di berkas ini.
const wallet = () => {
  if (!relayerWallet) throw new Error("RELAYER_PK belum diisi");
  return relayerWallet;
};

// gasPrice eksplisit = tx legacy (BSC testnet menolak EIP-1559)
const gasPrice = () => client.getGasPrice();

export const relayerAddress = () => relayerWallet?.account.address;

// factory menarik RWD lewat transferFrom → butuh approve dulu (sekali seumur wallet)
const ensureApproval = async (amount: bigint) => {
  const allowance = await client.readContract({
    address: CONTRACTS.rewardToken,
    abi: rewardTokenAbi,
    functionName: "allowance",
    args: [wallet().account.address, CONTRACTS.bountyFactory],
  });
  if (allowance >= amount) return;
  const hash = await wallet().writeContract({
    address: CONTRACTS.rewardToken,
    abi: rewardTokenAbi,
    functionName: "approve",
    args: [CONTRACTS.bountyFactory, maxUint256],
    gasPrice: await gasPrice(),
  });
  await client.waitForTransactionReceipt({ hash });
};

export const createBounty = async (reward: string, rulesURI: string, deadlineJam: number) => {
  const amount = parseEther(reward);
  await ensureApproval(amount);

  const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineJam * 3600);
  const hash = await wallet().writeContract({
    address: CONTRACTS.bountyFactory,
    abi: bountyFactoryAbi,
    functionName: "createBounty",
    args: [amount, rulesURI, deadline],
    gasPrice: await gasPrice(),
  });
  const receipt = await client.waitForTransactionReceipt({ hash });

  // escrow lahir di dalam tx → alamatnya hanya ada di event
  const [log] = parseEventLogs({ abi: [bountyCreatedEvent], logs: receipt.logs });
  // Beda dari materi: status receipt diperiksa. Tanpa ini, tx yang revert (allowance
  // terpakai proses lain, saldo RWD kurang, deadline kadaluwarsa) tetap dibalas
  // HTTP 201 dengan escrow undefined dan bountyId -1, jadi klien menyimpulkan bounty
  // berhasil dibuat. app.onError mengubah error ini jadi 500.
  if (receipt.status !== "success" || !log)
    throw new Error(`createBounty gagal, tx ${hash} status ${receipt.status}`);
  return { hash, escrow: log.args.escrow, bountyId: Number(log.args.bountyId) };
};

export const submitWork = async (escrow: Address, proofURI: string) => {
  const hash = await wallet().writeContract({
    address: escrow,
    abi: bountyEscrowAbi,
    functionName: "submitWork",
    args: [proofURI],
    gasPrice: await gasPrice(),
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  return { hash, sukses: receipt.status === "success" };
};
