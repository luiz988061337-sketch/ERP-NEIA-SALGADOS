# Organização da sequência dos sabores

Data: 26/11/2026

Autorização do proprietário: implementar a reordenação no Estoque de Salgados e aplicar em homologação a migration `0128` com a RPC e o `GRANT EXECUTE` necessários. A restauração deve voltar à sequência capturada quando a janela foi aberta.

## Escopo

- Botão dourado **Organizar sabores** no cabeçalho do painel, exibido somente para usuários com papel `admin`.
- Janela com seleção de categoria, lista numerada na sequência atual, arrastar/soltar, botões de subir/descer (também no celular), salvar, cancelar e restaurar com confirmação.
- A sequência é gravada no campo existente `public.sabores_estoque.ordem`. Nenhuma coluna ou tabela paralela foi criada.
- IDs, nomes, categorias, vínculos, saldos, lotes, movimentações, reservas e preços não são alterados.
- O cardápio público não é alterado nesta etapa. Relatórios, inventários e demais módulos poderão reutilizar a ordem pelo helper `ordenarSaboresPorOrdem` e pela consulta a `sabores_estoque.ordem`.

## Banco de dados

Migration: `drizzle/migrations/0128_organizar_sabores_estoque.sql`, SHA-256 `6409fdb26e9b5c8ba4dee8e6cbdcb435f4dba8ab4085382b1e0782761abfd133`.

A RPC `public.reordenar_sabores_estoque(p_chaves text[], p_acao text)`:

- é `SECURITY DEFINER` com `search_path = pg_catalog`;
- exige `public.has_role(auth.uid(), 'admin')`;
- usa `pg_advisory_xact_lock` para evitar corridas entre sessões administrativas;
- valida exatamente as 26 chaves oficiais, sem duplicatas;
- atualiza todas as posições em duas fases na mesma transação, deslocando as ordens para `1001..1026` antes de gravar `1..26`, para respeitar o `UNIQUE (ordem)` existente;
- grava `public.admin_logs` com `actor = auth.uid()`, `acao = sabores_estoque_ordem_alterada` ou `sabores_estoque_ordem_restaurada`, e `detalhe` JSON com `anterior` e `posterior`;
- retorna `sem_alteracao` quando a sequência recebida já é a atual, sem gerar log de mudança inexistente.

Permissões:

- `REVOKE ALL ... FROM PUBLIC, anon`;
- `GRANT EXECUTE ... TO authenticated`;
- nenhum `UPDATE` direto foi concedido em `sabores_estoque`; RLS e a policy de leitura permanecem como aprovadas.

Histórico: versão `20261126170000`, nome `organizar_sabores_estoque`, com uma entrada `statements` contendo o conteúdo integral aplicado.

## Aplicação em homologação

| Etapa | Resultado |
| --- | --- |
| Branch e worktree | `resgate-visual-h01-h07-codex`; `git fetch origin`, divergência `0 0` |
| Destino | `--project-ref lflzlcqinarrcgncafol`, validado por `npm run seguranca:destino` |
| `npm run teste:seguranca` | 31/31 |
| Simulação da migration | sem conexão de execução |
| Estado prévio | sem função e sem versão `0128`; 26 sabores, 31 produtos, hash `1eb0b745c8b247c0a1e8230a2f6636c7`, zero vínculos/lotes/movimentações/reservas |
| Aplicação | `npm run sql:homolog -- --arquivo drizzle/migrations/0128_organizar_sabores_estoque.sql --project-ref lflzlcqinarrcgncafol --confirmar` |
| Pós-aplicação | função presente; `execute_anon = false`; `execute_authenticated = true`; versão `0128` registrada; ordens e dados de negócio inalterados |

A aplicação foi feita em uma única transação. Nenhuma conexão de escrita foi feita com produção.

## Testes

- `npm run typecheck`: OK.
- `node --test scripts/sabores-estoque.test.mjs scripts/sabores-estoque-ordem.test.mjs`: 10/10.
- `npm run build:homolog` com `NITRO_PRESET=node-server`: 449 arquivos, 10 referências a homologação, zero a produção.
- `scripts/sabores-estoque-visual.mjs` com build isolado: 11 verificações, zero erros de página. As capturas aprovadas anteriormente não foram substituídas.
- Teste funcional em homologação: `scripts/testar-organizacao-sabores-homolog.sql`, executado em transação com `ROLLBACK`. Confirmou:
  - administrador salva e a sequência é persistida;
  - chaves duplicadas e inexistentes são recusadas;
  - restauração volta à sequência capturada;
  - sequência idêntica é tratada como `sem_alteracao`;
  - auditoria registra exatamente duas mudanças;
  - usuário autenticado sem papel `admin` recebe `permissao_negada`.
- Após o teste: ordens inalteradas, `logs_organizacao = 0`, 26 chaves/ordens únicas, 31 produtos preservados e zero lotes, movimentações, reservas e vínculos.

## Reversão

A reversão da estrutura, se autorizada, remove somente a RPC e o registro da versão `0128`:

```sql
BEGIN;
DROP FUNCTION IF EXISTS public.reordenar_sabores_estoque(text[], text);
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261126170000';
COMMIT;
```

Ela não apaga registros de `sabores_estoque`, não altera produtos e não reaplica histórico. A remoção depende de autorização específica e conferência de dependências.

## Publicação e pendências

| Item | Resultado |
| --- | --- |
| Commit publicado | `6cc0cacdef75ee9b51b85be94128de2562bcb658` |
| Checkpoint | `checkpoint-organizacao-sequencia-sabores-01` |
| Comando | `vercel deploy --yes --target preview`, sem `--prod`, com variáveis de homologação passadas explicitamente |
| Deployment | `dpl_B4hKmBtpke61FMfknMGXitu8M6ow` — `READY`, `target: preview` |
| URL própria | `https://erp-neia-salgados-mk3h653vx-luiz988061337-3147s-projects.vercel.app` |
| Alias oficial | <https://erp-neia-salgados-git-resga-dcaca5-luiz988061337-3147s-projects.vercel.app/admin#estoque-salgados>, reposicionado para o deployment acima e confirmado por `vercel inspect` |
| Bundle publicado | Chunk `admin-BhZNfGWE.js` com `Organizar sabores`, `reordenar_sabores_estoque` e `Confirmar restauração`; SHA-256 `922ec3ad4102a1ebc3c8336ba8dbf023ad3218805fd230d8e29805a4163df4b9`, idêntico no deployment e no alias |
| Ambiente | `index-DnPOabKs.js` contém `lflzlcqinarrcgncafol` e não contém `ruioyioynwwwiqbjznoa`; HTML servido sem “MODO DEMONSTRAÇÃO” |

Nenhum projeto, domínio ou endereço novo foi criado. A inspeção somente leitura de `https://erp-neia-salgados.vercel.app` confirmou que Production continuava no deployment `dpl_DK144zp5kG9FSsL4J5HdniQ34Ukk`, de 12/11/2026, sem promoção nesta etapa. Menu lateral, layout aprovado, capturas aprovadas e checkpoints anteriores foram preservados.

A conferência manual do proprietário permanece pendente para esta publicação. Vinculação comercial, movimentação por lote, relatórios, impressões e alteração no cardápio público continuam dependendo de etapas próprias.
