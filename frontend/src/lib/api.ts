import type { Address } from "viem";
import type { Status } from "./contracts";

const BASE = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

const get = async <T>(path: string): Promise<T> => {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`Backend balas ${res.status} untuk ${path}`);
  return res.json() as Promise<T>;
};

export type Bounty = {
  bounty_id: number;
  escrow: Address;
  creator: Address;
  reward_amount: string; // wei, string karena BigInt tidak muat di JSON
  tx_hash: string;
  block_number: number;
  created_at: number;
};

export type Submission = {
  id: number;
  escrow: Address;
  worker: Address;
  proof_uri: string;
  status: "submitted" | "rewarded" | "rejected";
  reward_amount: string | null;
  tx_hash: string;
  block_number: number;
  created_at: number;
};

export type Verdict = {
  id: number;
  escrow: string;
  worker: string;
  eligible: 0 | 1;
  alasan: string;
  tx_hash: string | null;
  created_at: number;
};

export type EscrowDetail = {
  status: Status;
  creator: Address;
  rewardAmount: string;
  rulesURI: string;
  worker: Address;
  proofURI: string;
};

export const api = {
  board: () => get<{ total: number; bounties: Bounty[] }>("/board"),
  bounty: (escrow: string) => get<EscrowDetail>(`/bounty/${escrow}`),
  leaderboard: () => get<{ leaderboard: { worker: Address; wins: number; total_reward: string }[] }>("/leaderboard"),
  verdicts: (escrow: string) => get<{ verdicts: Verdict[] }>(`/verdicts/${escrow}`),
  balance: (address: string) => get<{ balance: string }>(`/balance/${address}`),
  wallet: (address: string) => get<{ bounties: Bounty[]; submissions: Submission[] }>(`/wallet/${address}`),
};
