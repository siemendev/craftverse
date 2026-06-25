-- Craftverse reproducible seed data (local dev / demo).
--
-- Idempotent: truncates every table and reinserts with fixed IDs, so running it
-- repeatedly always yields the exact same database state.
--
--   make seed                 # convenience target
--   docker compose exec -T mariadb mariadb -uapp -papp craftverse < deploy/seed/seed.sql
--
-- Two atlases:
--   1) "Wasteland Motors" — a deep vehicle-crafting tree: raw ores -> plates ->
--      steel (TWO recipes = OR-branch) -> components -> Engine/Chassis/Tire ->
--      Car & Truck. Exercises quantities, multi-level depth, n:m recipe-locations.
--   2) "Arcane Reagents" — small alchemy set containing a DELIBERATE CYCLE
--      (Philosopher's Salt <-> Transmuted Essence) to exercise cyclic rendering.

SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE recipe_location;
TRUNCATE TABLE recipe_ingredient;
TRUNCATE TABLE recipe;
TRUNCATE TABLE item_tag;
TRUNCATE TABLE item;
TRUNCATE TABLE tag;
TRUNCATE TABLE location;
TRUNCATE TABLE atlas;
SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------- atlases ----
INSERT INTO atlas (id, name, description) VALUES
  (1, 'Wasteland Motors', 'Post-apocalyptic vehicle crafting — from raw ore to finished cars and trucks.'),
  (2, 'Arcane Reagents',  'A small alchemy set. Contains an intentional crafting cycle.');

-- --------------------------------------------------------------- locations ---
INSERT INTO location (id, atlas_id, name) VALUES
  (1, 1, 'Mine'),
  (2, 1, 'Smelter'),
  (3, 1, 'Workbench'),
  (4, 1, 'Refinery'),
  (5, 1, 'Assembly Line'),
  (6, 1, 'Vehicle Factory'),
  (7, 2, 'Altar'),
  (8, 2, 'Cauldron');

-- -------------------------------------------------------------------- tags ---
INSERT INTO tag (id, atlas_id, name, color) VALUES
  (1, 1, 'raw',       '#6b7280'),
  (2, 1, 'metal',     '#60a5fa'),
  (3, 1, 'component', '#f59e0b'),
  (4, 1, 'vehicle',   '#ef4444'),
  (5, 1, 'fluid',     '#22d3ee'),
  (6, 2, 'reagent',   '#a78bfa'),
  (7, 2, 'raw',       '#6b7280');

-- ------------------------------------------------------------------- items ---
-- Atlas 1: raw materials (no recipes => leaves)
INSERT INTO item (id, atlas_id, name, notes) VALUES
  (1, 1, 'Iron Ore',    NULL),
  (2, 1, 'Coal',        NULL),
  (3, 1, 'Copper Ore',  NULL),
  (4, 1, 'Crude Oil',   NULL),
  (5, 1, 'Sand',        NULL),
  (6, 1, 'Scrap Metal', 'Salvaged from wrecks — feeds the alternative steel recipe.'),
  (7, 1, 'Rubber',      NULL),
-- Atlas 1: intermediates & products
  (8,  1, 'Iron Plate',         NULL),
  (9,  1, 'Copper Plate',       NULL),
  (10, 1, 'Steel',              'Two ways to make it: smelt iron plate + coal, or recycle scrap.'),
  (11, 1, 'Copper Wire',        NULL),
  (12, 1, 'Glass',              NULL),
  (13, 1, 'Windshield',         NULL),
  (14, 1, 'Plastic',            NULL),
  (15, 1, 'Lubricant',          NULL),
  (16, 1, 'Electronic Circuit', NULL),
  (17, 1, 'Engine',             'Buildable at the Workbench or the Assembly Line.'),
  (18, 1, 'Tire',               NULL),
  (19, 1, 'Chassis',            NULL),
  (20, 1, 'Car',                'Top-level build for this atlas.'),
  (21, 1, 'Truck',              NULL),
-- Atlas 2
  (22, 2, 'Salt',               NULL),
  (23, 2, 'Quicksilver',        NULL),
  (24, 2, 'Philosopher''s Salt', 'Needs Transmuted Essence — which in turn needs this. Intentional cycle.'),
  (25, 2, 'Transmuted Essence',  'Part of an intentional crafting cycle (tests "cyclic" rendering).'),
  (26, 2, 'Elixir of Vigor',     NULL);

-- --------------------------------------------------------------- item_tag ----
INSERT INTO item_tag (item_id, tag_id) VALUES
  (1,1),(2,1),(3,1),(4,1),(5,1),(6,1),(7,1),         -- raw
  (8,2),(9,2),(10,2),                                -- metal
  (11,3),(12,3),(13,3),(14,3),(16,3),(17,3),(18,3),(19,3), -- component
  (15,5),                                            -- fluid
  (20,4),(21,4),                                     -- vehicle
  (22,7),(23,7),                                     -- raw (atlas 2)
  (24,6),(25,6),(26,6);                              -- reagent

-- ----------------------------------------------------------------- recipes ---
-- (id, atlas, output_item, is_primary)
INSERT INTO recipe (id, atlas_id, output_item_id, is_primary) VALUES
  (1,  1, 8,  1),   -- Iron Plate
  (2,  1, 9,  1),   -- Copper Plate
  (3,  1, 10, 1),   -- Steel (primary: ore route)
  (4,  1, 10, 0),   -- Steel (alt: scrap route)   <-- OR-branch
  (5,  1, 11, 1),   -- Copper Wire
  (6,  1, 12, 1),   -- Glass
  (7,  1, 13, 1),   -- Windshield
  (8,  1, 14, 1),   -- Plastic
  (9,  1, 15, 1),   -- Lubricant
  (10, 1, 16, 1),   -- Electronic Circuit
  (11, 1, 17, 1),   -- Engine
  (12, 1, 18, 1),   -- Tire
  (13, 1, 19, 1),   -- Chassis
  (14, 1, 20, 1),   -- Car
  (15, 1, 21, 1),   -- Truck
  (16, 2, 24, 1),   -- Philosopher's Salt
  (17, 2, 25, 1),   -- Transmuted Essence  (cycle with 24)
  (18, 2, 26, 1);   -- Elixir of Vigor

-- ------------------------------------------------------ recipe_ingredient ----
-- (recipe_id, ingredient_item_id, quantity)
INSERT INTO recipe_ingredient (recipe_id, item_id, quantity) VALUES
  (1,  1, 2),                          -- Iron Plate <- 2 Iron Ore
  (2,  3, 2),                          -- Copper Plate <- 2 Copper Ore
  (3,  8, 3), (3, 2, 1),               -- Steel (ore) <- 3 Iron Plate + 1 Coal
  (4,  6, 4),                          -- Steel (scrap) <- 4 Scrap Metal
  (5,  9, 1),                          -- Copper Wire <- 1 Copper Plate
  (6,  5, 3),                          -- Glass <- 3 Sand
  (7,  12, 2),                         -- Windshield <- 2 Glass
  (8,  4, 2),                          -- Plastic <- 2 Crude Oil
  (9,  4, 3),                          -- Lubricant <- 3 Crude Oil
  (10, 11, 3), (10, 8, 1), (10, 14, 1),-- Circuit <- 3 Copper Wire + 1 Iron Plate + 1 Plastic
  (11, 10, 4), (11, 15, 2), (11, 16, 1),-- Engine <- 4 Steel + 2 Lubricant + 1 Circuit
  (12, 7, 2), (12, 10, 1),             -- Tire <- 2 Rubber + 1 Steel
  (13, 10, 6), (13, 8, 4),             -- Chassis <- 6 Steel + 4 Iron Plate
  (14, 19, 1), (14, 17, 1), (14, 18, 4), (14, 13, 1), (14, 16, 1), -- Car
  (15, 19, 2), (15, 17, 2), (15, 18, 6), (15, 13, 2),             -- Truck
  -- Atlas 2 (cycle: 24 needs 25, 25 needs 24)
  (16, 22, 2), (16, 25, 1),            -- Philosopher's Salt <- 2 Salt + 1 Transmuted Essence
  (17, 24, 1), (17, 23, 1),            -- Transmuted Essence <- 1 Philosopher's Salt + 1 Quicksilver
  (18, 24, 1), (18, 23, 1), (18, 25, 1);-- Elixir <- 1 Phil. Salt + 1 Quicksilver + 1 Transmuted Essence

-- ------------------------------------------------------- recipe_location ----
-- (recipe_id, location_id). Engine (recipe 11) is craftable at TWO locations.
INSERT INTO recipe_location (recipe_id, location_id) VALUES
  (1, 2), (2, 2), (3, 2), (4, 2), (6, 2),     -- Smelter recipes
  (5, 3), (7, 3), (10, 3), (12, 3),           -- Workbench recipes
  (8, 4), (9, 4),                             -- Refinery recipes
  (11, 3), (11, 5),                           -- Engine: Workbench + Assembly Line (n:m)
  (13, 5),                                    -- Chassis: Assembly Line
  (14, 6), (15, 6),                           -- Car & Truck: Vehicle Factory
  (16, 8), (17, 7), (18, 8);                  -- Atlas 2
