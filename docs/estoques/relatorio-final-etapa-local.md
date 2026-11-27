# ERP Néia Salgados — Estoque Operacional — Relatório da etapa local

Data: 27/11/2026. Branch isolada `estoque-operacional-vinculos`, base
`9cab90748ec8d98b3c677990b1de6f892eb47d40`. Destino futuro de integração:
`resgate-visual-h01-h07-codex`.

**Não houve push, merge, deploy, escrita remota, aplicação de migration,
carga remota, teste com escrita remota nem acesso à produção.** Homologação foi
tratada somente como destino declarado e protegido pela barreira
`scripts/ambiente-seguro.mjs`. O `.env` local aponta para produção e não foi
alterado nem usado como autoridade; na validação de build/destino as variáveis
de homologação foram aplicadas apenas no processo, em memória.

## 0. Controle de escopo (decisão do proprietário)

A implementação adicional da interface “Estoque do dia” — inclusive entrada no
menu lateral, painel lateral e atalhos — está **adiada**. Especificações,
contratos e trabalhos já realizados foram preservados e registrados como
pendência futura. Nenhuma tela, navegação, layout aprovado ou atalho foi
alterado nesta worktree. A rota `/atendente` já existe (`src/routes/atendente.tsx`)
e permanece intocada.

Nesta etapa priorizaram-se continuidade das vendas; reservas e baixas de
estoque; segurança e permissões; pedidos imediatos e agendados; integração entre
módulos existentes; testes transacionais; preparação para homologação. Não foram
acrescentadas novas funcionalidades nem reconstruídos módulos aprovados.

## 1. Funcionalidade preparada

- `0129` reescrita para o contrato aprovado: 26 sabores como identidade canônica
  por `chave`, nenhum vínculo automático com os 31 cadastros antigos e nenhum
  saldo legado `100` convertido em estoque físico.
- Estoque único por sabor em unidades físicas, com lotes, FEFO, validade vigente,
  vencidos visíveis para alerta e nunca saldo negativo. Frito/assado/congelado
  consomem as mesmas unidades; combos e composições não geram baixa duplicada.
- Margem inicial de 100 unidades por sabor, estoque mínimo separado, inventário
  individual, modos `monitoramento` (padrão), `validacao_assistida` e
  `controle_operacional`, sem remover proteções essenciais.
- Conferência, notificação, encaminhamento, decisão integral/parcial/recusa,
  autorização de uso único, reconhecimento individual e auditoria de
  solicitante/responsável/horários/quantidades/justificativa.
- Agendamentos futuros como compromissos, sem lote ou estoque fictício;
  cobertura real por entrada, com `acao_idempotencia` por ação e chave por par
  `(compromisso_id, lote_id)`.
- Bloqueio por sabor/data/período com motivo, responsável, desbloqueio e
  histórico, sem cancelar pedidos confirmados.
- Consulta “Estoque do dia” na ordem canônica dos 26 sabores, com nome, foto,
  físico, reservado, margem, disponível imediato, compromissos futuros,
  disponibilidade por data, bloqueios, conferência, solicitações em análise e
  última atualização — somente como backend/especificação; a interface está
  adiada.
- `0133` separada para reconciliar a divergência `0098` × `0124` de ACL das duas
  RPCs de reserva, sem reaplicar `0098` e sem alterar corpo, owner, RLS, dados,
  flags ou papéis.
- Carga e reversão exemplificativas com chaves determinísticas, lotes
  `HOMOLOGAÇÃO-TESTE`, validades de teste, sessão administrativa obrigatória,
  idempotência e reversão compensatória auditada sem `DELETE`.
- Contratos puros e classificadores em `src/lib/estoque-dia.ts` e contrato de
  integração para o Codex.

Correções aplicadas nesta rodada: filtro funcional de papel nas views (view
roda com owner e não herda RLS), restrição da view de respostas ao solicitante
e ao responsável, policy própria para detalhes de solicitações, link genérico
`/atendente` na notificação, exigência de cobertura física antes de autorizar
ou usar liberação, recusa de reserva física em data futura sem alterar reservas
aprovadas, e tratamento do ajuste com alvo zero na constraint de operações por
sabor sem flexibilizar a regra de `quantidade > 0` para produto.

Dois defeitos reais foram encontrados e corrigidos durante o ensaio PostgreSQL
17.11 local:

1. `avaliar_venda_salgado` declarava `v vw_saldos_sabores_estoque%ROWTYPE`
   sem qualificar o esquema. Com `SET search_path = pg_catalog`, a criação da
   função falhava (“relation ... does not exist”). Passou a
   `public.vw_saldos_sabores_estoque%ROWTYPE`.
2. `cobrir_compromissos_salgados` ordenava por `created_at`, coluna inexistente
   em `salgados_compromissos`. Passou a `criado_em`, a coluna real da tabela.

Sem o banco real descartável, nenhum dos dois seria detectado por testes
estáticos ou por build.

## 2. Numeração coordenada das migrations

A Central da Atendente do Codex ocupa `0130` (permissões da atendente), `0131`
(notificações Realtime privadas) e `0132` (janelas prometidas). A reconciliação
de ACL desta worktree, originalmente `0130`, foi renumerada para `0133`, com
histórico `20261127230000`. A branch do Codex não foi alterada.

Ordem de aplicação, quando autorizada:

`0129` revisada → `0130`/`0131`/`0132` (Codex) → `0133`.

## 3. Arquivos alterados

| Arquivo | Situação | Finalidade |
| --- | --- | --- |
| `drizzle/migrations/0129_vinculos_operacionais_salgados.sql` | modificado | Contrato revisado da migration, não aplicado em ambiente remoto. |
| `drizzle/migrations/0133_acl_reserva_estoque_dia.sql` | novo | ACL separada das RPCs de reserva; renumerada para evitar colisão. |
| `scripts/estoque-vinculos-salgados.test.mjs` | modificado | Testes estáticos do contrato da `0129`. |
| `scripts/estoque-dia-contrato.test.mjs` | novo | Testes de `0133`, carga/reversão, contratos e continuidade comercial. |
| `scripts/carga-exemplo-salgados-homolog.sql` | novo | Carga exemplificativa idempotente. |
| `scripts/reverter-carga-exemplo-salgados-homolog.sql` | novo | Reversão compensatória da carga. |
| `scripts/estoque-pg17/` | novo | Runner e ensaios em PostgreSQL 17.11 descartável (`executar.ps1`, plataforma sintética, fixture, testes transacionais, concorrência, carga/reversão). |
| `src/lib/estoque-dia.ts` | novo | Contratos puros e classificadores para o Codex. |
| `docs/projeto-diretor/estoque-salgados/decisoes-operacionais-27-11-2026.md` | novo | Decisões aprovadas, complemento “Estoque do dia” e controle de escopo. |
| `docs/estoques/relatorio-deliberacao-final.md` | novo | Deliberação anterior com tabelas e perguntas. |
| `docs/estoques/contrato-integracao-codex-estoque-dia.md` | novo | Especificação de integração para o Codex; interface adiada. |
| `docs/estoques/relatorio-final-etapa-local.md` | novo | Este relatório. |

## 4. Validações executadas

| Comando | Resultado |
| --- | --- |
| `node --test` nas suítes de estoque/reserva existentes | 29 testes, 29 passaram. |
| `node scripts/estoque-vinculos-salgados.test.mjs` | 12 testes, 12 passaram. |
| `node scripts/estoque-dia-contrato.test.mjs` | 10 testes, 10 passaram. |
| `npm run typecheck` | sem erros. |
| `npm run teste:seguranca` | 31 testes, 31 passaram. |
| `npm run seguranca:destino -- --project-ref lflzlcqinarrcgncafol` sem override | bloqueou corretamente: configuração efetiva aponta produção; nenhuma conexão aberta. |
| `npm run seguranca:destino -- --project-ref lflzlcqinarrcgncafol` com override de homologação no processo | “destino autorizado: homologação, configuração coerente”. |
| `npm run build:homolog` com override de homologação no processo | build concluído; verificador: 446 arquivos, 10 com referência de homologação, **0** com referência de produção. |
| `git diff --check` | limpo. |
| Varredura de segredos nos arquivos alterados | nenhuma credencial, JWT, chave de serviço ou senha versionada. |
| `powershell scripts/estoque-pg17/executar.ps1 -Scratch <temp>` | **PostgreSQL 17.11 local descartável: OK.** Cadeia limpa até `0123`, `0124`–`0128`, `0129` revisada e `0133`; nenhuma conexão remota. |

### 4.1 Ensaios transacionais reais (PostgreSQL 17.11)

Executados em cluster descartável, com `SET ROLE authenticated` e `auth.uid()`
por `request.jwt.claim.sub`, `ON_ERROR_STOP=1`:

- ACL da `0133`: `EXECUTE` devolvido somente a `authenticated`; `anon`,
  `service_role` e `PUBLIC` sem acesso.
- Configuração por sabor, modo padrão `monitoramento` e proteções essenciais
  preservadas.
- FEFO: lote com validade mais próxima escolhido; reserva idempotente pela mesma
  chave, sem duplicação; liberação idempotente e restante de reserva correto.
- Consumo parcial e total com baixa única por operação e `reserva_consumos`
  auditado.
- Rollback: exceção após escrita não persiste lote nem operação.
- Bloqueio por sabor/data não bloqueia outro sabor; desbloqueio auditado.
- Compromisso futuro: `registrar_compromisso_salgado` não cria lote fictício;
  entrada real cobre exatamente uma vez; reexecução da cobertura não duplica
  vínculo; disponibilidade futura é liberada pela cobertura real.
- `reservar_sabor_estoque` em data futura devolve `analise_necessaria` e não
  cria, altera ou cancela reserva do pedido; reservas aprovadas na data corrente
  permanecem intactas.
- Solicitação, resposta parcial, notificação genérica `/atendente`, view de
  detalhes restrita a solicitante/responsável, reconhecimento e autorização de
  uso único.
- Motoboy autenticado não lê saldos nem detalhes de solicitação.
- Liberação sem cobertura física recusada.
- Carga/reversão exemplificativas: carga, recarga, reversão e reversão repetida
  idempotentes; lote de teste esgotado sem `DELETE`.
- Concorrência multi-sessão: movimentação com a mesma chave registra uma única
  operação/lote (A `registrado`, B `ja_registrado`); aprovações simultâneas
  geram uma única autorização e uma única decisão auditada (A `ok`, B
  `ja_respondida`).

Evidências ficaram no cluster descartável; nada foi aplicado em homologação.

## 5. Git status (ao final)

```
## estoque-operacional-vinculos
 M drizzle/migrations/0129_vinculos_operacionais_salgados.sql
 M scripts/estoque-vinculos-salgados.test.mjs
?? docs/estoques/
?? docs/projeto-diretor/estoque-salgados/decisoes-operacionais-27-11-2026.md
?? drizzle/migrations/0133_acl_reserva_estoque_dia.sql
?? scripts/carga-exemplo-salgados-homolog.sql
?? scripts/estoque-dia-contrato.test.mjs
?? scripts/estoque-pg17/
?? scripts/reverter-carga-exemplo-salgados-homolog.sql
?? src/lib/estoque-dia.ts
```

Checkpoint local: tag `checkpoint-estoque-operacional-vinculos-local-01`,
apontando para o commit que contém este relatório e
`docs/estoques/contrato-integracao-codex-estoque-dia.md`. O hash exato pode ser
obtido com `git rev-parse checkpoint-estoque-operacional-vinculos-local-01` e foi
comunicado ao proprietário e ao Codex.

## 6. Resultado visual

Não aplicável. Nenhuma tela foi alterada nesta worktree e nenhuma prévia de
homologação foi publicada. O painel aprovado, o menu lateral e os layouts
existentes foram preservados.

## 7. Pendências reais

- Migrations `0129` e `0133` não aplicadas em ambiente remoto; ACL efetiva em
  homologação ainda não confirmada.
- `src/integrations/supabase/types.ts` não regenerado: o arquivo pertence ao
  Codex e o schema sintético local não substitui o schema do Supabase.
- Interface “Estoque do dia”, entrada no menu lateral, painel lateral e atalhos:
  **adiados por decisão do proprietário**.
- Carga e reversão executadas somente no cluster descartável; inventário físico
  real deve preceder a operação definitiva.
- Integração da interface com o tipo de notificação `salgados_resposta` depende
  do Codex, em etapa futura.
- Não há aprovação para publicar enquanto existir risco conhecido de bloqueio
  comercial indevido.
- Não há autorização para push, merge, deploy, escrita remota nem produção.

## 8. Próximos passos condicionados

1. Coordenar com o Codex a aplicação de `0129`, `0130`–`0132` e `0133`, sem
   conflito de versão e sem alterar a branch dele.
2. Somente com autorização expressa: aplicar as migrations em homologação com
   destino declarado `--project-ref lflzlcqinarrcgncafol` e barreira de ambiente.
3. Somente com autorização expressa: executar carga/reversão exemplificativas,
   validar no endereço oficial de homologação e aguardar aprovação manual.
4. Em etapa futura, se autorizada, implementar a interface “Estoque do dia” com
   o Codex conforme `docs/estoques/contrato-integracao-codex-estoque-dia.md`.

Este relatório registra preparação local e validação transacional descartável.
**Não declara módulo concluído nem aprovado.**
