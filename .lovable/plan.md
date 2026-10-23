# Plano: Neia Salgados no ar e estável

Prioridade: estabilidade e PIX automático. Sem pressa, uma etapa por semana. Nada de módulos novos de ERP até a Semana 4 estar pronta.

## Semana 1 — Publicação confiável
- Revisar a configuração da Vercel que pode atrapalhar a publicação pelo Lovable; manter só um caminho de publicação.
- Fazer a página de versão (/api/versao) mostrar a versão publicada, para conferir o que está no ar.
- Confirmar que o backup diário existe antes de qualquer mudança no banco.
- Pronto quando: publicar → site atualiza e mostra a versão nova.

## Semana 2 — Corrigir as regras de pagamento e impressão
- Reescrever as mudanças do banco que estavam com erro (impressão após pagamento).
- Regra: dinheiro/cartão na entrega imprimem na hora; PIX só imprime depois de confirmado.
- Limpar a fila antiga de cupons de impressão (78) com sua autorização.
- Pronto quando: pedido em dinheiro imprime na hora e pedido PIX fica esperando.

## Semana 3 — PIX automático
- Criar no banco as tabelas do leitor de PIX com acesso restrito (só equipe e o aparelho cadastrado).
- Colocar no ar as 4 funções do PIX (receber aviso, achar pedido, confirmar, saúde).
- Cadastro do celular leitor com chave secreta; associar o valor recebido ao pedido certo.
- Confirmação manual na tela de operação quando houver dúvida (dois pedidos com o mesmo valor).
- Pronto quando: um PIX real de teste confirma o pedido sozinho e libera a impressão.

## Semana 4 — Homologação
- Roteiro de teste completo: cliente faz pedido → produção → motoboy → entrega, com PIX e dinheiro.
- Rodar a verificação de segurança e corrigir o que for apontado.
- Registrar a versão aprovada; só então liberar as etapas do ERP (estoque, precificação, financeiro, contador).

## Depois (quando estável)
Seguir o documento do ERP, uma etapa por vez: estoque e insumos → precificação → financeiro → contador → gestão.

## Detalhes técnicos
- Remover `nitro: { preset: "vercel" }` do vite.config.ts (ou isolar por variável de ambiente).
- Migrações novas substituindo 0058/0061/0062 (corrigir PERFORM duplicado, EXECUTE FUNCTION, variáveis, END IF).
- pix_notification_events / pix_reader_devices com RLS via has_role e GRANT; funções pix-* validando segredo do aparelho; preferir server routes em src/routes/api/public/pix/* em vez de Edge Functions.
- Testes das regras (impressão por forma de pagamento, casamento de valor PIX) em scripts/*.test.mjs.
