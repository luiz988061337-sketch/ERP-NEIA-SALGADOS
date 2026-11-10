import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/historia")({
  head: () => ({ meta: [{ title: "Nossa História — Néia Salgados" }] }),
  component: () => {
    const navigate = useNavigate();
    useEffect(() => {
      navigate({ to: "/", replace: true });
    }, [navigate]);
    return null;
  },
});

function Historia() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-3xl">Néia Salgados — feita de sonhos, família e muito amor.</h1>
      <p className="mt-4 whitespace-pre-line text-muted-foreground">
        {`Por trás de cada salgado existe uma história.

A Néia Salgados nasceu do sonho de uma mãe que, entre sua profissão, seus desafios e seus sonhos, acreditou que era possível construir algo especial.

Ao seu lado, um pai com metas, determinação e vontade de crescer. E junto deles, filhos dispostos a ajudar, aprender e fazer parte dessa caminhada.

Foi assim, com trabalho, união e, principalmente, amor pela família, que um sonho foi crescendo e se transformando em algo muito maior.

Cada pedido, cada cliente e cada conquista fazem parte dessa história.

Hoje, a Néia Salgados não é apenas uma empresa. É o resultado de uma família que decidiu acreditar, trabalhar e construir juntos.

E é esse carinho que queremos levar até você em cada pedido.

Néia Salgados — o sabor que faz a diferença. ❤️`}
      </p>
      <p className="mt-6 font-display text-xl">“Por trás de cada sabor, existe uma família. Por trás de cada pedido, existe um sonho.”</p>
    </div>
  );
}
