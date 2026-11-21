# NÉIA SALGADOS — REFERÊNCIA VISUAL ESCRITA 05 + 06

**Artefatos:** `05_checkout.png` (imagem ilustrativa de referência estética) e `06_acompanhamento.png` (imagem ilustrativa de referência estética). **Objetivo:** implementar as telas reais existentes do Checkout e Acompanhamento com fidelidade visual mesmo se o modelo OpenCode/Big Pickle NÃO conseguir ler PNGs.

**CONTRATO:** as imagens **não são telas reais nem contrato de dados**. Não copiar valores, contagens, datas, telefones, endereços, status, porcentagens, tempos, pontos de fidelidade ou preços ilustrativos para a aplicação. Priorizar as regras do ERP real. Nunca dizer que interpretou a imagem se não possui acesso visual. Não modificar o Admin. Não acessar Supabase de produção; usar B1/ambiente demo local isolado.

## Identidade compartilhada nas duas telas

- Reutilizar o MESMO componente do cabeçalho público do Carrinho aprovado (logo Néia Salgados, menu Cardápio/Montar combo/Orçamento/Parceiros/Ajuda/Meus pedidos/Orçamentos, botão dourado Carrinho e ícone de conta). Não criar um cabeçalho paralelo; adaptar responsivamente. O contador é quantidade de unidades do carrinho ou métrica existente aprovada, **não caixas/embalagens**. Não mostrar sidebar Admin na área pública.
- Fundo branco/creme muito claro (`#FFFCF7`), cartões brancos de cantos arredondados (16–22px), bordas bege discretas, sombra suave, boa legibilidade. Títulos vinho escuro (`#500B08` a `#650C09`), apoio marrom-acinzentado, vermelho forte (`#C9000B`/`#D50A0A`), laranja (`#F47500`), dourado (`#FFB900`). Conferir tokens já existentes e reutilizar os da aplicação.
- Cabeçalhos de cards são faixas em gradiente horizontal vermelho→laranja→dourado, com ícones brancos e texto branco; botões primários 48–56px de altura em gradiente e secundários creme/branco com contorno dourado. Estados hover, foco, disabled e loading corretos.
- Layout desktop centralizado (aprox. 1200–1400px), padding lateral adaptativo, mobile 390px com coluna única, alvos de toque >=44px, sem overflow horizontal, fonte legível (corpo geralmente 15–17px, títulos 28–42px).
- O banner `MODO DEMONSTRAÇÃO · dados fictícios · nenhuma operação real` deve aparecer **somente** no modo demo; não simular modo de produção.

## 05 — CHECKOUT: `05_checkout.png`

### O que a imagem mostra (REFERÊNCIA ESTÉTICA, não fluxo funcional)
- Cabeçalho público branco; título grande vinho `Finalizar pedido` com seta de retorno dourada/vermelha.
- Barra horizontal de progressão das etapas na parte superior, com etapa ativa em creme/dourado, círculo numerado amarelo e etapas posteriores em cinza suave.
- Card principal à esquerda, amplo, com seções de formulário e escolhas, bordas suaves. Card lateral direito `Resumo do Pedido` com uma faixa gradiente vermelho→laranja e ícone branco.
- No formulário, cartões/rádios grandes para `Entrega` e `Retirada` (seleção ativa com borda dourada, fundo creme), campo de endereço com ícone de localização, escolhas de pagamento com linhas grandes (Pix, cartão, dinheiro, somente conforme meios realmente habilitados), e campo de troco SOMENTE quando aplicável a dinheiro.
- Painel lateral com itens, produtos, subtotal, frete e total. Faixa inferior creme com valor final vermelho grande, sem caixas/embalagens no resumo público. CTA inferior destacado `Confirmar pedido` na referência; no sistema, o botão de avançar deve refletir a etapa em curso.

### Adaptação OBRIGATÓRIA ao ERP real (5 etapas, não 3)

**Preservar o fluxo de cinco etapas já existente:**
1. **Dados:** dados de contato e identificação efetivamente solicitados pelo ERP; validações e consentimentos existentes. Não solicitar campos novos desnecessários.
2. **Endereço:** endereço completo quando necessário, sugestões/autocomplete somente se integração já existir, número/complemento/referência, geolocalização quando disponível e consentida; tratar endereços não encontrados e campos ausentes. Retirada não exige endereço de entrega.
3. **Entrega:** modalidade Entrega ou Retirada; cálculo do frete, horário/agendamento conforme regras e capacidade real; mensagens claras de prazo estimado e disponibilidade, sem prometer horários impossíveis.
4. **Pagamento:** escolher SOMENTE opções realmente habilitadas para o canal; Pix na plataforma e Pix na entrega não são a mesma coisa; mostrar custos associados e regras efetivamente configuradas; troco apenas para dinheiro na entrega.
5. **Revisão:** listar dados finais, itens, quantidades, desconto validado, frete confirmado, observações, pagamento, total final e botão de confirmar pedido sujeito a autorização/validação reais.

A imagem original exibe apenas 3 etapas (`Endereço`, `Pagamento`, `Confirmação`) e um CTA único: **NÃO copiar essa simplificação**. Preservar as cinco rotas/estados reais e todas as transições/voltar/avançar existentes. Usar a imagem para aparência da progressão, campos, cartões e resumo.

### Regras comerciais e integridade
- Entrega: **não** exibir R$ 6,00 como taxa fixa sem endereço. R$ 6,00 é o **piso** da regra de frete; R$ 1,50/km com mínimo de R$ 6,00, de acordo com distância obtida por serviço confiável e regras do cadastro. Não inventar distância e não aplicar valor fixo como fallback se falhar.
- **Antes** da obtenção/validação do endereço e distância, resumo: `Entrega — calculada após informar o endereço`; valor mostrado como `Subtotal` e **não total final**. Depois de endereço validado, mostrar taxa real e total. Ao alterar endereço ou modalidade, invalidar/recalcular frete; retirada: R$ 0,00 sem ambiguidades.
- Cupons: aplicar somente cupons existentes e validados pelo fluxo real, com regras e valores reais; não criar descontos fictícios nem declarar sucesso sem validação. A taxa de conveniência de R$ 0,99, **se e quando configurada/autorizada**, somente para Pix pago na própria plataforma, nunca para pagamento na entrega. Não inventar ativação ou cobrança.
- Quantidades: salgados prontos e combos em múltiplos de 50 conforme regra comercial de cada categoria; congelados +/− 1 **unidade comercial cadastrada**; bebidas +/− 1 unidade. Validar também na Revisão e no servidor antes da criação do pedido; não confiar no localStorage.
- Resumo público não precisa mostrar quantidade de caixas/embalagens; não remover a informação interna necessária à cozinha/estoque. Exibir quantidades de itens e preços de forma clara.
- Não confirmar pedido, cobrar, imprimir, comunicar WhatsApp ou alterar estoque real a partir do ambiente demo local. Se integrações reais não puderem ser validadas em staging separado, registrar `PENDENTE DE HOMOLOGAÇÃO REAL`.
- Mobile: stepper adaptativo sem cinco labels disputando largura; card de resumo recolhível ou abaixo; CTA não coberto pela navegação; teclado não bloqueia campos.

### Estados que devem existir
- Carrinho vazio, retorno para carrinho, sessão expirada, falta de endereço, endereço inválido, frete indisponível, cupom inválido, falha de pagamento, pagamento pendente/confirmado somente com prova real, transição para acompanhamento após confirmação verdadeira (ou claramente simulada no B1).

## 06 — ACOMPANHAMENTO DO PEDIDO: `06_acompanhamento.png`

### O que a imagem mostra (ESTÉTICA)
- Cabeçalho público padrão; link de retorno `Meus pedidos`, ícone de pacote em círculo creme/dourado, número do pedido, título vinho grande `Acompanhe seu pedido` e data/hora.
- Na parte superior direita há banner amplo em gradiente vermelho→laranja→dourado `Plano Fidelidade Néia`, com ícone de coroa/presente, pontos, barra de progresso e exemplo de desconto. **Importante: somente mostrar programa de fidelidade se estiver realmente implementado/configurado.** Nunca inventar pontos, cupons, metas ou recompensas.
- Card grande central `Ciclo do pedido` com timeline horizontal de quatro marcos ilustrativos e conexão de linha. Concluídos em verde com check; etapa atual amarelo/laranja com contorno e sombra; futuros cinza. Abaixo: pílula de status atual em gradiente e faixa creme com previsão se existir.
- Banner vermelho/laranja `Notificações do pedido` com ícone de sino e CTA creme/dourado para acompanhar entrega quando permitido.
- Dois cards alinhados: à esquerda `Resumo do pedido` (itens, total, pagamento e status do pagamento); à direita `Entrega` (endereço, informações úteis e contato — tudo derivado do pedido/configuração real).
- Seção larga com cabeçalho gradiente `Acompanhar entrega em tempo real`: linha com status da entrega, ETA, última atualização e eventual progresso; mapa grande com loja, motoboy, endereço e trajeto, legenda inferior. **Não representar GPS ou rota fictícios como dados reais.**
- Rodapé com banner gradiente `Precisa de ajuda com este pedido?`, duas ações grandes: `Informar problema ou solicitar reembolso` e `Falar com a atendente`, além de botões secundários `Voltar ao cardápio` e `Cancelar pedido` (apenas se a regra permitir).

### Regras reais de status
- Renderizar timeline baseada em eventos/status efetivamente recebidos do ERP, respeitando o fluxo de **aceite pela Atendente**, **Produção/Conferência**, **Pronto**, **Retirada** ou **Entrega**. O mockup de quatro passos é ilustrativo e não deve substituir a máquina de estados real.
- Exemplo de ENTREGA: `Pedido recebido` → `Aceito` → `Em preparo` → `Pronto / aguardando motoboy` → `Saiu para entrega` → `Entregue`, só marcar concluído quando confirmado. Exemplos e nomes exatos devem ser mapeados aos enums/status existentes, sem inventar transições.
- Exemplo de RETIRADA: `Pedido recebido` → `Aceito` → `Em preparo` → `Pronto para retirada` → `Retirado` (conforme sistema). **Não exibir motoboy ou mapa de entrega em pedidos de retirada.**
- Horários de eventos somente quando persistidos; previsões são estimativas calculadas e rotuladas como tal; sem fabricar timestamps, percentual de entrega ou barras de progresso derivadas de horas inventadas.
- Notificações WhatsApp: dizer que são enviadas somente se a integração realmente estiver ativa/autorizada, com consentimento, status de entrega e templates aprovados. Caso contrário, não prometer envio automático.
- Rastreamento GPS: exibir mapa do motoboy **somente** se a rota foi liberada pela Central, houve retirada e há consentimento/permissão e localização atual válida da viagem. Se não houver posição, mostrar `Rastreamento ainda não disponível` ou estado equivalente, não ícones de localização inventados. Respeitar privacidade: acesso somente do cliente do pedido, expiração/fim do tracking ao concluir, e jamais exibir localização de outros pedidos.
- Central de Entregas **atribui a rota diretamente ao motoboy**, sem botão de aceite no app. O acompanhamento deve refletir despacho/liberação real e confirmação de retirada, não uma etapa inexistente de aceitação.
- Card de pagamento: diferenciar `Pendente`, `Confirmado`, `Falhou`, `Estornado`, conforme o provedor real/estado do ERP, sem `Pago e confirmado` em pedido não quitado.
- Ajuda/reembolso: abrir fluxo real e registrar solicitação no módulo apropriado (dossiê), sem conceder reembolso automático e sem inventar decisão. `Cancelar pedido` apenas se elegível; se não for, desabilitar/ocultar com explicação e oferecer contato com atendente.
- Banner de fidelidade: **condicional à existência de módulo real**. Se ainda não implementado, não exibir valores de pontos ou descontos; opcionalmente ocultar o banner e manter espaçamento coerente.
- Carrinho/navegação no header podem persistir, mas não devem mostrar dados de outros clientes, e páginas privadas devem exigir autorização e isolamento por pedido.
- Mobile: timeline vertical/compacta, cards empilhados, mapa responsivo e legível quando disponível, suporte e ações grandes, sem cortes.

### Exemplos da imagem são fictícios
A imagem mostra número de pedido, data, 120 pontos, desconto, endereço e contato de Sorocaba, um valor alto e porcentagem de progresso, além de rota de mapa e ETA. **São dados meramente ilustrativos; não copiar nenhum deles para o ERP.**

## Integração, testes e aprovação

1. Leia também `referencias-visuais/REFERENCIA_VISUAL_ESCRITA.md` para o padrão global e as quatro telas anteriores, se existir no repositório. Não ignore este arquivo complementar.
2. Leia `05_checkout.png` e `06_acompanhamento.png` apenas se a ferramenta tiver visão; caso contrário use o texto deste documento integralmente.
3. Antes de editar, inspeção cuidadosa de `git status`, rotas, componentes, design tokens, validações e regras preexistentes. Não sobrescrever alterações locais pendentes nem refatorar fora do escopo.
4. Implementar por subetapas com relatórios: (a) Checkout aparência preservando 5 etapas; (b) Acompanhamento aparência preservando status/privacidade; (c) testes. Não dizer que a integração real está homologada quando só testes demo locais passaram.
5. Testes mínimos: TypeScript/build; fluxo de 5 etapas; checkout entrega sem endereço; endereço alterado; cálculo de frete válido/indisponível; retirada gratuita; cupom válido/inválido; incremento correto de prontos/congelados; vedação de pedido inválido; atualização de página; acompanhamento entrega/retirada; status pago/pendente; GPS ausente; outros clientes não podem visualizar pedidos; cancelamento e suporte elegíveis; responsividade desktop 1440px e mobile 390px.
6. Exclusivamente ambiente B1 demo local isolado, credenciais e URLs fictícias, rede externa bloqueada. **Não acessar Supabase real, não fazer pedidos/pagamentos reais, SQL, migrations, commit, push, deploy**. Não modificar B1/B2/B3, Admin ou backoffice a menos de correção indispensável explicitamente aprovada.
7. Fornecer screenshots desktop/mobile, diferenças identificadas, resultados dos testes, lista de arquivos alterados, limitações e pedir aprovação visual. O proprietário compara as screenshots com as referências.
