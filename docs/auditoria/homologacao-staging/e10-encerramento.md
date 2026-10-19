# E10 — Encerramento E10B + plano de homologação em staging

> Bateria E10B no banco atual: ENCERRADA sem novos usuários.
> Nenhuma homologação declarada completa. Aguardando autorização.

## 1. Registro E10B (banco atual, dados sintéticos removidos)

- Autorização RPC sem papel: 8/8 `negado` (aceite, liberar, conferir,
  atribuir, aceite-moto, retirar, ficha, reimpressão).
- B1 aceite duplo: `ok` → `conflito`. B2 liberação: `ok` → `conflito`.
  B3 conferência: `inelegivel` → `ok` → `conflito`.
- B4 atribuição: `ok` → bloqueada (sem duplicata). B5 aceite motoboy:
  `ok` → `conflito`. B6 ficha: `ok` → `conflito`; `aceito` → `ignorado`;
  reimpressão: `ok` → `conflito` (mesma chave).
- Retirada: `ok` → bloqueada; entrega cruzada bloqueada.
- Concorrência serial: escrita única. Saneamento: 0/0/0/0.
- Guard vigente: 0085 (sem bug 0074). Migration 0084 verificada (12+12+4).
- Limpeza: `restantes=0`. Zero resíduo E10B.

## 2. Pendências (exigem staging)

- Matriz RLS via app/API com papéis distintos (impossível com 1 conta
  multi-papel e sem logins separados).
- TANCA TP-550 física (fila validada, impressão não).

## 3. Pré-requisitos do staging

1. Projeto `neia-teste` (gratuito) criado manualmente no dashboard.
2. Backup do `.env` atual fora do repo.
3. Cadeia base em ordem (`docs/AMBIENTES.md`, pulando 0061–0063/0073),
   depois `0084`, depois `0085`; saneamento zerado antes da 0084.
4. `.env` apontado ao staging + `NEIA_AMBIENTE=staging`
   (`proteger-dev.mjs` deve imprimir "ambiente validado").
5. 6 usuários fictícios (ÔÇö 3.1) + papéis; dados 100% sintéticos,
   prefixo `STG-`; NENHUMA cópia de dado pessoal real.

## 4. Isolamento da produção

- Ref distinto conferido (dashboard × `VITE_SUPABASE_URL`); `iqirsunzgavsuhgyjjsi`
  nunca como alvo; `proteger-dev` fail-closed como testemunha.
- Staging sem seed de produção; sem service_role fora do agente;
  flags E2–E6 off até GO de cada bateria.

## 5. Migrations necessárias

Base documentada + `0084_etapas_operacionais.sql` + `0085_guard_pedidos_correcao.sql`.
Verificação pós-apply: §A do `e10_1_b-staging.sql` + guard sem bug.

## 6. Usuários fictícios por papel

Criar no Auth (senha simples, Auto Confirm): `admin@staging.teste`,
`atendente@staging.teste`, `producao@staging.teste`, `motoboy@staging.teste`,
`financeiro@staging.teste`, `contador@staging.teste`; vincular `user_roles`
(1 papel cada — multi-papel invalida testes de negação).

## 7. Matriz RLS/autenticação (via app ou API com login por papel)

| Papel | Deve passar | Deve negar |
|---|---|---|
| atendente | ler fluxo, aceite via RPC, retirar via RPC | `pagamento_status`, valores, itens fora do fluxo, atribuir |
| producao | liberar/conferir/atribuir via RPC, ficha | pagamento, `aceitar_pedido_atendente` |
| motoboy | ler próprios + descobrir `pronto/aguardando`, claim próprio, aceite próprio, GPS próprio | pedido alheio, valores, `aceitar_pedido_atendente` |
| financeiro | conciliar (fluxo existente) | aceitar/liberar/atribuir |
| contador | leitura agregada existente | qualquer escrita operacional |
| cliente | próprios, cancelar `recebido` | demais |
| anon | catálogo público | qualquer pedido/cliente |

## 8. Impressão física

Apontar print-agent ao staging; job `tipo=teste`; 1 pedido = 1 cupom;
falha simulada sem duplicar (`trabalho_uuid`); reimpressão nova linha +
contador; `imprimir_apos` respeitado para agendado.

## 9. Critérios de aprovação

§A verde + baterias B1–B8 + matriz §7 sem violação + TANCA íntegra +
layouts idênticos aos previews + backup do staging. Só então discutir
ativação de flags (uma por vez, com nova autorização cada).
