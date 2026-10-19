# Aplicação em produção — roteiro executável (você cola no SQL Editor)

> Ordem estrita. Pare em qualquer divergência. Backup antes do Bloco 2.

## Bloco 0 — backup + saneamento (leitura)
1. Dashboard → Database → Backups: confirme backup válido.
2. Rode o bloco 5 (4 contagens de saneamento): tudo deve dar 0.

## Bloco 1 — inspecionar policies e guard atuais
```sql
SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='pedidos' AND policyname IN ('pedidos update staff','pedidos motoboy claim');
SELECT pg_get_functiondef('public.pedidos_guard_update()'::regprocedure) LIKE '%motoboy_nao_pode_alterar_valores%' AS tem_bug_0074;
```
- Se `tem_bug_0074=true`: guard 0074 vigente (esperado) → segue.
- Anote quais policies existem.

## Bloco 2 — policies 0070 (SÓ policies, NUNCA a função guard do 0070)
Colar (de `drizzle/migrations/0070_motoboy_update_rls.sql`, linhas 32–51):
```sql
DROP POLICY IF EXISTS "pedidos update staff" ON public.pedidos;
CREATE POLICY "pedidos update staff" ON public.pedidos FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'producao')
  OR (public.has_role(auth.uid(),'motoboy') AND motoboy_id = auth.uid())
  OR (user_id = auth.uid() AND status = 'recebido')
);
DROP POLICY IF EXISTS "pedidos motoboy claim" ON public.pedidos;
CREATE POLICY "pedidos motoboy claim" ON public.pedidos FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(),'motoboy')
  AND motoboy_id IS NULL
  AND status IN ('pronto','aguardando_motoboy')
)
WITH CHECK (
  motoboy_id = auth.uid()
  AND status = 'aguardando_motoboy'
);
```
Pular este bloco SOMENTE se as duas policies já existirem idênticas.

## Bloco 3 — 0084 na íntegra
Colar todo o `drizzle/migrations/0084_etapas_operacionais.sql` → Run (OK esperado).

## Bloco 4 — verificação §A
12 colunas + 12 funções + 4 triggers + 3 índices (queries do roteiro E10.1-B).

## Bloco 5 — 0085 na íntegra
Colar todo o `drizzle/migrations/0085_guard_pedidos_correcao.sql` → Run.

## Bloco 6 — guard final
`tem_bug_0074=false`, `tem_allowlist_0070=true`, `tem_bypass=true`, freeze correto.

## Bloco 7 — smoke mínimo (dados E10B-, depois limpar §B8)
Aceite via RPC com JWT de admin → `ok`. Rollback se vermelho.

## Rollback (nesta ordem)
1. `DROP FUNCTION` das 12 RPCs + 4 triggers + 3 índices + policies novas.
2. Guard: reaplicar corpo anterior (texto guardado do Bloco 1).
3. Colunas: `DROP COLUMN IF EXISTS` (perde auditoria — último recurso).
4. Restore do backup se necessário.
