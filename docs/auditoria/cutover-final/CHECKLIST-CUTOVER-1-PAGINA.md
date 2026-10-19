# CHECKLIST DE CUTOVER — 1 PÁGINA

**ERP Néia Salgados** · build `1792429500000` · `cutover-2026-10-19-a1`
Data: ____ / ____ / ______  Janela: ____:____ → ____:____  Abortar até: ____:____

GO: ____________________  Técnico: ____________________  Operação: ____________________  Rollback: ____________________

---

### ANTES
- [ ] Fechar novas vendas (banner + balcão em pausa)
- [ ] Confirmar backup do Lovable Cloud
- [ ] Rodar `01_PRECHECK.sql` → **PRECHECK_OK**
- [ ] Confirmar que **não** há NO-GO no precheck

### BANCO
- [ ] Executar `02_MIGRATIONS-CUTOVER.sql` (0087, 0089–0098 · **sem 0088**)
- [ ] Executar `03_CONFIGURACAO-CUTOVER.sql` (combo_preco_unit) → **CONFIGURACAO_OK**
- [ ] Executar `08_LOCKDOWN-ACL.sql` (fecha caminhos legados) → **LOCKDOWN_OK**
- [ ] Rodar `05_VERIFY-POS-CORTE.sql` → **VERIFY_POS_CORTE_OK**
- [ ] Ativar `controlado` no ponto definido: `04_ATIVAR-CONTROLADO.sql` → **CONTROLADO_OK**
- [ ] Verificar novamente (rodar `05_VERIFY-POS-CORTE.sql` outra vez)

### FRONTEND
- [ ] Publicar build de corte (`1792429500000`)
- [ ] Confirmar `/api/versao` → 200, `atual=minimo=1792429500000`, `corte: true`
- [ ] Confirmar frontend antigo **bloqueado** (tela "Atualização obrigatória")
- [ ] `VERSAO_MINIMA=1792429500000` definido no runtime do servidor

### SMOKE (pedidos de teste, quantidade mínima)
- [ ] checkout — retirada
- [ ] checkout — entrega
- [ ] PDV
- [ ] atendimento
- [ ] combo (50 e misto)
- [ ] estoque conferido antes/depois
- [ ] retirada parcial
- [ ] cancelamento (sem consumo e com consumo)
- [ ] pagamento (Pix pendente + pago; cancelamento de pago bloqueado)
- [ ] produção
- [ ] entrega
- [ ] impressão / fila (`/api/versao` ok)

### FINAL
- [ ] **GO** — reabrir operação
- [ ] **NO-GO** — manter operação fechada e escalar

---

**Regras que valem sempre:**
- `0088` **NÃO** é aplicada.
- As 19 reservas históricas ficam em **quarentena** (sem crédito, sem ajuste).
- `produtos.preco` **não** é alterado.
- Nenhuma correção improvisada em produção: erro crítico = **parar** e manter fechado.
- Qualquer divergência nos smoke tests = **NO-GO**.

**Detalhes:** `ROLLBACK-CUTOVER.md` · `FRONTEND-CUTOVER.md` · `PROMPT-UNICO-LOVABLE-CUTOVER.md`
