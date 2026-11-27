# Estoque Operacional — preparação final enquanto a Central da Atendente é finalizada

Data: 27/11/2026. Worktree isolada `estoque-operacional-vinculos`. Checkpoint
preservado: commit `fcd7f052fa9f6a7a177e70cf59a2eb4055856e06`, tag
`checkpoint-estoque-operacional-vinculos-local-01`.

Escopo desta frente: somente documentação, scripts locais, ensaio descartável e
leituras. **Não houve** push, merge, deploy, carga remota, aplicação de migration,
escrita remota, acesso a produção, alteração de UI, menu, painel lateral ou
atalhos. Os testes já aprovados no checkpoint **não foram repetidos**. Os
documentos de preflight preparados anteriormente foram preservados.

## 1. Reversão não destrutiva da `0129`

Arquivos criados:

- `scripts/reverter-0129-estoque-operacional-nao-destrutivo.sql`
- `scripts/estoque-pg17/reversao-setup.sql`
- `scripts/estoque-pg17/verificar-reversao.sql`
- `scripts/estoque-pg17/executar-reversao.ps1`

Estratégia aprovada para preparação local: **neutralização funcional sem apagar
nada**. O script:

1. exige a versão `20261126190000` no histórico e todas as tabelas/views/RPCs
   esperadas;
2. força `modo = 'monitoramento'`, `habilitado = false` e
   `protecoes_essenciais = true` em `salgados_operacao_config`;
3. registra auditoria em `admin_logs`;
4. revoga `SELECT` de `authenticated` nas 10 tabelas/views criadas pela `0129`;
5. revoga `EXECUTE` de `authenticated` nas 21 funções criadas/concedidas pela
   `0129`;
6. mantém pedidos, reservas, lotes, compromissos, solicitações, autorizações,
   bloqueios, movimentações, policies, RLS, funções, views e histórico;
7. **não** contém `DELETE`, `DROP`, `TRUNCATE`, remoção de coluna, remoção de
   enum ou exclusão de linha de `schema_migrations`;
8. é idempotente: repetir a execução mantém o mesmo estado operacional.

Limites explícitos: o rótulo `caixa` em `app_role`, colunas, constraints, índices
e tabelas permanecem instalados, porém inertes para o transporte
`authenticated`. Uma remoção DDL completa seria destrutiva, exigiria aprovação
específica e não foi preparada.

### Ensaio local

`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/estoque-pg17/executar-reversao.ps1 -Scratch C:\Users\User\AppData\Local\Temp\opencode`

Resultado: **OK** em PostgreSQL 17 descartável. Foram aplicadas a plataforma
sintética, as migrations locais até `0128`, a `0129`, a `0133`, a fixture e
marcadores criados pelas próprias RPCs. Depois das reversões — executadas duas
vezes para confirmar idempotência — a verificação confirmou:

- `modo = monitoramento`, `habilitado = false`, proteções essenciais ativas;
- `pedidos = 4`, lote marcador `1`, reserva marcador `1`, compromisso marcador
  `1`, solicitação e bloqueio preservados, movimentações preservadas;
- histórico `20261126190000` e `20261127230000` intacto;
- nenhuma das tabelas/views/RPCs revisadas acessível a `authenticated`;
- enum `caixa` e RLS das tabelas operacionais mantidos.

Evidência: `C:\Users\User\AppData\Local\Temp\opencode\neia-reversao-pg17-0b3afb22835d435f9dbd3c419e257677\sql.log`.
Nenhum banco remoto foi contatado.

## 2. Reversão da `0133`

Arquivo criado: `scripts/reverter-0133-acl-reserva-estoque-dia.sql`.

A reversão remove somente o `EXECUTE` de `authenticated` em:

- `public.reservar_estoque_atomica(uuid,uuid,integer)`
- `public.reservar_pedido_atomico(uuid)`

Pré-condições: versão `20261127230000` presente, papel `authenticated` presente
e ambas as assinaturas existentes. Pós-condições: `PUBLIC`, `anon`,
`authenticated` e `service_role` sem `EXECUTE`; `SECURITY DEFINER` inalterado.
Não há alteração de corpo, owner, `search_path`, RLS, papéis, dados ou histórico;
a `0098` não é reaplicada. A reversão é idempotente e foi executada duas vezes
no mesmo ensaio local com resultado `OK`.

Ordem de reversão: `0134`/`0133` primeiro, depois `0129`. Nunca apagar linhas de
`schema_migrations` para “consertar” o histórico.

## 3. Variáveis locais herdadas — somente identificação, sem segredos

Auditoria feita por nome/classe, **sem imprimir valores**:

| Variável | Estado | Ação do operador |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Presente; aponta `ruioyioynwwwiqbjznoa` | Substituir no processo por `https://lflzlcqinarrcgncafol.supabase.co` antes de qualquer comando de homologação. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Presente; valor não exibido e não classificado por projeto | Conferir/substituir pela chave publicável de homologação no terminal, sem imprimir. |
| `PGPASSWORD` | Presente; valor não exibido | Limpar ou substituir no terminal; não herdar em operações do ERP. |
| `VITE_SUPABASE_PROJECT_ID` | Ausente | Declarar `lflzlcqinarrcgncafol`. |
| `NEIA_PROJETO_ALVO` | Ausente | Declarar `lflzlcqinarrcgncafol`. |
| `NEIA_AMBIENTE` | Ausente | Declarar `homologacao`. |
| `VITE_DEMO_PREVIEW` | Ausente | Declarar `0`. |
| `SUPABASE_URL`, `SUPABASE_PROJECT_ID`, `SUPABASE_SERVICE_ROLE_KEY`, `LOVABLE_DB_MIGRATION_URL`, `LOVABLE_CRON_SECRET`, `PIX_WEBHOOK_SECRET` | Ausentes | Nada a corrigir. |

Não há `.env` local. `.env.example` e `.env.production` existem e **nenhum dos
dois contém referência de projeto**; `.env.production` contém somente flags.
Nenhum arquivo de ambiente, segredo, configuração da Vercel ou banco foi
alterado. A barreira continua sendo a autoridade: sem override, a validação
bloqueou corretamente; com homologação declarada no processo e
`--project-ref lflzlcqinarrcgncafol`, retornou “destino autorizado”.

Modelo seguro por comando (valores de homologação declarados no processo, não
em arquivo versionado):

```powershell
$env:VITE_SUPABASE_URL = 'https://lflzlcqinarrcgncafol.supabase.co'
$env:VITE_SUPABASE_PROJECT_ID = 'lflzlcqinarrcgncafol'
$env:NEIA_PROJETO_ALVO = 'lflzlcqinarrcgncafol'
$env:NEIA_AMBIENTE = 'homologacao'
$env:VITE_DEMO_PREVIEW = '0'
npm run seguranca:destino -- --project-ref lflzlcqinarrcgncafol
```

## 4. Integração segura com a branch oficial e a `0134` do Codex

- `git fetch origin` permaneceu somente leitura. Topo oficial mais recente:
  `4c703e4…` (“Prepara homologação final da Central da Atendente”), acima de
  `0a38fd6…` e `e36c0bc…`.
- O Codex informou que `0134`, `0135` e `0136` já estão aplicadas em
  homologação. A branch oficial contém `0130`–`0132`, `0134`, `0135` e `0136`;
  **não contém** `0129` nem `0133`. Inspeção das três: `0134` altera apenas
  prazo comercial e a vinculação de `pedidos_guard_update_trg`; `0135` cria
  policies de `realtime.messages`; `0136` cria
  `consultar_recebimento_retirada(uuid)` e o gatilho de quitação na retirada.
  Nenhuma toca `criar_pedido_com_reserva`, `reservar_pedido_atomico`, `0129`,
  `0133` ou grants de reserva.
- Base comum: `e50e750d075c4a0d928a23a14c0b81a2c5ac3a86`. Esta worktree tem
  `9cab907` e `fcd7f05` após essa base; as linhas divergiram.
- Integração futura, somente após autorização: worktree isolada, commits
  normais, conferência da base atual e dos conflitos. **Proibido** force push,
  rebase/amend de histórico publicado e alteração de `main`.
- As numerações `0134`–`0136` pertencem ao Codex e **não devem ser criadas,
  renumeradas ou duplicadas nesta frente**. A corretiva B7 segue como rascunho
  **sem numeração definitiva**, a coordenar a partir de `0137`. Ordem já
  aplicada: `0129` → `0130`/`0131`/`0132` → `0133` → `0134` → `0135` → `0136`;
  a corretiva viria depois. Se qualquer migration publicada alterar assinaturas
  ou objetos tratados pelas reversões, parar e renegociar antes de aplicar.
- Antes de qualquer escrita, repetir as consultas somente leitura já
  preservadas em `docs/estoques/`, com destino explícito, e confirmar o catálogo
  real. A presença de arquivos no Git não comprova aplicação no banco.
- A documentação do Codex ainda registrava migração, flags, integração e
  publicação como pendentes; o SHA efetivamente servido no endereço oficial
  não pôde ser lido sem autenticação da Vercel.

## 5. Pontos de consumo das RPCs operacionais

Mapeamento somente leitura; nenhum arquivo do Codex foi alterado.

| Fluxo | Consumo atual | Dependência/pendência para o contrato `0129` |
| --- | --- | --- |
| Checkout | `src/routes/checkout.tsx:1288-1299` → `decidirCriacaoAtomica(..., canal: "checkout")`; via `src/lib/criacao-atomica.ts:455` chama `criar_pedido_com_reserva`. A `0095` chama `reservar_pedido_atomico` internamente. Ramo legado (fora do corte) chama `reservar_estoque_atomica` em `:1411`. | Não há chamada a `avaliar_venda_salgado` nem `registrar_compromisso_salgado`. `types.ts` não contém essas RPCs. Conflito conhecido: `0095_criar_pedido_com_reserva.sql:444-453` aceita `agendado_para` futuro e `:912-920` sempre reserva. |
| PDV | `src/routes/pdv.tsx:331-361` → `decidirCriacaoAtomica(..., canal: "pdv")`, com `agendado_para` (`:343`) e `pagamento_imediato` (`:345`). | Nenhuma RPC `0129` chamada. Venda imediata hoje depende de reserva física presente via `0095`, não de estoque futuro. Interface “Estoque do dia” adiada. |
| Aceite da Central | `src/components/central-pedidos.tsx:178-211` → `executarAceiteAtendente()`; `src/lib/atendente-aceite.ts:100,181` chama `aceitar_pedido_atendente`. Criação pelo atendente em `src/routes/atendente.tsx:479-497` usa `0095`. | Filtro de notificações em `central-pedidos.tsx:146-155` inclui só `pedido_pronto_caixa` e `pedido_liberado_retirada`; falta `salgados_resposta`. Não há chamada a `solicitar_salgado`, `responder_solicitacao_salgado`, `reconhecer_resposta_salgado` nem `usar_autorizacao_salgado`. |
| Produção/Cozinha | `src/routes/producao.tsx:145-155` → `registrarConsumoAtomico()`/`registrar_consumo_reserva` na retirada explícita; leitura de reservas em `:320-333`. Transições reais usam `preparar_remessas_producao`/`conferir_remessas_producao` em `:1210-1212`. | Não há chamada a `avaliar_preparo_salgado`, `bloquear_sabor_salgados` nem `desbloquear_sabor_salgados`. `liberar_pedido_cozinha`/`conferir_pedido_cozinha` não debitam reserva. |
| Cancelamento | `src/routes/pedido.$id.tsx:423-427` e `src/components/admin/pedidos-h02.tsx:336` → `decidirCancelamentoAtomico()`/`cancelar_pedido_atomico`. Ramo legado (`:444-459`) usa `liberar_reserva_atomica` + UPDATE direto. | Não há chamada a `liberar_reserva_sabor`. A liberação de estoque atual é da `0093`. Bloqueio por sabor/data não cancela pedido confirmado pela `0129`. |

Ponto adicional: `src/components/admin/estoque/salgados-admin.tsx:692` é o único
chamador real de `movimentar_lote_salgado` em `src/`. `src/lib/estoque-dia.ts`
contém apenas contratos/classificadores puros: nenhuma chamada `.rpc()`.

Flags lidas em tempo de build por `src/lib/corte.ts:50-70`:
`VITE_FF_CRIACAO_ATOMICA`, `VITE_FF_CONSUMO_RESERVA` e
`VITE_FF_CANCELAMENTO_ATOMICO` em `on`; `VITE_FF_RESERVA_ATOMICA` em `off` por
arquitetura (a `0089` é interna da `0095`). Há divergência documental em
`VITE_FF_ACEITE_ATENDENTE`. Nenhuma flag foi alterada nesta frente.

Arquivos sob responsabilidade do Codex, **não editados**: `central-pedidos.tsx`,
`pdv.tsx`, `checkout.tsx`, `admin-shell.tsx`, `admin-nav.ts`, `admin.tsx`, CSS
aprovado em `src/components/admin/estoque/`, `client.ts`, `types.ts`,
wrappers/gates (`criacao-atomica.ts`, `reserva-integracao.ts`), cardápio
público e menu lateral. A rota `/atendente` já existe e não foi recriada.

## 6. Continuidade comercial e agendamentos

- `reservar_sabor_estoque` com `p_data > hoje` responde `analise_necessaria`
  antes de lock, consulta de lote, INSERT ou UPDATE (`0129:832-839`); não cria,
  altera nem cancela reserva. Agendamentos legítimos usam
  `registrar_compromisso_salgado` (`0129:1312-1359`), que grava compromisso
  pendente, nunca lote ou estoque fictício.
- `cobrir_compromissos_salgados` usa cobertura real por lote, PK
  `(compromisso_id, lote_id)` e `acao_idempotencia`; a consulta read-only
  preparada sinaliza pedido confirmado sem cobertura e reserva ativa coexistente.
- Decisões aprovadas em `docs/projeto-diretor/estoque-salgados/decisoes-operacionais-27-11-2026.md:80-88`:
  pedidos agendados não são limitados ao estoque físico atual; falha técnica,
  não inventariado e margem atingida não são interpretados como esgotamento no
  modo padrão `monitoramento`.
- **B7 tratado localmente, não aplicado:** a definição efetiva (`0103`) cria
  pedido com `agendado_para` futuro e chama `reservar_pedido_atomico` no
  nascimento. A corretiva em rascunho separa venda imediata, agendamento com
  cobertura, agendamento dependente de fabricação e agendamento sem cobertura,
  preservando a base e a guarda de pedidos. O ciclo completo foi ensaiado:
  solicitação → análise → aprovação/recusa → compromisso → pedido definitivo
  → cobertura por lote real → reserva física → cancelamento e liberação, com
  idempotência e sem cobrança antes da confirmação autorizada. Detalhes e
  dependências: `docs/estoques/correcao-b7-agendamentos.md`.
- Conclusão: não há bloqueio comercial introduzido por esta frente. Não é
  possível afirmar conformidade plena em homologação até que `0129`/`0133` e a
  corretiva B7 sejam aplicadas, registradas e validadas com dados reais.

## 7. Estado final e interrupção da frente

- Checkpoint 01 (`fcd7f05…`) preservado. O trabalho desta etapa foi consolidado
  no commit do checkpoint 02, tag `checkpoint-estoque-operacional-vinculos-local-02`;
  detalhes em `docs/estoques/relatorio-checkpoint-local-02.md`.
- Documentos de preflight preservados:
  `preflight-integracao-homologacao-objetivo.md`,
  `consulta-preflight-integracao-readonly.sql`,
  `consulta-preflight-compromissos-readonly.sql`,
  `consulta-preflight-vinculos-readonly.sql` e
  `consulta-preflight-atomicidade-readonly.sql`.
- Consolidados no checkpoint 02: este relatório, os scripts de reversão
  `0129`/`0133`/B7, o rascunho da corretiva B7, o contrato atualizado, o contrato
  de edição de pedidos, o guia de continuidade, o setup, os verificadores e os
  executores descartáveis. A carga e a reversão exemplificativas de 26 sabores
  foram conferidas por leitura: idempotência por sabor, lote com prefixo
  `HOMOLOGAÇÃO-TESTE`, reversão pela mesma RPC com `p_saldo_esperado` e sem
  `DELETE`; nenhuma foi aplicada em banco remoto.
- Nenhum push, merge, deploy, carga remota, migration remota ou acesso a produção.
- A frente fica **interrompida** até a conclusão da homologação da Central da
  Atendente e autorização expressa do proprietário.
