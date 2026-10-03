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

### Verificação (rode após cada bloco e confira o retorno)

```sql
-- Colunas novas existem?
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='pedidos'
  AND column_name IN ('cidade','agendado_para','tipo_evento','campanha_origem');
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
    'pedido_notas','campanha_cliques','metas','admin_logs','despesas','estoque_mov');
```

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
