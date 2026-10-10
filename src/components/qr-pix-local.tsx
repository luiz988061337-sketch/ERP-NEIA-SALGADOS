import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** QR Pix 100% local (sem vazar chave/valor p/ terceiro). Sem fallback externo: em falha, usa copia-e-cola. */
export function QrPixLocal({ copiaECola, tamanho = 220 }: { copiaECola: string; tamanho?: number }) {
  const [url, setUrl] = useState<string>("");
  const [falhou, setFalhou] = useState(false);
  useEffect(() => {
    let vivo = true;
    setFalhou(false);
    QRCode.toDataURL(copiaECola, { width: tamanho, margin: 1 })
      .then((u: string) => { if (vivo) setUrl(u); })
      .catch(() => { if (vivo) setFalhou(true); });
    return () => { vivo = false; };
  }, [copiaECola, tamanho]);
  if (falhou) return <div className="text-xs text-muted-foreground">QR indisponível neste aparelho. Use o Pix copia e cola abaixo.</div>;
  if (!url) return <div className="text-xs text-muted-foreground">Gerando QR…</div>;
  return <img src={url} width={tamanho} height={tamanho} alt="QR Pix" className="rounded-lg border border-border" />;
}
