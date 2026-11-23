# Issue #3 · Resgate do visual salvo

**Preview protegido e disponível. Homologação autenticada pendente.**

- Base operacional `2443dbdd9a1f9968017bea8697eb5e4a072b4975` da branch `resgate-visual-h01-h07-codex`.
- Referência obrigatória [visual-aprovados-01](https://github.com/luiz988061337-sketch/ERP-NEIA-SALGADOS/tree/visual-aprovados-01), confirmada em `37ea9d07d8a1bec0a4f956f8d13ab7853b3b71fb`.
- Código verificado `ed44e88d857afcb4065eedb72624810f1f6bdfbc`. A árvore publicada é idêntica à árvore local utilizada nos testes.
- [Preview único desta revisão](https://erp-neia-salgados-mu8m4ve75-luiz988061337-3147s-projects.vercel.app/admin) · deployment `dpl_FnmYgxDmZzg1Fp63bqqtbgmsAyCB` · READY · Preview protegido por autenticação Vercel.
- O JavaScript servido pelo Preview aponta para o projeto de testes `lflzlcqinarrcgncafol`. O build usou `VITE_DEMO_PREVIEW=0`. A revisão não modificou `main`, Production, migrations, políticas, credenciais ou dados Supabase.

## Matriz de comparação

| Módulo | Rota real | Referência salva e fontes | Implementação | Validação pendente |
| --- | --- | --- | --- | --- |
| H01 Dashboard | `/admin` | [Imagem da tag](https://github.com/luiz988061337-sketch/ERP-NEIA-SALGADOS/blob/37ea9d07d8a1bec0a4f956f8d13ab7853b3b71fb/docs/erp-dark/prints/gestao-preview-l2.png) · `dashboard-l2.tsx / dashboard-admin.tsx` | As duas versões já usam o mesmo quadro e os mesmos gráficos na base do resgate. O Dashboard operacional mantém os hooks e os estados de carga e erro. | Conferir métricas, gráficos e atalhos autenticados após recarga. |
| H02 Atendente | `/admin#pedidos` | [Imagem da tag](https://github.com/luiz988061337-sketch/ERP-NEIA-SALGADOS/blob/37ea9d07d8a1bec0a4f956f8d13ab7853b3b71fb/docs/erp-dark/prints/central-atendente-PREVIEW-desktop.png) · `central-atendente-l2.tsx / central-pedidos.tsx` | O resgate já usa CentralPedidos para as três colunas. O contêiner operacional preserva o aceite, os avisos e o acesso por papel. | Conferir itens e avisos com o papel atendente. Confirmar aceite com pedido de teste autorizado. |
| H03 Cozinha | `/producao` | [Imagem da tag](https://github.com/luiz988061337-sketch/ERP-NEIA-SALGADOS/blob/37ea9d07d8a1bec0a4f956f8d13ab7853b3b71fb/docs/erp-dark/prints/producao-DEPOIS.png) · `producao.tsx` | Mantidas as três colunas e o caminho de remessas persistidas. A altura mínima das colunas agora é menor no celular, para manter as próximas etapas ao alcance. | Conferir as remessas de 50, recarga após cada remessa, conferência e impressão em ambiente autorizado. |
| H04 Entregas | `/central-entregas` | [Imagem da tag](https://github.com/luiz988061337-sketch/ERP-NEIA-SALGADOS/blob/37ea9d07d8a1bec0a4f956f8d13ab7853b3b71fb/docs/erp-dark/prints/central-entregas-DEPOIS.png) · `central-entregas-premium.tsx / central-entregas.tsx` | O quadro central agora é compartilhado por EntregasLayout. Na operação, o mapa usa as coordenadas do backend e a coluna ao lado mostra as rotas filtráveis com as ações existentes. | Conferir mapa com coordenadas reais, prazo prometido e liberação de rota. ETA e distância dependem dos dados reais disponíveis. |
| H05 PDV | `/pdv` | [Imagem da tag](https://github.com/luiz988061337-sketch/ERP-NEIA-SALGADOS/blob/37ea9d07d8a1bec0a4f956f8d13ab7853b3b71fb/docs/erp-dark/prints/pdv-preview-l2.png) · `pdv.tsx` | A mesma tela renderiza catálogo e comanda. A rota operacional aguarda autenticação e consulta o catálogo; os dados de conferência só entram explícitos na rota de prévia. | Conferir mínimos de 50, pagamento dividido, comanda e recarga após pedido autorizado. |
| H06 CRM | `/clientes` | [Imagem da tag](https://github.com/luiz988061337-sketch/ERP-NEIA-SALGADOS/blob/37ea9d07d8a1bec0a4f956f8d13ab7853b3b71fb/docs/estoques/comercial/local-c1a/clientes-crm-desktop.png) · `comercial-preview/tela-clientes.tsx / clientes.tsx` | O resgate já compartilha o cabeçalho, quatro indicadores e paginação. Os filtros, contatos, classificação e histórico operacionais continuam ligados às fontes existentes. | Conferir filtros, totais e histórico com sessão real. Alguns filtros da referência demonstrativa têm fontes distintas. |
| H07 Financeiro | `/financeiro` | [Imagem da tag](https://github.com/luiz988061337-sketch/ERP-NEIA-SALGADOS/blob/37ea9d07d8a1bec0a4f956f8d13ab7853b3b71fb/docs/financeiro-premium/validacao/depois-desktop-1440.png) · `preview/financeiro-premium.tsx / financeiro.tsx` | Barra de abas compartilhada com o Premium, topo com gráfico e indicadores reais e painéis separados para custos, contas, caixa, equilíbrio, simulação e relatórios. Os formulários de alta e baixa preservam as funções atuais. Custos sem categoria explícita ficam visíveis em grupo próprio. | Conferir navegabilidade e persistência de aba, conciliação real, valores parciais e trilha de auditoria. Classificação de custos usa o campo Categoria existente. |

A01–A05 ficaram fora do diff desta revisão. Os arquivos e rotas da versão salva continuam disponíveis para conferência. As capturas da tag são evidências históricas da implementação, e a comparação desta rodada não comprova equivalência pixel a pixel com as imagens originais do proprietário.

## Evidências de execução

- `npm run typecheck` e `npm run build` passaram. As 39 suítes existentes executadas passaram.
- Verificação sem sessão: os sete módulos redirecionaram para o login no Chromium. O servidor publicado retornou HTTP 200 nos documentos de Dashboard, Cozinha, Entregas, PDV, CRM e Financeiro. A Central Atendente usa o fragmento `#pedidos` do mesmo documento de Dashboard.
- Os 14 PNGs de referência foram comparados pelos IDs dos blobs da tag. Foram produzidas 14 capturas novas das prévias visuais locais em 1440 e 390 px. Todas carregaram sem erro de JavaScript registrado e sem rolagem horizontal. Os comparativos completos estão em `docs/homologacao/resgate-h01-h07/issue-03/comparacao-desktop.jpg` e `comparacao-mobile.jpg` na cópia local.
- A abertura do Preview em navegador sem sessão apresentou a tela de login Vercel. A validação autenticada depende do acesso do responsável à Vercel e ao ERP de testes. F5 com sessão, navegação entre as telas, capturas reais autenticadas e testes que gravariam pedidos, remessas, rotas ou pagamentos **seguem pendentes**. Nenhuma execução alterou registros de testes.

## Escopo do diff

Componentes `entregas-layout`, `central-entregas-premium`, `abas`, `custos-operacionais` e `premium.css`; rotas `central-entregas`, `producao`, `financeiro` e `preview/financeiro-premium`; acesso tipado às variáveis de proteção em `vite.config.ts`. O envio de código foi fast-forward na branch de resgate. A publicação manual manteve desativado o deploy automático dessa branch.
