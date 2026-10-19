# Integração da criação atômica (0095) nos chamadores — DESENHO (não aplicado)

> Documento de preparação para autorização. **Nenhum chamador foi alterado nesta
> etapa.** O objetivo é fixar, sem ambiguidade, como a substituição do caminho
> legado pela RPC `criar_pedido_com_reserva` deve ser feita quando houver
> autorização, mantendo o comportamento atual enquanto a flag estiver desligada.

## 1. Estado atual dos chamadores (verificado no código)

| Chamador | Arquivo | Criação hoje | Reserva hoje | Compensação |
|---|---|---|---|---|
| Checkout | `src/routes/checkout.tsx` | `insert(insertBody)` + `pedido_itens` (linhas ~460–544) | Loop por item com `reservar_estoque_atomica` e **fallback direto** em `reservas_estoque` (linhas ~546–581) | `pedidos.delete()` se falhar itens |
| PDV | `src/routes/pdv.tsx` | `insert(...)` + `pedido_itens` (linhas ~287–337) | **Nenhuma** | `pedidos.delete()` se falhar itens |
| Atendimento | `src/routes/atendente.tsx` | `insert(insertBody)` + `pedido_itens` (linhas ~238–286) | **Nenhuma** | `pedidos.delete()` se falhar itens |

Observações:
- PDV e atendimento criam pedidos **sem reserva** hoje. Portanto, ativar a criação
  atômica em um canal sem migrar os demais deixaria o sistema inconsistente
  (C.7 do módulo de integração).
- Os três caminhos usam compensação por `DELETE`, que é insegura/inexistente para
  `authenticated` (sem policy/grant de DELETE em `pedidos`) — pedidos vazios podem
  persistir. A RPC 0095 elimina a necessidade de compensação (rollback no banco).

## 2. Contrato da RPC (referência)

```
public.criar_pedido_com_reserva(p_id uuid, p_canal text, p_dados jsonb, p_itens jsonb) RETURNS jsonb
```

- `p_canal ∈ {checkout, pdv, atendente}`.
- `p_dados`: somente campos não financeiros (ver cabeçalho da migration 0095).
- `p_itens`: `[{produto_id, nome?, quantidade, observacao?}]`.
- Financeiros (`subtotal`, `total`, `desconto`, `taxa_entrega`,
  `pagamento_status`, `pagamento_modalidade`) são **recalculados no servidor**.
- `user_id = auth.uid()`; no PDV/atendimento é o operador, não o cliente final.

## 3. Wrapper preparado

`src/lib/criacao-atomica.ts` (NÃO é importado por nenhum chamador hoje):
- `interpretarCriacao(data)` — parse defensivo dos status da 0095.
- `executarCriacaoAtomica(client, entrada)` — sem gate.
- `criarPedidoComReservaAtomico(client, entrada, opcoes)` — com gate
  (`VITE_FF_CRIACAO_ATOMICA`, default off) e attestation de dependências
  (`DEPENDENCIAS_CRIACAO_PADRAO` tudo `false`).
- Testes: `scripts/criacao-atomica-wrapper.test.mjs` (`npm run teste:criacao-wrapper`).

## 4. Substituição proposta (atrás de flag desligada)

Para cada chamador, **antes** do bloco atual de criação:

```ts
import { criarPedidoComReservaAtomico } from "@/lib/criacao-atomica";

// dentro do try, antes do insert atual:
const criacao = await criarPedidoComReservaAtomico(supabase, {
  pedidoId: chaveRef.current ?? crypto.randomUUID(),
  canal: "checkout", // "pdv" | "atendente"
  dados: { /* campos não financeiros, ver §5 */ },
  itens: itens.map((i) => ({ produtoId: i.produtoId, quantidade: i.quantidade, observacao: i.observacao })),
});
if (criacao.ok && (criacao.estado === "criado" || criacao.estado === "ja_criado")) {
  // usar criacao.numero/pedidoId; NÃO executar o insert/reserva legados
  ...
} else if (!criacao.ok && criacao.estado === "desativado") {
  // caminho legado atual (insert + reserva)
} else {
  // erro de negócio/técnico: NÃO cair no legado; mostrar mensagem e abortar
  toast.error(mensagemCriacao(criacao.estado));
  return;
}
```

Regras:
- **Flag off ⇒ comportamento 100% idêntico ao atual** (insert + reserva legados).
- **Flag on + gate `preparado` ⇒ NÃO executar nada e abortar** (não há fallback inseguro).
- `estoque_insuficiente`, `configuracao_ausente`, `montagem_sem_modelagem`,
  `cupom_invalido`, etc. devem abortar com mensagem clara (sem criar pedido pela
  outra via).
- O fallback direto em `reservas_estoque` (checkout) só é removido quando a flag
  estiver ligada **e** o gate habilitado.

## 5. Mapeamento de `p_dados` por canal

### Checkout (`src/routes/checkout.tsx`)
`insertBody` hoje já carrega os campos; mapear para `p_dados` (sem financeiros):
`cliente_nome, telefone, endereco, bairro, cidade, cep, complemento, referencia,
observacoes, tipo_imovel, apartamento, bloco, torre, andar, interfone, pode_subir,
cpf_cnpj, nome_fiscal, origem_cliente, tipo_entrega, forma_pagamento,
agendado_para, agendamento_obs, tipo_evento, campanha_origem, destino_lat,
destino_lng, cupom`.
- `taxa_entrega`/`desconto`/`total` deixam de ser enviados.
- `pagamento_status`/`pagamento_modalidade` deixam de ser enviados.

### PDV (`src/routes/pdv.tsx`)
`cliente_nome, telefone, endereco, bairro, cidade, tipo_entrega:"retirada",
forma_pagamento, observacoes, agendado_para, pagamento_imediato: pagoNaHora`.
- `pagamento_imediato` = `pagoNaHora` (RPC marca `pago` somente se forma ≠ pix).
- **Bloqueio**: desconto manual (`calc.desconto`) **não é aceito** pela 0095.
  PDV com desconto manual não pode usar a RPC até haver modelo de desconto
  autorizado no banco. Decisão pendente.

### Atendimento (`src/routes/atendente.tsx`)
`cliente_nome, telefone, endereco, bairro, cidade, tipo_entrega, forma_pagamento,
observacoes, agendado_para`.
- **Bloqueios**: desconto manual e taxa de entrega calculados no cliente. A taxa
  exige `loja_config.taxa_entrega` (ver §6); o desconto exige modelo de autorização.

## 6. Dependências bloqueantes (sem as quais a RPC não conclui)

1. **Taxa de entrega** — não existe `loja_config.taxa_entrega`; pedidos de
   `entrega` retornam `configuracao_ausente`. Afeta checkout e atendimento.
   `retirada` (PDV) funciona.
2. **Montagem** (`produto_id NULL`) — rejeitada com `montagem_sem_modelagem`;
   "Monte seu combo" não pode usar a RPC até haver modelagem no banco.
3. **Desconto manual** — PDV/atendimento com desconto não podem usar a RPC.
4. **Migração coordenada dos 3 canais** — ativar em um sem migrar os demais
   viola a consistência de reserva (C.7).
5. **PostgreSQL** — testes transacionais (concorrência, rollback, RLS/owner,
   EXECUTE de definer aninhado) pendentes.

## 7. Plano correto de cutover (quando autorizado)

> **0094 NÃO é inerte** (instala trigger BEFORE UPDATE em `pedidos` e recria
> `enfileirar_cupom`). **0088 substitui a RPC viva** `reservar_estoque_atomica`.
> Ambas são migrations de CUTOVER.

1. **Preparação:** código novo pronto, todas as flags OFF, testes locais OK.
2. **Estruturas inertes:** aplicar `0087` + `0092` (e `0091`/`0093`/`0095`, que não
   alteram comportamento por si só).
3. **PostgreSQL isolado:** rodar `verify-0095.sql` POST e os testes transacionais
   T1–T20; corrigir o que falhar.
4. **Migrations ativas (cutover):** `0088` (somente se ainda houver chamador
   legado) e `0094`.
5. **Deploy com flags OFF** dos novos fluxos.
6. **Janela de corte:** eliminar os caminhos legados (fallback de reserva,
   cancelamento direto, compensação por DELETE).
7. **`controlado=true` + habilitar as flags dos novos fluxos na MESMA janela.**
8. **Smoke tests imediatos.**
9. **Contingência:** reverter flags e, se necessário, recriar `enfileirar_cupom` a
   partir de 0077 e dropar o trigger da 0094 (§5 da própria migration).

**Regra rígida:** NUNCA habilitar `0089`/`0095` com `controlado=false`. A `0089`
só grava o marcador `reserva_proveniencia` quando `controlado=true`; uma reserva
nova criada sem marcador pode ser rejeitada pela `0090` no cancelamento. Não
pode existir janela em que reserva nova do fluxo controlado exista sem
proveniência.

## 8. Autorizações necessárias

- Autorização explícita para alterar os chamadores (checkout/PDV/atendimento).
- Decisões comerciais: taxa de entrega; modelagem de montagem; desconto manual.
- Autorização para aplicar migrations (incluindo 0088/0094) e executar testes
  transacionais em banco isolado.

## 9. Status da implementação local (esta etapa) — NADA aplicado

### 9.1 Criação (0095) — concluída atrás de flag OFF

- `checkout.tsx`, `pdv.tsx` e `atendente.tsx` chamam `decidirCriacaoAtomica`.
  - Flag **OFF** → `{ modo: "legado" }`: caminho antigo intacto (loop de reserva,
    compensação por DELETE, etc.).
  - Flag **ON** + sucesso → `{ modo: "atomico" }`: pedido/itens/reserva/histórico
    já gravados pelo RPC; o bloco legado é pulado.
  - Flag **ON** sem attestation ou erro → `{ modo: "erro" }`: **aborta**, sem
    fallback inseguro.
- `ATTESTACAO_CRIACAO` (em `src/lib/criacao-atomica.ts`) é o ponto único para
  declarar as dependências no cutover; hoje tudo `false` (gate `preparado`).
- PDV/atendimento passam `desconto_manual`; checkout não (cupom revalidado).
- Montagem continua rejeitada com `montagem_sem_modelagem` (ver §9.4).

### 9.2 Taxa de entrega e desconto manual (0095)

- Taxa: `loja_config.taxa_entrega` via `to_jsonb` quando existir; **ausente usa
  R$ 6 no servidor** (preserva o comportamento atual). `retirada` = 0.
- Desconto manual: só `pdv`/`atendente` **e** papel `admin|atendente`; valor
  numérico ≥ 0; somado ao cupom e limitado ao subtotal; total nunca negativo.
  O checkout nunca aplica desconto manual.

### 9.3 Cancelamento (0093) — concluído atrás de flag OFF

- `admin.tsx` (`mudarStatusPedido`) e `pedido.$id.tsx` (`cancelar`) chamam
  `decidirCancelamentoAtomico`.
  - Flag **OFF** → legado (inclui `liberar_reserva_atomica` + UPDATE direto).
  - Flag **ON** + sucesso → RPC cancelou/liberou; legado não roda.
  - Flag **ON** + erro/gate → aborta, sem UPDATE direto.
- `checkout.tsx`: a compensação de falha de reserva é pulada no modo atômico
  (o RPC já é transacional).

### 9.4 Montagem — auditoria formal (resposta: NÃO há composição estruturada)

- `combo.tsx:87-98` grava no carrinho `produtoId: null`, `preco: cat.precoUnit`
  (constante do frontend) e os sabores apenas no texto de `nome`.
- `CartItem` (`cart.tsx:4-17`) não possui campo de componentes.
- Portanto **não existe** `produto_id` + quantidade por componente físico da
  montagem. Não foi inventada composição: a RPC rejeita
  (`montagem_sem_modelagem`) e a cobertura trata como `montagem` (não integral).
- **Decisão comercial necessária** para modelar a montagem.

### 9.5 Produção (0091) — concluído atrás de flag OFF

- Em `producao.tsx`, ao "Iniciar preparo" (equivalente operacional à retirada do
  congelado), o fluxo consulta as reservas ativas e chama
  `registrarConsumoAtomico` por reserva (idem key = id da reserva, quantidade
  cheia; retirada parcial continua suportada pelo contrato 0091).
  - Flag **OFF** → segue sem consumo (layout K7.2 intacto).
  - Flag **ON** → registra e **aborta o avanço** se falhar.
- Defesa preparada e **não instalada**: `exigir_consumo_producao()` (0095)
  bloqueia a saída de `recebido` quando `controlado=true` e houver reserva ativa
  sem retirada física registrada.

### 9.6 Ciclos C–E (correções locais seguras)

- **C (entregas):** `useGpsTracking` trocou *debounce* por *throttle* — a causa
  do "GPS atrasado" era o timer de 15s ser reiniciado a cada posição, impedindo
  o envio em movimento. Erros do Supabase agora entram na fila offline. Regra de
  **3 paradas/rota** passou a ser aplicada em `central-entregas.tsx` e
  `motoboy.tsx`. Criação de rota continua multi-requisição (não atômica) —
  bloqueio conhecido.
- **D (financeiro):** importação de extratos deduplicada por `arquivo+linha`
  (a UNIQUE não protegia `conta_bancaria_id` NULL); conciliação com *claim*
  (`status='pendente'`) e rollback para pendente se o destino não puder ser
  atualizado — evita conciliação dupla/silenciosa. DRE mantida conforme contrato
  testado (bruta inclui cancelados; líquida exclui).
- **E (impressão/Pix/comunicação):** `impressaoDireta` ganhou janela
  determinística de 10s (23505 = já enfileirado) contra duplo clique, sem
  bloquear reimpressões. Webhook Pix já era idempotente por `event_hash`,
  baixa atômica com `pagamento_status='pendente'` e `status <> 'cancelado'`.

## 10. Pendências que NÃO podem ser resolvidas localmente

- Testes transacionais em PostgreSQL isolado (T1–T20, concorrência, rollback,
  RLS/ownership, `proowner` × `relowner`, EXECUTE aninhado).
- Reconciliar as 19 reservas históricas (18 pedidos entregues / 215 unidades).
- Instalar o gatilho de produção (`exigir_reserva_producao`) e o de consumo
  (`exigir_consumo_producao`) **somente** após a reconciliação e na janela de
  cutover.
- Compensações legadas por `DELETE` (`pdv.tsx:383`, `atendente.tsx:318`) não
  têm política/grant de DELETE → falham em silêncio; no modo atômico não rodam.
- Criação de rota de entrega multi-requisição (rota → rota_pedidos → pedidos)
  não é transacional; exigiria RPC própria.
