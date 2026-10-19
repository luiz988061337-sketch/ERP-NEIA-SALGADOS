# E10.1-B — Roteiro de homologação em staging (neia-teste)

> Execução MANUAL pelo responsável. Nada aqui roda sozinho.
> Proibido executar qualquer bloco em produção (`iqirsunzgavsuhgyjjsi`).

## 0. Pré-requisitos (você)

1. Criar projeto `neia-teste` em supabase.com/dashboard (gratuito).
2. Backup do `.env` atual (`cp .env .env.prod.bak` — fora do repo).
3. Aplicar a cadeia base em ordem no SQL Editor (ver `docs/AMBIENTES.md` §"Banco de teste"):
   base → ... → `0083`. Pular `0061–0063`, `0073`. `0074` após `0077`
   (a 0085 corrige o guard por cima de qualquer forma).
4. Aplicar `drizzle/migrations/0084_etapas_operacionais.sql` e depois
   `drizzle/migrations/0085_guard_pedidos_correcao.sql`, cada uma em bloco
   separado, conferindo OK. **Antes da 0084**: rodar o saneamento do §13
   (deve retornar zerado — em banco novo, retorna zerado).
5. Criar 6 usuários + `user_roles` (admin, atendente, producao, motoboy,
   financeiro, contador) conforme `AMBIENTES.md`.
6. Apontar `.env` ao staging + `NEIA_AMBIENTE=staging`; `npm run dev`
   deve imprimir "ambiente validado" (fail-closed prova o isolamento).

## 1. Verificação pós-apply (`scripts/e10_1_b-staging.sql` §A)

- §A1: 12 colunas + 12 funções presentes.
- §A2: `ainda_bug_0074=false`, `tem_allowlist_0070=true`, `tem_bypass_servidor=true`.
- §A3: 4 triggers + 3 índices presentes.
- Qualquer divergência = NO-GO, parar e reportar.

## 2. Bateria PG (§B, dados `E10B-`, staging only)

Ordem: B1 aceite duplo → B2 liberação/janela/duplicata → B3 conferência
(exige `em_producao`, confirmação explícita) → B4 concorrência em 2 abas
(segunda trava e conflita; limite 3 + exceção) → B5 retirada×entrega
cruzadas → B6 impressão (idempotência, reimpressão com motivo, sem TANCA:
fila enfileira, agente não consome) → B7 guard financeiro **via app**
(SQL Editor é superuser e não testa RLS!) → B8 limpeza `E10B-%`.

## 3. RLS por papel (via app em staging, nunca no editor)

Logar com cada um dos 6 usuários e tentar a operação alheia:
atendente→`pagamento_status` (deve falhar `Coluna protegida`); motoboy→pedido
de outro (deve falhar); motoboy→valores (deve falhar); cliente→cancelar
próprio recebido (passa); anônimo→qualquer leitura de pedido (negado).

## 4. TANCA física (só E6)

Sem impressora: validar fila + contadores (B6). Com impressora: apontar o
print-agent ao staging (`.env` do agente), job `tipo=teste`, 1 pedido = 1
cupom, falha simulada sem duplicar, reimpressão nova linha + contador.

## 5. Smoke por papel (app em staging)

Atendente cria→aceita; produção libera→prepara→confere→pronto; central
atribui→motoboy aceita→sai→entrega; retirada com confirmação; agendado
retido até a janela; Pix pendente → análise; queda de internet → reconexão
sem duplicata (repetir ação 2× seguidas em cada etapa).

## 6. Rollback (se algo falhar)

Flags continuam off (comportamento legado intacto). Reversão de banco:
drops compensatórios na ordem inversa (policies/triggers → funções →
índices → colunas). Nunca destrutivo sem backup.

## 7. GO para ativação (etapa futura, com nova autorização)

Todas as seções 1–5 verdes + layouts idênticos aos previews + backup do
staging. Só então se discute ligar flags, uma por vez, em produção.
