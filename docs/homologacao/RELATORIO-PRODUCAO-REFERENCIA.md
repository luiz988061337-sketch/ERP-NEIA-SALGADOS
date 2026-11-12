# RELATÓRIO — Etapa Produção / Cozinha (réplica visual preto/dourado)

Data: 2026-11-12 · Branch: `homologacao-finalizacao` · SHA: `dd979a3`

---

## 1. Preview

| Item | Valor |
|---|---|
| **URL** | `https://erp-neia-salgados-ml864136x-luiz988061337-3147s-projects.vercel.app` |
| **ID do deploy** | `dpl_8QGjqk4nu35D9yHwSL2RjKkSsNpL` |
| **Target** | `preview` — **NÃO é Production** |
| **SHA do deploy = SHA local** | ✅ `dd979a3b78a8c3bf201cd296949377f1d9123618` |
| Rota de conferência | `/preview-l2-producao` (Preview tem Vercel Authentication → entre na Vercel) |
| **Production intacta** | ✅ `dpl_DK144zp5kG9FSsL4J5HdniQ34Ukk` · `main` @ `366074f` |

---

## 2. Alterações visuais realizadas

### Estrutura (referência "PRODUÇÃO – COZINHA")

| Elemento | Antes | Agora |
|---|---|---|
| Menu lateral | tela solta, sem shell | **shell do Dashboard** (sidebar compacta, coroa, "Produção" em pílula dourada na rota `/producao`, usuário no rodapé) |
| Cabeçalho do módulo | banner "Despache (Produção)" com foto | **"PRODUÇÃO — COZINHA"** + subtítulo "Pedidos organizados por status, com prioridades e tempo de preparo" + selo verde **COZINHA** + "Em operação" |
| Hierarquia | Kanban no fim, depois de ~8 blocos | **Kanban é o conteúdo principal**, logo abaixo do cabeçalho; todo o resto foi para a seção recolhível **"Operação em detalhes"** (totais do dia, donut, consolidados, listas, filtros) |
| Colunas | cabeçalho translúcido com borda inferior | **barra colorida sólida** com contador: **A FAZER (laranja)**, **EM PREPARO (azul)**, **PRONTO (verde)** |
| Card do pedido | branco, bloco único, badge de status textual | card **escuro** com borda dourada e barra lateral por nível de prioridade; **nº do pedido**, badge de prioridade (Urgente/Atenção/Atraso/Risco), chip de modalidade (**Entrega**/**Retirada**), cliente, **produtos com quantidades**, **total de salgados**, **observações**, prazo do cliente, tempo técnico, alertas coloridos, ações e **tempo estimado no canto inferior direito** |
| Ações | botões padrão | **Iniciar preparo** / **Marcar como pronto** / **Chamar motoboy** em dourado, **Imprimir** discreto |

### Correções de exibição (sem alterar regra de negócio)

1. **Coluna "Pronto" sempre vazia** — "pronto" é filtrado da fila (`incluirProntos` desligado) e, como o toggle vivia dentro da seção recolhida, a coluna nunca mostrava nada. Agora a coluna lista os pedidos prontos do dia (`pedidosDoDia`); a fila de preparo e a consolidação continuam usando o mesmo filtro.
2. **Pedido duplicado em "A Fazer"** — a lista de prioridade é subconjunto da fila e era concatenada antes dela. Agora a coluna usa a união sem repetição, mantendo a prioridade no topo.

### Preservado integralmente

Agendamentos e prioridades, controle de combos/quantidades, confirmação de preparo, impressão de comandas (Tanca), integração com pedidos, integração com a Central de Entregas, regras de tempo técnico/fritadeiras/pastéis/assados, retirada física do freezer, cálculo de atraso, fila de impressão e toda a lógica de status.

### Modo conferência (sem escrita)

`/preview-l2-producao` renderiza o painel real com **pedidos fictícios locais**; `mudarStatus`, `imprimirDireto` e as reservas ficam bloqueados nesse modo (aviso no toast). Nenhum pedido é criado ou alterado no backend.

---

## 3. Testes

| Teste | Resultado |
|---|---|
| `npm run typecheck` | ✅ sem erros |
| `npm run build` | ✅ client 22,0s · ssr 18,3s · nitro 6,0s |
| `npm run teste:guard` | ✅ 41/41 |
| `git diff --check` | ✅ sem erros de whitespace |
| ESLint (`producao.tsx` + nova rota) | 58 problemas (todos `no-explicit-any` já existentes) — **antes eram 102** no mesmo arquivo |
| Visual desktop | ✅ `producao-PREVIEW-desktop.png` (do Preview hospedado) |
| Visual mobile | ✅ `producao-PREVIEW-celular.png` (390×844) |
| Operações com escrita | ✅ nenhuma — fixtures locais; sem status, impressão, reserva, pedido ou migração |

---

## 4. Arquivos alterados

| Arquivo | Alteração |
|---|---|
| `src/routes/producao.tsx` | Reforma visual (shell, cabeçalho, Kanban como conteúdo principal, card na anatomia da referência); correções de exibição (coluna Pronto e duplicidade); `Producao` exportado com props opcionais de conferência (`preview`, `pedidosInjetados`) e guardas de escrita |
| `src/components/admin/erp-ui.tsx` | `KanbanColumn` com cabeçalho em barra colorida sólida + contador (usado só pela Produção) |
| `src/routes/preview-l2-producao.tsx` | Rota de conferência com pedidos fictícios (novo) |
| `scripts/captura-producao.mjs`, `reorganizar-producao.mjs` | Capturas e reestruturação (novos) |
| `src/components/admin/dashboard-admin.tsx`, `erp-ui.tsx` (demais) | apenas reformatação do prettier |

---

## 5. Preservação do Dashboard e do PDV

- **Dashboard** ✅ — layout aprovado intacto; captura do mesmo deploy em `docs/erp-dark/prints/gestao-PREVIEW-desktop.png`
- **PDV** ✅ — layout aprovado intacto; captura do mesmo deploy em `docs/erp-dark/prints/pdv-PREVIEW-desktop.png`
- **Production** ✅ — inalterada (`dpl_DK144zp5kG9FSsL4J5HdniQ34Ukk` / `main` @ `366074f`)

---

## 6. Capturas

| Arquivo | Conteúdo |
|---|---|
| `docs/erp-dark/prints/producao-PREVIEW-desktop.png` | Produção desktop **do Preview hospedado** |
| `docs/erp-dark/prints/producao-PREVIEW-celular.png` | Produção mobile (390×844) |
| `docs/erp-dark/prints/producao-DEPOIS.png` / `-celular.png` | Mesma tela com a comanda completa |
| `docs/erp-dark/prints/gestao-PREVIEW-desktop.png` | Dashboard no mesmo deploy (aprovado, inalterado) |
| `docs/erp-dark/prints/pdv-PREVIEW-desktop.png` | PDV no mesmo deploy (aprovado, inalterado) |

**Etapa encerrada. Aguardando aprovação visual da Produção antes de seguir para a Central de Entregas.**
