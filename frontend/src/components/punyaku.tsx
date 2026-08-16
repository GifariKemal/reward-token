import { ExternalLink, Inbox } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { EXPLORER } from "@/lib/contracts";
import { pendek, rwd, tautanAman, waktu } from "@/lib/format";

const labelStatus = {
  submitted: "Menunggu juri",
  rewarded: "Menang",
  rejected: "Ditolak",
} as const;

export function Punyaku({ account }: { account?: Address }) {
  const { data, error, isPending } = useQuery({
    queryKey: ["wallet", account],
    queryFn: () => api.wallet(account!),
    enabled: Boolean(account),
  });

  if (!account)
    return (
      <Card>
        <CardContent className="text-muted-foreground py-8 text-center text-sm">
          Sambungkan wallet untuk melihat aktivitasmu.
        </CardContent>
      </Card>
    );

  if (isPending) return <Skeleton className="h-40 w-full" />;
  if (error) return <p className="text-destructive text-sm">{error.message}</p>;

  const { bounties = [], submissions = [] } = data ?? {};

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Inbox className="h-4 w-4" />
            Bounty yang kamu buat
            <span className="text-muted-foreground ml-auto text-sm font-normal">{bounties.length}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {bounties.length === 0 && (
            <p className="text-muted-foreground py-4 text-center">Belum ada. Bikin satu di tab sebelah.</p>
          )}
          {bounties.map((b) => (
            <div key={b.escrow} className="bg-muted flex items-center justify-between rounded-lg px-3 py-2">
              <span>
                Bounty #{b.bounty_id} · <span className="font-bold">{rwd(b.reward_amount)}</span>
              </span>
              <a
                className="text-muted-foreground inline-flex items-center gap-1 font-mono text-xs hover:underline"
                href={`${EXPLORER}/address/${b.escrow}`}
                rel="noreferrer"
                target="_blank"
              >
                {pendek(b.escrow)} <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Bukti kerjaan yang kamu kirim
            <span className="text-muted-foreground ml-auto text-sm font-normal">{submissions.length}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {submissions.length === 0 && <p className="text-muted-foreground py-4 text-center">Belum ada submission.</p>}
          {submissions.map((s) => (
            <div key={s.tx_hash} className="bg-muted space-y-1 rounded-lg px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="font-medium">{labelStatus[s.status] ?? s.status}</span>
                <span className="text-muted-foreground text-xs">{waktu(s.created_at)}</span>
              </div>
              {/* proof_uri ditulis worker ke kontrak, jadi skemanya disaring dulu */}
              {tautanAman(s.proof_uri) ? (
                <a
                  className="text-primary block truncate text-xs hover:underline"
                  href={tautanAman(s.proof_uri)}
                  rel="noreferrer"
                  target="_blank"
                >
                  {s.proof_uri}
                </a>
              ) : (
                <p className="text-muted-foreground truncate text-xs">{s.proof_uri}</p>
              )}
              {s.reward_amount && <p className="text-xs font-bold">Hadiah {rwd(s.reward_amount)}</p>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
