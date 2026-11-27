# Central da Atendente | Preflight da homologação operacional

27/11/2026. A base de código é `e2c7f62`, preservada pela tag
`checkpoint-central-atendente-operacional-local-01`. A branch
`central-atendente-codex` inclui o registro de adiamento do Estoque do Dia
(`86c6052)) e este preflight. A homologação real aguarda autorização do proprietário.

## Base, ambiente e continuidade

| Alvo | Conferência |
| --- | --- |
| Branch oficial | `resgate-visual-h01-h07-codex` em `e50e750d075c4a0d928a23a14c0b81a2c5ac3a86` no GitHub. É ancestral da candidata, permitindo fast-forward. A worktree oficial local permanece separada. |
| Versão servida | O alias oficial está atribuído a `dpl_Bb2c6DRtASHpDqbW1vpynxG4G8ui`, SHA `968664d`, da H02. `e50e750` registra a aprovação da H02. Os commits seguintes recuperam e operacionalizam a Central e registram o adiamento do Estoque do Dia. |
| Preview Vercel | Projeto `prj_sSP8Q2IIAVTe4qiyGjTJi3qZYl0J`. Confirmados `VITE_DEMO_PREVIEW=0`, `NEIA_AMBIENTE=homologacao`, os dois refs, as duas URLs e a coerência das chaves publicáveis da branch. |
| Supabase | Projeto ativo `lflzlcqinarrcgncafol`, PostgreSQL 17.6. A inspeção de catálogo executou em transação somente leitura. |
| Flags de fluxo | `VITE_FF_ACEITE_ATENDENTE` e `VITE_FF_RETIRADA` estão ausentes em Preview. O código as trata como desligadas. Para testar aceite e retirada operacionais, as duas precisam ficar em `on` apenas no Preview da branch oficial. |
| Perfis | Entre os papéis admin, atendente, produção e motoboy, o banco tem um papel admin cadastrado. Para homologar RLS e rotinas reais, preparar contas exclusivas de atendente e produção. Entregas aceita admin ou produção no fluxo atual. Motoboy de teste é necessário apenas se o roteiro avançar para o aplicativo do motoboy. |

[Endereço oficial da Central](https://erp-neia-salgados-git-resga-dcaca5-luiz988061337-3147s-projects.vercel.app/admin#central-atendente)

O diff preserva os módulos aprovados, a H02 e as três colunas da Central.
As mudanças já versionadas no checkout, PDV, página do pedido, Produção e
Entregas tratam do prazo prometido. O build, typecheck e as regressões desta
rodada usam o candidato local. Conta, pedido e dados reais de homologação entram
no roteiro após autorização. Não houve alterações em ambientes remotos.

## Compatibilidade das migrations

| Migration | Pré-requisitos encontrados no catálogo de homologação | Resultado |
| --- | --- | --- |
| `0130_central_atendente_leitura_operacional.sql` | `pedidos`, `pedido_itens`, `pedido_item_componentes` e `producao_remessas` com RLS, relacionamentos validados e leitura autenticada. `has_role` e a política de componentes estão presentes. | Independente do Estoque. Amplia a leitura de itens e remessas ativos para o papel atendente. |
| `0131_central_atendente_realtime_avisos.sql` | `notificacoes` aceita a origem Produção/admin. `realtime.messages` tem RLS, partições, publicação gerenciada e as funções `realtime.send` e `realtime.topic`. `pedidos` já está em `supabase_realtime`. | Independente do Estoque. Usa Broadcast privado e mantém a consulta de 15 s. O WebSocket gerenciado ainda precisa de teste funcional. |
| `0132_pedido_prazo_comercial.sql` | `loja_config` com 40–60 min retirada e 60–90 min entrega e leitura pública dos campos. Catálogo, itens e componentes presentes. `tipo_entrega` é texto, conforme esperado. | Independente do Estoque. Registra prazo de pedidos novos. As três colunas de prazo e os gatilhos ainda não estão instalados em homologação. |

As três versões candidatas estão livres. O histórico sem alterações da Central vai até `20261126170000` no banco.
Os objetos próprios de 0130–0132 também estão ausentes. A ACL do OpenCode
agora aparece como `0133_acl_reserva_estoque_dia.sql`, com versão proposta
`20261127230000`. A 0129 está em trabalho local e prevê `20261126190000`.
A colisão de prefixo entre os arquivos 0130 foi resolvida na cópia local da
frente do OpenCode. A integração futura da frente de estoque deve confirmar
novamente os nomes e o histórico.

O executor remoto é `postgres`. O catálogo confirma a delegação gerenciada
`supautils.policy_grants` para `postgres` em `realtime.messages`. A 0131
usa apenas comandos de política nessa tabela. As demais alterações da migração
ocorrem no schema público. O executor tem acesso de proprietário às tabelas
públicas alteradas, permissão para criar funções e permissão para registrar o histórico.

[Permissões gerenciadas do Supabase para políticas Realtime](https://supabase.com/kb/troubleshooting/realtime-must-be-owner-of-table-messages)

As RPCs existentes de aceite e retirada foram encontradas com
`EXECUTE` para `authenticated` e sem `EXECUTE` para `anon`.
A implantação da Central exclui a 0129/0133 e mantém a configuração de
reserva, baixa, cancelamento e estoque existente. Vínculos unitários, reservas
por sabor, FEFO, baixa física, cancelamentos de reserva e agendamentos que
dependem da frente do OpenCode continuam em homologação própria. O risco
preexistente do checkout legado permanece descrito no
[registro operacional](prioridade-operacional-27-11-2026.md).

## Execução após autorização expressa

1. Conferir novamente o SHA oficial, o candidato e o alias. Validar o destino
   `npm run seguranca:destino -- --project-ref lflzlcqinarrcgncafol` com configuração
   explícita de homologação. Confirmar o histórico, os objetos acima e o direito
   de execução para criar políticas em `realtime.messages`, pela delegação gerenciada. Se houver divergência,
   parar antes de aplicar.
2. Aplicar **apenas** as três migrations da Central em uma transação no projeto
   `lflzlcqinarrcgncafol`, pela API autenticada de SQL com ID de projeto explícito.
   Encadear os corpos originais de 0130, 0131 e 0132 sem seus delimitadores externos
   `BEGIN;` e `COMMIT;` e envolver o conjunto em um único `BEGIN`/ `COMMIT`.
   Usar `SET LOCAL lock_timeout = '5s'` e `SET LOCAL statement_timeout = '30s'`.
   Na mesma transação, guardar cada SQL e seu nome no histórico, após verificar que
   as versões candidatas `20261127120000`, `20261127120001` e `20261127120002`
   estão livres. Uma colisão deve abortar a transação. Solicitar o reload do schema
   de PostgREST via `NOTIFY pgrst, 'reload schema'`. Se uma etapa falhar, verificar
   o catálogo antes de tentar novamente. Confirmar seis políticas, seis triggers,
   três colunas e o histórico da Central após o commit.
3. No projeto Vercel existente, criar as duas flags `on` somente em Preview e
   somente para `resgate-visual-h01-h07-codex`. Conferir os valores antes do build.
   Preparar as contas de teste autorizadas em homologação, com os papéis mínimos.
4. Fazer fast-forward da branch oficial para o SHA candidato. O
   `vercel.json` desativa o deploy por push nessa branch. Criar um Preview
   **manual** do projeto existente, a partir da conexão GitHub do repositório
   `1393910238`, ref `resgate-visual-h01-h07-codex` e SHA candidato explícito,
   sem promover para produção. Na API Vercel, deixar `target` ausente para Preview.
   A guarda no `vite.config.ts` confere o destino e a configuração quando a ref
   oficial chega ao build. Conferir no deployment `READY`, a ref, o SHA, o destino
   e os logs. Se o alias não tiver acompanhado o deploy, atribuir somente o alias
   oficial ao ID verificado. Confirmar o alias e abrir a Central no endereço fixo.
5. Executar o roteiro manual abaixo com dados de teste criados via fluxos reais.
   Registrar o resultado e aguardar a aprovação expressa do proprietário.

[Configuração de deploy por branch](https://vercel.com/docs/project-configuration/git-configuration) · [Criação de deploy Vercel](https://vercel.com/docs/rest-api/deployments/create-a-new-deployment) · [Broadcast de banco](https://supabase.com/docs/guides/realtime/broadcast)

## Roteiro manual

| Perfil | Conferência |
| --- | --- |
| Cliente de teste | Criar uma retirada imediata, uma entrega com assado e um agendado, com modalidade de teste compatível e sem transferência real. Verificar a hora prometida na página de acompanhamento. Confirmar que a conta cliente não abre a Central administrativa. |
| Admin e atendente | Com admin, abrir H02 e navegar para Central sem F5. Com atendente, abrir o endereço fixo da Central e confirmar entrada dos pedidos, três colunas, sabores e quantidades, modalidade, prazo e atraso. Testar o som a 75%, a repetição, o reconhecimento de um pedido por vez e a recarga. Aceitar um pedido e testar o clique duplo sem repetir a ação. |
| Produção | Confirmar o pedido aceito na Cozinha e a janela de 1h30 do agendado. Na retirada, concluir a conferência e liberar. Na entrega, avisar o caixa. Confirmar que a Central recebe avisos distintos sem F5, reconhece cada um e retoma a leitura em reconexão. Isolar o WebSocket no navegador de teste para conferir a consulta periódica sem interromper os pedidos. |
| Entregas e balcão | Na Entregas, verificar o pedido de entrega, a distinção de modalidade e o prazo. No balcão, confirmar a retirada liberada e revisar histórico. Conferir em desktop e celular. |

## Reversão

1. Se houver falha visual, de acesso ou comercial, voltar o alias oficial ao
   deployment anterior `dpl_Bb2c6DRtASHpDqbW1vpynxG4G8ui` (SHA `968664d`) e
   conferir a versão servida. Restaurar apenas as duas flags de Preview criadas
   nessa operação. Se for necessário, criar commits normais de reversão na
   branch oficial. O histórico Git publicado deve permanecer linear e preservado.
2. Se o banco precisar de reversão, usar o [SQL compensatório](../../../scripts/homologacao-pg17/reverter-central-atendente-homolog.sql) somente no destino
   autorizado. O SQL remove funções, triggers, índice e políticas da Central.
   Os pedidos, avisos, prazos gravados e histórico de migrations são preservados.
   Registrar a reversão e conferir as permissões e os fluxos legados. Uma
   reaplicação futura precisa reconciliar o histórico com os objetos existentes.

## Evidências locais

- 101/101 testes Node, incluindo segurança e regressões dos módulos relacionados.
- Typecheck sem erros. Guarda autorizou apenas o projeto de homologação.
- O preflight encontrou e corrigiu a checagem de bundle que, em ambiente Vercel,
  podia ler uma saída `.output` anterior. O verificador agora seleciona
  `.vercel/output` em Preview. O build final verificou 453 arquivos em `.vercel/output`, com 12 referências ao projeto de homologação e zero referências a produção.
- Oito cenários de navegador do checkpoint foram reaproveitados. Dois cenários
  direcionados ao bundle Vercel foram repetidos, cobrindo a separação e
  navegação H02/Central sem F5, os perfis interceptados e a recuperação de erro.
- Três migrations validadas anteriormente em PostgreSQL 17.11 descartável.
  A reversão compensatória foi exercitada em transação local com rollback,
  verificando a remoção dos objetos próprios e a preservação de prazos, avisos
  e políticas anteriores.

**Autorização pendente:** aplicar e registrar as três migrations, habilitar as
duas flags de Preview, preparar os perfis e pedidos de teste, integrar a branch
oficial, criar o deploy manual e atribuir o alias oficial ao SHA verificado.
As autorizações para o Estoque e para produção permanecem fora desta etapa.
