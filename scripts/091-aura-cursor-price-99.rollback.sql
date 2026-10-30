-- Restore the original Aura Cursor catalog price and feature text from script 087.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

update public.billing_plans
set
  price_cents = 50000,
  features = '["Seçtiğiniz sitede imleci takip eden renkli aura efekti", "500 TL, KDV dahil, tek seferlik, site başına", "En çok 3 renk, yoğunluk (0.2-0.7) ve boyut (80-200) ayarı", "Değişiklikleriniz anında yayında", "Abonelikten bağımsız, seçtiğiniz site için süresiz geçerli"]'::jsonb
where code = 'aura_cursor'
  and price_cents = 9900;

commit;
