/**
 * Monitor de localização de primeiro plano da rota (Fase GPS).
 * Lógica extraída de ColetaLocalizacaoRota para permitir testes de comportamento
 * sem navegador: permissão negada, desconexão, amostra antiga, precisão ruim,
 * frequência limitada, tela em segundo plano e limpeza ao encerrar.
 *
 * Regras preservadas (migration 0122 / registrar_localizacao_rota):
 * - Somente com consentimento explícito do motoboy e tela visível.
 * - Amostra precisa ser recente (<= 60 s) e precisa (<= 1000 m).
 * - Envio limitado a no máximo uma amostra a cada 15 s.
 * - Sem histórico persistido: a Central guarda apenas a última posição da rota.
 */

export type AmostraRota = {
  p_rota: string;
  p_latitude: number;
  p_longitude: number;
  p_precisao: number;
  p_capturado_em: string;
};

export type MensagensMonitor = {
  indisponivel: string;
  aguardando: string;
  negado: string;
  semConexao: string;
  atualizada: string;
  recusada: string;
  naoConfirmada: string;
};

export type GeolocalizacaoObservavel = {
  watchPosition: (
    sucesso: (posicao: { coords: { latitude: number; longitude: number; accuracy: number }; timestamp: number }) => void,
    erro: (erro: { code: number }) => void,
    opcoes: { enableHighAccuracy: boolean; maximumAge: number; timeout: number },
  ) => number;
  clearWatch: (id: number) => void;
};

export type AmbienteMonitor = {
  geolocalizacao?: GeolocalizacaoObservavel | null;
  /** Tela está visível (primeiro plano). */
  visivel: () => boolean;
  /** Há conexão de rede. */
  online: () => boolean;
  /** Relógio em ms (injetável para testes). */
  agora: () => number;
};

export type MonitorLocalizacao = { parar: () => void };

const FREQUENCIA_MS = 15000;
const IDADE_MAXIMA_MS = 60000;
const PRECISAO_MAXIMA_M = 1000;

export function iniciarMonitorLocalizacao(
  rota: string,
  enviar: (amostra: AmostraRota) => Promise<boolean>,
  ambiente: AmbienteMonitor,
  mensagens: MensagensMonitor,
  onEstado: (texto: string) => void,
): MonitorLocalizacao {
  const { geolocalizacao } = ambiente;
  if (!geolocalizacao) {
    onEstado(mensagens.indisponivel);
    return { parar: () => {} };
  }

  let ativo = true;
  let ultimoEnvio = Number.NEGATIVE_INFINITY;
  let emVoo = false;
  let id: number | undefined;
  const parar = () => { ativo = false; if (id !== undefined) geolocalizacao.clearWatch(id); };

  id = geolocalizacao.watchPosition(
    ({ coords, timestamp }) => {
      if (!ativo || emVoo || !ambiente.visivel() || ambiente.agora() - ultimoEnvio < FREQUENCIA_MS) return;
      if (!ambiente.online()) {
        onEstado(mensagens.semConexao);
        return;
      }
      if (!Number.isFinite(timestamp) || timestamp > ambiente.agora() + 5000 || ambiente.agora() - timestamp > IDADE_MAXIMA_MS
          || !Number.isFinite(coords.latitude) || Math.abs(coords.latitude) > 90
          || !Number.isFinite(coords.longitude) || Math.abs(coords.longitude) > 180
          || !Number.isFinite(coords.accuracy) || coords.accuracy < 0 || coords.accuracy > PRECISAO_MAXIMA_M) {
        return;
      }
      ultimoEnvio = ambiente.agora();
      const amostra: AmostraRota = {
        p_rota: rota,
        p_latitude: coords.latitude,
        p_longitude: coords.longitude,
        p_precisao: coords.accuracy,
        p_capturado_em: new Date(timestamp).toISOString(),
      };
      emVoo = true;
      void Promise.resolve().then(() => ativo && ambiente.visivel() && ambiente.online() ? enviar(amostra) : false)
        .then((ok) => {
          if (ativo) onEstado(ok ? mensagens.atualizada : mensagens.recusada);
        })
        .catch(() => {
          if (ativo) onEstado(mensagens.naoConfirmada);
        }).finally(() => { emVoo = false; });
    },
    (erro) => {
      if (ativo) onEstado(erro.code === 1 ? mensagens.negado : mensagens.aguardando);
      if (erro.code === 1) parar();
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
  );

  if (!ativo) geolocalizacao.clearWatch(id);
  return { parar };
}
