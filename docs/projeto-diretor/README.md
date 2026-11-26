# Projeto Diretor do ERP Néia Salgados

Este protocolo é permanente. Codex, OpenCode e qualquer outro agente de
desenvolvimento devem consultar este documento, o [AGENTS.md](../../AGENTS.md)
e as especificações e referências aprovadas do módulo antes de iniciar uma tarefa.

## ERP e ambientes oficiais

Existe um único ERP Néia Salgados oficial. O desenvolvimento continua no
projeto existente. Todos os layouts e funcionalidades aprovados devem ser
preservados. É proibido reiniciar o ERP, criar versões paralelas para aprovação
ou substituir funcionalidades aprovadas.

| Item | Configuração oficial |
| --- | --- |
| Endereço de homologação | [Homologação oficial do ERP](https://erp-neia-salgados-git-resga-dcaca5-luiz988061337-3147s-projects.vercel.app) |
| Branch de integração | `resgate-visual-h01-h07-codex` |
| Supabase de homologação | `lflzlcqinarrcgncafol` |
| Configuração de homologação | `NEIA_AMBIENTE=homologacao` e `VITE_DEMO_PREVIEW=0` |
| Supabase de produção protegido | `ruioyioynwwwiqbjznoa` |

Toda homologação e aprovação manual acontece no endereço fixo acima. O uso do
modo demonstração em homologação é proibido. Qualquer alteração em produção
depende de autorização expressa do proprietário.

## Desenvolvimento e integração

1. Consulte as especificações, imagens de referência e checkpoints aprovados.
   Confirme o escopo e sincronize a base Git antes de começar.
2. Em trabalhos paralelos, use uma branch e uma worktree isoladas para cada
   frente. Coordene a edição de arquivos compartilhados e combine a ordem das
   integrações com quem estiver trabalhando na mesma área.
3. Antes de integrar, confira a branch oficial, o estado dos trabalhos em
   andamento e possíveis conflitos. Preserve todo o trabalho já integrado.
   Integre somente as mudanças da etapa em curso, de forma controlada, em
   `resgate-visual-h01-h07-codex`. Aguarde se houver trabalho que possa ser
   sobrescrito ou interrompido.
4. Coordene migrations e publicações antes de executá-las. É proibido executar
   migrations concorrentes no mesmo banco ou fazer publicações conflitantes no
   ambiente oficial. Defina a ordem e confirme o destino da operação.

## Homologação e aprovação

1. Execute os testes de regressão pertinentes antes de publicar. Confira o
   typecheck e o build para alterações de código e valide o ambiente de destino.
2. Publique a versão a homologar somente no ambiente oficial. Confirme que o
   endereço fixo serve o commit pretendido e confira os módulos afetados e os
   fluxos aprovados relevantes.
3. Aguarde a aprovação manual do proprietário. Registre cada etapa aprovada
   na documentação, em um commit e em um checkpoint versionado. Registre os
   testes, as referências aprovadas e as pendências reais da etapa.

## Histórico do Projeto Diretor

- [Segurança dos ambientes — norma permanente](seguranca-ambientes/README.md)
- [Incidente de 26/11/2026 — operações em produção](seguranca-ambientes/incidente-2026-11-26.md)
- [Auditoria das migrações 0125–0127](seguranca-ambientes/migracoes-0125-0127.md)
- [A01 — Dashboard Administrativo](A01-dashboard/status.md)
- [A02 — Néia Inteligência](A02-neia-inteligencia/status.md)
- [Menu lateral — aprovação definitiva e padrão obrigatório](menu-lateral/status.md)
- [Estoque de Salgados — aprovação visual e cadastro de 26 sabores](estoque-salgados/status.md)
- [Aplicação do cadastro oficial de 26 sabores em homologação](../estoques/aplicacao-cadastro-oficial-26.md)
- [Organização da sequência dos sabores](../estoques/organizacao-sequencia-sabores.md)
- [H02 — Central de Pedidos, aprovação visual](H02-central-pedidos/status.md)
