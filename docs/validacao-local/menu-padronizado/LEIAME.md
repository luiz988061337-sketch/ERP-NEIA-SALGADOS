# Menu lateral padronizado — capturas locais

Evidência visual isolada do componente compartilhado `AdminShell`/`MenuLateral`.
Não é captura de homologação: o servidor local foi iniciado com
`VITE_DEMO_PREVIEW=1`, `NEIA_AMBIENTE=desenvolvimento` e o projeto de
homologação `lflzlcqinarrcgncafol`. Nenhuma requisição a Supabase/Lovable foi
permitida durante as capturas.

## Paleta aplicada

Tokens aprovados dos painéis A01/A02.1 (`dashboard-a01.css`), aplicados somente
ao menu lateral:

- fundo: `#0a1015`;
- cabeçalho/rodapé: `#10171d`;
- itens: `#131b22`;
- divisórias/bordas: `#4e5861`;
- texto: `#f5f7fa`;
- texto suave/grupos e ícones não selecionados: `#bac5cc`;
- hover: `#26313a`;
- ouro aprovado: `#ffd252`;
- texto/ícone do item ativo: `#17110a`.

## Módulos capturados

- `dashboard-menu.png` — menu completo em `/admin#dashboard` (ativo: Dashboard).
- `pedidos-menu.png` — menu completo em `/admin#pedidos` (ativo: Pedidos).
- `estoque-salgados-menu.png` — menu completo em `/preview/estoque-salgados`
  (ativo: Estoque de Salgados).

Os arquivos `*-desktop.png` mantêm a página inteira correspondente.

## Verificações

Para os três módulos, `resultado.json` registra:

- item ativo com `background-color: rgb(255, 210, 82)` e texto/ícone
  `rgb(23, 17, 10)`, sem gradiente;
- fundo da sidebar `rgb(10, 16, 21)`, cabeçalho e rodapé `rgb(16, 23, 29)`,
  grupos `rgb(186, 197, 204)`, divisória `rgb(78, 88, 97)` e texto não
  selecionado `rgb(245, 247, 250)`;
- sidebar compartilhada com 224 px e nenhum menu independente;
- sem overflow horizontal em 1440 px;
- sem erros de JavaScript e sem acesso remoto ao banco.
