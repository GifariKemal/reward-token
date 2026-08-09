// Verifikasi independen: baca chain langsung dengan viem, tanpa memakai kode
// backend selain daftar RPC. Tujuannya membuktikan isi basis data dan klaim
// "verdict AI masuk on-chain" cocok dengan chain, bukan cuma cocok dengan log.
// Jalankan: bun run periksa-sesi6.ts

import { createPublicClient, fallback, http, parseAbi, parseAbiItem, formatEther, type Address } from "viem";
import { bscTestnet } from "viem/chains";

const RPC = [
  "https://97.rpc.thirdweb.com",
  "https://bsc-testnet.drpc.org",
  "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
];
const client = createPublicClient({ chain: bscTestnet, transport: fallback(RPC.map((u) => http(u)), { rank: true }) });

const TOKEN = "0x07238d9a680488e267477139643088af34abd890" as Address;
const FACTORY = "0xd5e8f3480448d165cbbcbde1036303855b883d09" as Address;
const EOA = "0x920bEF978Cffda8a030D4Aa3C9D3aa5ecAA3C1A0" as Address;

const escrowAbi = parseAbi([
  "function status() view returns (uint8)",
  "function worker() view returns (address)",
  "function proofURI() view returns (string)",
  "function rewardAmount() view returns (uint256)",
]);
const label = ["MenungguDana", "Dibuka", "Disubmit", "Selesai", "Dibatalkan"];

// Pasangan bounty #5 dan #6, dijalankan dengan versi backend yang sudah diperkeras
// (parser putusan tegas, penjaga SSRF dua lapis, penjaga asal-usul escrow, dan
// perbaikan balapan watcher). Pasangan pertama #3 approve
// `0x7b7ce50D82E9F72603AD6c32Ded475056212162b` dan #4 reject
// `0x447b5C62fc5b52488644a98A31743B079320394f` juga masih ada di chain.
const TARGET = {
  approve: "0xe6C22ca1475922cFb6B94A37d47B88f0eC0Cc26b" as Address,
  reject: "0x9b5B5668B67cc9CBFCE0F44Ee723Bf59531bc2EA" as Address,
};
const TX = {
  verdictApprove: "0x7157093c2d226fb2015008036518f904e3b976715fddd12b6c83019350d72ec8",
  verdictReject: "0x9fac25d1f3c375ef8de462f202b20d6b60290db1d7f975725b1e99d68bb07653",
} as const;

let gagal = 0;
const cek = (nama: string, dapat: unknown, harap: unknown, bandingkan = (a: unknown, b: unknown) => String(a) === String(b)) => {
  const ok = bandingkan(dapat, harap);
  if (!ok) gagal++;
  console.log(`${ok ? "OK  " : "BEDA"} ${nama}: ${dapat}${ok ? "" : ` (harap ${harap})`}`);
};

const bacaEscrow = async (a: Address) => {
  const c = { address: a, abi: escrowAbi } as const;
  const [status, worker, proofURI, reward] = await client.multicall({
    contracts: [
      { ...c, functionName: "status" },
      { ...c, functionName: "worker" },
      { ...c, functionName: "proofURI" },
      { ...c, functionName: "rewardAmount" },
    ],
    allowFailure: false,
  });
  return { status: label[status], worker, proofURI, reward };
};

console.log("=== factory ===");
const total = await client.readContract({
  address: FACTORY, abi: parseAbi(["function totalBounties() view returns (uint256)"]), functionName: "totalBounties",
});
// minimal 7, bukan tepat 7: bounty baru boleh dibuat kapan saja setelah ini
cek("totalBounties minimal 7", total, 7n, (a, b) => (a as bigint) >= (b as bigint));
const oracle = await client.readContract({
  address: FACTORY, abi: parseAbi(["function oracle() view returns (address)"]), functionName: "oracle",
});
cek("oracle terdaftar", oracle, EOA);

console.log("\n=== jalur DISETUJUI (bounty #5) ===");
const a = await bacaEscrow(TARGET.approve);
cek("status", a.status, "Selesai");
cek("worker", a.worker, EOA);
cek("proof adalah PROOF.md mentor", a.proofURI.endsWith("PROOF.md"), true);
cek("reward", formatEther(a.reward), "3");

console.log("\n=== jalur DITOLAK (bounty #6) ===");
const r = await bacaEscrow(TARGET.reject);
// kontrak Sesi 4: setelah ditolak, escrow kembali Dibuka dan worker direset ke alamat nol
cek("status kembali Dibuka", r.status, "Dibuka");
cek("worker direset ke alamat nol", r.worker, "0x0000000000000000000000000000000000000000");
cek("hadiah masih terkunci di escrow", formatEther(
  await client.readContract({
    address: TOKEN, abi: parseAbi(["function balanceOf(address) view returns (uint256)"]),
    functionName: "balanceOf", args: [TARGET.reject],
  }),
), "2");

console.log("\n=== transaksi verdict yang dikirim juri AI ===");
const relRel = parseAbiItem("event RewardReleased(address indexed worker, uint256 rewardAmount)");
const relRej = parseAbiItem("event WorkRejected(address indexed worker)");
for (const [nama, hash, topic] of [
  ["approve", TX.verdictApprove, relRel],
  ["reject", TX.verdictReject, relRej],
] as const) {
  const rc = await client.getTransactionReceipt({ hash });
  const tx = await client.getTransaction({ hash });
  cek(`${nama}: status receipt`, rc.status, "success");
  cek(`${nama}: pengirim adalah oracle`, tx.from.toLowerCase(), EOA.toLowerCase());
  // selector fulfillVerification(bool), dicek dengan `cast sig "fulfillVerification(bool)"`
  cek(`${nama}: selector fulfillVerification`, tx.input.slice(0, 10), "0xc9dbdd90");
  const logs = await client.getLogs({ address: rc.to!, event: topic, fromBlock: rc.blockNumber, toBlock: rc.blockNumber });
  cek(`${nama}: event ${topic.name} terpancar`, logs.length >= 1, true);
}

console.log("\n=== saldo ===");
const saldo = await client.readContract({
  address: TOKEN, abi: parseAbi(["function balanceOf(address) view returns (uint256)"]),
  functionName: "balanceOf", args: [EOA],
});
console.log(`RWD di wallet EOA : ${formatEther(saldo)}`);
console.log(`tBNB di wallet EOA: ${formatEther(await client.getBalance({ address: EOA }))}`);

console.log(gagal === 0 ? "\nSEMUA COCOK dengan chain" : `\n${gagal} pemeriksaan TIDAK cocok`);
process.exit(gagal === 0 ? 0 : 1);
