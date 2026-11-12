# RELATÓRIO — Ajuste visual da Produção (referência aprovada)

Data: 2026-11-12 · Branch: `homologacao-finalizacao` · SHA do código: `89e3004`

---

## 1. Preview

| Item | Valor |
|---|---|
| **URL** | `https://erp-neia-salgados-eexsxwf7v-luiz988061337-3147s-projects.vercel.app` |
| **ID do deploy** | `dpl_6nUWUMg5btSie3vCWF1EEw4mHZWP` |
| **Target** | `preview` — **NÃO é Production** |
| **SHA do deploy = SHA local** | ✅ `89e30047f21220a75a603466364e24a9db6efb82` |
| Rota de conferência | `/preview-l2-producao` (Preview com Vercel Authentication → entre na Vercel) |
| **Production intacta** | ✅ `dpl_DK144zp5kG9FSsL4J5HdniQ34Ukk` · `main` @ `366074f` |

---

## 2. Ajustes visuais (conforme a referência aprovada)

### Cabeçalhos das três colunas

| Item | Antes | Agora |
|---|---|---|
| Título | à esquerda, `text-xs` | **centralizado**, `font-display text-xl uppercase bold`, com sombra suave |
| Ícone | ausente | **ícone à esquerda** (⏰ A Fazer / ⚒️ EM PREPARO / ✅ PRONTO) |
| Contador | pílula pequena à direita | **badge destacado** (quadrado escuro, `font-display text-base`) à direita |
| Fundo | cor sólida | cor sólida preservada: **laranja / azul / verde** |
| Altura | 42px | 56px |

### Cards

| Item | Agora |
|---|---|
| Topo | `#número` + badge de prioridade + **"🕐 até HH:MM"** (ou **"✅ Finalizado HH:MM"** na coluna Pronto, via `pronto_em`) |
| Modalidade | chip **"🚚 Entrega"** / **"🏪 Retirada"** + cliente |
| Produtos | emoji de processo + quantidade em destaque + nome |
| Total | **"Total: N salgados"** (rótulo branco, número dourado) |
| Observações | caixa "💬 Obs.: …" |
| Avisos | faixa "⚠️ ATENÇÃO — faltam X min para o limite." / "Não reconhecido" |
| Botões | **"▶ Iniciar preparo"** (dourado, largura total) · **"✓ Finalizar"** (azul, largura total) · **"🔔 Avisar caixa"** (dourado, entrega) · **"🏪 Liberar retirada"** (verde, retirada) · "Imprimir" (secundário, preservado) |
| Borda do card | na cor da coluna (laranja / azul / verde) |
| Tempos técnicos internos | **ocultos** (decisão do proprietário) |

### Menu lateral

**Nenhum menu novo.** A Produção usa o mesmo `AdminShell` aprovado no Dashboard e no PDV — mesma largura, logotipo, ordem, ícones, cores, bordas, espaçamento, rodapé e navegação. Apenas **"Produção"** fica em pílula dourada quando a tela está aberta (por rota real `/producao`; na rota de conferência, pela aba informada).

### Correção de exibição

Cada pedido passa a ficar em **uma única coluna** — "A Fazer" não repete pedidos que já estão em preparo (antes o mesmo pedido aparecia nas duas, com aviso de chave duplicada).

---

## 3. Regras de negócio preservadas

Agendamentos e prioridades, controle de combos/quantidades, confirmação de preparo, impressão de comandas, integração com pedidos, integração com a Central de Entregas, retirada física do freezer, cálculo de atraso e todos os status.

**"Avisar caixa" e "Liberar retirada" executam exatamente a mesma transição real já existente** (pedido pronto → `aguardando_motoboy`, com notificação push/WhatsApp, histórico de status e cupom) — só o rótulo e a cor mudam conforme a modalidade.

---

## 4. Testes

| Teste | Resultado |
|---|---|
| `npm run typecheck` | ✅ sem erros |
| `npm run build` | ✅ client 25,4s · ssr 18,2s · nitro 6,1s |
| `npm run teste:guard` | ✅ 41/41 |
| `git diff --check` | ✅ sem erros de whitespace |
| ESLint | 59 problemas (56 `no-explicit-any` já existentes no arquivo) |
| Visual desktop | ✅ `producao-PREVIEW-desktop.png` (do Preview hospedado) |
| Visual mobile | ✅ `producao-PREVIEW-celular.png` (390×844) |
| Operações com escrita | ✅ nenhuma — conferência usa fixtures locais; status, impressão e reservas bloqueados |

---

## 5. Arquivos alterados

| Arquivo | Alteração |
|---|---|
| `src/components/admin/erp-ui.tsx` | `KanbanColumn`: cabeçalho com ícone, título centralizado em fonte grande e contador em destaque (prop `icone`) |
| `src/routes/producao.tsx` | Card no padrão da referência; tempos técnicos ocultos; botões por modalidade; colunas com ícone; uma coluna por pedido; `modoPreview` no shell |
| `src/components/admin/admin-shell.tsx` | Destaque do item ativo também pela aba informada no modo conferência (sem alterar o menu) |
| `src/routes/preview-l2-producao.tsx` | Fixtures com `pronto_em` para exibir "Finalizado HH:MM" |
| `scripts/ajustar-card-producao.mjs`, `ajustar-fixtures-producao.mjs` | Scripts de ajuste (novos) |

---

## 6. Preservação do Dashboard e do PDV

- **Dashboard** ✅ intacto — `docs/erp-dark/prints/gestao-PREVIEW-desktop.png`
- **PDV** ✅ intacto — `docs/erp-dark/prints/pdv-PREVIEW-desktop.png`
- **Production** ✅ inalterada (`dpl_DK144zp5kG9FSsL4J5HdniQ34Ukk` / `main` @ `366074f`)

---

## 7. Capturas

| Arquivo | Conteúdo |
|---|---|
| `docs/erp-dark/prints/producao-PREVIEW-desktop.png` | Produção desktop **do Preview hospedado** |
| `docs/erp-dark/prints/producao-PREVIEW-celular.png` | Produção mobile (390×844) |
| `docs/erp-dark/prints/producao-DEPOIS.png` / `-celular.png` | Mesma tela (render local do mesmo commit) |

**Etapa encerrada. Aguardando aprovação visual da Produção antes de seguir para a Central de Entregas.**
