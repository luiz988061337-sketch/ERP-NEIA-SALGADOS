# FRONTEND DO CUTOVER — ERP NÉIA SALGADOS

> Documento de referência para a etapa de frontend do corte.
> **Não publicar por este documento.** Ele descreve o que fazer.

---

## 1. FLAGS EXATAS (compile-time)

O build de corte é gerado a partir de **`.env.production`** (versionado no
repositório). A plataforma de deploy **recompila** a aplicação a partir do
fonte e lê esse arquivo — por isso ele precisa estar commitado.

```dotenv
# .env.production  (raiz do repositorio)
VITE_FF_CRIACAO_ATOMICA=on
VITE_FF_CONSUMO_RESERVA=on
VITE_FF_CANCELAMENTO_ATOMICO=on
VITE_FF_RESERVA_ATOMICA=off
VITE_BUILD_VERSION=1792429500000
VITE_VERSAO_MINIMA=1792429500000
VITE_BUILD_LABEL=cutover-2026-10-19-a1
```

| Flag | Valor | Efeito |
|------|-------|--------|
| `VITE_FF_CRIACAO_ATOMICA` | `on` | Criação atômica 0095 obrigatória. O caminho legado de criação **não é compilado** no bundle. |
| `VITE_FF_CONSUMO_RESERVA` | `on` | Retirada de reserva explícita (0091) no painel de produção. "Iniciar preparo" **não** consome. |
| `VITE_FF_CANCELAMENTO_ATOMICO` | `on` | Cancelamento atômico 0093/0090. O `UPDATE` direto de status **não é compilado**. |
| `VITE_FF_RESERVA_ATOMICA` | `off` | **Por arquitetura**: a 0089 é chamada internamente pela 0095 (`SECURITY DEFINER`). O navegador nunca a chama; mantê-la `on` abriria uma rota RPC desnecessária. |

> `npm run dev` / `npm run build:dev` (modo `development`) **não** leem
> `.env.production` → o ambiente de desenvolvimento continua com as flags
> **desligadas**.

---

## 2. VERSÃO

| Item | Valor |
|------|-------|
| `VITE_BUILD_VERSION` | `1792429500000` |
| `VITE_VERSAO_MINIMA` | `1792429500000` |
| `VITE_BUILD_LABEL` | `cutover-2026-10-19-a1` |

A versão é **fixada** (epoch-ms) porque é o piso contra o qual os bundles
antigos são bloqueados. Depois do corte, subir `VERSAO_MINIMA` no runtime do
servidor invalida bundles antigos **sem novo deploy**.

---

## 3. COMANDO DE BUILD

```bash
# build local de conferência (o mesmo que a plataforma executa)
npm run build

# ou, com a versão fixada explicitamente (o que o pacote usa)
BUILD_VERSION=1792429500000 BUILD_LABEL=cutover-2026-10-19-a1 node scripts/build-cutover.mjs
```

O script `build-cutover.mjs` **falha** (exit ≠ 0) se encontrar qualquer call
site legado no bundle ou se a versão não estiver gravada.

---

## 4. SHA ESPERADO / REGISTRADO

| Item | Valor |
|------|-------|
| SHA-256 do bundle de referência | `9d13ed828e09e2936bd74f38cf20c115e0dc39711eda7417f7bfce1ad2203d1` |
| Manifesto | `docs/auditoria/homologacao-staging/BUILD-CUTOVER.json` |
| Build mais recente validado | `1792429500000` / `cutover-2026-10-19-a1` |

> ⚠️ **O build não é byte-reproduzível** (a plataforma injeta nomes/timestamps).
> O SHA-256 identifica **o artefato específico**; a **versão** é o invariante
> (é ela que o guard de versão e o `VERSAO_MINIMA` usam). **Registrar o SHA de
> `BUILD-CUTOVER.json` imediatamente antes de publicar.**

---

## 5. PROVA DE ZERO CAMINHOS LEGADOS

Executada por `scripts/build-cutover.mjs` e por `scripts/preflight-legado.mjs`:

```bash
node scripts/preflight-legado.mjs
# esperado: PREFLIGHT_LEGADO_OK  (protected=17  vivos=0)
```

| Padrão procurado | Esperado no bundle de corte |
|---|---|
| `rpc("reservar_estoque_atomica"` | **0** |
| `rpc("liberar_reserva_atomica"` | **0** |
| `.from("reservas_estoque").insert/update/delete` | **0** |
| `.from("pedidos").insert` | **0** |
| `.from("pedidos").update({status:"cancelado"})` | **0** |
| `.from("estoque_movimentacoes").insert` | **0** |
| `.from("pedido_itens").insert` (fora da 0095) | **0** |

No **código-fonte** as 17 ocorrências existem, mas todas atrás de
`if (!BUILD_DE_CORTE …)` — blocos eliminados em tempo de build.

Presença obrigatória no bundle: `criar_pedido_com_reserva` (0095),
`cancelar_pedido_atomico` (0093), `registrar_consumo_reserva` (0091),
`reservar_pedido_atomico` (0089, interna) e o endpoint `/api/versao`.

---

## 6. `/api/versao`

| Aspecto | Comportamento |
|---|---|
| Rota | `GET /api/versao` |
| Autenticação | **nenhuma** (o cliente precisa antes de autenticar) |
| `Cache-Control` | `no-store, no-cache, must-revalidate, max-age=0` |
| `Pragma` | `no-cache` |
| Resposta | `{"ok":true,"atual":"…","minimo":"…","rotulo":"…","corte":true,…}` |
| `atual` | a versão do bundle publicado |
| `minimo` | `VERSAO_MINIMA` do runtime, senão `VITE_VERSAO_MINIMA` do build |
| `corte` | `true` quando há piso de versão ativo |

O **documento HTML** também é servido com
`cache-control: no-store, no-cache, must-revalidate, max-age=0`, para que o
navegador nunca fique preso no HTML antigo (que aponta para o bundle antigo).
Os assets (`/assets/*`) são `immutable` — o nome do arquivo tem hash de conteúdo.

---

## 7. COMPORTAMENTO DO FRONTEND ANTIGO

| Situação | Resultado |
|---|---|
| Navegador aberto **antes** do corte, com bundle antigo | Ao carregar/tentar operar, o bundle lê `/api/versao`, compara a própria versão com a mínima e **se auto-bloqueia** com a tela "Atualização obrigatória" + botão "Recarregar agora". Não depende de o usuário apertar F5. |
| Bundle antigo tentando **escrever** reserva pelo caminho legado | Impossível: o bundle de corte não tem o código, e o **lockdown de ACL** (`08_LOCKDOWN-ACL.sql`) revoga o DML de `reservas_estoque` e o EXECUTE das RPCs legadas para `authenticated`. |
| Endpoint `/api/versao` fora do ar | **Fail-closed**: o bundle usa a mínima assada no build e bloqueia. Indisponibilidade de rede **nunca** libera um bundle velho. |
| Bundle novo (versão ≥ mínima) | Opera normalmente. |

Camadas de proteção (nenhuma depende só de frontend):

1. **Bundle sem legado** — o caminho inseguro não é compilado.
2. **Guard de versão** — auto-bloqueio do bundle desatualizado.
3. **Lockdown de ACL** — o banco recusa a escrita legada. *(É a barreira real.)*

---

## 8. PROCEDIMENTO DE PUBLICAÇÃO PELO LOVABLE

1. **Antes**: confirmar `BUILD-CUTOVER.json` presente e o `.env.production`
   commitado com as 7 variáveis.
2. **Commit**: versionar o código (migrations, scripts, `.env.production`,
   pacote de cutover). O push para o branch conectado é o que dispara a
   sincronização e a publicação na Lovable (conforme `AGENTS.md`).
3. **Publicação**: a plataforma recompila (`npm run build`) lendo o
   `.env.production`. Confirmar que as 7 variáveis chegaram ao build.
4. **Pós-publicação — bloqueios de frontend antigo**:
   ```bash
   curl -s -D- https://<host>/api/versao
   # esperado: HTTP 200, cache-control: no-store,
   #           "atual":"1792429500000","minimo":"1792429500000","corte":true
   ```
5. **Definir `VERSAO_MINIMA=1792429500000`** no runtime do servidor (o piso
   bloqueia bundles antigos imediatamente).
6. **Verificar no navegador**: abrir o app com um **bundle antigo** (aba
   aberta antes do corte) → deve aparecer a tela "Atualização obrigatória".
7. **Reabrir** (só depois do smoke funcional verde).

> **Atenção ao volume de commit**: a publicação carrega **todo** o trabalho de
> homologação. Decisão do responsável: um único PR revisado com os 160+
> arquivos, ou publicar a partir de um artefato pré-construído.

---

## 9. CHECKLIST DE PUBLICAÇÃO

- [ ] `BUILD-CUTOVER.json` presente, versão `1792429500000`, SHA conferido
- [ ] `.env.production` commitado com as 7 variáveis
- [ ] `node scripts/preflight-artefato.mjs` → `PREFLIGHT_ARTEFATO_OK`
- [ ] `node scripts/preflight-legado.mjs` → `PREFLIGHT_LEGADO_OK`
- [ ] `npm run typecheck` e `npm run build` sem erro
- [ ] `npm run build` **puro** (sem env explícito) → versão presente + 0 legado
- [ ] Publicado; `/api/versao` responde 200 com `corte: true`
- [ ] `VERSAO_MINIMA` definido no runtime
- [ ] Bundle antigo bloqueado (verificado no navegador)
- [ ] Fila de impressão: 1 job `pendente` (sem hardware necessário)
