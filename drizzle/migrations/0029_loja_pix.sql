-- 0029: loja pix_chave (tira hardcoded do frontend)
ALTER TABLE public.loja_config ADD COLUMN IF NOT EXISTS pix_chave text NOT NULL DEFAULT '24913937000116';
UPDATE public.loja_config SET pix_chave = '24913937000116' WHERE pix_chave IS NULL OR pix_chave = '';
