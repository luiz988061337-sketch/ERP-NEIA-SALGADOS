# A02.1 — Status da entrega

Data: 26/11/2026 (atualização A02.1.2)
Branch: `resgate-visual-h01-h07-codex`
Base integrada: A01/A01.1 (`0c11da6`) + E01 (merge `caee4a8`)
Commit da funcionalidade: `d1e9f96`
Commit remoto validado: `d93d8a3`
Commit A02.1.1 (ajustes finais): `bc437ab`

## A02.1.2 — Em homologação, aguardando aprovação manual (26/11/2026)

**A02.1.2 (gerenciamento de recomendações preventivas e tarefas) está
implementada e publicada na homologação. A etapa ainda NÃO está encerrada:**
falta a homologação manual e a aprovação visual do proprietário, e nenhum
checkpoint final foi criado.

- Migrations `0125` (A01) e, na correção de 26/11/2026, `0126` (recomendações) e
  `0127` (tarefas) aplicadas em `lflzlcqinarrcgncafol`. A base de produção também
  contém os objetos A01/A02, **vazios** (0 registros); a remoção depende de
  autorização expressa do proprietário (ver "Correção de 26/11/2026").
- Novas capacidades: situação por recomendação (pendente, ciente, adiada, com
  tarefa, resolvida, dispensada), ciência, adiamento com limite de 24 horas
  para crítico, dispensa com motivo, reativação por recorrência, resolução
  automática por reavaliação dos dados, exclusão lógica com motivo, lixeira,
  restauração, reabertura e vínculo anti-duplicidade entre recomendação e
  tarefa.
- Relatório técnico: `a02.1.2-implementacao.md`.
- Teste SQL de permissões: `recomendacoes-tarefas-rls.test.sql` (executado em
  homologação, com sucesso).

### Correção de 26/11/2026 — cache A02 e menu único

**Commit da correção:** `c31986d` (fast-forward, sem force push).

**Causa do `PGRST205`:** as migrations `0126` e `0127` nunca tinham sido
aplicadas em `lflzlcqinarrcgncafol`. O CLI `supabase --linked` resolvia para o
projeto de produção (`ruioyioynwwwiqbjznoa`), então as auditorias e a aplicação
anterior de DDL atingiram a base errada. Não era falha de cache do PostgREST,
de RLS nem de grants.

Correções aplicadas:

- `0126` e `0127` aplicadas em homologação; `NOTIFY pgrst` recarregou o schema.
  O PostgREST passou a responder `42501` (tabela presente, sem grant para
  `anon`) em vez de `PGRST205`.
- `src/lib/neia-recomendacoes.ts`: histórico ordenado por `ocorreu_em`, a coluna
  existente. Antes usava `ocorrido_em` e recebia `42703`, deixando o histórico
  sem carregar.
- `src/components/admin/admin-shell.tsx`: toda página administrativa real recebe
  o menu aprovado da A01.1 com **Minhas tarefas** no grupo Principal, sem exigir
  que cada rota declare `menuTarefas`. A prévia/demonstração continua com o
  catálogo completo e sem "Minhas tarefas". **Néia Inteligência** permanece no
  grupo Gestão.
- `supabase/.temp/linked-project.json`: vínculo do CLI corrigido para
  `lflzlcqinarrcgncafol`.

**Atenção:** o `.env` local (não versionado) foi corrigido no P0 de 26/11/2026
para apontar ao projeto de homologação. O incidente e a norma permanente estão em
[segurança dos ambientes](../seguranca-ambientes/README.md) e
[incidente de 26/11/2026](../seguranca-ambientes/incidente-2026-11-26.md).

#### Validação REST autenticada (homologação)

Usuário temporário com papel `admin`, removido ao final junto com os registros:

| Verificação | Resultado |
| --- | --- |
| Ler `a02_recomendacoes` | 200 |
| Inserir recomendação | 201 |
| Marcar como `ciente` | 200 |
| Histórico A02 (`order=ocorreu_em`) | 200, eventos `detectada` e `ciente` |
| Histórico A02 com `ocorrido_em` (antes da correção) | 400 `42703` |
| Criar `a01_tarefas` | 201 |
| "Minhas tarefas" (`responsavel_id`) | 200 com a tarefa criada |
| Exclusão lógica com motivo | 200 e histórico `excluida` |
| Leitura de A02 por usuário sem papel admin | 200 com lista vazia (RLS) |

#### Produção

- Os objetos A01/A02 existem na base de produção e estão vazios (0 registros em
  `a01_tarefas`, `a01_tarefas_historico`, `a02_recomendacoes` e
  `a02_recomendacoes_historico`). Nenhum dado de negócio foi alterado.
- A sonda `public.opencode_cache_probe`, criada durante o diagnóstico na base
  errada, foi removida de produção.
- A remoção dos objetos A01/A02 de produção **não** foi executada; aguarda
  autorização expressa do proprietário.

#### Testes desta correção

| Item | Resultado |
| --- | --- |
| `node --test` (Néia, recomendações, dashboard A01, sabores) | 47/47 |
| `npm run typecheck` | Passou |
| ESLint dos arquivos alterados | Passou |
| `npm run build` com `VITE_DEMO_PREVIEW=0` e `NEIA_AMBIENTE=homologacao` | Passou |
| Bundle | 10 referências a `lflzlcqinarrcgncafol`, nenhuma a `ruioyioynwwwiqbjznoa` |

#### Publicação desta correção (26/11/2026)

| Item | Resultado |
| --- | --- |
| Deployment | `dpl_8hiRSWJRK1pq61WcPdwJS7DPi2BL` — Ready (preview) |
| URL do deployment | `https://erp-neia-salgados-4zaq12j18-luiz988061337-3147s-projects.vercel.app` |
| Alias fixo | Apontando para o deployment acima (confirmado por `vercel inspect`) |
| Build | `--prebuilt` com `VITE_SUPABASE_URL=https://lflzlcqinarrcgncafol.supabase.co`, `VITE_DEMO_PREVIEW=0` e `NEIA_AMBIENTE=homologacao` |
| Bundle enviado | 10 referências a `lflzlcqinarrcgncafol`, nenhuma a `ruioyioynwwwiqbjznoa`; `ocorreu_em`, `Minhas tarefas` e `a02_recomendacoes` presentes |
| Resposta do alias | HTTP 302 para o login da Vercel (proteção do Preview mantida) |

A conferência visual do menu nas páginas citadas continua pendente de aprovação
manual do proprietário no alias fixo. Nenhum checkpoint final foi criado.

### Publicação A02.1.2 (26/11/2026)

| Item | Resultado |
| --- | --- |
| Commit do código | `f211de0` (fast-forward, sem force push) |
| Deployment | `dpl_DGQf1a47MBDkcvKvCtQ74kXrkZn1` — READY (preview) |
| URL do deployment | `https://erp-neia-salgados-phhx9b178-luiz988061337-3147s-projects.vercel.app` |
| Alias fixo | Apontando para `dpl_DGQf1a47MBDkcvKvCtQ74kXrkZn1` |
| Banco do build | `lflzlcqinarrcgncafol` (`VITE_SUPABASE_URL` e `VITE_SUPABASE_PROJECT_ID`) |
| Modo | `VITE_DEMO_PREVIEW=0`, `NEIA_AMBIENTE=homologacao`, `VITE_NEIA_AMBIENTE=homologacao` |
| Verificação do bundle | `index-BYRoqY7S.js` contém `lflzlcqinarrcgncafol` e não contém `ruioyioynwwwiqbjznoa`; `admin-DAms4Ar9.js` contém `Marcar ciente` e `a02_recomendacoes` |
| Resposta do alias fixo | HTTP 200 |

## Aprovação (26/11/2026)

**A02.1 e A02.1.1 aprovadas visualmente pelo proprietário** no endereço fixo de
homologação. Testes manuais realizados:

- Monitoramento preventivo nas cinco áreas com dados reais.
- Detalhamento das recomendações (Abrir recomendação) e acesso aos módulos.
- Sugestão de tarefa, aprovação e criação de tarefas.
- Integração com Minhas tarefas e com o Dashboard A01.

## Pendências pós-aprovação (não bloqueiam a etapa)

1. **Validação dos demais setores**: acompanhar as regras novas (estoque por
   sabor, financeiro, entregas) com a operação real de cada área ao longo do
   uso, ajustando limiares se necessário.
2. **Sincronização dos novos alertas no Dashboard A01**: avaliar quando e
   quais alertas da A02.1.1 entram no conjunto do Dashboard (hoje ele mantém
   `escopo: "a01"` por decisão aprovada).
3. **Prioridade automática das tarefas sugeridas**: hoje a prioridade da
   tarefa sugerida acompanha a recomendação; definir regra dedicada se o
   proprietário desejar outra classificação.
4. **Atribuição a funcionários**: permitir que a sugestão de tarefa indique o
   responsável (hoje a atribuição é feita na confirmação da tarefa).

## Encerramento

Etapa A02.1/A02.1.1 encerrada em 26/11/2026, com checkpoint permanente no
GitHub (`checkpoint-a02.1`). A etapa seguinte é a **A02.2 — Previsões e
cenários**, que permanece bloqueada até autorização expressa do proprietário.

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

1. **A02.1.2**: homologação manual e aprovação visual do proprietário no alias
   fixo (roteiro em `testes.md`); nenhum checkpoint final criado.
2. A02.2 Previsões e cenários: aguardando autorização.
3. A02.3 Consulta inteligente: aguardando autorização.
4. Validações e ajustes pós-aprovação listados na seção "Pendências
   pós-aprovação" (não bloqueiam o uso).
5. O Preview mantém a proteção de acesso da Vercel; sem sessão, a URL redireciona
   para o login da Vercel.

## Observações

- O build da Vercel confirmou o CSS `neia-inteligencia-*.css` e o bundle da
  administração com a A02.1.
- Nenhum dado real foi gravado ou alterado durante os testes.
- A demonstração local não substitui a conferência autenticada.
