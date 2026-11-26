# Incidente de 26/11/2026 — operações de banco em produção

**Severidade:** P0 (segurança dos ambientes)
**Status:** contido; nenhuma remoção ou alteração adicional executada
**Ambiente atingido:** produção — `ruioyioynwwwiqbjznoa`
**Ambiente correto:** homologação — `lflzlcqinarrcgncafol`

## 1. Resumo

Durante a correção da A02.1.2, o Supabase CLI estava vinculado ao projeto de
produção. Comandos `supabase db query --linked` (sem `--project-ref`) e o `.env`
do repositório apontavam para produção, então auditorias e DDL destinados à
homologação atingiram o banco protegido.

A causa não foi cache do PostgREST. As migrações `0126` e `0127` nunca haviam
sido aplicadas em homologação; o CLI aplicava no projeto errado.

## 2. Causa raiz

| Fonte | Estado encontrado | Efeito |
| --- | --- | --- |
| `.env` da worktree | `SUPABASE_PROJECT_ID` e `VITE_SUPABASE_PROJECT_ID` = `ruioyioynwwwiqbjznoa` | scripts e Vite usavam produção |
| `supabase/.temp/linked-project.json` | apontava para `ruioyioynwwwiqbjznoa` | `--linked` resolvia para produção |
| `supabase/config.toml` | `project_id = "iqirsunzgavsuhgyjjsi"` (projeto legado) | terceiro destino divergente |
| Scripts de consulta | `supabase db query --linked` sem `--project-ref` | fallback silencioso para produção |

O CLI só respeitou o projeto correto quando recebeu `--project-ref` explícito.

## 3. Operações que atingiram produção

| Operação | Objetos afetados | Dados de negócio |
| --- | --- | --- |
| Aplicação de DDL equivalente às migrações A01/A02 (`0125`/`0126`/`0127`) | tabelas, índices, policies, triggers e funções `a01_*`/`a02_*` | nenhum |
| `NOTIFY pgrst, 'reload schema'` | cache de schema do PostgREST | nenhum |
| Criação da sonda `public.opencode_cache_probe` | tabela temporária de diagnóstico | nenhum |
| Remoção da sonda `public.opencode_cache_probe` | tabela temporária vazia | nenhum |
| Consultas de auditoria (`select`) | nenhuma alteração | nenhum |

Os testes REST autenticados (inserção, ciência, histórico, tarefas e exclusão
lógica) rodaram **somente** em homologação, com usuário temporário removido ao
final.

## 4. Objetos que permanecem em produção

Confirmado por auditoria de leitura durante o incidente:

- `public.a01_tarefas` — 0 registros
- `public.a01_tarefas_historico` — 0 registros
- `public.a02_recomendacoes` — 0 registros
- `public.a02_recomendacoes_historico` — 0 registros
- colunas da `0127` presentes em `a01_tarefas`
  (`excluida`, `excluida_em`, `excluida_por`, `excluida_motivo`,
  `recomendacao_id`, `rec_chave`, `rec_ocorrencia`)
- índices, policies, triggers e funções `a01_privado.*`/`a02_privado.*`
  coerentes com as migrações

A sonda `public.opencode_cache_probe` **não** existe mais (removida em 26/11/2026).
A relação completa de objetos deve ser reconferida em leitura antes de qualquer
remoção futura.

## 5. Evidências de que os dados comerciais não foram alterados

1. Nenhum comando `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE` ou `DROP` foi
   executado contra tabelas de negócio de produção.
2. As quatro tabelas A01/A02 de produção estão vazias (0 registros), o que é
   incompatível com qualquer carga de dados de teste ou de negócio.
3. As operações de escrita em produção foram DDL em objetos novos e a
   criação/remoção da sonda de diagnóstico.
4. A contagem observada de dados de negócio permaneceu a esperada:
   218 usuários em `auth.users`, 205 perfis e 41 pedidos.
5. As sondas REST com inserção de dados rodaram apenas em homologação e foram
   removidas (0 usuários, 0 recomendações e 0 tarefas de sonda).

Não há evidência de exposição de dados: as tabelas A01/A02 estão vazias e com
RLS habilitada; os grants alcançam apenas `authenticated`.

## 6. Riscos existentes

| Risco | Gravidade | Mitigação atual |
| --- | --- | --- |
| Objetos A01/A02 ociosos em produção | média | vazios, RLS ativa; remoção aguarda autorização |
| Código A02 chegar a produção e passar a gravar nessas tabelas | alta | branch de homologação separada; produção não foi publicada com A02 |
| Nova sessão usar `--linked` e repetir o erro | alta | barreira `ambiente-seguro.mjs` + `validar-destino.mjs` |
| `.env`/config divergentes em outra worktree | média | `.env` local corrigido; `config.toml` aponta para homologação |
| Histórico de migrações de produção divergente | média | conferir em leitura antes de qualquer correção |

## 7. Procedimento recomendado de correção futura

Não executar sem autorização expressa do proprietário.

1. Confirmar que o aplicativo em produção não referencia as tabelas A01/A02
   (bundle publicado e código da branch de produção).
2. Fazer inventário somente leitura: tabelas, colunas, índices, policies,
   triggers, funções e dependências (`pg_depend`).
3. Gerar backup lógico das quatro tabelas (mesmo vazias) e o schema dos objetos.
4. Agendar janela de manutenção e registrar a autorização.
5. Em transação única, remover na ordem:
   `triggers` → `functions` → `tables` (`a01_tarefas_historico`,
   `a01_tarefas`, `a02_recomendacoes_historico`, `a02_recomendacoes`) →
   `schemas` (`a01_privado`, `a02_privado`).
6. Conferir que não restam objetos `a01_*`/`a02_*` nem grants órfãos.
7. Validar o aplicativo em produção e registrar o checkpoint.
8. Só então avaliar o histórico `supabase_migrations` de produção.

## 8. Contenção aplicada nesta entrega

- Nenhuma alteração adicional em produção (nem leitura de diagnóstico nova).
- `.env` local e `supabase/config.toml` apontando para homologação.
- `.env` e `supabase/.temp/linked-project.json` removidos do versionamento; os
  arquivos locais foram preservados e o `.gitignore` cobre o estado do CLI.
- Barreira de destino, testes automatizados, executor SQL guardado e build de
  homologação com verificação de bundle.
- Documentação da norma em [README.md](README.md) e auditoria das migrações em
  [migracoes-0125-0127.md](migracoes-0125-0127.md).

### Consolidação autorizada (26/11/2026)

- O commit de segurança `32a989a` foi preservado e publicado na branch oficial;
  o commit do Codex `b7870b7` foi integrado por merge, sem force push.
- A reconciliação do histórico `0126`/`0127` foi executada **somente em
  homologação**, sem reaplicar DDL (ver documento de migrações).
- Nenhuma alteração, DROP, TRUNCATE ou RESET foi executada em produção.
- A remoção dos objetos A01/A02 de produção permanece sem autorização e
  documentada acima para avaliação posterior.
