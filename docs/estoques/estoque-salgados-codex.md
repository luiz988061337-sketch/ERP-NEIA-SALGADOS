# Estoque de Salgados — cadastro oficial

O painel operacional `/admin#estoque-salgados` usa o menu compartilhado do ERP e os componentes e estilos aprovados no A01 e no A02.1. Os filtros seguem a ordem Fritos, Mini Pastéis, Assados, Empadas e Mini Pizzas. Cada grupo mostra saldos e alertas. A pesquisa aceita nomes sem acentos.

## Cadastro e vínculos

O script `scripts/cadastrar-sabores-estoque.sql` registra 24 sabores e suas categorias de apresentação. Cada sabor tem chave exclusiva e pode apontar para o ID do produto unitário que já controla o seu estoque. O script preserva vínculos existentes e registra o resultado da correspondência. Embalagens e nomes ambíguos ficam fora da vinculação automática.

O módulo lê saldos, lotes, reservas e movimentações do cadastro operacional vinculado. Usa fotos do catálogo quando encontra correspondência inequívoca e mostra um marcador quando a imagem está indisponível. Sabores sem registro de lote, movimentação ou reserva exibem **Não cadastrado** com traços nos campos de saldo. Produtos legados continuam acessíveis em **Produtos fora do cadastro oficial**.

## Verificação local

- `npm run typecheck` e `npm run build`
- `node --test scripts/sabores-estoque.test.mjs scripts/estoque-operacao-atomica.test.mjs scripts/estoque-movimento.test.mjs scripts/reserva-integracao.test.mjs`
- Duas execuções do SQL em PostgreSQL 17 local com produtos unitários, embalagens e nomes ambíguos. Foram verificadas cardinalidade, idempotência, preservação de IDs, produtos e lotes, além das permissões de equipe e cliente.
- `node scripts/sabores-estoque-visual.mjs CAMINHO_DAS_CAPTURAS` após build local com `VITE_DEMO_PREVIEW=0`, `VITE_SUPABASE_URL=https://estoque-isolado-codex.supabase.co` e `VITE_SUPABASE_PUBLISHABLE_KEY=local-test`. O navegador usa respostas de teste e os arquivos do build em memória, com acesso remoto bloqueado.

## Homologação após aprovação

Aplicar o cadastro no ambiente autorizado. Conferir os vínculos identificados pelo SQL, resolver sabores sem produto unitário e homologar as modalidades comerciais que ainda precisam apontar para esse mesmo ID. Conferir fotos reais, saldos, lotes e reservas com os dados de homologação e percorrer as ações operacionais e os alertas da Néia Inteligência.

## Pendência futura — Central de relatórios e impressão de estoque

Definir com o proprietário o conteúdo, os filtros e os formatos dos relatórios.
Prever impressão A4, impressão térmica e exportação de dados. Validar o fluxo
com a HP Smart Tank 584 (A4) e a TANCA TP-550 (térmica) antes da aprovação da
etapa. A implementação depende de uma etapa própria.
