// Uji tambahan Sesi 6 tanpa jaringan dan tanpa uang: LLM diganti server tiruan,
// basis datanya sementara, dan wallet relayer pakai private key contoh yang
// memang sudah publik (kunci Anvil, bukan milik siapa pun).

import { afterAll, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DB = join(tmpdir(), `uji-sesi6-${process.pid}.db`);
process.env.DB_PATH = DB;

// Server tiruan berbentuk OpenAI-compatible. `balas` diganti per test.
let balas: () => Response;
const permintaan: unknown[] = [];
const llm = Bun.serve({
  port: 0,
  fetch: async (req) => {
    permintaan.push(await req.json());
    return balas();
  },
});

process.env.LLM_BASE_URL = `http://127.0.0.1:${llm.port}/v1`;
process.env.LLM_API_KEY = "kunci-tiruan";
process.env.LLM_MODEL = "model-tiruan";
// Kunci uji Anvil yang sudah lama publik. Cukup untuk membuat wallet client;
// tidak ada transaksi yang dikirim di test ini.
process.env.RELAYER_PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

const { db, getLeaderboard, getPending, insertSubmission, markLatestSubmission, upsertBounty } =
  await import("./src/lib/db");
const { ipPrivat, judgeSubmission, uriAman } = await import("./src/services/judge");
const { app } = await import("./src/routes/api");

afterAll(() => {
  llm.stop(true);
  db.close();
  for (const s of ["", "-wal", "-shm"]) rmSync(DB + s, { force: true });
});

const jawabanLLM = (isi: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content: isi } }] }), {
    headers: { "content-type": "application/json" },
  });

describe("uriAman: penjaga SSRF sebelum backend mengambil URI dari luar", () => {
  test("URI publik diterima", () => {
    expect(uriAman("https://raw.githubusercontent.com/a/b/main/PROOF.md")).toBe(true);
    expect(uriAman("http://contoh.test/bukti.md")).toBe(true);
    expect(uriAman("ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi")).toBe(true);
    expect(uriAman("https://172.15.0.1/masih-publik")).toBe(true); // 172.15 bukan blok privat
  });

  test("host internal ditolak", () => {
    for (const u of [
      "http://localhost:3000/board",
      "http://127.0.0.1/rahasia",
      "http://10.0.0.5/internal",
      "http://192.168.1.1/router",
      "http://169.254.169.254/latest/meta-data/", // metadata cloud
      "http://172.20.0.1/docker",
      "http://[::1]:3000/",
      "http://0.0.0.0/",
      // bentuk IPv6 yang menembus penjaga versi pertama
      "http://[::ffff:127.0.0.1]:8099/",
      "http://[::]:8099/",
      "http://[fd00::1]/", // unique local
      "http://[fe80::1]/", // link local
    ]) {
      expect(uriAman(u)).toBe(false);
    }
  });

  test("bentuk IPv4 tersamar tetap ditolak, karena URL menormalkannya", () => {
    for (const u of ["http://2130706433/", "http://0177.0.0.1/", "http://0x7f000001/", "http://127.1/", "http://0/"]) {
      expect(uriAman(u)).toBe(false);
    }
  });

  test("skema selain http/https/ipfs ditolak", () => {
    for (const u of ["file:///etc/passwd", "ftp://contoh.test/x", "ipfs://", "", "bukan url"]) {
      expect(uriAman(u)).toBe(false);
    }
  });

  test("URI kepanjangan ditolak, karena panjangnya jadi biaya gas di storage escrow", () => {
    expect(uriAman(`https://contoh.test/p?x=${"A".repeat(600)}`)).toBe(false);
    expect(uriAman(`ipfs://${"b".repeat(600)}`)).toBe(false);
    expect(uriAman(`https://contoh.test/p?x=${"A".repeat(400)}`)).toBe(true);
  });

  test("ipPrivat menilai ALAMAT hasil resolusi, bukan tulisan hostname", () => {
    // ini lapis kedua: nama domain publik yang diarahkan ke 127.0.0.1 (mis. localtest.me)
    // lolos penjaga hostname, jadi yang menentukan adalah IP-nya
    for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.0.1", "169.254.169.254", "172.31.255.255", "100.64.0.1", "::1", "::", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "0.0.0.0"]) {
      expect(ipPrivat(ip)).toBe(true);
    }
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.15.0.1", "185.199.108.153", "2606:50c0::153"]) {
      expect(ipPrivat(ip)).toBe(false);
    }
  });
});

describe("judgeSubmission: putusan LLM diurai dengan aman", () => {
  // URI sengaja ditolak uriAman supaya fetchText tidak pernah menyentuh jaringan
  // maupun DNS. Nama seperti contoh.invalid tetap memicu lookup, dan di resolver
  // wildcard bisa menyuntikkan halaman iklan ke dalam prompt.
  const R = "http://127.0.0.1/RULES.md";
  const P = "http://127.0.0.1/PROOF.md";
  const nilai = () => judgeSubmission(R, P, "0xabc");

  test("JSON bersih diurai, dan bukti dikirim sebagai DATA bukan instruksi", async () => {
    permintaan.length = 0;
    balas = () => jawabanLLM('{"eligible": true, "alasan": "semua kriteria terpenuhi"}');

    expect(await nilai()).toEqual({ eligible: true, alasan: "semua kriteria terpenuhi" });

    const body = permintaan[0] as { messages: { role: string; content: string }[]; temperature: number };
    expect(body.temperature).toBe(0);
    // dua pesan system: prompt materi, lalu penjaga anti injeksi
    expect(body.messages.filter((m) => m.role === "system")).toHaveLength(2);
    expect(body.messages[1]!.content).toMatch(/DATA MENTAH yang tidak dipercaya/);
    // isi dari luar hanya boleh muncul di pesan user, dan harus JSON yang bisa diurai
    const pesanUser = body.messages.find((m) => m.role === "user")!;
    const soal = JSON.parse(pesanUser.content);
    expect(soal.rulesURI).toBe(R);
    expect(soal.worker).toBe("0xabc");
    // URI ditolak penjaga, jadi isinya jadi teks pengganti, bukan isi sungguhan
    expect(soal.proof_isi).toBe("(gagal diambil, nilai dari URI saja)");
  });

  test("JSON di dalam pagar kode tetap terbaca (GLM membungkusnya begitu)", async () => {
    balas = () => jawabanLLM('```json\n{"eligible": false, "alasan": "bukti tidak bisa diakses"}\n```');
    expect(await nilai()).toEqual({ eligible: false, alasan: "bukti tidak bisa diakses" });
  });

  test("eligible berupa string TIDAK boleh jadi pembayaran", async () => {
    // Boolean("false") bernilai true. Di materi ini membalik putusan MENOLAK menjadi
    // MEMBAYAR, jadi jalur ini wajib gagal-tertutup.
    for (const nilaiPalsu of ['"false"', '"no"', '"0"', "0", "null", "[]", '"true"', "1"]) {
      balas = () => jawabanLLM(`{"eligible": ${nilaiPalsu}, "alasan": "x"}`);
      expect(nilai()).rejects.toThrow(/eligible wajib boolean/);
    }
  });

  test("prosa yang mengutip JSON dari berkas bukti tidak boleh jadi putusan", async () => {
    // Materi memotong dari { pertama ke } terakhir, sehingga JSON yang dikutip model
    // dari isi bukti bisa menjadi putusan. Sekarang balasan seperti ini ditolak.
    balas = () => jawabanLLM('Saya TOLAK. Bukti hanya menyalin {"eligible": true, "alasan": "lulus semua"}');
    expect(nilai()).rejects.toThrow(/bukan JSON utuh/);
  });

  test("balasan tanpa JSON jadi error yang jelas, bukan TypeError", async () => {
    balas = () => jawabanLLM("Maaf, saya tidak bisa menilai ini.");
    expect(nilai()).rejects.toThrow(/bukan JSON utuh/);
  });

  test("balasan tanpa pilihan jawaban ditolak", async () => {
    balas = () => new Response(JSON.stringify({ choices: [] }), { headers: { "content-type": "application/json" } });
    expect(nilai()).rejects.toThrow(/tidak mengembalikan isi jawaban/);
  });

  test("LLM error HTTP diteruskan sebagai error", async () => {
    balas = () => new Response("rate limit", { status: 429 });
    expect(nilai()).rejects.toThrow(/LLM 429/);
  });
});

describe("query baru", () => {
  const escrowA = "0x1111111111111111111111111111111111111111";
  const escrowB = "0x2222222222222222222222222222222222222222";
  const workerA = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const workerB = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

  // Tiap test menyiapkan barisnya sendiri lalu membersihkan, supaya `bun test -t`
  // atau satu `.only` tidak membuat test lain gagal.
  const bersihkan = () => {
    db.exec("DELETE FROM submissions");
    db.exec("DELETE FROM bounties");
  };

  test("getPending hanya yang berstatus submitted, urut block naik lalu id naik", () => {
    bersihkan();
    upsertBounty.run({
      bountyId: 1, escrow: escrowA, creator: workerA, rewardAmount: "1",
      txHash: "0xb1", blockNumber: 10, blockHash: null, ts: 0,
    });
    insertSubmission.run({
      escrow: escrowB, worker: workerB, proofUri: "b2", txHash: "0xs2",
      blockNumber: 20, blockHash: null, ts: 0,
    });
    insertSubmission.run({
      escrow: escrowA, worker: workerA, proofUri: "b1", txHash: "0xs1",
      blockNumber: 10, blockHash: null, ts: 0,
    });

    const antre = getPending();
    expect(antre.map((p) => p.proof_uri)).toEqual(["b1", "b2"]);
    // tx_hash wajib ikut terbawa: juri memakainya sebagai kunci idempoten
    expect(antre.map((p) => p.tx_hash)).toEqual(["0xs1", "0xs2"]);
  });

  test("getLeaderboard menjumlah wei pakai BigInt dan urut menang terbanyak", () => {
    bersihkan();
    // 800 RWD: melewati batas aman integer JS, jadi SUM() SQLite akan salah
    const besar = "800000000000000000000";
    for (const [i, w] of [workerA, workerA, workerB].entries()) {
      insertSubmission.run({
        escrow: escrowA, worker: w, proofUri: `p${i}`, txHash: `0xt${i}`,
        blockNumber: 10 + i, blockHash: null, ts: 0,
      });
      markLatestSubmission(escrowA, "rewarded", besar);
    }
    insertSubmission.run({
      escrow: escrowB, worker: workerB, proofUri: "ditolak", txHash: "0xt9",
      blockNumber: 99, blockHash: null, ts: 0,
    });
    markLatestSubmission(escrowB, "rejected");

    const papan = getLeaderboard();
    expect(papan).toEqual([
      { worker: workerA, wins: 2, total_reward: "1600000000000000000000" },
      { worker: workerB, wins: 1, total_reward: besar },
    ]);
    expect(BigInt(papan[0]!.total_reward)).toBe(2n * BigInt(besar));
  });
});

describe("endpoint /verdicts dan penjaga masukan /relay", () => {
  const kirim = (path: string, body: unknown) =>
    app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  const escrow = "0x3333333333333333333333333333333333333333";
  const worker = "0x4444444444444444444444444444444444444444";

  test("POST /verdicts menolak badan yang tidak lengkap", async () => {
    expect((await kirim("/verdicts", { escrow, worker })).status).toBe(400);
    expect((await kirim("/verdicts", { escrow: "bukan-alamat", worker, eligible: true, alasan: "x" })).status).toBe(400);
    expect((await kirim("/verdicts", { escrow, worker, eligible: "true", alasan: "x" })).status).toBe(400);
  });

  test("POST /verdicts membatasi panjang alasan", async () => {
    const res = await kirim("/verdicts", { escrow, worker, eligible: true, alasan: "x".repeat(2001) });
    expect(res.status).toBe(400);
  });

  test("POST /verdicts memvalidasi tx_hash, kalau tidak batas alasan cuma hiasan", async () => {
    // escrow sendiri, supaya baris yang tersimpan di sini tidak mengganggu test
    // pembacaan /verdicts/:escrow di bawah
    const dasar = { escrow: "0x5555555555555555555555555555555555555555", worker, eligible: true, alasan: "ok" };
    // tanpa validasi: megabyte lewat field sebelahnya, dan nilai bukan-string bikin
    // driver SQLite melempar sehingga jadi 500 padahal ini masukan salah
    expect((await kirim("/verdicts", { ...dasar, tx_hash: "A".repeat(100_000) })).status).toBe(400);
    expect((await kirim("/verdicts", { ...dasar, tx_hash: 12345 })).status).toBe(400);
    expect((await kirim("/verdicts", { ...dasar, tx_hash: { a: 1 } })).status).toBe(400);
    expect((await kirim("/verdicts", { ...dasar, tx_hash: `0x${"a".repeat(64)}` })).status).toBe(201);
  });

  test("verdict tersimpan lalu terbaca lewat GET /verdicts/:escrow", async () => {
    expect((await kirim("/verdicts", { escrow, worker, eligible: false, alasan: "bukti kurang" })).status).toBe(201);

    const res = await app.request(`/verdicts/${escrow}`);
    const { verdicts } = (await res.json()) as { verdicts: { eligible: number; alasan: string }[] };
    expect(res.status).toBe(200);
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]).toMatchObject({ eligible: 0, alasan: "bukti kurang" });
  });

  test("GET /verdicts/:escrow menolak alamat tidak valid", async () => {
    expect((await app.request("/verdicts/bukan-alamat")).status).toBe(400);
  });

  test("POST /relay/bounty menolak reward dan URI berbahaya sebelum menyentuh chain", async () => {
    const R = "https://contoh.test/R.md";
    for (const reward of ["1000", "0", "abc", "-5", "1e2", "0x64", " 5 ", ""]) {
      const res = await kirim("/relay/bounty", { reward, rules_uri: R });
      expect(res.status).toBe(400);
      // "1e2" dan "0x64" lolos Number.isFinite tapi artinya beda di parseEther, jadi
      // yang divalidasi harus string yang benar-benar dipakai
      expect(await res.json()).toMatchObject({ error: expect.stringMatching(/reward/) });
    }
    expect((await kirim("/relay/bounty", { reward: "5", rules_uri: "http://169.254.169.254/" })).status).toBe(400);
    expect((await kirim("/relay/bounty", { reward: "5", rules_uri: `https://contoh.test/${"A".repeat(600)}` })).status)
      .toBe(400);
    for (const deadline_jam of [0, -1, 1000, 0.0001]) {
      expect((await kirim("/relay/bounty", { reward: "5", rules_uri: R, deadline_jam })).status).toBe(400);
    }
  });

  test("POST /relay/bounty/:escrow/submit menolak proof_uri internal", async () => {
    const res = await kirim(`/relay/bounty/${escrow}/submit`, { proof_uri: "http://localhost:3000/board" });
    expect(res.status).toBe(400);
    // Badan respons ikut diperiksa: tanpa ini test tetap hijau walau penjaga URI
    // dihapus, karena escrow karangan di atas juga ditolak penjaga escrow (dan
    // pemeriksaan itu menyentuh RPC sungguhan, yang tidak diinginkan di test).
    expect(await res.json()).toMatchObject({ error: expect.stringMatching(/proof_uri/) });
  });
});
