import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MapPin, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { logAdmin } from "@/lib/operacao";
import { useConfigEntrega, type ConfigEntrega } from "@/lib/config-entrega";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { MapaPinAjustavel } from "@/components/map-view";
import type { EnderecoDetalhado } from "@/components/map-view";

/**
 * Configurações → Entregas (0103): origem georreferenciada da loja (a taxa
 * por km usa ESTA coordenada oficial), valor por km e regras comerciais
 * (mínima, distância máxima, entrega grátis, aceitar entregas, ajuste manual).
 * Escrita somente admin (RLS em config_entrega).
 */
export function EntregasConfigPanel() {
  const queryClient = useQueryClient();
  const { data: cfg } = useConfigEntrega();
  const [form, setForm] = useState<ConfigEntrega | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [origemPin, setOrigemPin] = useState<{ lat: number; lng: number } | null>(null);
  const [mapaOrigem, setMapaOrigem] = useState(false);

  useEffect(() => {
    if (cfg && !form) {
      setForm({ ...cfg });
      if (cfg.origem_lat != null && cfg.origem_lng != null) {
        setOrigemPin({ lat: cfg.origem_lat, lng: cfg.origem_lng });
        setMapaOrigem(true);
      }
    }
  }, [cfg, form]);

  if (!form) {
    return <p className="text-sm text-neutral-500">Carregando configurações de entrega…</p>;
  }

  const upd = (patch: Partial<ConfigEntrega>) => setForm({ ...(form as ConfigEntrega), ...patch });

  function aoEscolherOrigem(d: EnderecoDetalhado) {
    upd({
      origem_logradouro: d.logradouro,
      origem_numero: d.numero,
      origem_complemento: (form as ConfigEntrega).origem_complemento,
      origem_bairro: d.bairro,
      origem_cidade: d.cidade,
      origem_uf: d.uf,
      origem_cep: d.cep,
      origem_lat: d.lat,
      origem_lng: d.lng,
      origem_place_id: d.placeId,
    });
    setOrigemPin({ lat: d.lat, lng: d.lng });
    setMapaOrigem(true);
    toast.success(
      d.nivel === "preciso"
        ? "Endereço da loja localizado com precisão."
        : "LOCALIZAÇÃO APROXIMADA — ajuste o pin no mapa e informe o número.",
    );
  }

  async function salvar() {
    if (!form) return;
    setSalvando(true);
    const patch: Record<string, unknown> = {
      aceitar_entregas: form.aceitar_entregas,
      valor_por_km: form.valor_por_km,
      taxa_minima_ativa: form.taxa_minima_ativa,
      taxa_minima: form.taxa_minima,
      distancia_max_ativa: form.distancia_max_ativa,
      distancia_max_km: form.distancia_max_km,
      gratis_ativa: form.gratis_ativa,
      gratis_acima: form.gratis_acima,
      ajuste_manual: form.ajuste_manual,
      origem_nome: form.origem_nome,
      origem_logradouro: form.origem_logradouro,
      origem_numero: form.origem_numero,
      origem_complemento: form.origem_complemento,
      origem_bairro: form.origem_bairro,
      origem_cidade: form.origem_cidade,
      origem_uf: form.origem_uf,
      origem_cep: form.origem_cep,
      origem_lat: origemPin?.lat ?? form.origem_lat,
      origem_lng: origemPin?.lng ?? form.origem_lng,
      origem_place_id: form.origem_place_id,
      atualizado_em: new Date().toISOString(),
    };
    const { error } = await supabase.from("config_entrega").update(patch).eq("id", true);
    setSalvando(false);
    if (error) {
      toast.error("Não foi possível salvar: " + error.message);
      return;
    }
    toast.success("Configurações de entrega salvas. Vale para NOVOS pedidos.");
    void logAdmin(
      "config_entrega",
      `valor/km ${form.valor_por_km} • aceitar ${form.aceitar_entregas} • origem ${
        origemPin ? "georreferenciada" : "não configurada"
      }`,
    );
    queryClient.invalidateQueries({ queryKey: ["config-entrega"] });
  }

  const porKmAtivo = origemPin != null || (form.origem_lat != null && form.origem_lng != null);

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-lg">Origem da loja (ponto de partida da rota)</h3>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              porKmAtivo
                ? "bg-green-100 text-green-800"
                : "bg-amber-100 text-amber-800"
            }`}
          >
            {porKmAtivo ? "Taxa por km ATIVA" : "Origem não configurada — taxa padrão"}
          </span>
        </div>
        <p className="text-xs text-neutral-500">
          Sem origem georreferenciada a cobrança usa o padrão atual (R$ 6). Configure a origem
          para ativar a taxa por km — nunca são inventadas coordenadas.
        </p>
        <div className="space-y-1.5">
          <Label>Buscar endereço da loja</Label>
          <AddressAutocomplete
            aoSelecionar={aoEscolherOrigem}
            placeholder="Rua, número, cidade…"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="origem_nome">Nome da unidade</Label>
            <Input
              id="origem_nome"
              value={form.origem_nome}
              onChange={(e) => upd({ origem_nome: e.target.value })}
              placeholder="Cozinha Néia — Matriz"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="origem_logradouro">Logradouro</Label>
            <Input
              id="origem_logradouro"
              value={form.origem_logradouro}
              onChange={(e) => upd({ origem_logradouro: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="origem_numero">Número</Label>
            <Input
              id="origem_numero"
              value={form.origem_numero}
              onChange={(e) => upd({ origem_numero: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="origem_complemento">Complemento</Label>
            <Input
              id="origem_complemento"
              value={form.origem_complemento}
              onChange={(e) => upd({ origem_complemento: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="origem_bairro">Bairro</Label>
            <Input
              id="origem_bairro"
              value={form.origem_bairro}
              onChange={(e) => upd({ origem_bairro: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="origem_cidade">Cidade</Label>
              <Input
                id="origem_cidade"
                value={form.origem_cidade}
                onChange={(e) => upd({ origem_cidade: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="origem_uf">UF</Label>
              <Input
                id="origem_uf"
                value={form.origem_uf}
                onChange={(e) => upd({ origem_uf: e.target.value })}
                maxLength={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="origem_cep">CEP</Label>
              <Input
                id="origem_cep"
                value={form.origem_cep}
                onChange={(e) => upd({ origem_cep: e.target.value })}
              />
            </div>
          </div>
        </div>
        {origemPin ? (
          <div className="space-y-1">
            <MapaPinAjustavel
              lat={origemPin.lat}
              lng={origemPin.lng}
              onChange={(lat, lng) => setOrigemPin({ lat, lng })}
            />
            <p className="text-xs text-neutral-500">
              Arraste o pin para o ponto exato (portão/cozinha). Coordenadas atuais:{" "}
              {origemPin.lat.toFixed(6)}, {origemPin.lng.toFixed(6)}
            </p>
          </div>
        ) : null}
      </section>

      <section className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5">
        <h3 className="font-display text-lg">Regras comerciais</h3>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 p-3">
          <div>
            <p className="font-semibold">Aceitar entregas</p>
            <p className="text-xs text-neutral-500">
              Desligado: o cliente só consegue retirada. Pedidos confirmados não mudam.
            </p>
          </div>
          <Switch
            checked={form.aceitar_entregas}
            onCheckedChange={(v) => upd({ aceitar_entregas: v })}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="valor_por_km">Valor por km (R$)</Label>
            <Input
              id="valor_por_km"
              type="number"
              step="0.01"
              min="0"
              value={form.valor_por_km}
              onChange={(e) => upd({ valor_por_km: Number(e.target.value) })}
            />
            <p className="text-xs text-neutral-500">
              Ex.: 2 km × {form.valor_por_km.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} ={" "}
              {(2 * form.valor_por_km).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.
              Mudança vale só para novos pedidos.
            </p>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 p-3">
            <div>
              <p className="font-semibold">Permitir ajuste manual da taxa</p>
              <p className="text-xs text-neutral-500">
                PDV/atendimento podem ajustar (com motivo quando zerar).
              </p>
            </div>
            <Switch checked={form.ajuste_manual} onCheckedChange={(v) => upd({ ajuste_manual: v })} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 rounded-lg border border-neutral-200 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">Taxa mínima</p>
              <Switch
                checked={form.taxa_minima_ativa}
                onCheckedChange={(v) => upd({ taxa_minima_ativa: v })}
              />
            </div>
            <Input
              type="number"
              step="0.01"
              min="0"
              disabled={!form.taxa_minima_ativa}
              value={form.taxa_minima}
              onChange={(e) => upd({ taxa_minima: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-2 rounded-lg border border-neutral-200 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">Distância máxima (km)</p>
              <Switch
                checked={form.distancia_max_ativa}
                onCheckedChange={(v) => upd({ distancia_max_ativa: v })}
              />
            </div>
            <Input
              type="number"
              step="0.1"
              min="0"
              disabled={!form.distancia_max_ativa}
              value={form.distancia_max_km}
              onChange={(e) => upd({ distancia_max_km: Number(e.target.value) })}
            />
            <p className="text-xs text-neutral-500">
              Fora da área: o cliente vê “endereço fora da nossa área de entrega”.
            </p>
          </div>
          <div className="space-y-2 rounded-lg border border-neutral-200 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">Entrega grátis acima de (R$)</p>
              <Switch checked={form.gratis_ativa} onCheckedChange={(v) => upd({ gratis_ativa: v })} />
            </div>
            <Input
              type="number"
              step="0.01"
              min="0"
              disabled={!form.gratis_ativa}
              value={form.gratis_acima}
              onChange={(e) => upd({ gratis_acima: Number(e.target.value) })}
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={() => void salvar()} disabled={salvando}>
            <Save className="mr-2 size-4" /> {salvando ? "Salvando…" : "Salvar configurações"}
          </Button>
        </div>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-5">
        <h3 className="font-display flex items-center gap-2 text-lg">
          <MapPin className="size-4" /> Como funciona a cobrança
        </h3>
        <ul className="mt-2 space-y-1 text-sm text-neutral-600">
          <li>• Origem da loja → rota real até o ponto confirmado pelo cliente.</li>
          <li>• taxa = distância × valor por km (arredondado para 2 casas).</li>
          <li>• O SERVIDOR recalcula e valida — cliente nunca define a taxa.</li>
          <li>• Falha na API de rota: nunca vira entrega grátis (usa linha reta validada).</li>
          <li>• Cada pedido guarda o snapshot da tarifa usada (mudança futura não altera o antigo).</li>
        </ul>
      </section>
    </div>
  );
}
