// config.ts = satu tempat untuk semua konfigurasi & konstanta

// RPC publik bisa mati kapan saja → daftar fallback, .env dicoba pertama
export const RPC_URLS = [
  process.env.RPC_URL,
  "https://bsc-testnet.drpc.org",
  "https://97.rpc.thirdweb.com",
  "https://bsc-testnet-rpc.publicnode.com",
  "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
].filter(Boolean) as string[];

// Alamat deployment workshop - salin dari broadcast/run-latest.json, jangan ketik manual
export const CONTRACTS = {
  rewardToken: "0x07238d9a680488e267477139643088af34abd890",
  bountyFactory: "0xd5e8f3480448d165cbbcbde1036303855b883d09",
} as const;

export const DEPLOY_BLOCK = 121410684n; // block deploy factory, titik awal scan
export const CHUNK = 999n; // muat di semua RPC gratis (thirdweb: maks 1000 block per getLogs)
export const PORT = Number(process.env.PORT ?? 3000);
