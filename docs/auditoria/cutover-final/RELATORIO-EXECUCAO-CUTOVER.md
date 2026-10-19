# RELATÓRIO DE EXECUÇÃO DO CUTOVER — ERP NÉIA SALGADOS

**Data:** 2026-10-19
**Build de corte:** `1792429500000` · `cutover-2026-10-19-a1`
**Bundle publicado (SHA local de referência):** `9d13ed828e09e2936bd74f38cf20c115e0dc39711eda7417f7bfce1ad2203d1d`
> O build não é byte-reproduzível (a plataforma injeta nomes/timestamps). O SHA
> identifica o artefato local; **a versão** é o invariante (usada pelo guard de
> versão e pelo `VERSAO_MINIMA`).

---

## 1. O QUE FOI EXECUTADO

### 1.1 Banco de produção (aplicação manual, SQL do pacote `docs/auditoria/cutover-final/`)

| # | Passo | Script | Resultado |
|---|-------|--------|-----------|
| 1 | Pré-checagem | `01_PRECHECK.sql` | ✅ `PRECHECK_OK` (estado pré-0087 confirmado) |
| 2a | Migrations 0087, 0089, 0090, 0091 | `02_MIGRATIONS-PARTE1.sql` | ✅ 4 objetos criados |
| 2b | Migrations 0092, 0093, 0094 | `02_MIGRATIONS-PARTE2.sql` | ✅ 3 objetos criados; `controlado=false` |
| 2c | Migrations 0095, 0096, 0097, 0098 | `02_MIGRATIONS-PARTE3.sql` | ✅ 4 objetos + coluna + seed + ACL |
| 3 | Configuração dos combos | `03_CONFIGURACAO-CUTOVER.sql` | ✅ `CONFIGURACAO_OK` |
| 4 | Fechamento do caminho legado | `08_LOCKDOWN-ACL.sql` | ✅ `LOCKDOWN_OK` |
| 5 | Verificação do banco | `05_VERIFY-POS-CORTE.sql` | ✅ `VERIFY_POS_CORTE_OK` |
| 7 | Ativação do regime | `04_ATIVAR-CONTROLADO.sql` | ✅ `CONTROLADO_OK` |
| — | Verificação consolidada (1 linha) | `VERIFICACAO-CONSOLIDADA.sql` | ✅ **`PRONTO_PUBLICAO`** |

**A 0088 NÃO foi aplicada.** As 11 migrations do corte foram: 0087, 0089, 0090,
0091, 0092, 0093, 0094, 0095, 0096, 0097, 0098.

### 1.2 Estado verificado (leitura independente, read-only)

```
ativas_sem_proveniencia   19      <- as 19 reservas historicas, em quarentena
unidades_em_quarentena   215      <- unidades reais (o fixture sintetico usava 95)
pedidos_na_janela         0      <- nenhum pedido criado pelo bundle antigo
marcadores / consumos / componentes   0 / 0 / 0   <- nada criado no regime novo
controlado                true
legadas_executaveis       0      <- caminho legado FECHADO para 'authenticated'
dml_legado_sobre_reserva  0
objetos_ok                10 / 10
coluna_combo_ok / combos_sem_preco   1 / 0
go                        PRONTO_PUBLICAO
```

### 1.3 Código e publicação

| Item | Estado |
|---|---|
| Commits publicados | `b092010` (regime atômico + pacote), `83211cf` (SHA), `7f9aacd` (verificação consolidada), `cef925e` (integração da dependência da plataforma) |
| Histórico do bot da plataforma | **preservado** (`4cab5fc`, `ac3dc3b`, `76ec492`) — rebase, sem force-push |
| `.env.production` versionado | ✅ 7 variáveis do corte |
| Prova do build da plataforma | `npm run build` **puro** (lendo `.env.production`) → versão `1792429500000` presente, **0 call sites legados**, fluxo novo (0095/0093/0091) e `/api/versao` presentes |
| `npm run typecheck` / `npm run build` | ✅ sem erro (com a nova dependência 2.26.5) |
| Suítes locais | ✅ 28/28 |
| PG16 | ✅ 189/189 · 79/79 · 17/17 · 12/12 · smoke 32/32 |
| Ensaio do pacote no clone | ✅ `PACOTE_OK` e `PACOTE_TX_OK` (8/8) |

---

## 2. GUARDAS DO PACOTE (o que impediu erros)

Durante a execução manual, as guardas *fail-closed* do pacote atuaram como
barreira e impediram escritas fora de ordem:

| Situação encontrada | Guarda que agiu | Resultado |
|---|---|---|
| `03_CONFIGURACAO` rodado antes das migrations | `DO $ordem$` (coluna `combo_preco_unit` ausente) | `NO-GO: rodou na ordem errada` — **nada escrito** |
| `08_LOCKDOWN` rodado antes das migrations | revokes independentes por objeto | `NO-GO: tabela pedido_item_componentes ausente` — demais revokes aplicados, resto pendente |
| `05_VERIFY` rodado antes do lockdown | checagem de `authenticated_executa` | `NO-GO: caminho legado ainda executavel` |
| `04_CONTROLADO` com estado inesperado | validação de `id=true` e `controlado` anterior | `NO-GO` sem alterar nada |

**Nenhuma escrita indevida ocorreu em produção.** As duas primeiras tentativas
abortaram antes de qualquer alteração; a correção foi reexecutar na ordem.

---

## 3. RISCO RESIDUAL E COMO FOI FECHADO

| Risco | Situação | Fechamento |
|---|---|---|
| Bundle antigo (pré-corte) aberto no navegador | Poderia criar pedido; o caminho de reserva estava fechado pelo lockdown | `VERSAO_MINIMA=1792429500000` no runtime + guard de versão (`/api/versao`) |
| Bundle antigo criando pedido **sem** reserva | O `INSERT` em `pedidos` continua liberado (necessário a motoboy/admin/produção/print-agent) | O caminho de **reserva** legado está fechado (0 DML, 0 EXECUTE) → pedido fica sem cobertura → `pedido_cobertura_reserva` devolve `sem_reserva` → cancelamento via 0093 **falha fechado, sem crédito** |
| Reservas sem proveniência | 19 históricas | Quarentena; reconciliação pós-cutover (pago, com decisão comercial) |
| Estoque físico × estoque contábil | Divergência de semântica (unidades × caixas) herdada do catálogo | **A confirmar com o responsável comercial** antes de abrir vendas |

---

## 4. ITENS QUE AINDA EXIGEM DECISÃO HUMANA

| # | Item | Quem decide |
|---|---|---|
| 1 | `VERSAO_MINIMA=1792429500000` no runtime do servidor (piso de versão) | Infra/DBA |
| 2 | `VERIFICACAO-CONSOLIDADA.sql` após a publicação (o `go` deve continuar `PRONTO_PUBLICAO` com `marcadores=0` antes do smoke) | DBA |
| 3 | **Semântica do estoque** dos 54 itens `combo_50` (unidades ou caixas) e das linhas duplicadas do mesmo sabor | Responsável comercial |
| 4 | Homologação física T1–T5 (TANCA TP-550/XP-80C) — **PENDÊNCIA OPERACIONAL PRÉ-GO-LIVE**; se a impressão automática for indispensável ao 1º dia e não houver contingência ⇒ **NO-GO OPERACIONAL** | Operação |
| 5 | Reconciliação das 19 reservas (pós-cutover, com conferência física e segunda aprovação) | Financeiro/admin |
| 6 | Definição do prazo de `VERSAO_MINIMA` pós-cutover | Técnico |

---

## 4.1 BLOQUEIO ATUAL: A PUBLICAÇÃO É UM PASSO MANUAL

O código está no repositório conectado e sincronizado com a Lovable, mas
**a publicação não é automática no push**. Verificado em tempo real:

| Verificação | Resultado |
|---|---|
| `GET https://neia-salgados.lovable.app/api/versao` (45 min de monitoramento, polling de 20 s) | **404 permanente** — a rota só existe no bundle novo |
| Hash de asset no HTML servido | **inalterado** (`__l5e/assets-v1/0e8b479e-…`) → nenhuma build nova publicada |
| `/api/versao` no `routeTree.gen.ts` commitado | ✅ presente (`id: '/api/versao'`) |
| `/api/versao` no bundle local | ✅ presente |
| Token/CLI de publish da Lovable no ambiente | ❌ **nenhum** |

Conclusão: o código está pronto e sem bloqueador de build (typecheck e build
locais passam com a nova dependência 2.26.5). **A publicação precisa ser
disparada no painel da Lovable.**

### Checklist do painel (Lovable)

1. Confirmar que o projeto mostra o código novo (o commit `c39ec77`).
2. **Variáveis de ambiente do projeto**: nenhuma das 7 `VITE_*` pode estar
   definida com valor divergente — `process.env` vence o `.env.production`.
   Se estiverem, corrigir/remover antes de publicar.
3. **Publicar** (deploy do bundle).
4. Validar:
   ```bash
   curl -s -D- https://neia-salgados.lovable.app/api/versao
   ```
   - `200` + `"atual":"1792429500000"` → bundle de corte no ar
   - `404` → **bundle antigo ainda no ar** → NÃO ABRIR VENDAS
5. Definir `VERSAO_MINIMA=1792429500000` no runtime do servidor.

> ⚠️ **Enquanto o bundle antigo estiver no ar, NÃO ABRIR VENDAS**: o lockdown
> já fecha o caminho de reserva legado, então o bundle antigo criaria pedido
> **sem reserva** (com `controlado=true`, a cobertura falharia fechada e o
> cancelamento via 0093 não liberaria crédito — seguro, porém o pedido ficaria
> sem reserva).

---

## 4.2 PUBLICAÇÃO VERIFICADA (2026-10-19, 18:08)

O bundle de corte está no ar em `https://neia-salgados.lovable.app`.

| Verificação | Resultado |
|---|---|
| `GET /api/versao` | **HTTP 200** |
| `cache-control` da rota | `no-store, no-cache, must-revalidate, max-age=0` |
| `pragma` | `no-cache` |
| Corpo | `{"ok":true,"atual":"1792429500000","minimo":"1792429500000","rotulo":"cutover-2026-10-19-a1","corte":true}` |
| `GET /` (documento) | **HTTP 200**, `cache-control: no-store` |
| Assets JS analisados | 37 |
| Versão `1792429500000` no bundle servido | **PRESENTE** (`/assets/index-Cwqg5fui.js`, `/assets/client-Qn_LD1iS.js`) |
| Marcadores legados no bundle servido | **0** |

> O **piso de versão já está ativo** (`minimo=1792429500000` veio do
> `.env.production` versionado). Definir `VERSAO_MINIMA` no runtime deixou de
> ser obrigatório — passa a ser útil para elevar o piso depois, sem novo deploy.

---

## 5. PASSOS RESTANTES

| # | Passo | Critério de sucesso |
|---|-------|---------------------|
| 1 | Confirmar `GET /api/versao` → `{"atual":"1792429500000","minimo":"1792429500000","corte":true}` | versão do bundle no ar |
| 2 | Definir `VERSAO_MINIMA=1792429500000` no runtime | piso ativo |
| 3 | `SELECT set_config('neia.exigir_controlado','true',false);` + `05_VERIFY-POS-CORTE.sql` | `VERIFY_POS_CORTE_OK` (agora exigindo `controlado=true`) |
| 4 | `06_SMOKE-DATABASE.sql` | `SMOKE_DATABASE_OK` |
| 5 | `07_QUARENTENA-19-RESERVAS.sql` | `QUARENTENA_OK` (19 em quarentena, 0 crédito) |
| 6 | **Smoke funcional** (14 cenários) — `TESTES-REAIS-POS-CORTE.md` | todos verdes, estoque conferido antes/depois |
| 7 | Bundle antigo bloqueado (tela "Atualização obrigatória") | verificado no navegador |
| 8 | **GO** — reabrir a loja | decisão registrada |

Qualquer divergência nos passos 3–7 = **NO-GO**, manter a loja fechada e
apresentar o erro. **Não improvisar correção em produção.**
