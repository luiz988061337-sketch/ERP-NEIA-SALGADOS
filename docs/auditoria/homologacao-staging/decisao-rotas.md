# Decisão `rotas` × `rotas_entrega` (0024 × 0044)

Documento de preparo. Nada foi migrado nem fundido. Requer confirmação do
responsável + inspeção do banco antes de qualquer DDL.

## 1. Fatos verificados (código e SQL atuais)

- `0024_entrega.sql:4-18` — cria `rotas_entrega` (motoboy_id, status,
  saiu/chegou_em) e `rota_pedidos(rota_id → rotas_entrega(id), pedido_id,
  ordem, PK(rota_id,pedido_id))`; `pedidos.rota_id → rotas_entrega(id)`
  (`:28`); policies staff **com** motoboy; `GRANT ALL ... TO authenticated`.
- `0044_motoboy_rotas.sql:39-60` — cria `rotas` (+ índices) e **recria**
  `rota_pedidos` com shape **diferente** (`id` PK, `rota_id → rotas(id)`,
  `UNIQUE(rota_id,pedido_id)`), via `IF NOT EXISTS` (no-op se 0024 aplicada
  antes); `pedidos.rota_id → rotas(id)` (`:70`, no-op se coluna existe);
  policies staff **sem** motoboy.
- Código (único consumidor): `motoboy.tsx:407-412` — `INSERT rotas_entrega`
  → `INSERT rota_pedidos{rota_id, pedido_id, ordem}` → `UPDATE
  pedidos{rota_id}`. Formato compatível com o shape **0024**.
- `rotas` (0044): **zero consumidores** em `src/`, Edge Functions, scripts
  ou triggers (grep).

## 2. Consequência

- Se 0024 aplicada antes de 0044: `rota_pedidos` mantém shape 0024 (FK para
  `rotas_entrega`) — código funciona; `rotas` fica órfã e inofensiva.
- Se 0044 aplicada antes/sem 0024 (ordem parcial, banco legado): `rota_id`
  aponta para `rotas(id)` — os `INSERT`s do app **violam a FK** (inserts de
  rotas_entrega não existem em `rotas`). **Conflito latente.**
- Estado remoto real: **desconhecido** (sem acesso ao banco). Não presumir.

## 3. Opções (escolha do responsável)

- **A — Manter 0024 como contrato (recomendada preliminarmente).**
  Nenhuma migration; documentar `rotas` como obsoleta/não-utilizada;
  verificar em staging qual shape `rota_pedidos` tem. Custo zero, risco zero.
- **B — Consolidação com migration.** Ex.: dropar `rotas` se vazia +
  alinhar FKs/policies para o shape 0024. **Destrutiva**: exige contagem de
  linhas, backup, homologação e autorização específica. NÃO propor como
  automática.

## 4. Verificação em staging (antes de decidir)

```sql
-- Qual shape existe?
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'public.rota_pedidos'::regclass;
-- rotas tem linhas?
SELECT COUNT(*) FROM public.rotas;
SELECT COUNT(*) FROM public.rotas_entrega;
-- Policies efetivas (motoboy incluído ou não?):
SELECT policyname, qual FROM pg_policies
WHERE schemaname='public' AND tablename IN ('rotas','rotas_entrega','rota_pedidos');
```

- `rota_pedidos → rotas_entrega` + `rotas` vazia/sem uso → Opção A.
- Qualquer outro resultado → parar e reavaliar (candidata a Opção B).
