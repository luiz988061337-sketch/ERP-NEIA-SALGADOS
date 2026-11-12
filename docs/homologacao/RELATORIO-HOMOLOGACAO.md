# RELATÓRIO DE HOMOLOGAÇÃO — FINALIZAÇÃO DO ERP NÉIA SALGADOS

**Data:** 12/11/2026 · **Branch:** `homologacao-finalizacao` (local, isolada de `main`)
**Base:** `main @ 366074f` · **Tag de recuperação:** `ponto-recuperacao-366074f` (local)
**Commits da branch:** `de71b10` (FASES 1+2) · `d5a6b77` (FASE 3) · `26b6f59` (FASES 5+6) · `c7a57f4` (rodapé + capturas)
**Nada foi enviado (`push`) para o remoto. Nada foi promovido a produção.**

---

## URL de Preview para homologação

```
https://erp-neia-salgados-iffmtj65f-luiz988061337-3147s-projects.vercel.app
```

- Deploy de **Preview** (não-promocional): `vercel deploy` **sem** `--prod`; o ambiente Production da Vercel permanece no deploy `q9gvt9i8m` (criado 07:37 de 12/11/2026, ~56 min antes — intocado, confirmado via `vercel ls`).
- **Proteção de acesso ativa** (`vercel_authentication`): visitantes sem login na conta Vercel do dono recebem redirect para o login da Vercel (verificado: HTTP 200 → `vercel.com/login?next=...`). Ou seja, a URL não é pública — só o dono (logado) consegue abrir.
- A build do preview é o mesmo código da branch; as capturas de tela do relatório foram feitas no build local idêntico (`wrangler dev`), pois o preview exige login Vercel para renderizar.

---

## A — Identidade visual (FASE 1)

**Tela clara em todo o painel** — sem telas admin escuras:

| Elemento | Cor |
|---|---|
| Fundo do painel | `#F8F9FA` |
| Cards | `#FFFFFF` |
| Dourado (destaque) | `#C49A43` |
| Dourado claro | `#F5EBD2` |
| Texto principal | `#202B3A` |
| Texto secundário | `#64748B` |
| Bordas | `#E5E7EB` |
| Verde (sucesso) | `#21835D` |
| Azul (ação) | `#2563EB` |
| Laranja (atenção) | `#F59E0B` |
| Vermelho (crítico) | `#DC2626` |

- Bloco único `html.erp-admin` em `src/styles.css` (~linha 272) + `ERP_COLORS` em `src/components/admin/erp-ui.tsx` (dourado `#C49A43`, dourado forte `#A9813A`, dourado claro `#F5EBD2`); as classes antigas `.erp-dark` foram renomeadas para `.erp-admin` e o dourado "brilhante" antigo foi removido.
- **Estrutura preservada:** kanbans, métricas, tabelas e gráficos continuam nos mesmos lugares — apenas a pele mudou.
- Evidência: capturas reais em `docs/homologacao/prints/` (loja e `/auth`, desktop 1280×800 e celular 390×844).

## B — Navegação e simplificação (FASE 2)

- Sidebar **sem foto e sem frase** de apresentação.
- **Atendimento removido do menu** — o código da tela (`/atendente`) permanece preservado e acessível por rota.
- Loja pública: botão discreto **"Área Administrativa"** no rodapé → `/auth`.
  - Correções adicionais nesta fase (commit `c7a57f4`): removidos textos de debug "BUILD FIX 2026-11-11" do rodapé público e unificado um único ponto de entrada no rodapé raiz (rodapé duplicado em `index.tsx` eliminado).

## C — Endereço e frete (FASE 3)

- **Causa raiz do autocomplete sem sugestões corrigida:** o carregador do Google Maps não pedia `libraries=places`. Agora o carregador (`src/components/map-view.tsx`) inclui a biblioteca com retry, cada interação cria uma sessão de Places (economia de quota) e o autocomplete distingue honestamente **erro** (`null`) de **"nenhum resultado"** (`[]`).
- Mapa + GPS funcionam no fluxo de entrega; **fallback manual honesto** quando o Maps falha (o cliente digitou o endereço livremente e é avisado).
- **Taxa NÃO alterada:** R$ 1,50/km mantida exatamente como estava.

## D — Fluxo do cliente (preservado)

- Checkout, carrinho, sessão anônima na primeira visita, PIX/pagamento na entrega: **nenhuma mudança de comportamento** (diff da branch não toca lógica de checkout).
- Autenticação (`/auth`), RLS e RPCs intactos. Impressão preservada.
- Combos: mínimo de 50 unidades e múltiplos de 50 mantidos.

## E — Comercial e WhatsApp (FASES 4–6)

- **Campanhas com filtros 30/60/90 dias** (presets de recência) na tela `/campanhas` (commit `26b6f59`).
- **Rascunho + aprovação explícita:** campanha nasce `rascunho`; só vira `pronta` (enviável) com ação deliberada do usuário. Nada sai automático.
- **Opt-out respeitado** na seleção de destinatários.
- **WhatsApp: transacional ≠ promocional**, com camadas separadas em `src/lib/notificacoes.ts` e auditoria idempotente de envios.
- **Modo simulado por padrão:** nenhum envio real acontece sem credenciais e sem autorização explícita do dono.
- **Migration `0104_notificacoes_whatsapp.sql` preparada mas NÃO aplicada** (nem local, nem produção). Plano de ativação, custos (~R$ 200/mês) e bloqueios documentados em `docs/whatsapp-ativacao.md`.

## F — Produção, Entregas, Estoque e Financeiro (FASES 7–9)

Revisão por inspeção, **sem alteração de regras de negócio**:

- **Produção:** motor de produção (FEFO), reservas e lotes intocados.
- **Entregas:** central de entregas, atribuição de motoboys e cálculo de rota sem mudanças de lógica (apenas correções da paleta clara).
- **Estoque:** insumos, movimentações e baixa automática preservados.
- **Financeiro:** caixa, DRE, OFX e precificação sem mudança de regra.

## G — Fechamento técnico (FASES 10–11)

| Verificação | Resultado |
|---|---|
| `npm run typecheck` (tsc) | ✅ OK |
| `npm run build` (client + SSR + Nitro Cloudflare) | ✅ OK |
| Suítes de teste (fases 134 testes, pix, insumos, ofx, precificacao, criacao 203, wrapper, integracao) | ✅ OK |
| `git diff --check` (working tree e vs. `main`) | ✅ Limpo |
| Varredura de segredos no diff (sk-, AKIA, JWT, service_role, chaves privadas, conexões com senha) | ✅ Nada encontrado |
| Banco de produção | ✅ Nenhuma migration aplicada; nenhuma escrita de teste |
| Production (Vercel) | ✅ Intacta em `q9gvt9i8m`; preview separado |

---

## Pendências e riscos (decisão do dono)

1. **Capturas do painel interno autenticado (Dashboard/PDV/Produção):** exigem login real. Sem credenciais de teste disponíveis e **proibido criar usuário no Supabase de produção** — os 4 prints anexados cobrem loja e `/auth`; os do painel ficam pendentes de credenciais de homologação.
2. **`.env` rastreado no git** (condição pré-existente, já em `main`). Contém **apenas chaves públicas** (publishable/anon do Supabase, VAPID pública e chave de navegador do Maps, visível por design no bundle). Risco baixo, mas recomendado dessensibilizar em uma eventual limpeza futura.
3. **Migration `0104` e credenciais WhatsApp/Cloud API:** aguardam decisão do dono (ver `docs/whatsapp-ativacao.md`). O app funciona normalmente sem elas (auditoria de notificação falha de forma idempotente/silenciosa).
4. **Rotas `/preview/*`** (protótipos com dados fictícios) ainda usam classes escuras — não fazem parte do fluxo do ERP; migração de paleta pendente se quiserem mantê-las.
5. **Preview usa o mesmo backend do app oficial** (chaves públicas do `.env`, projeto `ruioyioynwwwiqbjznoa`). Isolamento = URL protegida por login Vercel + branch local não-publicada; **não há banco separado**. Homologar preferencialmente em operações de leitura/consulta.

## Como homologar

1. Logar na conta Vercel do dono e abrir a URL de preview acima.
2. Conferir as seções A–F contra as capturas em `docs/homologacao/prints/`.
3. Se aprovado, os próximos passos são: aplicar a migration `0104` (quando autorizado) e promover a branch — **só com ordem explícita do dono**.
