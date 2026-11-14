# E1 + E2 + E3 — Estoques demonstrativos

## Resultado e publicação

Três interfaces funcionais e independentes no **mesmo Preview Vercel**, aguardando aprovação visual do proprietário. Nenhuma integração operacional foi iniciada.

- Branch: `homologacao-finalizacao`.
- HEAD preservado: `673a0c98e4452a608cfe5f3065712ffa6cc0709a`.
- Deployment: `dpl_BDsU7N712JvE1Bxd1bAERf2twdLg`.
- Estado confirmado pelo `vercel inspect`: **READY**, `target: preview`.
- Publicação concluída com `vercel deploy --yes`, **sem `--prod`**.
- **Proteção Vercel Authentication ativa**: os links podem solicitar login em conta autorizada. Não foi desativada; a automação utilizou a sessão autorizada do CLI, com cookies somente em diretório temporário, fora do repositório.

### URLs completas

1. Salgados: https://erp-neia-salgados-5ev7pdy57-luiz988061337-3147s-projects.vercel.app/preview/estoque-salgados
2. Insumos: https://erp-neia-salgados-5ev7pdy57-luiz988061337-3147s-projects.vercel.app/preview/estoque-insumos
3. Embalagens: https://erp-neia-salgados-5ev7pdy57-luiz988061337-3147s-projects.vercel.app/preview/estoque-embalagens

As três rotas foram carregadas diretamente, hidratadas e exercitadas no Chrome após a publicação, não apenas verificadas por HTTP. As ações de entrada, reserva, FEFO, conversão de unidades e fardo configurável passaram no código publicado. Evidência: [resultado do navegador no Vercel](validacao/vercel/resultado.json) e [metadados](validacao/deployment.json).

## Arquivos

### Criados — código e testes

- `src/components/estoque-preview/salgados.ts` — fixtures e regras puras de físico, reserva, liberação, FEFO, perdas e inventário.
- `src/components/estoque-preview/suprimentos.ts` — regras independentes de insumos/embalagens, compra, retirada, conversão, conferência e configuração.
- `src/components/estoque-preview/contexto.tsx` — estados locais separados e lista demonstrativa de compras.
- `src/components/estoque-preview/shell.tsx` — composição com o AdminShell existente e dados de menu exclusivos do Preview.
- `src/components/estoque-preview/compartilhados.tsx` — campos, modais, formatação e histórico, reutilizando os componentes existentes.
- `src/components/estoque-preview/tela-salgados.tsx`.
- `src/components/estoque-preview/tela-suprimentos.tsx` — composição compartilhada das duas telas, sem misturar suas regras.
- `src/components/estoque-preview/estoques.css` — composição e responsividade localizadas; nenhum tema global novo.
- `src/lib/preview-estoques.ts` — allowlist exata das três URLs, incluindo apenas suas variantes com barra final.
- `src/routes/preview/_estoques.tsx` — layout TanStack sem segmento na URL, provider e CSS compilado.
- `src/routes/preview/_estoques/estoque-salgados.tsx`.
- `src/routes/preview/_estoques/estoque-insumos.tsx`.
- `src/routes/preview/_estoques/estoque-embalagens.tsx`.
- `scripts/estoques-preview.test.mjs`.
- `scripts/estoques-preview-visual.mjs`.

### Modificados — extensões isoladas

- `src/components/admin/admin-shell.tsx`: propriedade opcional `menuPreview`, utilizada somente com `modoPreview`; o renderer, o SidebarProvider, as classes e o menu padrão permanecem os existentes. Sem nova sidebar.
- `src/routes/__root.tsx`: reconhecimento das três rotas como administrativas e demonstrativas sem sessão/consultas ao banco. As demais rotas mantêm as condições existentes.
- `src/routes/preview.tsx`: as três rotas usam o shell administrativo e não carregam o chrome/CSS público do Preview.
- `src/routeTree.gen.ts`: atualizado pelo gerador TanStack, sem rotas manuais de MCP.

### Evidências e documentação

- `docs/estoques/ENTREGA.md` — este relatório.
- `docs/estoques/validacao/` — logs de typecheck/build/regras, resultados JSON, Git status, preservação e capturas.
- `validacao/diagnosticos/validacao-html-corrigida.png` registra um bloqueio de validação HTML encontrado e corrigido durante os testes; não é uma captura final nem uma falha pendente.

## Reutilização e preservação visual

- **AdminShell real**, seu menu lateral, marca, usuário, navegação mobile e estilos aprovados.
- `ModuleHeader`, `MetricCard`, `SectionCard`, `DarkTable`, `DarkTableRow`, `StatusBadge`, `ActionButton` e `ERP_COLORS`, de `src/components/admin/erp-ui.tsx`, sem modificar esse arquivo.
- `Dialog`, `Input`, `Label`, `SidebarTrigger`, ícones Lucide e notificações Sonner existentes.
- Tokens `--erp-*`, fontes e tema administrativo existentes; CSS novo limitado à composição `est-*`/`.estoques-preview`.
- `alocarFEFO`, `ordenarFEFO`, `validadeProxima`, `alertaEstoque` e `converterUnidade` existentes.
- Fotos locais já existentes, sem novos serviços externos.

Os componentes operacionais `InsumosAdmin`, `ComprasAdmin` e `AdminTopbar` não são montados porque fazem consultas reais. A prévia não consulta produtos, pedidos, fornecedores ou saldos reais.

Menu demonstrativo: **Produtos → Cadastro de Produtos / Estoque de Salgados / Combos; Estoque → Insumos / Embalagens**. Cadastro e combos abrem consultas/ações locais; links de outros módulos apenas informam que os módulos operacionais aprovados foram preservados.

## Funcionalidades

### E1 — Salgados

- Físico, reservado e disponível separados; disponível = físico − reservado.
- Exemplo inicial da coxinha: **2.000 / 350 / 1.650**. Nove produtos fictícios com identificadores únicos, sem novo estoque de combo.
- Indicadores, busca e filtros por categoria, situação, fornecedor e abaixo do mínimo.
- Entrada com lote/validade, reserva por sabor, combo 50/30/20, liberação por pedido, retirada avulsa ou vinculada à reserva, perda, inventário justificado e histórico.
- Reservas de combo atômicas: se algum sabor não tiver saldo, nenhum é reservado.
- Retirada com reserva diminui físico e pendência uma vez; cancelamento libera apenas a parte não consumida.
- Bloqueios de saldo negativo, reserva acima do disponível, pedido duplicado, repetição de operação e contagem que comprometa reservas.
- Lotes ordenados por FEFO, prioridades, próxima validade e alerta em até sete dias.

### E2 — Insumos

- Exemplos fictícios: farinha 4 pacotes × 5 kg; óleo 3 galões × 5 L; queijo 2 pacotes × 1 kg; ovos 5 bandejas × 30 un.
- Cadastro/edição de unidade de compra, equivalente, mínimo, preço e fornecedor.
- Compra, retirada fechada, parcial aproximada, conferência e ajuste justificado.
- Conversões g/kg e ml/L; mudança da unidade base preserva a quantidade física, sem misturar massa/volume/unidades.
- Saldos explicitamente estimados, inclusive embalagens abertas; sem obrigação de pesagem a cada uso.
- Histórico, alertas, reposição e rascunho local de compras. Custo inicial estimado: **R$ 347,80**, arredondado em centavos no indicador.

### E3 — Embalagens

- Saldos/custos independentes por tipo; caixas de 50 e 100 compartilham fornecedor fictício, não o saldo.
- Conteúdo do fardo/pacote configurável; novos tipos podem ficar **a definir**, sem presumir 25 ou 50 unidades.
- Compra, retirada inteira com quantidade inicial 1 e motivo preenchido, retirada parcial, conferência, ajuste, histórico, fornecedores e sugestão de reposição.
- Unidades inteiras protegidas; alteração do conteúdo do fardo não altera o físico existente.
- Sem estoque de embalagens em uso ou caixas montadas, sem registro de cada caixa utilizada e sem baixa automática por pedido.

Todas as movimentações válidas recalculam saldos/indicadores, registram histórico local e mostram confirmação. O estado é mantido ao navegar entre as três telas; **recarregar a página reinicia a demonstração**. Datas de referência e todos os valores são fictícios, baseados em 14/11/2026.

## Testes e resultados

| Validação | Resultado |
| --- | --- |
| `npm run typecheck` | Passou |
| `npm run build` | Passou, client + SSR + Nitro |
| `git diff --check` | Passou |
| `node scripts/estoques-preview.test.mjs` | 14 grupos passaram: E1/E2/E3 e allowlist isolada |
| `insumos.test.mjs` | Passou |
| `reserva-integracao.test.mjs` | Passou com dependências simuladas; nenhum teste transacional real executado nesta etapa |
| `reembolsos-estornos.test.mjs` | R1: 27 verificações passaram |
| `reembolsos-estornos-origens.test.mjs` | R2-A: 14 verificações passaram |
| `financeiro-premium.test.mjs` | Passou |
| `preview-producao.test.mjs` | Passou |
| `preview-pedidos-atendente.test.mjs` | Passou |
| `preview-central-v2.test.mjs` | Passou |
| `proteger-dev.test.mjs` | 41 verificações passaram |
| `estoques-preview-visual.mjs` | Passou local e no deployment Preview |
| `reembolsos-estornos-cliente-visual.mjs` | R2-B passou local e no mesmo Preview, inclusive tema público branco e quatro capturas de regressão em cada ambiente |

O build mantém avisos não bloqueantes sobre arquivos auxiliares em `src/routes`, imports dinâmicos/chunks grandes e temporização de plugins. Não foram alterados módulos aprovados para resolver avisos fora do escopo.

O teste de navegador exerceu entrada, reserva, retirada FEFO, cancelamento parcial, perda, inventário, combo, compra, retirada fechada/parcial, conferência, conversão de cadastro, rascunho, fardo de 40, cadastro a definir e persistência entre navegações. **Zero erros JavaScript, zero falhas HTTP e zero tentativas de acesso ao Supabase/Lovable Cloud** nas três rotas, localmente e no Preview.

Evidências: [regras e regressões](validacao/regras-regressoes.json), [local](validacao/local/resultado.json), [Vercel](validacao/vercel/resultado.json), [regressão R2-B publicada](validacao/regressao-r2b-vercel/resultado.json). Os logs individuais estão na mesma pasta de validação.

## Seis capturas finais reais — deployment publicado

Chrome headless real via Puppeteer; desktop com viewport **1672 × 941**, mobile **390 × 844**, capturas de página completa. As **seis imagens abaixo foram abertas e examinadas**, além das capturas locais anteriores.

| Tela | Desktop | Mobile |
| --- | --- | --- |
| Salgados | [Abrir](validacao/vercel/salgados-desktop-1672.png) | [Abrir](validacao/vercel/salgados-mobile-390.png) |
| Insumos | [Abrir](validacao/vercel/insumos-desktop-1672.png) | [Abrir](validacao/vercel/insumos-mobile-390.png) |
| Embalagens | [Abrir](validacao/vercel/embalagens-desktop-1672.png) | [Abrir](validacao/vercel/embalagens-mobile-390.png) |

### Comparação visual e adaptações

- Organização de Salgados: faixa de indicadores, filtros, tabela por sabor e três painéis inferiores de produto/lotes/movimentações.
- Organização de Insumos: indicadores, abas, tabela, ações rápidas, informações de custo/conferência e coluna de detalhes/alertas/histórico.
- Organização de Embalagens: aviso de estoque independente, indicadores, abas, tabela por tipo e painéis inferiores de ações/conferência/reposição.
- Conforme a regra final do pedido, o **AdminShell e os componentes administrativos aprovados têm prioridade sobre uma reprodução de sidebar/tema independente das imagens**. Foi mantida a identidade preto/grafite/dourado existente, sem tema público vermelho/laranja ou halos novos.
- As diferenças intencionais são a identificação da demonstração, dados fictícios consistentes, controles funcionais e adaptação responsiva. Não se declara equivalência pixel a pixel nem aprovação do proprietário.
- Mobile: indicadores em duas colunas, painéis empilhados e menu lateral do próprio AdminShell. As tabelas completas têm **rolagem horizontal interna**, com orientação de deslize; a página não tem overflow horizontal. Medição automática em cada rota: `documento = viewport = 390 px`.

## Git, segurança e preservação

- Nenhum stage, commit ou push. HEAD e branch permanecem os aprovados.
- [Git status completo](validacao/git-status.txt): quatro arquivos de código rastreados modificados por esta etapa, arquivos novos dos estoques/evidências não rastreados e todo o trabalho local anterior preservado. As três imagens já modificadas antes desta etapa continuam listadas, sem nova alteração do conteúdo.
- [Conferência de preservação](validacao/preservacao.json): **67 arquivos locais preexistentes conferidos por SHA-256; zero alterados ou ausentes**.
- R1, R2-A, R2-B, Dashboard, PDV, Atendente, Produção, Entregas e Financeiro não tiveram seus arquivos de módulo alterados. Os componentes/estilos administrativos aprovados e o tema público foram preservados.
- Supabase real: nenhuma consulta, movimentação, migration ou alteração de dados executada. Os estados novos são somente em memória.
- `.env`, migrations, políticas e permissões operacionais não foram modificados.
- Production conferida antes e depois: permanece `erp-neia-salgados-q9gvt9i8m-luiz988061337-3147s-projects.vercel.app`, `READY`, `target: production`, `createdAt: 1794479879887`. Não houve promoção, alteração de domínio ou deployment Production.
- Uma tentativa inicial com `--target=preview --json` foi rejeitada antes de criar deployment. O comando padrão autorizado concluiu **um único novo Preview**. Não se contornou autenticação/permissão nem se alterou configuração do projeto.

## Pendências — somente para etapa futura autorizada

1. Aprovação visual do proprietário para as três telas.
2. Informar unidades reais por fardo/pacote, mínimos, fornecedores, custos e saldos de abertura.
3. Vincular identificadores reais do cadastro único de produtos após autorização.
4. Projetar persistência/auditoria, permissões/RLS e transações idempotentes de estoque/reservas/FEFO, com testes de concorrência.
5. Integrar pedidos/combos, produção e compras sem baixa dupla e mantendo a simplicidade de insumos/embalagens.
6. Validar dados e regras em homologação antes de qualquer proposta para Production.

**Etapa encerrada para avaliação visual. Sem commit, sem push e sem início da integração real.**
