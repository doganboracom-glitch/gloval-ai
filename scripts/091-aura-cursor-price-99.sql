-- Aura Cursor one-time, per-site add-on price: 99 TL (9900 kuruş), VAT included.
-- Keep 087-aura-cursor-plan.sql as the historical introduction of this catalog row.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

update public.billing_plans
set
  price_cents = 9900,
  features = '["Seçtiğiniz sitede imleci takip eden renkli aura efekti", "99 TL, KDV dahil, tek seferlik, site başına", "En çok 3 renk, yoğunluk (0.2-0.7) ve boyut (80-200) ayarı", "Değişiklikleriniz anında yayında", "Abonelikten bağımsız, seçtiğiniz site için süresiz geçerli"]'::jsonb
where code = 'aura_cursor'
  and price_cents = 50000;

commit;
