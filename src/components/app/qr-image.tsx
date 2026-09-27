"use client";

import { useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";

/** QR code de um endereço, gerado no próprio navegador (nada sai do PC). */
export function QrImage({ url }: { url: string }) {
  const { data } = useQuery({
    queryKey: ["qr", url],
    queryFn: () => QRCode.toDataURL(url, { margin: 1, width: 360, errorCorrectionLevel: "M" }),
    staleTime: Number.POSITIVE_INFINITY,
  });
  if (!data) return <div className="size-40 animate-pulse rounded-lg bg-muted" />;
  // biome-ignore lint/performance/noImgElement: data URL gerada na hora, o next/image não ajuda aqui
  return <img src={data} alt={`QR code para abrir ${url}`} className="size-40 shrink-0 rounded-lg bg-white p-1" />;
}
