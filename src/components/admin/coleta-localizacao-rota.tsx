import { useCallback, useEffect, useRef, useState } from "react";
import { iniciarMonitorLocalizacao, type AmostraRota } from "./monitor-localizacao-rota";

export type { AmostraRota };

const mensagens = {
  indisponivel: "Localização indisponível neste dispositivo.",
  aguardando: "Aguardando sinal de localização.",
  negado: "Permissão de localização negada.",
  semConexao: "Sem conexão. Aguarde a próxima posição com conexão.",
  atualizada: "Localização atualizada.",
  recusada: "A Central recusou esta atualização.",
  naoConfirmada: "A localização não foi confirmada pela Central.",
};

export function ColetaLocalizacaoRota({ rota, registrar }: {
  rota: string;
  registrar: (amostra: AmostraRota) => Promise<boolean>;
}) {
  const [rotaConsentida, setRotaConsentida] = useState<string | null>(null);
  const compartilhar = rotaConsentida === rota;
  const [estado, setEstado] = useState("");
  const enviar = useRef(registrar);

  useEffect(() => { enviar.current = registrar; }, [registrar]);

  const enviarAmostra = useCallback(
    (amostra: AmostraRota) => enviar.current(amostra),
    [],
  );

  useEffect(() => {
    if (!compartilhar) return;
    setEstado("Aguardando permissão e localização…");
    const monitor = iniciarMonitorLocalizacao(
      rota,
      enviarAmostra,
      {
        geolocalizacao: navigator.geolocation ?? null,
        visivel: () => document.visibilityState === "visible",
        online: () => navigator.onLine,
        agora: () => Date.now(),
      },
      mensagens,
      setEstado,
    );
    return () => monitor.parar();
  }, [compartilhar, rota, enviarAmostra]);

  return (
    <div>
      <button className="rounded border px-3 py-2" type="button" aria-pressed={compartilhar} onClick={() => {
        setRotaConsentida(compartilhar ? null : rota);
        setEstado(!compartilhar ? "Aguardando permissão e localização…" : "Compartilhamento pausado.");
      }}>{compartilhar ? "Pausar localização" : "Compartilhar localização"}</button>
      {estado && <p role="status">{estado}</p>}
      {compartilhar && <p>Mantenha esta tela aberta para atualizar a posição durante a rota.</p>}
    </div>
  );
}
