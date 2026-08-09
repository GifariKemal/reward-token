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
// Lebar jendela getLogs. Default 999 supaya muat di semua RPC gratis (thirdweb
// menolak lebih dari 1000 block). Bisa dinaikkan lewat env kalau RPC yang dipakai
// mengizinkan lebih lebar, mis. CHUNK=9000 untuk drpc (batas 10000 di paket gratis).
export const CHUNK = BigInt(process.env.CHUNK ?? 999);
export const PORT = Number(process.env.PORT ?? 3000);

// Dua wallet, dua peran. Kosong = fitur terkait mati, sisanya tetap hidup.
// Di deployment ini keduanya diisi private key yang sama (satu EOA sekaligus
// pemilik token, pemilik factory, dan oracle) - praktis untuk demo testnet,
// JANGAN pola ini dipakai di mainnet. Lihat peringatan di README.
export const RELAYER_PK = process.env.RELAYER_PK as `0x${string}` | undefined; // panitia: bayar gas + hadiah
export const ORACLE_PK = process.env.ORACLE_PK as `0x${string}` | undefined; // juri: kirim verdict

// Endpoint OpenAI-compatible, jadi provider bisa diganti tanpa menyentuh kode
export const LLM = {
  baseUrl: (process.env.LLM_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, ""),
  apiKey: process.env.LLM_API_KEY,
  model: process.env.LLM_MODEL ?? "gpt-4o-mini",
} as const;

export const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_SECONDS ?? 15) * 1000;
