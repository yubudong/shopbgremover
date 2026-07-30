-- Test-only seed for wrangler.paypal-sandbox.toml.
-- Never run this file against shopbgremover-db.

INSERT OR IGNORE INTO users (id, email, name)
VALUES (
  'paypal-sandbox-test-user',
  'paypal-sandbox-test@shopbgremover.invalid',
  'PayPal Sandbox Test'
);

INSERT OR IGNORE INTO user_credits (
  user_id,
  credits,
  total_used,
  sub_credits,
  payg_credits,
  plan
)
VALUES (
  'paypal-sandbox-test-user',
  0,
  0,
  0,
  0,
  'free'
);
