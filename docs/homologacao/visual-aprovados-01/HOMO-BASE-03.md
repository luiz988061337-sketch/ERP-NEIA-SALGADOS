# ERP-NEIA-VISUAL-APROVADOS-01

Registro HOMO-BASE-03, de 20/11/2026. Versão dos layouts aprovados até esta etapa, não homologação funcional definitiva do ERP. Branch: `homologacao-finalizacao`. Tag local prevista: `visual-aprovados-01`, exclusivamente após verificações essenciais satisfatórias.

## Escopo e critérios de aprovação

APROVADO VISUALMENTE PELO PROPRIETÁRIO significa a aprovação expressamente informada pelo proprietário no pedido HOMO-BASE-01. Não significa persistência, autorização de publicação, validação financeira, migração ou aprovação de todas as implementações operacionais.

VALIDADO TECNICAMENTE indica apenas os tipos, compilação e testes locais registrados nesta etapa. PENDENTE DE TESTES FUNCIONAIS aplica-se a todos os módulos quanto ao fluxo real completo e serviços externos.

O checkpoint contém a árvore completa do aplicativo e o histórico anterior, incluindo dependências declaradas, lockfiles, componentes compartilhados, rotas geradas, estilos, assets, scripts e fixtures. Não é um commit inicial apenas com os arquivos alterados. As demais telas são preservadas sem atribuir aprovação visual não confirmada.

## Módulos com aprovação visual informada

| Código | Módulo e rotas | Fontes principais | Capturas históricas disponíveis |
|---|---|---|---|
| H01 | Dashboard L2: `/admin#dashboard` em demo; `/preview-l2-gestao` | `src/components/admin/dashboard-l2.tsx`, `dashboard-admin.tsx`, `src/routes/preview-l2-gestao-data.ts` | `docs/erp-dark/prints/gestao-preview-l2.png`, `gestao-preview-l2-celular.png`, `gestao-DEPOIS.png` |
| H02 | Pedidos / Central da Atendente: `/admin#pedidos` em demo; `/preview-l2-atendente` | `src/components/admin/central-atendente-l2.tsx`, `central-atendente-l2-data.ts`, `src/components/central-pedidos.tsx` | `docs/erp-dark/prints/central-atendente-PREVIEW-desktop.png`, `central-atendente-PREVIEW-celular.png`; `docs/preview-captures/prints/preview-central-atendente-desktop.png` |
| H03 | Produção / Cozinha: `/producao`; `/preview-l2-producao` | `src/routes/producao.tsx`, `src/lib/producao-demo-fixtures.ts`, rota L2 | `docs/erp-dark/prints/producao-DEPOIS.png`, `producao-DEPOIS-celular.png`; `docs/preview-captures/prints/preview-preview-l2-producao-desktop.png` |
| H04 | Central de Entregas / Rotas: `/central-entregas` em demo; `/preview/central-entregas-v2` | `src/components/entregas/central-entregas-premium.tsx`, respectivas rotas | `docs/erp-dark/prints/central-entregas-DEPOIS.png`, `central-entregas-DEPOIS-celular.png`; capturas desktop/celular em `docs/preview-captures/prints/` |
| H05 | PDV / Balcão: `/pdv`; `/preview-l2-pdv` | `src/routes/pdv.tsx`, `src/routes/preview-l2-pdv.tsx` | `docs/erp-dark/prints/pdv-preview-l2.png`, `pdv-DEPOIS.png`, `pdv-DEPOIS-celular.png`; `docs/preview-captures/prints/preview-pdv-desktop.png` |
| H06 | Clientes / CRM e Comercial C1–C5: `/clientes` em demo; `/preview/comercial/{painel,clientes,campanhas,pesquisas-reclamacoes,sugestoes,resultados}` | `src/components/comercial-preview/`, `src/routes/preview/comercial.tsx` e rotas filhas | `docs/estoques/comercial/local-c1a/` (painel e CRM desktop/celular). A comparação original individual de C2–C5 continua pendente |
| H07 | Financeiro Premium: `/financeiro` em demo; `/preview/financeiro-premium` | `src/routes/preview/financeiro-premium.tsx`, `src/components/financeiro-premium/` | `docs/financeiro-premium/validacao/depois-topo-1440.png`, `depois-desktop-1440.png`, `depois-mobile-390.png`; `acabamento-final/` |
| A01 | Cadastro de Produtos: `/preview/cadastro-produtos` | `src/components/estoque-preview/tela-produtos.tsx`, `produtos.ts` | `docs/estoques/complemento/local/cadastro-produtos-desktop.png`, `cadastro-produtos-mobile.png` e formulário |
| A02 | Combos: `/preview/combos` | `src/components/estoque-preview/tela-combos.tsx`, `combos.ts` | `docs/estoques/combos/local/cadastro-combos-desktop.png`, `cadastro-combos-mobile.png` e formulário |
| A03 | Embalagens: `/preview/estoque-embalagens` | `src/components/estoque-preview/tela-suprimentos.tsx`, `suprimentos.ts` | `docs/estoques/validacao/local/embalagens-desktop-1672.png`, `embalagens-mobile-390.png` |
| A04 | Estoque de Salgados: `/preview/estoque-salgados` | `src/components/estoque-preview/tela-salgados.tsx`, `salgados.ts` | `docs/estoques/validacao/local/salgados-desktop-1672.png`, `salgados-mobile-390.png` |
| A05 | Estoque de Insumos: `/preview/estoque-insumos` | `src/components/estoque-preview/tela-suprimentos.tsx`, `suprimentos.ts` | `docs/estoques/validacao/local/insumos-desktop-1672.png`, `insumos-mobile-390.png` |

As imagens acima são capturas históricas da implementação. Não foi estabelecida correspondência certificada entre cada arquivo e os anexos originais aprovados pelo proprietário. Os originais individuais permanecem não identificados; não se inventou evidência de igualdade visual. As capturas não comprovam que o navegador atual já foi comparado pixel a pixel. O catálogo completo está em `capturas-disponiveis.json`.

## Atualizações recentes preservadas sem ampliar a aprovação

| Tela | Rota | Fontes adicionais preservadas |
|---|---|---|
| Precificação | `/admin#precificacao` | `src/components/admin/precificacao-admin.tsx` |
| Cupons | `/admin#cupons` | `src/components/admin/cupons-premium.tsx` |
| Calculadora | `/admin#calculadora` | `src/components/admin/calculadora-premium.tsx` e formulário administrativo |
| Compras | `/admin#compras` | `src/components/admin/compras-premium.tsx` |
| Fornecedores | `/admin#fornecedores` | `src/components/admin/fornecedores-premium.tsx` |
| Fiscal | `/fiscal` | `src/components/admin/fiscal-premium.tsx` |
| Contador | `/contador` | `src/components/admin/contador-premium.tsx` |
| Relatório do Dono | `/admin#dono` | `src/components/admin/dono-premium.tsx` |
| Metas | `/admin#metas` | `src/components/admin/metas-premium.tsx` |
| Gestão de Motoboys | `/motoboy` em demo | `src/components/admin/motoboys-premium.tsx` |

Incluídos também `erp-ui.tsx`, `admin-shell.tsx`, `admin-nav.ts`, `src/lib/estoque-premium-demo.ts`, `src/lib/contabilidade-premium-demo.ts`, `src/lib/demo-preview.ts`, CSS Comercial H06B e integração nas rotas. Capturas originais individualmente certificadas destas atualizações não foram localizadas nesta consolidação. Preservação não equivale a nova aprovação visual ou funcional.

## Dados demonstrativos e limites operacionais

- O build de reprodução deve usar `VITE_DEMO_PREVIEW=1` no cliente e no servidor. O verificador fornece destinos fictícios `.invalid` e bloqueia rede durante os processos locais.
- Dashboard, Atendente, Entregas, Clientes e Financeiro têm caminhos condicionais ao modo demo. Não se presume igualdade com as versões operacionais nem persistência real.
- As prévias L2 de Produção e PDV reutilizam hooks de consulta e sessão. A injeção de fixtures, isoladamente, não garante ausência de chamadas; manter o cliente demo e o bloqueio de rede.
- Os cadastros de produtos, combos, insumos e embalagens compartilham estado demonstrativo em memória. Financeiro Premium e telas Premium recentes usam exemplos locais quando indicado. Recarregar pode descartar mutações.
- Fontes externas e serviços de mapas, autenticação, impressão, GPS, banco, conciliação e mensagens não foram homologados aqui. A compilação offline não comprova a aparência final dependente dessas fontes.
- As demais telas existentes, incluindo público, Reembolsos e operação legada, permanecem na árvore sem nova declaração de aprovação.

## Backup e separação das worktrees

O proprietário confirmou que o OpenCode está pausado nas duas worktrees. O backup adicional, sem sobrescrever os anteriores, está fora do repositório:

`C:\Users\User\ERP-NEIA-BACKUPS\HOMO-BASE-03-20261120-VISUAL-APROVADOS-01`

- `ERP-PRINCIPAL`: 1.728 arquivos, dos quais 389 protegidos por DPAPI; bundle do histórico de `homologacao-finalizacao` verificado.
- `APP-MOTOBOY-SEPARADO`: 842 arquivos, dos quais 4 protegidos; bundle da branch própria verificado. Nenhum arquivo dessa worktree foi integrado neste checkpoint.
- Cada arquivo foi copiado, relido e comparado por SHA-256; os arquivos de origem foram conferidos novamente contra o manifesto. Acesso à pasta restrito ao usuário Windows, SYSTEM e Administradores.
- Arquivos sensíveis são armazenados com sufixo `.dpapi`; a restauração depende do mesmo usuário/perfil Windows. Isso não substitui custódia externa das credenciais e do perfil.
- Excluídos do backup somente diretórios regeneráveis listados no manifesto: dependências instaladas, resultados de build e caches. Dependências declaradas e lockfiles foram preservados. A pasta auxiliar desta auditoria também foi excluída.
- Backups antigos de aplicação examinados datam de outubro/novembro e não contêm componentes atuais como Central L2 e Cupons Premium. Quatro manifestos antigos (M12, M13, M16 e M17) tiveram 4.575 registros SHA-256 verificados, sem arquivo ausente ou divergente. Nenhum backup antigo cobre integralmente os 41 arquivos atuais de código comparados. Os demais não tiveram integridade certificada por um manifesto de aplicação reconhecido. Backups LFL são de banco, não desta árvore visual. Resultados em `backups-verificados.json`.

## Inventário, seleção e revisão do histórico

Estado inicial: HEAD `564df52a2c11dcdb27258917f3d381e9cb99ffa9`, 31 modificados e 294 não rastreados. Não havia arquivos preparados nem tag `visual-aprovados-01`.

Dos 325 itens pendentes, 266 são selecionados para preservar código, navegação, fixtures, regras do projeto e evidências relacionadas aos layouts. Os 59 restantes permanecem intactos e cobertos pelo backup: logs/HTML temporários, relatórios avulsos, documento de continuidade, cache da CLI, ferramenta auxiliar de commit e propostas/procedimentos SQL sem dependência da reprodução visual. Nenhum arquivo foi apagado. As decisões por caminho e hashes iniciais estão em `inventario-pendencias.json`.

Os 45 commits locais posteriores a `ab5d1e2fba22837de3c4907ced7da08426b003e4` foram inventariados por SHA, assunto e caminhos. São 274 caminhos alterados no diff líquido e 949 blobs textuais distintos examinados por padrões conhecidos de credenciais privadas. Nenhuma ocorrência desses padrões foi encontrada; isso não constitui prova absoluta de ausência de segredos. Não foram acrescentadas mudanças de ambientes ao checkpoint.

O histórico contém funcionalidades comerciais, financeiras, estoque, entregas e migrations 0105–0123, além dos layouts. Não é um pacote exclusivamente visual e não autoriza execução de SQL. Nenhum procedimento remoto, migration, restauração real ou deploy foi executado. Arquivos `.env` e `.env.production` preexistentes são mantidos sem alteração; o primeiro contém configurações publicáveis e o segundo flags de build. Configurações locais privadas não rastreadas não são adicionadas.

## Verificação de recuperação e testes

ESTADO DA VERIFICAÇÃO: APROVADA NO ALCANCE LOCAL. TypeScript, 30 suítes locais e build completo passaram na cópia restaurada, com modo demo e rede bloqueada. Resultado por verificação, versões e limites em `resultado-verificacao.json`. Isso não é homologação funcional.

Procedimento: materializar a árvore preparada pelo Git em diretório novo e isolado; reutilizar somente as dependências já instaladas, por ligação local de `node_modules`; executar typecheck, 30 suítes existentes de regras locais e build completo com dados demo e rede bloqueada. Não executar SQL, Auth remoto, impressão real ou testes conectados. Esta verificação não substitui uma instalação limpa a partir do registro de pacotes.

Comando do verificador, a partir da cópia isolada: `node scripts/visual-aprovados-verificar.mjs`. Logs ficam fora dos arquivos versionados, em diretório ignorado ou no destino explícito `NEIA_VISUAL_RESULTADOS`.

A árvore inicial preparada e testada é `932823542d1c7d9087ea80dc736523987d1b4c8f`: seus 1.174 arquivos foram comparados aos objetos Git, sem ausentes ou divergentes após a compilação. Dois nomes Unicode que o extrator TAR do Windows não materializou corretamente foram recuperados diretamente de seus blobs Git; eram documentos, sem alteração de código. A conferência final usa ZIP e comparação dos blobs de toda a árvore. As mudanças posteriores aos testes ficam restritas aos documentos e resultados desta homologação; o código e as configurações precisam permanecer idênticos à árvore testada antes do commit.

O Node usado foi v24.19.0. Todas as 77 dependências diretas instaladas correspondem às versões do `package-lock.json`. A recuperação reutilizou essas dependências; instalação limpa via `npm ci` não foi executada. Os avisos de build sobre chunks grandes, tempos de plugins e a fixture `preview-l2-gestao-data.ts` sem exportação de Route não impediram a compilação. A fixture continua sendo importada pelo Dashboard; não é uma rota.

As suítes cobrem proteção do ambiente, estoques/cadastros/combos, Comercial C1–C5, cálculos financeiros, contratos estáticos e mocks de operações financeiras, precificação, Central/Produção, regras demonstrativas de entregas, movimentos e reservas, criação atômica com mocks, insumos, OFX, leitor PIX, frete de checkout e competência. Não foram executados testes conectados a banco nem fluxos reais. As telas Premium recentes tiveram verificação de tipos e compilação, sem nova homologação funcional ou visual pelo agente.

O GitHub foi consultado novamente pelo conector e continua em `ab5d1e2fba22837de3c4907ced7da08426b003e4`, ancestral do HEAD inicial, com 45 commits locais exclusivos antes desta consolidação. A tag deve apontar ao commit cuja árvore final está preservada e conferida. Revalidar o remoto antes de eventual envio; o histórico pendente inclui migrations e integrações, que exigem avaliação própria antes de publicar.

## Restrições mantidas

Sem push, publicação, alteração de `main`, migration, alteração no Supabase ou reescrita de histórico. Não se cria a tag definitiva Visual V1.0. `visual-aprovados-01` identifica somente os layouts aprovados até agora. Envio da branch e da tag depende de autorização posterior do proprietário.
