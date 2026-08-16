import { useState } from "react";
import { Loader2, PlusCircle } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Address } from "viem";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TransactionDialog } from "@/components/ui/dialog-transaction";
import { createBounty, pesanError } from "@/lib/actions";

export function CreateBounty({ account }: { account?: Address }) {
  const [reward, setReward] = useState("10");
  const [rulesURI, setRulesURI] = useState("");
  const [deadlineJam, setDeadlineJam] = useState("48");
  const queryClient = useQueryClient();

  const bikin = useMutation({
    // Bisa dua tanda tangan: approve dulu (kalau izinnya belum ada), baru createBounty
    mutationFn: () => createBounty(account!, reward, rulesURI.trim(), Number(deadlineJam)),
    onSuccess: () => {
      setRulesURI("");
      // Papan & saldo berubah setelah tx → suruh ambil ulang
      queryClient.invalidateQueries({ queryKey: ["board"] });
      queryClient.invalidateQueries({ queryKey: ["balance", account] });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PlusCircle className="h-4 w-4" />
          Bikin Bounty
        </CardTitle>
        <CardDescription>
          Hadiah RWD dikunci di escrow sampai juri AI memutuskan. Butuh RWD di wallet-mu.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground">Hadiah (RWD)</span>
          <Input type="number" value={reward} onChange={(e) => setReward(e.target.value)} />
        </label>

        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground">URL aturan bounty</span>
          <Input
            placeholder="https://raw.githubusercontent.com/…/DEMO-RULES.md"
            value={rulesURI}
            onChange={(e) => setRulesURI(e.target.value)}
          />
        </label>

        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground">Deadline (jam dari sekarang)</span>
          <Input type="number" value={deadlineJam} onChange={(e) => setDeadlineJam(e.target.value)} />
        </label>

        <Button
          className="w-full"
          disabled={!account || !rulesURI.trim() || !Number(reward) || bikin.isPending}
          onClick={() => bikin.mutate()}
        >
          {bikin.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          {bikin.isPending ? "Menunggu tanda tangan…" : account ? "Bikin Bounty" : "Sambungkan wallet dulu"}
        </Button>

        {bikin.error && <p className="text-destructive text-sm">{pesanError(bikin.error)}</p>}
      </CardContent>

      <TransactionDialog
        description="Bounty-mu sudah dibuat. Indexer butuh beberapa detik untuk menampilkannya di papan."
        hash={bikin.data?.hash ?? ""}
        open={Boolean(bikin.data?.hash)}
        title="Bounty dibuat!"
        onOpenChange={() => bikin.reset()}
      />
    </Card>
  );
}
