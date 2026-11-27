# Estoque Operacional — preflight objetivo de integração em homologação

Data: 27/11/2026. Worktree isolada `estoque-operacional-vinculos`, branch com
checkpoint em `fcd7f052fa9f6a7a177e70cf59a2eb4055856e06`, tag
`checkpoint-estoque-operacional-vinculos-local-01`.

**Escopo estrito:** preparar o preflight. Não houve push, merge, deploy,
escrita remota, aplicação de migration, carga remota, teste com escrita remota,
alteração de produção nem alteração de configuração remota. Os testes locais já
aprovados no checkpoint **não foram repetidos**. Este documento não declara
módulo pronto nem autoriza publicação.

## 1. Resultado objetivo

| Item | Conferência |
| --- | --- |
| Checkpoint local | Preservado: commit `fcd7f05…`, tag `checkpoint-estoque-operacional-vinculos-local-01`,árvore do checkpoint intacta. |
| Destino | `lflzlcqinarrcgncafol`. Sem declaração/override, a barreira bloqueou; com homologação declarada no processo, aprovou. Nenhuma conexão aberta. |
| Branch oficial | Atualizada por `git fetch origin`: `resgate-visual-h01-h07-codex` em `e36c0bce1760d2ae4dca39176aa55073e2c9c2dd` (“Integra a Central da Atendente para homologação”). |
| Migrations na branch oficial | `0130`, `0131` e `0132` presentes. `0129` e `0133` **ausentes**. |
| Histórico efetivo do banco | Evidência de leitura anterior do Codex: até `20261126170000`, sem objetos de `0130`–`0132`, `0129` ou `0133`. O estado **após** a publicação da Central ainda não foi confirmado. |
| Endereço oficial | Respondeu à página de login do Vercel; o SHA efetivamente servido não pôde ser lido sem autenticação. |
| Bloqueio restante | Autorização expressa do proprietário para qualquer escrita em homologação; conferência final do histórico remoto; coordenação da integração Git com o Codex. |

## 2. Destino, configuração local e barreiras

O destino de escrita permitido é exclusivamente o Supabase de homologação
`lflzlcqinarrcgncafol`, com `NEIA_AMBIENTE=homologacao` e
`VITE_DEMO_PREVIEW=0`, no endereço fixo já existente. Produção
(`ruioyioynwwwiqbjznoa`) permanece protegida e somente leitura.

Nesta worktree **não há arquivo `.env`**; existem apenas `.env.example` e
`.env.production` (este último versionado e sem referência de projeto). A
variável herdada do terminal `VITE_SUPABASE_URL` aponta para produção. Ela não
é autoridade de destino e **não foi alterada nem usada**. A correção local foi
feita somente pelo mecanismo seguro documentado: declaração explícita de
homologação no processo, por comando, mais `--project-ref`:

| Comando | Resultado |
| --- | --- |
| `npm run seguranca:destino -- --project-ref lflzlcqinarrcgncafol` (sem override) | Bloqueado: “configuração efetiva aponta para produção”. Nenhuma conexão aberta. |
| O mesmo comando com `VITE_SUPABASE_URL`, `VITE_SUPABASE_PROJECT_ID`, `NEIA_AMBIENTE=homologacao` e `VITE_DEMO_PREVIEW=0` declarados no processo | “destino autorizado: homologação, configuração coerente”. |

Não foram criados segredos, editados `.env.production`, alteradas variáveis da
Vercel nem contornadas as barreiras. Antes de qualquer escrita, o operador deve
corrigir o terminal de origem (remover/sobrescrever a variável herdada de
produção) e repetir a validação com destino declarado.

## 3. Branch oficial e coordenação com o Codex

- `git fetch origin` foi a única operação remota desta etapa e é somente leitura.
- Topo oficial: `e36c0bc…`. Base comum com o checkpoint:
  `e50e750d075c4a0d928a23a14c0b81a2c5ac3a86`. A branch do Estoque contém
  `9cab907` e `fcd7f05` após essa base; as linhas divergiram. Integração futura
  deve ser feita em worktree isolada, com commits normais, conferindo a base
  atual e os conflitos. **Nunca force push, rebasing/amend de histórico
  publicado nem alteração de `main`.**
- O commit `e2c7f62` citado em coordenações anteriores não é um objeto válido
  neste clone. A publicação do Codex é identificada por `e36c0bc…`, que registra
  o snapshot local `86bc89e1e70c1d6ce19f0b30520e6440c34b0817`.
- `0130_central_atendente_leitura_operacional.sql`,
  `0131_central_atendente_realtime_avisos.sql` e
  `0132_pedido_prazo_comercial.sql` estão na árvore oficial. As versões de
  histórico previstas no preflight do Codex são `20261127120000`,
  `20261127120001` e `20261127120002`; elas não são inseridas pelo corpo dos
  arquivos e dependem do registro feito na transação de aplicação.
- A numeração acordada permanece: `0129` (`20261126190000`) → `0130`/`0131`/
  `0132` (Codex, se ainda pendentes) → `0133` (`20261127230000`). Se o Codex
  já tiver aplicado `0130`–`0132`, elas **não** devem ser reaplicadas nem
  re-registradas por esta frente.

## 4. Histórico efetivo e regra de não reaplicação

O preflight somente leitura do Codex, executado antes da publicação, encontrou:
histórico de catálogo até `20261126170000`, objetos próprios de `0130`–`0132`
ausentes e `0129`/`0133` ausentes. Após a entrada de `e36c0bc` na branch oficial
**o catálogo remoto não foi consultado**; a presença dos arquivos no Git não
comprova aplicação no banco.

Antes de qualquer escrita, executar em homologação, com destino declarado:

1. `docs/estoques/consulta-preflight-integracao-readonly.sql` — versões,
   objetos e ACL das duas RPCs de reserva. É segura antes e depois das
   migrations, pois usa apenas catálogo, `to_regclass`, `to_regprocedure` e
   `information_schema`.
2. Confirmar explicitamente: `0129` e `0133` ausentes; `0130`–`0132` conforme
   o estado real; sem versão duplicada; sem objeto órfão de tentativa anterior.

Se qualquer versão ou objeto já existir, **parar**. Não reaplicar migration
para “consertar” histórico; seguir o procedimento de reconciliação documentado
em `docs/projeto-diretor/seguranca-ambientes/migracoes-0125-0127.md`. As
inserts de histórico da `0129` e da `0133` usam `ON CONFLICT (version) DO
NOTHING`, portanto a pré-conferência é obrigatória para não mascarar divergência.

## 5. Dependências e compatibilidade

| Migration | Pré-requisitos verificáveis | Situação do preflight |
| --- | --- | --- |
| `0129` revisada | `sabores_estoque` com 26 chaves canônicas, `produtos`, `lotes`, `reservas_estoque`, `pedidos`, `auth.users`, `has_role`, `notificacoes` e `admin_logs`; `supabase_migrations`. | Validada em PostgreSQL 17.11 descartável; dependências de catálogo já conferidas pelo Codex em leitura de homologação. Nenhum vínculo automático com os 31 cadastros antigos. |
| `0130`–`0132` | Tabelas de pedidos/itens/remessas, `realtime.messages`, `loja_config`; executor com delegação gerenciada em `realtime.messages`. | Codex as declarou independentes do Estoque; verificar no catálogo atual antes de considerar pendentes. |
| `0133` | Assinaturas `reservar_estoque_atomica(uuid,uuid,integer)` e `reservar_pedido_atomico(uuid)`, `SECURITY DEFINER`, `search_path=public`, RLS e nenhum outro papel com `EXECUTE`. | A própria migration aborta se qualquer pré-condição falhar; não reaplica `0098`. |
| Carga exemplificativa | `0129`, `0133`, sessão administrativa real (`auth.uid()` + papel `admin`). | Validada no cluster descartável; não usa `service_role`. |

`src/integrations/supabase/types.ts` foi alterado pelo Codex na branch oficial e
**não deve ser editado nesta worktree**. A regeneração definitiva depende do
schema real pós-migration e pertence ao Codex.

## 6. Plano de aplicação — somente após autorização expressa

1. Sincronizar o Git, conferir branch/worktree e o topo oficial; integrar a base
   atual em worktree isolada sem reescrever histórico publicado.
2. Declarar explicitamente o destino e validar:
   `npm run seguranca:destino -- --project-ref lflzlcqinarrcgncafol` deve
   retornar 0 com configuração de homologação coerente.
3. Rodar a consulta somente leitura da seção 4 e parar diante de qualquer
   divergência. Conferir também as dependências da seção 5.
4. Aplicar **uma migration por vez**, com destino explícito, pelo caminho
   protegido `npm run sql:homolog -- --arquivo <arquivo.sql> --project-ref
   lflzlcqinarrcgncafol` (sem `--confirmar` é simulação; com `--confirmar`
   executa). Usar timeouts de lock/statement e verificar o resultado de cada
   etapa antes da seguinte.
5. Ordem: `0129` revisada → `0130`/`0131`/`0132` somente se pendentes e em
   coordenação com o Codex → `0133`. Nenhuma migration do Codex deve ser
   reaplicada por esta frente.
6. Registrar o histórico somente após o sucesso de cada transação e solicitar
   `NOTIFY pgrst, 'reload schema'` de forma coordenada.
7. Verificar novamente objetos, ACL, papéis, rotas e bundle; conferir a versão
   no endereço oficial e aguardar aprovação manual do proprietário.
8. Nunca promover para produção, nunca ativar `VITE_DEMO_PREVIEW=1`.

## 7. Plano de reversão

| Escopo | Reversão objetiva |
| --- | --- |
| Código/deploy | Reverter por commit normal na branch oficial e, se necessário, devolver o alias ao deployment anterior — ação de responsabilidade do Codex/Vercel. Nada de force push. |
| `0133` | Revogar somente o `EXECUTE` de `authenticated` nas duas RPCs, preservando corpo, owner, RLS, dados e histórico; não reaplicar `0098`. |
| `0130`–`0132` | Usar o SQL compensatório do Codex `scripts/homologacao-pg17/reverter-central-atendente-homolog.sql`, apenas no destino autorizado. |
| `0129` | **Não há script compensatório aprovado.** Reversão deve ser não destrutiva: desabilitar o modo operacional (`monitoramento`), revogar grants se necessário e preservar tabelas, ledger, pedidos, reservas e histórico. Um SQL compensatório específico precisa ser preparado e aprovado **antes** da aplicação — impedimento registrado. |
| Carga exemplificativa | `scripts/reverter-carga-exemplo-salgados-homolog.sql`: retirada pelo mesmo lote, `p_saldo_esperado`, chave de idempotência distinta e sem `DELETE`. |

Em nenhum caso apagar `schema_migrations`, pedidos, reservas, movimentações ou
logs para “consertar” o estado. A remoção de linhas de histórico só é admitida
pelo procedimento documentado de reconciliação.

## 8. Carga exemplificativa identificada

`scripts/carga-exemplo-salgados-homolog.sql` contém as 26 quantidades aprovadas
para teste (5000 coxinha de frango, 4000 bolinha de queijo, 2000 risoles, 2500
croquete, …, 80 trouxinha de calabresa, 1500 enroladinho de salsicha). Usa
chaves determinísticas `md5('carga-exemplo-homologacao:' || chave)`, lotes
`HOMOLOGAÇÃO-TESTE-<CHAVE>`, fabricação `2026-11-20`, validade `2027-01-15` e
somente sessão administrativa autenticada. Reexecução devolve
`ja_registrado`; assinatura divergente aborta. Não é saldo real, nunca vai para
produção e não substitui inventário físico. Aplicação e reversão continuam
**não executadas em ambiente remoto**.

## 9. Permissões

- `authenticated` é apenas transporte PostgREST; a autoridade vem de
  `auth.uid()`, papel funcional, `has_role`, `SECURITY DEFINER`, `search_path`
  e RLS.
- `vw_saldos_sabores_estoque` e `vw_salgados_notificacoes_atendente` filtram
  por papel funcional porque views rodam com o owner e não herdam RLS. Detalhes
  de solicitação ficam restritos ao solicitante e ao responsável.
- Matriz aprovada: atendente consulta/solicita/recebe e reconhece; caixa/PDV
  consulta e solicita; produção consulta físico e reservado; responsável
  autoriza/recusa/ajusta; admin controla tudo; motoboy sem acesso.
- A `0133` devolve `EXECUTE` somente a `authenticated` nas duas RPCs de reserva;
  `PUBLIC`, `anon` e `service_role` continuam sem acesso. A consulta de ACL da
  seção 4 verifica o estado real.
- A `0130` amplia leitura de itens/remessas para atendente; as permissões
  efetivas precisam ser reconferidas no catálogo atual.

## 10. Continuidade comercial e agendamentos futuros

Verificação explícita contra bloqueio indevido de agendamento legítimo:

- `reservar_sabor_estoque` com `p_data > hoje` retorna
  `status: 'analise_necessaria'` e mensagem “Agendamento futuro: registrar como
  compromisso e revalidar na confirmação.” **antes** de qualquer lock, SELECT de
  lote, INSERT ou atualização (`0129`, linhas 832–839). Não cria, altera nem
  cancela reserva; reservas aprovadas na data corrente permanecem intactas.
- O agendamento legítimo usa `registrar_compromisso_salgado`, que grava
  compromisso pendente, nunca lote ou estoque fictício, com idempotência por
  `chave_idempotencia` e bloqueio por sabor/data quando aplicável (`0129`,
  linhas 1312–1359).
- `cobrir_compromissos_salgados` usa cobertura real por lote, chave
  `(compromisso_id, lote_id)` e `acao_idempotencia`, sem duplicar vínculo
  (linhas 1361–1413). A consulta
  `docs/estoques/consulta-preflight-compromissos-readonly.sql` sinaliza
  compromisso de pedido confirmado sem cobertura, pedido cancelado e reserva
  ativa do mesmo pedido/sabor.
- Falha técnica, sabor não inventariado, divergência e margem atingida não são
  interpretados como falta de estoque: o modo padrão é `monitoramento`, sem
  alterar vendas. Um sabor em análise não bloqueia os demais.
- A interface “Estoque do dia”, menu, painel lateral e atalhos continuam
  **adiados por decisão do proprietário**; nenhuma tela foi alterada, portanto
  não há novo bloqueio de UI na homologação atual.
- Risco remanescente: não há validação com pedidos, perfis e dados reais de
  homologação. Nenhuma publicação pode ser considerada pronta enquanto houver
  possibilidade conhecida de bloqueio comercial indevido.

## 11. Integração com Codex, notificações e `types.ts`

- Contrato exato para o Codex: commit
  `fcd7f052fa9f6a7a177e70cf59a2eb4055856e06`, arquivo
  `docs/estoques/contrato-integracao-codex-estoque-dia.md`.
- A resposta de solicitação grava um único evento em `notificacoes` com
  `tipo = 'salgados_resposta'`, texto sem dado sensível e `link = '/atendente'`
  (`0129`, linhas 1122–1125). A rota `src/routes/atendente.tsx` existe tanto
  nesta worktree quanto na branch oficial: **link operacional válido**, sem
  recriar rota.
- O filtro atual da Central em `src/lib/central-pedidos.ts` (linhas 267–289)
  considera apenas `pedido_pronto_caixa` e `pedido_liberado_retirada`.
  Incluir `salgados_resposta` no filtro é pendência do Codex, em etapa futura de
  interface — não alterar aqui.
- `src/integrations/supabase/types.ts` pertence ao Codex e só deve ser
  regenerado depois da aplicação autorizada das migrations, a partir do schema
  real. O schema sintético local não substitui o Supabase.

## 12. Consultas somente leitura preparadas

| Arquivo | Uso |
| --- | --- |
| `docs/estoques/consulta-preflight-integracao-readonly.sql` | Versões, objetos de `0129`/`0131`/`0132` e ACL das RPCs de reserva; segura antes e depois da aplicação. |
| `docs/estoques/consulta-preflight-compromissos-readonly.sql` | Após `0129`: compromissos futuros × reservas ativas × pedidos confirmados e links de `salgados_resposta`. |
| `docs/estoques/consulta-preflight-vinculos-readonly.sql` | Catálogo/vínculos anteriores e sabores. |
| `docs/estoques/consulta-preflight-atomicidade-readonly.sql` | Dependências atômicas de pedidos, reservas e combos. |

Todas usam `BEGIN TRANSACTION READ ONLY` + `ROLLBACK`, exigem
`--project-ref lflzlcqinarrcgncafol` e não foram executadas contra banco remoto.

## 13. Impedimentos

1. Falta autorização expressa para aplicar `0129`/`0133`, executar a carga,
   integrar, publicar ou tocar em homologação.
2. Histórico efetivo do banco após a publicação da Central não foi confirmado;
   SHA servido no endereço oficial não é legível sem autenticação Vercel.
3. As linhas Git divergiram (`e50e750` é a base comum); integração precisa de
   coordenação com o Codex e conferência de conflitos.
4. Não existe SQL compensatório aprovado para `0129`.
5. `types.ts` e o filtro de `salgados_resposta` na Central dependem do Codex.
6. A variável herdada `VITE_SUPABASE_URL` aponta produção no terminal local;
   deve ser corrigida pelo operador antes de qualquer escrita.
7. Perfis de teste, flags de Preview e validação com dados reais de homologação
   permanecem pendentes.
8. Interface “Estoque do dia”, menu, painel lateral e atalhos: adiados.

## 14. Estado Git

O checkpoint `fcd7f05…` e a tag não foram alterados. Os três arquivos deste
preflight (este relatório e as duas consultas read-only) foram criados **após**
o checkpoint e permanecem como alteração local não commitada, porque a etapa
ainda não foi aprovada. Não houve push, merge, deploy, escrita remota nem
alteração em produção.
