# Auditoria das migrações 0125, 0126 e 0127 em homologação

Auditoria **somente leitura**, executada em 26/11/2026 no projeto
`lflzlcqinarrcgncafol`. Nenhuma migração remota foi aplicada nesta entrega.

## 1. Histórico registrado

`supabase_migrations.schema_migrations` contém apenas:

| version | name |
| --- | --- |
| `20261125162414` | `a01_tarefas_administrativas` |

As migrações `0126` e `0127` foram aplicadas por SQL direto e **não** foram
registradas no histórico. Não é seguro reaplicá-las: a `0126` usa
`create table` sem `if not exists`.

## 2. Objetos verificados

| Migração | Objetos esperados | Estado em homologação |
| --- | --- | --- |
| `0125` | `public.a01_tarefas`, `public.a01_tarefas_historico`, índices, schema `a01_privado`, funções `equipe`, `nome_equipe`, `preparar_tarefa`, `registrar_historico`, 2 triggers, 4 policies, grants | presentes |
| `0126` | `public.a02_recomendacoes`, `public.a02_recomendacoes_historico`, 3 índices + unique, schema `a02_privado`, funções `preparar_recomendacao`, `registrar_historico_recomendacao`, 2 triggers, 4 policies, grants | presentes |
| `0127` | colunas `excluida*`, `recomendacao_id`, `rec_chave`, `rec_ocorrencia`; constraint `a01_tarefas_exclusao_check`; índice único `a01_tarefas_recomendacao_unica`; policy `a01_tarefas_edicao` atualizada; grants de colunas; check de ação no histórico | presentes |

Colunas confirmadas:

```text
a01_tarefas:
  id, titulo, descricao, prioridade, prazo, compartilhada, origem, criado_por,
  responsavel_id, criado_nome, responsavel_nome, criada_em, atualizada_em,
  versao, concluida, concluida_em, concluida_por, excluida, excluida_em,
  excluida_por, excluida_motivo, recomendacao_id, rec_chave, rec_ocorrencia

a01_tarefas_historico:
  id, tarefa_id, ator_id, ator_nome, acao, versao, ocorrido_em, anterior, atual

a02_recomendacoes:
  id, recomendacao_id, chave, ocorrencia, situacao, prioridade, titulo,
  criado_por, criado_em, atualizado_por, atualizado_em, ciente_em, ciente_por,
  adiada_em, adiada_por, adiada_ate, dispensada_em, dispensada_por,
  dispensada_motivo, resolvida_em, resolvida_por, resolvida_dados, tarefa_id

a02_recomendacoes_historico:
  id, estado_id, ator_id, ator_nome, acao, detalhe, ocorreu_em
```

Índices, policies e triggers observados:

```text
a01_tarefas_criador_idx, a01_tarefas_responsavel_idx,
a01_tarefas_concluida_por_idx, a01_tarefas_pendentes_prazo_idx,
a01_tarefas_recomendacao_unica, a01_tarefas_pkey,
a01_tarefas_historico_ator_idx, a01_tarefas_historico_pkey,
a01_tarefas_historico_tarefa_id_versao_key

a02_recomendacoes_chave_idx, a02_recomendacoes_situacao_idx,
a02_recomendacoes_tarefa_idx, a02_recomendacoes_pkey,
a02_recomendacoes_recomendacao_id_chave_ocorrencia_key,
a02_recomendacoes_historico_estado_idx, a02_recomendacoes_historico_pkey

policies: a01_tarefas_leitura/criacao/edicao,
          a01_tarefas_historico_leitura,
          a02_recomendacoes_leitura/gerencia/atualizacao,
          a02_recomendacoes_historico_leitura

triggers: a01_tarefas_preparar, a01_tarefas_auditar,
          a02_recomendacoes_preparar, a02_recomendacoes_auditar
```

## 3. Consultas de auditoria (somente leitura)

```sql
-- histórico
select version, name from supabase_migrations.schema_migrations order by version;

-- objetos A01/A02
select 'table' as tipo, schemaname||'.'||tablename as nome
from pg_tables where schemaname='public' and (tablename like 'a01_%' or tablename like 'a02_%')
union all
select 'index', schemaname||'.'||indexname from pg_indexes
where schemaname='public' and (tablename like 'a01_%' or tablename like 'a02_%')
union all
select 'policy', schemaname||'.'||tablename||':'||policyname from pg_policies
where schemaname='public' and (tablename like 'a01_%' or tablename like 'a02_%')
union all
select 'schema', nspname from pg_namespace where nspname in ('a01_privado','a02_privado')
order by 1, 2;
```

Executar sempre com `--project-ref lflzlcqinarrcgncafol` explícito.

## 4. Procedimento de reconciliação (não executado)

**Pré-requisitos:** autorização específica do proprietário, janela combinada,
`npm run seguranca:destino -- --project-ref lflzlcqinarrcgncafol` retornando 0,
e ausência de outra migração em andamento.

### Passo 1 — conferir antes

Confirmar que as duas versões ainda não existem e que os objetos estão
completos (seção 3).

### Passo 2 — registrar o histórico sem reaplicar

Versões propostas (monotônicas, posteriores a `20261125162414`):

| Arquivo | version | name |
| --- | --- | --- |
| `0126_a02_recomendacoes_estado.sql` | `20261126160000` | `a02_recomendacoes_estado` |
| `0127_a01_tarefas_gestao.sql` | `20261126160100` | `a01_tarefas_gestao` |

Modelo do SQL, em transação única:

```sql
begin;

insert into supabase_migrations.schema_migrations (version, name, statements)
values
  ('20261126160000', 'a02_recomendacoes_estado',
   array[$mig$<conteúdo integral de 0126>$mig$]),
  ('20261126160100', 'a01_tarefas_gestao',
   array[$mig$<conteúdo integral de 0127>$mig$])
on conflict (version) do nothing;

commit;
```

O conteúdo integral deve ser lido dos arquivos do repositório no momento da
execução — não copiar de memória nem resumir.

Execução guardada:

```bash
npm run sql:homolog -- --arquivo docs/projeto-diretor/seguranca-ambientes/reconciliar-0126-0127.sql --project-ref lflzlcqinarrcgncafol
npm run sql:homolog -- --arquivo docs/projeto-diretor/seguranca-ambientes/reconciliar-0126-0127.sql --project-ref lflzlcqinarrcgncafol --confirmar
```

### Passo 3 — conferir depois

```sql
select version, name from supabase_migrations.schema_migrations
where version in ('20261126160000','20261126160100');
```

Devem existir exatamente duas linhas novas; nenhum objeto de banco deve ser
recriado.

### Reversão

Somente o histórico muda neste procedimento. Em caso de erro:

```sql
delete from supabase_migrations.schema_migrations
where version in ('20261126160000','20261126160100');
```

## 5. Alternativa oficial do CLI

```bash
npx supabase migration repair --status applied \
  20261126160000 20261126160100 \
  --project-ref lflzlcqinarrcgncafol
```

O `migration repair` grava apenas o histórico, mas exige conexão com senha e
pode criar registros sem o conteúdo das statements. Por isso a opção SQL
controlada acima é a recomendada para este caso.

## 6. O que não fazer

- Não reaplicar `0126`/`0127` para "atualizar" o histórico.
- Não usar `supabase db push` sem conferir o projeto de destino.
- Não rodar `migration repair` apontando para produção.
- Não alterar o histórico antes da autorização do proprietário.
