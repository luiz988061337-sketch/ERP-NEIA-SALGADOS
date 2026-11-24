# Recuperação do ERP com a referência aprovada em 21 de novembro

**24 de novembro de 2026 · Homologação parcial**

- Referência visual confirmada pelo proprietário · commit [`1dc0e0d0`](https://github.com/luiz988061337-sketch/ERP-NEIA-SALGADOS/commit/1dc0e0d0c0ddd7c008628f473d33799136d689e2), branch histórica `homologacao-finalizacao` e deployment `dpl_2wgqFWijouXrgqcfuLDAVsVEqExZ`.
- Código operacional · branch `resgate-visual-h01-h07-codex`, base `5ce1787946fec23ec793b4aa5d1852804be239f0`, revisão do [código publicado](https://github.com/luiz988061337-sketch/ERP-NEIA-SALGADOS/commit/2be5e0c1707b3f175ac6b2e4663644184fa12611).
- [Preview protegido para aprovação](https://erp-neia-salgados-7me4obc0t-luiz988061337-3147s-projects.vercel.app/admin) · `dpl_Fx4WGhSAFFTaPXzXg2L61werHPNX` · projeto Vercel `erp-neia-salgados`, ambiente Preview.
- [Issue #3](https://github.com/luiz988061337-sketch/ERP-NEIA-SALGADOS/issues/3) e [PR #5](https://github.com/luiz988061337-sketch/ERP-NEIA-SALGADOS/pull/5).

## Alterações publicadas

| Commit | Arquivos | Correção |
| --- | --- | --- |
| `a7c0c67` | `admin-shell.tsx`, `admin-nav.ts`, `acesso-painel.tsx`, `precificacao-admin.tsx`, rotas `atendente`, `producao`, `central-entregas`, `pdv` e `clientes` | Mantém aba e menu alinhados com o router. Grupos recolhidos são restaurados após a hidratação. Clientes volta ao grupo Principal. Os painéis mostram falha de permissões com nova tentativa. Precificação distingue espera, falha e configuração ausente. |
| `ea5e16d` | `src/routes/financeiro.tsx` e `src/components/financeiro-premium/premium.css` | Restaura seis indicadores na mesma linha em desktop largo e a segunda fileira da referência, com despesas por categoria, saúde financeira e próximos compromissos. A central de riscos usa contas vencidas e pendências que o ERP consegue apurar. |
| `2be5e0c` | `src/routes/checkout.tsx` | Aguarda a restauração do carrinho antes de redirecionar uma sessão com carrinho vazio. As cinco etapas e suas regras continuam no fluxo existente. |

A referência histórica foi aberta na Vercel e reconstruída localmente a partir do commit exato, com o modo demonstrativo daquele Preview. As capturas operacionais foram feitas no Chromium, com respostas locais controladas, chamadas externas bloqueadas e modo demo desligado. Valores, fotos de registros, mapas, gráficos e disponibilidade dependem dos dados. A estrutura visual pôde ser comparada separadamente dessas diferenças.

[Referência, antes e depois no desktop](validacao-21nov/paineis-desktop.jpg) · [Referência, antes e depois no celular](validacao-21nov/paineis-celular.jpg) · [Páginas públicas](validacao-21nov/paginas-publicas.jpg)

## Painéis prioritários

| Painel | Referência de 21/11 e implementação operacional | Resultado e pendência |
| --- | --- | --- |
| Dashboard | `/admin`. Cabeçalho, quatro indicadores, gráficos de vendas e canais, ranking, últimos pedidos e alertas. `DashboardGestao` e `DashboardAdmin` permanecem ligados às consultas existentes. | Estrutura conferida e navegação local aprovada. Falta conferir valores e atalhos com uma sessão real. |
| Gestão de Pedidos | O link Pedidos no Preview histórico abre a Central da Atendente. A branch operacional mantém o Painel Geral de quatro estágios em `/admin#pedidos`. | Quatro colunas confirmadas no navegador. Falta testar um ciclo com dados autorizados. |
| Central da Atendente | `/admin#pedidos` no histórico e `/admin#central-atendente` na administração operacional. O papel atendente usa `/atendente`. | Três colunas, aceite e alertas preservados. Falta testar aceite, som e atualização em tempo real no staging. |
| Produção | `/producao`. Três colunas na mesma ordem. Aguardando permissão e erro têm estados explícitos. | Navegação local aprovada. Remessas de 50, conferência, retirada e impressão real pendentes de teste autorizado. |
| Entregas | `/central-entregas`. Indicadores, mapa, pedidos e cartões. A apresentação operacional usa consultas de rotas e coordenadas existentes. | Navegação local aprovada. Falta conferir trajetos e atribuição direta e validar o App Motoboy sem aceite. |
| PDV | `/pdv`. Catálogo e comanda lateral com abas, filtros e controles existentes. | Navegação local aprovada. Falta verificar catálogo, pedido, pagamento e comanda com dados de teste autorizados. |
| CRM | `/clientes`. Cabeçalho de segmentação, indicadores, filtros e tabela. | Atalho de Clientes no Principal recuperado. Falta conferir filtros, histórico e totalizadores em staging. |
| Financeiro | `/financeiro`. A referência tem uma linha de seis KPIs, duas fileiras de três quadros e abas. | Essa organização foi recuperada. O gráfico usa entradas e saídas, os quadros usam contas e eventos existentes, e os formulários operacionais foram preservados. Indicadores demonstrativos sem fonte real ficam fora do operacional. Conciliação, pagamentos parciais, alertas fiscais e auditoria ainda exigem validação real. |

## Demais painéis e páginas

- Produtos, Estoque de Insumos e Precificação abriram na navegação local. Precificação está bloqueada em homologação porque o catálogo do banco confirma que a tabela `public.precificacao_config` está ausente. A tela sinaliza a falha e oferece nova tentativa. Fichas Técnicas, Compras e Fornecedores têm entradas operacionais nas abas `#fichas`, `#compras` e `#fornecedores`. Cadastros dedicados de combos, embalagens e estoque de salgados aparecem no histórico como rotas de demonstração. Ficou pendente homologar reservas, FEFO e seus cadastros dedicados.
- Comercial e Campanhas têm as entradas operacionais `/admin#comercial` e `/campanhas`. Relatórios abre em `/financeiro#relatorios`. Pesquisas, Sugestões, Resultados e Reembolsos têm referências demonstrativas. Compras, Fornecedores e Campanhas renderizaram os fluxos operacionais existentes, com estrutura diferente das telas premium demonstrativas de 21/11. A paridade visual desses módulos, suas ações persistentes, as permissões de equipe e as funções fiscais seguem pendentes. [Inventário local da referência](validacao-21nov/inventario-referencia-local.json) · [Inventário local operacional](validacao-21nov/inventario-operacional-local.json)
- As seis imagens de `referencias-visuais/` foram comparadas com as páginas do cliente. Monte seu Combo mantém categorias e resumo lateral. Ajuda e Parceiros mantêm identidade clara e suas seções. Orçamentos usa a calculadora existente. Acompanhamento usa as etapas do pedido e depende de coordenadas para o mapa.
- Carrinho abriu nos dois tamanhos no teste local. Checkout permaneceu em `/checkout` no desktop e no celular com carrinho preenchido no teste local. A renderização manteve cinco etapas. Envio de pedido, pagamento, frete e acompanhamento ponta a ponta continuam pendentes de homologação com dados autorizados.

## Testes

| Verificação | Resultado |
| --- | --- |
| `npm run typecheck`, `npm run build` | Passaram na revisão operacional. |
| Suítes locais existentes | 75 testes em 40 arquivos passaram. As suítes focadas de Precificação, Financeiro e Carrinho foram executadas novamente e passaram. |
| Navegação local desktop 1440×900 e celular 390×844 | 14 cliques em cada tamanho sem recarregar o documento. Inclui Pedidos, Atendente, estoque, Precificação, Financeiro e suas abas, PDV, Cozinha, Entregas, Clientes e volta ao Dashboard. Voltar, avançar, troca repetida e recarga de Pedidos passaram. |
| Links diretos e login local | `/admin#pedidos` e `/financeiro#caixa` retornaram às abas corretas após login interceptado no navegador. |
| Recuperação de permissões no PDV | Depois de forçar erro na consulta local de papéis, Tentar novamente abriu o painel no desktop e no celular sem recarregar. |
| Preview remoto | O documento e o arquivo JavaScript responderam HTTP 200. O link direto para Dashboard abriu o login com o destino preservado. Proteção Vercel habilitada. |
| Supabase de homologação | O JavaScript servido aponta exclusivamente para `lflzlcqinarrcgncafol.supabase.co`, com modo demo desativado no build operacional. A leitura do catálogo de staging confirmou as tabelas de pedidos, remessas, reservas, rotas, impressão, contas, caixa e eventos financeiros, além das funções de aceite, produção, estoque, atribuição, conciliação e pagamento. A consulta não executou essas funções. Sessão de funcionário e verificação dos fluxos continuam pendentes. |
| Produção | `main`, Production, bancos, políticas, migrations e credenciais foram preservados. Nenhuma criação de pedido ou cobrança real foi executada nesta etapa. |

[Resultado da navegação](validacao-21nov/resultado-local.json) · [Resultado dos links diretos](validacao-21nov/resultado-auth-local.json) · [Resultado das páginas públicas](validacao-21nov/resultado-publico-local.json) · [Recuperação de permissões](validacao-21nov/resultado-permissoes-local.json)
