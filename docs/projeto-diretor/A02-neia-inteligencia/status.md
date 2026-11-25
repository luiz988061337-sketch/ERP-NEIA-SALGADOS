# A02.1 — Status da entrega

Data: 26/11/2026 (atualização A02.1.1)
Branch: `resgate-visual-h01-h07-codex`
Base integrada: A01/A01.1 (`0c11da6`) + E01 (merge `caee4a8`)
Commit da funcionalidade: `d1e9f96`
Commit remoto validado: `d93d8a3`
Commit A02.1.1 (ajustes finais): `bc437ab`

## A02.1.1 — Entregue

- Estoque por sabor: separa ausência de cadastro (nunca teve lote) de estoque
  zerado; alerta sabores sem mínimo e reservas acima do físico.
- Fontes com situação colorida: dados suficientes (verde), parciais (ouro),
  sem registros (azul) e falha de consulta (vermelho); ausência de registros
  nunca é tratada como operação normal.
- Reativação comercial nas faixas 30–59, 60–89 e 90+ dias, sempre respeitando
  o opt-out do CRM.
- Variação de vendas de 0% apresentada como "Vendas estáveis", nunca como queda.
- Financeiro: contas a pagar próximas do vencimento (7 dias) e recebimentos
  atrasados.
- Entregas: alerta de atraso registrado e não resolvido.
- Cada recomendação abre em detalhe; o link do módulo e o **Sugerir tarefa**
  ficam no detalhe e a criação continua dependendo de confirmação.
- Dashboard A01 preservado (`escopo: "a01"`), sem os novos alertas da A02.1.1.

## Entregue

- Item **Néia Inteligência** no grupo Gestão do menu administrativo.
- Aba `#neia-inteligencia` com as três seções previstas.
- Monitoramento preventivo operacional sobre Estoque, Produção, Entregas,
  Financeiro e Comercial.
- Motor único de regras reutilizado pelo Dashboard e pela aba dedicada.
- Botão **Consultar Néia Inteligência** do Dashboard ativo.
- Recomendações com categoria, prioridade, natureza (fato/estimativa/previsão),
  motivo, dados utilizados, atualização, ação, link e **Sugerir tarefa**.
- Sugestão de tarefa apenas abre o formulário; criação depende de confirmação.
- A02.2 e A02.3 sinalizadas como etapas não autorizadas, sem simulação.
- Referência visual em `referencia-visual.png`.

## Publicação A02.1.1 (26/11/2026)

| Item | Resultado |
| --- | --- |
| Commit do código | `bc437ab` (fast-forward, sem force push) |
| Deployment | `dpl_4EikpwYz48XJp2ndUCoi3H7Ydyth` — READY |
| URL do deployment | `https://erp-neia-salgados-cry29noen-luiz988061337-3147s-projects.vercel.app` |
| Alias fixo | Apontando para `dpl_4EikpwYz48XJp2ndUCoi3H7Ydyth` |
| Banco do build | `lflzlcqinarrcgncafol` (`VITE_SUPABASE_URL` e `VITE_SUPABASE_PROJECT_ID`) |
| Modo | `VITE_DEMO_PREVIEW=0`, `NEIA_AMBIENTE=homologacao` |
| Verificação do bundle | Entrada `index--6Hf52k3.js` contém `lflzlcqinarrcgncafol` e não contém `ruioyioynwwwiqbjznoa`; chunk `admin-B-4NZMJA.js` contém `estoque-sem-cadastro`, `Sabores sem estoque cadastrado`, `reativar90mais`, `Abrir recomendação`, `financeiro-vencendo` e `entregas-atrasadas` |
| CSS da A02.1 | `neia-inteligencia-DdZiHrsS.css` idêntico ao build local |
| Configuração permanente | Registrada no `AGENTS.md` (ambientes, branch, bloqueios e proibição de force push) |

## Publicação A02.1 (25/11/2026)

| Item | Resultado |
| --- | --- |
| Commit remoto | `d93d8a3` (fast-forward, sem force push) |
| Deployment | `dpl_kkMTfSAWdkQKb3QSKEbirpjhCoAR` — READY |
| Alias fixo (na época) | Confirmado apontando para `dpl_kkMTfSAWdkQKb3QSKEbirpjhCoAR` |
| Verificação do bundle | Entrada `index-CqjLLGb6.js` com `lflzlcqinarrcgncafol`, sem `ruioyioynwwwiqbjznoa` |

Endereço fixo:
`https://erp-neia-salgados-git-resga-dcaca5-luiz988061337-3147s-projects.vercel.app/admin#neia-inteligencia`

## Correção da publicação anterior

O deployment anterior (`dpl_A2Cf2EX1kdo37x895aRWv1M8hSvq`) foi gerado pela CLI
sem os valores da branch e herdou o ambiente padrão de Preview
(`ruioyioynwwwiqbjznoa`, `VITE_DEMO_PREVIEW=1`), por isso exibia os painéis
antigos. O novo deployment foi gerado com os valores de homologação explícitos
no build e em tempo de execução.

## Validação

| Item | Resultado |
| --- | --- |
| Testes A02.1 | 15/15 passaram (9 originais + 6 novos da A02.1.1) |
| Regressão A01 | 9/9 passaram |
| Typecheck | Passou |
| ESLint/Prettier | Passou |
| Build local de homologação | Passou (`admin-EumO1iYl.js` com A02.1.1; `index` com `lflzlcqinarrcgncafol` e sem ref de produção) |
| Migrations | Nenhuma criada ou aplicada |
| Production / `main` | Não alterados |

## Pendências reais

1. Conferência autenticada no endereço fixo: falta validar login, dados reais,
   filtros, links e criação de tarefa com o proprietário. Se o navegador
   mantiver o HTML anterior, fazer recarregamento forçado (Ctrl+F5).
2. A02.2 Previsões e cenários: aguardando autorização.
3. A02.3 Consulta inteligente: aguardando autorização.
4. O Preview mantém a proteção de acesso da Vercel; sem sessão, a URL redireciona
   para o login da Vercel.

## Observações

- O build da Vercel confirmou o CSS `neia-inteligencia-*.css` e o bundle da
  administração com a A02.1.
- Nenhum dado real foi gravado ou alterado durante os testes.
- A demonstração local não substitui a conferência autenticada.
