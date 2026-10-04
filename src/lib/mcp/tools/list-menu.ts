import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_menu",
  title: "List menu",
  description: "List available Néia Salgados menu items with prices, optionally filtered by name.",
  inputSchema: { search: z.string().trim().max(100).optional().describe("Part of the product name.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search }, ctx) => {
    let q = supabaseForUser(ctx)
      .from("produtos")
      .select("id, nome, descricao, preco, preco_promocional, promo_ativo, unidade_medida")
      .eq("disponivel", true)
      .order("nome")
      .limit(100);
    if (search) q = q.ilike("nome", `%${search}%`);
    const { data, error } = await q;
    if (error) throw new ToolError(error.message);
    const items = (data ?? []).map((p) => ({
      id: p.id,
      nome: p.nome,
      descricao: p.descricao,
      preco: Number(p.promo_ativo && p.preco_promocional ? p.preco_promocional : p.preco),
      unidade: p.unidade_medida,
    }));
    return { content: [{ type: "text", text: JSON.stringify(items) }], structuredContent: { items } };
  },
});
