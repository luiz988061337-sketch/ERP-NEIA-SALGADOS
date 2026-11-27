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

function trecho(inicio, fim) {
  const a = migration.indexOf(inicio);
  const b = migration.indexOf(fim, a + 1);
  assert.ok(a >= 0, `início não encontrado: ${inicio}`);
  assert.ok(b > a, `fim não encontrado: ${fim}`);
  return migration.slice(a, b);
}

test("a chave canônica é a identidade e nenhum cadastro antigo é vinculado automaticamente", () => {
  assert.match(
    migration,
    /CREATE TABLE IF NOT EXISTS public\.sabores_estoque_vinculos \([\s\S]*?chave text NOT NULL REFERENCES public\.sabores_estoque\(chave\) ON DELETE CASCADE/,
  );
  assert.match(migration, /tipo text NOT NULL CHECK \(tipo IN \('unitario', 'embalagem'\)\)/);
  assert.match(migration, /fator_unidades integer NOT NULL CHECK/);
  assert.match(
    migration,
    /produto_id uuid NOT NULL REFERENCES public\.produtos\(id\) ON DELETE RESTRICT/,
  );
  assert.match(migration, /Nenhum vínculo é criado automaticamente/);
  assert.doesNotMatch(migration, /INSERT INTO public\.sabores_estoque_vinculos\s+SELECT/);
  assert.doesNotMatch(migration, /FROM public\.produtos\s+WHERE\s+saldo_legado/);
  assert.match(cadastro, /NULL::uuid/);
  assert.match(cadastro, /Vínculo preexistente preservado/);
});

test("as tabelas operacionais existentes passam a aceitar sabor sem estoque paralelo", () => {
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
  for (const tabela of [
    "public.lotes",
    "public.reservas_estoque",
    "public.estoque_movimentacoes",
    "public.reserva_consumos",
    "public.estoque_mov",
    "public.estoque_mov_operacoes",
  ]) {
    assert.ok(
      migration.includes(`ALTER TABLE ${tabela} ADD COLUMN IF NOT EXISTS sabor_chave`),
      `${tabela} precisa da coluna sabor_chave`,
    );
    assert.ok(
      migration.includes(`ALTER TABLE ${tabela} ALTER COLUMN produto_id DROP NOT NULL`),
      `${tabela} não pode exigir produto comercial`,
    );
  }
  assert.equal(
    (migration.match(/produto_id IS NOT NULL OR sabor_chave IS NOT NULL/g)?.length ?? 0),
    6,
  );
  assert.match(migration, /ALTER TABLE public\.sabores_estoque ADD COLUMN IF NOT EXISTS imagem_url/);
});

test("margem inicial, inventário e modo de ativação preservam a continuidade comercial", () => {
  assert.match(migration, /margem_seguranca integer NOT NULL DEFAULT 100/);
  assert.match(migration, /estoque_minimo integer NOT NULL DEFAULT 0/);
  assert.match(migration, /inventariado boolean NOT NULL DEFAULT false/);
  assert.match(migration, /SELECT chave, 100, 0, false FROM public\.sabores_estoque/);
  assert.match(migration, /id boolean DEFAULT true PRIMARY KEY CHECK \(id\)/);
  assert.match(
    migration,
    /modo text NOT NULL DEFAULT 'monitoramento'\s+CHECK \(modo IN \('monitoramento', 'validacao_assistida', 'controle_operacional'\)\)/,
  );
  assert.match(migration, /habilitado boolean NOT NULL DEFAULT false/);
  assert.match(migration, /protecoes_essenciais boolean NOT NULL DEFAULT true CHECK \(protecoes_essenciais\)/);
  assert.match(migration, /'"monitoramento"'::jsonb/);
});

test("a view canônica separa físico, vencidos, margem, bloqueios e compromissos", () => {
  assert.match(migration, /CREATE OR REPLACE VIEW public\.vw_saldos_sabores_estoque/);
  assert.match(migration, /validade >= \(now\(\) AT TIME ZONE 'America\/Sao_Paulo'\)::date/);
  assert.match(migration, /coalesce\(v\.total, 0\) AS vencidos/);
  assert.match(migration, /coalesce\(k\.total, 0\) AS compromissos_futuros/);
  assert.match(migration, /coalesce\(pd\.total, 0\) AS solicitacoes_pendentes/);
  assert.match(migration, /coalesce\(b\.ativo, false\) AS bloqueado_hoje/);
  assert.match(migration, /'margem_atingida'/);
  assert.match(migration, /'nao_inventariado'/);
  assert.match(migration, /coalesce\(c\.atualizado_em, u\.em, now\(\)\) AS atualizado_em/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.vw_saldos_sabores_estoque FROM PUBLIC, anon/);
  assert.match(migration, /GRANT SELECT ON TABLE public\.vw_saldos_sabores_estoque TO authenticated/);
  assert.match(migration, /WHERE public\.salgados_pode_consultar\(\);/);
  assert.match(
    migration,
    /q\.solicitado_por = auth\.uid\(\) OR public\.salgados_eh_responsavel\(\)/,
  );
  assert.match(migration, /CREATE POLICY salgados_solicitacoes_leitura/);
});

test("a consulta por data usa a mesma view e não cria segundo motor", () => {
  const consulta = trecho(
    "CREATE OR REPLACE FUNCTION public.consultar_estoque_dia_salgados",
    "CREATE OR REPLACE FUNCTION public.avaliar_venda_salgado",
  );
  assert.match(consulta, /FROM public\.vw_saldos_sabores_estoque v/);
  assert.match(consulta, /bloqueado_na_data/);
  assert.match(consulta, /compromissos_na_data/);
  assert.match(consulta, /disponivel_na_data/);
  assert.match(consulta, /pg_catalog/);
  assert.doesNotMatch(consulta, /CREATE TABLE/);
  assert.doesNotMatch(consulta, /INSERT INTO public\.lotes/);
});

test("permissões são aplicadas em RPC, RLS e papel funcional", () => {
  const helpers = trecho(
    "CREATE OR REPLACE FUNCTION public.salgados_pode_consultar()",
    "REVOKE ALL ON FUNCTION public.salgados_pode_consultar()",
  );
  assert.match(helpers, /LANGUAGE plpgsql/);
  assert.match(helpers, /'admin'::public\.app_role/);
  assert.match(helpers, /'atendente'::public\.app_role/);
  assert.match(helpers, /'caixa'::public\.app_role/);
  assert.doesNotMatch(helpers, /'motoboy'::public\.app_role/i);
  const responsavel = trecho(
    "CREATE OR REPLACE FUNCTION public.salgados_eh_responsavel()",
    "REVOKE ALL ON FUNCTION public.salgados_pode_consultar()",
  );
  assert.match(responsavel, /'producao'::public\.app_role/);
  assert.match(migration, /ALTER TYPE public\.app_role ADD VALUE 'caixa'/);
  assert.match(migration, /DO \$rls\$/);
  assert.match(
    migration,
    /CREATE POLICY salgados_operacao_leitura ON %s\s+FOR SELECT TO authenticated USING \(public\.salgados_pode_consultar\(\)\)/,
  );
});

test("solicitações, respostas, autorização de uso único e notificação têm contrato completo", () => {
  assert.match(
    migration,
    /tipo text NOT NULL CHECK \(tipo IN \('conferencia', 'liberacao_excepcional', 'agendamento_analise'\)\)/,
  );
  assert.match(migration, /notificacao_id uuid/);
  assert.match(migration, /solicitacao_id uuid NOT NULL UNIQUE/);
  assert.match(migration, /quantidade_liberada integer NOT NULL CHECK \(quantidade_liberada > 0\)/);
  assert.match(migration, /usada_em IS NULL AND expira_em > now\(\)/);
  assert.match(migration, /'salgados_resposta'/);
  assert.match(migration, /INSERT INTO public\.notificacoes \(tipo, titulo, detalhe, link, lida\)/);
  assert.match(migration, /'\/atendente'/);
  assert.doesNotMatch(migration, /central-entregas\?pedido/);
  assert.match(migration, /ack_por = v_ator, ack_em = now\(\)/);
  assert.match(migration, /ja_reconhecida/);
  assert.match(migration, /revalidacao_falhou/);
  assert.match(migration, /ja_utilizada/);
  assert.match(migration, /'ja_respondida'/);
  const resposta = trecho(
    "CREATE OR REPLACE FUNCTION public.responder_solicitacao_salgado",
    "CREATE OR REPLACE FUNCTION public.reconhecer_resposta_salgado",
  );
  assert.match(resposta, /public\.avaliar_venda_salgado\(/);
  assert.match(resposta, /quantidade_parcial_invalida/);
  assert.match(resposta, /validade_invalida/);
  assert.match(resposta, /liberacao_sem_cobertura_fisica/);
  const uso = trecho(
    "CREATE OR REPLACE FUNCTION public.usar_autorizacao_salgado",
    "-- 11. Bloqueio por sabor e data",
  );
  assert.match(uso, /revalidacao_falhou/);
  assert.match(uso, /fisico'\)::integer - \(v_avaliacao->>'reservado'\)::integer < p_quantidade/);
});

test("reserva, liberação, compromisso e movimentação são travados, idempotentes e auditáveis", () => {
  assert.match(migration, /pg_advisory_xact_lock/g);
  assert.match(migration, /SELECT \* INTO v_sabor FROM public\.sabores_estoque WHERE chave = p_sabor FOR UPDATE/);
  assert.match(migration, /RETURN 'ja_registrado'/);
  assert.match(migration, /'ja_registrado', 'reserva_id'/);
  assert.match(migration, /'ja_registrado', 'compromisso_id'/);
  assert.match(migration, /acao_idempotencia uuid NOT NULL/);
  assert.doesNotMatch(
    migration,
    /quantidade integer NOT NULL CHECK \(quantidade > 0\),\s+chave_idempotencia uuid NOT NULL UNIQUE,\s+created_at/,
    "uma entrada pode cobrir vários compromissos com a mesma ação",
  );
  assert.match(migration, /v_fisico < v_reservado/);
  assert.match(migration, /p_quantidade > v_lote\.restante/);
  assert.match(migration, /ORDER BY validade NULLS LAST, created_at, id/);
  assert.match(migration, /p_lote IS NULL OR id = p_lote/);
  assert.match(migration, /p_saldo_esperado IS NULL THEN/);
  assert.match(migration, /v_data > v_hoje THEN/);
  assert.match(migration, /Agendamento futuro: registrar como compromisso/);
  assert.match(migration, /estoque_mov_operacoes_quantidade_sabor/);
  assert.match(migration, /quantidade > 0 OR \(sabor_chave IS NOT NULL AND quantidade = 0\)/);
  assert.match(migration, /public\.registrar_consumo_reserva\(/);
  assert.match(migration, /INSERT INTO public\.estoque_mov_operacoes/);
  assert.match(migration, /INSERT INTO public\.admin_logs/g);

  const mov = trecho(
    "CREATE OR REPLACE FUNCTION public.movimentar_lote_salgado",
    "CREATE OR REPLACE FUNCTION public.vincular_sabor_estoque_produto",
  );
  const pedido = mov.indexOf("FROM public.pedidos WHERE id = v_reserva.pedido_id FOR UPDATE");
  const produto = mov.indexOf("FROM public.produtos WHERE id = p_produto FOR UPDATE");
  const reserva = mov.indexOf("FROM public.reservas_estoque WHERE id = p_reserva FOR UPDATE");
  assert.ok(pedido >= 0 && produto > pedido && reserva > produto, "ordem de locks pedido → produto → reserva");
});

test("ACL da 0129 não expõe helpers internos nem usa papéis amplos", () => {
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.movimentar_lote_salgado[\s\S]*?FROM PUBLIC, anon, service_role[\s\S]*?GRANT EXECUTE ON FUNCTION public\.movimentar_lote_salgado[\s\S]*?TO authenticated/,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.registrar_movimento_sabor[\s\S]*?FROM PUBLIC, anon, authenticated, service_role/,
  );
  assert.doesNotMatch(migration, /GRANT EXECUTE ON FUNCTION public\.registrar_movimento_sabor/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.cobrir_compromissos_salgados[\s\S]*?authenticated, service_role/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.salgados_pode_consultar\(\) FROM PUBLIC, anon/);
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
  assert.match(migration, /'20261126190000',\s*'vinculos_operacionais_salgados'/);
  assert.equal(migration.match(/\$mig\$/g)?.length, 2);
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

console.log("Estoque do dia: contrato local da migration 0129 validado estaticamente.");
