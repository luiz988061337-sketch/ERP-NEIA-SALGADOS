# Néia Salgados — Prompt de Atualização Completa (v2)

> **Como usar:** cole este prompt em uma nova sessão quando for implementar. Não implemente agora — este arquivo é só a especificação atualizada e ancorada no código real.
> Projeto: TanStack Start + React 19 + Supabase. Repo: `pixel-perfect-render-4410`. Não recriar do zero. Mudanças incrementais, branch `main` sempre funcionando (sincroniza com Lovable — sem force-push/rebase).

## 0. Contexto real do projeto (não inventar)

Stack: TanStack Start (file-routes em `src/routes`), Tailwind 4 + shadcn, Supabase (Auth + Postgres + RLS + Realtime + Storage), Vite, Nitro.

Rotas existentes:
- `/` cardápio (`src/routes/index.tsx`) — busca, filtro categoria, `ProductCard`, barra fixa de carrinho só na home
- `/combo` (`src/routes/combo.tsx` + `src/lib/combo.ts`) — já valida múltiplos de 50 (`PASSO_COMBO=50`, `MINIMO_COMBO=50`)
- `/carrinho` (`src/routes/carrinho.tsx`), `/checkout` (`src/routes/checkout.tsx` com BR Code PIX real gerado em `src/lib/pix.ts`; chave atual em `PIX_CHAVE`)
- `/pedido/$id` rastreio realtime + mapa, `/conta`, `/auth` (email/senha + OTP WhatsApp com fallback), `/producao`, `/motoboy`, `/admin` (~31KB)
- Libs: `src/lib/cart.tsx` (localStorage `neia-carrinho`, sem validação backend), `src/lib/format.ts` (`TAXA_ENTREGA=6`, `mensagemStatus`, `whatsappLink`), `src/lib/session.ts` (roles `admin|producao|motoboy|cliente`, `useStaffOnly`), `src/lib/catalog.ts`, `src/components/product-card.tsx`, `site-header.tsx`, `map-view.tsx`, `status-steps.tsx`
- BD atual (`drizzle/migrations/0000_neia_salgados_schema.sql`): `profiles`, `user_roles (+trigger handle_new_user → role cliente)`, `enderecos (rua,numero,bairro,complemento,referencia)`, `categorias`, `produtos (sem tipo_venda/destaque/promo-datas/cidade)`, `cupons`, `pedidos (numero seq a partir de 1001, status order_status, producao_status, taxa_entrega, desconto, total)`, `pedido_itens`, `avaliacoes`, `favoritos`. Realtime só em `pedidos`.
- Status atual: `recebido → em_producao → pronto → aguardando_motoboy → em_rota → entregue | cancelado`. Produção: `aguardando → produzindo → finalizado`.
- `.env` Lovable Cloud já configurado. Seed: `supabase/seed-demo.sql`.

Regra de ouro: preserve Auth, RLS, Realtime, WhatsApp `wa.me`, impressão via `window.print()`, fidelidade (1pt/R$5). Reutilize tabelas. Não duplique cliente. Não exponha secrets no frontend. Não altere credenciais/integrações sem necessidade.

## 1. Regra principal do negócio

### 1.1 Combos = múltiplos de 50
- Permitir 50, 100, 150, 200… Bloquear 1, 10, 30, 49, 60, 70 etc. para itens de combo.
- Cliente mistura sabores dentro do mesmo combo (ex.: 20 coxinhas + 10 risoles + 10 kibes + 10 bolinhos = 50).
- Estado atual: `/combo` já bloqueia incompleto, mas `COMBO_CATEGORIAS` em `src/lib/combo.ts:11-18` ainda inclui `mini-congelados` — corrigir.
- Cardápio (`/`) vende pacotes prontos (25un, 20un, 15un) — manter como estão; a regra de 50 vale para o montador `/combo` e para produtos com `tipo_venda=combo_50`.

### 1.2 Congelados = unidade
- Congelados vendem 1, 2, 3… sem obrigar 50.
- Criar campo configurável em `produtos`: `tipo_venda = 'combo_50' | 'unidade'` (default conforme categoria atual; migração deve classificar `mini-congelados` + `bebidas` + `kits-para-festa` como `unidade`, demais minis como `combo_50` — confirmar com dono antes de migrar).
- Exibir tipo no card e no admin. Não aplicar regra de 50 a `unidade`.

## 2. Cardápio (`src/routes/index.tsx` + `product-card.tsx`)
- Card: foto (`imagemProduto` com fallback), nome, descrição curta, preço (com riscado se `preco_promocional`), tipo (`Combo 50` / `Unidade`), botão “Adicionar ao pedido” grande e evidente.
- Após adicionar: toast + badge do carrinho atualiza na hora + desabilitar duplo-clique (debounce) para não duplicar.
- Se produto tiver opções futuras: selecionar antes de adicionar (preparar `CartItem` para `opcoes?`, sem quebrar o atual).
- Manter busca, filtro categoria, favoritos, notas. Adicionar seções: `🔥 Ofertas da semana` (só promo ativa), `⭐ Destaques` / `🔥 Mais pedidos` (flag `destaque` editável no admin).

## 3. Carrinho (`src/lib/cart.tsx` + `src/routes/carrinho.tsx`)
- Operações: + / − / remover / limpar, lista com foto, nome, qtd, preço unitário, subtotal por linha, campo observações (por item e geral).
- Totais sempre visíveis: `Produtos: R$ XX,XX / Entrega: R$ XX,XX / Total: R$ XX,XX`. `total = subtotal + taxa_entrega` (taxa 1x).
- Cálculo em helper único `src/lib/totals.ts` usado em carrinho + checkout + WhatsApp + admin.
- Backend: revalidar preços/qtd no checkout (buscar `produtos` por id, ignorar preço do frontend). Nunca confiar em valor do navegador. Registrar no `pedidos` os valores validados.

## 4. Validação de quantidades
- `combo_50`: só múltiplos de 50. Mensagem: “Os combos são vendidos em múltiplos de 50 unidades.”
- `unidade`: qualquer qtd ≥1.
- Bloquear no `/combo`, no `setQuantidade` do carrinho e no `finalizar()` do checkout (server-side via Supabase ou validação antes do insert + mensagem amigável). Ex.: 40un → “Seu combo precisa ter 50 unidades. Adicione mais 10 unidades.”

## 5. Monte seu Combo (`/combo`)
- Cabeçalho: “Monte seu combo — Escolha seus sabores e monte seu pedido em múltiplos de 50 unidades.”
- Contador visível: `Quantidade selecionada: X / 50` (depois 100/100, 150/150…). Estado `✓ Combo completo` quando válido.
- Barra de progresso por ciclo de 50. Botão “Adicionar combo” desabilitado se incompleto.
- Um combo = 1 linha no carrinho (`produtoId: null`, nome com composição `Combo Mini Fritos 50un (20x Coxinha, …)`, `preco = total * precoUnit`). Permitir trocar categoria sem perder contexto? Resetar qtds ao trocar (comportamento atual — manter).
- Remover `mini-congelados` do `COMBO_CATEGORIAS` (vai para venda por unidade).

## 6. Carrinho fixo no mobile
- Barra inferior fixa em TODAS as rotas de loja (`__root` ou `site-header`) quando `totalItens>0`: `🛒 N itens — R$ XX,XX | VER PEDIDO` → `/carrinho`. Hoje só existe na home — extrair para componente `CartDock`.
- Sem rolagem horizontal, botão ≥48px, `z-40`, respeitar safe-area.

## 7. Checkout (`src/routes/checkout.tsx`)
- Fluxo em passos visíveis: Carrinho → Dados → Endereço → Entrega → Pagamento → Confirmar (pode ser seções expansíveis numa página, não precisa wizard complexo).
- Campos: nome, telefone/WhatsApp (validar DDD, normalizar só dígitos p/ CRM), endereço (rua), número, complemento, bairro, **cidade (NOVO — hoje não existe em `pedidos`; adicionar coluna)**, referência, forma de pagamento, observações, troco-para (se dinheiro).
- Reaproveitar `enderecos` salvos. Guest checkout se possível: permitir finalizar sem conta (user_id null) MAS manter botão “criar conta para ver Meus pedidos”; se exigir login hoje, manter redirect `/auth?redirect=/checkout` como fallback e documentar decisão.
- Validar com zod (estender `schema` atual). Telefone obrigatório.

## 8. Entrega
- Exibir `Subtotal / Taxa R$ 6,00 / Total` (taxa de `TAXA_ENTREGA`, depois mover para config admin).
- Taxa 1x por pedido. Revalidar no backend. `taxa_motoboy` separada (repasse) — não somar 2x.

## 9. Pagamento
- Manter `pix | dinheiro | credito | debito` (`PAGAMENTO_LABEL`). Mostrar escolhida antes de confirmar.
- PIX: manter QR atual, mas marcar como provisório; documentar pendência BR-Code EMV real (backend). Chave via env/config, não hardcode novo.
- Dinheiro: campo troco. Crédito/débito: “pagamento na entrega”.

## 10. Resumo antes de finalizar
- Blocos: Seu pedido (produto/qtd/preço) | Entrega (endereço completo + cidade) | Pagamento | Valores + cupom/desconto + pontos que vai ganhar. Botão `CONFIRMAR PEDIDO` único, com `enviando` anti-duplo-clique.

## 11. Confirmação
- Usar `numero` (seq 1001+) como `Pedido #XXXX`. Tela: `🎉 Pedido recebido com sucesso!` + número, cliente, valor, pagamento, endereço, previsão 40–60min, itens. Botões: Acompanhar pedido (`/pedido/$id`) + `📱 Acompanhar pelo WhatsApp` (link `mensagemStatus('recebido',…)`). Não quebrar realtime/impressão.

## 12. WhatsApp
- Template exato (mesmos valores do banco):
```
Novo pedido #1025
Cliente: Nome / Telefone: …
Produtos:
* 50x … — R$ …
Produtos: R$ … / Entrega: R$ … / Total: R$ …
Pagamento: PIX
Endereço: rua, número, bairro, cidade, complemento, referência
Observações: …
```
- Usar `whatsappLink` + `mensagemStatus` existentes. Valor = `pedidos.total` salvo.

## 13. Admin — Pedidos (`src/routes/admin.tsx`)
- Tabela com número, data/hora (`dataHora`), cliente, telefone (link wa.me), itens (expansível), subtotal/taxa/total, pagamento, endereço completo, obs, status.
- Mapear status exibido para linguagem do dono SEM quebrar enum: `recebido=Novo, em_producao=Em produção (+Confirmado como etapa intermediária? decidir: usar `recebido= Novo`, transição para `em_producao` = Confirmado+Em produção, ou adicionar coluna `confirmado_em` — preferir mapear, não migrar enum sem necessidade)`, `pronto=Pronto, aguardando_motoboy/em_rota=Saiu para entrega (distinguir), entregue, cancelado`.
- Ações: avançar/voltar status, cancelar, imprimir, abrir WhatsApp cliente, ver timeline. Filtros por status/busca/data. Realtime.

## 14. Dashboard (dentro de `/admin`)
- Só dados reais via Supabase: pedidos hoje, faturamento hoje, pendentes (`recebido`), em produção, para entrega (`pronto+aguardando_motoboy+em_rota`), semanal/mensal (gráfico simples + `recharts` já instalado). Mais: clientes totais/ativos/risco/inativos/muito inativos/recuperados, pedidos vindos de campanhas, valor gerado por campanhas (quando CRM existir). Sem mock.

## 15. Produtos (admin)
- CRUD: nome, descrição, imagem (Storage ou URL + fallback), preço, `preco_promocional` + `promo_inicio/promo_fim/ativo` (NOVO), categoria, `disponivel`, `tipo_venda (combo_50|unidade)`, `destaque (bool)`, `estoque`.
- RLS já: leitura pública, escrita só `admin` — manter e testar.

## 16–17. Destaques e Promoções
- `destaque` → seção `⭐ Destaques`. `preco_promocional` + datas → `🔥 Ofertas da semana` (só se `disponivel && promo_ativa(hoje entre inicio/fim)`). Migração SQL + UI admin com toggle. Preço final = `precoFinal()` (já existe) — reutilizar em carrinho/checkout/backend.

## 18–19. Conteúdo (home)
- Seção “Como funciona” (3 passos) + faixa confiança: `🚚 40–60min • 📦 Festas e eventos • 🔢 Combos a partir de 50un • 🧊 Congelados por unidade • 💳 PIX e pagamento na entrega`. Não inventar prazos/taxas novos — usar `TAXA_ENTREGA` e textos atuais.

## 20. Responsividade
- Mobile-first: botões ≥44px, inputs 16px (evitar zoom iOS), checkout sem corte, carrinho acessível, sem overflow-x (`no-scrollbar` já usado — replicar). Testar 360px, 390px, 768px, 1280px.

## 21–22. Auth e Meus pedidos
- Preservar Supabase Auth + `handle_new_user` + `user_roles`. Cliente: criar conta, entrar, recuperar senha, ver `/conta` + Meus pedidos (número/data/valor/status/itens). Não forçar cadastro desnecessário (guest quando viável). Staff (`producao/motoboy`) continua restrito ao painel (`useStaffOnly`).

## 23. Segurança
- Cliente nunca acessa `/admin`, nunca altera preço, nunca vê pedido alheio (RLS `pedidos select` já faz — auditar, principalmente `pedido_itens select` atual que só checa existência do pedido — endurecer para checar ownership/papel).
- Só `admin` altera produtos/config. Sem secrets no frontend (`VITE_*` só publicáveis). Revisar policies de `categorias/produtos/cupons` (escrita admin ok).

## 24. Cálculo único
- `src/lib/totals.ts`: `calcTotals({items, taxa, desconto}) → {subtotal, desconto, taxa, total}`. Usar em carrinho, checkout, confirmação, WhatsApp, admin. Teste: 40+6=46, cupom nunca zera taxa duplicada.

## 25–43. CRM (novo módulo, só após pedidos estáveis)
- **Princípio:** reutilizar `pedidos.telefone` normalizado (só dígitos) + `profiles/user_id` quando houver login. Não criar base paralela se der para derivar. Se criar tabelas, prefixo `crm_`:
  - `crm_customers (telefone_norm PK, nome, email, user_id?, endereco_recente, cidade, bairro, opt_out bool default false, notas, created_at, updated_at)`
  - `crm_settings (ativo_ate_dias default 14, risco_apos_dias default 21, inativo_apos_dias default 30, muito_inativo_apos_dias default 60, intervalo_min_campanhas_dias default 7, campanhas_habilitadas bool, mensagem_padrao text)`
  - `crm_campaigns (id, nome, segmento, filtros jsonb, mensagem_template, link_rastreavel ex. /?campanha=reativacao30, status, created_by, created_at)`
  - `crm_recipients (campaign_id, telefone_norm, nome_snapshot, variaveis jsonb, status: apto|excluido_optout|excluido_recente|enviado|falhou, motivo, sent_at)`
  - `crm_events (id, telefone_norm, tipo: pedido|campanha_enviada|clique|optout, pedido_id?, campaign_id?, created_at, meta jsonb)`
  - View `crm_customer_stats`: por `telefone_norm`: primeiro/último pedido (só status válidos, excluir `cancelado`), dias_sem_comprar, total_pedidos, total_gasto, ticket_medio, produtos_top, último_valor, bairro/cidade recentes, status (ativo/risco/inativo/muito_inativo via `crm_settings`).
- **Classificação configurável** (não hardcode): Ativo até X dias / Risco após X / Inativo após X (sugestão 30) / Muito inativo após X (sugestão 60/90). Tela `Configurações → CRM`.
- **Filtros:** todos/ativos/risco/inativos/muito inativos/sem pedido 7+/15+/30+/60+/90+, por qtd pedidos, valor gasto, último pedido, bairro, período, “comprou 1x e nunca voltou”.
- **Busca:** nome/telefone/email (rápida, índice em `telefone_norm`).
- **Seleção:** 1/vários/todos do filtro, com preview: “23 selecionados → 3 opt-out excluídos → 5 com campanha <7d → 15 aptos → [Continuar]”.
- **Campanhas:** `/admin` aba `👥 Clientes` + `📣 Campanhas`. Criar por filtro + mensagem com variáveis `{{cliente}} {{dias_sem_comprar}} {{ultimo_pedido}} {{ultimo_valor}} {{total_pedidos}} {{total_gasto}} {{link_cardapio}}`. Prévia com exemplo real. Segmentos: inativo (reativação), VIP, frequente (fidelização), novo (pós-primeira compra). Nada enviado sem confirmação do admin.
- **Envio WhatsApp:** usar `whatsappLink` existente (abrir conversa 1-a-1 ou lista de links). Sem API automática configurada → NÃO inventar disparo em massa; gerar fila de `Abrir WhatsApp` por cliente + registrar `enviado`. Sem tokens no código. Respeitar `opt_out` + intervalo mínimo (ex.: 7d) + flag `📵 Não enviar campanhas` no perfil.
- **Histórico:** por campanha (nome/data/segmento/qtd/enviados/falhas/status/mensagem) + timeline por cliente (`Pedido #… → Campanha enviada → Pedido #…`). Atribuição a campanha só com evidência (clique com `?campanha=` + pedido posterior do mesmo telefone em janela configurável — exibir como “provável”, nunca afirmar sem dado).
- **Indicadores:** no dashboard (se calculável): totais por segmento, recuperados (voltou a comprar após campanha em X dias), pedidos/valor vindos de campanhas.
- **Alertas:** `⚠️ N clientes há 30+d sem comprar [Ver clientes]` + `🔥 M frequentes inativos [Criar campanha]` com dados reais.
- **RLS:** só `admin` lê/escreve CRM. Cliente nunca vê outro cliente. Telefones/endereços nunca públicos.

## 44. Testes do CRM (sem contaminar prod)
- Usar seed separado ou staging. Casos: recente=ativo; 30d=inativo; 60d=muito inativo; vários pedidos=soma correta; cancelado não move última compra; opt-out excluído; variáveis renderizam; wa.me abre número certo.

## 45. BD — ordem
1. Auditar schema atual. 2. Migrações pequenas: `produtos.tipo_venda + destaque + promo_*`, `pedidos.cidade`, depois `crm_*`. 3. Índices em `telefone_norm`, `created_at`, `status`. 4. Normalizar telefone na escrita (trigger ou helper). Sem duplicar cliente.

## 46–47. Segurança/Privacidade CRM
- RLS estrito admin-only. Dados PII só no admin. Sem log desnecessário. Opt-out respeitado inclusive em filtros.

## 48. Matriz de testes (executar no fim)
Pedidos: 50/100/49-bloqueia/congelado-1un/add-remove/taxa-1x/PIX/na-entrega/finaliza. Admin: aparece/atualiza status/dashboard/produto/promo. CRM: aparece/última-compra/dias/segmento/filtros/multisseleção/campanha/variáveis/opt-out/histórico/métricas. Segurança: cliente↛admin, cliente↛outro pedido, preço imutável, RLS. Mobile: pedido completo 360px, CRM no desktop, sem scroll-x.

## 49. Não quebrar
Checklist pré-mudança: rotas, componentes, tabelas, Auth, Supabase functions, painel, WhatsApp. Depois: reaproveitar código, sem duplicar função, sem trocar banco, sem remover feature, sem mexer em credencial.

## 50. Aceitação (fluxo ponta a ponta)
Entra → escolhe → monta 50/100/150 → add congelado avulso → confere carrinho → endereço+cidade → taxa 1x → pagamento → confirma → salva (`pedidos`+`itens` validados) → aparece no admin → WhatsApp com mesmo total → status avança → cliente acompanha → histórico registra → CRM classifica (dias/class/opt-out) → admin filtra/cria campanha → mensagem personalizada → abre WhatsApp → registra contato → recompra atribuída se houver evidência → dashboard mostra.

## 51. Relatório final obrigatório (quando implementar)
Entregar nestas seções: ALTERADO / CORRIGIDO / PEDIDOS / CRM / CAMPANHAS / WHATSAPP (integrado vs pendente de config) / SEGURANÇA (RLS verificadas) / BANCO (migrações) / TESTES (casos + resultados) / PENDÊNCIAS (o que depende do dono: chave PIX real, provider WhatsApp, cidade/taxa, confirmação de categorias `unidade`) / ARQUIVOS ALTERADOS. Revisar por último: cálculo, taxa duplicada, regra 50, congelado avulso, permissões, cliente duplicado, dias-sem-comprar, opt-out, disparo duplo, responsivo, checkout.

## Apêndice — o que já funciona (não mexer sem motivo)
Combo múltiplos de 50, carrinho localStorage, checkout com cupom/fidelidade/geocode, rastreio realtime, `useStaffOnly`, impressão `window.print()`, templates WhatsApp, seed de cardápio/cupons. Build `npm run build` passa em ~3s; lint tem 9k erros de CRLF (prettier) — rodar `npx prettier --write .` em commit separado antes de feature.
