# Prompt completo: transformar a Néia Salgados em ERP

## O que vou entregar
Um documento com o prompt completo, pronto para copiar e colar, em português. Ele é escrito a partir do que o app **já tem hoje**, para não refazer o que existe: pedidos, produção, motoboy, Central de Entregas, impressão, PIX, fidelidade, CRM, fiscal e um financeiro básico. O resto vira etapas numeradas, para executar uma de cada vez.

O documento fica salvo em Arquivos para baixar e também dentro do projeto.

## Estrutura do prompt

1. **Contexto e regras gerais**: o que já existe e não pode quebrar, em português, valores em R$, permissões por perfil (admin, financeiro, produção, atendente, motoboy, contador) e um registro de quem fez cada ação.

2. **Etapa K: Estoque e insumos**
   - Cadastro de insumos (farinha, frango, óleo, embalagens) com unidade, custo e estoque mínimo.
   - Ficha técnica: quanto de cada insumo vai em cada salgado.
   - Baixa automática dos insumos quando o pedido entra em produção.
   - Compras e fornecedores: pedido de compra e entrada de nota.
   - Inventário, perdas, validade e alerta de reposição.

3. **Etapa L: Precificação**
   - Custo real de cada produto calculado pela ficha técnica, somando embalagem, gás, mão de obra e taxas (cartão, iFood, entrega).
   - Margem desejada, preço sugerido e comparação com o preço atual.
   - Simulador de kits e combos, com alerta de produto vendido com prejuízo.

4. **Etapa M: Financeiro completo**
   - Contas a pagar e a receber, com vencimento e recorrência.
   - Caixa diário com abertura, sangria e fechamento.
   - Contas bancárias e conferência dos pagamentos (PIX, cartão e dinheiro contra os pedidos).
   - Plano de contas e centro de custo.
   - Relatórios: resultado do mês (DRE), fluxo de caixa realizado e projetado, e ponto de equilíbrio.

5. **Etapa N: Área do contador**
   - Acesso próprio do contador, só leitura, apenas aos dados fiscais e financeiros.
   - Fechamento mensal com notas emitidas, XMLs, despesas com comprovante, extrato e DRE.
   - Exportação em planilha e PDF, e marcação "mês enviado / conferido".
   - Canal para o contador pedir documentos que faltam.

6. **Etapa O: Gestão empresarial**
   - Painel do dono com faturamento, lucro, margem, ticket médio, metas e comparação com meses anteriores.
   - Funcionários: cadastro, escala, ponto simples, comissão do motoboy e vales.
   - Gestão de compras e fornecedores, mais calendário de datas fortes.
   - Indicadores por produto, bairro e canal, e alertas automáticos.

7. **Etapa P: Fechamento**: revisão de segurança das permissões, testes dos cálculos (custo, margem, DRE, caixa), dados de exemplo e um roteiro de homologação antes de ir para produção.

Cada etapa traz: objetivo, telas, dados a guardar, regras de cálculo com exemplos numéricos, quem pode ver e editar, e como saber que ficou pronta.

## Pendências que o prompt vai lembrar
- **Leitor de PIX**: as tabelas do leitor e as 4 funções ainda não estão no ar.
- **Impressão**: a regra "só imprimir depois do pagamento confirmado" foi escrita, mas não está valendo, e os arquivos dessa etapa têm erros.
- **Pedidos em dinheiro ou cartão na entrega**: falta decidir se imprimem na hora.

## Detalhes técnicos
- Arquivos: `/mnt/documents/PROMPT-ERP-NEIA-SALGADOS.md` e `docs/PROMPT-ERP-NEIA-SALGADOS.md`.
- O prompt segue as convenções do projeto: TanStack Start, Lovable Cloud com permissões no banco e papéis em `user_roles`, e regras de cálculo em `src/lib/*` com testes em `scripts/*.test.mjs`.
- Um papel novo, `contador`, entra no tipo de papéis dentro da etapa N.
- Nenhuma alteração no app nesta entrega: é só o documento.
