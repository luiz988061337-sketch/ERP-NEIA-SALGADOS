import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { PageHeader } from "@/components/admin/ui-admin";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-steps";
import { rotaGoogleMaps } from "@/components/map-view";
import { MOTIVO_ATRASO, MOTIVO_ATRASO_LABEL } from "@/lib/entrega";
import { useRoles, useSession } from "@/lib/session";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { ColetaLocalizacaoRota } from "@/components/admin/coleta-localizacao-rota";

const contrato = z.array(z.object({
  id: z.guid(),
  status: z.enum(["preparando","em_rota","concluida"]),
  liberada_central_em: z.string().nullable().optional(),
  pedidos: z.array(z.object({
    retirada_em: z.string().nullable().optional(),
    id: z.guid(), numero: z.number(), status: z.string(), cliente_nome: z.string(),
    endereco: z.string(), bairro: z.string(), complemento: z.string(),
  })),
}));

export function PainelMotoboyRpc() {
  const { user, loading } = useSession();
  const { data: roles } = useRoles(user?.id);
  const navigate = useNavigate();
  const [mensagem, setMensagem] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const emVoo = useRef(false);
  const permitido = roles?.includes("motoboy") === true;
  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth", search: { redirect: "/motoboy" }, replace: true });
  }, [loading,user,navigate]);

  const rotas = useQuery({
    queryKey: ["motoboy-rpc-rotas",user?.id],
    enabled: permitido && Boolean(user),
    refetchInterval: 15000,
    queryFn: async () => {
      const retorno = await supabase.rpc("motoboy_listar_rotas_atribuidas");
      if (retorno.error) throw new Error("Rotas da Central indisponíveis.");
      return contrato.parse(retorno.data);
    },
  });

  async function operar(rpc: string,args: Record<string,unknown>,sucesso: string) {
    if (emVoo.current) return;
    emVoo.current = true;
    setOcupado(true);
    setMensagem("");
    try {
      const { data, error } = await supabase.rpc(rpc,args);
      if (error) throw error;
      if (!["ok","registrado","repetido"].includes(data?.status)) {
        setMensagem(data?.motivo === "retirada_de_todos_os_pedidos_obrigatoria"
          ? "Confirme a retirada de todos os pedidos antes de sair."
          : "A Central recusou esta etapa. Confira o estado da rota.");
        return;
      }
      setMensagem(sucesso);
      await rotas.refetch();
    } catch {
      setMensagem("Não foi possível confirmar a operação. Atualize as rotas antes de repetir.");
    } finally {
      emVoo.current = false;
      setOcupado(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-8">
      <PageHeader titulo="Painel do motoboy" descricao="Rotas atribuídas pela Central de Entregas." />
      {roles && !permitido && <p>Acesso reservado ao motoboy cadastrado.</p>}
      {permitido && rotas.isPending && <p role="status">Consultando suas rotas…</p>}
      {rotas.isError && <p role="alert">Falha ao consultar as rotas. Tente atualizar a lista.</p>}
      {permitido && <Button variant="outline" onClick={() => void rotas.refetch()}>Atualizar rotas</Button>}
      {mensagem && <p role="status">{mensagem}</p>}
      {rotas.data?.length === 0 && <p>Nenhuma rota atribuída.</p>}
      {rotas.data?.map((rota) => (
        <section key={rota.id} className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h2 className="font-display text-lg">{rota.status === "concluida" ? "Rota concluída" : rota.status === "em_rota" ? "Em rota" : "Preparando saída"}</h2>
          {rota.status === "preparando" && (
            <><p>{rota.liberada_central_em ? "Saída liberada pela Central." : "Aguardando liberação da Central."}</p>
            <Button disabled={ocupado || !rota.liberada_central_em || rota.pedidos.length === 0 || rota.pedidos.some((p) => !p.retirada_em)} onClick={() => void operar("iniciar_rota",{p_rota_id:rota.id},"Rota iniciada.")}>Iniciar rota</Button></>
          )}
          {rota.pedidos.map((p) => (
            <article key={p.id} className="space-y-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2"><strong>Pedido {p.numero} · {p.cliente_nome}</strong><StatusBadge status={p.status} /></div>
              <p>{[p.endereco,p.complemento,p.bairro].filter(Boolean).join(" · ")}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" asChild>
                  <a href={rotaGoogleMaps([p.endereco,p.bairro].join(", "))} target="_blank" rel="noreferrer">Navegar</a>
                </Button>
                {p.status === "aguardando_motoboy" && <Button size="sm" disabled={ocupado} onClick={() =>
                  void operar("confirmar_retirada",{p_pedido_id:p.id},"Retirada confirmada.")}>Confirmar retirada</Button>}
                {p.status === "em_rota" && <Button size="sm" disabled={ocupado} onClick={() =>
                  void operar("confirmar_entrega",{p_pedido_id:p.id},"Entrega confirmada.")}>Confirmar entrega</Button>}
              </div>
              {["aguardando_motoboy","em_rota"].includes(p.status) && (
                <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => {
                  e.preventDefault();
                  const dados = new FormData(e.currentTarget);
                  void operar("registrar_atraso_entrega",{
                    p_pedido:p.id,
                    p_motivo:String(dados.get("motivo") ?? ""),
                    p_descricao:String(dados.get("descricao") ?? ""),
                  },"Atraso registrado.");
                }}>
                  <label>Motivo do atraso<select name="motivo" className="block rounded border bg-background px-2 py-1">
                    {MOTIVO_ATRASO.map((m) => <option key={m} value={m}>{MOTIVO_ATRASO_LABEL[m]}</option>)}
                  </select></label>
                  <label>Observação<input name="descricao" maxLength={240} className="block rounded border bg-background px-2 py-1" /></label>
                  <Button type="submit" size="sm" variant="outline" disabled={ocupado}>Registrar atraso</Button>
                </form>
              )}
            </article>
          ))}
          {rota.status === "em_rota" && rota.pedidos.some((p) => p.status === "em_rota") && (
            <ColetaLocalizacaoRota key={`${user?.id}:${rota.id}`} rota={rota.id} registrar={async (amostra) => {
              const {data,error} = await supabase.rpc("registrar_localizacao_rota",amostra);
              return !error && ["registrado","ignorado"].includes(data?.status);
            }} />
          )}
          {rota.status === "em_rota" && rota.pedidos.length > 0 && rota.pedidos.every((p) => ["entregue","cancelado"].includes(p.status)) && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={ocupado} onClick={() => void operar("informar_retorno_loja",{p_rota_id:rota.id},"Retorno informado.")}>Retornando à base</Button>
              <Button disabled={ocupado} onClick={() => void operar("confirmar_chegada_loja",{p_rota_id:rota.id},"Chegada confirmada.")}>Cheguei à base</Button>
            </div>
          )}
          {rota.status === "concluida" && <p>Solicite o acerto desta rota pelo App Motoboy.</p>}
        </section>
      ))}
    </div>
  );
}
