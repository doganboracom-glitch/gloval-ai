-- NOT APPLIED
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ... Part 1 içeriği (aşağıdaki iki değişiklik dışında aynı) ...

commit;
