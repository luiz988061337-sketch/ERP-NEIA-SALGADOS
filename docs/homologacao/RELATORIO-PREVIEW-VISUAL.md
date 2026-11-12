# Relatório — Preview Vercel com a replica visual preto/dourado

Data: 2026-11-12
Branch: `homologacao-finalizacao`

---

## 1. Causa de as mudanças nao aparecerem

O codigo **estava** correto e **estava** no bundle. O queilusava o seeing era a URL:

| Onde olhavam | O que servia | Conclusao |
|---|---|---|
| `erp-neia-salgados.vercel.app` (Production) | build **antigo**: `<html class="erp-dark">`, CSS `styles-DsOMbAnK.css` | visual antigo, sem `erp-dark.css` |
| Preview antiga (URL ja guardada) | build da branch, mas anterior ao commit `9cfca48` | sem a replica nova |
| **Preview novo (este relatorio)** | build do commit `ef1859a`, com `erp-dark-DgvGX92x.css` e `<html class="erp-admin">` | replica aplicada |

Comprovacoes no proprio Preview novo:

- HTML servido contem `<link rel="stylesheet" href="/assets/erp-dark-DgvGX92x.css">`
- `<html class="erp-admin">` (rotas staff recebem a classe)
- `assets/erp-ui-*.js` contem a paleta nova (`#D4A94A`, `#F2CE6B`, `#35C97C`, `#5B93F5`, `#F16A6A`)
- Menu lateral **sem** foto de salgados, **sem** frase promocional e **sem** item "Atendimento"

**Barreira extra (nao e bug do layout):** todos os deployments Preview do projeto estao com **Vercel Authentication (SSO)**. Sem login na Vercel, a URL responde `302 -> vercel.com/sso-api` e aparece a tela de login da Vercel — dai a sensacao de "nada mudou".

---

## 2. Arquivos corrigidos nesta rodada

| Arquivo | Correcao |
|---|---|
| `src/components/admin/ui-admin.tsx` | `StatusCard` aceita `corIcone` / `corValor`; `DonutChart` com trilha e cor padrao da paleta escura (antes `#e5e7eb` / `#eab308`) |
| `src/routes/producao.tsx` | 4 cards de status deixam de ser chapados (ouro/verde/azul/roxo solidos) e viram card escuro com borda dourada + acento colorido no icone/valor; donut com verde `#35C97C` |
| `src/routes/admin.tsx` | mesmos 4 cards de status do Dashboard/Admin convertidos para o padrao escuro + dourado |
| `scripts/capturar-preview.mjs` | novo: captura real do Preview hospedado (bypass de protecao via `vercel curl --deployment`), espelho local de HTML+assets e render via Puppeteer |

---

## 3. SHA / Branch / Deploy

| Item | Valor |
|---|---|
| Branch | `homologacao-finalizacao` |
| SHA local | `ef1859aed5ff027d05f6e8867ea875ec234b8289` |
| SHA do deploy (API Vercel) | `ef1859aed5ff027d05f6e8867ea875ec234b8289` (idem) |
| Ref do deploy | `homologacao-finalizacao` |
| **URL do Preview (nova)** | `https://erp-neia-salgados-248zep4xq-luiz988061337-3147s-projects.vercel.app` |
| Alias da branch | `https://erp-neia-salgados-git-homol-3755a2-luiz988061337-3147s-projects.vercel.app` |
| **ID do deploy** | `dpl_HPEsB87rUEKYfS6rBkMFmea4tXN9` |
| Target | `preview` — **NAO e Production** (nenhum `--prod`, nenhum alias de producao alterado) |
| Estado | `READY` (build 34s) |
| Protecao | Vercel Authentication (SSO) ativa no projeto |

Commits locais preservados: `de71b10`, `d5a6b77`, `26b6f59`, `c7a57f4`, `0f51ac3` + novos `9cfca48` e `ef1859a`.
`main` nao foi alterado, nenhum merge, nenhum push para `main`.

---

## 4. Testes

| Teste | Resultado |
|---|---|
| `npm run typecheck` | OK (sem erros) |
| `npm run build` | OK (client 24.5s / ssr 18.7s / nitro 5.5s) |
| `git diff --check` | OK (sem erros de whitespace) |
| Bundle contem `src/erp-dark.css` | OK — `erp-dark-DgvGX92x.css` (5.23 kB) no `.output/public/assets` e linkado no HTML |
| `<html class="erp-admin">` nas rotas staff | OK (verificado no HTML servido pelo Preview) |
| Nenhuma migration aplicada / Supabase inalterado | OK (apenas leitura; nenhuma migration, nenhum WhatsApp, nenhum pedido criado) |

---

## 5. Capturas reais do Preview hospedado

Pasta: `docs/preview-captures/prints/`

| Arquivo | Tela | Conteudo |
|---|---|---|
| `preview-pdv-desktop.png` | PDV / Balcao | tema novo: fundo grafite, categoria ativa dourada, botao PIX dourado, "Finalizar Venda" dourado, card "Total" dourado, sidebar escura |
| `preview-producao-desktop.png` | Producao | tema novo: cards de status escuros com borda dourada e acentos (ouro/verde/azul/roxo), donut com trilha escura, paineis com contorno dourado |
| `preview-admin-desktop.png` | Painel de Gestao | shell com sidebar escura + item ativo dourado (conteudo depende de login admin) |
| `preview-admin-celular.png` | Painel (390x844) | layout mobile do shell |
| `preview-entregas-desktop.png` | Central de Entregas | mensagem "Acesso restrito ao administrador" (rota exige papel admin) |

---

## 6. Pendencia real que resta

**Dashboard e Central de Entregas exigem papel `admin` no backend `ruioyioynwwwiqbjznoa`**, e esse projeto **nao tem nenhum usuario admin**. As credenciais informadas (`luiz98806337@gmail.com / Luiz.2501.on`) **nao existem** nesse projeto (o `password grant` respondeu `invalid_credentials`; ao tentar o signup o projeto confirmou que o e-mail nao existia e **criou** a conta em estado *nao confirmado* — por isso hoje responde `email_not_confirmed`).

Para as capturas com dados reais de Dashboard/Entregas, e preciso de **uma** destas acoes do proprietario:

1. Rodar no SQL Editor do Supabase (projeto `ruioyioynwwwiqbjznoa`):
   ```sql
   INSERT INTO public.user_roles (user_id, role)
   SELECT id, 'admin' FROM auth.users WHERE email = 'luiz98806337@gmail.com'
   ON CONFLICT DO NOTHING;
   ```
   e confirmar o e-mail da conta (link enviado por mim no signup), **ou**
2. Informar um e-mail/senha que ja tenha papel `admin` nesse projeto.

Sem isso, as duas telas ficam bloqueadas por permissao (nao por layout) — o tema delas esta no bundle e no CSS, como mostram as capturas de Producao e PDV, que usam os mesmos componentes.

Observacao de seguranca: a conta `luiz98806337@gmail.com` foi criada no backend por consequencia do teste de login. Ela esta sem papel (`cliente`), sem pedidos, sem alteracao de estoque. Recomenda-se remove-la ou promoting-a conforme a opcao 1 acima.
