import fs from "node:fs";
const p = "src/routes/preview-l2-producao.tsx";
let s = fs.readFileSync(p, "utf8");
const mapa = {
  'id: "pd6"': 'id: "pd6", pronto_em: ha(12)',
  'id: "pd7"': 'id: "pd7", pronto_em: ha(8)',
  'id: "pd8"': 'id: "pd8", pronto_em: ha(4)',
};
for (const [a, b] of Object.entries(mapa)) {
  if (!s.includes(a)) throw new Error("nao achou " + a);
  s = s.replace(a, b);
}
fs.writeFileSync(p, s, "utf8");
console.log("pronto_em adicionado nas fixtures");
