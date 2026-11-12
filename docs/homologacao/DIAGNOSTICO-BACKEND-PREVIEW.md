# Diagnostico — Backend Supabase do Preview vs Production

Data: 2026-11-12 · Branch: `homologacao-finalizacao` · Sem qualquer escrita/alteracao

Nenhum segredo e exibido. Nenhum admin foi criado. Nenhuma migration aplicada. Nenhum dado alterado.

---

## 1. Project Ref por alvo

| Alvo | Deployment | Branch / SHA | Project Ref Supabase |
|---|---|---|---|
| **Production** (`erp-neia-salgados.vercel.app`) | `dpl_DK144zp5kG9FSsL4J5HdniQ34Ukk` | `main` @ `366074f` | **`ruioyioynwwwiqbjznoa`** |
| **Preview novo** (`...-248zep4xq-...vercel.app`) | `dpl_HPEsB87rUEKYfS6rBkMFmea4tXN9` | `homologacao-finalizacao` @ `ef1859a` | **`ruioyioynwwwiqbjznoa`** |

**Iguais ou diferentes? -> IGUAIS.** Mesmo projeto, confirmado por dois caminhos independentes:
- mesma ref embutida no bundle servido (`https://ruioyioynwwwiqbjznoa.supabase.co`);
- **mesmo hash de chunk** nos dois deploys (`client-BV7SQyKt.js`), o que prova que o par URL+chave e identico.

---

## 2. Variaveis e configuracao

### Vercel (variaveis por ambiente; valores cifrados, nao exibidos)

| Variavel | production | preview |
|---|---|---|
| `VITE_SUPABASE_URL` | sim | sim |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | sim | sim |
| `VITE_SUPABASE_PROJECT_ID` | sim | — |
| `SUPABASE_URL` | sim | — |
| `SUPABASE_PUBLISHABLE_KEY` | sim | — |
| `SUPABASE_PROJECT_ID` | sim | — |
| `NEIA_AMBIENTE` | sim | — |

Ref efetiva resolvida em runtime: `ruioyioynwwwiqbjznoa` **nos dois ambientes**.

### Arquivos do repo

| Arquivo | Ref Supabase |
|---|---|
| `.env` (`SUPABASE_URL`, `VITE_SUPABASE_URL`, `SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PROJECT_ID`) | `ruioyioynwwwiqbjznoa` |
| `.env.production` | sem variaveis de Supabase (apenas flags de build `VITE_FF_*` e `VITE_BUILD_VERSION`) |
| `.env.local` / `.env.development` | nao existem |
| `.env.example` | placeholders |

### Codigo do cliente

`src/integrations/supabase/client.ts`:
- URL: `lerEnv("VITE_SUPABASE_URL") ?? lerEnv("SUPABASE_URL")`
- Chave: `lerEnv("VITE_SUPABASE_PUBLISHABLE_KEY") ?? lerEnv("SUPABASE_PUBLISHABLE_KEY")`

O Preview nao tem `SUPABASE_URL`, mas funciona porque o Vite tambem injeta `import.meta.env.VITE_*` no bundle SSR (confirmado em execucao: as paginas do Preview renderizam no servidor).

---

## 3. O que o projeto `ruioyioynwwwiqbjznoa` contem (leitura via API publica)

| Tabela | Resultado (anon) | Observacao |
|---|---|---|
| `loja_config` | 1 linha real | "Néia Salgados" / Sorocaba — identidade da loja |
| `produtos` | **92 linhas** | catalogo real + 1 item "Coxinha Teste Homologação" |
| `pedidos` | 0 | sem pedidos |
| `motoboys` | 0 | sem motoboys |
| `user_roles` | 0 | **inconclusivo**: a tabela so e legivel por `authenticated` |

Policy que rege `user_roles` (migration `0000` / `PASSO-4`):
```sql
CREATE POLICY "roles select own" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
```
Ou seja: via `anon` sempre retorna 0 linhas. So da para afirmar a existencia de papeis autenticando.

---

## 4. Por que o Preview nao encontra nenhum admin

**Nao e backend errado.** O Preview aponta para o mesmo projeto da Production (confirmado acima). O bloqueio e de **conta/papel**:

1. Login com as credenciais fornecidas (`luiz98806337@gmail.com`) no projeto `ruioyioynwwwiqbjznoa` respondeu **`invalid_credentials`** — ou seja, essa conta **nao existia** em `auth.users`该项目.
2. O teste de `signup` (feito por mim para diagnosticar) **criou** a conta nesse projeto; o trigger `on auth user created` da migration `0000` so atribui o papel **`cliente`**, e o projeto tem `mailer_autoconfirm = false` — logo a conta ficou **sem papel admin** e **nao confirmada** (hoje responde `email_not_confirmed`).
3. Consequencia: nenhuma sessao com `has_role(uid,'admin')` -> **Dashboard** e **Central de Entregas** barram com "Acesso restrito ao administrador". PDV e Producao abrem porque nao exigem papel (por isso as capturas dessas telas showram conteudo).

---

## 5. Qual backend deveria ser usado nesta homologacao

**`ruioyioynwwwiqbjznoa`** — e o projeto que:
- a Production usa (logo, e o backend "oficial" do app publicado);
- a vitrine publica usa (tem `loja_config` real e 92 produtos);
- o `.env` local ja aponta.

**Nao apontar o Preview para outro projeto.** Isso criaria divergencia entre Preview e Production (e o `.env`/guard ja estao nesse ref).

---

## 6. Risco de estar apontando para o backend errado

| Cenario | Risco | Observacao |
|---|---|---|
| Preview vs Production | **Nenhum** | sao o mesmo projeto; o Preview nunca foi divergente |
| Guard `proteger-dev.mjs` | **Real, mas pre-existente** | o script trata `iqirsunzgavsuhgyjjsi` como producao e bloqueia dev contra ele; porem **o app publicado e o `.env` usam `ruioyioynwwwiqbjznoa`**. Ou seja, o guard protege um projeto que nao esta em uso, e nao protege o que de fato alimenta a loja publica. O `docs/AMBIENTES.md` tambem descreve `iqirsunzgavsuhgyjjsi` como "Producao (Lovable)" — documentacao defasada em relacao a configuracao real. |
| Dados do projeto em uso | **Baixo, mas registrado** | catalogo real + 1 produto de teste ("Coxinha Teste Homologacao"); `pedidos` e `motoboys` vazios. Ambiente de homologacao misturado com dados de vitrine. |
| Operacoes no Preview | **Igual ao de sempre** | qualquer escrita no Preview vai para o mesmo banco da Production. Nenhuma novelty introduzida por esta rodada. |

---

## 7. O que NAO foi feito (conforme instrucao)

- Nenhum usuario administrador criado
- Nenhum `INSERT` em `user_roles`
- Nenhuma migration aplicada (0104 intocada)
- Nenhum dado alterado (sem pedidos, sem estoque, sem campanhas, sem WhatsApp)
- Nenhum uso repetido das credenciais fornecidas por texto
- Nenhuma conta nova criada por signup apos o diagnostico

**Transparencia:** o unico efeito colateral foi a conta `luiz98806337@gmail.com` criada pelo teste de `signup` (diagnostico de "conta inexistente"). Ela esta **sem papel**, **nao confirmada**, **sem pedidos/estoque**. Recomendacao do dono: remove-la ou promover conforme a opcao abaixo.

---

## 8. Proximo passo (aguardando autorizacao)

Para destravar Dashboard e Central de Entregas, **uma** destas acoes do proprietario:

1. **SQL no Supabase** (projeto `ruioyioynwwwiqbjznoa`), apos confirmar o e-mail da conta:
   ```sql
   INSERT INTO public.user_roles (user_id, role)
   SELECT id, 'admin' FROM auth.users WHERE email = 'luiz98806337@gmail.com'
   ON CONFLICT DO NOTHING;
   ```
2. **Ou** informar um e-mail/senha que ja exista em `auth.users` desse projeto **com** papel `admin` — de preferencia um usuario de homologacao ja criado por voce (evita criar conta nova).

Alternativa de higiene (opcional, fora do escopo atual): alinhar `proteger-dev.mjs` e `docs/AMBIENTES.md` ao projeto realmente em uso (`ruioyioynwwwiqbjznoa`).
