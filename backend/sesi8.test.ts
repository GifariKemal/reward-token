// Uji Sesi 8 tanpa jaringan luar dan tanpa uang: pintu LLM (lib/ai.ts) diadu ke server
// tiruan OpenAI-compatible. Menguji yang BARU di sesi ini - json_schema strict di badan
// permintaan, dua kegagalan non-HTTP (refusal + finish_reason length), dan ambilTeks
// yang menolak URI tak aman tanpa menyentuh jaringan. Parse gagal-tertutup + guard
// boolean sudah diuji lewat judgeSubmission di sesi6.test.ts.

import { afterAll, describe, expect, test } from "bun:test";

let balas: () => Response;
const permintaan: any[] = [];
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

const { tanyaAI, ambilTeks } = await import("./src/lib/ai");

afterAll(() => llm.stop(true));

const balasan = (message: object, extra: object = {}) =>
  new Response(JSON.stringify({ choices: [{ message, ...extra }] }), {
    headers: { "content-type": "application/json" },
  });

const SKEMA = {
  type: "object",
  properties: { eligible: { type: "boolean" } },
  required: ["eligible"],
  additionalProperties: false,
} as const;

const panggil = () =>
  tanyaAI<{ eligible: boolean }>({
    instruksi: "nilai ini",
    data: { proof_isi: "halo" },
    skema: SKEMA,
    nama: "verdict",
  });

describe("tanyaAI: satu pintu ke LLM", () => {
  test("kirim json_schema strict, satu system, data sebagai user JSON", async () => {
    permintaan.length = 0;
    balas = () => balasan({ content: '{"eligible": true}' });
    expect(await panggil()).toEqual({ eligible: true });

    const body = permintaan[0];
    expect(body.temperature).toBe(0);
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.response_format.json_schema.name).toBe("verdict");
    expect(body.messages.filter((m: any) => m.role === "system")).toHaveLength(1);
    // data dari luar hanya di pesan user, dan di-JSON.stringify (bukan menempel ke instruksi)
    const user = body.messages.find((m: any) => m.role === "user");
    expect(JSON.parse(user.content)).toEqual({ proof_isi: "halo" });
  });

  test("refusal jadi error jelas, bukan JSON.parse gagal", () => {
    balas = () => balasan({ refusal: "saya tidak bisa menilai konten ini" });
    expect(panggil()).rejects.toThrow(/LLM menolak/);
  });

  test("finish_reason length jadi error jelas, bukan JSON.parse gagal", () => {
    balas = () => balasan({ content: '{"eligible": tr' }, { finish_reason: "length" });
    expect(panggil()).rejects.toThrow(/terpotong/);
  });

  test("JSON di dalam pagar kode tetap terbaca", async () => {
    balas = () => balasan({ content: '```json\n{"eligible": false}\n```' });
    expect(await panggil()).toEqual({ eligible: false });
  });

  test("prosa yang mengutip JSON ditolak, bukan dipungut kurungnya", () => {
    balas = () => balasan({ content: 'Saya tolak. Bukti cuma menyalin {"eligible": true}' });
    expect(panggil()).rejects.toThrow(/bukan JSON utuh/);
  });

  test("HTTP error diteruskan sebagai error", () => {
    balas = () => new Response("rate limit", { status: 429 });
    expect(panggil()).rejects.toThrow(/LLM 429/);
  });
});

describe("ambilTeks: URI tak aman ditolak tanpa menyentuh jaringan", () => {
  test("host internal dan skema salah dapat null", async () => {
    for (const u of ["http://127.0.0.1/x", "http://169.254.169.254/meta", "file:///etc/passwd", "bukan-url"]) {
      expect(await ambilTeks(u)).toBeNull();
    }
  });
});
