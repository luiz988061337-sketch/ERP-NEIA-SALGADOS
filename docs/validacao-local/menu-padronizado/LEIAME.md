# Menu lateral padronizado — capturas locais

Evidência visual isolada do componente compartilhado `AdminShell`/`MenuLateral`.
Não é captura de homologação: o servidor local foi iniciado com
`VITE_DEMO_PREVIEW=1`, `NEIA_AMBIENTE=desenvolvimento` e o projeto de
homologação `lflzlcqinarrcgncafol`. Nenhuma requisição a Supabase/Lovable foi
permitida durante as capturas.

## Módulos capturados

- `dashboard-desktop.png` — `/admin#dashboard` (item ativo: Dashboard).
- `pedidos-desktop.png` — `/admin#pedidos` (item ativo: Pedidos).
- `estoque-salgados-desktop.png` — `/preview/estoque-salgados` (item ativo: Estoque de Salgados).

## Verificações

Para os três módulos, `resultado.json` registra:

- item ativo com `background-color: rgb(255, 210, 82)` (`#FFD252`);
- `background-image: none` (sem degradê dourado antigo);
- sidebar compartilhada com 224 px e nenhum menu independente;
- sem overflow horizontal em 1440 px;
- sem erros de JavaScript e sem acesso remoto ao banco.
