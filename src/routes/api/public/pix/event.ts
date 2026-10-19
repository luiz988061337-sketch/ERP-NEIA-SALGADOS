import { createFileRoute } from "@tanstack/react-router";
import { decidirDestinoPix, normalizarValor } from "@/lib/pix-reader";

/**
 * POST /api/public/pix/event — Etapa J.1, leitor de PIX (Android).
 * Autentica por aparelho: device_id (text) + token (hash no banco).
 * Aparelho desconhecido/sem token → 403 (evento recusado, nada é gravado).
 * Regra de negócio: 1 pedido PIX pendente com o mesmo valor → confirma
 * (pagamento_status=pago, o trigger 0073 imprime); 0 ou 2+ → CONFERIR,
 * nunca confirma sozinho. Idempotente por event_hash.
 */
export const Route = createFileRoute("/api/public/pix/event")({
  server: {
    handlers: {
      GET: async () =>
        Response.json({
          ok: true,
          servico: "pix-event",
          formato: {
            device_id: "text do aparelho (pix_reader_devices.device_identifier)",
            token: "token do aparelho (conferido via sha256)",
            amount: "number, ex. 46.00",
            sender_name: "opcional",
            notification_title: "opcional",
            notification_text: "opcional",
            source_app: "opcional",
            bank_name: "opcional",
            detected_at: "opcional, ISO",
            event_hash: "opcional, dedup",
          },
        }),
      POST: async ({ request }: { request: Request }) => {
        let body: any;
        try {
          body = await request.json();
        } catch {
          return Response.json({ ok: false, erro: "json_invalido" }, { status: 400 });
        }

        const device_id = String(body?.device_id ?? body?.deviceId ?? "").trim();
        const token = String(body?.token ?? "");
        const amount = Number(body?.amount ?? body?.valor);
        if (
          device_id.length < 3 ||
          !token ||
          token.length < 8 ||
          !Number.isFinite(amount) ||
          amount <= 0
        ) {
          return Response.json({ ok: false, erro: "payload_invalido" }, { status: 400 });
        }
        const valor = normalizarValor(amount);
        const sender = String(body?.sender_name ?? body?.sender ?? "").slice(0, 120);
        const title = String(body?.notification_title ?? "").slice(0, 200);
        const text = String(body?.notification_text ?? "").slice(0, 500);
        const source_app = String(body?.source_app ?? "neia-pix-reader").slice(0, 80);
        const bank_name = String(body?.bank_name ?? "").slice(0, 80);
        const detected_at = String(body?.detected_at ?? new Date().toISOString());

        const { createHash, timingSafeEqual } = await import("node:crypto");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db: any = supabaseAdmin as any;
        const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

        // 1. Aparelho cadastrado, ativo e com token?
        const dev = await db
          .from("pix_reader_devices")
          .select("device_identifier,status,revoked_at,token_hash")
          .eq("device_identifier", device_id)
          .maybeSingle();
        const d = dev.data as any;
        if (dev.error || !d || d.status !== "ACTIVE" || d.revoked_at || !d.token_hash) {
          return Response.json({ ok: false, erro: "aparelho_nao_cadastrado" }, { status: 403 });
        }
        let tokenOk = false;
        try {
          tokenOk = timingSafeEqual(
            Buffer.from(sha(token), "utf8"),
            Buffer.from(String(d.token_hash), "utf8"),
          );
        } catch {
          tokenOk = false;
        }
        if (!tokenOk) {
          return Response.json({ ok: false, erro: "token_invalido" }, { status: 403 });
        }
        try {
          await db
            .from("pix_reader_devices")
            .update({ last_seen_at: new Date().toISOString() })
            .eq("device_identifier", device_id);
        } catch {
          /* best-effort */
        }

        // 2. Dedup por event_hash.
        const event_hash =
          String(body?.event_hash ?? "").length >= 8
            ? String(body.event_hash)
            : sha(`${device_id}|${valor.toFixed(2)}|${sender}|${detected_at}|${title}|${text}`);
        const dup = await db
          .from("pix_notification_events")
          .select("id,status")
          .eq("event_hash", event_hash)
          .maybeSingle();
        if (!dup.error && dup.data) {
          return Response.json({ ok: true, duplicado: true, status: (dup.data as any).status });
        }

        // 3. Grava evento PENDENTE (só o servidor escreve — RLS nega insert do app).
        const ins = await db
          .from("pix_notification_events")
          .insert({
            event_hash,
            source_app,
            bank_name: bank_name || null,
            notification_title: title || "PIX recebido",
            notification_text: text || `PIX ${sender} R$ ${valor.toFixed(2)}`,
            amount: valor,
            sender_name: sender || null,
            detected_at,
            status: "PENDENTE",
            device_identifier: device_id,
          })
          .select("id")
          .single();
        if (ins.error || !ins.data) {
          // Corrida de dedup (unique) → trata como duplicado.
          if (String(ins.error?.code ?? "") === "23505") {
            return Response.json({ ok: true, duplicado: true });
          }
          return Response.json({ ok: false, erro: "falha_gravar_evento" }, { status: 500 });
        }
        const eventId = (ins.data as any).id as string;

        // 4. Candidatos: PIX pendentes, não cancelados, valor próximo.
        // Forma filtrada no banco (só Pix entra no auto-confirm).
        const cand = await db
          .from("pedidos")
          .select("id,numero,total,forma_pagamento,pagamento_status,status")
          .eq("pagamento_status", "pendente")
          .eq("forma_pagamento", "pix")
          .neq("status", "cancelado")
          .gte("total", valor - 0.01)
          .lte("total", valor + 0.01)
          .order("created_at", { ascending: false })
          .limit(10);
        const lista = ((cand.data ?? []) as any[]).map((p) => ({
          id: String(p.id),
          total: Number(p.total),
          forma_pagamento: p.forma_pagamento,
          pagamento_status: p.pagamento_status,
          status: p.status,
        }));
        const decisao = decidirDestinoPix(lista, valor);

        if (decisao.acao === "confirmar") {
          const agora = new Date().toISOString();
          // Baixa ATÔMICA e autossuficiente (Etapa 1.43/B): numa ÚNICA
          // instrução exige pagamento ainda 'pendente' E o pedido NÃO cancelado.
          // Não depende da leitura anterior dos candidatos (que é apenas uma
          // pista): se o pedido foi cancelado entre a leitura e a baixa (ex.:
          // 0093 cancelar_pedido_atomico), o próprio UPDATE deixa de casar e 0
          // linhas são retornadas. O .select("id") comprova exatamente 1 linha
          // afetada (sem .select a confirmação seria cega).
          const up = await db
            .from("pedidos")
            .update({ pagamento_status: "pago", pagamento_em: agora })
            .eq("id", decisao.pedidoId)
            .eq("pagamento_status", "pendente")
            .neq("status", "cancelado")
            .select("id");
          if (up.error || (Array.isArray(up.data) && up.data.length === 0)) {
            // Conflito (cancelamento concorrente, baixa já feita, etc.): NÃO
            // confirmar. Reavaliar o estado atual para registrar um motivo fiel
            // e PRESERVAR a evidência do PIX para conciliação financeira
            // (o evento permanece, só muda de status; nada é descartado).
            const atual = await db
              .from("pedidos")
              .select("status")
              .eq("id", decisao.pedidoId)
              .maybeSingle();
            const st = (atual.data as { status?: string } | null)?.status ?? null;
            const motivo =
              st === "cancelado"
                ? "pedido_cancelado_antes_da_baixa"
                : "pedido_mudou_antes_da_baixa";
            await db
              .from("pix_notification_events")
              .update({
                status: "CONFERIR",
                conferencia_motivo: motivo,
                matched_order_id: decisao.pedidoId,
                processed_at: agora,
              })
              .eq("id", eventId);
            try {
              await db.from("admin_logs").insert({
                actor: null,
                acao: "pix_conflito_cancelamento",
                detalhe:
                  `pedido ${decisao.pedidoId} R$ ${valor.toFixed(2)} aparelho ${device_id} ` +
                  `motivo=${motivo} status=${st ?? "desconhecido"}`,
              });
            } catch {
              /* best-effort: a conferência já foi registrada em pix_notification_events */
            }
            return Response.json({
              ok: true,
              status: "CONFERIR",
              motivo,
            });
          }
          await db
            .from("pix_notification_events")
            .update({
              status: "PROCESSADO",
              matched_order_id: decisao.pedidoId,
              processed_at: agora,
            })
            .eq("id", eventId);
          try {
            await db.from("admin_logs").insert({
              actor: null,
              acao: "pix_auto_confirmado",
              detalhe: `pedido ${decisao.pedidoId} R$ ${valor.toFixed(2)} aparelho ${device_id}`,
            });
          } catch {
            /* best-effort */
          }
          // O trigger 0073 (pagamento→pago) enfileira o cupom.
          return Response.json({ ok: true, status: "PROCESSADO", pedido_id: decisao.pedidoId });
        }

        await db
          .from("pix_notification_events")
          .update({
            status: "CONFERIR",
            conferencia_motivo: decisao.motivo,
            processed_at: new Date().toISOString(),
          })
          .eq("id", eventId);
        return Response.json({
          ok: true,
          status: "CONFERIR",
          motivo: decisao.motivo,
          candidatos: decisao.candidatos,
        });
      },
    },
  },
});
