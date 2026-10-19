# Baseline, replay e reparos das migrations 0000–0096

## Método

Replay integral em PostgreSQL 16.4 nativo, banco descartável `homolog_p0`
(porta 55435), migrations ordenadas lexicalmente pelo nome do arquivo, cada
instrução em autocommit (necessário porque a 0003 adiciona valores a
`app_role` e os usa no mesmo arquivo). Resultado:

- **91/98 arquivos** sem falha;
- **7 arquivos** com falha: `0001_migration.sql`, `0002_secure_loyalty_and_partners.sql`,
  `0038_cardapio_sabores.sql`, `0058_gerar_cupom_apos_itens.sql`,
  `0061_gerar_cupons_pagos.sql`, `0062_trigger_pagamento_confirmado.sql`,
  `0063_corrigir_fluxo_impressao_pix.sql`;
- **33 instruções** falharam no total (5 + 3 + 13 + 3 + 2 + 2 + 5).

Evidência: `C:\Users\User\pgtest\apply-pg16-results.json`.

## Achado prévio: prefixos numéricos duplicados

Existem dois arquivos `0001_*` e dois `0002_*`:

- `0001_migration.sql` (patch tardio de segurança, 7 instruções);
- `0001_neia_tipos_crm.sql` (migration inicial real);
- `0002_itens_rls.sql` (RLS de itens, 2 instruções, passa);
- `0002_secure_loyalty_and_partners.sql` (patch tardio, 22 instruções).

A ordenação lexical executa os patches tardios **antes** das tabelas/funções
que eles referenciam. Isso não é um erro de sintaxe: é uma **ordem de
histórico inconsistente**. Um ambiente novo não pode ser reconstruído por
replay linear confiável sem tratar esses arquivos.

## Classificação por arquivo

| Arquivo | Falha | Causa | Estado final | Decisão |
|---|---|---|---|---|
| `0001_migration.sql` | 5 | `ALTER FUNCTION` de `liberar/reservar` antes da 0088; policies/view/GRANT de `parceiros` antes da 0028 | funções existem com `search_path=public`; policies de `parceiros` foram substituídas pela 0028 e não pelas endurecidas | **Não editar**. Excluir do replay novo ou aplicar equivalente depois de 0028/0088. Reparo: `0096`. |
| `0002_secure_loyalty_and_partners.sql` | 3 | mesmas funções futuras; `CREATE POLICY` em `parceiros` antes da tabela | a policy `parceiros candidatura` não existe; a `0028` deixou `parceiros read/write` permissivas | **Não editar**. Mesmo tratamento da 0001. |
| `0038_cardapio_sabores.sql` | 13 | 13 inserts com `categoria_id` hardcoded (`aaefb477-…`, `e08980d5-…`) e FK para categoria inexistente | produtos não são inseridos | **Não editar**. Em ambiente novo, semear categorias canônicas ou aplicar seed separado; em produção, confirmar os IDs. |
| `0058_gerar_cupom_apos_itens.sql` | 3 | `PERFORM PERFORM`; `CREATE OR REPLACE TRIGGER` inválido; `EXECUTE FUNCTION` sem `()`; função de trigger chamada fora de contexto | 0073/0077 instalam `trg_gerar_cupom_apos_itens`/`trg_pagamento_confirmado` funcionais | **Não editar**. Manter falha documentada; estado final reparado pela 0073/0077. |
| `0061_gerar_cupons_pagos.sql` | 2 | função sem `LANGUAGE`; variáveis não declaradas; `GRANT` em função inexistente | 0073/0077 instalam `gerar_cupons_pedidos_pagos()` | **Não editar**. Idem. |
| `0062_trigger_pagamento_confirmado.sql` | 2 | trigger com sintaxe inválida; `COMMENT ON TRIGGER` em objeto inexistente | 0077 instala o trigger final | **Não editar**. Idem. |
| `0063_corrigir_fluxo_impressao_pix.sql` | 5 | repete trigger inválido; função 0061 sem `LANGUAGE`; comentários/GRANT em objetos inexistentes | 0073/0077 instalam as versões finais | **Não editar**. Idem. |

### Evidência do estado final de impressão (PG16)

- `trigger_gerar_cupom_apos_itens` em `pedido_itens`, `AFTER INSERT`,
  `REFERENCING NEW TABLE AS new_itens`, função `trg_gerar_cupom_apos_itens()`;
- `trigger_pagamento_confirmado` em `pedidos`, `AFTER UPDATE` quando
  `pagamento_status` muda para `pago`, função `trg_pagamento_confirmado()`;
- `gerar_cupons_pedidos_pagos()` existe com `search_path=public`.

## Reparo de `parceiros` (0096)

A 0028 deixou no estado final:

- `parceiros read` `SELECT` para `public` com `USING (true)`;
- `parceiros write` `ALL` para `public` com `WITH CHECK (true)`;
- `anon` sem `INSERT`, embora o formulário público de `/parceiros` tente
  inserir candidatura sem login.

Impacto: leitura pública de e-mail/CNPJ/proposta e escrita ampla para
qualquer `authenticated`; o formulário público falha. A 0096:

- remove as duas policies permissivas;
- cria `parceiros admin read` (somente admin);
- cria `parceiros candidatura` (INSERT `anon,authenticated`, apenas
  `status='nova'` e limites de texto);
- cria `parceiros admin write` (ALL somente admin);
- concede `INSERT` a `anon/authenticated` e revoga `SELECT` direto de `anon`;
- mantém a leitura pública pela view `parceiros_publicos` (0065).

Teste local no PG16: `anon` insere candidatura sem `RETURNING` (OK), tentativa
com `status='aprovada'` falha por RLS (OK), `anon` não lê a tabela direta
(42501), mas lê a view. Em transação com um parceiro `aprovada`, cliente viu
0 linhas e admin viu 1 (RLS por papel). Nenhum grant para `service_role`.

> Observação: `RETURNING` exige `SELECT`; o app usa `.insert()` sem
> `.select()`. Se o formulário passar a usar `RETURNING`, será necessário
> conceder `SELECT` apenas nas colunas retornadas ou usar RPC.

## Recomendação para ambiente novo

1. **Preferir snapshot canônico** (`pg_dump --schema-only`) do ambiente
   autorizado, não replay linear de 0000–0095.
2. Se o replay for inevitável, usar manifesto com:
   - exclusão de `0001_migration.sql` e `0002_secure_loyalty_and_partners.sql`
     (substituídos por `0096` depois de 0028/0065/0095);
   - seed explícito de categorias antes da `0038`, ou exclusão da `0038` e
     seed de catálogo separado;
   - manutenção de `0058/0061/0062/0063` com falhas conhecidas e aplicação de
     `0073/0077`, seguidas de verificação do estado final — ou, melhor,
     snapshot.
3. Aplicar `0096` **depois** de `0028`, `0065` e `0095`.
4. Antes do cutover, comparar `supabase_migrations.schema_migrations` do
   ambiente real com os arquivos locais; os prefixos duplicados precisam ser
   resolvidos no histórico, não apenas no filesystem.
5. Não reescrever migrations já aplicadas. Correções entram como migrations
   novas e explícitas.

## Addendum (2026-10-19) — baseline escolhida e validada

A estratégia escolhida foi **snapshot canônico + migrations incrementais**, sem
editar migrations aplicadas:

- `docs/auditoria/homologacao-staging/baseline/baseline-0086.full.sql` —
  snapshot de homologação no estado **pré-0087** (schema + seeds/config),
  SHA-256 `4edddff00c3f488e9b715efc0abe38cafe966b688b2eb06bf34736353c2bc10a`;
- `docs/auditoria/homologacao-staging/baseline/MANIFEST.json` — hashes das
  migrations 0087–0098 e resultados;
- `scripts/baseline/apply-baseline.ps1` — recria banco, restaura o snapshot e
  aplica 0087–0098 em ordem.

Teste real: banco vazio → restaura snapshot → aplica 0087–0098. Resultado:
`suite-pg16` **189/189**, `combo-pg16` **64/64**,
`quarantine-proof-pg16` **17/17**, `concurrency-pg16` **12/12**.

Isso elimina a dependência do replay linear problemático de 0000–0086. Para o
cutover, o snapshot de homologação deve ser substituído por um dump read-only
do banco real congelado, mantendo o mesmo manifesto. Não aplicar 0087–0098 duas
vezes no banco de produção.

## Limite desta análise

O replay local prova o comportamento do **schema derivado**, não o histórico
real do Supabase. Nenhuma migration foi aplicada em produção.
