# H02-P — Especificação textual da imagem original de Gestão de Pedidos

**Fonte visual:** imagem fornecida pelo proprietário, guardada na Biblioteca do usuário como **`Painel de Pedidos Néia Salgados.png`**. Não confundir com as capturas históricas `central-atendente-PREVIEW-*.png` nem com `PROMPT_H02_PEDIDOS.md`, também guardado na Biblioteca. O PNG original desta imagem **não foi localizado no repositório GitHub** no momento desta auditoria. Este documento registra detalhes visíveis para permitir a triagem; NÃO substituir a comparação visual direta do original quando ele for fornecido ao Codex.

## Estrutura observada na imagem
- Desktop amplo, área central com **quatro colunas coloridas lado a lado**, sobre fundo preto/grafite, bordas douradas, sidebar escura com logotipo Néia Salgados e item "Pedidos" destacado em dourado.
- Cabeçalho: ícone e título **Gestão de Pedidos**, subtítulo **Atendimento • Néia Salgados**, busca `Buscar por número, cliente, telefone ou sabor...`, data/hora grande, sino, usuário.
- Barra de chips de filtro: **Todos**, **Novos**, **Em preparo**, **Prontos**, **Entrega**, **Retirada**, **Agendados**, **Atrasados**, **Risco**; botão `+ Novo Pedido` e `Filtros`.
- **Coluna 1 — Novos Pedidos**: cabeçalho **amarelo/dourado**, subtítulo `Aguardando início do preparo`; cartões com pedido, prazo previsto, tempo de atraso ou risco, cliente, telefone, tipo (entrega/retirada), endereço ou modalidade, produtos, quantidades, total e ação contextual.
- **Coluna 2 — Em Preparo**: cabeçalho **azul**, cartões com hora de promessa, cliente, tipo, produtos, observações, faixa de progresso/tempo e ações de detalhe/conclusão.
- **Coluna 3 — Prontos**: cabeçalho **verde**, cartões com hora, progresso `Pronto há N min`, impressão/WhatsApp quando habilitados e para entrega `Aguardando Motoboy`.
- **Coluna 4 — Despachados / Em Entrega**: cabeçalho **roxo**, pedidos com status `Em rota`, nome do motoboy, hora, produtos e comando para acompanhar no mapa quando rastreamento real disponível.
- A mesma imagem mostra abaixo duas **opções ilustrativas**: `OPÇÃO 2 — LISTA COM DETALHES` (tabela) e `OPÇÃO 3 — CARDS EM GRADE`. A composição primária é o **painel superior de 4 colunas**. Não afirmar que as três opções foram individualmente aprovadas ou que o dono pediu as três simultâneas.
- Texto de card e números (pedidos com 40/65/70 unidades, datas, clientes, telefones, valores, ETA) são **fictícios e potencialmente incompatíveis com regras de venda**; jamais copiar para dados operacionais.

## Correção crucial de divergência documental
O prompt em Biblioteca `PROMPT_H02_PEDIDOS.md` descreve quatro estágios `Novos/Aguardando Aceitação → Aceitos → Em Produção → Prontos`. **A imagem original visível apresenta outros cabeçalhos**: `Novos Pedidos → Em Preparo → Prontos → Despachados/Em Entrega`. Registrar esse desacordo em vez de dizer que são idênticos. O implementador deve manter os **estados de domínio completos** (incluindo `aceito`) e mapear os estágios para cartões sem perder informações. "Aceitos" pode ser filtro/estado dentro da fila conforme arquitetura atual; não apagar o aceite obrigatório.

### Prioridade de regra real sobre botão desenhado
No mockup aparecem botões ilustrativos `Iniciar Preparo` em Novos Pedidos. **Na operação aprovada, a ATENDENTE é quem deve ACEITAR pedidos; a COZINHA inicia/finaliza preparo**. Não transferir esse poder ao painel de atendente só porque um botão ilustrativo o mostra. Para entregas, o pedido só entra em despacho após pronto/conferido; **a Central atribui e libera a rota**, o motoboy não aceita rota. Retirada tem fluxo próprio.

## NÃO confundir com H02-A
Existe uma **Central da Atendente de três colunas** aprovada separadamente (Em análise / Em produção / Pronto para entrega), registrada em `src/components/admin/central-atendente-l2.tsx` e `docs/erp-dark/prints/central-atendente-PREVIEW-desktop.png`. Ela **não substitui** o painel de Gestão de Pedidos em quatro colunas. A navegação deve distinguir os destinos sem duplicar operações.

## Critérios de aceite para Codex
1. Informar qual screenshot está sendo usado e a composição que existe na rota operacional; não inventar aprovação formal para imagem/cópia inexistente.
2. Recuperar a estrutura, hierarquia, cores de status, filtros, busca, cartões e legibilidade da imagem e da versão salva, com dados reais de staging; zero fixtures na rota real.
3. Mapear explicitamente `recebido`, `aceito`, `em_producao`, `pronto`, `aguardando_motoboy`, `em_rota`, `retirado`, `entregue` e `cancelado` aos agrupamentos/filtros sem perder itens.
4. Preservar aceite da atendente, liberação cozinha/retirada, despacho pela Central e mapa apenas se houver posição verdadeira.
5. Provar desktop 1440×900 e celular 390×844, navegação de volta ao H01, login, F5, política de acesso, estados vazio/carregando/erro e funcionamento real.
6. Manter a imagem `Painel de Pedidos Néia Salgados.png` como **referência original ainda a compartilhar ao executor do Codex**, não afirmar comparação pixel a pixel sem ela.
