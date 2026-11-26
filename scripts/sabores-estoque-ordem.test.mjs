import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync("drizzle/migrations/0128_organizar_sabores_estoque.sql", "utf8");
const catalogo = readFileSync("src/lib/catalogo-sabores-estoque.ts", "utf8");
const painel = readFileSync("src/components/admin/estoque/salgados-admin.tsx", "utf8");
const organizador = readFileSync(
  "src/components/admin/estoque/salgados-organizador.tsx",
  "utf8",
);

test("a RPC persiste a ordem existente sem criar estrutura paralela", () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.reordenar_sabores_estoque/);
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /SET search_path = pg_catalog/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /SELECT array_agg\(chave ORDER BY ordem\)/);
  assert.match(sql, /UPDATE public\.sabores_estoque SET ordem = ordem \+ 1000/);
  assert.match(sql, /FOR v_indice IN 1\.\.v_total LOOP/);
  assert.doesNotMatch(sql, /CREATE TABLE[^\n]*ordem/i);
  assert.doesNotMatch(sql, /GRANT UPDATE[^\n]*sabores_estoque/i);
});

test("a RPC exige administrador, lida com colisões e audita o responsável", () => {
  assert.match(sql, /public\.has_role\(v_ator, 'admin'\)/);
  assert.match(sql, /status', 'chaves_duplicadas/);
  assert.match(sql, /status', 'chaves_invalidas/);
  assert.match(sql, /status', 'permissao_negada/);
  assert.match(sql, /INSERT INTO public\.admin_logs \(actor, acao, detalhe\)/);
  assert.match(sql, /sabores_estoque_ordem_alterada/);
  assert.match(sql, /sabores_estoque_ordem_restaurada/);
  assert.match(sql, /'anterior', v_anterior/);
  assert.match(sql, /'posterior', v_posterior/);
});

test("o acesso à RPC é restrito e o histórico da migration é registrado", () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.reordenar_sabores_estoque\(text\[\], text\) FROM PUBLIC, anon/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.reordenar_sabores_estoque\(text\[\], text\) TO authenticated/);
  assert.match(sql, /supabase_migrations\.schema_migrations/);
  assert.match(sql, /20261126170000.*organizar_sabores_estoque/s);
});

test("o painel lê e aplica a ordem persistida", () => {
  assert.match(catalogo, /export function ordenarSaboresPorOrdem/);
  assert.match(catalogo, /ordens\?: readonly OrdemSaborEstoque\[\] \| null/);
  assert.match(painel, /select\("chave, ordem, produto_id"\)/);
  assert.match(painel, /data\?\.ordens \?\? \[\]/);
  assert.match(painel, /supabase\.rpc\("reordenar_sabores_estoque"/);
  assert.match(painel, /Organizar sabores/);
  assert.match(painel, /organizando && admin/);
});

test("a janela oferece categoria, posição, arrastar, subir/descer e confirmação", () => {
  assert.match(organizador, /categoriasSaboresEstoque\.map/);
  assert.match(organizador, /data-ordem=\{posicoes\.get\(chave\)\}/);
  assert.match(organizador, /draggable=\{!ocupado\}/);
  assert.match(organizador, /onDragStart/);
  assert.match(organizador, /onDrop=\{\(evento\) => soltar\(evento, indice\)\}/);
  assert.match(organizador, /aria-label={`Subir \$\{sabor\.nome\}`}/);
  assert.match(organizador, /aria-label={`Descer \$\{sabor\.nome\}`}/);
  assert.match(organizador, /Salvar sequência/);
  assert.match(organizador, /Cancelar/);
  assert.match(organizador, /Confirmar restauração/);
  assert.match(organizador, /inicial, "restaurar"/);
});
