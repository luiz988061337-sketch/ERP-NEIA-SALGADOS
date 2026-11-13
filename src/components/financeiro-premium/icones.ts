import { createLucideIcon } from "lucide-react";

// Pilhas de moedas da identidade da referência, em SVG (não é imagem da tela).
export const Moedas = createLucideIcon("Moedas", [
  ["ellipse", { cx: "8", cy: "13", rx: "6", ry: "2.5", key: "base" }],
  ["path", { d: "M2 13v6c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-6M2 16c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5", key: "base-lines" }],
  ["ellipse", { cx: "16", cy: "4.5", rx: "6", ry: "2.5", key: "top" }],
  ["path", { d: "M10 4.5V10M22 4.5V14c0 1.4-2.7 2.5-6 2.5M10 8c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5M16 13.5c3.3 0 6-1.1 6-2.5", key: "top-lines" }],
]);
