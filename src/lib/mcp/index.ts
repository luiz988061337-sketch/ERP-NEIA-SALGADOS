import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listMenu from "./tools/list-menu";
import listMyOrders from "./tools/list-my-orders";

const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "pixel-perfect-replica",
  title: "Pixel Perfect Replica",
  version: "0.1.0",
  instructions:
    "Tools for the Néia Salgados delivery app. Use `list_menu` to browse products and prices, and `list_my_orders` to see the signed-in customer's orders and their status.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listMenu, listMyOrders],
});
