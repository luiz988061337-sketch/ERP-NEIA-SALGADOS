# Checkpoint local 02 — relatório de entrega

Data: 27/11/2026. Worktree isolada `estoque-operacional-vinculos`.

Tag: `checkpoint-estoque-operacional-vinculos-local-02`. Checkpoint anterior
preservado: `checkpoint-estoque-operacional-vinculos-local-01`
(`fcd7f052fa9f6a7a177e70cf59a2eb4055856e06`). O hash do commit deste checkpoint
é o apontado pela tag; nenhum histórico publicado foi reescrito.

## 1. Entregas solicitadas nesta etapa

| Solicitação | Entrega |
| --- | --- |
| Atualização da branch oficial | `0134`, `0135` e `0136` reconhecidas como publicadas/aplicadas; `0135` **não** reservada para o B7; corretiva mantida como rascunho sem numeração definitiva. |
| Salvar o trabalho em commit | Todo o conteúdo local consolidado em um único commit, com tag nova. Nada permanece somente como arquivo não rastreado. |
| Editar pedido — contrato de estoque | `docs/estoques/contrato-edicao-pedidos-estoque.md`, sem interface, sem RPC implementada e sem arquivos do Codex. |
| Ciclo de agendamentos sujeitos a aprovação | Documentado e verificado no ensaio B7; sem cobrança antes da confirmação autorizada. |
| Retomada pelo OpenCode | `docs/estoques/continuidade-retomada-opencode.md`, com arquivos, RPCs, permissões, dependências e testes. |
| Restrições | Nenhum push, merge, migration remota, carga, deploy, produção ou arquivo compartilhado alterado. |

## 2. Conteúdo do commit

**Corretiva B7 (rascunho, não aplicada):**
- `scripts/estoque-operacional/correcao-b7-agendamentos-rascunho.sql` — wrapper com
  flag desligada, base renomeada e revogada de `authenticated`, e RPCs do ciclo
  completo de aprovação.
- `scripts/reverter-correcao-b7-agendamentos.sql` — reversão não destrutiva e
  idempotente, estendida às três RPCs novas do ciclo.

**Documentação:**
- `docs/estoques/correcao-b7-agendamentos.md` — desenho, numeração, ensaio,
  dependências do Codex e pendências.
- `docs/estoques/contrato-edicao-pedidos-estoque.md` — contrato de edição.
- `docs/estoques/continuidade-retomada-opencode.md` — guia de retomada.
- `docs/estoques/relatorio-checkpoint-local-02.md` — este relatório.
- `docs/estoques/relatorio-preparacao-final-central-atendente.md` — atualizado com
  o topo `4c703e4`, `0134`–`0136`, o ciclo B7 completo e o checkpoint 02.
- `docs/estoques/contrato-integracao-codex-estoque-dia.md` — seção 10 estendida
  com o ciclo B7 e seção 11 com a edição de pedidos.

**Testes e evidências reproduzíveis:**
- `scripts/estoque-pg17/b7-setup.sql`, `b7-testes.sql`, `b7-verificar.sql`,
  `executar-b7.ps1`;
- reversões `0129`/`0133`: `scripts/reverter-0129-*.sql`,
  `scripts/reverter-0133-*.sql`, `scripts/estoque-pg17/reversao-setup.sql`,
  `verificar-reversao.sql`, `executar-reversao.ps1`;
- preflight: `docs/estoques/preflight-integracao-homologacao-objetivo.md`,
  `consulta-preflight-integracao-readonly.sql`,
  `consulta-preflight-compromissos-readonly.sql`.

## 3. Verificação já concluída (não repetida)

- PostgreSQL 17.11 descartável: `B7 PG17 OK`, com evidência
  `C:\Users\User\AppData\Local\Temp\opencode\neia-b7-pg17-59b79dfb4c04431194cf7aae346003e3\sql.log`.
- Casos cobertos: imediato, agendado com cobertura, retry, agendado sem cobertura,
  recusa, aprovação, vínculo ao pedido definitivo sem pagamento, cobertura por
  lote real, conversão FEFO sem dupla dedução, cancelamento e liberação, retirada
  parcial com devolução do não consumido, flag desligada, isolamento da base,
  reversão executada duas vezes.
- Reversões `0129`/`0133` e preflight read-only já aprovados no checkpoint 01.

Nenhuma suíte foi reexecutada sem necessidade. A única execução nova nesta etapa
foi a do ciclo B7 ampliado, necessária porque três RPCs e quatro situações foram
acrescentadas ao rascunho.

## 4. Branch oficial

Topo buscado: `4c703e4` (“Prepara homologação final da Central da Atendente”),
acima de `0a38fd6` e `e36c0bc`. O Codex informou que `0134`, `0135` e `0136`
já estão aplicadas em homologação. Inspeção estática confirmou que nenhuma delas
altera `criar_pedido_com_reserva`, `reservar_pedido_atomico`, `0129`, `0133` ou
os grants de reserva. Base comum: `e50e750d075c4a0d928a23a14c0b81a2c5ac3a86`.
A corretiva B7 permanece **sem numeração**, a coordenar a partir de `0137`.

## 5. Contrato de edição de pedidos — resumo

A edição é tratada como operação de estoque, não como UPDATE de campos. Regras
centrais: consumed quantity imutável (`reserva_consumos` append-only), devolução
somente de `quantidade - consumido`, FEFO por `reservar_sabor_estoque`, estorno
ao `lote_id` original, data futura como compromisso, valores nunca vindos do
cliente, uma transação, uma chave de idempotência, trilha em `admin_logs` e
revalidação antes da escrita. Detalhes e cenários pendentes no contrato.

## 6. Bloqueadores restantes

1. Autorização expressa para definir numeração, aplicar migrations, carregar
   lotes, integrar e publicar.
2. Conferência do catálogo real de homologação após `0134`–`0136` e validação da
   guarda (`MD5 8e4bc904ec461736b8d42664117a4432`), das policies de Realtime e
   do gatilho de quitação na retirada.
3. Homologação final da Central da Atendente pelo proprietário.
4. `types.ts`, checkout, PDV, Central e H02 pertencem ao Codex e não foram
   editados; `interpretarCriacao` ainda não reconhece `analise_necessaria`.
5. Convivência B7 × `0134`–`0136` conferida apenas por inspeção estática; o
   runner local não instala essas migrations porque a `0134` exige
   `current_user = 'postgres'` e assinatura exata da guarda.
6. Edição de pedidos existe como contrato; não há RPC nem teste executado para
   ela. Especificação não caracteriza funcionalidade operacional.

## 7. Preservação e restrições cumpridas

- 26 sabores oficiais, fotografias e sequência personalizada intactos; nenhum
  lote de homologação carregado.
- Nenhum arquivo em `drizzle/migrations` criado ou alterado nesta frente.
- Nenhum arquivo do Codex alterado: `types.ts`, Central, PDV, checkout, H02,
  menu lateral, CSS aprovado e wrappers/gates intactos.
- Nenhum push, merge, deploy, migration remota, carga remota ou acesso a produção.
- Nenhum segredo impresso ou versionado; nenhum arquivo de ambiente alterado.
