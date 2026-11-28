# Homologação da Fase 1 — Central da Atendente

Data: 28/11/2026. Destino exclusivo: Supabase `lflzlcqinarrcgncafol` e alias
fixo de homologação. Produção (`ruioyioynwwwiqbjznoa`) não foi modificada.

**Status:** Fase 1 implementada, migrada e publicada em homologação. Ainda
aguarda a validação manual do proprietário; não deve ser considerada
definitivamente aprovada antes dessa conferência.

## Integração e versionamento

| Item | Resultado |
| --- | --- |
| Branch de trabalho | `central-atendente-retomada-opencode` @ `412fc03` (tag local `checkpoint-central-fase1-forma-efetiva-local-01`) |
| Base da oficial antes da integração | `ba684a2`, limpa e igual a `origin/resgate-visual-h01-h07-codex` |
| Integração | `git merge --ff-only` na worktree `C:\Users\User\ERP-NEIA-RESGATE-WT`, sem conflitos e sem force push |
| Commit integrado | `412fc03` — `Implementa Fase 1 da Central: forma efetiva, ledger e guarda de edicao` |
| Sincronização | `git push origin resgate-visual-h01-h07-codex` confirmado; `origin` em `412fc03` |

## Migration 0142 em homologação

- Simulação executada primeiro com `npm run sql:homolog -- --arquivo
  drizzle/migrations/0142_forma_efetiva_pagamentos.sql --project-ref
  lflzlcqinarrcgncafol` (sem `--confirmar`): nada foi executado.
- Aplicação autorizada com o mesmo comando acrescido de `--confirmar`, após
  `npm run seguranca:destino -- --project-ref lflzlcqinarrcgncafol`. O primeiro
  teste da barreira bloqueou corretamente o terminal que herdava
  `VITE_SUPABASE_URL` de produção; a operação foi refeita com variáveis
  explícitas de homologação.
- Histórico reconciliado por
  `scripts/central-pg17/reconciliar-historico-0142.sql`, versão
  `20261128071000`, sem reaplicar DDL. As versões `20261127172951`,
  `20261127202230`, `20261127202504`, `20261127210000`, `20261127210001` e
  `20261127210002` permanecem inalteradas; `0137`/`0138` não foram presumidas.

Conferência pós-aplicação (`scripts/central-pg17/pos-aplicacao-0142.sql`):

| Verificação | Resultado |
| --- | --- |
| Colunas novas | `forma_pagamento_efetiva` (text), `valor_entregue_centavos` (bigint) e `troco_centavos` (bigint), todas anuláveis |
| Constraints | `pedido_pagamento_eventos_forma_efetiva_check` e `pedido_pagamento_eventos_troco_check` |
| Assinaturas | RPC antiga preservada (3 args) como bloqueio `dados_invalidos`; nova RPC efetiva (6 args); `verificar_recebimento_por_chave(text)`; `editar_observacoes_pedido(uuid,text,text)` |
| RPC efetiva | quatro formas, confirmação efetiva, cálculo de troco, idempotência com travamento e guarda por capacidade; `EXECUTE` para `authenticated`, negado para `anon` |
| RPC por chave | presente, somente leitura, `EXECUTE` para `authenticated`, negado para `anon` |
| Edição | estágio, exigência de Admin e auditoria confirmadas |
| Ledger | RLS ativa; nenhum `INSERT`/`UPDATE`/`DELETE` direto para `authenticated`; 2 eventos e 7.980 centavos preservados |
| Dados antigos | 2 linhas sem forma efetiva (`NULL` = “não registrado”); nenhuma linha com troco preenchido |
| Configuração | 1 loja com chave Pix, 1 concessão de `receber_pagamento`, único papel `admin` |

Reversão dokumentada em `scripts/central-pg17/reverter-0142.sql` e ensaiada no
PostgreSQL 17 descartável; não foi executada em homologação.

## Testes e builds

| Verificação | Resultado |
| --- | --- |
| `npm run typecheck` | OK |
| `npm run teste:recebimento-balcao` | 14/14 |
| `npm run teste:seguranca` | 31/31 |
| `npm run build:homolog` | OK, 0 arquivos com referência de produção |
| Ensaio PG17 com o checkpoint final | 94 asserções `pg_temp.ok`, 4 checagens de concorrência e reversão OK |
| Bundle publicado | `index-pyzfAovv.js`: projeto `lflzlcqinarrcgncafol`, sem `ruioyioynwwwiqbjznoa`, `VITE_DEMO_PREVIEW` compilado como `0`, `VITE_NEIA_AMBIENTE=homologacao` |
| HTML do alias | servido sem o banner “MODO DEMONSTRAÇÃO” |

O texto do banner existe no bundle apenas dentro da condição
`bannerDemoVisivel = modoDemo && ...`, que é falsa com `VITE_DEMO_PREVIEW=0`.

## Deployment e alias

| Item | Resultado |
| --- | --- |
| Comandos | `vercel pull --environment=preview --git-branch=resgate-visual-h01-h07-codex`; `vercel build`; `vercel deploy --prebuilt --yes --target preview`; `vercel alias set <url> <alias>` |
| Deployment | `dpl_FExuR8eCwnzEAJo7DzTNrFNbQj9v` — `READY`, `target: preview` |
| URL própria | <https://erp-neia-salgados-67hpu7olo-luiz988061337-3147s-projects.vercel.app> |
| Alias oficial | <https://erp-neia-salgados-git-resga-dcaca5-luiz988061337-3147s-projects.vercel.app> → deployment acima |
| Proteção | `vercel_authentication` preservada |
| Produção | `erp-neia-salgados.vercel.app` permanece em `dpl_DK144zp5kG9FSsL4J5HdniQ34Ukk`, `target: production`, sem promoção nem alteração de variáveis |

## Roteiro resumido de testes manuais do proprietário

1. Abrir o alias fixo em homologação, autenticar e conferir ausência do banner
   de demonstração e presença da Central da Atendente com o menu lateral
   aprovado.
2. **Dinheiro:** pedido pronto com valor conhecido; informar valor entregue
   maior que o devido; conferir pagamento no ledger, troco calculado e não
   contabilizado como receita, retirada liberada após confirmação.
3. **Pix:** usar a chave da loja; confirmar explicitamente o recebimento;
   conferir `verificar_recebimento_por_chave` e liberação da retirada. Sem
   confirmação, a retirada deve permanecer bloqueada.
4. **Crédito e débito:** registrar cada forma com chave de idempotência própria
   e conferir o valor efetivo no ledger e no Financeiro Premium.
5. **Parcial:** dois recebimentos parciais devem somar; a quitação só ocorre
   quando o saldo chega a zero.
6. **Duplicidade e conexão:** repetir a mesma chave após queda de conexão; não
   pode haver segundo lançamento, e a consulta por chave deve confirmar o
   primeiro.
7. **Retirada:** tentar retirar sem confirmação de pagamento; deve ser bloqueado.
   Após confirmação, permitir.
8. **Edição:** como atendente, alterar somente observações com motivo e
   auditoria; em `cancelado`, `entregue`, `retirado` e `em_rota`, bloquear;
   exceção somente com Admin.
9. **Financeiro/CSV:** forma efetiva correta, troco fora da receita e registros
   legados sem efetiva apresentados como “não registrado”; exportar CSV e
   comparar.
10. **Regressão:** conferir H01–H07, pedidos, estoque, financeiro, módulos
    públicos e App Motoboy, preservando layout, menus e fluxos aprovados.

## Procedimento seguro para perfil de atendente

Homologação possui apenas o papel `admin` em `public.user_roles` e uma única
concessão de `receber_pagamento` para a conta administrativa
`8a788a93-0ecf-483e-a402-cc09f84fcd9c` (`luiz988061337@gmail.com`). **Não
existe perfil `atendente` em homologação**, e a conta Admin não deve ser usada
como substituta dos testes de atendente.

Procedimento seguro, somente após autorização expressa do proprietário:

1. O proprietário indica uma conta Auth já existente em homologação ou cria uma
   conta específica pelo fluxo oficial; nenhuma credencial é criada pelo agente.
2. Com sessão administrativa, vincular o papel `atendente` nessa conta em
   `public.user_roles` (o valor já existe no enum `app_role`).
3. Conceder `receber_pagamento` em `neia_operacao.financeiro_capacidades`, com
   `motivo` documentando o teste autorizado e `concedido_por` apontando o
   administrador. Essa capacidade é a autoridade das RPCs para todos os papéis,
   inclusive Admin; a RLS do ledger não foi ampliada.
4. Executar os testes manuais autenticado como essa conta de atendente, sem
   elevar permissões administrativas.
5. Ao final, revogar papel/capacidade se o proprietário desejar.

Nenhuma dessas ações foi executada nesta rodada.

## Pendências reais

- Validação manual do proprietário no alias fixo; Fase 1 não foi declarada
  aprovada definitivamente.
- Autorização e disponibilização de um perfil `atendente` para os testes reais.
- Não foi confirmado nesta rodada um backup completo do banco de homologação;
  existe reversão documentada e ensaiada para a 0142, não executada em
  homologação.
- Fases 2–5 permanecem fora do escopo e registradas em
  `fases2-5-pendentes.md`.
- Toda alteração em produção depende de autorização expressa adicional.
