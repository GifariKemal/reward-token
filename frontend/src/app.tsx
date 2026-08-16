import { RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BountyCard } from "@/components/bounty-card";
import { ConnectWallet } from "@/components/connect-wallet";
import { CreateBounty } from "@/components/create-bounty";
import { Leaderboard } from "@/components/leaderboard";
import { Punyaku } from "@/components/punyaku";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { api } from "@/lib/api";

export function App() {
  const { address } = useAccount();
  const { data, error, isPending, isFetching, refetch } = useQuery({
    queryKey: ["board"],
    queryFn: api.board,
  });
  const bounties = data?.bounties ?? [];

  // Dengarkan event chain → papan menyegarkan dirinya sendiri
  useAutoRefresh(bounties.map((b) => b.escrow));

  return (
    <div className="bg-background bg-grid min-h-screen">
      <header className="bg-background/80 sticky top-0 z-50 border-b backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <h1 className="font-bold">Papan Sayembara</h1>
          <ConnectWallet />
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-4 px-4 py-6">
        <Tabs defaultValue="papan">
          <TabsList>
            <TabsTrigger value="papan">Papan</TabsTrigger>
            <TabsTrigger value="bikin">Bikin Bounty</TabsTrigger>
            <TabsTrigger value="peringkat">Peringkat</TabsTrigger>
            <TabsTrigger value="punyaku">Punyaku</TabsTrigger>
          </TabsList>

          <TabsContent className="space-y-3" value="papan">
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-sm">
                {data ? `${data.total} bounty on-chain, ${bounties.length} terindeks` : "Memuat…"}
              </p>
              <Button disabled={isFetching} size="sm" variant="outline" onClick={() => refetch()}>
                <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
                Muat ulang
              </Button>
            </div>

            {isPending && <Skeleton className="h-32 w-full" />}
            {error && (
              <p className="text-destructive text-sm">
                {error.message} — pastikan backend jalan (<code>bun dev</code> di folder backend).
              </p>
            )}

            {bounties.map((b) => (
              <BountyCard key={b.escrow} account={address} bounty={b} />
            ))}
          </TabsContent>

          <TabsContent value="bikin">
            <CreateBounty account={address} />
          </TabsContent>

          <TabsContent value="peringkat">
            <Leaderboard />
          </TabsContent>

          <TabsContent value="punyaku">
            <Punyaku account={address} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
