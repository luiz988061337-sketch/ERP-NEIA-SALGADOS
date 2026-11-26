# Menu lateral — aprovação definitiva

Data: 26/11/2026

Status: **aprovado definitivamente pelo proprietário**.

A aprovação foi feita por conferência visual no endereço oficial de homologação:
<https://erp-neia-salgados-git-resga-dcaca5-luiz988061337-3147s-projects.vercel.app>.

## Objeto aprovado

- Versão funcional aprovada: commit
  `07b96de69afb52cba9c22005ba2ca209aa3c2c96` na branch
  `resgate-visual-h01-h07-codex`.
- Deploy de homologação conferido:
  `erp-neia-salgados-dwdd6uq3m-luiz988061337-3147s-projects.vercel.app`.
- Componente aprovado: `AdminShell`/`MenuLateral`, com fonte única em
  `src/components/admin/admin-shell.tsx` e definição de navegação em
  `src/components/admin/admin-nav.ts`.

`AdminShell`/`MenuLateral` é o **padrão obrigatório para todos os módulos
administrativos**. É proibido criar menu independente, substituir o componente
compartilhado ou reproduzir manualmente sua aparência em módulos internos.

Esta aprovação refere-se **exclusivamente ao menu lateral compartilhado**. Não
cobre painéis internos, regras de negócio, rotas, permissões, banco de dados,
produção nem novas publicações.

## Paleta oficial aprovada

| Elemento | Cor |
| --- | --- |
| Fundo | `#0A1015` |
| Cabeçalho e rodapé | `#10171D` |
| Itens | `#131B22` |
| Hover | `#26313A` |
| Bordas e divisórias | `#4E5861` |
| Texto principal | `#F5F7FA` |
| Texto secundário | `#BAC5CC` |
| Item ativo | `#FFD252` |
| Texto e ícone ativo | `#17110A` |

O item ativo usa `#FFD252` sólido, com texto e ícone escuros, sem gradiente. As
variáveis da paleta são aplicadas ao próprio `Sidebar`, sem alterar os painéis
internos. Marrons, preto absoluto, degradês antigos e bordas douradas
excessivas não fazem parte da identidade aprovada.

## Evidências preservadas

As capturas de referência permanecem versionadas e não foram alteradas:

- [Dashboard — menu completo](../../validacao-local/menu-padronizado/dashboard-menu.png) —
  SHA-256 `bdc5649daf2c9e87c698de8378ede08537dfdfe7d195f6d5936449a57e329e33`.
- [Pedidos — menu completo](../../validacao-local/menu-padronizado/pedidos-menu.png) —
  SHA-256 `56391fd2f00792f07a9cad97f17520e2774ad522be1dc1dff4b96c1494c5b18a`.
- [Estoque de Salgados — menu completo](../../validacao-local/menu-padronizado/estoque-salgados-menu.png) —
  SHA-256 `abe628da2bef53200992868ffbabecd3aeb2161004dcac0c0e75af75c6edfa85`.
- [Verificações de cor e estrutura](../../validacao-local/menu-padronizado/resultado.json).

Essas capturas são evidência visual isolada; a aprovação definitiva foi feita
na homologação oficial. Os arquivos `*-desktop.png` da mesma pasta também são
preservados.

## Checkpoint

Checkpoint versionado: tag anotada `checkpoint-menu-lateral-01`, criada sobre o
commit de registro desta aprovação. Ela consolida a documentação da aprovação
definitiva e a referência ao commit funcional `07b96de`.

## Regras de alteração

Qualquer alteração no menu lateral ou nessa identidade visual exige
autorização expressa do proprietário, nova conferência manual, atualização
desta documentação e novo checkpoint versionado. Até lá, não alterar paleta,
largura de 224 px, grupos, item selecionado, cabeçalho da logo, rodapé do
usuário, estrutura do componente compartilhado nem os tokens aprovados.
