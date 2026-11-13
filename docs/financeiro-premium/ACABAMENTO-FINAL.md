# Financeiro Premium — sidebar padrão e bordas suaves

## Escopo desta etapa

Somente dois arquivos de implementação alterados:

- `src/components/financeiro-premium/layout.tsx`: substitui a sidebar independente pelo `AdminShell` real, sem duplicar o menu ou modificar o componente compartilhado.
- `src/components/financeiro-premium/premium.css`: remove estilos da antiga sidebar, a margem duplicada do conteúdo, halos amarelos e faixas luminosas; aplica bordas de 1px e sombras neutras. Ícones, aba selecionada e botões principais continuam dourados.

O menu mantém a largura original de 14rem (224px), marca, `ADMIN_NAV`, ícones, agrupamentos e rodapé com perfil/atualização. O modo `modoPreview` é o mesmo usado no Dashboard L2: não altera permissões reais nem habilita operações contra o banco. O controle mobile é o `SidebarTrigger` original, com o drawer real do componente.

O CSS financeiro fica dentro do `SidebarInset`, e não envolve a sidebar. Não foram aplicados overrides ao menu compartilhado ou aos estilos globais.

## Preservação

- Branch: `homologacao-finalizacao`.
- HEAD: `53c173f72b832c937b459f1ec829b638d53f7b99`.
- Nenhum commit, push, reset, clean, migration ou alteração de Supabase.
- As alterações locais anteriores e as capturas da primeira entrega permanecem preservadas.
- Cópias de segurança desta etapa: `C:\Users\User\AppData\Local\Temp\opencode\financeiro-acabamento-20261113-194956`.
- Comparação por SHA-256 confirmou que a rota financeira, os painéis, os dados, os ícones, o `AdminShell`, o `ADMIN_NAV`, a implementação compartilhada da sidebar, as exceções de layout e o CSS global não foram alterados nesta etapa: [evidência](acabamento-final/preservacao.json).

## Capturas reais

Chrome com `puppeteer-core` já instalado, sem dependências ou configuração novas:

- [Antes — desktop](acabamento-final/antes-topo-1440.png)
- [Depois — desktop](acabamento-final/depois-topo-1440.png)
- [Depois — gestão e análises](acabamento-final/depois-gestao-1440.png)
- [Depois — página completa](acabamento-final/depois-desktop-1440.png)
- [Antes — mobile](acabamento-final/antes-mobile-390.png)
- [Depois — mobile](acabamento-final/depois-mobile-390.png)
- [Sidebar real aberta no mobile](acabamento-final/depois-menu-mobile-390.png)

Comparação visual com o anexo final: menu compartilhado em vez de coroa/marca empilhadas independentes; contornos discretos e sem halo; mesma hierarquia dos indicadores, painéis, atalhos, gestão e análises. O espaço disponível muda apenas pelo uso da largura real da sidebar. Não houve reprodução por imagens estáticas nem alteração dos grids financeiros. A aprovação continua dependendo do proprietário.

## Validações

- `npm run typecheck`: passou.
- `npm run build`: passou, com os avisos preexistentes do projeto.
- `node scripts/financeiro-m.test.mjs`: 9 verificações passaram.
- `node scripts/financeiro-premium.test.mjs`: passou.
- `git diff --check`: passou.
- `FINANCEIRO_CAPTURAS_DIR=docs/financeiro-premium/acabamento-final node scripts/financeiro-premium-visual.mjs depois --test --sidebar`: passou.

O teste de navegador verificou sidebar de 224px, Financeiro ativo, perfil e menus padrão, CSS isolado, bordas de 1px sem faixas luminosas, seis indicadores, nove atalhos, três painéis na mesma linha desktop e abertura/fechamento do drawer mobile ao tocar fora. Também exercitou as interações financeiras existentes. Nenhum erro JavaScript, requisição ao Supabase ou overflow horizontal no mobile durante a execução.

[Resultado do navegador](acabamento-final/depois-resultado.json).

O script `scripts/financeiro-premium-visual.mjs` foi ampliado apenas para preservar capturas anteriores em pastas distintas e verificar a sidebar/bordas. Não altera a aplicação.

## Único Preview publicado

- Comando: `vercel deploy --yes`, sem `--prod` ou `--prebuilt`.
- Projeto existente: `erp-neia-salgados`.
- URL: https://erp-neia-salgados-3m74izbbm-luiz988061337-3147s-projects.vercel.app/preview/financeiro-premium
- ID: `dpl_GhLLSZXpp6DUjqRHMu7rzUruyK6R`.
- `vercel inspect`: target `preview`, status `Ready`. Proteção Vercel Authentication preservada.
- HTML publicado confirmado: revisão `acabamento-adminshell-v5`, sidebar real presente, sidebar independente e cabeçalho público ausentes.
- CSS remoto `financeiro-premium-BUHMIlBG.css` idêntico ao build local, SHA-256 `ED06C720976071B7757BEA497D50F880C13ED77B7A0DFAB1EA9A25A3BCA70335`.
- A publicação inclui os arquivos atuais do diretório de trabalho, ainda não commitados.
- Consulta somente leitura de Production antes e depois retornou o mesmo deployment `erp-neia-salgados-q9gvt9i8m-luiz988061337-3147s-projects.vercel.app`, commit `366074f9509018c9dcda947591d03f1528795488`. Sem promoção ou alteração de Production.

Nenhum commit ou push realizado. Aguardando validação visual final do proprietário.
