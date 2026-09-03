-- Migration: Add `shop_name` column to customers and update customer balances view
-- Adds `shop_name` to support explicit shop naming separate from `company_name`.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS shop_name VARCHAR(255);

DROP VIEW IF EXISTS v_customer_balances CASCADE;

-- Recreate v_customer_balances view to include shop_name and address
CREATE VIEW v_customer_balances AS
SELECT 
    c.id AS customer_id,
    c.tenant_id,
    c.name AS customer_name,
    c.company_name,
    c.shop_name,
    c.phone,
    c.address,
    c.city,
    c.credit_limit,
    COALESCE(s.total_sales, 0) AS total_sales_amount,
    COALESCE(p.total_paid, 0) AS total_paid_amount,
    (COALESCE(s.total_sales, 0) - COALESCE(p.total_paid, 0)) AS current_balance_due
FROM customers c
LEFT JOIN (
    SELECT customer_id, SUM(total_amount) AS total_sales
    FROM customer_sales
    GROUP BY customer_id
) s ON s.customer_id = c.id
LEFT JOIN (
    SELECT customer_id, SUM(amount) AS total_paid
    FROM customer_payments
    GROUP BY customer_id
) p ON p.customer_id = c.id;
