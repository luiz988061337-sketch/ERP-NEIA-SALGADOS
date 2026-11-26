# Estoque de Salgados — revisão para homologação

Base publicada da revisão `92260ac`. A etapa segue para nova conferência
manual do proprietário.

| Problema encontrado | Correção |
| --- | --- |
| Janelas em tema marrom, fontes e campos pequenos | As janelas usam o diálogo compartilhado do A01/A02.1, fundo grafite azulado, bordas cinza, botões amarelos e campos responsivos. |
| Cartões permanentes expunham identificadores e detalhes operacionais | A tabela abre os detalhes sob demanda. Saldos, foto, lotes, reservas e histórico ficaram na janela do sabor. Produtos antigos têm uma conferência administrativa própria. |
| Indicadores confundiam falta de dados com zero alertas | Os 12 indicadores distinguem cadastro oficial, cobertura operacional, estoque zerado, mínimo, validade e reserva excedente. Grupos sem dados mostram a ausência de cobertura. |
| Formulários ofereciam produtos sem vínculo e tipo de movimentação redundante | Cada ação tem seu formulário, categoria e sabor oficial. A confirmação exige um vínculo persistido e a permissão correspondente. |
| Lotes e ledger eram gravados separadamente | A rotina SQL preparada une as gravações, confere saldos e vínculo, usa a sessão para auditoria e evita duplicação por chave de idempotência. |
| Retirada vinculada registrava o consumo da reserva sem baixar lotes | A rotina preparada combina o consumo existente e a baixa FEFO na mesma transação, preservando a baixa do disponível feita na reserva. |
| Histórico oferecia poucos filtros | Consulta por sabor, código do lote, operação, responsável e período, com paginação. |
| Menu lateral relatado como desatualizado | A branch oficial e a worktree do OpenCode foram comparadas. A revisão conservou o menu compartilhado da versão oficial mais recente encontrada e suas permissões. Uma revisão de menu adicional depende da referência ou do commit correspondente. |

## Diagnóstico e banco

O [diagnóstico dos 26 sabores](diagnostico-vinculos-salgados.md) documenta os
produtos consultados, IDs atuais e casos ambíguos. A homologação tinha 31
produtos, zero lotes, zero movimentos e zero reservas. Nenhum dos 26 sabores
tinha um candidato unitário que pudesse ser vinculado automaticamente. O layout
desta revisão foi [aprovado visualmente](aprovacao-visual-estoque-salgados.md),
sem aprovação operacional.

A instalação dos scripts de cadastro e de operações de lote, a conciliação do
saldo legado e a homologação da vinculação de modalidades comerciais seguem
pendentes. A confirmação de operações por sabor fica indisponível até o vínculo
ser registrado. A confirmação das ações que movimentam lotes usa a nova rotina
SQL. O código SQL foi preparado e testado fora do banco remoto.

## Validação

- Typecheck e build em configuração de homologação aprovados.
- 52 testes automatizados de estoque, reservas, Dashboard A01 e Néia
  Inteligência aprovados.
- 19 verificações em navegador local com respostas controladas. O teste
  percorreu as janelas revisadas, responsividade, menu compartilhado,
  Dashboard A01, Minhas tarefas e Néia Inteligência. As capturas mostram a
  situação sem vínculos, compatível com a leitura feita em homologação.
- PostgreSQL 17 local com estrutura de teste validou entrada, replay,
  rejeição de vínculo, proteção da reserva, baixa FEFO, inventário a zero
  e auditoria. As RPCs existentes de ledger e consumo foram representadas
  por funções de teste. A execução conjunta com elas em homologação ficará
  para a etapa autorizada de banco.

## Relatórios e impressão

A Central de Relatórios de Estoque está [registrada como etapa
futura](estoque-salgados-codex.md). O [cadastro oficial de 26 sabores](cadastro-oficial-salgados-26.md)
foi preparado após a aprovação visual, aplicado em homologação e verificado conforme [registro de aplicação](aplicacao-cadastro-oficial-26.md).
