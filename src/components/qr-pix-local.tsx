import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { urlQrPix } from "@/lib/pix";

/** QR Pix 100% local (sem vazar chave/valor p/ terceiro). Fallback: qrserver só se canvas falhar. */
export function QrPixLocal({ copiaECola, tamanho = 220 }: { copiaECola: string; tamanho?: number }) {
  const [url, setUrl] = useState<string>("");
  useEffect(() => {
    let vivo = true;
    QRCode.toDataURL(copiaECola, { width: tamanho, margin: 1 })
      .then((u: string) => { if (vivo) setUrl(u); })
      .catch(() => { if (vivo) setUrl(urlQrPix(copiaECola, tamanho)); });
    return () => { vivo = false; };
  }, [copiaECola, tamanho]);
  if (!url) return <div className="text-xs text-muted-foreground">Gerando QR…</div>;
  return <img src={url} width={tamanho} height={tamanho} alt="QR Pix" className="rounded-lg border border-border" />;
}
