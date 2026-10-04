import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_my_orders",
  title: "List my orders",
  description: "List the signed-in customer's recent orders with number, status and total.",
  inputSchema: { limit: z.number().int().min(1).max(50).optional().describe("How many orders (default 10).") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    const { data, error } = await supabaseForUser(ctx)
      .from("pedidos")
      .select("id, numero, status, total, created_at")
      .eq("user_id", ctx.getUserId()!)
      .order("created_at", { ascending: false })
      .limit(limit ?? 10);
    if (error) throw new ToolError(error.message);
    const orders = (data ?? []).map((p) => ({
      id: p.id,
      numero: p.numero,
      status: p.status,
      total: Number(p.total),
      criado_em: p.created_at,
    }));
    return { content: [{ type: "text", text: JSON.stringify(orders) }], structuredContent: { orders } };
  },
});
