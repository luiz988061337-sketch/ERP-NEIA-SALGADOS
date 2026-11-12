# RELATÓRIO — Etapa PDV / Balcão (réplica visual preto/dourado)

Data: 2026-11-12 · Branch: `homologacao-finalizacao` · SHA: `d43d074`

---

## 1. Preview

| Item | Valor |
|---|---|
| **URL** | `https://erp-neia-salgados-osun3qhta-luiz988061337-3147s-projects.vercel.app` |
| **ID do deploy** | `dpl_3CdS1dLDkCckZQ8GxoBhAiiV2KfL` |
| **Target** | `preview` — **NÃO é Production** |
| **SHA do deploy = SHA local** | ✅ `d43d074ebbf17d6deceeddbc0c8e0404e740e4cf` |
| Rotas de conferência | `/preview-l2-pdv` e `/preview-l2-gestao` (o Preview tem Vercel Authentication → entre na Vercel) |
| **Production intacta** | ✅ `dpl_DK144zp5kG9FSsL4J5HdniQ34Ukk` · `main` @ `366074f` (inalterada) |

---

## 2. Etapa 1 — Navegação administrativa

Verificações feitas no Preview publicado (`vercel curl` sobre o HTML servido):

| Item | Resultado |
|---|---|
| `/admin` renderiza o Dashboard | ✅ contém "Painel de Gestão", "Vendas do Dia", "Produtos Mais Vendidos" |
| Menu lateral aponta para rotas reais | ✅ `/producao`, `/central-entregas`, `/pdv`, `/equipe`, `/contador`, `/clientes`, `/campanhas` |
| Abas internas (Pedidos, Produtos, Estoque, Financeiro, Configurações, Entregas…) | ✅ trocam de aba via estado, sem URL nova |
| Demonstração vs. administração | ✅ `/preview-l2-*` tem selo **"Prévia"**, navegação neutra (não sai da conferência) e banner "dados fictícios"; a administração real segue em `/admin` |
| Autenticação e permissões | ✅ intactas — o preview só injeta dados; em `/pdv` e `/admin` reais, sessão/papéis são exigidos como antes |

Correção aplicada na navegação: **item ativo por rota** (antes, só as abas internas ganhavam destaque; agora `/pdv`, `/producao`, `/central-entregas`, `/equipe` e `/contador` também ficam em pílula dourada quando estão na rota real).

---

## 3. Etapa 2 — Reforma visual do PDV

### Estrutura (conforme a referência)

| Elemento | Antes | Agora |
|---|---|---|
| Menu lateral | inexistente (o PDV era uma tela solta com coluna própria) | **mesmo shell do Dashboard**: sidebar compacta, marca com coroa, "PDV / Balcão" em pílula dourada na rota `/pdv`, usuário no rodapé |
| Cabeçalho do módulo | "← Voltar" + logo + slogan | **"PDV — ATENDIMENTO E CAIXA"** com subtítulo "Registro de pedidos, pagamentos e impressão de comandas" e **selo verde "PDV"** (como na referência) |
| Busca | colada na coluna esquerda | **campo superior** no catálogo, largura elástica, com atalhos (Pedidos / Desconto / Vendas / Config) |
| Categorias | coluna vertical à esquerda | **chips horizontais** (Todos, Fritos, Assados, Pastéis, Congelados, Combos) com o ativo em dourado |
| Cards de produto | brancos, borda cinza | **escuros com borda dourada**, foto 96px, nome, preço em dourado e botão **+** de 36px (touch-friendly), hover com brilho dourado; grade de 4 colunas |
| Comanda | coluna branca "Comanda Atual #0001" | painel escuro **"PEDIDO #0001"**, itens com foto, nome, preço unitário, controles **− quantidade +**, valor da linha, botão de limpar; **Subtotal**, **Desconto** (mantém o bloqueio por autorização), barra **TOTAL** dourada, acórdões **Cliente** e **Agendar**, **3 meios de pagamento** (Dinheiro / PIX / Cartão) com o selecionado em dourado, **dividir pagamento** e indicador de quanto falta |
| Finalizar | "✓ Finalizar Venda" | **"✓ FINALIZAR PEDIDO"** em gradiente dourado, 56px de altura |
| Rodapé | branco | escuro com borda dourada, mesma organização de atalhos (Favoritos, Repetir Pedido, Calculadora, WhatsApp, Cupom/Indicação) |

### Regras preservadas (nenhuma alterada)

- Mínimo de 50 unidades e combos em múltiplos de 50 (`isMultiploCombo` / `tipoVendaProduto`)
- Combos, embalagens de 50 e 100, preços cadastrados (`precoFinal`, `preco_promocional`)
- Impressão de comanda (Tanca TP-550) e cupom no PIX
- Integração com estoque e criação de pedido (`decidirCriacaoAtomica`, RPCs)
- Métodos de pagamento e divisão de pagamento
- Desconto somente com autorização; agendamento; cliente opcional; busca de pedidos; repetição de pedido

### Modo conferência (sem escrita)

`/preview-l2-pdv` renderiza o **PDV real** com catálogo fictício **local**; `finalizar` é bloqueado com aviso, as queries de vendas do dia ficam desabilitadas e nenhuma escrita chega ao Supabase.

---

## 4. Etapa 3 — Comparação visual

Comparação feita entre a imagem original e a captura do Preview publicado
(`docs/erp-dark/prints/pdv-PREVIEW-desktop.png`):

| Item | Status |
|---|---|
| Menu lateral com item PDV destacado | ✅ igual ao padrão do Dashboard |
| Cabeçalho do módulo com selo verde | ✅ igual à referência |
| Busca superior + chips de categoria | ✅ igual à referência |
| Cards de produto escuros com borda dourada, foto, nome, preço, botão + | ✅ igual à referência |
| Painel do pedido à direita com itens, quantidade, total, meios de pagamento e botão dourado | ✅ igual à referência |

Divergências remanescentes (assumidas de forma consciente):
- A referência mostra apenas 5 itens no pedido; aqui a lista é rolável (mais pedidos por dia).
- A referência tem 4 categorias; aqui são as 6 do app (regra de negócio preservada).

---

## 5. Etapa 4 — Testes

| Teste | Resultado |
|---|---|
| `npm run typecheck` | ✅ sem erros |
| `npm run build` | ✅ client 21,2s · ssr 16,4s · nitro 5,0s |
| `npm run teste:guard` | ✅ 41/41 |
| `git diff --check` | ✅ sem erros de whitespace |
| Verificação de navegação | ✅ HTML do Preview conferido (rotas e conteúdo) |
| Teste visual desktop | ✅ `pdv-PREVIEW-desktop.png` (do Preview hospedado) |
| Teste visual mobile | ✅ `pdv-PREVIEW-celular.png` (390×844) |
| Operações com escrita | ✅ nenhuma — conferência usa fixtures locais; sem pedido, estoque, pagamento ou migração |

---

## 6. Arquivos modificados

| Arquivo | Alteração |
|---|---|
| `src/routes/pdv.tsx` | Reforma visual completa; `PDV` exportado com props opcionais de conferência (`preview`, `produtosInjetados`, `categoriasInjetadas`); nenhuma regra de negócio alterada |
| `src/components/admin/admin-shell.tsx` | Item ativo por rota; selo "Prévia"; largura compacta e aparência da referência |
| `src/routes/preview-l2-pdv.tsx` | Rota de conferência do PDV (novo) |
| `src/routes/preview-l2-gestao.tsx` | Passa a usar `modoPreview` (navegação neutra + selo) |
| `src/routes/__root.tsx` | `/preview-l2` na lista de rotas staff |
| `src/components/admin/dashboard-admin.tsx`, `erp-ui.tsx` | **apenas reformatação do prettier** (verificado: idêntico ao aprovado, ignorando espaços) |
| `scripts/captura-pdv.mjs`, `capturar-preview.mjs`, `check-*.mjs` | Capturas e verificações |

---

## 7. Confirmações

- **Dashboard permaneceu intacto** ✅ — diff contra o commit aprovado (`5125147`) mostra apenas formatação (vírgulas/quebras de linha); a captura do Preview (`docs/erp-dark/prints/gestao-PREVIEW-desktop.png`) mostra o painel aprovado.
- **Production permaneceu intacta** ✅ — `dpl_DK144zp5kG9FSsL4J5HdniQ34Ukk` / `main` @ `366074f`, sem novo alias e sem deploy.
- **Sem Supabase, sem migration 0104, sem WhatsApp, sem push para `main`.**

---

## 8. Capturas

| Arquivo | Conteúdo |
|---|---|
| `docs/erp-dark/prints/pdv-PREVIEW-desktop.png` | PDV desktop **do Preview hospedado** |
| `docs/erp-dark/prints/pdv-PREVIEW-celular.png` | PDV mobile (390×844) do Preview |
| `docs/erp-dark/prints/pdv-DEPOIS.png` | PDV desktop com comanda preenchida (2 itens, multiplicidade 50 visível) |
| `docs/erp-dark/prints/gestao-PREVIEW-desktop.png` | Dashboard no Preview (aprovado, inalterado) |
| `docs/preview-captures/prints/preview-pdv-desktop.png` / `-celular.png` | Mesmas telas a partir do artefato publicado |
