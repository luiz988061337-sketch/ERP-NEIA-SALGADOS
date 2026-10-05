# Néia Salgados — Delivery completo

Plataforma estilo iFood para venda de salgados, congelados, kits para festa e bebidas.
Mobile-first, cores vermelha/amarela/branca, PT-BR.

## Stack (equivalente moderno ao pedido Next+Express)

| Camada | Tecnologia atual | Por quê |
|---|---|---|
| Frontend+Backend (fullstack) | TanStack Start (React 19 + TypeScript + SSR) + Vite | equivale ao Next.js, com file-based routing em `src/routes` |
| Estilo | Tailwind CSS 4 + shadcn/ui + Lucide | mobile-first, responsivo |
| Banco | PostgreSQL via Supabase (RLS + Realtime) | relacional, igual ao pedido |
| Auth | Supabase Auth (e-mail/senha + OTP WhatsApp + recovery) + JWT | equivale ao JWT pedido |
| Storage | Supabase Storage (imagens via URL; fallback local em `src/assets`) | equivale ao pedido |
| Mapas | Google Maps JS (geocode, marcadores, rota/navegação) | integração pedida |
| Pagamento | PIX BR-Code EMV real (gerado local, `src/lib/pix.ts`) + QR por valor; chave em `/admin` → Loja | integração pedida |
| Notificações | WhatsApp deep-link `wa.me` com templates por status | integração pedida |
| Impressão | Fila `fila_impressao` + agente Windows (`print-agent/`) na Tanca TP-550; `window.print()` só como fallback | impressão pedida |
| Fiscal | NF-e/NFC-e via Edge Function `fiscal-emitir` + provedor (Focus/Nuvem Fiscal); NCM/CFOP por produto com o contador | emissão fiscal |

> Não foi feito rewrite para Next/Express: o projeto já estava em TanStack Start + Supabase,
> que entrega o mesmo resultado com menos infra. A estrutura abaixo cobre 100% dos módulos pedidos.

## Estrutura

```
src/routes/
  index.tsx       → cardápio digital (busca, categorias, favoritos, notas)
  combo.tsx       → monte seu combo (mistura sabores, múltiplos de 50 por categoria)
  carrinho.tsx    → carrinho (qtd, remover, taxa, total, cupom no checkout)
  checkout.tsx    → endereço, pagamento (PIX QR/dinheiro/crédito/débito), cupom, fidelidade
  pedido.$id.tsx  → rastreamento realtime + mapa motoboy
  conta.tsx       → pedidos, favoritos, fidelidade, endereços, avaliações
  auth.tsx        → login, cadastro, recovery, login WhatsApp OTP
  producao.tsx    → fila (nº, cliente, hora, itens, obs), aguardando/produzindo/finalizado
  motoboy.tsx     → disponíveis/andamento/histórico, aceitar/iniciar/finalizar, rota, tracking, ganhos dia/semana/mês
  admin.tsx       → dashboard, pedidos, produtos, categorias, clientes, motoboys/ranking, cupons, avaliações

src/lib/  cart.tsx, catalog.ts, format.ts (status, mensagens WhatsApp), session.ts
src/components/  product-card, status-steps, map-view, site-header, ui/*
drizzle/migrations/0000_neia_salgados_schema.sql  → schema relacional + RLS + seed cardápio
supabase/seed-demo.sql  → cupons extras + roteiro de usuários demo
```

## Entidades (PostgreSQL)

`profiles, user_roles, enderecos, categorias, produtos, cupons, pedidos, pedido_itens, avaliacoes, favoritos`
Ver DDL completo em `drizzle/migrations/0000_neia_salgados_schema.sql`.
Status do pedido: `recebido → em_producao → pronto → aguardando_motoboy → em_rota → entregue | cancelado`.
Produção: `aguardando → produzindo → finalizado`.

## Fluxo de status + WhatsApp automático

| Evento | Mensagem |
|---|---|
| Recebido | “Olá {{cliente}}, seu pedido nº {{numero}} foi recebido com sucesso.” |
| Em produção | “…está em produção.” |
| Pronto | “…foi finalizado e aguarda coleta.” |
| A caminho | “…o motoboy já saiu para entrega…” |
| Entregue | “…foi entregue. Obrigado pela preferência.” |
| Nova entrega (motoboy) | “Nova entrega disponível. Pedido nº {{numero}}. Taxa: R$ {{taxa}}.” |
| Aceita | “Você aceitou o pedido nº {{numero}}.” |

Implementado em `src/lib/format.ts` (`mensagemStatus`, `whatsappLink`) e disparado em checkout/produção/motoboy/admin.

## Papéis e acesso

- `cliente` (default via trigger `handle_new_user`), `producao`, `motoboy`, `admin` em `user_roles`.
- Header libera rotas por papel; cada painel valida e bloqueia sem papel.
- Para tornar um usuário admin/motoboy/produção, ver `supabase/seed-demo.sql`.

## Fidelidade

- 1 ponto a cada R$ 5 (`Math.floor(total/5)`), creditado no checkout em `profiles.pontos`.
- Meta 200 pts = cupom R$ 20 (operacional; resgate via cupom criado no admin).
- Barra de progresso em `/conta`.

## Como rodar

```sh
npm i
npm run dev
```

Env (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY`) já está em `.env` para o projeto Lovable Cloud. Para outro Supabase, rode a migration `0000` + `seed-demo.sql`.

## Deploy

- **Lovable Cloud / qualquer host Node**: `npm run build` → `npm run preview` (Nitro). Commits na branch conectada sincronizam com o editor Lovable.
- **Vercel/Netlify/Fly**: configure as 3 envs acima; build `npm run build`.
- **Banco**: Supabase → SQL Editor → rode `0000_neia_salgados_schema.sql` (se projeto novo) e `seed-demo.sql`.
- **Realtime**: já habilitado para `pedidos` (`ALTER PUBLICATION ... ADD TABLE`).
- **WhatsApp OTP**: Auth → Providers → Phone → ativar + canal WhatsApp (Twilio/Vonage) para o login por WhatsApp funcionar de ponta a ponta; sem isso, use e-mail (fallback já tratado com toast).
- **Impressão automática**: pedidos entram em `fila_impressao` (migration `0025`); o `print-agent/` no notebook da loja imprime na Tanca TP-550 via USB. `window.print()` é só fallback.
- **PIX**: BR-Code EMV real gerado no navegador (`src/lib/pix.ts`, sem serviço externo); chave Pix em `/admin` → Loja (tabela `loja_config`).
- **Fiscal**: `supabase functions deploy fiscal-emitir` + secrets `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`; configurar empresa + provedor em `/fiscal` e NCM/CFOP dos produtos com o contador antes de emitir (migrations `0033`+`0046`).

## Testes manuais sugeridos

1. Cliente faz pedido → aparece em `/producao` em realtime → avança até “Chamar motoboy”.
2. Motoboy aceita em `/motoboy` → “Iniciar” compartilha GPS → cliente vê mapa em `/pedido/:id`.
3. Motoboy finaliza → cliente recebe WhatsApp, pontos creditados, admin vê faturamento e ranking.
