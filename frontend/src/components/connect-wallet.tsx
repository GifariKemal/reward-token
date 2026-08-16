import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useQuery } from "@tanstack/react-query";
import { formatEther } from "viem";
import { useAccount } from "wagmi";
import { api } from "@/lib/api";

export function ConnectWallet() {
  const { address } = useAccount();
  const { data } = useQuery({
    queryKey: ["balance", address],
    queryFn: () => api.balance(address!),
    enabled: Boolean(address), // jangan jalan sebelum wallet tersambung
  });

  return (
    <div className="flex items-center gap-2">
      {data && (
        <span className="bg-muted rounded-lg px-3 py-1.5 text-sm font-bold">
          {Number(formatEther(BigInt(data.balance))).toLocaleString("id-ID")} RWD
        </span>
      )}
      <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false} />
    </div>
  );
}
