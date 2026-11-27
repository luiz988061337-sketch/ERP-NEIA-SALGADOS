# Contrato de integração — “Estoque do dia” (Codex)

Data: 27/11/2026. Branch isolada `estoque-operacional-vinculos`, base `9cab907`.

**Status:** contrato preservado como especificação futura. Por decisão do
proprietário, a implementação adicional da interface “Estoque do dia” — inclusive
entrada no menu lateral, painel lateral e atalhos — está **adiada**. Nenhuma tela,
navegação, layout aprovado ou atalho foi alterado nesta worktree.

As migrations `0129`/`0133` **não foram aplicadas em ambiente remoto**, a carga
exemplificativa **não foi executada em ambiente remoto**, os tipos do Supabase
**não foram regenerados** e nenhuma interface foi modificada. Este documento é
uma especificação para o Codex, não comprovação de funcionamento em homologação.
A rota `/atendente` já existe no ERP (`src/routes/atendente.tsx`) e permanece
intocada; o link genérico das notificações aponta para ela.

## 1. Superfície entregue

| Arquivo | Papel |
| --- | --- |
| `src/lib/estoque-dia.ts` | Contratos puros, nomes das RPCs e classificadores. Não consulta banco, não calcula saldo, não instancia cliente e não tem efeito na importação. |
| `drizzle/migrations/0129_vinculos_operacionais_salgados.sql` | View canônica `public.vw_saldos_sabores_estoque`, tabelas operacionais e 14 RPCs. Não aplicada. |
| `drizzle/migrations/0133_acl_reserva_estoque_dia.sql` | Reconciliação de `EXECUTE` das duas RPCs de reserva. Não aplicada em ambiente remoto. Renumerada para não colidir com `0130`–`0132` da Central da Atendente. |
| `scripts/carga-exemplo-salgados-homolog.sql` | Carga exemplificativa idempotente, somente homologação autorizada. |
| `scripts/reverter-carga-exemplo-salgados-homolog.sql` | Reversão compensatória auditada da carga, sem `DELETE`. |

A fonte de verdade é o banco (`view` + RPCs). O módulo TypeScript apenas tipa e
classifica a resposta. **Não calcular disponibilidade, margem, validade ou
compromisso no front-end.**

## 2. RPCs canônicas

| RPC (`public.`) | Uso |
| --- | --- |
| `consultar_estoque_dia_salgados(p_data)` | Painel “Estoque do dia” na sequência dos 26 sabores. |
| `avaliar_venda_salgado(p_chave, p_quantidade, p_data, p_pedido_id)` | Viabilidade antes da confirmação e revalidação atômica. |
| `avaliar_preparo_salgado(...)` | Avaliação de preparo/produção. |
| `reservar_sabor_estoque(...)` | Reserva física somente para hoje; data futura retorna `analise_necessaria`. |
| `liberar_reserva_sabor(...)` | Liberação de reserva do mesmo sabor. |
| `solicitar_salgado(...)` | Conferência, liberação excepcional ou análise de agendamento. |
| `responder_solicitacao_salgado(...)` | Decisão integral/parcial/recusa, com justificativa e registro de horários. |
| `reconhecer_resposta_salgado(p_solicitacao_id)` | Reconhecimento individual pela atendente. |
| `usar_autorizacao_salgado(...)` | Consumo pontual e de uso único da liberação, revalidando cobertura física. |
| `bloquear_sabor_salgados(...)` | Bloqueio por sabor, data e período com motivo e responsável. |
| `desbloquear_sabor_salgados(...)` | Desbloqueio com histórico. |
| `registrar_compromisso_salgado(...)` | Agendamento futuro: compromisso, nunca lote ou estoque fictício. |
| `configurar_salgado_estoque(...)` | Margem individual, estoque mínimo, inventário e foto. |
| `configurar_modo_salgados(...)` | `monitoramento` (padrão), `validacao_assistida`, `controle_operacional`. |

`reservar_estoque_atomica` e `reservar_pedido_atomico` permanecem intactas; a
`0133` apenas devolve `EXECUTE` a `authenticated` quando owner, `SECURITY
DEFINER`, `search_path=public`, RLS, `has_role` e `auth.uid()` são confirmados.
`PUBLIC`, `anon` e `service_role` continuam sem acesso. Ordem coordenada de
aplicação: `0129` revisada → `0130`/`0131`/`0132` da Central da Atendente →
`0133`. A branch do Codex não foi alterada.

## 3. Contrato de leitura

`consultar_estoque_dia_salgados` devolve
`{ status, data, modo, habilitado, itens }`. Em `status: "permissao_negada"`,
**não renderizar zeros**: exibir falha técnica.

`ItemEstoqueDia` (todos os campos vêm da RPC):

- Identidade/apresentação: `chave`, `categoria`, `nome`, `imagem_url`, `ordem`, `produto_id`.
  A ordem é a canônica de `sabores_estoque.ordem` (1–26); a foto vem de
  `imagem_url` com fallback para configuração e produto. **Não criar ordem paralela nem novo sabor.**
- Físico e reserva: `fisico`, `reservado`, `disponivel`, `vencidos`, `proxima_validade`, `inventariado`.
- Margem e compromissos: `margem_seguranca`, `estoque_minimo`, `compromissos_futuros`.
- Imediato e por data: `disponivel_imediato`, `data`, `compromissos_na_data`, `liberacao_ativa`, `disponivel_na_data`, `bloqueado_na_data`.
- Sinalização: `situacao`, `bloqueado_hoje`, `solicitacoes_pendentes`, `atualizado_em`.

`situacao` é uma de: `nao_inventariado`, `divergencia`, `bloqueado`,
`conferencia_vencidos`, `margem_atingida`, `operacional`. Vencidos continuam
visíveis para alerta; estoque mínimo é separado da margem de segurança.

## 4. Classificação visual obrigatória

Use `classificarViabilidade(status)` e `classificarErroConsultaEstoque(motivo)`
de `src/lib/estoque-dia.ts`. Nunca reclassificar no componente.

| Status da RPC | `classe` | Confirmação automática | Encaminhar |
| --- | --- | --- | --- |
| `disponivel` | `disponivel` | sim | não |
| `analise_necessaria` | `analise` | não | sim |
| `margem_atingida` | `margem_atingida` | não | sim |
| `indisponivel` | `indisponivel_real` | não | sim |
| `bloqueado` | `bloqueado` | não | sim |
| `nao_inventariado` | `analise` | não | sim |
| `divergencia` | `analise` | não | sim |
| `sabor_inexistente`, `permissao_negada`, `dados_invalidos` | `erro_tecnico` | não | sim |

Erros de transporte (`rpc_indisponivel`, `rpc_sem_permissao`,
`nao_autenticado`, `erro_rede`, `resposta_invalida`) também são
`erro_tecnico`. Regra textual: **“não interpretar como estoque esgotado”**.
Um sabor em análise, divergência ou bloqueio não impede a venda dos demais.

`rotuloModoOperacao(modo, habilitado)` deve ser usado no cabeçalho: sem
habilitação explícita, o rótulo é `Monitoramento — consulta sem bloqueio
automático`. Ativar/desativar modo não pode remover proteções essenciais.

## 5. Fluxos

### 5.1 Venda e confirmação
1. Consultar/avaliar com chave canônica, quantidade e data.
2. `disponivel` → seguir com a reserva já integrada (`reserva-integracao.ts`).
3. `analise_necessaria` / `nao_inventariado` / `divergencia` / `margem_atingida`
   → abrir solicitação; **não** confirmar pagamento nem gerar reserva nova.
4. Na confirmação efetiva, revalidar com `avaliar_venda_salgado` e usar apenas
   autorização com cobertura física (`fisico - reservado >= quantidade`).
5. Repetição segura com a mesma chave de idempotência não duplica reserva,
   baixa, cobrança nem pedido.

Datas futuras são compromissos (`registrar_compromisso_salgado`), não reserva
física: a entrada real cobre a obrigação sem criar lote fictício e a
disponibilidade é revalidada na confirmação. `reservar_sabor_estoque` com data
futura responde `analise_necessaria` **sem criar, alterar ou cancelar reserva
alguma**; isso não impede o agendamento legítimo — a interface deve registrar o
compromisso e manter o pedido para atendimento assistido. Reservas já aprovadas
para a data corrente permanecem intactas.

### 5.2 Solicitação, resposta e notificação
- `solicitar_salgado` registra tipo, sabor, quantidade, justificativa,
  solicitante, pedido, data e chave de idempotência.
- A resposta grava **um** evento genérico em `notificacoes`
  (`tipo = 'salgados_resposta'`, texto sem dado sensível, `link = '/atendente'`).
  Detalhes ficam em `vw_salgados_notificacoes_atendente`, visível apenas ao
  solicitante e ao responsável autorizado.
- O Codex deve incluir `salgados_resposta` no filtro da Central da Atendente
  (hoje só `pedido_pronto_caixa` e `pedido_liberado_retirada`).
- Som: padrão do sistema, volume 75%, repetição após 30 s até reconhecimento.
- `reconhecer_resposta_salgado` marca `ack_por`/`ack_em` individualmente, sem
  apagar ou alterar o evento global e sem duplicar notificação.

### 5.3 Autorização
`responder_solicitacao_salgado` pode aprovar integral, parcial ou recusar, com
justificativa, quantidades e responsável. `usar_autorizacao_salgado` consome
uma vez, revalida cobertura física e expira; não altera a margem nem cria
saldo. Atendente não pode ignorar bloqueio nem usar autorização sem cobertura.

### 5.4 Bloqueios e movimentação
Bloqueios são por sabor/data/período, com motivo, responsável, desbloqueio e
histórico; pedidos já confirmados não são cancelados por um bloqueio novo.
`movimentar_lote_salgado` é a única via de entrada/perda/inventário/retirada;
ajuste com alvo zero é auditado com `quantidade = 0` apenas para sabor, sem
flexibilizar a restrição `quantidade > 0` de produto. A reversão da carga usa
o mesmo lote e `p_saldo_esperado`; divergência aborta toda a operação.

## 6. Permissões

| Perfil | Acesso |
| --- | --- |
| Atendente | Consultar; solicitar; receber e reconhecer respostas. |
| Caixa/PDV | Consultar; solicitar. |
| Produção/Cozinha | Consultar físico e reservado; conferir como responsável autorizado. |
| Responsável autorizado | Conferir, autorizar/recusar, ajustar com justificativa. |
| Administrador | Controle integral, margens, modo e auditoria. |
| Motoboy | Sem acesso ao estoque. |

Views e helpers filtram por papel funcional mesmo com `GRANT ... TO
authenticated`, porque view roda com owner e não herda RLS. Dados detalhados de
solicitação não são expostos a qualquer usuário autenticado.

## 7. Limites de edição do Codex

Por decisão do proprietário, a implementação da interface “Estoque do dia” fica
pendente para etapa futura. Nesta etapa o Codex deve preservar a Central da
Atendente, o PDV, o checkout e o menu lateral já aprovados; inclusive a rota
`/atendente` existe e não deve ser recriada. Quando a interface for autorizada,
o Codex será dono dela. **Não editar** nesta worktree: `src/components/central-pedidos.tsx`,
`src/routes/pdv.tsx`, `src/routes/checkout.tsx`, `src/components/admin/admin-shell.tsx`,
`src/components/admin/admin-nav.ts`, `src/routes/admin.tsx`, CSS aprovado em
`src/components/admin/estoque/`, `src/integrations/supabase/client.ts`,
`src/integrations/supabase/types.ts`, wrappers/gates do Codex, cardápio público
nem menu lateral. `types.ts` só é regenerado depois da migration autorizada.

## 8. Critérios de aceite futuros do Codex (pendência registrada)

Não são critérios desta etapa. Quando a interface for autorizada, cobrir:
venda com estoque suficiente, na margem e não inventariado; divergência; falha
de comunicação com banco; timeout de RPC; falha de permissão; falha de Realtime;
falha da Néia Inteligência; agendamento dependente de fabricação; compra de
outros sabores com um sabor bloqueado; recuperação de conexão; repetição sem
cobrança ou reserva duplicada; ativação e desativação seguras; regressão de
site, PDV e Central da Atendente. Falha de Néia/Realtime não pode perder
carrinho nem duplicar pedido.

## 9. Pendências

- Migrations `0129`/`0133` não aplicadas em ambiente remoto; ACL real da `0133`
  não confirmada em homologação.
- `src/integrations/supabase/types.ts` não regenerado; o arquivo pertence ao
  Codex e o schema sintético local não substitui o schema do Supabase.
- Interface “Estoque do dia”, entrada no menu lateral, painel lateral e atalhos:
  **adiados por decisão do proprietário**; nenhuma alteração de UI autorizada.
- Locks, rollback, RLS e concorrência multi-sessão: validar em PostgreSQL real
  descartável antes de qualquer homologação (resultado registrado no relatório).
- Nenhum resultado visual de homologação; publicação exige autorização expressa,
  especialmente enquanto existir risco conhecido de bloqueio comercial indevido.
