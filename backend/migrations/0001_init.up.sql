-- Craftverse initial schema (MariaDB 10.11+ / InnoDB / utf8mb4)
-- Phase 1: atlases, items, tags, recipes, ingredients, locations.

CREATE TABLE atlas (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name        VARCHAR(255) NOT NULL,
    description TEXT NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE item (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    atlas_id   BIGINT UNSIGNED NOT NULL,
    name       VARCHAR(255) NOT NULL,
    notes      TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_item_atlas (atlas_id),
    CONSTRAINT fk_item_atlas FOREIGN KEY (atlas_id) REFERENCES atlas (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tag (
    id       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    atlas_id BIGINT UNSIGNED NOT NULL,
    name     VARCHAR(255) NOT NULL,
    color    VARCHAR(32) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_tag_atlas_name (atlas_id, name),
    CONSTRAINT fk_tag_atlas FOREIGN KEY (atlas_id) REFERENCES atlas (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE item_tag (
    item_id BIGINT UNSIGNED NOT NULL,
    tag_id  BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (item_id, tag_id),
    KEY idx_item_tag_tag (tag_id),
    CONSTRAINT fk_item_tag_item FOREIGN KEY (item_id) REFERENCES item (id) ON DELETE CASCADE,
    CONSTRAINT fk_item_tag_tag  FOREIGN KEY (tag_id)  REFERENCES tag (id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE location (
    id       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    atlas_id BIGINT UNSIGNED NOT NULL,
    name     VARCHAR(255) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_location_atlas_name (atlas_id, name),
    CONSTRAINT fk_location_atlas FOREIGN KEY (atlas_id) REFERENCES atlas (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A recipe produces exactly one output item. An item may have 0..n recipes.
-- 0 recipes => raw material (a leaf). is_primary marks the preferred path (Phase-2 use).
CREATE TABLE recipe (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    atlas_id       BIGINT UNSIGNED NOT NULL,
    output_item_id BIGINT UNSIGNED NOT NULL,
    is_primary     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_recipe_atlas (atlas_id),
    KEY idx_recipe_output (output_item_id),
    CONSTRAINT fk_recipe_atlas FOREIGN KEY (atlas_id)       REFERENCES atlas (id) ON DELETE CASCADE,
    CONSTRAINT fk_recipe_item  FOREIGN KEY (output_item_id) REFERENCES item (id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE recipe_ingredient (
    id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    recipe_id BIGINT UNSIGNED NOT NULL,
    item_id   BIGINT UNSIGNED NOT NULL,           -- the ingredient item
    quantity  INT NOT NULL DEFAULT 1,             -- plain count, no unit
    PRIMARY KEY (id),
    UNIQUE KEY uq_recipe_ingredient (recipe_id, item_id),
    KEY idx_ri_item (item_id),
    CONSTRAINT fk_ri_recipe FOREIGN KEY (recipe_id) REFERENCES recipe (id) ON DELETE CASCADE,
    -- RESTRICT: deleting an item used as an ingredient is blocked at the DB level;
    -- the API surfaces the usages, and "force delete" removes the rows explicitly first.
    CONSTRAINT fk_ri_item   FOREIGN KEY (item_id)   REFERENCES item (id)   ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE recipe_location (
    recipe_id   BIGINT UNSIGNED NOT NULL,
    location_id BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (recipe_id, location_id),
    KEY idx_rl_location (location_id),
    CONSTRAINT fk_rl_recipe   FOREIGN KEY (recipe_id)   REFERENCES recipe (id)   ON DELETE CASCADE,
    CONSTRAINT fk_rl_location FOREIGN KEY (location_id) REFERENCES location (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
