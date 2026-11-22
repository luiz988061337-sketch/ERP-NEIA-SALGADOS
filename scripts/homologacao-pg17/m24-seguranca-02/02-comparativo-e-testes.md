# M24-SEGURANÇA-02/03 — revisão final, atomicidade e testes planejados

Preparado somente com arquivos locais. Nesta rodada: nenhuma conexão remota, nenhuma leitura de dados hospedados, nenhuma credencial, nenhum `.env`, nenhum SQL executado e nenhuma alteração de permissão real.

## 1. Atomicidade e runner efetivo

Evidência estática:

| Fonte | Evidência | Conclusão |
|---|---|---|
| `scripts/homologacao-pg17/executar.ps1:28-31` | `Run-Sql` acrescenta `--single-transaction` por padrão | runner da cadeia limpa envolve cada migration em uma transação |
| `scripts/homologacao-pg17/executar.ps1:36` | chama `psql -X -w ... -v ON_ERROR_STOP=1 ... -f $File` | erro termina o processo com código não zero |
| `scripts/homologacao-pg17/executar.ps1:67-73` | lê `scripts/homologacao-pg17/instalacao-limpa.txt` e chama `Run-Sql` por arquivo | `0124` será atômica quando entrar nessa lista após `0123` |
| `scripts/baseline/apply-baseline.ps1:27,41-45` | monta `psql` sem `--single-transaction` e aplica `0087`–`0098` um a um | não é o runner da cadeia limpa e não deve aplicar `0124` |
| `drizzle/migrations/0124_acl_menor_privilegio_m24.sql` | sem `BEGIN`/`COMMIT` internos; depende do runner com `--single-transaction` | pré-condição, `REVOKE` e pós-condição rodam na única transação fornecida pelo runner |

`psql --single-transaction` inicia uma transação antes do arquivo e desfaz tudo se qualquer comando falhar com `ON_ERROR_STOP=1`. A `0124` **não possui** `BEGIN`/`COMMIT` internos e **não pode ser executada por `psql -f` sem transação explícita**. Qualquer falha na pré ou pós-condição desfaz todos os `REVOKE` porque os três blocos rodam na única transação do runner. `scripts/baseline/apply-baseline.ps1` não é compatível.

### Procedimento de execução atômica — NÃO EXECUTADO

1. Somente após aprovação, incluir `0124_acl_menor_privilegio_m24.sql` em `scripts/homologacao-pg17/instalacao-limpa.txt`, imediatamente após `0123_liberacao_rota_pela_central.sql`.
2. Forma preferencial: `powershell -NoProfile -File scripts\homologacao-pg17\executar.ps1 -Scratch <diretorio-fora-do-repo>`. O runner cria cluster PostgreSQL 17 descartável, aplica a cadeia e para o servidor ao final.
3. Equivalente direto em laboratório isolado, se aprovado: `psql -X -w -v ON_ERROR_STOP=1 --single-transaction -h <host> -p <porta> -U <owner> -d <db> -f drizzle/migrations/0124_acl_menor_privilegio_m24.sql`. Nunca executar `psql -f` sem `--single-transaction`.
4. Não usar `scripts/baseline/apply-baseline.ps1` para `0124`.
5. Não aplicar ao Supabase existente `lflzlcqinarrcgncafol`. Não reaplicar `0098`.

### Confirmação futura de rollback integral em laboratório

Procedimento a executar somente em cluster descartável, com autorização separada:

1. Salvar snapshot somente leitura das ACLs antes da prova:

   ```sql
   SELECT p.oid::regprocedure::text AS funcao,
          pg_catalog.pg_get_userbyid(p.proowner) AS owner,
          p.prosecdef,
          p.proacl::text
   FROM pg_catalog.pg_proc p
   WHERE p.oid IN (
     'public.reservar_estoque_atomica(uuid,uuid,integer)'::regprocedure,
     'public.liberar_reserva_atomica(uuid)'::regprocedure,
     'public.reservar_pedido_atomico(uuid)'::regprocedure,
     'public.liberar_pedido_atomico(uuid)'::regprocedure,
     'public.criar_pedido_com_reserva(uuid,text,jsonb,jsonb)'::regprocedure,
     'public.cancelar_pedido_atomico(uuid,text)'::regprocedure,
     'public.registrar_consumo_reserva(uuid,integer,uuid,uuid,text)'::regprocedure
   )
   ORDER BY 1;
   ```

2. Criar a condição de falha no laboratório: `REVOKE EXECUTE ON FUNCTION public.criar_pedido_com_reserva(uuid,text,jsonb,jsonb) FROM authenticated;`. Isso não altera a `0124`; apenas faz a pós-condição falhar depois dos `REVOKE`.
3. Executar a `0124` com `ON_ERROR_STOP=1` e `--single-transaction`. A pós-condição deve levantar `0124: authenticated perdeu criar_pedido_com_reserva` antes do commit do runner.
4. Repetir o snapshot. Deve ser **idêntico** ao anterior: as quatro helpers voltam a ter as ACLs originais e o grant do wrapper é restaurado.
5. Somente depois disso, restaurar o laboratório limpo e executar a `0124` normalmente para confirmar o caminho de sucesso.

## 2. Assinaturas, proprietários, `SECURITY DEFINER` e permissões

Conferência estática das sete assinaturas obrigatórias:

| Função | Definição final | `SECURITY DEFINER` | `search_path` | Owner esperado |
|---|---|---|---|---|
| `public.reservar_estoque_atomica(uuid,uuid,integer)` | `0088_reservar_estoque_atomica.sql:104-112` | sim (`:110`) | `public` (`:111`) | dinâmico, igual ao wrapper de referência |
| `public.liberar_reserva_atomica(uuid)` | `0086_corrigir_reservas_atomicas.sql:127-128` | sim (`:128`) | `public` (`:128`) | dinâmico |
| `public.reservar_pedido_atomico(uuid)` | `0089_reservar_pedido_atomico.sql:186-190` | sim (`:189`) | `public` (`:190`) | dinâmico |
| `public.liberar_pedido_atomico(uuid)` | `0090_liberar_pedido_atomico.sql:208-212` | sim (`:211`) | `public` (`:212`) | dinâmico |
| `public.criar_pedido_com_reserva(uuid,text,jsonb,jsonb)` | `0095_criar_pedido_com_reserva.sql:98-107`, redefinida em `0103_entrega_por_km.sql:201-205` | sim (`0095:106`, `0103:204`) | `public` (`0095:107`, `0103:205` normaliza `TO 'public'`) | referência para todas as demais |
| `public.cancelar_pedido_atomico(uuid,text)` | `0093_cancelar_pedido_atomico.sql:306-312` | sim (`:311`) | `public` (`:312`) | dinâmico |
| `public.registrar_consumo_reserva(uuid,integer,uuid,uuid,text)` | `0091_registrar_consumo_reserva.sql:197-206` | sim (`:205`) | `public` (`:206`) | dinâmico |

A `0124` não fixa `postgres` como owner: ela lê o owner de `criar_pedido_com_reserva` e exige que as outras seis tenham o mesmo owner. Isso é necessário porque `executar.ps1:36` conecta como `neia_homologador` (`initdb` em `:50`), enquanto `apply-baseline.ps1:6` usa `postgres` por padrão.

Permissões:

- `PUBLIC`: verificado por `aclexplode(proacl)` com `grantee = 0`.
- Diretas: verificadas no `proacl` e por `has_function_privilege` para `anon`, `authenticated` e `service_role`.
- Herdadas: `has_function_privilege` é avaliada para **todo papel não-superusuário diferente do owner**; isso cobre grants recebidos por associação de papéis. Superusuários são excluídos porque ignoram ACL por definição.
- Papéis da plataforma no laboratório: `plataforma-sintetica.sql:2-5` cria `anon`, `authenticated`, `authenticator` e `service_role`.
- Premissas que só o catálogo real pode confirmar: owner efetivo, `proconfig` normalizado, existência/associação dos papéis, `ALTER DEFAULT PRIVILEGES`, grants executados depois da migration e qualquer papel customizado com herança.

Resultado desejado: quatro helpers com `EXECUTE` apenas para o owner/DEFINER; três wrappers preservados com `EXECUTE` para `authenticated`.

## 3. Compatibilidade e dependências internas

- A `0124` contém apenas `DO` com `RAISE`, `REVOKE`, leitura de catálogo e verificações. Não há `CREATE OR REPLACE FUNCTION`, `ALTER FUNCTION`, DML, RLS, alteração de dados, flags, Auth ou papéis.
- A `0098` continua na cadeia histórica; a `0124` não reaplica nem edita seu conteúdo. Ela corrige o estado inseguro introduzido por `0098:24,29,34`.
- Não reabre M24: não há nenhum `GRANT` na migration. Pelo contrário, a pós-condição falha se qualquer papel não-owner, incluindo `PUBLIC`, ainda puder executar as quatro helpers.
- Cadeia interna por `SECURITY DEFINER`: `0095:913` e `0103:1051` chamam `reservar_pedido_atomico`; `0093:443` chama `liberar_pedido_atomico`; `0091:197-206` é o wrapper de produção de consume. Chamadas internas de função `DEFINER` não exigem `EXECUTE` do chamador, conforme `0098:63-67`.
- Versões legadas não são afetadas antes do cutover: o arquivo não é aplicado ao Supabase existente, não está na lista de pendências legadas e foi mantido como untracked. Até o cutover, as duas helpers legadas do existente continuam protegidas pela ACL documentada como fechada.
- Risco de ordem: `scripts/homologacao-pg17/lfl-finalizacao-0123/01-funcoes-essenciais.sql:527-528` concede `authenticated` em `reservar_pedido_atomico`. Se esse delta for aplicado depois da `0124` em um pacote derivado, a ACL precisa ser reafirmada depois dele.

## 4. Checklist futuro — Supabase existente, somente leitura

Não executar agora. Quando houver autorização explícita futura, confirmar por consultas `SELECT` com usuário de leitura:

- [ ] `anon`, `authenticated`, `service_role` não têm `EXECUTE` em `reservar_estoque_atomica(uuid,uuid,integer)` e `liberar_reserva_atomica(uuid)`; usar `has_function_privilege`.
- [ ] Os mesmos papéis não têm `EXECUTE` em `reservar_pedido_atomico(uuid)` e `liberar_pedido_atomico(uuid)`.
- [ ] `aclexplode(proacl)` não mostra `grantee = 0` com `privilege_type = 'EXECUTE'` nas quatro funções.
- [ ] Nenhum outro papel não-superusuário tem `EXECUTE` por grant direto ou herdado nas quatro funções.
- [ ] `authenticated` mantém `EXECUTE` nos três wrappers autorizados.
- [ ] Owner e `SECURITY DEFINER` das sete funções conferem com a tabela acima; `proconfig` contém `search_path=public`.
- [ ] Se existir `supabase_migrations.schema_migrations`, verificar a evidência documentada de que `0098` não foi aplicada e que `0124` também não foi aplicada ao existente.
- [ ] Confirmar que nenhuma consulta acima escreve; não usar `supabase db query --linked` com a CLI 2.122.0, conforme incidente registrado em `docs/HOMOLOGACAO-REAL-ERP-MOTOBOY.md:223`.

Consulta-base somente leitura:

```sql
SELECT p.oid::regprocedure::text AS funcao,
       pg_catalog.pg_get_userbyid(p.proowner) AS owner,
       p.prosecdef,
       p.proacl::text
FROM pg_catalog.pg_proc p
WHERE p.oid IN (
  'public.reservar_estoque_atomica(uuid,uuid,integer)'::regprocedure,
  'public.liberar_reserva_atomica(uuid)'::regprocedure,
  'public.reservar_pedido_atomico(uuid)'::regprocedure,
  'public.liberar_pedido_atomico(uuid)'::regprocedure,
  'public.criar_pedido_com_reserva(uuid,text,jsonb,jsonb)'::regprocedure,
  'public.cancelar_pedido_atomico(uuid,text)'::regprocedure,
  'public.registrar_consumo_reserva(uuid,integer,uuid,uuid,text)'::regprocedure
)
ORDER BY 1;
```

## 5. Testes SQL × testes reais de Auth/PostgREST

`01-acl-m24.test.sql` cobre, em transação reversível: catálogo das quatro helpers, ausência de `PUBLIC` e de grants diretos/herdados, preservação dos wrappers e negação por `insufficient_privilege` para cliente, atendente, produção, admin, sem claims, anon e `service_role`. Ele usa `SET LOCAL ROLE` e GUCs `request.jwt.*`: **são papéis de banco simulados**.

Não são cobertos por esse arquivo: emissão e validação de token do Supabase Auth, mapeamento de papéis pelo PostgREST, preenchimento real de `request.jwt.*` pela API, RLS através de HTTP, Storage e middleware da aplicação. Esses testes reais devem ser feitos em homologação Auth/PostgREST separada, com usuários fictícios.

Fluxos de negócio a repetir em laboratório isolado, com fixtures existentes e dados sintéticos: `funcoes-essenciais.test.sql`, `cliente-isolamento.test.sql`, `lote06-autorizacao-rpcs/06-autorizacao-rpcs.test.sql` e `capacidades-integracao.test.sql`, todos sob `scripts/homologacao-pg17/lfl-finalizacao-0123/`.

## 6. Riscos restantes

- Nenhuma execução SQL foi feita nesta etapa; validação prática, rollback real e Auth/PostgREST reais continuam pendentes.
- A `0124` aborta se qualquer assinatura obrigatória faltar; isso é intencional e não deve virar `SKIP` no baseline limpo.
- Owner, `proconfig`, associações de papéis e grants posteriores à migration só podem ser provados no catálogo do laboratório.
- Um `GRANT` futuro nas quatro helpers pode reabrir M24; o checklist de leitura e os testes de catálogo devem ser repetidos após qualquer pacote derivado.
- `liberar_pedido_atomico` não valida usuário/papel/dono por contrato; permanece sensível a qualquer grant futuro.
- `scripts/commit-seguro.ps1:89-101` bloqueia qualquer caminho com `migrations`, salvo autorizações explícitas para `0105`–`0108`. A `0124` será bloqueada por esse helper; ajuste do guard ou autorização de commit precisa ser tratada separadamente, sem alteração do guard nesta etapa.
- A `0124` ainda não foi incluída em `instalacao-limpa.txt`; a inclusão é pré-requisito para a instalação limpa e depende de aprovação.
