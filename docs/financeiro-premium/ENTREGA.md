# Financeiro Premium — referências integradas

## Estado e segurança

- Branch `homologacao-finalizacao`, HEAD `53c173f72b832c937b459f1ec829b638d53f7b99`.
- Sem commit, push, migrations, alteração de permissões ou de dados reais.
- `/financeiro`, `AdminShell`, os módulos aprovados e o CSS global não foram editados.
- Cópia do arquivo anterior e diff binário das alterações pré-existentes preservados em `C:\Users\User\AppData\Local\Temp\opencode\financeiro-continuidade`.

## Diagnóstico comprovado

1. O pai `/preview` ainda montava cabeçalho e rodapé públicos. A exceção em `__root.tsx` não bastava.
2. O JSX anterior tinha gráfico ocupando duas das três colunas, PE reduzido a um valor e um painel superior de riscos vazio, empurrado à linha seguinte.
3. A lista real de riscos permanecia muito abaixo, duplicada em outro bloco.
4. Gráfico de linhas com `Math.random()`, meses indexados incorretamente e sem curva de equilíbrio.
5. Atalhos distribuídos em três linhas, formulário em modal e cores discretas não correspondiam à referência.
6. Comparações mensais fixas sem base; valores substitutos ocultavam zeros; dados iniciais misturavam uma venda diária com custos mensais.

O HTML e o bundle `/assets/financeiro-premium-BOONcX25.js` do deployment anterior `dpl_946P94kc2BRbB31GyWxDJg5aa1Xx` foram lidos via Vercel CLI. Contêm o grid `lg:grid-cols-2` e o gráfico de 320px. O HTML contém “Montar Combo”. Isso confirma a presença das mudanças antigas na publicação, não um novo layout aguardando apenas cache.

## Reconstrução visual

- Sidebar local com coroa, marca empilhada, menu compacto e seleção dourada. Os outros módulos permanecem desabilitados na demonstração, como antes; não navegam para operações reais.
- Cabeçalho e seis indicadores na ordem das imagens, ícones dourados, valores claros, fundo preto e molduras luminosas locais.
- Primeira linha com proporções `1.1 : 0.64 : 1`, equivalentes à composição gráfico largo / PE estreito / riscos largos. Os três painéis ficam na mesma linha em desktop de 1440px.
- Barras verde/dourada e linha branca tracejada. Ponto não calculável é `null` no gráfico, nunca uma meta válida.
- Segunda linha com rosca/legenda, saúde compacta com marcador e compromissos derivados dos cadastros locais.
- Nove atalhos em uma faixa, sete abas e tabela/formulário lado a lado.
- Quatro cards de análises e três cards auxiliares integrados na mesma página, abaixo da gestão. Riscos detalhados acessíveis em “Ver análise completa”.

## Dados e cálculos

Os registros originais foram mantidos e complementados com exemplos explicitamente demonstrativos de vendas consolidadas, pessoal, serviços e saldo inicial. Não foram copiados os totais da imagem.

| Indicador inicial | Valor calculado |
|---|---:|
| Receita | R$ 58.480,00 |
| Custos variáveis e despesas avulsas | R$ 28.610,00 |
| Custos fixos | R$ 14.500,00 |
| Despesas totais / total da rosca | R$ 43.110,00 |
| Resultado | R$ 15.370,00 |
| Ponto de equilíbrio | R$ 28.388,35 |
| Saldo de caixa | R$ 15.960,00 |

- Mesmas fórmulas de contribuição, PE, segurança e simulação, centralizadas em `dados.ts`.
- Despesas já detalhadas nos custos são vinculadas para não duplicar valores; despesas avulsas atualizam os indicadores.
- Sem comparações mensais fixas. A série de novembro a março é um conjunto FIXO, FICTÍCIO e identificado; não representa histórico real. Abril reage aos estados React.
- A data-base dos alertas é demonstrativa (13/04/2025), não o relógio atual.
- O shell desta rota não monta os hooks de sessão públicos nem cria sessão anônima no Supabase.

## Evidências reais

Capturas feitas com Chrome e `puppeteer-core` já instalados, sem dependências ou configurações novas:

- [Antes, topo 1440px](validacao/antes-topo-1440.png)
- [Antes, página completa](validacao/antes-desktop-1440.png)
- [Depois, topo 1440px](validacao/depois-topo-1440.png)
- [Depois, gestão 1440px](validacao/depois-gestao-1440.png)
- [Depois, página completa](validacao/depois-desktop-1440.png)
- [Depois, celular 390px](validacao/depois-mobile-390.png)
- [Resultado dos testes de navegador](validacao/depois-resultado.json)

As capturas são da aplicação local real, não montagens. Foram examinadas contra as duas referências anexadas. Não foi feito teste automatizado de diferença de pixels, pois as referências foram fornecidas como anexos, não como arquivos locais de teste.

## Testes

- `npm run typecheck` — passou.
- `npm run build` — passou; avisos existentes sobre tamanho dos chunks, plugin de paths, arquivo auxiliar de rotas e opção Nitro.
- `node scripts/financeiro-m.test.mjs` — 9 verificações passaram.
- `node scripts/financeiro-premium.test.mjs` — totais, PE, prejuízo, zero, formato pt-BR e série fictícia passaram.
- `node scripts/financeiro-premium-visual.mjs depois --test` — receita, despesa, filtro, exclusão confirmada, custos, abrir/fechar caixa, sangria, suprimento, pagar/receber, obrigações fiscais e simulador exercitados no navegador.
- Cenário sem margem exercitado: prejuízo, PE não calculável e nenhum ponto de equilíbrio de Abril no gráfico.
- Zero erros JavaScript e zero requisições ao Supabase/Lovable Cloud durante os testes. Interceptação preventiva de banco mantida no script, sem pedidos interceptados.
- `git diff --check` — passou.

## Diferenças restantes / limites

- Números, datas, quantidades e status refletem o cenário demonstrativo, não as ilustrações. Não se fabricou rejeição de NFC-e ou conciliação confirmada para imitar os badges da imagem.
- Fonte, coroa, ícones vetoriais e brilho são aproximações implementadas em código, não reprodução pixel a pixel.
- Integrar as duas imagens aumenta a altura da página: segunda linha de visão geral, cadastros, gestão e análises coexistem por rolagem, sem duplicar o cabeçalho.
- O formulário conserva os campos e handlers existentes. Não foram criados botões falsos de anexos, pagamento, edição de registros ou exportação fiscal que não tinham implementação.
- A aprovação visual continua sendo exclusivamente do proprietário.

## Arquivos de implementação

- `src/routes/preview/financeiro-premium.tsx`
- `src/routes/preview.tsx` — exceção exata para o Financeiro, preservando os outros previews.
- `src/routes/__root.tsx` — impede inicialização de sessão somente nesta rota fictícia.
- `src/components/financeiro-premium/layout.tsx`
- `src/components/financeiro-premium/paineis.tsx`
- `src/components/financeiro-premium/premium.css`
- `src/components/financeiro-premium/dados.ts`
- `src/components/financeiro-premium/icones.ts`
- `scripts/financeiro-premium-visual.mjs`
- `scripts/financeiro-premium.test.mjs`

Nenhum arquivo pré-existente de documentação, print ou log de outras etapas foi descartado.

## Preview publicado para avaliação

- Uma única execução: `vercel deploy --yes`, sem `--prod` e sem `--prebuilt`.
- Projeto existente: `erp-neia-salgados` (`prj_sSP8Q2IIAVTe4qiyGjTJi3qZYl0J`).
- URL: https://erp-neia-salgados-qyed9kpes-luiz988061337-3147s-projects.vercel.app/preview/financeiro-premium
- Deployment: `dpl_9WJDoevRB12AJbqHQN8oii1ASwzF`.
- `vercel inspect` confirmou target `preview` e status `Ready`.
- Proteção Vercel Authentication mantida; pode solicitar login do proprietário.
- O HTML publicado contém `referencias-integradas-v4`, seis indicadores e nove atalhos, sem “Montar Combo”.
- O CSS publicado `financeiro-premium-5GOPTuvB.css` tem o mesmo SHA-256 do build local: `40C8A130BD9BA9D6E8336C9260777AB8D38C674CFF83A6E667B5AE670D91F6F2`.
- Portanto, o Preview contém a implementação atual do diretório de trabalho, inclusive alterações não commitadas.
- A consulta somente leitura de Production antes/depois retornou o mesmo deployment `erp-neia-salgados-q9gvt9i8m-luiz988061337-3147s-projects.vercel.app`, commit `366074f9509018c9dcda947591d03f1528795488`. Não houve promoção nem alteração de Production.

Sem commit ou push. HEAD continua `53c173f72b832c937b459f1ec829b638d53f7b99`; alterações locais permanecem não commitadas. Layout aguardando avaliação visual do proprietário.
