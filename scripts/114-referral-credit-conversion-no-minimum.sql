do $migration$
declare
  current_definition text;
  updated_definition text;
begin
  select pg_get_functiondef(
    'public.request_referral_payout(uuid,uuid,text,uuid,bigint,text)'::regprocedure
  )
  into current_definition;

  if current_definition is null then
    raise exception 'request_referral_payout function was not found';
  end if;

  if position('if v_max_cents < 300 then' in current_definition) > 0
    and position('if v_payout_balance < 300 then' in current_definition) > 0 then
    updated_definition := replace(
      current_definition,
      'if v_max_cents < 300 then',
      'if v_max_cents <= 0 then'
    );
    updated_definition := replace(
      updated_definition,
      'if v_payout_balance < 300 then',
      'if v_payout_balance <= 0 then'
    );
    updated_definition := replace(
      updated_definition,
      '''credit_minimum_not_met''',
      '''insufficient_balance'''
    );
  elsif position('if v_max_cents <= 0 then' in current_definition) > 0
    and position('if v_payout_balance <= 0 then' in current_definition) > 0
    and position('credit_minimum_not_met' in current_definition) = 0 then
    updated_definition := current_definition;
  else
    raise exception 'request_referral_payout has an unexpected credit minimum implementation';
  end if;

  execute updated_definition;
end;
$migration$;
