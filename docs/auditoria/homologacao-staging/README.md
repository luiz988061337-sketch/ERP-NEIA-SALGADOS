# Homologação isolada — migrations 0056–0071

Kit de preparação LOCAL. Nada aqui foi executado em banco algum.

## Ordem estrita (uma migration por vez, com parada)

1. `00-baseline.md` — baseline `0000→0066` em staging zerado (fail-fast).
2. `verify-0056-0057.sql` → aplicar `0056`, depois `0057`.
3. `verify-0065.sql` → aplicar `0065`.
4. `verify-0066.sql` → aplicar `0066`.
5. `verify-0067.sql` → aplicar `0067`.
6. `verify-0068.sql` → aplicar `0068`.
7. `verify-0069.sql` → aplicar `0069`.
8. `verify-0070.sql` → aplicar `0070`.
9. `verify-0071.sql` → aplicar `0071`.

Para cada migration: rode o bloco **PRE** (só `SELECT`), aplique o arquivo
`drizzle/migrations/NNNN_*.sql` em **um `New query` separado**, rode o bloco
**POST** e só avance se tudo conferir.

## Salvaguardas obrigatórias (antes de qualquer acesso remoto)

- Projeto Supabase **separado**, com nome visual distinto de produção.
- Confirmar o project ID de teste no Dashboard + Bloco H do K5.6
  (`SELECT current_user, session_user`) antes de cada DDL.
- `NEIA_AMBIENTE=staging` + barreira `proteger-dev` com `exit 0`.
- Se o project ID for desconhecido ou coincidir com o de produção: **parar**.
- Dados 100% sintéticos. Backup/PITR do ambiente de teste quando houver dados.
- **Nunca** usar `PASSO-4-bootstrap-completo.sql` (para em 0055 e mascara
  falhas com `WARNING`) nem presumir que arquivo presente = aplicado.

## Critérios de interrupção

Alvo não confirmado · `WARNING`/erro SQL · divergência de schema, ACL ou
privilégios · devolução duplicada de estoque · aceite concorrente falho ·
qualquer indício de toque em produção. Interromper a sequência inteira.

## O que este kit NÃO faz

Não cria projeto, não conecta em banco, não aplica SQL, não lê segredos,
não instala nada. Verificação funcional com JWTs por papel está descrita
nos blocos POST como passos manuais (só executáveis no staging autorizado).
