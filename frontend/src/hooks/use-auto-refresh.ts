import { useQueryClient } from "@tanstack/react-query";
import type { Address } from "viem";
import { useWatchContractEvent } from "wagmi";
import { bountyEscrowAbi, bountyFactoryAbi, CONTRACTS } from "@/lib/contracts";

export function useAutoRefresh(escrows: Address[]) {
  const queryClient = useQueryClient();
  const segarkanPapan = () => queryClient.invalidateQueries({ queryKey: ["board"] });

  // Bounty baru dibuat orang lain → papan bertambah
  useWatchContractEvent({
    address: CONTRACTS.bountyFactory,
    abi: bountyFactoryAbi,
    eventName: "BountyCreated",
    onLogs: segarkanPapan,
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
  });

  useWatchContractEvent({
    address: escrows,
    abi: bountyEscrowAbi,
    eventName: "WorkRejected",
    onLogs: segarkanEscrow,
    enabled: escrows.length > 0,
  });
}
