/*
# Change intent_categories parent_id to CASCADE on delete

1. Modified Tables
  - `intent_categories`
    - Changed `parent_id` foreign key from `ON DELETE SET NULL` to `ON DELETE CASCADE`
    - This means deleting a category now automatically deletes all its subcategories

2. Important Notes
  - This enforces a strict folder model: subcategories cannot exist without a parent
  - Existing orphaned subcategories (parent_id pointing to deleted categories) are unaffected
    since SET NULL would have already nulled them out
*/

ALTER TABLE intent_categories
  DROP CONSTRAINT IF EXISTS intent_categories_parent_id_fkey;

ALTER TABLE intent_categories
  ADD CONSTRAINT intent_categories_parent_id_fkey
  FOREIGN KEY (parent_id) REFERENCES intent_categories(id) ON DELETE CASCADE;
