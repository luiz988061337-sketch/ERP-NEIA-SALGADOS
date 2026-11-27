# Correção B7 — agendamentos e reserva física

Data: 27/11/2026. Worktree isolada `estoque-operacional-vinculos`, checkpoint
`fcd7f052fa9f6a7a177e70cf59a2eb4055856e06` preservado. **Rascunho local:** não
aplicar em homologação nem produção; nenhum arquivo foi criado em
`drizzle/migrations`.

## 1. Bloqueador tratado

A definição efetiva de `public.criar_pedido_com_reserva(uuid,text,jsonb,jsonb)`
hoje vem de `0103_entrega_por_km.sql` (a `0095` define a mesma assinatura, mas é
substituída). Ela aceita `agendado_para` futuro em `p_dados` (`0103:555-563`),
grava o valor no `INSERT` do pedido (`0103:996`) e chama
`reservar_pedido_atomico` no nascimento (`0103:1051`). A `0089` debita
`produtos.estoque` e grava reserva física. Isso contraria as decisões aprovadas
em `docs/projeto-diretor/estoque-salgados/decisoes-operacionais-27-11-2026.md`:
data futura é compromisso, não reserva; pedido pendente não gera cobrança nem
reserva definitiva; pagamento só após aprovação.

## 2. Desenho da corretiva

Arquivo: `scripts/estoque-operacional/correcao-b7-agendamentos-rascunho.sql`.

1. **Feature flag desligada por padrão.** `public.salgados_b7_config` com
   `habilitado = false`; somente `configurar_b7_salgados(boolean)`, que exige
   `admin`, pode alterá-la. Sem habilitação explícita a função base é a única
   autoridade, inclusive para mensagens de erro.
2. **Base preservada.** A RPC vigente é renomeada para
   `criar_pedido_com_reserva_base` e o wrapper mantém a assinatura pública.
   Nenhuma validação financeira, de entrega ou de idempotência é duplicada.
   `0095`, `0103`, `0089`, `0129` e `0133` não são modificadas.
3. **Venda imediata:** sem `agendado_para` no futuro, delegação integral à base.
   Reserva única, sem registro operacional novo.
4. **Agendamento com cobertura física:** a cobertura é calculada por sabor
   canônico como `lotes não vencidos - reservas ativas não consumidas - margem
   individual + liberação vigente`, respeitando bloqueios na data. A base cria
   o pedido (com `agendado_para` no próprio `INSERT`) e a única reserva; o
   wrapper grava `salgados_agendamentos_b7` com
   `situacao = 'reserva_fisica_protegida'`. **Não há UPDATE em `pedidos`**, logo
   `pedidos_guard_update` permanece intacto.
5. **Agendamento sem cobertura confirmada:** **nenhum pedido, nenhuma reserva e
   nenhuma cobrança**. O wrapper grava o checkout em
   `salgados_agendamentos_b7` (`analise_pendente`) e abre uma
   `salgados_solicitacoes` por sabor, com `chave_idempotencia` determinística.
   Resposta: `analise_necessaria`, estável em reenvio com o mesmo `p_id` e payload.
   Payload divergente para o mesmo `p_id` responde `idempotencia_divergente`.
   Produtos fora dos 26 sabores canônicos preservam o fluxo da base.
6. **Aprovação ou recusa:** `registrar_compromisso_aprovado_b7(uuid, uuid)`,
   somente para responsável autorizado, exige todas as solicitações decididas;
   recusas encerram o agendamento sem criar compromisso. A aprovação chama
   `registrar_compromisso_futuro_b7`, com as mesmas regras da `0129` (papel,
   bloqueio, idempotência, locks), e grava `salgados_compromissos` com
   `pedido_id = NULL` — a coluna já é nullable na `0129` e não existe pedido
   antes da aprovação. Nenhum lote ou saldo é criado.
7. **Ciclo completo:** `vincular_pedido_compromisso_b7` liga os compromissos ao
   pedido definitivo criado depois da aprovação, sem UPDATE de valor/status;
   `converter_compromisso_reserva_b7` transforma compromisso **coberto por lote
   real** em reserva física pela RPC canônica `reservar_sabor_estoque` (FEFO),
   usando chave de idempotência — o compromisso deixa de contar como futuro
   antes da reserva entrar, evitando dupla dedução; `cancelar_compromisso_b7`
   cancela compromissos e libera reservas convertidas com
   `liberar_reserva_sabor`, preservando o histórico. Todas são idempotentes e
   exigem responsável autorizado.
8. **Segurança:** tabelas com RLS e sem grants para `anon`/`authenticated`;
   `configurar_b7_salgados`, `registrar_compromisso_aprovado_b7`,
   `vincular_pedido_compromisso_b7`, `converter_compromisso_reserva_b7` e
   `cancelar_compromisso_b7` são concedidas a `authenticated`, com verificação
   de papel no corpo. O auxiliar `registrar_compromisso_futuro_b7` permanece
   revogado e é chamado apenas pelo definer. O rename preserva o OID da RPC
   original; por isso o `EXECUTE` que a `0133` concedeu a `authenticated` é
   explicitamente revogado de `criar_pedido_com_reserva_base`, que fica
   acessível somente ao wrapper.

## 3. Numeração e convivência com `0134`–`0136` do Codex

O topo oficial é `4c703e4` (“Prepara homologação final da Central da
Atendente”). Já estão publicadas e aplicadas em homologação as migrations
`0134` (prazo comercial), `0135` (alertas Realtime de Entregas) e `0136`
(quitação na retirada). A `0134` altera apenas funções/gatilhos de prazo
comercial e a vinculação de `pedidos_guard_update_trg`; a `0135` cria policies
de `realtime.messages`; a `0136` cria `consultar_recebimento_retirada(uuid)` e o
gatilho `exigir_quitacao_para_retirada`. **Nenhuma** altera
`criar_pedido_com_reserva`, `reservar_pedido_atomico`, `0129`, `0133`, grants de
reserva nem o corpo da guarda. A corretiva permanece como **rascunho sem
numeração definitiva** — `0135` e `0136` estão ocupadas; a numeração será
coordenada com o Codex (a partir de `0137`), sem renomear ou duplicar migrations
publicadas. O ensaio local não instalou `0134`–`0136` porque a `0134` exige
`current_user = 'postgres'` e a assinatura exata da guarda em homologação; a
convivência foi conferida por inspeção estática e deve ser reconferida no
catálogo real antes da aplicação autorizada.

## 4. Ensaio local (PostgreSQL 17.11 descartável)

Comando:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File 'scripts\estoque-pg17\executar-b7.ps1' -Scratch 'C:\Users\User\AppData\Local\Temp\opencode'
```

Sequência: plataforma sintética → migrations locais até `0133` → `0129`/`0133`
→ fixture → corretiva → `b7-setup.sql` → `b7-testes.sql` → reversão duas vezes
→ `b7-verificar.sql`. Resultado: **`B7 PG17 OK`**. Evidência:
`C:\Users\User\AppData\Local\Temp\opencode\neia-b7-pg17-59b79dfb4c04431194cf7aae346003e3\sql.log`.

Casos novos verificados (sem repetir suítes já aprovadas):

| Caso | Resultado |
| --- | --- |
| Imediato com cobertura | pedido `criado`, uma reserva, nenhum agendamento registrado. |
| Agendado com cobertura | `reserva_fisica_protegida`, uma reserva, data no pedido e no registro, retry `ja_criado`, nenhum UPDATE em pedido. |
| Agendado sem cobertura | `analise_necessaria`, retry estável, zero pedido, zero reserva, uma solicitação por sabor; cliente não consegue registrar compromisso. |
| Aprovação e compromisso | responsável aprova; `ok`, retry `ja_registrado`, um compromisso pendente com `pedido_id = NULL`, nenhum lote fictício. |
| Recusa | solicitação recusada → `recusado`, nenhum compromisso criado. |
| Pedido definitivo e vínculo | criado depois da aprovação, sem pagamento; `vincular_pedido_compromisso_b7` → `ok`, retry `ja_vinculado`, compromisso aponta para o pedido. |
| Cobertura real e conversão | entrada de 120 unidades cobre o compromisso; conversão → `ok`, retry `ja_registrado`, uma reserva FEFO, `compromissos_futuros = 0` e `reservado = 10` (sem dupla dedução). |
| Cancelamento e liberação | `ok`, retry `ja_cancelado`, reserva `liberada`, compromisso `cancelado`. |
| Retirada parcial/FEFO/devolução | reserva escolhe o lote mais antigo, consumo parcial mantém a reserva ativa, devolução libera o restante e o físico fica 140. |
| Flag desligada | volta ao comportamento da base para pedido agendado, sem novo registro operacional. |
| Isolamento da base | `authenticated` recebe `insufficient_privilege` ao chamar `criar_pedido_com_reserva_base` diretamente. |
| Reversão | executada duas vezes; flag desligada, RPCs novas sem `EXECUTE` de `authenticated`, histórico preservado. |

## 5. Reversão

`scripts/reverter-correcao-b7-agendamentos.sql`: desliga a flag (o wrapper passa
a delegar integralmente à base) e revoga `EXECUTE` das RPCs novas. Não há
`DELETE`, `DROP`, alteração de pedidos, reservas, solicitações, compromissos,
lotes ou histórico. Idempotente e testada duas vezes no mesmo ensaio.

## 6. Dependências do Codex (não editadas nesta worktree)

- `src/lib/criacao-atomica.ts:323-410`: `interpretarCriacao` não conhece
  `analise_necessaria` e hoje a transforma em `resposta_invalida`. É necessário
  aceitar o status e devolvê-lo sem `pedidoId`, sem cobrança e sem mensagem de
  “estoque esgotado”. `idempotencia_divergente` já é reconhecido.
- `src/routes/checkout.tsx`, `src/routes/pdv.tsx` e `src/routes/atendente.tsx`:
  tratar `analise_necessaria` como “aguardando aprovação”, sem redirect para
  pedido inexistente e sem pagamento. O PDV envia `agendado_para` e
  `pagamento_imediato`; nenhum dos dois pode ser considerado concluído nesse
  caminho.
- Central da Atendente: manter a pendência de incluir `salgados_resposta` no
  filtro de notificações e, se desejado, consumir
  `salgados_agendamentos_b7.data_solicitada` para exibir a data agendada.
- `src/integrations/supabase/types.ts`: regenerar somente depois da migration
  autorizada; incluir `configurar_b7_salgados(boolean)`,
  `registrar_compromisso_aprovado_b7(uuid,uuid)`,
  `vincular_pedido_compromisso_b7(uuid,uuid,uuid)`,
  `converter_compromisso_reserva_b7(uuid,uuid,uuid)` e
  `cancelar_compromisso_b7(uuid,text,uuid)`. O auxiliar
  `registrar_compromisso_futuro_b7(text,integer,date,uuid,text)` é interno e não
  deve aparecer como RPC de cliente.
- Nenhuma flag de build foi alterada; a ativação da corretiva exige autorização
  expressa e validação no banco de homologação.

## 7. Pendências reais

- Autorização para definir a numeração (livre a partir de `0137`) e aplicar a
  corretiva em homologação, com destino declarado e barreira de ambientes;
  nada foi escrito em banco remoto.
- Conferência do catálogo real após `0134`/`0135`/`0136` e validação das
  assinaturas da guarda, das policies de Realtime e do gatilho de quitação antes
  de qualquer aplicação.
- Interface e interpretação de `analise_necessaria` dependem do Codex; uma
  demonstração SQL não caracteriza a funcionalidade como operacional.
- `types.ts` e os componentes do Codex permanecem intocados nesta frente.
