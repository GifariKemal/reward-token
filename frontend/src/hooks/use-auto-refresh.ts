import { useQueryClient } from "@tanstack/react-query";
import type { Address } from "viem";
import { useWatchContractEvent } from "wagmi";
import { bountyEscrowAbi, bountyFactoryAbi, CONTRACTS } from "@/lib/contracts";
import { CHAIN } from "@/lib/wagmi";

export function useAutoRefresh(escrows: Address[]) {
  const queryClient = useQueryClient();
  const segarkanPapan = () => queryClient.invalidateQueries({ queryKey: ["board"] });

  // chainId eksplisit di semua watcher. KOREKSI atas alasan yang sempat saya tulis di
  // sini: ini BUKAN penambal bug. Dugaan saya bahwa papan berhenti menyegarkan diri
  // saat wallet pindah jaringan terbantahkan, sebab wagmi menolak menyinkronkan
  // state-nya ke chain yang tidak terdaftar di `config.chains` (`createConfig`,
  // `if (!isChainConfigured) return`), dan daftar kita cuma berisi bscTestnet. Jadi
  // `useChainId()` selalu 97. Nilainya di sini jaring pengaman: begitu `chains` diisi
  // lebih dari satu, watcher ini tetap mendengarkan chain yang benar.
  // Beda dengan jalur TULIS di actions.ts, di situ chainId memang menambal lubang.
  // Bounty baru dibuat orang lain → papan bertambah
  useWatchContractEvent({
    address: CONTRACTS.bountyFactory,
    abi: bountyFactoryAbi,
    eventName: "BountyCreated",
    onLogs: segarkanPapan,
    chainId: CHAIN.id,
  });

  // Status escrow berubah. Satu watcher per event, alamatnya semua escrow yang tampil.
  const segarkanEscrow = (logs: { address: Address }[]) => {
    segarkanPapan();
    for (const log of logs) {
      queryClient.invalidateQueries({ queryKey: ["bounty", log.address] });
      queryClient.invalidateQueries({ queryKey: ["verdicts", log.address] });
    }
  };

  useWatchContractEvent({
    address: escrows,
    abi: bountyEscrowAbi,
    eventName: "WorkSubmitted",
    onLogs: segarkanEscrow,
    enabled: escrows.length > 0,
    chainId: CHAIN.id,
  });

  useWatchContractEvent({
    address: escrows,
    abi: bountyEscrowAbi,
    eventName: "RewardReleased",
    onLogs: (logs) => {
      segarkanEscrow(logs);
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
    },
    enabled: escrows.length > 0,
    chainId: CHAIN.id,
  });

  useWatchContractEvent({
    address: escrows,
    abi: bountyEscrowAbi,
    eventName: "WorkRejected",
    onLogs: segarkanEscrow,
    enabled: escrows.length > 0,
    chainId: CHAIN.id,
  });
}
