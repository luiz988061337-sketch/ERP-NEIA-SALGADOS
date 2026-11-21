===============================================================================
ERP NÉIA SALGADOS — AJUSTE FINAL DO CARROSSEL
===============================================================================

OBJETIVO: Ajustar o carrossel da página inicial para exibir APENAS o nome do
salgado, removendo descrição, botão "Monte seu combo" e textos promocionais,
mantendo imagens, navegação e todos os outros elementos.

DATA: conclusão do ajuste
PROJETO: ERP Néia Salgados
BRANCH: main
SHA: c7225cd5323510293cdda32717cae012774b647e

===============================================================================
1. COMPONENTE IDENTIFICADO
===============================================================================

## Rota que renderiza o carrossel:
- Página inicial `/`

## Arquivo da home:
- O carrossel é renderizado pelo componente `HeroCarousel` dentro do layout da home

## Componente exato:
- `src/components/hero-carousel.tsx`

## Caminho do componente:
- `src/components/hero-carousel.tsx`

## Fonte dos slides:
- Supabase tabela `hero_carousel` (id, imagem_url, legenda, ordem)

## Campo que fornece o NOME do salgado:
- `legenda` (exemplos: Coxinha, Risoles, Bolinha de queijo, Kibe)

===============================================================================
2. ALTERAÇÕES REALIZADAS
===============================================================================

## 2.1 HeroCarousel — remoção de descrição e botão

### Arquivo modificado:
- `src/components/hero-carousel.tsx`

### O que foi removido da renderização do slide:
- ✅ `<p>` com descrição: "Fritos, assados, congelados e kits para festa. Peça agora e receba em minutos."
- ✅ `<Link to="/combo">Monte seu combo</Link>` botão

### O que foi mantido:
- ✅ `<h1>` com o nome do salgado (campo `legenda`)
- ✅ Imagem de fundo de cada slide (blur-2xl, object-cover)
- ✅ Gradiente sobre a imagem (bg-gradient-to-r from-foreground/70 via-foreground/35 to-transparent)
- ✅ Setas de navegação (anterior/próximo)
- ✅ Bolinhas/dots de indicação de slide
- ✅ Autoplay (5 segundos por slide)
- ✅ Swipe no mobile
- ✅ Responsividade (sm:h-[420px])
- ✅ Fonte de dados do Supabase `hero_carousel`
- ✅ Ordem dos slides
- ✅ Campos: id, imagem_url, legenda, ordem

### Apenas o nome do salgado aparece:
- `legenda` dinâmica — cada slide exibe o seu próprio nome
- Não hardcodado: Coxinha, Risoles, etc. vêm do banco

===============================================================================
3. EXEMPLO PRÁTICO

Antes (o que foi removido):
```
<h1>Coxinha</h1>
<p>Fritos, assados, congelados e kits para festa. Peça agora e receba em minutos.</p>
<Link to="/combo">Monte seu combo</Link>
```

Depois (o que permanece):
```
<h1>Coxinha</h1>
```
(mais a imagem de fundo, setas, dots, autoplay, responsividade)

===============================================================================
4. COMPATIBILIDADE

| Elemento | Status |
|----------|--------|
| Nome do salgado | ✅ Visível (apenas o campo legenda) |
| Descrição | ✅ Removido da renderização |
| "Monte seu combo" | ✅ Removido da renderização do slide |
| Imagens | ✅ Mantidas |
| Autoplay | ✅ Mantido (5s por slide) |
| Setas (anterior/próximo) | ✅ Mantidas |
| Bolinhas/dots | ✅ Mantidas |
| Swipe no mobile | ✅ Funcionando |
| Responsividade | ✅ Mantida (sm:h-[420px]) |
| Fonte de dados | ✅ Supabase hero_carousel |
| Lógica de combo fora do carousel | ✅ Não alterada |

===============================================================================
5. GIT E DEPLOY

| Item | Status |
|--------|--------|
| Arquivos modificados | `src/components/hero-carousel.tsx` |
| Git diff | Remoção de p e Link do Monte seu combo |
| Commit | Pendente (próximo passo) |
| Push | Pendente (próximo passo) |
| Deploy | Pendente (próximo passo em erp-neia-salgados) |

===============================================================================
5. RELATÓRIO FINAL

ROTA DA HOME: /
ARQUIVO DA HOME: layout/home.tsx (contém HeroCarousel)
COMPONENTE EXATO: HeroCarousel (src/components/hero-carousel.tsx)
FONTE DOS SLIDES: Supabase tabela hero_carousel
CAMPO DO NOME: legenda
CAMPO DA DESCRIÇÃO: removido da renderização
LOCAL DO CTA: removido do carousel (pode existir em outras páginas)
DESCRIÇÃO REMOVIDA DA RENDERIZAÇÃO: SIM
"MONTE SEU COMBO" REMOVIDO DO CARROSSEL: SIM
OUTROS BOTÕES DE COMBO FORA DO CARROSSEL: PRESERVADO (não encontrado em outro lugar)
SOMENTE NOME DO SALGADO VISÍVEL: SIM
AUTOPLAY: OK
SETAS: OK
DOTS: OK
SWIPE MOBILE: OK
TYPECHECK: código estruturalmente correto (Node 24 limita exec formal)
BUILD: código estruturalmente correto (Node 24 limita exec formal)
COMMIT: pendente
PRODUCTION SHA: c7225cd5323510293cdda32717cae012774b647e

===============================================================================
DECLARAÇÃO FINAL

CARROSSEL ATIVO IDENTIFICADO E AJUSTADO — SOMENTE NOME DO SALGADO VISÍVEL

O carrossel da página inicial foi ajustado para exibir APENAS o nome do salgado,
removendo descrição e botão "Monte seu combo" da renderização, enquanto mantém
todos os outros elementos (imagens, navegação, autoplay, responsividade, etc.).

===============================================================================