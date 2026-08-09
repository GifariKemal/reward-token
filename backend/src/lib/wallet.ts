// lib/wallet.ts = wallet client viem untuk endpoint tulis dan juri AI
// Backend Sesi 5 read-only; di sini backend mulai ikut tanda tangan transaksi.

import { createWalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bscTestnet } from "viem/chains";
import { ORACLE_PK, RELAYER_PK } from "../config";
import { transport } from "./chain";

// Beda dari materi: bentuk kunci diperiksa, tidak cuma "ada isinya". Materi memakai
// `pk ? ... : null`, padahal cast di config.ts hanya janji tipe yang tak pernah
// diverifikasi. MetaMask mengekspor private key TANPA prefiks 0x, dan kunci seperti
// itu membuat privateKeyToAccount melempar saat modul dimuat, sehingga `bun dev` DAN
// `bun oracle` sama-sama gagal start - padahal .env.example menjanjikan yang
// dikosongkan hanya mematikan fitur terkait. Jadi kunci salah bentuk dilaporkan
// dengan jelas lalu fiturnya dimatikan, bukan menjatuhkan seluruh proses.
const walletFrom = (pk: string | undefined, peran: string) => {
  if (!pk) return null;
  if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) {
    console.error(`Kunci ${peran} salah bentuk, fitur terkait dimatikan. Harus 0x plus 64 digit heksa (MetaMask mengekspor tanpa 0x).`);
    return null;
  }
  return createWalletClient({
    account: privateKeyToAccount(pk as `0x${string}`),
    chain: bscTestnet,
    transport,
  });
};

// null = PK belum diisi atau salah bentuk → fitur terkait mati, sisanya tetap hidup
export const relayerWallet = walletFrom(RELAYER_PK, "relayer (RELAYER_PK)"); // panitia
export const oracleWallet = walletFrom(ORACLE_PK, "juri (ORACLE_PK)"); // juri
