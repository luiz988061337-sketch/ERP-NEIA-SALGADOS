# Segurança dos ambientes — norma permanente

Documento criado no P0 de 26/11/2026, depois que operações de banco atingiram
produção por causa de vínculo incorreto do Supabase CLI.

## Ambientes oficiais

| Ambiente | Supabase | Uso permitido |
| --- | --- | --- |
| Desenvolvimento e homologação | `lflzlcqinarrcgncafol` | leitura, escrita controlada e migrações autorizadas |
| Produção (protegida) | `ruioyioynwwwiqbjznoa` | somente leitura; qualquer alteração exige autorização expressa do proprietário |
| Projeto Lovable legado | `iqirsunzgavsuhgyjjsi` | proibido; mantido bloqueado por precaução |

O endereço oficial de homologação continua sendo
`https://erp-neia-salgados-git-resga-dcaca5-luiz988061337-3147s-projects.vercel.app`.
A branch oficial é `resgate-visual-h01-h07-codex`, com `NEIA_AMBIENTE=homologacao`
e `VITE_DEMO_PREVIEW=0`.

## Barreira obrigatória

Toda operação de escrita ou migração remota passa por
[`scripts/ambiente-seguro.mjs`](../../../scripts/ambiente-seguro.mjs). A barreira:

1. exige o destino declarado em `--project-ref` ou `NEIA_PROJETO_ALVO`;
2. **nunca** aceita `supabase --linked` nem o `.env` como autoridade;
3. bloqueia produção, projeto legado, destino desconhecido e banco local;
4. bloqueia quando a configuração efetiva (ambiente + `.env`) aponta para produção;
5. bloqueia quando URL e projeto divergem entre si ou do destino declarado;
6. falha fechado: na dúvida, nada é executado.

### Comandos

```bash
# Validar o destino sem conectar em banco (0 = liberado, 2 = bloqueado)
npm run seguranca:destino -- --project-ref lflzlcqinarrcgncafol

# Testes da barreira (nenhuma conexão de rede)
npm run teste:seguranca

# Executar um .sql em homologação: sem --confirmar é apenas simulação
npm run sql:homolog -- --arquivo caminho/arquivo.sql --project-ref lflzlcqinarrcgncafol
npm run sql:homolog -- --arquivo caminho/arquivo.sql --project-ref lflzlcqinarrcgncafol --confirmar

# Build de homologação com verificação do bundle (bloqueia ref de produção)
npm run build:homolog
```

Os scripts de proteção existentes continuam ativos:

- `npm run dev` e `npm run preview` passam por `scripts/proteger-dev.mjs`;
- `drizzle.config.ts` recusa `LOVABLE_DB_MIGRATION_URL` de produção;
- `scripts/verificar-bundle-homolog.mjs` confere o bundle publicado.

### Precedência de configuração

- `process.env` **sobrepõe** o `.env` (comportamento do Vite e dos scripts).
- Por isso, uma variável herdada de produção no terminal bloqueia a operação:
  é preciso corrigir o ambiente, não contornar a barreira.
- O `.env` local desta worktree aponta para homologação desde 26/11/2026. Ele
  deixou de ser versionado (o arquivo local foi preservado) e
  `supabase/.temp/` passou a ser ignorado. Um clone novo deve criar o `.env` a
  partir de `.env.example`, apontando para `lflzlcqinarrcgncafol`.
- A Vercel mantém as variáveis de produção no próprio projeto; nada foi alterado
  nas configurações remotas.

## Regras obrigatórias

1. Não usar `supabase --linked` sem `--project-ref` explícito.
2. Não executar DDL, DML de escrita, `DROP`, `TRUNCATE` ou `RESET` em produção.
3. Não reaplicar migrações para "consertar" histórico; use o procedimento de
   reconciliação documentado em [migracoes-0125-0127.md](migracoes-0125-0127.md).
4. Não desativar RLS, grants ou policies para "testar".
5. Não usar dados simulados na homologação oficial.
6. Não publicar bundle com referência a `ruioyioynwwwiqbjznoa` ou com
   `VITE_DEMO_PREVIEW=1`.
7. Não imprimir chaves, tokens ou senhas em relatórios, commits ou issues.
8. Antes de qualquer escrita: sincronizar o Git, conferir a branch/worktree,
   confirmar o destino com `npm run seguranca:destino` e revisar o SQL.
9. Migrações são aplicadas uma por vez, com o histórico registrado depois.
10. Produção só muda com autorização expressa, registro em documentação e
    checkpoint versionado.

## Checklist antes de escrever no banco

- [ ] Branch e worktree corretas, sem trabalho alheio em edição.
- [ ] `--project-ref lflzlcqinarrcgncafol` declarado.
- [ ] `npm run seguranca:destino -- --project-ref lflzlcqinarrcgncafol` retornou 0.
- [ ] SQL revisado e, quando possível, idempotente.
- [ ] Backup/rollback descritos.
- [ ] Histórico de migrações será atualizado no mesmo procedimento.

## Referências

- [Incidente de 26/11/2026](incidente-2026-11-26.md)
- [Auditoria das migrações 0125–0127](migracoes-0125-0127.md)
- [Protocolo do Projeto Diretor](../README.md)
