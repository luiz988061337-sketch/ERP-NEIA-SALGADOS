# WhatsApp Automático — Estado e Ativação (FASE 6)

## Estado atual: ESTRUTURA PRONTA, INTEGRAÇÃO DESATIVADA

A camada central de notificações (`src/lib/notificacoes.ts`) já coordena os dois
canais em TODAS as mudanças de status disparadas pela operação
(`admin.tsx`, `producao.tsx`, `motoboy.tsx`):

| Evento | Status | Mensagem (mensagemStatus) |
|---|---|---|
| Pedido recebido | `recebido` | "pedido foi recebido com sucesso" |
| Em preparação | `em_producao` | "está em produção" |
| Pronto | `pronto` / `aguardando_retirada` | "pronto para retirada" |
| Aguardando motoboy | `aguardando_motoboy` | "aguardando o motoboy" |
| Saiu para entrega | `em_rota` | "motoboy já saiu para entrega" |
| Entregue | `entregue` / `retirado` | "foi entregue/retirado. Obrigado!" |
| Cancelamento | `cancelado` | "foi cancelado" |

Push (web push) já está ATIVO para clientes que autorizaram.
WhatsApp automático está DESATIVADO (`WHATSAPP_AUTOMATICO_ENABLED = false`).

## Auditoria e idempotência (migration 0104 — NÃO aplicada no banco real)

`drizzle/migrations/0104_notificacoes_whatsapp.sql` cria `notificacoes_log`:
toda tentativa (canal, resultado, mensagem, telefone normalizado) é registrada
com chave única `pedido|status|canal|dia` — reenvios e refresh não duplicam
mensagens. RLS: só a equipe (roles) lê/escreve; anônimo: nada.

Se a migration não estiver aplicada, a auditoria é ignorada silenciosamente e a
operação continua normal (best-effort).

## Bloqueios para ativação do WhatsApp automático

1. **Provedor**: nenhuma API contratada. Recomendação técnica:
   WhatsApp Business Platform (Cloud API, oficial da Meta). Números Brasil:
   conversas de utilidade (transacionais) cobradas por mensagem (~R$ 0,03–0,42
   conforme faixa), com 1.000 conversas de serviço/mês gratuitas —
   para o volume típico da loja, o custo tende a ficar bem dentro dos R$ 200/mês
   orçados. **Valores precisam ser confirmados no contrato ativo da Meta antes
   de qualquer compromisso.**
2. **Credenciais** (configurar NO BACKEND/Edge Function, nunca em VITE_*):
   - `WHATSAPP_AUTOMATICO_ENABLED=on`
   - `WHATSAPP_API_URL` / `WHATSAPP_API_TOKEN`
   - `WHATSAPP_PHONE_NUMBER_ID`
3. **Modelos aprovados**: mensagens iniciadas pelo negócio fora da janela de 24h
   exigem templates aprovados pela Meta (categoria UTILITY). Textos prontos em
   `mensagemStatus()` servem de base para submissão.
4. **Número comercial**: deve ser verificado na plataforma oficial antes do envio.
5. **Edge Function**: criar `whatsapp-enviar` no Supabase chamando a Cloud API
   (o cliente NUNCA guarda token; `whatsapp-api.ts` já documenta o contrato).

## Regras já garantidas no código

- Nunca marca pagamento como aprovado por retorno de página.
- Nunca envia para cliente sem telefone válido.
- Transacionais (status do pedido) e promocionais (campanhas CRM) ficam em
  caminhos separados: `notificarPedido` vs `campanhas.tsx`/`crm_recipients`
  (respeita opt-out e intervalo mínimo entre campanhas).
- Enviar a clientes REAIS exige autorização explícita do dono — hoje nenhum
  envio real acontece (modo estrutural/simulado apenas).
