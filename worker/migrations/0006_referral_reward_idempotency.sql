-- Stage 2 reward idempotency: at most one order per user can be classified as
-- the first qualified purchase. Refund processing clears this flag before a
-- later order may become first.

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_one_first_qualified_purchase
ON orders(user_id)
WHERE is_first_qualified_purchase = 1;
