# Decisão P-03 — estados `cancelada` × `liberada` (+ `consumida`)

Documento de preparo. Nada aqui foi aplicado; nenhuma decisão foi tomada
pelo executor. Requer confirmação do responsável + homologação em staging.

## 1. Fatos verificados (código e SQL atuais)

- `0023_base_operacional.sql:48` — CHECK permite
  `ativa / liberada / consumida / cancelada`.
- `0030` e `0068` — `liberar_reserva_atomica` processa **só** `status='ativa'`
  (0068:74,116) e grava **`liberada`** (0068:118), **devolvendo**
  `produtos.estoque`. Repetição = no-op. `reservar` conta `SUM` só de `ativa`
  (0068:70-76).
- Fallbacks cliente (`pedido.$id.tsx:168`) e admin (`admin.tsx:625`) —
  `UPDATE reservas_estoque SET status='cancelada' WHERE pedido_id AND
  status='ativa'`, **sem devolver estoque**, executados **após** a tentativa
  de RPC (best-effort, erros abafados).
- `0069:51-56` — `v_tem_0030 = EXISTS(qualquer linha do pedido)`: linhas
  `cancelada` contam como "0030 engajou" → lotes devolvidos, `produtos`
  **não** recreditado.
- `consumida` — só existe no CHECK; **zero escritores** em SQL/TS/MJS.

## 2. Consequências (leitura de código, sem banco)

| Caso | Resultado especificado |
|---|---|
| RPC ok → fallback | fallback no-op (nada `ativa` restante). **Seguro.** |
| RPC negado/falhou → fallback | linha vira `cancelada`, estoque **preso** (débito sem devolução). **Risco.** |
| Retry `reservar` após `cancelada` (0068) | `SUM(ativa)` ignora `cancelada` → **redebita integral**. **Risco.** |
| `0069` sobre pedido com `cancelada` e RPC falhado | lotes ok, `produtos` não restaurado. **Risco (mesma raiz).** |
| Repetir liberar/cancelar | no-op em todos os caminhos. **Seguro.** |

## 3. Opções (escolha do responsável)

- **A — Marcar `liberada` no fallback.** REJEITADA preliminarmente: mente
  sobre devolução que não ocorreu (RPC falhou). Só aceitável pareada com
  restauração real — que violaria o modelo de auth da 0068. Não propor.
- **B — Não marcar nada em falha de RPC (manter `ativa`) + erro visível.**
  Reserva pendente fica explícita e retentável; exige UI que exponha a falha
  (hoje abafada por `catch {}`) e rotina de reconciliação. Afeta
  `admin.tsx:625`, `pedido.$id.tsx:168`.
- **C — Manter `cancelada` + migration de reconciliação.** Job/função que,
  para pedidos cancelados com linhas `cancelada`, restaura o estoque **uma
  vez** (idempotente, com trilha), movendo para `liberada`. Exige nova
  migration + homologação; decide quem autoriza (sistema/staff).
- **`consumida`:** usar na entrega (baixa definitiva) ou remover do CHECK
  em migration futura. Sem uso hoje — não tocar sem decisão.
- **0068 `SUM`:** contar ou não `cancelada` depende da opção (B: irrelevante
  se `cancelada` deixar de existir; C: ignorar, como hoje).

## 4. Verificação em staging (após decisão)

- Criar pedido sintético 30 un (estoque 100) → cancelar com RPC bloqueado
  (JWT sem papel) → ler `reservas_estoque.status` e `produtos.estoque`.
- Repetir liberar 2x; retry reservar; concorrência 2×30 com estoque 30.
- Esperado da opção escolhida deve bater linha a linha; senão, interromper.

## 5. Recomendação do executor (não vinculante)

Opção **B + reconciliação C como etapa 2**: primeiro parar de esconder a
falha (B é só código cliente, sem schema), depois reconciliar com migration
dedicada e homologada (C). `consumida`: remover do CHECK **apenas** se
ninguém a adotar — senão, especificar seu escritor.
