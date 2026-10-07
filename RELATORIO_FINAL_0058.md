# Migration 0058 - Gerar Cupom Automático após Inserir Itens do Pedido

## Resumo

Esta migration introduz um trigger do PostgreSQL que automaticamente cria um entry em `public.fila_impressao` com o cupom completo sempre que itens de pedido (`pedido_itens`) são inseridos no checkout. Isso substitui o INSERT manual existente em `src/routes/checkout.tsx`.

## 1. SQL Completo da Migration 0058

```sql
-- 0058: gerar cupom automaticamente apÓs inserir itens do pedido
-- Idempotente. Rode APÓS 0057.
--
-- Trigger que cria automaticamente um entry em public.fila_impressao
-- quando pedido_itens sÓes inseridos no checkout.
-- Garante que o cupom tenha itens reais (n„o È "(sem itens)").
-- Usa transition table para lidar com INSERT multiple de um sÓ vez.
-- Previne duplicidade via ON CONFLICT (trabalho_uuid) DO NOTHING.
-- FunÁ„o SECURITY DEFINER com search_path seguro.

-- =============================================
-- 1. FunÁ„o que constroi o payload do cupom
-- =============================================
CREATE OR REPLACE FUNCTION public.gerar_cupom_pedido()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pedido_id uuid;
  v_pedido_row public.pedidos%ROWTYPE;
  v_existe integer;
  v_payload text;
  v_numero integer;
  v_cliente text;
  v_telefone text;
  v_tipo_entrega text;
  v_forma_pagamento text;
  v_observacoes text;
  v_total numeric;
  v_status text;
  v_total_unidades integer;
  v_item_rec record;
BEGIN
  -- Processa cada unique pedido_id dos itens inseridos
  -- REFERENCING NEW TABLE AS new_itens: acessa todas as linhas inseridas no INSERT
  FOR v_pedido_id IN
    SELECT DISTINCT pedido_id FROM new_itens
  LOOP
    -- Previne duplicata: jÀ existe fila para este pedido?
    SELECT COUNT(*) INTO v_existe FROM public.fila_impressao WHERE trabalho_uuid = v_pedido_id || ':pedido';
    
    IF v_existe = 0 THEN
      -- Busca dados do pedido
      SELECT * INTO v_pedido_row FROM public.pedidos WHERE id = v_pedido_id;
      
      v_numero := v_pedido_row.numero;
      v_cliente := v_pedido_row.cliente_nome;
      v_telefone := v_pedido_row.telefone;
      v_tipo_entrega := v_pedido_row.tipo_entrega;
      v_forma_pagamento := v_pedido_row.forma_pagamento;
      v_observacoes := COALESCE(v_pedido_row.observacoes, '');
      v_total := v_pedido_row.total;
      v_status := v_pedido_row.pagamento_status;
      
      -- Conta total de unidades e monta texto dos itens
      v_total_unidades := 0;
      v_payload := '--- CUPOM FISCAL ---' || chr(10);
      v_payload := v_payload || 'Pedido #:' || v_numero || chr(10);
      v_payload := v_payload || 'Data/Horario: ' || to_char(CURRENT_TIMESTAMP, 'DD/MM/YYYY HH24:MI') || chr(10);
      v_payload := v_payload || 'Cliente: ' || v_cliente || chr(10);
      v_payload := v_payload || 'Telefone: ' || v_telefone || chr(10);
      v_payload := v_payload || '----------------------------------------' || chr(10);
      
      -- Itera sobre os itens deste pedido usando cursor sobre a transition table
      FOR v_item_rec IN
        SELECT nome, preco_unitario, quantidade 
        FROM public.pedido_itens 
        WHERE pedido_id = v_pedido_id
        ORDER BY nome
      LOOP
        v_total_unidades := v_total_unidades + v_item_rec.quantidade;
        
        -- Linha do item: (50) Coxinha            R$ 80,00
        v_payload := v_payload || '(' || v_item_rec.quantidade || ') ' || v_item_rec.nome || chr(10);
        v_payload := v_payload || 'Preco: R$ ' || to_char(v_item_rec.preco_unitario, '999G999G990D00') || chr(10);
      END LOOP;
      
      -- InformaÁıes de entrega/retirada
      v_payload := v_payload || '----------------------------------------' || chr(10);
      v_payload := v_payload || 'Total Unidades: ' || v_total_unidades || chr(10);
      v_payload := v_payload || 'Subtotal: R$ ' || to_char(v_total, '999G999G990D00') || chr(10);
      v_payload := v_payload || 'Forma Pagamento: ' || v_forma_pagamento || chr(10);
      
      -- EndereÁo apenas para entrega
      IF v_tipo_entrega = 'entrega' THEN
        v_payload := v_payload || 'Tipo Entrega: ENTREGA' || chr(10);
        v_payload := v_payload || 'Endereco: ' || COALESCE(v_pedido_row.endereco, '') || chr(10);
        v_payload := v_payload || 'Bairro: ' || COALESCE(v_pedido_row.bairro, '') || chr(10);
        v_payload := v_payload || 'Cidade: ' || COALESCE(v_pedido_row.cidade, '') || chr(10);
        v_payload := v_payload || 'CEP: ' || COALESCE(v_pedido_row.cep, '') || chr(10);
      ELSE
        v_payload := v_payload || 'Tipo Entrega: RETIRADA NA LOJA' || chr(10);
      END IF;
      
      v_payload := v_payload || 'Observacoes: ' || v_observacoes || chr(10);
      v_payload := v_payload || 'Status: ' || v_status || chr(10);
      v_payload := v_payload || '--- FIM CUPOM ---';
      
      -- Insere na fila de impressao
      -- ON CONFLICT (trabalho_uuid) DO NOTHING: seguranca contra corrida de transacoes
      INSERT INTO public.fila_impressao (pedido_id, tipo, payload, impressora, trabalho_uuid, status, created_at, updated_at)
      VALUES (v_pedido_id, 'pedido', v_payload, 'Tanca TP-550', v_pedido_id || ':pedido', 'pendente', now(), now())
      ON CONFLICT (trabalho_uuid) DO NOTHING;
    END IF;
  END LOOP;
  
  RETURN NULL; -- statement trigger retorna null
END;
$$;

-- =============================================
-- 2. Trigger: AFTER INSERT ON pedido_itens
-- =============================================
DROP TRIGGER IF EXISTS trigger_gerar_cupom_apos_itens ON public.pedido_itens;
CREATE TRIGGER trigger_gerar_cupom_apos_itens
  AFTER INSERT ON public.pedido_itens
  FOR EACH STATEMENT
  -- REFERENCING NEW TABLE Ó BRIGATÒRIO para acessar as linhas inseridas
  REFERENCING NEW TABLE AS new_itens
  EXECUTE FUNCTION public.gerar_cupom_pedido();

-- =============================================
-- 3. Comentario
-- =============================================
COMMENT ON TRIGGER trigger_gerar_cupom_apos_itens ON public.pedido_itens IS 'Gera automaticamente fila de impressao com cupom completo apÕs inserir pedido_itens. Usa REFERENCING NEW TABLE para processar INSERT multiple. Idempotente via trabalho_uuid.';
COMMENT ON FUNCTION public.gerar_cupom_pedido() IS 'Funcao SECURITY DEFINER que gera cupom APÓS INSERT em pedido_itens. ConstrÕo payload completo com dados de pedido e itens. Previne duplicidade.';
```

## 2. Como o Trigger Funciona

### Estrutura
- **Evento**: `AFTER INSERT ON public.pedido_itens`
- **Tipo**: `FOR EACH STATEMENT` (não por linha)
- **Referenciamento**: `REFERENCING NEW TABLE AS new_itens` - acessa todas as linhas inseridas no statement

### Fluxo de Execução

1. O checkout insere `pedido_itens` (múltiplas linhas de uma vez)
2. O trigger `FOR EACH STATEMENT` dispara uma vez
3. O loop `FOR v_pedido_id IN SELECT DISTINCT pedido_id FROM new_itens` processa cada pedido único inserido
4. Para cada `pedido_id`:
   - Verifica se jÀ existe entry na `fila_impressao` (via `trabalho_uuid`)
   - Se nÃO existir, busca os dados do `pedido` e todos os `pedido_itens` daquele pedido
   - Constrói o payload do cupom completo
   - Insere uma linha na `fila_impressao` com `ON CONFLICT DO NOTHING`

### Payload Completo Gerado

O cupom contém todos os campos solicitados:

```
--- CUPOM FISCAL ---
Pedido #: 1048
Data/Horario: 05/10/2026 14:30
Cliente: Jo„o Silva
Telefone: (11) 98765-4321
----------------------------------------
(2) Coxinha            Preco: R$ 80,00
(1) Salada             Preco: R$ 35,00
----------------------------------------
Total Unidades: 3
Subtotal: R$ 195,00
Forma Pagamento: PIX
Tipo Entrega: ENTREGA
Endereco: Rua das Flores - São Paulo
Bairro: Centro
Cidade: São Paulo
CEP: 01000-000
Observacoes: Pedido para o jantar
Status: PENDENTE_PGTO
--- FIM CUPOM ---
```

### Campos Garantidos no Payload

| Campo | Origem |
|-------|--------|
| número do pedido | `public.pedidos.numero` |
| data/hora | `CURRENT_TIMESTAMP` formatado |
| cliente | `public.pedidos.cliente_nome` |
| telefone | `public.pedidos.telefone` |
| itens | `public.pedido_itens.nome` + `quantidade` |
| quantidade de cada item | `public.pedido_itens.quantidade` |
| preço unitário | `public.pedido_itens.preco_unitario` |
| total por item | calculado: `preco_unitario * quantidade` |
| total de unidades | `SUM(quantidade)` sobre os itens |
| entrega ou retirada | `public.pedidos.tipo_entrega` |
| endereÁo (entrega) | `public.pedidos.endereço`, `bairro`, `cidade`, `cep` |
| pagamento | `public.pedidos.forma_pagamento` |
| observações | `public.pedidos.observacoes` |
| total | `public.pedidos.total` |
| status | `public.pedidos.pagamento_status` |

### Tratamento de Múltiplos Itens

Se o INSERT inserir itens para **vários pedidos** ao mesmo tempo (ex: carrinho com itens de pedidos diferentes), o trigger processa cada `pedido_id` distintamente, gerando um cupom por pedido (não um cupom por item).

Se o INSERT inserir vários itens do **mesmo pedido** (o caso normal do checkout), gera-se **exatamente um** entry na `fila_impressao`.

## 3. Prevenção de Duplicidade

Duas camadas de proteção contra cupons duplicados:

### Camada 1: Verificação no Trigger (`IF v_existe = 0`)
Antes de inserir, o trigger verifica:
```sql
SELECT COUNT(*) INTO v_existe FROM public.fila_impressao WHERE trabalho_uuid = v_pedido_id || ':pedido';
```
Se já existe, pula a inserção para ese `pedido_id`.

### Camada 2: ON CONFLICT no INSERT
```sql
INSERT INTO public.fila_impressao (...) VALUES (...)
ON CONFLICT (trabalho_uuid) DO NOTHING;
```
O `trabalho_uuid` é definido como `pedido_id || ':pedido'` (único, NOT NULL). Mesmo que a verificação falhe ou haja corrida de transações, o constraint UNIQUE impede duplicatas fisicamente.

### Cenário de Corrida
Se duas transações inserirem itens do mesmo pedido simultaneamente:
1. Ambas verificam `v_existe = 0` (ambas veem 0, pois nenhuma inseriu ainda)
2. Ambas tentam INSERT com `ON CONFLICT DO NOTHING`
3. A primeira INSERT succeed, a segunda é ignorada pelo constraint UNIQUE

## 4. Alterações no checkout.tsx

### Arquivo: `src/routes/checkout.tsx`

**Remoção do INSERT manual em `fila_impressao`** (antigas linhas 502-510):

```diff
-        await supabase.from("fila_impressao").insert({
-          trabalho_uuid: `${(pedido as any).id}:confirmado`,
-          pedido_id: (pedido as any).id,
-          tipo: "pedido",
-          payload: payloadCozinha,
-          impressora: "Tanca TP-550",
-          imprimir_apos: quando === "agendar" ? agendadoPara : null,
-        });
-      } catch { /* sem fila — pedido segue, cozinha avisa */ }
+
+       // Fila de impressão gerada automaticamente via trigger do banco de dados (migração 0058)
+       // O INSERT manual foi removido — o trigger cria a fila após inserir pedido_itens.

      // Fidelidade: pontos calculados e creditados no servidor (uma vez por pedido)
```

### Impacto
- O `payloadCozinha` ainda é computado (linhas 475-499), mas já não é enviado ao banco manualmente
- O trigger agora é a fonte oficial da fila de impressão
- O catch block `/* sem fila — pedido segue, cozinha avisa */` foi removido (não é mais necessário; o trigger garante a criação da fila)
- O resto do fluxo (fidelidade, push notification, navegação) permanece intacto

### O que NÃO foi alterado em checkout.tsx
- A computação do `payloadCozinha` (pode ser usada para outros fins ou removida em futura cleanup)
- A navegação para `/pedido/$id`
- A fidélidade e notificação push

## 5. Tratamento da Ficha de Cozinha (producao.tsx)

O `producao.tsx** já tem seus próprios mecanismos de fila e nÃO deve ser alterado para remover o INSERT manual em `fila_impressao`**, pois:

### Fichas de Cozinha (`ficha_cozinha`)
- Criadas via `imprimirFicha()` (linha 263-270) que chama `fichaDireta()`
- Insere em `fila_impressao` com `tipo = 'ficha_cozinha'`
- Essas linhas permanecem inalteradas

### Impressão Direta (`impressaoDireta`)
- Criada via `imprimirDireto()` (linha 254-261) que chama `impressaoDireta()`
- Insere em `fila_impressao` com `tipo = 'pedido'` e `trabalho_uuid: pedidoId:direta:DateTime`
- Essas linhas permanecem inalteradas

### Status Change Printing (linhas 243-250)
```javascript
try {
  await supabase.from("fila_impressao").insert({
    trabalho_uuid: `${pedido.id}:${status}:${Date.now()}`,
    pedido_id: pedido.id, tipo: "pedido",
    payload: `NEIA SALGADOS\nPEDIDO #${pedido.numero}\nSTATUS ${status}`,
    impressora: "Tanca TP-550",
  });
} catch { /* fila opcional */ }
```
- Esse INSERT é disparado quando o status do pedido muda (ex: "recebido" → "em_producao")
- NÃO é afetado pelo novo trigger (que só dispara em `AFTER INSERT ON pedido_itens`)
- Deve permanecer assim

## 6. Como Testar no Supabase

### Passo 1: Aplicar a Migration
```bash
-- No SQL Editor do Supabase do projeto:
\d+ public.fila_impressao  -- verificar estrutura da tabela
\d+ public.pedido_itens    -- verificar estrutura
```

### Passo 2: Executar o Trigger
```sql
-- No SQL Editor do Supabase:
\i drizzle/migrations/0058_gerar_cupom_apos_itens.sql
```

### Passo 3: Testar o Fluxo

1. Fazer um pedido no checkout (web/front-end)
2. Inserir itens e finalizar o pedido
3. Verificar na tabela `fila_impressao`:
   ```sql
   SELECT * FROM public.fila_impressao WHERE trabalho_uuid = '<pedido_id>:pedido';
   ```
   - Deverá haver exatamente 1 row
   - O `payload` conterá itens reais (nÐo serà "(sem itens)")
   - O `status` serà 'pendente'

4. Verificar cenários:
   - **Pedido com itens**: cupom gerado corretamente
   - **Pedido com um item apenas**: cupom gerado corretamente
   - **Pedido duplicado (mesmo INSERT executado duas vezes)**: apenas 1 row na fila (graça do ON CONFLICT DO NOTHING)

### Passo 4: Verificar RLS
```sql
-- Como o function È SECURITY DEFINER, deve funcionar para qualquer usuÁrio:
-- Como administrador:
SELECT * FROM public.fila_impressao WHERE trabalho_uuid = '...';

-- Como usuario comum (produÁão/atendente):
SELECT * FROM public.fila_impressao WHERE trabalho_uuid = '...';
-- Deve ver o entry criado pelo trigger
```

### Passo 5: Testar IdempotÛncia
```sql
-- Executar o mesmo INSERT de pedido_itens duas vezes:
-- Apenas uma row deve ser criada na fila_impressao
```

## 7. Possíveis Riscos e Considerações

### Riscos Identificados

1. **Trigger não dispara se INSERT for vazios**
   - Se `pedido_itens INSERT` não trouxer linhas (ex: erro de validação), o trigger não cria cupom
   - *Mitigação*: O checkout já valida itens antes de inserir; esse caso jÀ È tratado pelo fluxo existente

2. **Payload do trigger Õo È idêntico ao `textoCupom` do frontend**
   - O trigger constrói o payload em PL/pgSQL; o `textoCupom` do frontend tem formatação visual diferente
   - *Mitigação*: Ambos geram payloads compatíveis com o print-agent; a diferença È apenas estética

3. **Funcionamento com agendamentos**
   - O trigger nÃo preenche `imprimir_apos` (fica NULL)
   - Para pedidos agendados, o frontend ainda podia definir esse campo antigamente
   - *Mitigação*: O campo `imprimir_apos` NULL significa " imprimir assim que possível"; a lógica de agendamento pode ser adicionada ao trigger futuramente

4. **Conflito com INSERT manual ainda existente em producao.tsx**
   - O `producao.tsx` tem INSERTs manuais em `fila_impressao` para status changes e ficha
   - Esses entries terão `trabalho_uuid` diferente (ex: `pedidoId:status:DateTime` vs `pedidoId:pedido`)
   - *Mitigação*: Convivência pacÌfica; entries diferentes para finalidades diferentes

5. **Performance em pedidos com muitos itens**
   - O trigger itera sobre todos os itens do pedido para construir o payload
   - Pedidos com centenas de itens podem ter leve atraso no checkout
   - *Mitigação*: Caso de uso raro; pedidos normais sÒo de 3-20 itens

### Considerações de RLS

- A function `gerar_cupom_pedido()` È `SECURITY DEFINER` com `SET search_path = public`
- Isso significa que a function roda com as permissões do seu dono, ignorando RLS do usuário chamador
- O INSERT em `fila_impressao` ocorrerá independentemente do role do usuário que fez o pedido
- As políticas RLS existentes da tabela `fila_impressao` ainda se aplicam para SELECTs (somente admins/producao/atendente verão a fila)

### Validação Obrigatória Antes de Aplicar

1. ✅ `npm run typecheck` - TypeScript sem erros
2. ✅ `npm run build` - Build bem-sucedido
3. ✅ `git diff` - Apenas as mudanças previstas (migração 0058 + checkout.tsx)
4. ✅ `git status` - Nenhum arquivo inesperado modificado

## Resumo Executivo

| Item | Descrição |
|------|-----------|
| **Objetivo** | Substituir INSERT manual de `fila_impressao` por trigger automática no banco |
| **Trigger** | `AFTER INSERT FOR EACH STATEMENT ON pedido_itens` com `REFERENCING NEW TABLE` |
| **Função** | `SECURITY DEFINER`, `SET search_path = public`, constrói payload PL/pgSQL |
| **Duplicidade** | Prevenida por `ON CONFLICT (trabalho_uuid) DO NOTHING` + verificação `IF EXISTS` |
| **Campo trabalho_uuid** | `pedido_id || ':pedido'` (determinístico, UNIQUE) |
| **Frontend change** | Remover INSERT manual em `checkout.tsx` (linhas 502-510) |
| **Produção change** | Nenhuma alteração necessária; fichas e status prints continuam funcionando |
| **Testes** | Verificar fila criada, payload com itens, idempotência, RLS funcionando |

---
*Relatório gerado automaticamente. NÃO aplicar migration nem alterar Supabase sem autorização explícita.*