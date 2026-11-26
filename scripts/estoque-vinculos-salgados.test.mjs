import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(
  "drizzle/migrations/0129_vinculos_operacionais_salgados.sql",
  "utf8",
);
const painel = readFileSync("src/components/admin/estoque/salgados-admin.tsx", "utf8");
const historico = readFileSync("src/components/admin/estoque/salgados-historico.tsx", "utf8");
const tipos = readFileSync("src/integrations/supabase/types.ts", "utf8");
const cadastro = readFileSync("scripts/cadastrar-sabores-estoque.sql", "utf8");

test("a chave unitária do cadastro oficial é a identidade do estoque", () => {
  assert.match(
    migration,
    /CREATE TABLE IF NOT EXISTS public\.sabores_estoque_vinculos \([\s\S]*?chave text NOT NULL REFERENCES public\.sabores_estoque\(chave\) ON DELETE CASCADE/,
    "o vínculo aponta para a chave canônica, não para um novo ID de produto",
  );
  assert.match(migration, /tipo text NOT NULL CHECK \(tipo IN \('unitario', 'embalagem'\)\)/);
  assert.match(migration, /fator_unidades integer NOT NULL CHECK/);
  assert.match(
    migration,
    /produto_id uuid NOT NULL REFERENCES public\.produtos\(id\) ON DELETE RESTRICT/,
    "cadastros comerciais existentes são preservados",
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX IF NOT EXISTS sabores_vinculos_produto_ativo_idx[\s\S]*?WHERE ativo/,
    "um produto comercial não pode ficar ativo em dois sabores",
  );
  assert.match(migration, /Não contém preço, custo, saldo, lote ou quantidade física/);
  assert.ok(
    (migration.match(/SELECT 1 FROM public\.sabores_estoque_vinculos v/g)?.length ?? 0) >= 18,
    "backfills, view e RPC resolvem tanto o produto legado quanto o vínculo conferido",
  );
  assert.match(migration, /v\.chave = p_sabor AND v\.produto_id = r\.produto_id AND v\.ativo/g);
  assert.match(migration, /v\.chave = p_sabor AND v\.produto_id = v_reserva\.produto_id AND v\.ativo/g);
  assert.match(cadastro, /NULL::uuid/);
  assert.match(cadastro, /Vínculo preexistente preservado/);
});

test("a migration reaproveita as estruturas operacionais e não cria estoque paralelo", () => {
  assert.doesNotMatch(migration, /estoque_salgados_privado/);
  assert.doesNotMatch(migration, /lotes_operacoes/);
  for (const estrutura of [
    "public.lotes",
    "public.reservas_estoque",
    "public.reserva_consumos",
    "public.estoque_movimentacoes",
    "public.estoque_mov",
    "public.estoque_mov_operacoes",
    "public.admin_logs",
  ]) {
    assert.ok(migration.includes(estrutura), `${estrutura} deve ser reaproveitado`);
  }
  assert.match(migration, /ALTER TABLE public\.lotes ADD COLUMN IF NOT EXISTS sabor_chave/);
  assert.match(migration, /ALTER TABLE public\.reservas_estoque ADD COLUMN IF NOT EXISTS sabor_chave/);
  assert.match(migration, /ALTER TABLE public\.estoque_movimentacoes ADD COLUMN IF NOT EXISTS sabor_chave/);
  assert.match(migration, /ALTER TABLE public\.reserva_consumos ADD COLUMN IF NOT EXISTS sabor_chave/);
  assert.match(migration, /ALTER TABLE public\.estoque_mov ADD COLUMN IF NOT EXISTS sabor_chave/);
  assert.match(migration, /ALTER TABLE public\.estoque_mov_operacoes ADD COLUMN IF NOT EXISTS sabor_chave/);
  assert.match(migration, /produto_id IS NOT NULL OR sabor_chave IS NOT NULL/g);
});

test("a migration não inventa saldos, preços, custos nem destino remoto", () => {
  assert.doesNotMatch(migration, /UPDATE public\.produtos/);
  assert.doesNotMatch(migration, /produtos\.estoque/);
  assert.doesNotMatch(migration, /^\s{2}(preco|custo|valor_unitario)\s+\w+/im);
  assert.doesNotMatch(migration, /ruioyioynwwwiqbjznoa/);
  assert.doesNotMatch(migration, /VITE_DEMO_PREVIEW=1/);
  assert.match(migration, /lflzlcqinarrcgncafol/);
  assert.equal(migration.match(/^BEGIN;$/gm)?.length, 1);
  assert.equal(migration.match(/^COMMIT;$/gm)?.length, 1);
  assert.match(migration, /INSERT INTO supabase_migrations\.schema_migrations/);
  assert.match(migration, /'20261126190000', 'vinculos_operacionais_salgados'/);
  assert.equal(migration.match(/\$mig\$/g)?.length, 2);
});

test("a view expõe físico, reservado e disponível com a regra aprovada", () => {
  assert.match(migration, /CREATE OR REPLACE VIEW public\.vw_saldos_sabores_estoque/);
  assert.match(migration, /coalesce\(sum\(restante\) FILTER \(WHERE status = 'ativo'\), 0\)::bigint AS fisico/);
  assert.match(migration, /sum\(greatest\(r\.quantidade - coalesce\(c\.consumido, 0\), 0\)\)/);
  assert.match(migration, /coalesce\(l\.fisico, 0\) - coalesce\(r\.reservado, 0\)/);
  assert.match(migration, /status = 'vencido' OR \(validade IS NOT NULL AND validade </);
  assert.match(migration, /REVOKE ALL ON TABLE public\.vw_saldos_sabores_estoque FROM PUBLIC, anon/);
  assert.match(migration, /GRANT SELECT ON TABLE public\.vw_saldos_sabores_estoque TO authenticated/);
});

test("as RPCs de gravação são autorizadas, travadas, idempotentes e auditáveis", () => {
  assert.match(migration, /public\.has_role\(v_autor, 'admin'\)/);
  assert.match(migration, /public\.has_role\(v_autor, 'producao'\)/);
  assert.match(migration, /v_tipo = 'ajuste' AND NOT public\.has_role\(v_autor, 'admin'\)/);
  assert.match(migration, /pg_advisory_xact_lock/g);
  assert.match(migration, /SELECT \* INTO v_sabor FROM public\.sabores_estoque WHERE chave = p_sabor FOR UPDATE/);
  assert.equal(migration.match(/PERFORM 1 FROM public\.pedidos/g)?.length, 2);
  assert.doesNotMatch(migration, /PERFORM FROM public\.pedidos/);
  assert.match(migration, /SELECT \* INTO v_operacao FROM public\.estoque_mov_operacoes/);
  assert.match(migration, /RETURN 'ja_registrado'/);
  assert.match(migration, /v_lote\.restante IS DISTINCT FROM p_saldo_esperado/);
  assert.match(migration, /v_fisico - p_quantidade < v_reservado/);
  assert.match(migration, /p_quantidade > v_lote\.restante/);
  assert.match(migration, /ORDER BY validade NULLS LAST, created_at, id/);
  assert.match(migration, /validade >= v_hoje/);
  assert.match(migration, /public\.registrar_consumo_reserva\(/);
  assert.match(migration, /INSERT INTO public\.estoque_movimentacoes/g);
  assert.match(migration, /INSERT INTO public\.admin_logs/g);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.movimentar_lote_salgado[\s\S]*?FROM PUBLIC, anon, service_role[\s\S]*?GRANT EXECUTE ON FUNCTION public\.movimentar_lote_salgado[\s\S]*?TO authenticated/,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.registrar_movimento_sabor[\s\S]*?FROM PUBLIC, anon, authenticated, service_role/,
  );
  assert.doesNotMatch(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.registrar_movimento_sabor/,
    "helper interno não pode ser chamado diretamente pelo cliente",
  );
});

test("o painel aprovado continua usando as RPCs já integradas", () => {
  assert.match(painel, /rpc\("movimentar_lote_salgado"/);
  assert.match(painel, /rpc\("reservar_estoque_atomica"/);
  assert.match(painel, /rpc\("cancelar_pedido_atomico"/);
  assert.match(painel, /rpc\("reordenar_sabores_estoque"/);
  assert.doesNotMatch(painel, /estoque_salgados_privado/);
});

test("o painel opera pela chave canônica sem exigir produto comercial", () => {
  assert.match(painel, /from\("sabores_estoque_vinculos"\)/);
  assert.match(painel, /sabor_chave/);
  assert.match(painel, /operacoesPorChave/);
  assert.match(painel, /identidadeAtiva/);
  assert.match(painel, /p_produto: produto\?\.id \?\? null/);
  assert.match(painel, /p_sabor: chave/);
  assert.match(historico, /porChave/);
  assert.match(historico, /sabor_chave/);
  assert.match(historico, /\.filter\(Boolean\)/);
  assert.match(tipos, /p_produto: string \| null/);
  assert.doesNotMatch(tipos, /p_produto\?: string \| null/);
});

console.log("Vínculos operacionais: contrato local da migration 0129 validado estaticamente.");
