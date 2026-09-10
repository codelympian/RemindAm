-- CreateIndex
-- A product's SKU is unique within one business's catalogue. Postgres treats
-- NULLs as distinct, so products without a SKU are unaffected by this constraint.
CREATE UNIQUE INDEX "products_business_id_sku_key" ON "products"("business_id", "sku");
