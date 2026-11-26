# Aplicação do cadastro oficial de 26 sabores em homologação

Data: 26/11/2026

Autorização: aplicação exclusiva dos 26 sabores oficiais no Supabase de homologação `lflzlcqinarrcgncafol`. Produção `ruioyioynwwwiqbjznoa` não foi acessada para escrita, promovida nem publicada.

## Destino e barreiras

| Verificação | Resultado |
| --- | --- |
| Branch e worktree | `resgate-visual-h01-h07-codex`, sincronizada com `origin` antes da escrita |
| Referência declarada | `--project-ref lflzlcqinarrcgncafol` em todas as operações remotas |
| Referência vinculada local | `supabase/.temp/project-ref` confere `lflzlcqinarrcgncafol` |
| `npm run seguranca:destino -- --project-ref lflzlcqinarrcgncafol` | OK: homologação, configuração coerente |
| `npm run teste:seguranca` | 31/31 |
| `npm run sql:homolog -- --arquivo scripts/cadastrar-sabores-estoque.sql --project-ref lflzlcqinarrcgncafol` | Simulação: nenhuma conexão de execução |
| `npm run typecheck` | OK |
| `node --test scripts/sabores-estoque.test.mjs` | 5/5, incluindo a proibição de vínculo automático no SQL |

O CLI do Supabase exige `--linked` como transporte quando se usa `--project-ref`. A autoridade do destino foi sempre o `--project-ref` explícito validado pela barreira P0; `--linked` sozinho, `.env` e variáveis herdadas não foram usados como autoridade.

## Backup e estado prévio

O `supabase db dump` depende de Docker, indisponível neste host. Foi registrado um backup equivalente em JSON somente leitura, com os 31 produtos e as 8 categorias, em `C:\Users\User\AppData\Local\Temp\opencode\backup-estoque-salgados-pre.json` (SHA-256 `fbf537c8bf1b77f17d71b13b2dcf6324a9543fdcec024f418b2b5c07125ba8d0`). Nenhum segredo foi incluído no arquivo versionado.

Estado conferido antes da escrita:

- `public.sabores_estoque`: inexistente (`to_regclass` nulo).
- `public.produtos`: 31; hash de ID/nome/tipo/unidade `1eb0b745c8b247c0a1e8230a2f6636c7`.
- `public.categorias`: 8.
- `public.lotes`, `public.estoque_movimentacoes`, `public.reservas_estoque`: zero registros.
- `Mini Enroladinho de Salsicha 20un`: ID `fcf21928-b16a-4e52-a06e-df6d89a9f33a`.
- Nenhuma policy em `sabores_estoque`.

## Aplicação

Comando executado:

```bash
npm run sql:homolog -- \
  --arquivo scripts/cadastrar-sabores-estoque.sql \
  --project-ref lflzlcqinarrcgncafol \
  --confirmar
```

O script roda em uma única transação (`BEGIN`/`COMMIT`). A versão aplicada foi ajustada para **não criar vínculo automático algum**: os 26 registros entram com `produto_id` nulo e `ON CONFLICT (chave) DO NOTHING` preserva eventuais vínculos preexistentes. O SHA-256 do SQL aplicado é `7d0372bb4b7223efd9c529c37c273fb1974d1f3fd348b901b5ce7de5539d14cd`.

Resultado retornado: 26 linhas com `acao = Registro criado`, `situacao = Sem vínculo automático` e `produto_id = null`. Nenhuma linha foi vinculada à embalagem `Mini Enroladinho de Salsicha 20un`.

## Verificação pós-aplicação

| Verificação | Resultado |
| --- | --- |
| Sabores registrados | 26 |
| Chaves, nomes e ordens únicos | 26 / 26 / 26 |
| Distribuição por categoria | Fritos 9, Mini Pastéis 4, Assados 8, Empadas 2, Mini Pizzas 3 |
| Ordens 25 e 26 | `trouxinha-calabresa`, `enroladinho-salsicha` |
| Registros com `produto_id` | 0 |
| Produtos comerciais | 31; hash inalterado `1eb0b745c8b247c0a1e8230a2f6636c7` |
| Lotes / movimentações / reservas | 0 / 0 / 0 |
| RLS em `public.sabores_estoque` | habilitado |
| GRANT para `authenticated` | `SELECT` |
| Policy | `sabores_estoque_leitura_equipe` |
| Role `authenticated` com JWT de usuário admin | 26 sabores visíveis |
| REST sem sessão (somente publishable key) | HTTP 401, nenhuma leitura anônima |

A leitura autenticada foi validada no banco com `SET LOCAL ROLE authenticated` e os JWT claims de um usuário com papel `admin`: `auth.uid()` reconhecido, `has_role(..., 'admin') = true` e 26 registros visíveis sob a policy. A chamada REST sem sessão foi negada com HTTP 401. A conferência com a sessão real do proprietário no navegador continua sendo a etapa manual final de homologação.

Não foram criados produtos comerciais, preços, custos, quantidades, saldos, lotes, reservas ou estoque mínimo. Nenhuma rotina de movimentação por lote, vinculação comercial, relatório ou impressão foi implementada nesta etapa.

## Reversão restrita

A reversão deleter somente as 26 chaves oficiais e não toca os 31 produtos comerciais:

```sql
BEGIN;
DELETE FROM public.sabores_estoque
WHERE chave IN (
  'coxinha-frango', 'bolinha-queijo', 'risoles-presunto-queijo', 'croquete',
  'bolinho-calabresa', 'bolinho-milho-queijo', 'bolinho-azeitona',
  'trouxinha-milho-catupiry', 'kibe', 'pastel-carne', 'pastel-queijo',
  'pastel-pizza', 'pastel-palmito', 'esfirra-carne', 'esfirra-frango',
  'esfirra-brocolis', 'enroladinho-presunto-queijo', 'hamburguinho',
  'ricota-zaatar', 'empada-palmito', 'empada-frango', 'pizza-calabresa',
  'pizza-queijo', 'pizza-presunto-queijo', 'trouxinha-calabresa',
  'enroladinho-salsicha'
);
COMMIT;
```

A remoção da tabela, policy e grants depende de autorização específica e conferência de dependências. A reversão não reaplica nem reescreve histórico de migração.

## Publicação

| Item | Resultado |
| --- | --- |
| Branch publicada | `resgate-visual-h01-h07-codex`, commit `9f18b364a2246b5b9d988e1c43c0172d2ea398c7` |
| Comando | `vercel deploy --yes --target preview`, sem `--prod`, com variáveis de homologação passadas explicitamente |
| Deployment | `dpl_24HZPn5hnmoorUJgjNuvzgmT4xkw` — `READY`, `target: preview` |
| URL própria | `https://erp-neia-salgados-2qr5mpwh3-luiz988061337-3147s-projects.vercel.app` |
| Alias oficial | <https://erp-neia-salgados-git-resga-dcaca5-luiz988061337-3147s-projects.vercel.app/admin#estoque-salgados>, reposicionado para o deployment acima e confirmado por `vercel inspect` |
| Proteção | `vercel_authentication` preservada |
| Build local | `npm run build:homolog` com `NITRO_PRESET=node-server`: 448 arquivos, 10 referências a homologação, zero a produção |
| Bundle publicado | Chunk `admin-cpGzjL-i.js` com `trouxinha-calabresa`, `enroladinho-salsicha` e `sabores_estoque`; SHA-256 `e46ff92d78c302c2a84cfecdecf59b8e770da7645bd6de7ea582511d9bd9703f`, idêntico no deployment e no alias |
| Ambiente publicado | `index-CtqhvWJx.js` contém `lflzlcqinarrcgncafol` e não contém `ruioyioynwwwiqbjznoa`; HTML servido sem “MODO DEMONSTRAÇÃO” |

O alias fixo permanece o mesmo endereço oficial; nenhum projeto, domínio ou endereço novo foi criado. A inspeção somente leitura de `https://erp-neia-salgados.vercel.app` confirmou que Production continuava no deployment `dpl_DK144zp5kG9FSsL4J5HdniQ34Ukk`, de 12/11/2026, sem promoção nesta etapa. Menu lateral, layout aprovado e checkpoints anteriores foram preservados.

Checkpoint desta etapa: tag anotada `checkpoint-cadastro-estoque-salgados-26-01`, sobre o commit `9f18b36`. A conferência manual do proprietário no alias oficial permanece a etapa final de homologação; nenhuma aprovação operacional adicional foi presumida.
