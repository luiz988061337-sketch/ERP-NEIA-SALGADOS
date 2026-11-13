# RELATÓRIO — Central de Entregas e Rotas (Etapa 5)

Data: 2026-11-13 · Branch: `homologacao-finalizacao` · SHA do código: `0852b05`

> **Contexto da etapa:** esta etapa consolida e entrega a **Central de Entregas e Rotas**
> para aprovação visual do proprietário, seguindo o mesmo padrão das etapas anteriores
> (Dashboard/Gestão, PDV/Balcão, Produção/Cozinha, Central da Atendente).
>
> **Limitação declarada:** a comparação visual passo a passo com a *imagem de referência
> anexada* não pôde ser executada neste ambiente — o anexo chegou sem dados visíveis
> utilizáveis pelo modelo de IA (formato de clipboard). A fidelidade foi validada, então,
> pela implementação existente da Central 2.0 (fase K8, com layout descrito como
> "aprovado em imagem") e pela verificação visual local dos renders. O proprietário deve
> conferir o pareamento antes/depois contra a imagem de referência.

---

## 1. Preview

| Item | Valor |
|---|---|
| **URL** | `https://erp-neia-salgados-oybpb91ri-luiz988061337-3147s-projects.vercel.app` |
| **ID do deploy** | `dpl_7nKZM7QTauzRzhTyPncNm7H35YWE` |
| **Target** | `preview` — **NÃO é Production** |
| **SHA do deploy = SHA local** | ✅ `26593455c662fdbe24fb15ed924ebb1b2e3834be` (árvore de entrega já commitada antes do relatório) |
| Rota de conferência | `/preview/central-entregas-v2` |
| **Production intacta** | ✅ `dpl_DK144zp5kG9FSsL4J5HdniQ34Ukk` · `main` @ `366074f` |

> Observação: o deploy `dpl_7nKZM7QTauzRzhTyPncNm7H35YWE` foi gerado a partir do commit
> `2659345` (feature da Central da Atendente) que já continha a Central de Entregas 2.0;
> o `0852b05` (este relatório) altera apenas documentos/capturas.

---

## 2. Funcionalidades implementadas (Central de Entregas e Rotas)

### 2.1 Mapa dominante
- Mapa no topo com **loja**, pedidos com localização, motoboys em rota e **paradas numeradas**.
- `src/components/map-view.tsx` reutiliza o provedor Google Maps configurado (`MapView`,
  `MapaPinAjustavel`, geocoding, Directions, haversine) com degradação honesta ("Mapa indisponível")
  quando a chave/serviço falha — permite operação manual sem inventar km.

### 2.2 Painel lateral
- Motoboys (status `disponivel_base` etc., elegíveis, entregas).
- Resumo do dia / indicadores operacionais.

### 2.3 Kanban de entregas (4 colunas)
`Aguardando Motoboy` · `Atribuídos` · `Em Rota` · `Entregues` — com busca, filtros, GPS/alerta de
ocorrência, histórico (J3-C) e encerramento de rota (J3-H).

### 2.4 Regras puras testáveis (K8.1/K8.2)
- `src/lib/preview-central-entregas.ts`: sugerir motoboy, bloqueio de atribuição duplicada,
  motoboy indisponível, `totaisRota` (soma de distâncias + 5 min/parada), reordenação de paradas,
  limite de rota (≤3, >3 exige confirmação), divisão de rota, atraso, próximo do prazo,
  localização desatualizada, alerta inteligente (no-prazo/risco/atrasado/sem-previsão), previsões
  por parada e pontuação de despacho.
- `scripts/preview-central-v2.test.mjs` — **19 casos passando** (K8.1/K8.2).

### 2.5 Regras reais do ERP (sem alteração)
- `src/lib/central-atribuicao.ts` (E4: RPC `atribuir_pedido_motoboy`, flags), `src/lib/entrega.ts`,
  `src/lib/motoboy-finalizacao.ts`, `src/components/admin/entregas-config-panel.tsx`,
  `src/lib/config-entrega.ts`.
- Fluxo: Central da Atendente → Produção → **Central de Entregas** → Motoboy. Cozinha só prepara/
  finaliza; caixa recebe avisos de pronto; Central de Entregas organiza/liberta rotas.
- **Nenhuma rota liberada automaticamente sem autorização** (confirmação manual; >3 paradas exige
  autorização explícita).

### 2.6 Financeiro (preservado)
- Taxa de referência R$ 1,50/km, mínima R$ 6,00; taxas ao motoboy; produtos retornam; acerto no
  fim do turno. Sem alteração nesta etapa.

---

## 3. Ajustes desta etapa (arquivos)

| Arquivo | Alteração |
|---|---|
| `src/routes/preview/central-entregas-v2.tsx` | Fixture: rota `r-ana` com **3 entregas agrupadas** (p1260, p1248, p1241) para demonstração do agrupamento |
| `scripts/captura-central-entregas.mjs` | **Novo** — captura desktop/mobile da Central de Entregas/Rotas (`/preview/central-entregas-v2`) |
| `docs/erp-dark/prints/central-entregas-DEPOIS.png` | **Novo** — captura desktop (1440×1000) |
| `docs/erp-dark/prints/central-entregas-DEPOIS-celular.png` | **Novo** — captura mobile (390×844) |

Arquivos do módulo que já existiam (não alterados nesta etapa): `src/routes/central-entregas.tsx`,
`src/components/admin/entregas-config-panel.tsx`, `src/lib/entrega.ts`, `src/lib/central-atribuicao.ts`,
`src/lib/config-entrega.ts`, `src/lib/motoboy-finalizacao.ts`, `src/routes/preview/l1-entregas.tsx`.

---

## 4. Mapa com três pedidos agrupados

- Rota `r-ana` (moto **Ana**) agora concentra **3 paradas**: `#1260`, `#1248`, `#1241`.
- Painel de rota exibe: motoboy, status, sequência numerada, clientes, horários prometidos,
  distância total, tempo estimado, alertas de atraso.
- Agrupamento inteligente: sugerência de motoboy disponível há mais tempo; responsável pode
  aceitar, modificar, reordenar, remover parada ou trocar motoboy; nunca libera sem autorização.

---

## 5. Testes

| Teste | Resultado |
|---|---|
| `npm run typecheck` | ✅ sem erros |
| `npm run build` | ✅ client · ssr · nitro |
| `npm run teste:guard` | ✅ 41/41 |
| `npm run teste:producao` | ✅ todos passaram |
| `npm run teste:central` | ✅ todos passaram |
| `node scripts/preview-central-v2.test.mjs` | ✅ K8.1/K8.2 — 19/19 casos passando |
| `git diff --check` | ✅ sem erros |

---

## 6. Pendências de integração

1. **A imagem de referência:** não pôde ser visualizada por limitação técnica deste modelo —
   a aprovação final exige o pareamento manual com a imagem anexada.
2. **Integração real:** rotas/efeitos (E4/E5/RPCs) com flags desligadas permanecem desligadas;
   preview usa apenas mocks/fixtures locais (nada é gravado no Supabase).
3. **Mapa real:** provider Google Maps requer chave; atualmente o mapa é simulado no preview e
   o fallback manual (rota calculada via `rotaGoogleMaps`) está disponível.
4. **Sessão real:** autenticação por papel exige conta admin ativa no backend (fora do escopo
   desta etapa — já registrado no diagnóstico).

---

**Etapa encerrada. Aguardando aprovação visual da Central de Entregas para seguir para o próximo módulo.**
