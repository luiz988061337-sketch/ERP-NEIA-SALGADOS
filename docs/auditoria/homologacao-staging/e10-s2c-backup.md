# E10-S2C — Backup alternativo e teste sem escrita persistente

> Auditoria somente. Nenhum backup executado, nada modificado.

## 1. Mecanismos oficiais Lovable Cloud

- No repo, todo procedimento de backup pressupõe **dashboard Supabase**
  (`GO-LIVE.md:239-241`), que o proprietário **não encontra** no Lovable
  Cloud. Nenhum doc cobre backup nativo Lovable.
- Conclusão: hoje NÃO há backup verificável pelo responsável. Tratar
  como **ausência de backup** até prova em contrário (perguntar ao
  suporte Lovable onde ficam backups/restores do Postgres gerenciado).

## 2. pg_dump: viável em tese, travado na prática

- Requer host/banco/usuário/senha de conexão direta — o responsável só
  tem SQL Editor (sem string de conexão exposta). Sem ela, sem dump.
- Se obtida: `pg_dump --schema-only` + `--data-only` por schema cobre
  estrutura, dados, funções, triggers, RLS e grants; Auth (`auth.users`,
  `user_roles`) sai no dump completo; Storage objects, Edge Functions,
  secrets, domínios e chaves NÃO saem (procedimento separado).
- Não interrompe a operação (snapshot MVCC; só carga de I/O).

## 3. Achado principal: teste com ROLLBACK dispensa backup para RLS

- Bloco `BEGIN; SELECT set_config('request.jwt.claim.sub', '<uuid>', true);
  ... testes ...; ROLLBACK;` executa TUDO (RLS, triggers, RPCs, concorrência
  aparente) e descarta ao final: **zero resíduo, zero necessidade de
  restore**. Gaps de sequência são inofensivos.
- Limites: não testa persistência real, TANCA física, nem concorrência
  entre sessões distintas (para esta, 2 abas + COMMIT em linhas E10B-,
  com limpeza §B8 — risco baixo e reversível).
- Recomendação: adotar ROLLBACK como padrão para matriz RLS e RPCs;
  reservar COMMIT apenas para o que precisa persistir para o passo
  seguinte (ex.: usuários/papéis de teste, removidos ao final).

## 4. Restauração (quando houver de onde restaurar)

- Dump SQL: replay em banco vazio + recriar roles/auth via dashboard +
  reconfigurar secrets/edges/storage à parte. Testar restore em banco
  isolado antes de confiar (restore nunca testado = sem restore).
- Sem dump e sem painel: NÃO HÁ recuperação — este é o risco atual.

## 5. GO/NO-GO

- **GO para testes com ROLLBACK** (risco ~zero, sem backup).
- **GO condicional para testes com COMMIT em linhas E10B-** (baixo,
  reversível via §B8, exige saneamento zerado antes).
- **NO-GO para qualquer escrita fora desses dois moldes** até existir
  backup verificável ou projeto separado.
