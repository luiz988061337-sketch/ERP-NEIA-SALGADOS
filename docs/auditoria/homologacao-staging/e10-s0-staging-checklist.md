# E10-S0 — Verificação final antes do staging (somente leitura)

> Nada foi criado/aplicado remotamente. Proteger-dev continua bloqueando
> o `.env` atual (produção). Este documento é planejamento local.

## 1. Auditoria da cadeia (veredito)

- Pular 0061/0062/0063/0073 com 0077 aplicada: **SEGURO**. 0077 declara
  autossuficiência (`0077:2-5`), recria `enfileirar_cupom`/triggers com
  sintaxe válida e absorve 0061 (backfill `0077:259-284`); 0062/0063 têm
  sintaxe inválida (`CREATE OR REPLACE TRIGGER`, `PERFORM PERFORM`) e não
  aplicam limpos. Perdas intencionais: `gerar_cupom_pedido()` (substituída)
  e policies Pix antigas (substituídas por versões restritas `0077:100-124`).
- 0059/0060: necessários ao Pix **sem** 0077; **puláveis com** 0077 (que já
  os cria hardenados `0077:47-90`). Nunca levar a RLS aberta de 0059/0060
  a produção.
- 0079: único `ADD VALUE` (`app_role/contador`) — rodar a linha isolada.
- 0084 depende só de objetos ≤0083; 0085 só do guard. Ordem: base → 0083
  → (saneamento zerado) → 0084 → 0085.
- **Correção à ordem documentada**: `0074` deve ser PULADA (guard bugado;
  a 0085 já inclui o bypass `service_role`); `0070` MANTIDA (policies +
  claim, que a 0085 não recria). `0077:286-357` reseta o guard — por isso
  a 0085 vem por último e o `pg_get_functiondef` valida o final.

## 2. Proteger-dev: funciona e tem limites (verificado por leitura)

- Bloqueia `dev/preview/smoke` contra produção (ref + broker + fail-closed),
  nunca imprime valores, bypass só via `__LOVABLE_PROJECT_ID`.
- **NÃO cobre**: print-agent, push-agent, Supabase CLI, SQL Editor, invoke
  direto de Edge functions, APK. Esses são os vetores reais de escrita
  acidental em produção durante a homologação.

## 3. Referências fixas a produção (risco real)

- `supabase/config.toml:1` (`project_id` prod): `supabase link/push`
  sem `--project-ref` de staging mira produção — **sempre passar a flag**.
- `.lovable/mcp/manifest.json:7` (issuer prod): regenerar por ambiente.
- Comentários `PASSO-*/APLIQUE-ESTAS` mandando colar no projeto prod:
  risco humano — conferir o ref do editor antes de cada bloco.
- Sem chaves/emails reais no código (só placeholders). `eyJ` em lockfiles
  são hashes, não JWT.

## 4. Escritores externos (isolar todos do staging salvo decisão)

- Edge que escrevem: `pix-confirm` (baixa pagamento real, recusa fora de
  PRODUCTION), `pix-notification/match-order`, `fiscal-emitir` (**emite
  nota real se ambiente=producao**), `push-enviar` + `push-agent` (push real),
  `enviar-lembretes` (insere lembretes), `resgatar-fidelidade` (débito real).
- `print-agent`/`push-agent`: consomem fila/escrevem status com a credencial
  do `.env` deles — **não apontar para prod; pausar o agente da loja ou
  redirecionar antes dos testes de fila**.
- Sem cron ativo no repo; não criar `pg_cron` apontando para prod.

## 5. Env vars do staging (nomes, sem valores)

Front: `VITE_SUPABASE_URL`(+alt), `VITE_SUPABASE_PUBLISHABLE_KEY`(+alts),
`VITE_SUPABASE_PROJECT_ID`, `NEIA_AMBIENTE=staging`. Server: `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`. Edge no projeto staging: as duas + `VAPID_*`
(push), `LOVABLE_CRON_SECRET` (lembretes). Agent: `SUPABASE_URL` + (service
role OU anon+staff) + `PRINTER_NAME` etc. Flags `VITE_FF_*` default off.
Maps/VAPID têm fallback (funcionam degradados).

## 6. Checklist manual de criação (você executa)

1. supabase.com → New project `neia-teste` (região próxima, senha forte
   anotada fora do repo). Anotar o **ref** (URL `/project/<REF>`).
2. SQL Editor do NOVO projeto: cadeia base em ordem (doc E10-S0 §cadeia),
   `0079:5` isolada, pular 0061–0063/0073/0074, depois 0084, depois 0085.
3. Saneamento §13 da 0084 zerado antes da 0084; §A verde após 0084+0085;
   `pg_get_functiondef` = 0085 (sem bug, com bypass).
4. `.env` atual em backup fora do repo; apontar cópia ao staging;
   `npm run dev` deve imprimir "ambiente validado".
5. 6 usuários (Auth → Add user, Auto Confirm) + `user_roles` 1 papel cada
   (ver §7). Senhas fortes distintas, em gerenciador — nunca no repo/chat.
6. Agentes/Edges: NADA apontado a prod; fiscal em homologação; push sem
   assinaturas reais; print-agent parado ou no staging.
7. Smoke por papel; baterias `-PG`; TANCA física por último.

## 7. Seis usuários fictícios (planejamento, NÃO criar agora)

`admin@staging.teste`, `atendente@staging.teste`, `producao@staging.teste`,
`motoboy@staging.teste`, `financeiro@staging.teste`, `contador@staging.teste`
— 1 papel cada (multi-papel invalida testes de negação, lição da E10).
Senhas: 16+ caracteres aleatórios por usuário, guardadas fora do repo;
excluir os 6 ao encerrar a homologação.

## 8. Rollback e interrupção

- App: flags off = legado intacto (nenhuma migração de comportamento).
- Banco: drops compensatórios na ordem inversa (policies/triggers →
  funções → índices → colunas) + restore do backup do projeto.
- **Parar imediatamente se**: ref do editor ≠ `neia-teste`; qualquer
  escrita fora do staging; segredo em log/chat; `pg_get_functiondef`
  divergente; suite `-PG` vermelha; fila impressa fora do staging;
  drill de PII real (abortar e limpar).

## 9. Próximo passo seguro (após autorização explícita)

E10-S1: você cria o projeto e executa §6; eu conduzo verificação (§A),
baterias `-PG`, RLS por papel e TANCA, um bloco por vez, parando em
qualquer divergência.
