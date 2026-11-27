# Central da Atendente — publicação controlada em homologação

Data: 27/11/2026  
Branch oficial: `resgate-visual-h01-h07-codex`  
Commit de código publicado: `438518f8d46f34bd5ec44329df0ddba7b2bd98e5`  
Endereço oficial: <https://erp-neia-salgados-git-resga-dcaca5-luiz988061337-3147s-projects.vercel.app>

A publicação abaixo é **somente de homologação**. Não houve promoção,
alteração ou acesso de escrita à produção (`ruioyioynwwwiqbjznoa`). A conferência
manual do proprietário e o teste operacional com atendente autorizada ainda
pendem; portanto **não há aprovação definitiva** desta etapa.

## Integração e backup

| Item | Resultado |
| --- | --- |
| Base da oficial antes da integração | `4c703e4` |
| Branch isolada preservada | `central-atendente-retomada-opencode` @ `438518f` |
| Checkpoint isolado | `checkpoint-central-atendente-retomada-local-01` → `91dd909` |
| Estoque separado | `estoque-operacional-vinculos` @ `ffd6265`, sem merge |
| Integração | `git merge --ff-only` na worktree oficial: `4c703e4` → `438518f` |
| Push | `4c703e4..438518f  resgate-visual-h01-h07-codex`, sem force push |

Nenhuma funcionalidade aprovada foi reconstruída. Menu lateral, botões amarelos,
detalhes com contorno amarelo e a identidade da área pública foram preservados.

## Migrations aplicadas em `lflzlcqinarrcgncafol`

Aplicação uma a uma pela barreira oficial, sempre com `--project-ref
lflzlcqinarrcgncafol` e `--confirmar`:

1. `drizzle/migrations/0139_recebimento_balcao_atendente.sql`
2. `drizzle/migrations/0140_edicao_observacoes_auditada.sql`
3. `drizzle/migrations/0141_guard_recebimento_com_capacidade.sql`

O histórico foi reconciliado por SQL direto em `supabase_migrations.schema_migrations`
com as versões `20261127210000`, `20261127210001` e `20261127210002`, registrando
o conteúdo das migrations em `statements`. **Nenhuma migration foi reaplicada**;
`0134`/`0135`/`0136` permanecem em `20261127172951`/`20261127202230`/
`20261127202504` e não foram tocadas. `0137`/`0138` não foram presumidas.

A divergência da `0106` foi resolvida antes da aplicação conforme decisão do
proprietário: a guarda `receber_pagamento` foi preservada para todos os papéis e
a atendente foi acrescentada apenas à lista de papéis da RPC. Admin/Financeiro
sem a capacidade continuam bloqueados também no banco.

Verificação pós-aplicação (`scripts/central-pg17/pos-aplicacao-homolog.sql`):

- histórico com as três versões novas e as três anteriores;
- `consultar_recebimento_retirada` usa `tem_capacidade` e não exige Admin;
- `registrar_pagamento_pedido` conserva ledger, idempotência, grants restritos a
  `authenticated`, guarda de capacidade e papel atendente;
- `pedido_edicoes_auditoria` com RLS e RPC `editar_observacoes_pedido` presentes;
- guarda da `0141` ativa e guarda original da `0084` preservada;
- gatilho `exigir_quitacao_para_retirada` presente;
- ledger sem `INSERT`/`UPDATE`/`DELETE` direto para `authenticated`.

## Testes e barreiras antes da publicação

| Verificação | Resultado |
| --- | --- |
| `npm run teste:seguranca` | 31/31 |
| `npm run seguranca:destino -- --project-ref lflzlcqinarrcgncafol` | destino autorizado |
| `npm run build:homolog` | passou; zero referência de produção no bundle |
| `npm run teste:recebimento-balcao` | 8/8 |
| Ensaio PG17 descartável | 55 asserções `OK`, incluindo reversão byte a byte da `0106` |
| `git merge-base --is-ancestor 4c703e4 HEAD` | confirmado antes do fast-forward |

Os ensaios `typecheck`, `teste:central` (41 asserções), `teste:aceite-local` (7
cenários) e o build de homologação já haviam passado nas etapas anteriores e não
foram repetidos sem necessidade.

## Deployment e alias

| Item | Resultado |
| --- | --- |
| Comando | `vercel pull --environment=preview --git-branch=resgate-visual-h01-h07-codex`; `vercel build`; `vercel deploy --prebuilt --yes --target preview` |
| Variáveis | ambiente da branch oficial com override explícito: `NEIA_AMBIENTE=homologacao`, `VITE_NEIA_AMBIENTE=homologacao`, `VITE_DEMO_PREVIEW=0`, flags de aceite/retirada `on`, URLs/chave homologadas |
| Deployment publicado | `dpl_7trLfgg6khb9WkS5LVyJSCkrPfLk` — `READY`, `target: preview` |
| URL própria | <https://erp-neia-salgados-b08ekekfg-luiz988061337-3147s-projects.vercel.app> |
| Alias oficial | <https://erp-neia-salgados-git-resga-dcaca5-luiz988061337-3147s-projects.vercel.app> → `dpl_7trLfgg6khb9WkS5LVyJSCkrPfLk` |
| Proteção | `vercel_authentication` preservada |
| Produção | `erp-neia-salgados.vercel.app` permanece em `dpl_DK144zp5kG9FSsL4J5HdniQ34Ukk`, `target: production`, sem promoção |

Um primeiro deployment (`dpl_A3PsMDLe33XC94wgCVs6oR3Pxcdg`) foi **descartado e
nunca recebeu o alias**: o ambiente herdado do terminal e o ambiente genérico de
Preview do Vercel sobrepuseram as variáveis da branch, produzindo o banner
“MODO DEMONSTRAÇÃO”. Ele foi identificado antes do reposicionamento do alias e
substituído pelo build correto acima. Nenhum domínio, projeto ou endereço novo
foi criado.

Conferência do deployment/alias:

- HTML servido sem “MODO DEMONSTRAÇÃO”;
- `index-DBcGZAkq.js`: contém `lflzlcqinarrcgncafol`, não contém
  `ruioyioynwwwiqbjznoa` e traz `VITE_DEMO_PREVIEW` compilado como `0`;
- `central-pedidos-DDyGZhbf.js`: contém `pode_receber`,
  `editar_observacoes_pedido` e `receber_pagamento`;
- `vercel inspect` confirma o alias no deployment novo e a produção inalterada.

## Capacidade financeira configurada

Em 27/11/2026, por autorização expressa do proprietário, foi concedida
**exclusivamente** a capacidade `receber_pagamento` à conta administrativa
existente em homologação:

| Campo | Valor registrado |
| --- | --- |
| `usuario` | `8a788a93-0ecf-483e-a402-cc09f84fcd9c` (`luiz988061337@gmail.com`) |
| `capacidade` | `receber_pagamento` |
| `concedido_por` | `8a788a93-0ecf-483e-a402-cc09f84fcd9c` (conta do proprietário, sem outro responsável disponível) |
| `motivo` | Autorização expressa do proprietário em 27/11/2026 para testes manuais da Central da Atendente; exclusivamente `receber_pagamento`. |
| `concedido_em` | `now()` no momento da inserção |

A concessão usou o mecanismo oficial da tabela privada
`neia_operacao.financeiro_capacidades`, com RLS e sem CRUD para papéis da
aplicação. A escrita passou pela barreira de destino
(`npm run seguranca:destino` + `npm run sql:homolog -- --project-ref
lflzlcqinarrcgncafol --confirmar`). Antes da inserção foi confirmado que a tabela
estava vazia e que a conta alvo possui o papel `admin`. Depois foi confirmado que
existe **uma única linha**, que `neia_operacao.tem_capacidade` retorna `true`
para essa conta/capacidade e que não há capacidade adicional.

Não foi criado usuário, papel ou permissão adicional. Não houve alteração em
pedidos, código, migrations, layout, deployment, aliases ou produção. Não existe
atendente com papel `atendente` em homologação; portanto o cenário "atendente sem
Admin" continua sem perfil de teste e depende de decisão separada do proprietário.

Antes de declarar operacional, o proprietário deve conferir no alias oficial:

1. recebimento em produção com a conta administradora agora autorizada,
   incluindo dinheiro, Pix, cartão, troco e parciais;
2. bloqueio de retirada sem quitação, alertas por voz e edição auditável de
   observações;
3. o bloqueio permanece para qualquer outra conta sem `receber_pagamento`.

## Reversão

- **Frontend:** reposicionar o alias fixo para
  `dpl_29a9PGJumax5wpcYTDeawn2dsUAb`, deployment anterior aprovado
  (`dpl_29a9…`, `READY`). Não promover nem apagar a produção.
- **Banco:** em janela autorizada e somente em `lflzlcqinarrcgncafol`, executar
  `scripts/central-pg17/reverter-0139-0141.sql`. Ele restaura byte a byte os
  corpos anteriores da `consultar_recebimento_retirada` (md5
  `c641a752f7b488f36606f902b8fee3c9`), da `registrar_pagamento_pedido` e do
  gatilho da `0084`, e remove a RPC de edição. A tabela de auditoria e os eventos
  do ledger são preservados; o SQL não apaga histórico de migration nem
  reaplica `0134`–`0136`. A remoção das três versões do histórico, se desejada,
  exige autorização e SQL próprio.
- A reversão não restaura capacidades financeiras eventualmente concedidas;
  essas concessões devem ser revogadas separadamente pelo mecanismo oficial.

## Pendências reais

- Testes manuais do proprietário no alias oficial e aprovação visual/funcional.
- Perfil de atendente sem Admin para o cenário específico, se o proprietário
  desejar validá-lo; a conta administrativa já está autorizada.
- Integração com a frente de estoque (`ffd6265`) e edição comercial completa,
  ainda aguardando autorização/coordenação.
- Produção permanece protegida; qualquer alteração depende de autorização
  expressa do proprietário.
