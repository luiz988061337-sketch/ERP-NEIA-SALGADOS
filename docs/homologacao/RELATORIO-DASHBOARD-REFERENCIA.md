# RELATÓRIO — Painel de Gestão (Dashboard) vs. imagem de referência

Data: 2026-11-12 · Branch: `homologacao-finalizacao` · SHA: `31ad525`
Etapa: **somente o Dashboard** (os demais módulos permanecem intocados nesta etapa)

---

## 1. Imagem de referência analisada

Composição do bloco "PAINEL DE GESTÃO" da imagem enviada:

| Elemento | Referência |
|---|---|
| Painel | moldura com borda dourada, cantos arredondados, fundo grafite |
| Cabeçalho | marca (coroa dourada) + título **PAINEL DE GESTÃO** (branco, caixa alta) + subtítulo "Visão completa do seu negócio em tempo real" + **seletor de data** à direita |
| Linha 1 | 4 cards de métrica: **ícone em quadrado colorido** (verde/azul/âmbar/ouro), label cinza, valor branco grande, **delta colorido à direita** |
| Linha 2 | "Vendas por Hora" (gráfico **de área** dourado, com pontos) + "Pedidos por Canal" (**donut** com total no centro e **legenda à direita** com ícones) |
| Linha 3 | **Produtos Mais Vendidos** (thumb + nome + qtd + valor) \| **Últimos Pedidos** (ponto de status + nº + hora + canal + valor) \| **Alertas** (ícone colorido por severidade) |

---

## 2. Capturas

| Arquivo | Conteúdo |
|---|---|
| `docs/erp-dark/prints/gestao-ANTES.png` | Dashboard **antes** (componente do commit `ef1859a`), mesmas fixtures |
| `docs/erp-dark/prints/gestao-DEPOIS.png` | Dashboard **depois** (implementação nova), desktop 1440×1000 |
| `docs/erp-dark/prints/gestao-DEPOIS-celular.png` | Dashboard novo, mobile 390×844 |
| `docs/erp-dark/prints/gestao-preview-l2.png` / `-celular.png` | mesma implementação pela rota de conferência |

As duas capturas usam **as mesmas fixtures locais** (`src/routes/preview-l2-gestao-data.ts`), sem tocar no Supabase.

---

## 3. Diferenças encontradas na referência

| # | Antes | Referência | Correção |
|---|---|---|---|
| 1 | Cards de métrica **dourados sólidos** (gradiente), com label cinza ilegível sobre o ouro | Card escuro com borda dourada, ícone em quadrado colorido, delta à direita | novo componente `PainelMetrica` em `erp-ui.tsx` |
| 2 | **Sem** cabeçalho de painel, sem título "Painel de Gestão", sem seletor de data | Cabeçalho com marca, título, subtítulo e seletor de data/periodo | novo componente `PainelCabecalho` + `<section>` com moldura dourada |
| 3 | Busca global no topo do conteúdo | Cabeçalho do painel no topo | busca movida para baixo do painel (mantida) |
| 4 | "Vendas por Hora" = **linha simples** (sem preenchimento) | **Área** dourada com gradiente e pontos | `AreaChart` com `linearGradient` + `dot`/`activeDot` |
| 5 | "Pedidos por Modalidade" = donut com legenda **embaixo**, sem total no centro, cores frias (azul/verde/âmbar) | Donut com **total no centro** e **legenda à direita** com ícone por canal (Delivery/Balcão/Encomendas) | donut + overlay central + legenda própria com ícones |
| 6 | Ordem dos blocos: Últimos Pedidos \| Mais Vendidos \| Alertas | Produtos Mais Vendidos \| Últimos Pedidos \| Alertas | ordem corrigida |
| 7 | Últimos Pedidos com **badge de status textual** (chips) | Ponto de status colorido + nº + hora + canal + valor dourado | linha reescrita com ponto, nº, hora, canal e valor em `#F2CE6B` |
| 8 | Tooltip e eixos dos gráficos em **cores claras** (`#FFFFFF`, `#E5E7EB`, `#64748B`) | Tooltip escuro com borda dourada, eixos cinza-quente | paleta escura nos gráficos |
| 9 | "Alertas" com chip de aviso em **âmbar claro** (`bg-amber-50`) | Card escuro com ícone colorido por severidade | remapeamento global dos chips da paleta Tailwind + ícones por severidade |
| 10 | Mini-gráfico "Vendas por dia" como **barra dourada chapada** | (não existe na referência) | gradiente dourado com largura limitada (legibilidade) |
| 11 | Rótulos das métricas truncados no mobile ("VE…", "R…") | — | rótulo com 2 linhas, delta apenas a partir de `sm` |

---

## 4. Mudanças estruturais (não só CSS)

- **`src/components/admin/erp-ui.tsx`**
  - `PainelMetrica`: card de métrica na anatomia da referência (ícone quadrado, label, valor, delta à direita)
  - `PainelCabecalho`: cabeçalho de painel (marca + título caixa alta + subtítulo + ações)
- **`src/components/admin/dashboard-admin.tsx`**
  - Dashboard reestruturado: `<section>` com moldura dourada > cabeçalho > 3 linhas (4 métricas / 2 gráficos / 3 blocos)
  - `Vendas por Hora` migrado de `LineChart` para `AreaChart` com gradiente
  - `Pedidos por Canal` virou donut com total ao centro e legenda própria (ícones) — `canais` calculado de `tipo_entrega` real
  - `Últimos Pedidos` reescrito (ponto de status, nº, hora, canal, valor)
  - Helpers novos: `dataLonga`, `corStatus`, `rotuloCanal`, `corAlerta`
  - Blocos funcionais preservados e reposicionados **abaixo** do painel (busca, Central de Operação, acesso rápido, avisos)
- **`src/erp-dark.css`** — camada nova 2.1: chips da paleta Tailwind (`bg-*-100`, `text-*-800`, `bg-amber-50`) convertidos para pastéis escuros (corrige o bloco branco do "Central de Operação" e os chips de status de todos os módulos)
- **`src/components/central-operacao.tsx`** — mini-gráfico com gradiente e largura limitada

Dados, regras de negócio, autenticação e consultas permaneceram **intactos** (todas as queries reais mantidas; só a apresentação mudou).

---

## 5. Arquivos modificados nesta etapa

| Arquivo | Tipo |
|---|---|
| `src/components/admin/dashboard-admin.tsx` | reestruturação do Dashboard |
| `src/components/admin/erp-ui.tsx` | `PainelMetrica`, `PainelCabecalho` |
| `src/components/central-operacao.tsx` | mini-gráfico |
| `src/erp-dark.css` | camada de chips de status |
| `src/routes/__root.tsx` | rota de conferência entra como staff (`/preview-l2`) |
| `src/routes/preview-l2-gestao.tsx` + `preview-l2-gestao-data.ts` | rota de conferência com fixtures locais |
| `scripts/captura-gestao.mjs`, `scripts/capturar-preview.mjs`, `scripts/capturar-preview-proxy.mjs`, `scripts/debug-chart.mjs` | captura/validação visual |

---

## 6. Testes

| Teste | Resultado |
|---|---|
| `npm run typecheck` | ✅ sem erros |
| `npm run build` | ✅ client 20.1s · ssr 15.6s · nitro 5.6s |
| `git diff --check` | ✅ sem erros de whitespace |
| `npm run teste:guard` (guard existente) | ✅ 41/41 |
| Supabase | **nenhuma escrita** — fixtures locais; sem migration; sem pedidos |

---

## 7. Preview

| Item | Valor |
|---|---|
| **URL** | `https://erp-neia-salgados-8tek614xy-luiz988061337-3147s-projects.vercel.app` |
| **ID do deploy** | `dpl_9pNGJCqN1MheFxhrYuk8AdUAze7X` |
| **Target** | `preview` — **NÃO é Production** (sem `--prod`, `main` intocada) |
| **SHA do deploy = SHA local** | ✅ `31ad525c69d2d3c93c71d843b9c76424826b59ec` |
| Rota de conferência | `/preview-l2-gestao` (o Preview tem Vercel Authentication: entrar na Vercel para abrir) |
| Verificação no bundle | HTML servido contém "Vendas por Hora", "Pedidos por Canal", "Produtos Mais Vendidos", seletor de data e `html.erp-admin` |

---

## 8. Observações para a próxima etapa

1. A referência mostra uma **sidebar interna** do painel (Início/Vendas/Pedidos/…). No ERP real a navegação já é o **shell do admin** (sidebar global) — evita duplicar menus. Se quiser a sidebar interna dentro do painel, é só dizer.
2. A 4ª métrica é **"Clientes Ativos"** (dado real). A referência usa "Lucro Estimado"; para calcular lucro real é preciso custo por produto/embalagem (hoje o painel não tem essa fonte) — posso incluir se houver dado de custo disponível.
3. Os blocos extras (busca, Central de Operação, ações rápidas) foram mantidos abaixo do painel para preservar funcionalidade; podem ser recolhidos em um acordeão se preferir o painel "limpo" da referência.
