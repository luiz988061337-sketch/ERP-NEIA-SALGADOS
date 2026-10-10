# PROMPT COMPLETO — Transformar a Néia Salgados em ERP

> Copie e cole este prompt (inteiro ou uma etapa por vez). Execute **uma etapa por mensagem**, na ordem. Ao final de cada etapa, peça: "confira o build, rode os testes e me mostre o que ficou pronto".

---

## 0. CONTEXTO E REGRAS GERAIS (cole sempre junto com cada etapa)

Você está evoluindo o app **Néia Salgados** (delivery de salgados fritos, assados, congelados, kits para festa e bebidas) para um **ERP completo**. O app JÁ TEM e NÃO pode quebrar:

- Cardápio, combo, carrinho, checkout (PIX copia-e-cola/QR, dinheiro, crédito, débito), cupons, fidelidade (pontos via RPC `creditar_pontos_pedido` / `resgatar_fidelidade`).
- Rastreio do pedido, Produção (fila de fritura), Motoboy, Central de Entregas (kanban/filtros), rotas.
- Impressão automática (fila `fila_impressao` + agente Windows na Tanca TP-550).
- CRM, campanhas, orçamentos/calculadora, pedidos recorrentes, parceiros, notificações push.
- Fiscal (NF-e/NFC-e via provedor, `empresa_fiscal`, `documentos_fiscais`).
- Financeiro básico (`despesas`, `metas`, `src/lib/financeiro.ts`: caixa, contas, conciliação).
- Estoque de produto acabado com lotes FEFO e reservas (`lotes`, `reservas_estoque`, `estoque_movimentacoes`).
- Papéis em `user_roles` (`admin, producao, motoboy, cliente, atendente, financeiro`) com `has_role()`.

**Regras obrigatórias**
1. Tudo em português do Brasil, valores em R$ (2 casas), datas no fuso America/Sao_Paulo.
2. Stack atual: TanStack Start + React + Tailwind + shadcn; banco Lovable Cloud. Não trocar de framework.
3. Toda tabela nova: `GRANT` + RLS + políticas usando `has_role()`. Nada de leitura pública de dados financeiros, de clientes ou de funcionários.
4. Papéis guardados SÓ em `user_roles`. Novo papel nesta evolução: `contador` (só leitura de fiscal/financeiro).
5. Regras de cálculo puras em `src/lib/*.ts` (sem banco/React), com testes em `scripts/*.test.mjs` usando exemplos numéricos deste prompt.
6. Mudanças de banco aditivas (sem apagar/renomear coluna). Migração com GRANT na mesma migração.
7. Toda ação que mexe em dinheiro, estoque ou permissão grava em `admin_logs` (quem, o quê, quando).
8. Telas mobile-first, mantendo a identidade visual (vermelho/amarelo, fontes Baloo 2 e Nunito Sans). Novos módulos entram no menu lateral do Admin (`src/components/admin/admin-nav.ts`) em grupos.
9. Não usar Supabase Edge Functions novas: lógica interna em `createServerFn`; integrações externas em `src/routes/api/public/*` com verificação do chamador.
10. Ao terminar cada etapa: build sem erro, testes passando, e um resumo do que testar.

---

## PENDÊNCIAS ANTES DE COMEÇAR (Etapa J.1)

1. **Impressão após pagamento**: hoje todo pedido vai para a fila de impressão na hora. Aplicar a regra: pedido **PIX** só imprime quando `pagamento_status` vira `pago`; pedidos em **dinheiro/cartão na entrega** imprimem na hora. Corrigir as migrações 0058/0061/0062 (estão com erro de sintaxe: `PERFORM PERFORM`, `EXECUTE FUNCTION` sem parênteses, variáveis não declaradas, `END IF` faltando, função de trigger chamada via `PERFORM`). Usar uma função `public.enfileirar_cupom(p_pedido_id uuid)` normal, chamada pelos dois gatilhos. Idempotente por `trabalho_uuid`.
2. **Leitor de PIX (Android)**: criar `pix_notification_events` e `pix_reader_devices` com RLS restrita (só admin/financeiro leem; escrita só pelo servidor). `device_id` deve ser `text` (identificador do aparelho). Recusar eventos de aparelho não cadastrado ou sem token. Levar a lógica para server routes em `/api/public/pix/*` com token por aparelho (hash no banco). Divergência de valor ou mais de um pedido com o mesmo valor → nunca confirmar sozinho; vai para a fila de "conferir PIX".
3. Rever a linha `nitro: { preset: "vercel" }` do `vite.config.ts` para não quebrar a publicação pelo Lovable (aplicar o preset só quando o build roda na Vercel).

**Pronto quando:** pedido PIX de teste só aparece na fila de impressão depois de marcado como pago; dinheiro imprime na hora; evento PIX de aparelho não cadastrado é recusado.

---

## ETAPA K — ESTOQUE E INSUMOS

**Objetivo:** saber quanto de cada matéria-prima existe, quanto custa e quando comprar.

**Telas (Admin → grupo "Estoque")**
- Insumos: lista com busca, unidade, estoque atual, mínimo, custo médio, validade mais próxima, status (ok/baixo/crítico/zerado).
- Ficha técnica por produto: insumos e quantidades **por unidade** ou **por cento de salgados**, rendimento e perda (%).
- Fornecedores: nome, CNPJ, contato, prazo de entrega, condições de pagamento.
- Compras: pedido de compra (rascunho → enviado → recebido parcial/total → cancelado); recebimento gera entrada de estoque e conta a pagar.
- Movimentações: entrada, saída, perda, ajuste, inventário, consumo de produção — com filtro e exportação.
- Inventário: contagem por insumo, diferença contra o sistema e ajuste com motivo.

**Dados**
- `insumos` (nome, categoria, unidade_base [g, kg, ml, l, un], estoque_atual, estoque_minimo, custo_medio, ativo).
- `insumo_lotes` (insumo_id, quantidade, restante, custo_unitario, validade, fornecedor_id, compra_id).
- `fichas_tecnicas` (produto_id, rendimento, perda_pct, obs) e `ficha_itens` (ficha_id, insumo_id, quantidade, unidade).
- `fornecedores`, `compras`, `compra_itens`, `insumo_movimentacoes` (tipo, quantidade, saldo_antes, saldo_depois, custo, referencia, usuario).

**Regras**
- Conversão de unidades (kg↔g, l↔ml). Custo médio ponderado na entrada: `novo_custo = (saldo*custo_atual + qtd*custo_entrada) / (saldo+qtd)`. Ex.: 10 kg a R$ 5,00 + 10 kg a R$ 7,00 → 20 kg a **R$ 6,00/kg**.
- Baixa automática por FEFO quando o pedido vai para `em_producao`: consumo = quantidade × ficha × (1 + perda). Ex.: 100 coxinhas, ficha 25 g de frango/un, perda 4% → baixa **2,6 kg**.
- Cancelamento antes de produzir não baixa; depois de produzir vira perda.
- Estoque nunca negativo (bloqueia e avisa a produção). Alerta quando ≤ mínimo; crítico ≤ 50% do mínimo.
- Sugestão de compra = (consumo médio diário dos últimos 30 dias × (prazo do fornecedor + 7 dias)) − estoque atual.

**Permissões:** admin e financeiro editam; produção vê e registra perda/consumo; contador só vê valores.

**Pronto quando:** cadastrar insumo → ficha → fazer pedido → mover para produção baixa os insumos certos; teste do custo médio e do consumo passando.

---

## ETAPA L — PRECIFICAÇÃO

**Objetivo:** saber o custo real e o lucro de cada produto e de cada kit.

**Tela (Admin → "Precificação")**: por produto mostra custo de insumos, embalagem, mão de obra, gás/energia, rateio de custos fixos, taxas, preço atual, margem atual, preço sugerido e um selo (lucro saudável / margem baixa / prejuízo). Simulador: alterar margem ou custo e ver o preço na hora; simular kit/combo.

**Configuração**: margem desejada padrão (ex. 40%), custo de mão de obra por hora, custo de gás/energia por hora de fritura, custos fixos mensais (vem do financeiro), volume mensal estimado, taxas por canal (cartão crédito %, débito %, PIX %, iFood %, taxa de entrega).

**Regras (em `src/lib/precificacao.ts`)**
- Custo direto = insumos (ficha) + embalagem + mão de obra (tempo × R$/h ÷ rendimento) + gás (tempo de fritura × R$/h ÷ rendimento).
- Rateio fixo por unidade = custos fixos mensais ÷ unidades vendidas no mês (ou estimadas).
- Preço sugerido (markup divisor) = custo total ÷ (1 − margem − taxas). Ex.: custo R$ 0,60, margem 40%, taxa 5% → **R$ 1,09**.
- Margem real = (preço − custo total − taxas) ÷ preço.
- Alerta de prejuízo quando margem real < 0; margem baixa < 15% (configurável).
- Kit/combo = soma dos custos dos itens + embalagem do kit; mostra desconto efetivo frente aos avulsos.
- Histórico de preços (quem alterou e quando) e botão "aplicar preço sugerido" (grava log).

**Pronto quando:** cada produto com ficha mostra margem; exemplo numérico acima testado; produto com prejuízo aparece em destaque no painel.

---

## ETAPA M — FINANCEIRO COMPLETO

**Telas (Admin → grupo "Financeiro")**
- Contas a pagar / a receber: valor, vencimento, categoria, centro de custo, fornecedor/cliente, forma, anexo do comprovante, recorrência (mensal/semanal), parcelamento, baixa parcial, status (pendente/paga/vencida/cancelada).
- Caixa diário: abertura com troco, entradas automáticas dos pedidos em dinheiro, sangria, suprimento, fechamento com contagem e diferença (usa `saldoCaixaEsperado`/`diferencaCaixa`).
- Contas bancárias e carteiras (banco, PIX, maquininha) com saldo.
- Conciliação: pedidos pagos × recebido por meio; taxas da maquininha; prazo de recebimento do cartão (D+1, D+30); importação de extrato OFX/CSV com sugestão de vínculo.
- Plano de contas (receitas, custos variáveis, despesas fixas, impostos, pró-labore, investimentos) e centros de custo (cozinha, entrega, administrativo, marketing).
- Relatórios: DRE mensal, fluxo de caixa realizado e projetado (90 dias), contas vencidas, ponto de equilíbrio, comparativo mês a mês, exportação em planilha e PDF.

**Regras (em `src/lib/financeiro.ts`)**
- Faturamento ≠ recebido: só `pagamento_status = 'pago'` conta como recebido (regra já existente, manter).
- Pedido pago gera lançamento de receita automaticamente; taxa do meio de pagamento vira despesa.
- Compra recebida (Etapa K) gera conta a pagar.
- Comissão do motoboy (`taxa_motoboy`) por entrega vira despesa de entrega.
- DRE: Receita bruta − deduções (impostos, taxas, descontos, cancelamentos) = Receita líquida − CMV (insumos consumidos) = Lucro bruto − despesas operacionais = Resultado operacional − financeiras = **Lucro líquido**. Ex.: bruta 20.000; deduções 1.400; CMV 7.000; despesas 6.500 → **lucro 5.100** (25,5%).
- Ponto de equilíbrio = custos fixos ÷ margem de contribuição %. Ex.: fixos 6.000, MC 40% → **R$ 15.000/mês**.
- Conta vencida = pendente com vencimento passado (usar `statusConta`).
- Lançamento de mês fechado (Etapa N) não pode ser editado, só estornado.

**Permissões:** admin e financeiro editam; contador lê; demais sem acesso.

**Pronto quando:** dia de teste com abertura, vendas, sangria e fechamento bate; DRE do exemplo testado; pedido pago aparece na conciliação.

---

## ETAPA N — ÁREA DO CONTADOR

**Acesso:** papel `contador` adicionado ao tipo `app_role`; admin convida pelo e-mail em Admin → Usuários. Rota `/contador` só para contador e admin. Somente leitura, com registro de cada acesso e download.

**Telas**
- Painel do mês: faturamento, notas emitidas/canceladas/rejeitadas, despesas, impostos estimados, pendências.
- Fechamento mensal: checklist (notas conferidas, despesas com comprovante, extratos importados, caixa fechado todos os dias). Status do mês: aberto → enviado ao contador → conferido → fechado (trava edição).
- Documentos: XMLs e DANFEs do mês (download em ZIP), comprovantes de despesas, extratos, DRE, livro caixa, relatório de vendas por forma de pagamento e por CFOP/NCM.
- Exportações: planilha (CSV/Excel, com proteção contra fórmulas já existente em `src/lib/export.ts`) e PDF.
- Solicitações: o contador pede um documento ("falta comprovante da conta de luz de março"); o admin recebe notificação, anexa e responde; histórico por mês.

**Dados:** `fechamentos_mensais` (competencia, status, enviado_em, conferido_em, fechado_por, obs), `solicitacoes_contador` (competencia, texto, status, resposta, anexo_url), log de acessos.

**Pronto quando:** usuário contador entra, vê apenas fiscal/financeiro, baixa o pacote do mês e abre uma solicitação; tenta editar e é bloqueado pelo banco.

---

## ETAPA O — GESTÃO EMPRESARIAL

**Painel do dono (`/gestao`)**: faturamento, recebido, lucro, margem, ticket médio, pedidos/dia, produtos mais e menos lucrativos, bairros e canais (site, WhatsApp, iFood, parceiros), recompra, metas (já existe `metas`) com barra de progresso, comparação com mês e ano anteriores, previsão do mês.

**Funcionários e equipe**
- Cadastro (função, salário/diária, contato, documentos, data de admissão, ativo).
- Escala semanal e ponto simples (entrada/saída pelo celular, com local opcional).
- Comissão e acerto do motoboy por período (entregas × taxa − vales).
- Vales/adiantamentos, folha simplificada mensal (vira conta a pagar).

**Operação e planejamento**
- Calendário de datas fortes (já existe `datas_demanda`) com previsão de produção e de compra de insumos.
- Planejamento de produção do dia seguinte com base em pedidos agendados + histórico.
- Alertas automáticos: estoque baixo, conta vencendo amanhã, margem negativa, caixa com diferença, nota rejeitada, meta abaixo do ritmo.
- Indicadores por produto, bairro, horário e canal, com exportação.

**Permissões:** painel do dono só admin; financeiro vê números; equipe vê só a própria escala e ponto.

**Pronto quando:** dono abre `/gestao` e vê os números do mês batendo com o financeiro; motoboy fecha acerto; alertas aparecem no sino de notificações.

---

## ETAPA P — FECHAMENTO E HOMOLOGAÇÃO

1. Rodar a varredura de segurança e corrigir: nenhuma tabela financeira, de funcionários ou de clientes legível por quem não deve; testar cada papel (admin, financeiro, contador, produção, atendente, motoboy, cliente).
2. Testes automatizados de todas as regras: custo médio, consumo da ficha, preço sugerido, margem, DRE, ponto de equilíbrio, caixa, conciliação, status de conta.
3. Dados de exemplo numa migração (insumos, fichas de 5 salgados, fornecedores, contas do mês).
4. Roteiro de homologação passo a passo: pedido → produção (baixa de insumos) → pagamento → impressão → entrega → receita no financeiro → DRE → fechamento do contador.
5. Revisar desempenho (índices nas tabelas novas), textos, telas no celular, e títulos/descrições de cada página.
6. Publicar e conferir no site ao vivo.

---

## ORDEM SUGERIDA
J.1 (pendências) → K (estoque e insumos) → L (precificação) → M (financeiro) → N (contador) → O (gestão) → P (fechamento).
Uma etapa por mensagem. Não começar a próxima com build quebrado.
