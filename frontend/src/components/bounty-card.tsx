import { useState } from "react";
import { Bot, Clock, ExternalLink, Loader2, Send } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Address } from "viem";
import { useReadContract } from "wagmi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { pesanError, submitWork } from "@/lib/actions";
import { api, type Bounty } from "@/lib/api";
import { bountyEscrowAbi, EXPLORER, type Status } from "@/lib/contracts";
import { pendek, rwd } from "@/lib/format";
import { useHitungMundur } from "@/hooks/use-hitung-mundur";

const warnaStatus: Record<Status, string> = {
  MenungguDana: "bg-muted text-muted-foreground",
  Dibuka: "bg-emerald-100 text-emerald-800",
  Disubmit: "bg-amber-100 text-amber-800",
  Selesai: "bg-blue-100 text-blue-800",
  Dibatalkan: "bg-red-100 text-red-800",
};

export function BountyCard({ bounty, account }: { bounty: Bounty; account?: Address }) {
  const [proof, setProof] = useState("");
  const queryClient = useQueryClient();

  // Status live dari chain — tabel indexer bisa tertinggal beberapa detik
  const { data: detail } = useQuery({
    queryKey: ["bounty", bounty.escrow],
    queryFn: () => api.bounty(bounty.escrow),
  });
  const { data: verdictData } = useQuery({
    queryKey: ["verdicts", bounty.escrow],
    queryFn: () => api.verdicts(bounty.escrow),
  });

  // Deadline tidak ada di API backend — baca langsung dari kontrak escrow
  const { data: deadline } = useReadContract({
    address: bounty.escrow,
    abi: bountyEscrowAbi,
    functionName: "submissionDeadline",
  });
  const mundur = useHitungMundur(deadline);

  const kirim = useMutation({
    mutationFn: () => submitWork(bounty.escrow, proof.trim()),
    onSuccess: () => {
      setProof("");
      // Status berubah di chain → papan dan detail bounty ini wajib diambil ulang
      queryClient.invalidateQueries({ queryKey: ["board"] });
      queryClient.invalidateQueries({ queryKey: ["bounty", bounty.escrow] });
    },
  });

  const status = detail?.status;
  const verdicts = verdictData?.verdicts ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span>Bounty #{bounty.bounty_id}</span>
          <span className="flex items-center gap-2">
            <span className="text-base">{rwd(bounty.reward_amount)}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-normal ${status ? warnaStatus[status] : "bg-muted"}`}
            >
              {status ?? "…"}
            </span>
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3 text-sm">
        <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
          <span>Pembuat {pendek(bounty.creator)}</span>
          <a
            className="inline-flex items-center gap-1 hover:underline"
            href={`${EXPLORER}/address/${bounty.escrow}`}
            rel="noreferrer"
            target="_blank"
          >
            Escrow {pendek(bounty.escrow)} <ExternalLink className="h-3 w-3" />
          </a>
          {mundur && (
            <span className={`inline-flex items-center gap-1 ${mundur.lewat ? "text-destructive" : ""}`}>
              <Clock className="h-3 w-3" /> {mundur.teks}
            </span>
          )}
        </div>

        {detail?.rulesURI && (
          <a
            className="text-primary inline-flex items-center gap-1 break-all hover:underline"
            href={detail.rulesURI}
            rel="noreferrer"
            target="_blank"
          >
            Aturan bounty <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        )}

        {/* Alasan juri AI cuma ada di backend — chain simpan true/false doang */}
        {verdicts.map((v) => (
          <div key={v.id} className="bg-muted/40 rounded-lg border p-3">
            <p className="flex items-center gap-1.5 font-medium">
              <Bot className="h-4 w-4" />
              Juri AI: {v.eligible ? "DITERIMA" : "DITOLAK"}
            </p>
            <p className="text-muted-foreground mt-1">{v.alasan}</p>
          </div>
        ))}

        {/* Cuma bounty yang masih Dibuka yang menerima submission */}
        {status === "Dibuka" &&
          (account ? (
            <div className="flex gap-2 pt-1">
              <Input
                disabled={kirim.isPending}
                placeholder="URL bukti kerjaan (raw.githubusercontent.com/…)"
                value={proof}
                onChange={(e) => setProof(e.target.value)}
              />
              <Button disabled={!proof.trim() || kirim.isPending || mundur?.lewat} onClick={() => kirim.mutate()}>
                {kirim.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Kirim
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground">Sambungkan wallet untuk mengirim bukti kerjaan.</p>
          ))}

        {status === "Dibuka" && mundur?.lewat && (
          <p className="text-destructive">Deadline sudah lewat — submission ditolak kontrak.</p>
        )}

        {kirim.error && <p className="text-destructive">{pesanError(kirim.error)}</p>}
      </CardContent>
    </Card>
  );
}
