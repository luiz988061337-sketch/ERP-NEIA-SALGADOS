# NÉIA SALGADOS — ESPECIFICAÇÃO VISUAL APROVADA DAS 4 TELAS PÚBLICAS

**Objetivo:** permitir que um modelo que não lê imagens implemente com fidelidade os quatro mockups aprovados: Monte seu Combo, Ajuda, Orçamentos e Parceiros. Este documento descreve VISUAL e COMPORTAMENTO, e não substitui a lógica existente do ERP.

**Importante:** os PNGs (`01_monte_seu_combo.png`, `02_ajuda.png`, `03_orcamentos.png`, `04_parceiros.png`) são mockups conceituais aprovados. Caso o modelo de código não tenha capacidade visual, **use esta especificação textual como fonte primária**, não afirme que comparou visualmente os PNGs. Não invente preços, descontos, telefone, canais, condições especiais, produtos, status, rastreamento, pagamentos ou funcionalidades. Preserve dados e rotas existentes.

## 0. Aparência compartilhada (todas as páginas públicas)

### Layout geral
- Fundo `#FFFCF7` ou creme muito claro, com cartões brancos `#FFFFFF`.
- Conteúdo centralizado com largura útil aproximadamente 1280–1400px e padding lateral 24–48px no desktop; 16px no celular. Nunca usar a sidebar escura do Admin nas páginas públicas.
- Cores de marca aproximadas para refinamento visual: vermelho profundo `#B9000B` a `#D50909`; vinho para títulos `#500B08` / `#650C09`; laranja `#F47500`; dourado `#F6B300` / `#FFC21C`; creme de destaque `#FFF4D8`. Textos secundários `#60524C`. Ajustar ao design system já existente em vez de duplicar tokens.
- Cabeçalhos de cards com gradiente horizontal **vermelho forte → vermelho/laranja → dourado**, texto e ícones brancos em negrito. Bordas arredondadas 16–22px, sombras suaves, bordas finas quentes/bege.
- Botões principais com gradiente vermelho→laranja→dourado, altura 48–58px, texto branco em negrito; botões secundários brancos/creme com contorno dourado. Hover, foco visível, disabled e cursor adequados. Tipografia legível: corpo aproximadamente 15–17px, labels 15–16px, título principal 35–42px desktop, 25–30px mobile; nunca usar microfontes.
- Título da página no topo com **ícone branco dentro de um quadrado arredondado vermelho→laranja**, ao lado do título vinho em negrito e subtítulo marrom-cinza.

### Cabeçalho público único — mesma estrutura aprovada no Carrinho
- Barra branca com logotipo Néia Salgados à esquerda, navegação horizontal central: **Cardápio, Montar combo, Orçamento, Parceiros, Ajuda, Meus pedidos, Orçamentos**; Carrinho à direita como pílula dourada com ícone e contador de **unidades** (não embalagens), seguido do ícone de conta.
- Item ativo destacado discretamente com fundo amarelo-claro ou vermelho de acordo com a hierarquia da página, mantendo consistência com o Carrinho. Exemplo: `Monte seu combo` vermelho sólido no mockup; `Ajuda`, `Orçamentos`, `Parceiros` em pílula creme-dourada com texto vermelho.
- Em **demonstração local**, manter aviso superior `MODO DEMONSTRAÇÃO · dados fictícios · nenhuma operação real` em pequena tarja marrom; ele não deve ser publicado como se fosse conteúdo de produção.
- Celular: logo legível à esquerda, pílula do carrinho/contador, menu recolhível acessível; não sobrepor links e nem causar scroll horizontal.
- O mesmo componente deve ser reutilizado entre as páginas, sem cópias por rota; estado ativo e contador devem ser dinâmicos.

## 1. MONTE SEU COMBO — `01_monte_seu_combo.png` (1536×1024)

### Composição desktop
- Página dividida visualmente em duas colunas: área principal de escolha, ~68–70% à esquerda; painel **Seu Combo** ~30–32% à direita.
- Topo: ícone de camadas empilhadas em quadrado vermelho-alaranjado; título grande vinho `Monte seu combo`; subtítulo `Escolha os salgados, defina as quantidades (múltiplos de 50) e monte seu pedido.` **Atenção:** no sistema real essa regra aplica-se aos salgados prontos elegíveis, não a congelados ou bebidas.
- Abaixo do título, faixa branca com filtros em pílulas alinhadas: `Todos os salgados` (ativo em vermelho), `Fritos`, `Assados`, `Pastéis`, `Mini Pizzas`, `Empadas` (contorno dourado e ícones). Filtros reais conforme catálogo existente, sem forçar agrupamentos inexistentes.
- Grade visual de **3 cartões por linha** na área da esquerda; cada cartão tem foto grande na metade superior, nome forte vinho, preço em vermelho, texto secundário da quantidade/unidade de venda, controles menos/quantidade/mais em pílula com contorno vermelho e botão `Adicionar` creme/dourado com ícone de carrinho. Imagens com bordas arredondadas no topo.
- No mockup ilustrativo há coxinha, bolinha de queijo, risoles, quibe, croquete e pastéis; **não copiar seus valores ou fotos automaticamente**. Usar itens reais cadastrados, fotos existentes ou placeholders coerentes.
- À direita, card `Seu Combo` com faixa em gradiente. Linhas do combo têm miniatura, nome, controle de quantidade e valor à direita, além de lixeira. Rodapé creme `Subtotal` e valor vermelho em destaque.
- Abaixo, card `Como deseja receber?` com duas opções grandes: `Entrega` (frete calculado depois do endereço, sem valor fixo) e `Retirada na loja` (sem taxa). Botão primário grande `Finalizar Combo`/ação equivalente **existente**.
- **Celular:** uma coluna de cards ou cards compactos com foto à esquerda, controles à direita; resumo `Seu Combo` recolhível ou fixado sem cobrir ações, botões com alvos de toque >=44px e acesso ao checkout.

### Regras funcionais indispensáveis
- Preservar a **montagem de sabores por categoria** do ERP atual: a imagem é referência estética, não licença para transformar a criação de combos em compra isolada de produtos nem apagar etapas.
- Salgados **prontos** elegíveis: quantidade total por categoria/combo em múltiplos de 50; controles +/− precisam respeitar a unidade/estrutura interna e nunca permitir passar uma quantidade inválida ao Checkout.
- **Congelados:** incremento de **1 unidade comercial** (unidade ou pacote, conforme cadastro); não aplicar +50. Bebidas: incremento de 1 unidade comercial.
- Preço subtotal é dinâmico e obtido do cadastro. Exibir estados vazio, desabilitado, erro e confirmação de adição; não permitir misturar pedidos/clientes.

## 2. AJUDA — `02_ajuda.png` (1536×1024)

### Composição desktop
- Ícone de headset em quadrado com gradiente; título `Ajuda`; subtítulo `Tire suas dúvidas, veja orientações e saiba como fazer seu pedido na Néia Salgados.`
- Grid principal **~64% esquerda / ~36% direita**, com espaços de 18–24px.
- No alto à esquerda, banner creme de 170–190px de altura com texto à esquerda: `Como podemos te ajudar?` em vinho grande, abaixo `Encontre respostas rápidas nas perguntas frequentes ou entre em contato com a nossa equipe.` À direita, foto de salgados com curva/arco decorativo vermelho e dourado.
- À esquerda abaixo: card branco `Perguntas Frequentes` com faixa em gradiente e ícone de interrogação. Sete linhas de acordeão, fundo branco, contorno suave, ícone vermelho à esquerda, título vinho negrito e chevron vermelho à direita:
  1. `Qual é o pedido mínimo?`
  2. `Qual o prazo para retirada e entrega?`
  3. `Quais são as formas de pagamento?`
  4. `Como funciona a taxa de entrega?`
  5. `Posso agendar meu pedido?`
  6. `É possível personalizar um combo?`
  7. `Vocês vendem salgados congelados?`
- À direita, card `Fale Conosco` com cabeçalho gradiente; destaque verde do WhatsApp, breve explicação, botão largo de contorno dourado `Conversar no WhatsApp`. **Usar contato real configurado, nunca inventar telefone**.
- Abaixo à direita, card `Como fazer seu pedido?` com faixa gradiente e sequência de 3 passos numerados em círculos amarelos: escolher itens/combos; adicionar ao carrinho e finalizar; escolher entrega/retirada e pagamento.
- Último card à direita: `Informações Importantes` com regras concisas. Exemplos operacionais que precisam refletir o cadastro: pedido mínimo 50 unidades para salgados prontos, múltiplos de 50, estimativas de entrega 60–90 min e retirada 40–60 min **somente se correspondentes à regra operacional vigente**, agendados entram na preparação com antecedência aproximada de 1h30 conforme planejamento. Congelados obedecem à unidade de venda.
- Celular: título → banner → FAQ → contato → etapas → informações; acordeões acessíveis por teclado e toque.

## 3. ORÇAMENTOS — `03_orcamentos.png` (1536×1024)

### Composição desktop
- Título `Orçamentos` com ícone de documento/lápis dentro de quadrado gradiente; subtítulo `Solicite um orçamento personalizado para o seu evento. É rápido, simples e sem compromisso!` **Esta frase é proposta visual; ajustar caso as condições reais não confirmem.**
- Grid principal **~63% esquerda / ~37% direita**, cartões brancos arredondados com sombras suaves.
- À esquerda: card formulário grande; faixa interna superior com gradiente `Solicitar Orçamento` e ícone de calendário. Campos em duas colunas, com labels vinho negrito e ícones vermelhos:
  - `Seu nome *` (texto), `Telefone / WhatsApp *` (telefone),
  - `Tipo de evento *` (select), `Data do evento *` (date picker),
  - `Quantidade de pessoas (estimada) *` (número; **não confundir pessoas com unidades de salgado**),
  - `Observações (opcional)` textarea larga com exemplo de sabores, local, horário etc.
- Inputs altura ~50–55px, fundo creme muito suave, borda bege, cantos ~14px. Botão primário full width com ícone de envio: `Solicitar Orçamento`.
- Direita card `Vantagens do nosso orçamento` com faixa em gradiente; quatro linhas com ícones vermelhos: `Valores especiais para eventos`, `Combos personalizados`, `Agendamento com antecedência`, `Atendimento rápido e personalizado`. **Só afirmar preços/condições especiais caso o ERP tenha política comercial vigente; caso contrário usar benefícios neutros sem promessas**.
- Abaixo: box creme com contorno dourado `Como funciona?` e explicação curta de que o time receberá a solicitação e responderá pelo canal configurado; não prometer envio de WhatsApp automático sem integração real.
- Foto grande de salgados na base da coluna direita, cantos arredondados.
- Mobile: form em uma coluna, painel explicativo abaixo, botão de envio visível, teclado/form com validação e máscara suave sem impedir formatos legítimos.

### Funcionamento
- Verificar as rotas **`Orçamento` e `Orçamentos`**; podem ter funções distintas no projeto. Não apagar, unificar nem duplicar sem inspeção. Reutilizar fluxo seguro de solicitação já existente.
- Validar dados e feedback; nunca mostrar `Enviado com sucesso` se nenhum canal/back-end recebeu a solicitação. Em demo, respostas claramente fictícias.

## 4. PARCEIROS — `04_parceiros.png` (1536×1024)

### Composição desktop
- Cabeçalho normal e **hero horizontal mais largo** que o padrão, sobre fundo creme; grande ícone branco de aperto de mãos sobre quadrado gradiente, título vinho grande `Seja um parceiro`.
- Subtítulo em 2 linhas: `Revenda, encomende para sua empresa ou evento e conte com a qualidade e tradição da Néia Salgados.` À direita, grande foto de prato com coxinhas e bolinhas douradas ocupando cerca de 40% do hero, com leve fusão no fundo.
- Sob o texto do hero, **três benefícios alinhados** com ícones dourados e separadores verticais finos: `Qualidade e padrão`, `Condições especiais`, `Produção e entrega`; descrições curtas. **Não prometer condições especiais sem confirmação comercial.**
- Seção abaixo `Modalidades de parceria` em vinho grande com pequeno sublinhado dourado e subtítulo `Escolha a opção que mais se encaixa na sua necessidade:`.
- Grade de **três cartões de parceria** em uma linha com contorno esquerdo dourado, cantos arredondados, ícones dentro de cartões creme; imagem suave ao lado direito de cada cartão:
  1. `Revendedores` — ilustração de pequena loja.
  2. `Empresas` — ilustração de escritório/sala de reunião.
  3. `Eventos` — ilustração de salão/festa.
  Dentro dos cartões, textos curtos e bullets com check vermelho. Não apresentar tabela de condições/benefícios ainda não aprovados como contratos reais.
- Rodapé de seção: faixa de CTA larga vermelho→laranja→dourado, ícone grande de aperto de mãos à esquerda, título `Vamos firmar uma parceria?`, texto curto, e botão pílula creme/dourado `Quero ser parceiro` com seta à direita.
- O botão precisa ter comportamento real: contato comercial existente ou formulário funcional, nunca placeholder que simula envio. Sem canal confirmado, indicar pendência.
- Mobile: hero com imagem abaixo do texto, benefícios empilhados, três cartões verticais, CTA em coluna, sem cortar imagens nem texto.

## 5. CHECKLIST DE QUALIDADE / COMPATIBILIDADE

### Sem alterar o visual já aprovado
- **Carrinho:** manter a aparência aprovada; endereço ainda não informado ⇒ não mostrar valor fixo de frete (R$6 é mínimo, não frete universal). Mostrar `Entrega calculada após informar o endereço`; esconder contagem de caixas/embalagens **no resumo público** sem apagar informação necessária à produção/estoque. Controle de quantidade varia por tipo do produto.
- Checkout possui **5 etapas reais**, preserve-as. Não recriar como 3 etapas por causa de mockups anteriores. Frete por distância conforme regra cadastrada (referência R$1,50/km, mínimo R$6), calculado após endereço validado e invalidado se endereço mudar. Se indisponível, não inventar frete.
- **Acompanhamento:** status reais ou claramente fictícios em demo, sem fabricar GPS.
- **Admin:** tema escuro grafite/preto/dourado; não aplicar tema público no Admin.

### Escopo e segurança
- Trabalhar **somente na branch de homologação e no modo demo local isolado**, conforme regras existentes. Inspecionar Git antes, preservar working tree, commits e correções pendentes. Não acessar Supabase real, não migrar banco, não criar transações reais, não fazer `git add .`, commit, push ou deploy sem autorização.
- Implementar por etapas pequenas dentro do mesmo trabalho: cabeçalho → Monte Combo → Ajuda → Orçamentos → Parceiros → smoke test das páginas existentes. Não declarar sucesso se testes falharem.
- Em cada etapa, validar TypeScript, build e testes relevantes. Validar desktop 1440×900 ou 1536×1024 e mobile 390×844; usar browser local em ambiente demo.
- Capturar screenshots desktop/mobile de cada tela; o proprietário aprovará o resultado. **Se o modelo não lê PNGs, não afirme comparação visual automática**: entregue screenshots para revisão humana e use esta especificação textual.
- Preservar regras e funcionalidades reais; sem dados, fotos, preços, canais e descontos inventados.

## 6. Como aplicar se o modelo não lê imagens

1. Extraia os arquivos para `referencias-visuais/` na raiz do projeto.
2. Mande o modelo **ler integralmente o arquivo de texto** `referencias-visuais/REFERENCIA_VISUAL_ESCRITA.md` (abrir arquivo com ferramenta de leitura ou comando terminal). A leitura de imagem **não é requisito**.
3. Se houver modelo com visão, PNGs são opcionais para comparação; caso contrário, use exclusivamente a descrição acima.
4. Ao final de cada página, mostre capturas para **você** comparar visualmente, sem prometer análise de imagem que a ferramenta não consegue executar.
