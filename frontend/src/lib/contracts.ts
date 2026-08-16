// contracts.ts = alamat deployment workshop + ABI yang dipanggil frontend.

import { parseAbi } from "viem";

export const EXPLORER = "https://testnet.bscscan.com";

// Deployment kita sendiri (bukan punya mentor), sama persis dengan backend/src/config.ts.
// Ambil dari broadcast/run-latest.json, jangan ketik manual.
export const CONTRACTS = {
  rewardToken: "0x07238d9a680488e267477139643088af34abd890",
  bountyFactory: "0xd5e8f3480448d165cbbcbde1036303855b883d09",
} as const;

// Enum Status di BountyEscrow.sol — urutan harus sama persis
export const statusLabel = ["MenungguDana", "Dibuka", "Disubmit", "Selesai", "Dibatalkan"] as const;

export type Status = (typeof statusLabel)[number];

export const bountyFactoryAbi = parseAbi([
  "function totalBounties() view returns (uint256)",
  // registri escrow milik factory, satu-satunya sumber yang tidak bisa dipalsukan
  "function bounties(uint256) view returns (address)",
  "function oracle() view returns (address)",
  "function createBounty(uint256 rewardAmount, string rulesURI, uint256 submissionDeadline) returns (address)",
  "event BountyCreated(uint256 indexed bountyId, address indexed escrow, address indexed creator, uint256 rewardAmount)",
]);

export const bountyEscrowAbi = parseAbi([
  "function status() view returns (uint8)",
  "function submissionDeadline() view returns (uint256)",
  "function submitWork(string proofURI)",
  "event WorkSubmitted(address indexed worker, string proofURI)",
  "event RewardReleased(address indexed worker, uint256 rewardAmount)",
  "event WorkRejected(address indexed worker)",
]);

export const rewardTokenAbi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);
