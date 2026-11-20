# HOMO-VISUAL-04 — Organização dos layouts aprovados

Registro de organização e conferência do versionamento dos layouts aprovados, emitido em 20/11/2026 na branch `homologacao-finalizacao`. Complementa `HOMO-BASE-03.md` sem o alterar, sem reescrever histórico e sem ampliar as aprovações ali registradas.

## 1. Estado verificado (auditoria Git somente leitura)

| Item | Resultado conferido |
|---|---|
| Branch atual | `homologacao-finalizacao` |
| `HEAD` | `37ea9d07d8a1bec0a4f956f8d13ab7853b3b71fb` |
| Checkpoint preservado | `37ea9d07d8a1bec0a4f956f8d13ab7853b3b71fb` — `HOMO-BASE-03 — Consolidação dos módulos visuais Néia Salgados` |
| Tag preservada | `visual-aprovados-01` é tag anotada (objeto `00e012228ef52cc1db3d557491d4adb70b67f777`) que aponta para o commit `37ea9d07…`, ou seja, para o próprio checkpoint |
| Relação `37ea9d07…...HEAD` | `0 0` — são o mesmo commit; nenhum commit visual posterior ao checkpoint |
| Remoto | `origin/homologacao-finalizacao` em `ab5d1e2fba22837de3c4907ced7da08426b003e4`; `HEAD` está **46 commits à frente e 0 atrás** (conferido por `git rev-list --count`) |
| Upstream local | Não configurado para a branch; a contagem foi feita contra o ref de rastreamento remoto |
| Árvore `src/` | Limpa: nenhum arquivo modificado ou não rastreado em `src/` |
| Alterações preexistentes fora do escopo | `M supabase/.temp/cli-latest` e diversos relatórios, logs e scripts não rastreados — mantidos intactos, não selecionados |
| Worktree do App Motoboy | `feat/app-motoboy-integracao-m3-a` em `C:/Users/User/ERP-NEIA-BOY-WT` — não tocada |

Conclusão da auditoria: não existe alteração visual aprovada posterior ao checkpoint que esteja sem versionar. Todo o código visual está rastreado e comitado no próprio checkpoint.

## 2. Módulos com aprovação visual informada

Commit que preserva o estado atual de **todos** os itens abaixo: `37ea9d07d8a1bec0a4f956f8d13ab7853b3b71fb`.

| Código | Nome / rota | Fontes principais | Referência visual disponível | Status | Pendências |
|---|---|---|---|---|---|
| H01 | Dashboard L2 — `/admin#dashboard` (demo), `/preview-l2-gestao` | `dashboard-l2.tsx`, `dashboard-admin.tsx`, `preview-l2-gestao-data.ts` | `docs/erp-dark/prints/gestao-preview-l2.png`, `gestao-preview-l2-celular.png`, `gestao-DEPOIS.png` | Aprovado visualmente; validado localmente | Fluxo real com backend não homologado; capturas são históricas, não certificadas como originais |
| H02 | Pedidos / Central da Atendente — `/admin#pedidos` (demo), `/preview-l2-atendente` | `central-atendente-l2.tsx`, `central-atendente-l2-data.ts`, `central-pedidos.tsx` | `docs/erp-dark/prints/central-atendente-PREVIEW-desktop.png`, `…-celular.png` | Aprovado visualmente; validado localmente | Mesma ressalva de capturas e fluxo real |
| H03 | Produção / Cozinha — `/producao`, `/preview-l2-producao` | `src/routes/producao.tsx`, `producao-demo-fixtures.ts` | `docs/erp-dark/prints/producao-DEPOIS.png`, `producao-DEPOIS-celular.png` | Aprovado visualmente; validado localmente | Prévia L2 reutiliza hooks de sessão; manter bloqueio de rede na reprodução |
| H04 | Central de Entregas / Rotas — `/central-entregas` (demo), `/preview/central-entregas-v2` | `central-entregas-premium.tsx` e rotas | `docs/erp-dark/prints/central-entregas-DEPOIS.png`, `…-celular.png` | Aprovado visualmente; validado localmente | Serviços de mapa/GPS não homologados |
| H05 | PDV / Balcão — `/pdv`, `/preview-l2-pdv` | `src/routes/pdv.tsx`, `src/routes/preview-l2-pdv.tsx` | `docs/erp-dark/prints/pdv-preview-l2.png`, `pdv-DEPOIS.png`, `pdv-DEPOIS-celular.png` | Aprovado visualmente; validado localmente | Impressão e pagamento reais não homologados |
| H06 | Clientes / CRM e Comercial C1–C5 — `/clientes` (demo), `/preview/comercial/*` | `src/components/comercial-preview/`, `src/routes/preview/comercial.tsx` e filhas | `docs/estoques/comercial/local-c1a/` (painel/CRM) | Aprovado visualmente; validado localmente | Comparação individual C2–C5 permanece pendente |
| H07 | Financeiro Premium — `/financeiro` (demo), `/preview/financeiro-premium` | `src/routes/preview/financeiro-premium.tsx`, `src/components/financeiro-premium/` | `docs/financeiro-premium/validacao/depois-topo-1440.png`, `depois-desktop-1440.png`, `depois-mobile-390.png`, `acabamento-final/` | Aprovado visualmente; validado localmente | Conciliação/OFX reais não homologados |
| A01 | Cadastro de Produtos — `/preview/cadastro-produtos` | `estoque-preview/tela-produtos.tsx`, `produtos.ts` | `docs/estoques/complemento/local/cadastro-produtos-desktop.png`, `…-mobile.png` | Aprovado visualmente; validado localmente | Estado demo em memória; recarregar descarta mutações |
| A02 | Combos — `/preview/combos` | `estoque-preview/tela-combos.tsx`, `combos.ts` | `docs/estoques/combos/local/cadastro-combos-desktop.png`, `…-mobile.png` | Aprovado visualmente; validado localmente | Mesma ressalva de estado demo |
| A03 | Embalagens — `/preview/estoque-embalagens` | `estoque-preview/tela-suprimentos.tsx`, `suprimentos.ts` | `docs/estoques/validacao/local/embalagens-desktop-1672.png`, `…-390.png` | Aprovado visualmente; validado localmente | Mesma ressalva de estado demo |
| A04 | Estoque de Salgados — `/preview/estoque-salgados` | `estoque-preview/tela-salgados.tsx`, `salgados.ts` | `docs/estoques/validacao/local/salgados-desktop-1672.png`, `…-390.png` | Aprovado visualmente; validado localmente | Mesma ressalva de estado demo |
| A05 | Estoque de Insumos — `/preview/estoque-insumos` | `estoque-preview/tela-suprimentos.tsx`, `suprimentos.ts` | `docs/estoques/validacao/local/insumos-desktop-1672.png`, `…-390.png` | Aprovado visualmente; validado localmente | Mesma ressalva de estado demo |

## 3. Atualizações premium preservadas no checkpoint

Os códigos P01–P10 são **rótulos de organização desta auditoria**, não novos códigos de aprovação. O `HOMO-BASE-03.md` registra estas telas como preservadas sem ampliar a aprovação; não se declara aqui aprovação visual ou funcional que o proprietário não tenha expressamente informado.

| Código | Nome / rota | Fontes principais | Referência visual | Status | Pendências |
|---|---|---|---|---|---|
| P01 | Precificação — `/admin#precificacao` | `src/components/admin/precificacao-admin.tsx` | Nenhuma original certificada localizada | Preservada no checkpoint; validada por tipos/build | Aprovação visual não comprovada nos autos |
| P02 | Cupons — `/admin#cupons` | `src/components/admin/cupons-premium.tsx` | Nenhuma original certificada localizada | Preservada; validada por tipos/build | idem |
| P03 | Calculadora — `/admin#calculadora` | `src/components/admin/calculadora-premium.tsx` | Nenhuma original certificada localizada | Preservada; validada por tipos/build | idem |
| P04 | Compras — `/admin#compras` | `src/components/admin/compras-premium.tsx` | Nenhuma original certificada localizada | Preservada; validada por tipos/build | idem |
| P05 | Fornecedores — `/admin#fornecedores` | `src/components/admin/fornecedores-premium.tsx` | Nenhuma original certificada localizada | Preservada; validada por tipos/build | idem |
| P06 | Fiscal — `/fiscal` | `src/components/admin/fiscal-premium.tsx`, `src/routes/fiscal.tsx`, `src/lib/fiscal.ts` | Capturas locais de verificação fora do repositório (`check-fiscal.png`) não são originais aprovados | Preservada; validada por tipos/build e captura local | Ajustes recentes: sem `AdminTopbar` no modo demo, largura total, provedor em 2 colunas e Documentos com busca/filtro; fluxo real intacto |
| P07 | Contador — `/contador` | `src/components/admin/contador-premium.tsx`, `src/routes/contador.tsx`, `src/lib/contabilidade-premium-demo.ts` | Capturas locais fora do repositório (`check-contador.png`) não são originais aprovados | Preservada; validada por tipos/build e captura local | Ajustes recentes: KPIs com fundo colorido, seletor de competência, badge ABERTO, exportações e largura total |
| P08 | Relatório do Dono — `/admin#dono` | `src/components/admin/dono-premium.tsx` | Captura local (`check-dono.png`) não certificada | Preservada; validada por tipos/build | Aprovação visual não comprovada nos autos |
| P09 | Metas — `/admin#metas` | `src/components/admin/metas-premium.tsx` | Captura local (`check-metas.png`) não certificada | Preservada; validada por tipos/build | idem |
| P10 | Gestão de Motoboys — `/motoboy` (demo) | `src/components/admin/motoboys-premium.tsx`, `src/routes/motoboy.tsx` | Captura local (`check-motoboy.png`) não certificada | Preservada; validada por tipos/build | Ajustes recentes replicando a referência na Visão Geral e demais abas; worktree separada não integrada |

## 4. Componentes compartilhados, CSS e dependências

- **Componentes compartilhados**: `src/components/admin/erp-ui.tsx` (`PremiumPageHeader`, `PremiumKpi`, `PremiumSection`, `PremiumDemoBadge`, `StatusBadge`), `admin-shell.tsx`, `admin-nav.ts`, `ui-admin.tsx`, `src/lib/demo-preview.ts`.
- **Fixtures demo**: `src/lib/estoque-premium-demo.ts`, `src/lib/contabilidade-premium-demo.ts`, `producao-demo-fixtures.ts`, `central-atendente-l2-data.ts`, `preview-l2-gestao-data.ts`.
- **Rotas de integração**: `src/routes/__root.tsx` (banner e shell), `src/routes/admin.tsx` (hashes dos painéis), `src/routes/contador.tsx`, `fiscal.tsx`, `motoboy.tsx`.
- **CSS**: `src/erp-dark.css`, `src/styles.css`, `src/styles-preview.css`, `src/components/comercial-preview/*.css`, `src/components/estoque-preview/estoques.css`, `src/components/financeiro-premium/premium.css`.
- **Dependências**: React 19, TanStack Router/Query/Start, Tailwind 4 (`@tailwindcss/vite`), Radix UI, lucide-react, recharts, sonner, clsx, tailwind-merge, class-variance-authority, Supabase JS, zod, react-hook-form; desenvolvimento com TypeScript 5.8, Vite 8, Nitro e `puppeteer-core` para capturas. `package-lock.json` preservado. Nenhuma dependência nova foi acrescentada após o checkpoint.
- **Versionamento**: todos os arquivos acima estão rastreados e são idênticos entre `37ea9d07…` e `HEAD`. Não há diff de código entre o checkpoint e a ponta da branch.

## 5. Imagens de referência — critério de uso

As imagens listadas nas seções 2 e 3 são **capturas históricas da implementação** ou capturas locais de verificação. Não foi estabelecida correspondência certificada entre cada arquivo e o anexo original aprovado pelo proprietário. A presença de uma captura não prova igualdade pixel a pixel nem aprovação. Para H06, a comparação individual de C2–C5 segue pendente. Para P01–P10, não há originais individualmente certificados no repositório.

## 6. Etapa 2 — Commits

Não foram criados commits de módulos visuais. Todo o código visual aprovado já está incluído no checkpoint `37ea9d07…`, e `HEAD` coincide com ele, portanto criar commits seria duplicar registro. Nenhum commit anterior foi reescrito; a tag `visual-aprovados-01` não foi alterada; nenhum `git add .`, push, deploy, migration ou alteração em `main`/Supabase/Vercel foi executado. Os arquivos não rastreados preexistentes foram mantidos intactos e fora de qualquer seleção.

A única alteração desta etapa é documental: este registro e o resultado da validação local.

## 7. Etapa 4 — Validação

- `npx tsc --noEmit`: passou sem erros.
- `npx vite build`: concluído com sucesso.
- Verificador local `node scripts/visual-aprovados-verificar.mjs` com `VITE_DEMO_PREVIEW=1`, destinos `.invalid`, bloqueio de rede e saída em diretório temporário fora do repositório: 30 suítes locais, typecheck e build.
- Conferência visual dos 9 painéis premium em 1680×950: `topbar=false` em todos; Contador e Fiscal com largura total; sem conteúdo centralizado indevido.
- Recuperabilidade do checkpoint: objeto do commit presente (`git cat-file -t` = `commit`); tag anotada resolvendo para o mesmo commit; árvore de `src/` idêntica entre checkpoint e `HEAD`; backup externo conferido em `HOMO-BASE-03.md`. Nenhuma alteração importante foi perdida.

## 8. Etapa 5 — Prontidão e pendências reais

- **Pronta para revisão de segurança?** Sim, no escopo local: histórico íntegro, checkpoint e tag recuperáveis, sem credenciais acrescentadas e com validações locais passando.
- **Pronta para envio ao GitHub?** Não automaticamente. Depende de autorização expressa do proprietário. Antes do envio, reconferir o remoto, pois o histórico pendente contém migrations e integrações que exigem avaliação própria.
- **Pendências**: aprovação visual documental de P01–P10; comparação individual H06 C2–C5; validação funcional com backend real; `supabase/.temp/cli-latest` modificado preexistente e relatórios/logs não rastreados deliberadamente excluídos; nenhuma tag definitiva Visual V1.0 foi criada.
