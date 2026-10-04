# Go-live — Néia Salgados (runbook de produção)

Ordem de execução. Nada aqui roda sozinho: cada passo é manual no Supabase/Vercel.

## 1. Banco — migrações (SQL Editor, NESTA ORDEM, staging primeiro)

Rode cada arquivo em `drizzle/migrations/` na ordem e confira a mensagem de sucesso:

1. `0000_neia_salgados_schema.sql` (base — pule se o banco já foi criado por ele)
2. `0001_neia_tipos_crm.sql`
3. `0002_itens_rls.sql`
4. `0003_operacao.sql` — ⚠️ contém `ALTER TYPE ... ADD VALUE` (papéis `atendente`, `financeiro`).
   Isso **não roda dentro de transação**. Se der erro `cannot run inside a transaction block`,
   rode **só estas 2 linhas sozinhas**, uma por vez, e depois rode o resto do arquivo:
   `ALTER TYPE public.app_role ADD VALUE 'atendente';`
   `ALTER TYPE public.app_role ADD VALUE 'financeiro';`
5. `0004_inteligencia.sql`
6. `0005_hardening.sql` (GRANTs + trigger anti-fraude)
7. `0006_recorrencia.sql`
8. `0007_orcamento_validade.sql`
9. `0008_atendimento.sql`
10. `0009_b2b.sql`
11. `0010_resgate.sql`
12. `0011_papeis.sql`
13. `0012_recorrencia.sql`
14. `0013_cliques.sql`
15. `0014_fidelidade.sql`
16. `0015_hero_carousel.sql` — carrossel do hero (home). Sem linhas, a home cai na imagem estática `hero.jpg`.
17. `0016_calculadora_config.sql` — limites da página `/calculadora` (linha única, `id=true`).
18. `0017_motoboys.sql` — cadastro de motoboys usado na aba Motoboys do admin.
19. `0018_tipo_entrega.sql` — `pedidos.tipo_entrega` (`entrega` | `retirada`).
20. `0019_orcamento_contato.sql` — `calculadora_config.zap_contato` + `orcamento_validade_dias`.
21. `0020_storage_hero.sql` — bucket público `hero` para upload das fotos do carrossel.
22. `0021_loja_config.sql` — tabela `loja_config` (endereço de retirada, telefone, ponto no mapa).
23. `0022_pagamento_status.sql` — `pedidos.pagamento_status` separado.
24. `0023_base_operacional.sql` — histórico, lotes, reservas, horario_config.
25. `0024_entrega.sql` — rotas, atraso motivo, endereço apto/bloco, status motoboy.
26. `0025_impressao.sql` — `fila_impressao` Tanca TP-550.
27. `0026_cozinha.sql` — `fila_fritura` + tempo por produto.
28. `0027_lembretes.sql` — `pedido_lembretes` 7d/3d/24h.
29. `0028_crm_experiencia.sql` — jornada, indicação, degustação pós-orçamento, parceiros, ajuda, alta demanda.
30. `0029_loja_pix.sql` — `loja_config.pix_chave` (sai do hardcoded).
31. `0030_reserva_atomica.sql` — `reservar/liberar_reserva_atomica` (checkout usa via RPC).
32. `0031_reserva_grants.sql` — EXECUTE nas funções de reserva.
33. `0032_entrega_fase3.sql` — `motoboys.user_id`, `pedidos.andar/torre`, avisos p/ motoboy.
34. `0033_fiscal_base.sql` — empresa fiscal, documentos, eventos, NCM/CFOP do produto, CPF/CNPJ e origem no pedido. NENHUM dado tributário preenchido: validar com o contador.
35. `0034_fila_cliente.sql` — cliente enfileira o próprio pedido (impressão automática) e registra nascimento no histórico.
36. `0035_loja_social.sql` — links Instagram/Facebook/site/avaliação Google da loja.
37. `0036_fritura_produto.sql` — `produtos.tempo_fritura_s` (NULL = 210s padrão).
Atalho: `PASSO-11-fases-2-9.sql` = 0023→0028 em um arquivo só (NÃO inclui 0029→0033 — rode esses separado).

Todas idempotentes: podem ser reexecutadas sem efeito colateral. O app degrada sozinho
se alguma faltar (a home usa o hero estático, o checkout avisa que não gravou o tipo de entrega
e o app do motoboy não filtra retirada) — mas grave antes de anunciar essas features.

### Verificação (rode após cada bloco e confira o retorno)

```sql
-- Colunas novas existem?
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='pedidos'
  AND column_name IN ('cidade','agendado_para','tipo_evento','campanha_origem','tipo_entrega');
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='produtos'
  AND column_name IN ('tipo_venda','estoque_minimo','custo');

-- Trigger anti-fraude ativo?
SELECT tgname FROM pg_trigger WHERE tgname='pedidos_guard_update_trg';

-- Papéis do enum presentes?
SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
WHERE t.typname='app_role';

-- Tabelas novas existem?
SELECT tablename FROM pg_tables WHERE schemaname='public'
  AND tablename IN ('crm_customers','crm_campaigns','orcamentos','pedidos_recorrentes',
    'pedido_notas','campanha_cliques','metas','admin_logs','despesas','estoque_mov',
    'hero_carousel','calculadora_config','motoboys');

-- 0015-0018 aplicados?
SELECT count(*) AS hero_ativos FROM hero_carousel WHERE ativo;
SELECT * FROM calculadora_config;               -- deve retornar 1 linha
SELECT count(*) AS motoboys_cadastrados FROM motoboys;
SELECT conname FROM pg_constraint WHERE conname='pedidos_tipo_entrega_check';
SELECT count(*) AS sem_tipo FROM pedidos WHERE tipo_entrega IS NULL;  -- esperado: 0
SELECT zap_contato, orcamento_validade_dias FROM calculadora_config WHERE id;
SELECT id, public FROM storage.buckets WHERE id = 'hero';
```

## 1.1 Rodando as migrations em lote (alternativa ao passo a passo)

Se você aplicou tudo de uma vez e alguma falhou, use os arquivos gerados em
`drizzle/migrations/`:

- `PASSO-4-bootstrap-completo.sql` — `0000`→`0020` em ordem, cada arquivo em sub-transação
  própria: o que falhar aparece como `WARNING` e o resto continua.
- `PASSO-5a-enum.sql` — completa `app_role` (`atendente`, `financeiro`). **Precisa rodar
  sozinho**: `ALTER TYPE ... ADD VALUE` não funciona na mesma transação que cria o enum.
- `PASSO-5b`…`PASSO-5f` — migrations que faltaram, **uma por New query**.
- `PASSO-5z-verificacao.sql` — o que ainda está faltando.
- `PASSO-6-orcamento-e-fotos.sql` — `0019` + `0020` juntas.
- `PASSO-7-verificacao.sql` — confere o banco contra as tabelas/colunas que o app usa.

Os geradores ficam em `scripts/`:

- `gerar-bootstrap.mjs` — `PASSO-4` (todas as migrations em lote)
- `gerar-correcoes.mjs` — `PASSO-5a`..`5f` + `PASSO-5z`
- `gerar-verificacao.mjs` — `PASSO-7`, derivado de `src/integrations/supabase/types.ts`

Depois de mexer no schema, rode `node scripts/gerar-verificacao.mjs` e aplique o `PASSO-7` gerado.

Se `hero_carousel` existir mas estiver vazia, a home continua usando `hero.jpg` — cadastre um
slide na aba **Hero** do admin para o carrossel aparecer.

## 2. Papéis (Dashboard → Authentication → Users)

- Localize seu usuário → `user_roles` (via Table Editor) → adicione `admin`.
- Para a equipe: adicione `atendente`, `producao`, `motoboy`, `financeiro` conforme a função.
- Nunca deixe zero admins. Não remova seu próprio `admin` pelo painel (há trava no código, mas confira).

## 3. Auth e provedores (Dashboard → Authentication)

- **E-mail**: confirme SMTP/remetente para recuperação de senha funcionar.
- **Phone/WhatsApp OTP**: sem provider configurado, o login por WhatsApp mostra fallback para e-mail (comportamento esperado, não é bug).
- Teste: criar conta → login → logout → recuperar senha.

## 4. Variáveis de ambiente (Vercel/host)

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (somente publishable — **nunca** secret/service key no frontend).
- Google Maps: restrinja a chave por HTTP referrer do domínio.
- O `.env` local está ignorado no git; as chaves antigas já estão no histórico — considere rotacionar a chave do Maps.

## 5. Edge Function do resgate (opcional, recomendado)

```bash
supabase functions deploy resgatar-fidelidade
```

Depois do deploy, troque o fluxo client-side da conta para chamar a função.
Sem deploy, o fluxo atual (limitado pela policy `0010`) continua valendo.

## 6. Smoke test obrigatório (com o banco migrado)

1. Cardápio → combo 50/100 (ok) → tentativa 49/51 no carrinho (bloqueia).
2. Checkout R$40 + R$6 = **R$46**; confirma; confere admin + WhatsApp com o mesmo total.
3. Admin muda status → WhatsApp abre; motoboy aceita/inicia/entrega.
4. Cliente cancela pedido `recebido` (ok); tentativa de editar total via API deve falhar (trigger).
5. CRM: cliente aparece, dias/segmento corretos; campanha exclui opt-out.
6. Celular Android + iPhone: pedido completo sem rolagem horizontal.

## 7. Backup

- Ative PITR/backups diários no Supabase (Database → Backups).
- Exports CSV disponíveis no painel: Pedidos, Produtos, Clientes.

## 8. Rollback

- Código: `git` (este trabalho está sem commit — commite antes do deploy).
- Banco: as migrações são aditivas (`IF NOT EXISTS`, `DROP+CREATE` de policies/trigger).
  Para reverter o trigger anti-fraude: `DROP TRIGGER pedidos_guard_update_trg ON public.pedidos;`
- Se algo quebrar após migração, o app tem fallbacks que avisam via toast (funciona sem as colunas novas).
