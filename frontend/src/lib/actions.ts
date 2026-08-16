import { parseEther, parseEventLogs, type Address } from "viem";
import { getGasPrice, readContract, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { bountyEscrowAbi, bountyFactoryAbi, CONTRACTS, rewardTokenAbi } from "./contracts";
import { CHAIN, config } from "./wagmi";

// BSC testnet menolak EIP-1559 → gasPrice eksplisit bikin transaksi jadi legacy
const gasPrice = () => getGasPrice(config, { chainId: CHAIN.id });

// Beda dari materi (bagian Tambahan 4 dipakai sejak awal): chainId disebut eksplisit di
// setiap panggilan. Tanpa itu wagmi menandatangani ke chain apa pun yang sedang aktif di
// wallet, dan alamat kontrak yang sama bisa berisi kontrak lain di chain lain — artinya
// hadiah dikirim ke alamat asing tanpa pesan salah apa pun. Dengan chainId, wagmi
// menolak sebelum tanda tangan.
const CHAIN_ID = { chainId: CHAIN.id } as const;

// Factory menarik RWD dari dompet pembuat saat createBounty → butuh izin sekali di awal
const ensureApproval = async (account: Address, amount: bigint) => {
  const allowance = await readContract(config, {
    address: CONTRACTS.rewardToken,
    abi: rewardTokenAbi,
    functionName: "allowance",
    args: [account, CONTRACTS.bountyFactory],
    ...CHAIN_ID,
  });
  if (allowance >= amount) return;

  const hash = await writeContract(config, {
    address: CONTRACTS.rewardToken,
    abi: rewardTokenAbi,
    functionName: "approve",
    // Pas sejumlah hadiah, bukan maxUint256 (Tambahan 4 di materi). Kalau factory kena
    // bug atau diganti jahat, yang bisa diambil cuma sebesar hadiah bounty ini.
    // Konsekuensinya tiap bikin bounty selalu dua tanda tangan, bukan sekali seumur wallet.
    args: [CONTRACTS.bountyFactory, amount],
    gasPrice: await gasPrice(),
    ...CHAIN_ID,
  });
  await waitForTransactionReceipt(config, { hash, ...CHAIN_ID });
};

// Bikin bounty: approve (bila perlu) → createBounty → alamat escrow diambil dari event
export const createBounty = async (account: Address, reward: string, rulesURI: string, deadlineJam: number) => {
  const amount = parseEther(reward); // RWD 18 desimal: "10" → 10e18
  await ensureApproval(account, amount);

  const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineJam * 3600);
  const hash = await writeContract(config, {
    address: CONTRACTS.bountyFactory,
    abi: bountyFactoryAbi,
    functionName: "createBounty",
    args: [amount, rulesURI, deadline],
    gasPrice: await gasPrice(),
    ...CHAIN_ID,
  });

  // Alamat escrow tidak ada di return value tx — satu-satunya sumber adalah event
  const receipt = await waitForTransactionReceipt(config, { hash, ...CHAIN_ID });
  const [log] = parseEventLogs({
    abi: bountyFactoryAbi,
    eventName: "BountyCreated",
    logs: receipt.logs,
  });
  return { hash, escrow: log?.args.escrow };
};

// Kirim bukti kerjaan ke satu bounty
export const submitWork = async (escrow: Address, proofURI: string) => {
  const hash = await writeContract(config, {
    address: escrow,
    abi: bountyEscrowAbi,
    functionName: "submitWork",
    args: [proofURI],
    gasPrice: await gasPrice(),
    ...CHAIN_ID,
  });
  await waitForTransactionReceipt(config, { hash, ...CHAIN_ID });
  return { hash };
};

// Pesan revert viem panjang sekali — ambil baris pertama yang berguna buat peserta
export const pesanError = (e: unknown) => {
  const msg = e instanceof Error ? (("shortMessage" in e && e.shortMessage) as string) || e.message : String(e);
  if (/User rejected|denied/i.test(msg)) return "Transaksi dibatalkan di wallet.";
  return msg.split("\n")[0];
};
