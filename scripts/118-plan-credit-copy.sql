-- UNAPPLIED: update only existing billing_plans.features credit rows.
-- Preserves all other feature rows, plan prices, intervals, and active flags.

WITH credit_copy (code, feature_text, legacy_pattern) AS (
  VALUES
    (
      'starter',
      '100 AI işlemi / 30 gün; kullanılmayan krediler devretmez.',
      '(150.*(AI|yapay zek|kredi|credit|işlem|action))|((AI|yapay zek|kredi|credit|işlem|action).*150)'
    ),
    (
      'starter_yearly',
      '100 AI işlemi / 30 gün; kullanılmayan krediler devretmez.',
      '(150.*(AI|yapay zek|kredi|credit|işlem|action))|((AI|yapay zek|kredi|credit|işlem|action).*150)'
    ),
    (
      'pro',
      'İlk dönem 150 AI işlemi; sonraki dönemlerde aylık 50 AI işlemi. Kullanılmayan krediler devreder; azami bakiye 1.000 AI işlemi.',
      '((150|450).*(AI|yapay zek|kredi|credit|işlem|action))|((AI|yapay zek|kredi|credit|işlem|action).*(150|450))'
    ),
    (
      'pro_yearly',
      'İlk dönem 150 AI işlemi; sonraki dönemlerde aylık 50 AI işlemi. Kullanılmayan krediler devreder; azami bakiye 1.000 AI işlemi.',
      '((150|450).*(AI|yapay zek|kredi|credit|işlem|action))|((AI|yapay zek|kredi|credit|işlem|action).*(150|450))'
    ),
    (
      'ecommerce',
      'İlk dönem 250 AI işlemi; sonraki dönemlerde aylık 100 AI işlemi. Kullanılmayan krediler devreder; azami bakiye 1.000 AI işlemi.',
      '((150|500).*(AI|yapay zek|kredi|credit|işlem|action))|((AI|yapay zek|kredi|credit|işlem|action).*(150|500))'
    ),
    (
      'ecommerce_yearly',
      'İlk dönem 250 AI işlemi; sonraki dönemlerde aylık 100 AI işlemi. Kullanılmayan krediler devreder; azami bakiye 1.000 AI işlemi.',
      '((150|500).*(AI|yapay zek|kredi|credit|işlem|action))|((AI|yapay zek|kredi|credit|işlem|action).*(150|500))'
    )
)
UPDATE public.billing_plans AS plan
SET features = (
  SELECT COALESCE(
    jsonb_agg(
      CASE
        WHEN candidate.is_credit_row AND candidate.credit_ordinal = 1
          THEN to_jsonb(credit_copy.feature_text)
        ELSE candidate.value
      END
      ORDER BY candidate.ordinality
    ) FILTER (WHERE NOT candidate.is_credit_row OR candidate.credit_ordinal = 1),
    '[]'::jsonb
  )
  FROM (
    SELECT
      item.value,
      item.ordinality,
      (item.value #>> '{}') ~* credit_copy.legacy_pattern AS is_credit_row,
      COUNT(*) FILTER (
        WHERE (item.value #>> '{}') ~* credit_copy.legacy_pattern
      ) OVER (ORDER BY item.ordinality) AS credit_ordinal
    FROM jsonb_array_elements(plan.features) WITH ORDINALITY AS item(value, ordinality)
  ) AS candidate
)
FROM credit_copy
WHERE plan.code = credit_copy.code
  AND jsonb_typeof(plan.features) = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(plan.features) AS feature(value)
    WHERE feature.value ~* credit_copy.legacy_pattern
  );
