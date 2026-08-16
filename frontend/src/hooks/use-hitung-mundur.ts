import { useEffect, useState } from "react";

export function useHitungMundur(deadline?: bigint) {
  const [sekarang, setSekarang] = useState(() => Math.floor(Date.now() / 1000));
  const sisa = deadline === undefined ? undefined : Number(deadline) - sekarang;

  useEffect(() => {
    if (sisa === undefined || sisa <= 0) return;
    // Masih lama? cukup perbarui tiap 30 detik — biar tidak render 24 kartu tiap detik
    const jeda = sisa > 3600 ? 30_000 : 1000;
    const id = setInterval(() => setSekarang(Math.floor(Date.now() / 1000)), jeda);
    return () => clearInterval(id);
    // Sengaja tidak bergantung pada `sisa` itu sendiri: nilainya berubah tiap tik,
    // dan kalau ikut jadi dependensi, interval dibongkar-pasang setiap detik.
  }, [sisa === undefined, (sisa ?? 0) > 3600, (sisa ?? 0) <= 0]);

  if (sisa === undefined) return undefined;
  if (sisa <= 0) return { lewat: true, teks: "Deadline lewat" };

  const hari = Math.floor(sisa / 86400);
  const jam = Math.floor((sisa % 86400) / 3600);
  const menit = Math.floor((sisa % 3600) / 60);
  const detik = sisa % 60;

  const teks =
    hari > 0
      ? `${hari} hari ${jam} jam lagi`
      : jam > 0
        ? `${jam} jam ${menit} menit lagi`
        : `${menit}:${String(detik).padStart(2, "0")} lagi`;

  return { lewat: false, teks };
}
