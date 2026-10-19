# E10-S2A — Matriz RLS: criação, testes e limpeza (planejamento)

> Nada executado. Usuários/testes só após autorização explícita.

## 1. Criação (manual, dashboard do projeto correto)

Auth → Users → Add user ×6 (Auto Confirm ON — sem e-mail enviado;
sem hooks/SMTP custom no `config.toml`):
`atendente@t.test`, `producao@t.test`, `motoboy@t.test`,
`financeiro@t.test`, `contador@t.test`, `cliente2@t.test`.
Senhas fortes distintas, em gerenciador — nunca no repo/chat.
Gatilho automático por usuário: `handle_new_user` (`0000:43-53`) cria
`profiles` + papel `cliente`. Efeito: zero e-mail, zero escrita além
dessas 2 linhas.

## 2. Um papel por usuário (obrigatório para negações valerem)

```sql
-- após criar os 6:
DELETE FROM public.user_roles WHERE user_id IN
  (SELECT id FROM auth.users WHERE email LIKE '%@t.test') AND role = 'cliente';
INSERT INTO public.user_roles (user_id, role) SELECT id,
  CASE split_part(email,'@',1)
    WHEN 'atendente' THEN 'atendente' WHEN 'producao' THEN 'producao'
    WHEN 'motoboy' THEN 'motoboy' WHEN 'financeiro' THEN 'financeiro'
    WHEN 'contador' THEN 'contador' ELSE 'cliente' END::public.app_role
  FROM auth.users WHERE email LIKE '%@t.test'
  ON CONFLICT DO NOTHING;
-- conferir: 6 linhas, 1 papel cada (o admin real NÃO é tocado).
```

## 3. Matriz RLS (via API com login por papel; SQL Editor NÃO testa RLS)

| Papel | Deve passar | Deve negar (evidência válida) |
|---|---|---|
| atendente | ler fluxo; aceite/lib/retirar via RPC; itens do fluxo | `pagamento_status`, valores, fora do fluxo, atribuir |
| producao | liberar/conferir/atribuir/ficha via RPC | aceitar, `pagamento_status` |
| motoboy | próprios + descobrir `pronto/aguardando`, claim/aceite/GPS próprios | alheios, valores, itens fora do alcance |
| financeiro | leitura + conciliar (fluxo existente) | aceitar/liberar/atribuir |
| contador | leitura agregada existente | qualquer escrita operacional |
| cliente2 | próprios; cancelar `recebido` próprio | demais |
| anon | catálogo público | pedidos/clientes |

Tentativa negada (403/`RAISE`) = evidência, sem alterar nada.
Baseline antes/depois deve repetir os números E10-S1B.

## 4. Limpeza (ordem, tudo com prefixo de teste)

1. Apagar filas/fichas/históricos/rotas de teste (CASCADE a partir dos
   pedidos `E10B-`; `motoboy_historico` com `pedido_id NULL` do período:
   excluir explícito; restaurar `motoboys.status`).
2. Desvincular motoboy de teste (`user_id → NULL`) ou excluir a linha.
3. `DELETE FROM user_roles WHERE user_id IN (6 ids)`; excluir os 6
   usuários no dashboard (cascata leva `profiles`, `enderecos`, `user_roles`).
4. Recontar baseline E10-S1B: igualdade exigida; divergência = incidente.

## 5. Riscos residuais

- `handle_new_user` dá `cliente` a todo mundo: removido no §2; se
  esquecido, negações de cliente ficam inválidas (re-checar §2 antes).
- Push/fiscal/WhatsApp: só disparam por invoke/UI — não usar na janela.
- Print-agent: parado aqui; confirmar PC da loja antes de fila com escrita.
- `user_roles` sem `created_at`: auditar por `auth.users.created_at`.

## 6. Checklist de autorização para execução

[ ] Backup confirmado no dashboard. [ ] Ref = projeto de teste correto.
[ ] 6 usuários criados. [ ] §2 com 6 linhas. [ ] Baseline anotado.
[ ] Agente parado. [ ] Janela sem movimento real. Cada item marcado
antes do passo correspondente; qualquer divergência = parar.
