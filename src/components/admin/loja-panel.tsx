import type { FormEvent } from "react";
import { Link2, MapPin, Phone, Store } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MapView } from "@/components/map-view";
import { mascararCep } from "@/lib/cep";
import { enderecoLoja, type LojaConfig } from "@/lib/loja";

/**
 * Aba Loja. Mantem os mesmos campos, ids, placeholders, textos de ajuda e
 * handlers da versao anterior — a mudanca e apenas visual (cards + agrupamento).
 */
export function LojaPanel({
  lojaAtual,
  podeSalvar,
  cepLoja,
  setCepLoja,
  buscandoCep,
  localizando,
  setLoja,
  aplicarCep,
  localizarNoMapa,
  salvarLoja,
}: {
  lojaAtual: LojaConfig;
  podeSalvar: boolean;
  cepLoja: string;
  setCepLoja: (v: string) => void;
  buscandoCep: boolean;
  localizando: boolean;
  setLoja: (campo: keyof LojaConfig, valor: string) => void;
  aplicarCep: () => void;
  localizarNoMapa: () => void;
  salvarLoja: (e: FormEvent<HTMLFormElement>) => void;
}) {
  const temCoordenadas = Boolean(Number(lojaAtual.mapa_lat) && Number(lojaAtual.mapa_lng));

  return (
    <form onSubmit={salvarLoja} className="space-y-5">
      {/* Preview do que o cliente ve */}
      <Card className="border-primary/25 bg-gradient-to-br from-primary/5 via-card to-secondary/10">
        <CardHeader className="gap-1 p-4 sm:p-5">
          <CardTitle className="flex items-center gap-2 font-display text-base">
            <Store className="size-4 text-primary" />
            Como o cliente vê
          </CardTitle>
          <CardDescription className="text-xs">
            Endereço, telefone e ponto no mapa. Aparecem para o cliente quando ele escolhe{" "}
            <strong>retirada na loja</strong> no checkout e no acompanhamento do pedido.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-5 sm:pt-0">
          <p className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm font-medium">
            {enderecoLoja(lojaAtual) || "endereço ainda não cadastrado"}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        {/* 1. Endereco e retirada */}
        <Card className="shadow-card">
          <CardHeader className="p-5 pb-3">
            <CardTitle className="flex items-center gap-2 font-display text-lg">
              <MapPin className="size-4 text-primary" />
              Endereço e retirada
            </CardTitle>
            <CardDescription>
              Onde a loja fica e o que o cliente precisa saber para retirar.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 p-5 pt-0 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="loja-cep">CEP</Label>
              <div className="flex flex-wrap gap-2">
                <Input
                  id="loja-cep"
                  inputMode="numeric"
                  placeholder="00000-000"
                  value={cepLoja}
                  onChange={(e) => setCepLoja(mascararCep(e.target.value))}
                  className="w-40"
                />
                <Button type="button" variant="outline" onClick={aplicarCep} disabled={buscandoCep}>
                  {buscandoCep ? "Buscando…" : "Buscar endereço"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={localizarNoMapa}
                  disabled={localizando}
                >
                  {localizando ? "Localizando…" : "Achar no mapa"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                O CEP preenche rua, bairro e cidade (base do Correio). "Achar no mapa" geocodifica o
                endereço completo e preenche a latitude/longitude.
              </p>
            </div>

            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="loja-endereco">Endereço e número</Label>
              <Input
                id="loja-endereco"
                value={lojaAtual.endereco}
                onChange={(e) => setLoja("endereco", e.target.value)}
                placeholder="Rua das Flores, 123"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="loja-bairro">Bairro</Label>
              <Input
                id="loja-bairro"
                value={lojaAtual.bairro}
                onChange={(e) => setLoja("bairro", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="loja-cidade">Cidade</Label>
              <Input
                id="loja-cidade"
                value={lojaAtual.cidade}
                onChange={(e) => setLoja("cidade", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="loja-complemento">Complemento</Label>
              <Input
                id="loja-complemento"
                placeholder="Loja 2, sala 5…"
                value={lojaAtual.complemento}
                onChange={(e) => setLoja("complemento", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="loja-referencia">Ponto de referência</Label>
              <Input
                id="loja-referencia"
                placeholder="Próximo à praça central"
                value={lojaAtual.referencia}
                onChange={(e) => setLoja("referencia", e.target.value)}
              />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="loja-instrucoes">Instruções para retirada</Label>
              <Textarea
                id="loja-instrucoes"
                rows={3}
                placeholder={"Ex: retirada das 8h às 19h.\nEstacionamento na esquina."}
                value={lojaAtual.instrucoes_retirada}
                onChange={(e) => setLoja("instrucoes_retirada", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Aparece no checkout e no acompanhamento do pedido.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-5">
          {/* 2. Contato */}
          <Card className="shadow-card">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="flex items-center gap-2 font-display text-lg">
                <Phone className="size-4 text-primary" />
                Contato
              </CardTitle>
              <CardDescription>Como o cliente fala com a loja.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 p-5 pt-0 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="loja-nome">Nome</Label>
                <Input
                  id="loja-nome"
                  value={lojaAtual.nome}
                  onChange={(e) => setLoja("nome", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="loja-telefone">WhatsApp da loja</Label>
                <Input
                  id="loja-telefone"
                  inputMode="tel"
                  placeholder="11999999999"
                  value={lojaAtual.telefone}
                  onChange={(e) => setLoja("telefone", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Também serve como contato do orçamento quando a Calculadora está vazia.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* 3. Redes sociais */}
          <Card className="shadow-card">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="flex items-center gap-2 font-display text-lg">
                <Link2 className="size-4 text-primary" />
                Redes sociais
              </CardTitle>
              <CardDescription>Links exibidos na vitrine e no rodapé do site.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 p-5 pt-0 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="loja-instagram">Instagram (link)</Label>
                <Input
                  id="loja-instagram"
                  placeholder="https://instagram.com/..."
                  value={lojaAtual.instagram ?? ""}
                  onChange={(e) => setLoja("instagram", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="loja-facebook">Facebook (link)</Label>
                <Input
                  id="loja-facebook"
                  placeholder="https://facebook.com/..."
                  value={lojaAtual.facebook ?? ""}
                  onChange={(e) => setLoja("facebook", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="loja-site">Site (link)</Label>
                <Input
                  id="loja-site"
                  placeholder="https://..."
                  value={lojaAtual.site ?? ""}
                  onChange={(e) => setLoja("site", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="loja-google">Avaliação Google (link)</Label>
                <Input
                  id="loja-google"
                  placeholder="Link do perfil para avaliar"
                  value={lojaAtual.google_avaliacao ?? ""}
                  onChange={(e) => setLoja("google_avaliacao", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Aparece no pedido entregue. Nunca condicione benefício à nota.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 4. Localizacao no mapa */}
        <Card className="shadow-card xl:col-span-2">
          <CardHeader className="p-5 pb-3">
            <CardTitle className="flex items-center gap-2 font-display text-lg">
              <MapPin className="size-4 text-primary" />
              Localização no mapa
            </CardTitle>
            <CardDescription>
              Sem coordenadas, a loja aparece no mapa só se você usar "Achar no mapa".
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 p-5 pt-0 lg:grid-cols-2">
            <div className="grid gap-3 sm:grid-cols-2 lg:content-start">
              <div className="space-y-1">
                <Label htmlFor="loja-lat">Latitude</Label>
                <Input
                  id="loja-lat"
                  inputMode="decimal"
                  placeholder="-23.550520"
                  value={lojaAtual.mapa_lat ?? ""}
                  onChange={(e) => setLoja("mapa_lat", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="loja-lng">Longitude</Label>
                <Input
                  id="loja-lng"
                  inputMode="decimal"
                  placeholder="-46.633308"
                  value={lojaAtual.mapa_lng ?? ""}
                  onChange={(e) => setLoja("mapa_lng", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Como a loja aparece para o cliente</Label>
              {temCoordenadas ? (
                <>
                  <MapView
                    pontos={[
                      {
                        lat: Number(lojaAtual.mapa_lat),
                        lng: Number(lojaAtual.mapa_lng),
                        label: lojaAtual.nome || "Loja",
                      },
                    ]}
                  />
                  <p className="text-xs text-muted-foreground">
                    Esse é o marcador do pedido de retirada. Ajuste o endereço e use "Achar no mapa"
                    de novo se ele estiver no lugar errado.
                  </p>
                </>
              ) : (
                <div className="grid h-48 place-items-center rounded-xl border border-dashed border-border bg-muted/40 px-4 text-center">
                  <p className="text-xs text-muted-foreground">
                    Ainda sem coordenadas. Use "Achar no mapa" ou preencha latitude e longitude ao
                    lado.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Barra de acao */}
      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur lg:-mx-6 lg:px-6">
        <Button type="submit" disabled={!podeSalvar}>
          Salvar dados da loja
        </Button>
        <p className="text-xs text-muted-foreground">
          As alterações valem para o checkout e para o acompanhamento do pedido.
        </p>
      </div>
    </form>
  );
}
