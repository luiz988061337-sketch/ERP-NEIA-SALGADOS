import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRoles, useSession } from "@/lib/session";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { PageHeader } from "@/components/admin/ui-admin";
import { DEFAULT_CRM_SETTINGS, useCrmSettings, type CrmSettings } from "@/lib/crm";

export const Route = createFileRoute("/crm-config")({
  head: () => ({ meta: [{ title: "Configurações CRM — Néia Salgados" }] }),
  component: CrmConfig,
});

function CrmConfig() {
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const { data: roles } = useRoles(user?.id);
  const isAdmin = roles?.includes("admin");
  const { data: settings, refetch } = useCrmSettings();
  const [form, setForm] = useState<CrmSettings>(DEFAULT_CRM_SETTINGS);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!loading && !user)
      navigate({ to: "/auth", search: { redirect: "/crm-config" }, replace: true });
  }, [loading, user, navigate]);
  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  if (roles && !isAdmin)
    return <p className="p-10 text-center">Acesso restrito ao administrador.</p>;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      const payload = {
        id: true,
        ativo_ate_dias: Number(form.ativo_ate_dias),
        risco_apos_dias: Number(form.risco_apos_dias),
        inativo_apos_dias: Number(form.inativo_apos_dias),
        muito_inativo_apos_dias: Number(form.muito_inativo_apos_dias),
        intervalo_min_campanhas_dias: Number(form.intervalo_min_campanhas_dias),
        campanhas_habilitadas: Boolean(form.campanhas_habilitadas),
        mensagem_padrao: String(form.mensagem_padrao).slice(0, 1000),
        vip_min_pedidos: Number(form.vip_min_pedidos),
        vip_min_valor: Number(form.vip_min_valor),
        freq_min_pedidos: Number(form.freq_min_pedidos),
        sugestoes_ativas: Boolean(form.sugestoes_ativas),
        recompra_ativa: Boolean(form.recompra_ativa),
        carrinho_recuperacao_ativa: Boolean(form.carrinho_recuperacao_ativa),
        fid_ativo: Boolean(form.fid_ativo),
        fid_reais_por_ponto: Number(form.fid_reais_por_ponto),
        fid_meta_pontos: Number(form.fid_meta_pontos),
        fid_recompensa_valor: Number(form.fid_recompensa_valor),
      };
      const { error } = await supabase.from("crm_settings").upsert(payload, { onConflict: "id" });
      if (error) {
        if (String(error.message ?? "").includes("column")) {
          const {
            vip_min_pedidos: _v1,
            vip_min_valor: _v2,
            freq_min_pedidos: _f,
            sugestoes_ativas: _s,
            recompra_ativa: _r,
            carrinho_recuperacao_ativa: _c,
            fid_ativo: _f1,
            fid_reais_por_ponto: _f2,
            fid_meta_pontos: _f3,
            fid_recompensa_valor: _f4,
            ...legacy
          } = payload;
          const retry = await supabase.from("crm_settings").upsert(legacy, { onConflict: "id" });
          if (retry.error) throw retry.error;
          toast.success("Salvo sem campos novos — rode as migrações 0004/0014 no Supabase.");
          refetch();
          return;
        }
        throw error;
      }
      toast.success("Configurações do CRM salvas!");
      refetch();
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível salvar. Rode a migração 0001 (crm_settings) no Supabase.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <AdminTopbar
        usuario={user?.email ?? null}
        onSair={async () => {
          await supabase.auth.signOut();
          navigate({ to: "/auth", replace: true });
        }}
      />
      <div className="mx-auto max-w-2xl px-4 py-8">
        <PageHeader
          titulo="Configurações → CRM"
          descricao="Períodos de classificação, intervalo anti-spam e mensagem padrão. A trava de intervalo bloqueia clientes que receberam campanha há menos de X dias."
        />
        <form
          onSubmit={salvar}
          className="mt-4 space-y-4 rounded-xl border border-border bg-card p-5"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Ativo até (dias)</Label>
              <Input
                type="number"
                min={1}
                value={form.ativo_ate_dias}
                onChange={(e) => setForm({ ...form, ativo_ate_dias: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Em risco após (dias)</Label>
              <Input
                type="number"
                min={1}
                value={form.risco_apos_dias}
                onChange={(e) => setForm({ ...form, risco_apos_dias: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Inativo após (dias)</Label>
              <Input
                type="number"
                min={1}
                value={form.inativo_apos_dias}
                onChange={(e) => setForm({ ...form, inativo_apos_dias: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Muito inativo após (dias)</Label>
              <Input
                type="number"
                min={1}
                value={form.muito_inativo_apos_dias}
                onChange={(e) =>
                  setForm({ ...form, muito_inativo_apos_dias: Number(e.target.value) })
                }
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Intervalo mínimo entre campanhas p/ mesmo cliente (dias)</Label>
            <Input
              type="number"
              min={1}
              max={90}
              value={form.intervalo_min_campanhas_dias}
              onChange={(e) =>
                setForm({ ...form, intervalo_min_campanhas_dias: Number(e.target.value) })
              }
            />
            <p className="text-xs text-muted-foreground">
              Ex.: 7 = não enviar mais de 1 campanha promocional a cada 7 dias.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.campanhas_habilitadas}
              onChange={(e) => setForm({ ...form, campanhas_habilitadas: e.target.checked })}
            />
            Habilitar campanhas
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>VIP: mín. pedidos (0=off)</Label>
              <Input
                type="number"
                min={0}
                value={form.vip_min_pedidos}
                onChange={(e) => setForm({ ...form, vip_min_pedidos: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>VIP: valor total (R$)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.vip_min_valor}
                onChange={(e) => setForm({ ...form, vip_min_valor: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Frequente: mín. pedidos</Label>
              <Input
                type="number"
                min={1}
                value={form.freq_min_pedidos}
                onChange={(e) => setForm({ ...form, freq_min_pedidos: Number(e.target.value) })}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.sugestoes_ativas}
              onChange={(e) => setForm({ ...form, sugestoes_ativas: e.target.checked })}
            />
            Sugestões inteligentes no carrinho (dados reais)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.recompra_ativa}
              onChange={(e) => setForm({ ...form, recompra_ativa: e.target.checked })}
            />
            Previsão de recompra no CRM (estimativa)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.carrinho_recuperacao_ativa}
              onChange={(e) => setForm({ ...form, carrinho_recuperacao_ativa: e.target.checked })}
            />
            Registrar carrinho para recuperação (respeita opt-out)
          </label>
          <div className="space-y-1.5 rounded-lg border border-border p-3">
            <Label className="font-semibold">Fidelidade</Label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.fid_ativo}
                onChange={(e) => setForm({ ...form, fid_ativo: e.target.checked })}
              />
              Programa ativo
            </label>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>R$ por ponto</Label>
                <Input
                  type="number"
                  min={1}
                  step="0.01"
                  value={form.fid_reais_por_ponto}
                  onChange={(e) =>
                    setForm({ ...form, fid_reais_por_ponto: Number(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Meta (pontos)</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.fid_meta_pontos}
                  onChange={(e) => setForm({ ...form, fid_meta_pontos: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Recompensa (R$, máx. 100)</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  step="0.01"
                  value={form.fid_recompensa_valor}
                  onChange={(e) =>
                    setForm({ ...form, fid_recompensa_valor: Number(e.target.value) })
                  }
                />
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Mensagem padrão</Label>
            <Textarea
              value={form.mensagem_padrao}
              onChange={(e) => setForm({ ...form, mensagem_padrao: e.target.value })}
              rows={4}
              maxLength={1000}
            />
          </div>
          <Button type="submit" disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar configurações"}
          </Button>
        </form>
      </div>
    </>
  );
}
