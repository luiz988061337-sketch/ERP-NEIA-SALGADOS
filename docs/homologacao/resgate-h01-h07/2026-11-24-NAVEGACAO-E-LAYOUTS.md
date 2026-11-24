# Recuperação da navegação e dos layouts H01–H07

**24 de novembro de 2026. Entrega parcial para homologação.**

- Branch [resgate-visual-h01-h07-codex](https://github.com/luiz988061337-sketch/ERP-NEIA-SALGADOS/tree/resgate-visual-h01-h07-codex)
- Base da rodada `d9f26dae2a26ee6fc73a6c758ea24c4922217ea9` e [revisão do Preview](https://github.com/luiz988061337-sketch/ERP-NEIA-SALGADOS/commit/2248d565730434e362b544199c16f04ed77e00cc)
- [Preview protegido](https://erp-neia-salgados-9q09ai2kj-luiz988061337-3147s-projects.vercel.app/admin) no projeto `erp-neia-salgados`
- Referência [visual-aprovados-01](https://github.com/luiz988061337-sketch/ERP-NEIA-SALGADOS/tree/37ea9d07d8a1bec0a4f956f8d13ab7853b3b71fb)
- [Issue #3](https://github.com/luiz988061337-sketch/ERP-NEIA-SALGADOS/issues/3) e [PR #5](https://github.com/luiz988061337-sketch/ERP-NEIA-SALGADOS/pull/5)

## P0 — Navegação

A PR #5 confirmou que o estado interno das abas dependia de eventos que a navegação do TanStack Router não dispara. A implementação lê o fragmento da localização do router em `admin.tsx`, `financeiro.tsx` e `admin-shell.tsx`. A URL, o painel e o destaque do menu passam a seguir a mesma fonte. No Financeiro, a montagem dos formulários foi preservada durante as trocas de aba. O shell usa a lista de destinos operacionais e o menu da atendente aponta para a rota compatível com seu papel.

O primeiro teste no Preview revelou um redirecionamento repetido para o login. As guardas de Admin e Financeiro agora atuam somente enquanto sua rota é a atual. O login preserva o endereço interno de retorno, incluindo `#pedidos` ou `#caixa`, e valida o papel antes de navegar. As consultas de permissão de Admin e Financeiro exibem erro e oferecem nova tentativa. O router exibe espera durante o carregamento e limita a recuperação automática a uma recarga por falha de chunk dentro do intervalo de proteção.

| Verificação | Resultado |
| --- | --- |
| Navegação local no Chromium, desktop 1440×900 e celular 390×844 | 13 cliques em cada tamanho, com Dashboard, Pedidos, Central da Atendente, Produtos, Estoque de Insumos, Financeiro, Caixa, Relatórios, PDV, Produção, Entregas e CRM. Foi contabilizado somente o documento inicial até a recarga solicitada pelo teste. |
| Voltar, avançar, retornar a Pedidos e recarregar | Passaram nos dois tamanhos. O quadro de quatro colunas permaneceu selecionado após recarga, sem erro de página e sem rolagem horizontal em Pedidos. |
| Sem sessão, login local e retorno | Desktop retornou a `/admin#pedidos`. Celular retornou a `/financeiro#caixa`. A suíte interceptou o Auth e as consultas no navegador local, com gravações externas bloqueadas. |
| Preview remoto sem sessão do ERP | No navegador, `/admin#pedidos` abriu o formulário com um único `redirect=%2Fadmin%23pedidos`. |
| Autenticação real e navegação com dados de testes | **PENDENTE** de sessão de administrador e, em seguida, dos outros papéis de teste. Os resultados locais não atestam autenticação ou integração de staging. |
| Suítes | `npm run typecheck` e `npm run build` passaram. 39 suítes locais existentes passaram na correção de navegação. Central de Pedidos, Financeiro Premium e os contratos de Auth/staging foram executados novamente após a correção de login e passaram. As suítes de staging que gravam registros ficaram pendentes de autorização. |

[Evidências do navegador local](validacao-p0/resultado-local.json) · [Cenários de login local](validacao-p0/resultado-auth-local.json) · [Antes/depois desktop](validacao-p0/comparativo-desktop.jpg) · [Antes/depois celular](validacao-p0/comparativo-mobile.jpg) · [Tag e telas operacionais no desktop](validacao-p0/referencia-tag-desktop.jpg) · [Tag e telas operacionais no celular](validacao-p0/referencia-tag-mobile.jpg)

As capturas antes/depois executam as rotas operacionais no Chromium com respostas locais controladas. A coluna “Antes” usa a base `d9f26dae`. Nessa base, `#pedidos` já exibia a Central em três colunas, daí a mesma tela nas linhas H02-P e H02-A. As capturas da tag têm valores demonstrativos. Nas capturas operacionais, mapa, catálogos e gráficos podem aparecer vazios quando faltam respostas no teste local.

## Matriz visual e funcional

| Painel e rota | Referência e implementação | Resultado e pendência |
| --- | --- | --- |
| H01 Dashboard `/admin#dashboard` | `gestao-preview-l2.png` em `docs/erp-dark/prints`. `DashboardAdmin` usa o quadro e gráficos da apresentação L2. | Quatro indicadores, dois gráficos e resumo inferior presentes. O alerta da captura da tag depende dos dados. **PENDENTE** comparar o PNG original e validar indicadores, alertas e atalhos com sessão real. |
| H02-P Gestão de Pedidos `/admin#pedidos` | [Especificação derivada do original](../referencias-originais/H02-PEDIDOS-ORIGINAL-ESPECIFICACAO.md). Quadro operacional em `admin.tsx` e agrupamento em `pedidos-gestao.ts`. | Quatro colunas verificadas. Busca, modalidade, estágio, cartões e ações existentes usam pedidos operacionais. O aceite permanece na Central e a etapa de preparo na Cozinha. **PENDENTE** comparar pixels do original, avaliar detalhes de prazo e risco, conferir volume acima dos 60 pedidos exibidos e testar ações persistentes com autorização. |
| H02-A Central da Atendente `/admin#central-atendente` e `/atendente` | `central-atendente-PREVIEW-desktop.png` em `docs/erp-dark/prints`. Reutiliza `CentralPedidos` e suas regras de som. | Três colunas com aviso e ações preservadas. Suíte local comprova reconhecimento individual, volume 75% e intervalo de 30 s. **PENDENTE** sessão real de atendente e verificação do som com pedido real de testes. |
| H03 Cozinha `/producao` | `producao-DEPOIS.png` em `docs/erp-dark/prints` e implementação `producao.tsx`. | Três colunas com cartões e ações por etapa. Na referência há uma faixa de indicadores acima do título. **PENDENTE** revisar acabamento, validar remessas de 50, conferência, impressão, aviso de caixa e liberação de retirada com autorização. |
| H04 Entregas `/central-entregas` | `central-entregas-DEPOIS.png` em `docs/erp-dark/prints` e apresentação compartilhada com `central-entregas-premium.tsx`. | Mapa e coluna de rotas estão presentes. Etiquetas de rota, prazos e mapa com trajeto ficaram sem evidência com dados reais. **PENDENTE** confirmar atribuição direta, retirada, liberação e operação do App Motoboy com sessão e autorização. |
| H05 PDV `/pdv` | `pdv-preview-l2.png` em `docs/erp-dark/prints` e implementação `pdv.tsx`. | Presentes catálogo, filtros e comanda lateral. O catálogo da captura local estava vazio. **PENDENTE** conferir cartões com produtos reais, pedido de 50, modalidades, Pix, cartão, dinheiro e impressão. |
| H06 CRM `/clientes` | `docs/estoques/comercial/local-c1a/clientes-crm-desktop.png` e fonte `clientes.tsx`. | Cabeçalho, indicadores, filtros e tabela presentes. Alguns filtros e indicadores têm fontes diferentes da demonstração. **PENDENTE** validar segmentação, classificação, ranking e histórico em staging. |
| H07 Financeiro Premium `/financeiro` | `docs/financeiro-premium/validacao/depois-desktop-1440.png` e fonte `financeiro.tsx`. | Abas e indicadores presentes, com disposição e densidade distintas da referência. Caixa e Relatórios trocaram sem F5. **PENDENTE** acabamento do painel, conciliação, pagamento parcial, auditoria e leitura por papel em staging. |

A revisão usou os registros `HOMO-BASE-03.md`, `HOMO-VISUAL-04.md`, os relatórios de Dashboard e PDV e as capturas identificadas na tag. A Biblioteca retornou a indexação dos três arquivos originais abaixo. A transferência dos PNGs para inspeção visual falhou por DNS. A comparação em pixels desses três arquivos permanece pendente.

- [Painel de Pedidos Néia Salgados.png](https://chatgpt.com/library?file_id=libfile_d93730cb55988191ac086c88c8cd9f16&account_id=personal)
- [Painel de Gestão de Pedidos Néia Salgados.png](https://chatgpt.com/library?file_id=libfile_4b00c7d5041c8191901597f5172323e2&account_id=personal)
- [Dashboard ERP Néia Salgados Aprovado.png](https://chatgpt.com/library?file_id=libfile_478263c16d448191a82154ec0bbd6f8d&account_id=personal)

## Outros módulos

| Área | Entrada operacional identificada | Verificação |
| --- | --- | --- |
| Cadastro de produtos, combos, embalagens, salgados e insumos | `/admin#produtos` e `/admin#insumos`. `/pdv` e `/combo` usam o catálogo. | Produtos e insumos abriram pelo menu nos dois tamanhos. Cadastros dedicados de combos, embalagens e estoque de salgados aparecem nos previews. Sua integração operacional própria, reservas e FEFO seguem **PENDENTES**. |
| Compras, Fornecedores, Precificação e Fichas | `/admin#compras`, `#fornecedores`, `#precificacao` e `#fichas`. | Entradas identificadas no menu e no código. Persistência e permissões reais **PENDENTES**. |
| Comercial, Campanhas e CRM | `/admin#comercial`, `/campanhas`, `/clientes` e `/crm-config`. | CRM abriu pelo menu. Pesquisas, Sugestões e Resultados têm referências de preview. Execução e validação comercial **PENDENTES**. |
| Reembolsos e Estornos | Referência `/preview/reembolsos-estornos` e telas demonstrativas associadas. | O menu operacional omite previews. Dossiê e integração financeira **PENDENTES**. |
| Fiscal, Contador e Relatórios | `/fiscal`, `/contador` e `/financeiro#relatorios`. | Relatórios abriu nos dois tamanhos. Papéis, valores e documentos reais **PENDENTES**. |
| Funcionários, Gestão de Motoboys e impressão | `/equipe`, `/admin#motoboys`, `/motoboy` e `/impressao`. | Rotas identificadas. Escalas, permissões, atribuição e impressora de comanda **PENDENTES**. |

## Páginas públicas

[Seis referências e capturas](validacao-p0/comparativo-publico-desktop.jpg) · [Verificação local desktop e celular](validacao-p0/resultado-publico-local.json)

| Referência | Rota | Diferença observada |
| --- | --- | --- |
| Monte seu combo | `/combo` | Grade, cabeçalho claro e resumo lateral presentes. A grade operacional organiza as escolhas por categoria e mostra o resumo conforme a seleção. |
| Ajuda | `/ajuda` | Duas colunas, FAQ e contato. Hero, ordem das perguntas e posição das ações variam em relação ao mockup. |
| Orçamentos | `/calculadora` | Mostra estimativa e resumo calculado. O formulário ilustrado na imagem tem ordem e controles diferentes. `/orcamentos` é a operação interna. |
| Parceiros | `/parceiros` | Hero, benefícios e modalidades presentes. Espaçamento e posição da imagem e da chamada diferem. |
| Checkout | `/checkout` | A interface real separa cinco etapas conforme a especificação escrita. Na entrada direta local, a hidratação do carrinho chegou a redirecionar para `/carrinho`. A estabilidade do checkout com carrinho preenchido e frete autorizado está **PENDENTE**. |
| Acompanhamento | `/pedido/$id` | Mostra etapas, fidelidade, notificações e resumo. A maquete inclui mapa com rota. A sessão local não incluiu localização e a consulta real com pedido de testes está **PENDENTE**. |

O JavaScript servido pelo Preview publicado foi inspecionado e só traz o host `lflzlcqinarrcgncafol.supabase.co`. O build operacional usou `VITE_DEMO_PREVIEW=0`. A proteção de acesso do projeto Vercel segue habilitada. `main`, Production, dados dos bancos, credenciais, políticas RLS e migrations ficaram intactos nesta rodada.
