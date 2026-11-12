import fs from "node:fs";
const p = "src/routes/preview-l2-producao.tsx";
let s = fs.readFileSync(p, "utf8");
// Pedidos prontos recebem a conferencia final (como a cozinha registra ao finalizar).
const mapa = {
  'id: "pd6"': 'id: "pd6", conferido_em: ha(14), conferido_por: null',
  'id: "pd7"': 'id: "pd7", conferido_em: ha(10), conferido_por: null',
  'id: "pd8"': 'id: "pd8", conferido_em: ha(6), conferido_por: null',
};
for (const [a, b] of Object.entries(mapa)) {
  if (!s.includes(a)) throw new Error("nao achou " + a);
  s = s.replace(a, b);
}
fs.writeFileSync(p, s, "utf8");
console.log("conferido_em adicionado nas fixtures prontas");
