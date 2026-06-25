-- Documentation only: representative queries mirroring internal/db. The build
-- does NOT depend on sqlc; the hand-written database/sql layer is authoritative.

-- name: ListAtlases :many
SELECT id, name, description, created_at, updated_at FROM atlas ORDER BY name;

-- name: GetAtlas :one
SELECT id, name, description, created_at, updated_at FROM atlas WHERE id = ?;

-- name: ListItems :many
SELECT id, atlas_id, name, notes, created_at, updated_at
FROM item WHERE atlas_id = ? ORDER BY name;

-- name: ItemUsages :many
SELECT r.id, r.output_item_id, oi.name
FROM recipe_ingredient ri
JOIN recipe r ON r.id = ri.recipe_id
JOIN item oi ON oi.id = r.output_item_id
WHERE ri.item_id = ?;

-- name: RecipesForItem :many
SELECT id, atlas_id, output_item_id, is_primary, created_at, updated_at
FROM recipe WHERE output_item_id = ? ORDER BY is_primary DESC, id;

-- name: IngredientsForRecipe :many
SELECT ri.id, ri.recipe_id, ri.item_id, i.name, ri.quantity
FROM recipe_ingredient ri JOIN item i ON i.id = ri.item_id
WHERE ri.recipe_id = ?;
