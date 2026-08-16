import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { binanceWallet, injectedWallet, metaMaskWallet, walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";
import { fallback, http } from "viem";
import { bscTestnet } from "wagmi/chains";

export const CHAIN = bscTestnet;

// RPC publik suka mati mendadak → fallback berperingkat, sama seperti backend.
//
// Daftarnya beda dari materi, dan alasannya diukur bukan ditebak (16 Agustus 2026).
// Frontend butuh DUA hal dari sebuah RPC: header CORS, dan dukungan eth_newFilter
// (dipakai useWatchContractEvent di hooks/use-auto-refresh.ts).
//   - onfinality (pilihan pertama di materi): balas 429 "Too Many Requests" tanpa kunci
//   - drpc (dipakai backend kita): CORS lolos, tapi eth_newFilter dibalas 400
//     "method is not available on free plan", jadi konsol penuh error merah
//   - thirdweb (dipakai backend kita): lolos dari curl, tapi DITOLAK dari browser.
//     Permintaan dengan header Origin dibalas tanpa header CORS sama sekali, jadi
//     browser membuangnya: "No 'Access-Control-Allow-Origin' header is present".
//     Uji dari terminal saja tidak cukup untuk menilai RPC yang dipakai frontend.
//   - publicnode dan bnbchain: dua-duanya lolos, dan itulah yang dipakai
// publicnode memangkas block lama, dan itu tidak jadi soal di sini karena frontend
// cuma membaca keadaan sekarang plus event yang baru.
const RPC_URLS = [
  import.meta.env.VITE_RPC_URL,
  "https://bsc-testnet-rpc.publicnode.com",
  "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
].filter(Boolean) as string[];

// Beda dari materi: projectId dibikin opsional. Materi mewajibkannya, dan memang
// WalletConnect (QR untuk wallet HP) tidak bisa jalan tanpa itu. Tapi kalau nilainya
// kosong, RainbowKit menyalakan connector WalletConnect yang langsung gagal, dan
// halamannya blank. Di sini wallet WalletConnect cuma dipasang kalau projectId ada,
// jadi tanpa projectId aplikasi tetap hidup dengan wallet ekstensi browser.
const projectId = import.meta.env.VITE_WC_PROJECT_ID?.trim();
if (!projectId)
  console.warn(
    "VITE_WC_PROJECT_ID kosong: wallet lewat QR (WalletConnect) dimatikan. " +
      "Pakai ekstensi browser, atau ambil projectId gratis di https://cloud.reown.com",
  );

export const config = getDefaultConfig({
  appName: "Papan Sayembara",
  // RainbowKit mewajibkan string. Nilai penanda ini tidak pernah dipakai karena
  // satu-satunya wallet yang membutuhkannya tidak didaftarkan saat projectId kosong.
  projectId: projectId || "walletconnect-dimatikan",
  chains: [CHAIN],
  transports: {
    [CHAIN.id]: fallback(
      RPC_URLS.map((url) => http(url)),
      { rank: true },
    ),
  },
  wallets: [
    {
      groupName: "Direkomendasikan",
      // binanceWallet sudah bawaan RainbowKit — paket @binance/w3w-* tidak perlu
      wallets: [binanceWallet, metaMaskWallet, injectedWallet, ...(projectId ? [walletConnectWallet] : [])],
    },
  ],
});
