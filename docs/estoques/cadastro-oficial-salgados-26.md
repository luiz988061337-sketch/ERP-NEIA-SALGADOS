# Estoque de Salgados — cadastro oficial de 26 sabores

Preparação local concluída em 26/11/2026, após a [aprovação visual](aprovacao-visual-estoque-salgados.md). Nenhuma escrita em banco remoto foi executada nesta etapa.

## Lista oficial

O catálogo em `src/lib/catalogo-sabores-estoque.ts` e o CTE `oficial` em `scripts/cadastrar-sabores-estoque.sql` registram 26 sabores na seguinte ordem:

| Ordem | Categoria | Sabor |
| ---: | --- | --- |
| 1–9 | Fritos | Coxinha de frango, Bolinha de queijo, Risoles de presunto e queijo, Croquete, Bolinho de calabresa, Bolinho de milho com queijo, Bolinho de azeitona, Trouxinha de milho com catupiry, Kibe |
| 10–13 | Mini Pastéis | Mini pastel de carne, Mini pastel de queijo, Mini pastel de pizza, Mini pastel de palmito |
| 14–19 | Assados | Esfirra de carne, Esfirra de frango, Esfirra de brócolis, Enroladinho de presunto e queijo, Hamburguinho, Ricota com zaatar |
| 20–21 | Empadas | Mini empada de palmito, Mini empada de frango |
| 22–24 | Mini Pizzas | Mini pizza de calabresa, Mini pizza de queijo, Mini pizza de presunto e queijo |
| 25–26 | Assados | Trouxinha de calabresa, Enroladinho de salsicha |

Contagens por categoria: **9 Fritos, 4 Mini Pastéis, 8 Assados, 2 Empadas e 3 Mini Pizzas**. Os 24 sabores anteriores mantêm a ordem original; os dois novos são acrescentados ao final. Os indicadores, filtros e contadores derivados do catálogo passam a usar `Todos (26)` e `Assados (8)`.

`Enroladinho de salsicha` não possui apelido `Mini Enroladinho de Salsicha 20un`. O produto comercial existente com esse nome é uma embalagem de 20 unidades e permanece fora da vinculação automática.

Reaproveitamento do script do Codex:

- `scripts/cadastrar-sabores-estoque.sql` continua sendo a fonte única do cadastro SQL.
- Um registro em `public.sabores_estoque` por sabor, com chave e nome únicos.
- Unidades individuais são a única base operacional de estoque; embalagens e nomes ambíguos não são sabores.
- A vinculação usa apenas `produtos.id` já existente, quando há correspondência exata e não ambígua.
- A gravação é idempotente: `CREATE TABLE IF NOT EXISTS`, `INSERT ... ON CONFLICT (chave)` e atualização somente quando o vínculo atual é nulo e o novo não.
- Registros existentes e vínculos confirmados não são apagados nem renomeados.

## Preservação comercial

Os 31 produtos comerciais da homologação foram preservados. Nenhum foi excluído, renomeado ou vinculado automaticamente nesta etapa. Não foram criados quantidades, preços, custos, lotes, mínimos ou saldos fictícios. Os saldos comerciais legados não foram convertidos em estoque físico. Sabores internos e modalidades comerciais permanecem separados.

A coluna `public.produtos.preco` é obrigatória. Se for necessário representar um sabor interno como produto comercial para obter um ID unitário, a solução técnica e a autorização devem ser apresentadas antes de qualquer escrita. Nenhum preço pode ser inventado e nenhum sabor interno deve ser disponibilizado para venda automaticamente.

O diagnóstico atualizado está em [diagnostico-vinculos-salgados.md](diagnostico-vinculos-salgados.md), incluindo o UUID conferido em homologação para `Mini Enroladinho de Salsicha 20un` e a divergência histórica de identificadores.

## Validação local executada

- `npm run typecheck`: OK.
- `node --test scripts/sabores-estoque.test.mjs`: 5 testes aprovados.
- `npm run build:homolog` com `NITRO_PRESET=node-server`: OK, sem referência a produção e com `VITE_DEMO_PREVIEW=0`.
- `node scripts/sabores-estoque-visual.mjs CAMINHO_TEMPORARIO .output`: verificações locais em navegador com respostas controladas e build isolado; confirmou `Todos (26)`, cinco grupos, contagens `[9, 4, 8, 2, 3]`, expansão, filtros, busca sem acento, situação, celular sem transbordamento e ausência de erro de página.
- `npm run seguranca:destino -- --project-ref lflzlcqinarrcgncafol`: destino de homologação autorizado.
- `npm run teste:seguranca`: 31/31 testes da barreira P0 aprovados.

As capturas locais geradas nesta preparação são temporárias e **não** substituem as capturas aprovadas. Nenhuma captura ou layout aprovado foi alterado.

## Plano para aplicação em homologação (aguardando autorização)

1. Sincronizar Git e confirmar branch `resgate-visual-h01-h07-codex`, sem trabalho alheio em edição.
2. Declarar destino explícito e validar barreira:

   ```bash
   npm run seguranca:destino -- --project-ref lflzlcqinarrcgncafol
   npm run teste:seguranca
   npm run sql:homolog -- --arquivo scripts/cadastrar-sabores-estoque.sql --project-ref lflzlcqinarrcgncafol
   ```

   O terceiro comando é somente simulação: valida o arquivo e o destino, sem abrir conexão para executar SQL.

3. Conferir dependências antes da escrita: `public.produtos`, `public.categorias` e `public.has_role(auth.uid(), ...)` já existem; a tabela `public.sabores_estoque` ainda não existe em homologação (leitura de 26/11/2026). Não há outra migration em andamento no mesmo banco.
4. Aplicar somente com autorização expressa do proprietário:

   ```bash
   npm run sql:homolog -- --arquivo scripts/cadastrar-sabores-estoque.sql --project-ref lflzlcqinarrcgncafol --confirmar
   ```

5. Verificar após aplicação:

   ```sql
   SELECT count(*) AS sabores, count(*) FILTER (WHERE produto_id IS NOT NULL) AS vinculados
   FROM public.sabores_estoque;

   SELECT categoria, count(*) AS total
   FROM public.sabores_estoque
   GROUP BY categoria
   ORDER BY categoria;

   SELECT chave, categoria, nome, ordem, produto_id
   FROM public.sabores_estoque
   ORDER BY ordem;

   SELECT count(*) AS produtos FROM public.produtos;
   SELECT count(*) AS lotes FROM public.lotes;
   SELECT count(*) AS movimentacoes FROM public.estoque_movimentacoes;
   SELECT count(*) AS reservas FROM public.reservas_estoque;
   ```

   Resultado esperado: 26 sabores, contagens por categoria `[9, 4, 8, 2, 3]`, 31 produtos, zero lotes, zero movimentações, zero reservas e zero vínculos automáticos. O script imprime a situação de cada chave; nenhuma linha deve indicar vínculo automático com `Mini Enroladinho de Salsicha 20un`.

6. Registrar a aplicação, o resultado das verificações e a reversão em documento próprio, com checkpoint versionado. Não promover produção.

## Reversão preparada

A reversão restrita ao cadastro oficial não toca produtos comerciais:

```sql
BEGIN;
DELETE FROM public.sabores_estoque
WHERE chave IN (
  'coxinha-frango', 'bolinha-queijo', 'risoles-presunto-queijo', 'croquete',
  'bolinho-calabresa', 'bolinho-milho-queijo', 'bolinho-azeitona',
  'trouxinha-milho-catupiry', 'kibe', 'pastel-carne', 'pastel-queijo',
  'pastel-pizza', 'pastel-palmito', 'esfirra-carne', 'esfirra-frango',
  'esfirra-brocolis', 'enroladinho-presunto-queijo', 'hamburguinho',
  'ricota-zaatar', 'empada-palmito', 'empada-frango', 'pizza-calabresa',
  'pizza-queijo', 'pizza-presunto-queijo', 'trouxinha-calabresa',
  'enroladinho-salsicha'
);
COMMIT;
```

Se a tabela tiver sido criada apenas por este script e estiver vazia após a reversão, a remoção completa da tabela depende de autorização específica e conferência de dependências. A reversão não reaplica nem reescreve histórico de migração.

## Pendência futura — Central de Relatórios e Impressão de Estoque

Definir com o proprietário o conteúdo, os filtros e os formatos dos relatórios. Prever inventário para contagem física, estoque geral e por categoria, perdas, reposição, validade e movimentações. Incluir impressão A4, impressão térmica e exportação em PDF e Excel. Validar o fluxo com a HP Smart Tank 584 (A4) e a TANCA TP-550 (térmica) antes da aprovação da etapa. A implementação depende de uma etapa própria.
