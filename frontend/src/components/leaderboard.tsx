import { Trophy } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { pendek, rwd } from "@/lib/format";

export function Leaderboard() {
  const { data, error, isPending } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: api.leaderboard,
  });
  const rows = data?.leaderboard ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-4 w-4" />
          Peringkat Worker
        </CardTitle>
      </CardHeader>

      <CardContent>
        {isPending && <Skeleton className="h-24 w-full" />}
        {error && <p className="text-destructive text-sm">{error.message}</p>}
        {!isPending && !error && rows.length === 0 && (
          <p className="text-muted-foreground py-6 text-center text-sm">Belum ada yang menang. Jadilah yang pertama.</p>
        )}

        <ol className="space-y-2">
          {rows.map((r, i) => (
            <li key={r.worker} className="bg-muted flex items-center justify-between rounded-lg px-3 py-2 text-sm">
              <span className="flex items-center gap-3">
                <span className="w-5 text-center font-bold">{i + 1}</span>
                <span className="font-mono">{pendek(r.worker)}</span>
              </span>
              <span className="text-muted-foreground">
                {r.wins}× menang · <span className="text-foreground font-bold">{rwd(r.total_reward)}</span>
              </span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
