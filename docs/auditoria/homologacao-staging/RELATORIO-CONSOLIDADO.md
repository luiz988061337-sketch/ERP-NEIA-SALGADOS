# Relatório consolidado — ERP Néia Salgados (ciclos A–F)

> **Ambiente:** local. **Nada foi aplicado, commitado, enviado ou publicado.**
> Nenhum acesso ao Supabase real, nenhuma migration executada, nenhuma flag
> ligada, nenhum dado real alterado, nenhuma impressão/mensagem/pagamento real.
> Layouts aprovados K7.2, K8.1 e K9 preservados; L1 não foi revivido.

---

## A. Escopo e regras respeitadas

- Trabalho 100% local e reversível; dependências externas bloqueadas foram
  registradas, sem paralisar o restante.
- Nenhuma regra comercial, composição, coordenada, comportamento de GPS ou
  lançamento financeiro foi inventado.
- Enquanto as flags estão **OFF**, o comportamento legado permanece intacto.
  Quando **ON**, não existe fallback inseguro (sem insert direto em
  `reservas_estoque`, sem compensação por `DELETE`, sem UPDATE direto de
  cancelamento).
- As 19 reservas históricas (18 pedidos entregues / 215 unidades) **não** foram
  reconciliadas automaticamente.
- A 0094 foi tratada como **ativa/cutover**, não como inerte.
- Nenhuma reserva nova do fluxo controlado pode nascer com `controlado=false`:
  o cutover é coordenado (ver §D).

## B. Correções locais aplicadas (comportamento verificável)

| # | Arquivo | Correção | Impacto |
|---|---------|----------|---------|
| B1 | `src/hooks/useGpsTracking.ts` | *debounce* → *throttle* com a posição mais recente; erros do Supabase vão para a fila offline | Corrige a causa do “GPS atrasado”: o timer de 15s era reiniciado a cada posição e nunca disparava em movimento |
| B2 | `src/routes/central-entregas.tsx` | aplica `cabeNaRota` (3 paradas) antes de criar rota | Bloqueia rota com 4+ paradas sem autorização |
| B3 | `src/routes/motoboy.tsx` | mesma regra de 3 paradas em `salvarRota` | Consistência com a central |
| B4 | `src/routes/financeiro.tsx` | importação de extrato deduplicada por `arquivo+linha` | A `UNIQUE (conta_bancaria_id, referencia)` não protege NULL; reimportação duplicava |
| B5 | `src/routes/financeiro.tsx` | conciliação com *claim* (`status='pendente'`) e rollback para pendente | Evita conciliação dupla e conciliação silenciosa quando o destino já mudou |
| B6 | `src/lib/impressao.ts` | janela determinística de 10s no `trabalho_uuid`; `23505` = já enfileirado | Evita cupom duplicado por duplo clique sem bloquear reimpressão |
| B7 | `src/lib/pedido-status.ts` + `src/lib/erros.ts` | mensagens claras das proteções financeiras da 0094 | Operador entende “pagamento confirmado não volta”, “cancelado não recebe confirmação”, “cancelado não reabre” |

## C. Preparações atrás de flags (OFF)

### C1. Criação atômica (0095) nos três canais

- `checkout.tsx`, `pdv.tsx`, `atendente.tsx` usam
  `decidirCriacaoAtomica` (`src/lib/criacao-atomica.ts`):
  - **flag OFF** → `{ modo: "legado" }`: caminho antigo intacto;
  - **flag ON + sucesso** → `{ modo: "atomico" }`: o bloco legado é pulado;
  - **flag ON + gate/erro** → `{ modo: "erro" }`: **aborta**, sem fallback.
- `ATTESTACAO_CRIACAO` é o ponto único de declaração das dependências; hoje
  tudo `false` (gate `preparado`). Ligar a flag sem attestation não executa nada.
- 0095 ganhou:
  - **taxa de entrega** server-side: `loja_config.taxa_entrega` quando existir;
    ausente → **R$ 6** (preserva o comportamento atual); `retirada` = 0;
  - **desconto manual** apenas para `pdv`/`atendente` com papel
    `admin|atendente`; numérico ≥ 0; somado ao cupom; limitado ao subtotal;
    total nunca negativo. O checkout não aplica desconto manual.
- Montagem **não** foi modelada por invenção: continua rejeitada com
  `montagem_sem_modelagem` e a cobertura a trata como `montagem`.

### C2. Cancelamento atômico (0093)

- `admin.tsx` (`mudarStatusPedido`) e `pedido.$id.tsx` (`cancelar`) usam
  `decidirCancelamentoAtomico`:
  - **flag OFF** → legado (inclui `liberar_reserva_atomica` + UPDATE direto);
  - **flag ON + sucesso** → RPC cancelou/liberou; legado não roda;
  - **flag ON + erro/gate** → aborta, sem UPDATE direto.
- No checkout, a compensação de falha de reserva é pulada no modo atômico.

### C3. Produção (0091)

- Em `producao.tsx`, “Iniciar preparo” (equivalente operacional à retirada do
  congelado) consulta as reservas ativas e chama `registrarConsumoAtomico` por
  reserva (idem key = id da reserva; retirada parcial suportada pelo contrato).
  - **flag OFF** → segue sem consumo; layout K7.2 intacto;
  - **flag ON** → registra e **aborta o avanço** se falhar.
- Defesa **preparada e não instalada**: `exigir_consumo_producao()` (0095)
  bloqueia a saída de `recebido` quando `controlado=true` e houver reserva ativa
  sem retirada física registrada.

## D. Migrations e cutover (nada aplicado)

- **0087–0095** preparadas/hardened, **não aplicadas**. `0086` arquivada.
- **0094 NÃO é inerte:** instala `trigger_proteger_consistencia_financeira`
  (BEFORE UPDATE de `status`/`pagamento_status`) e recria `enfileirar_cupom`.
  Cabeçalho corrigido para “ATIVA / CUTOVER”.
- **0088 substitui a RPC viva** `reservar_estoque_atomica` (único chamador: o
  checkout legado). Depois de migrar todos os chamadores para 0095/0089, a 0088
  **pode permanecer não instalada**. Se instalada, somente no cutover.
- **0095** implementa:
  - idempotência (`pg_advisory_xact_lock`), autorização por canal, canal nunca
    concede privilégio;
  - preço server-side (`COALESCE(preco_promocional, preco)`), cupom revalidado
    com `FOR UPDATE`, pagamento derivado (Pix nunca nasce pago);
  - atomicidade pedido+itens+0089+histórico com rollback integral;
  - cobertura **somente `coberto`** é aceita pelo gate; montagem não é cobertura;
  - defesa de produção (`exigir_reserva_producao`) e de consumo
    (`exigir_consumo_producao`) **preparadas, sem trigger instalado**.
- **Sequência correta de cutover** (documentada no cabeçalho da 0095 e em
  `integracao-criacao-atomica.md` §7):
  1. estruturas inertes (0087 + 0092; 0091/0093/0095 não alteram comportamento
     sozinhas);
  2. código novo com todas as flags **OFF**;
  3. testes transacionais em PostgreSQL isolado;
  4. migrations ativas (0088 se ainda necessário; 0094);
  5. deploy com flags OFF;
  6. janela de corte: remover caminhos legados;
  7. `controlado=true` **e** habilitar as flags dos novos fluxos **na mesma
     janela**;
  8. smoke tests;
  9. contingência (reverter flags; §5 da 0094 para recriar o cupom/dropar o
     trigger).
- **Regra rígida:** nunca habilitar 0089/0095 com `controlado=false` — a 0089 só
  grava `reserva_proveniencia` quando `controlado=true`, e a 0090 pode rejeitar
  reserva sem marcador no cancelamento.

## E. Bloqueios externos (não resolvíveis localmente)

1. **Sem PostgreSQL local:** testes transacionais (duas sessões, concorrência,
   rollback, RLS/ownership, `proowner` × `relowner`, EXECUTE aninhado) pendentes.
2. **19 reservas históricas** (18 entregues / 215 unidades) não reconciliadas.
3. **Gatilhos de produção/consumo** não podem ser instalados antes da
   reconciliação e do `controlado=true`.
4. **Reconciliação de pedidos `recebido` históricos** para permitir o gate de
   produção.
5. **Compensações legadas por `DELETE`** (`pdv.tsx:383`, `atendente.tsx:318`):
   não há política/grant de DELETE para `authenticated` → falham em silêncio;
   no modo atômico não rodam. Corrigir exigiria política/RPC autorizada.
6. **Criação de rota multi-requisição** (rota → rota_pedidos → pedidos) não é
   atômica; exigiria RPC própria.
7. **Montagem** sem `produto_id` + quantidade por componente (ver §F).

## F. Riscos residuais

- **Montagem:** `combo.tsx` grava `produtoId: null`, preço de constante do
  frontend e sabores só no texto de `nome`. Não há composição estruturada;
  qualquer cobertura automática seria invenção. Fluxo legado permanece; o novo
  fluxo rejeita com `montagem_sem_modelagem`.
- **Caminhos legados com flag OFF** continuam existindo (por desenho) até o
  cutover; isso inclui `liberar_reserva_atomica`, UPDATE direto de cancelamento
  e o loop de reserva do checkout.
- **0094** muda comportamento ao ser instalada; não aplicar fora da janela.
- **DRE:** mantém o contrato testado (`bruta` inclui cancelados; `liquida`
  exclui). Não foi alterado para não quebrar relatórios existentes.

## G. Decisões comerciais/operacionais pendentes

1. Modelagem da montagem (componentes físicos com `produto_id` e quantidade).
2. Taxa de entrega: manter R$ 6 (default atual) ou configurar
   `loja_config.taxa_entrega`.
3. Desconto manual: confirmar papéis autorizados e se o checkout deve permitir
   (hoje: não).
4. Retirada parcial na produção: definir se haverá UI dedicada (o contrato 0091
   já suporta; a UI atual registra a quantidade cheia no “Iniciar preparo”).
5. Autorização de 4ª+ parada por rota (hoje bloqueada; não há fluxo auditável).
6. Política de reabertura de pedido cancelado (hoje bloqueada pela 0094; não há
   fluxo autorizado).

## H. Evidências de teste (executadas localmente)

- `npm run typecheck` — **OK**.
- `npm run build` — **OK** (Vite/Nitro).
- `npm run teste:criacao` — **201 asserções** estáticas (SQL transacional não
  executado).
- `npm run teste:criacao-wrapper` — **53 casos** locais (gate, parser, mocks).
- `npm run teste:integracao` — **62 casos** locais (0089/0091/0093, mocks).
- Suíte local completa — **23 arquivos `*.test.mjs` passando** (fases, Pix,
  insumos, OFX, precificação, competência, financeiro-M, auditoria, E1–E10,
  previews, proteção de dev).
- Nenhum teste transacional real foi executado (sem PostgreSQL isolado).

## I. Próximos passos (quando autorizado)

1. Subir PostgreSQL isolado e rodar `verify-0095.sql` (POST) + T1–T20 +
   concorrência/rollback/RLS.
2. Reconciliar as 19 reservas históricas (migration separada, com aprovação).
3. Aplicar estruturas inertes e validar; depois 0094 e, se necessário, 0088.
4. Deploy do código com flags OFF; smoke tests.
5. Janela de cutover: remover caminhos legados → `controlado=true` → ligar as
   flags dos três canais → smoke tests → observar.
6. Só então instalar os gatilhos de produção/consumo.
7. Decidir montagem, taxa e desconto antes de ligar a criação atômica em
   produção.

---

### Arquivos novos/alterados nesta etapa (local, não commitado)

- **Novos:** `drizzle/migrations/0095_criar_pedido_com_reserva.sql`,
  `src/lib/criacao-atomica.ts`, `scripts/criacao-atomica.test.mjs`,
  `scripts/criacao-atomica-wrapper.test.mjs`,
  `docs/auditoria/homologacao-staging/verify-0095.sql`,
  `docs/auditoria/homologacao-staging/integracao-criacao-atomica.md`,
  este relatório.
- **Alterados:** `0094` (cabeçalho), `0088` (cabeçalho),
  `src/lib/reserva-integracao.ts`, `src/lib/erros.ts`,
  `src/lib/pedido-status.ts`, `src/lib/impressao.ts`,
  `src/hooks/useGpsTracking.ts`, `src/routes/checkout.tsx`,
  `src/routes/pdv.tsx`, `src/routes/atendente.tsx`, `src/routes/admin.tsx`,
  `src/routes/pedido.$id.tsx`, `src/routes/producao.tsx`,
  `src/routes/central-entregas.tsx`, `src/routes/motoboy.tsx`,
  `src/routes/financeiro.tsx`, `package.json` (scripts de teste).
- **Observação:** vários outros arquivos já estavam modificados antes desta
  etapa (ex.: `gestao.tsx`, `contador.tsx`, `equipe.tsx`, `pix/event.ts`) e foram
  preservados.
