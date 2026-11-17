import { useEffect, useRef, useState } from "react";

export type AmostraRota = {
  p_rota: string;
  p_latitude: number;
  p_longitude: number;
  p_precisao: number;
  p_capturado_em: string;
};

export function ColetaLocalizacaoRota({ rota, registrar }: {
  rota: string;
  registrar: (amostra: AmostraRota) => Promise<boolean>;
}) {
  const [compartilhar, setCompartilhar] = useState(false);
  const [estado, setEstado] = useState("");
  const enviar = useRef(registrar);

  useEffect(() => { enviar.current = registrar; }, [registrar]);
  useEffect(() => {
    if (!compartilhar) return;
    if (!navigator.geolocation) {
      setEstado("Localização indisponível neste dispositivo.");
      return;
    }
    let ultimoEnvio = 0;
    let ativo = true;
    const id = navigator.geolocation.watchPosition(async ({ coords, timestamp }) => {
      if (!ativo || document.visibilityState !== "visible" || Date.now() - ultimoEnvio < 15000) return;
      if (!navigator.onLine) { setEstado("Sem conexão. A próxima posição será enviada ao reconectar."); return; }
      if (!Number.isFinite(timestamp) || Date.now() - timestamp > 60000 || coords.accuracy > 1000) return;
      ultimoEnvio = Date.now();
      const amostra = {
        p_rota: rota, p_latitude: coords.latitude, p_longitude: coords.longitude,
        p_precisao: coords.accuracy, p_capturado_em: new Date(timestamp).toISOString(),
      };
      try {
        const ok = await enviar.current(amostra);
        if (ativo) setEstado(ok ? "Localização atualizada." : "A Central recusou esta atualização.");
      } catch {
        if (ativo) setEstado("A localização não foi confirmada pela Central.");
      }
    }, (erro) => {
      if (ativo) setEstado(erro.code === 1 ? "Permissão de localização negada." : "Aguardando sinal de localização.");
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
    return () => {
      ativo = false;
      navigator.geolocation.clearWatch(id);
    };
  }, [compartilhar,rota]);

  return (
    <div>
      <button className="rounded border px-3 py-2" type="button" aria-pressed={compartilhar} onClick={() => {
        setCompartilhar(!compartilhar);
        setEstado(!compartilhar ? "Aguardando permissão e localização…" : "Compartilhamento pausado.");
      }}>{compartilhar ? "Pausar localização" : "Compartilhar localização"}</button>
      {estado && <p role="status">{estado}</p>}
      {compartilhar && <p>Mantenha esta tela aberta para atualizar a posição durante a rota.</p>}
    </div>
  );
}
