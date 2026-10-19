# PACOTE DE CUTOVER — LEIA-ME

**ERP Néia Salgados** · build `1792429500000` · `cutover-2026-10-19-a1`

> Este pacote está **pronto e validado**. Nenhum passo dele foi executado em
> produção. O ensaio completo (8/8 etapas, `PACOTE_OK`) foi feito num clone
> descartável a partir do snapshot pré-0087.

---

## SIM, VOCÊ PODE EXECUTAR O SQL — com estas condições

1. **A loja precisa estar fechada** (novos pedidos bloqueados) do passo 1 ao 12.
2. **Backup válido confirmado** antes de qualquer escrita.
3. **Executar na ordem.** Cada script é *fail-closed*: um `NO-GO` aborta
   (exit ≠ 0) e você para.
4. **Uma credencial de acesso ao banco de produção** — connection string do
   Postgres, PAT do Supabase, ou o acesso ao SQL Editor.

---

## DUAS MANEIRAS DE EXECUTAR

### Opção A — pelo Lovable (recomendado; 1 autorização)
Envie `PROMPT-UNICO-LOVABLE-CUTOVER.md`. Ele já traz a ordem, os critérios de
parada e o relatório final. Os arquivos do pacote vão anexos.

### Opção B — por conta própria

**B.1) Via SQL Editor (Supabase Dashboard)** — cole o conteúdo de cada arquivo,
um por vez, **na ordem**. Os scripts usam apenas SQL padrão (sem comandos
`psql`), então funcionam em qualquer runner — inclusive em runner que envolve
o lote em transação (validado: `PACOTE_TX_OK`).

**B.2) Via psql** (tem a connection string):
```bash
psql "$DATABASE_URL" --no-password --set ON_ERROR_STOP=1 --file 01_PRECHECK.sql
```
> `ON_ERROR_STOP=1` faz a primeira falha abortar o arquivo inteiro.

> **Validação do pacote:** `PACOTE_OK` (modo arquivo, psql) e `PACOTE_TX_OK`
> (modo transacional, emulando o SQL Editor) — 8/8 etapas nos dois modos.

---

## ORDEM (não pule etapas)

| # | Arquivo | O que faz | Veredicto esperado |
|---|---------|-----------|--------------------|
| 1 | `01_PRECHECK.sql` | Só leitura. Confere estado do banco | `PRECHECK_OK` |
| 2 | `02_MIGRATIONS-CUTOVER.sql` | Aplica 0087, 0089–0098 (sem 0088) | sem erro |
| 3 | `03_CONFIGURACAO-CUTOVER.sql` | `combo_preco_unit` dos 5 slugs | `CONFIGURACAO_OK` |
| 4 | `08_LOCKDOWN-ACL.sql` | Fecha o caminho legado (ACL) | `LOCKDOWN_OK` |
| 5 | `05_VERIFY-POS-CORTE.sql` | Confere o banco instalado | `VERIFY_POS_CORTE_OK` |
| 6 | **publicar o build de corte** | git push → Lovable recompila com `.env.production` | `/api/versao` com `corte: true` |
| 7 | `04_ATIVAR-CONTROLADO.sql` | `controlado = true` (ponto exato do plano) | `CONTROLADO_OK` |
| 8 | `05_VERIFY-POS-CORTE.sql` (de novo) | Confere tudo com o regime ativo | `VERIFY_POS_CORTE_OK` |
| 9 | `06_SMOKE-DATABASE.sql` | Smoke estrutural | `SMOKE_DATABASE_OK` |
| 10 | `07_QUARENTENA-19-RESERVAS.sql` | Confirma a quarentena (read-only) | `QUARANTENA_OK` |
| 11 | **Smoke funcional no app** | 14 cenários (ver checklist) | tudo verde |
| 12 | **GO / NO-GO** | Decisão | reabrir ou manter fechado |

> A ordem de 4 (lockdown) → 5 (verify) → 6 (publicar) → 7 (`controlado`) é
> intencional: o `controlado` só liga com o bundle novo já publicado e o
> caminho legado já fechado.

---

## PRODUÇÃO CONTINUA IGUAL

Verificado por leitura (read-only) em 2026-10-19:

- Nenhuma migration de 0087–0098 aplicada (todas as RPCs/tabelas **ausentes**).
- `controlado` **não existe** (tabela 0092 ausente) → nada a reverter.
- As 19 reservas históricas seguem em quarentena.
- Nenhum preço de produto alterado.

---

## NÃO FAZER

- **Não aplicar a 0088.**
- **Não reconciliar** as 19 reservas (nem creditar, nem mudar status).
- **Não alterar `produtos.preco`.**
- **Não** usar `UPDATE`/`DELETE` direto em `pedidos`, `pedido_itens` ou
  `reservas_estoque` — a escrita passa pelas RPCs (0095/0091/0093).
- **Não** ajustar estoque à mão. Cancelar pedido de teste com
  `cancelar_pedido_atomico` (devolve só o não consumido).
- **Não restaurar backup** depois de haver pedidos novos (apaga pedidos,
  reservas, consumos e ledger).
- **Não reabrir** antes do smoke funcional verde.

Em caso de dúvida: `ROLLBACK-CUTOVER.md` (cenários A/B/C/D).

---

## ARQUIVOS

| Arquivo | Papel |
|---|---|
| `01_PRECHECK.sql` | Read-only; 9 famílias de checagem; `PRECHECK_OK` / `NO-GO` |
| `02_MIGRATIONS-CUTOVER.sql` | As 11 migrations, verbatim, na ordem (0088 fora) |
| `02_MIGRATIONS-CUTOVER.manifest.json` | SHA-256 + bytes de cada arquivo de origem |
| `03_CONFIGURACAO-CUTOVER.sql` | `combo_preco_unit` + guarda de cobertura |
| `04_ATIVAR-CONTROLADO.sql` | Ativa `controlado` com validações |
| `05_VERIFY-POS-CORTE.sql` | 12 condições pós-instalação |
| `06_SMOKE-DATABASE.sql` | Smoke estrutural (11 seções) |
| `07_QUARENTENA-19-RESERVAS.sql` | Classificação e isolamento das 19 |
| `08_LOCKDOWN-ACL.sql` | Fecha o caminho legado (ACL) |
| `FRONTEND-CUTOVER.md` | Flags, versão, SHA, `/api/versao`, publicação |
| `CHECKLIST-CUTOVER-1-PAGINA.md` | Checklist de 1 página para a janela |
| `ROLLBACK-CUTOVER.md` | 4 cenários de falha com o que reverter/não reverter |
| `PROMPT-UNICO-LOVABLE-CUTOVER.md` | Prompt pronto + bloco de autorização |
| `ENSAIO-PACOTE.ps1` | Ensaio local descartável do pacote inteiro |

**Ensaie antes de usar (opcional, mas recomendado):**
```powershell
powershell -ExecutionPolicy Bypass -File ENSAIO-PACOTE.ps1
# esperado: PACOTE_OK
```
