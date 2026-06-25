-- Craftverse prices: per-atlas currencies and per-item buy/sell prices.

-- A currency is atlas-scoped (e.g. "Gold", "Pay2Win Coins"). Exactly one per
-- atlas is the default (preselected when entering prices). Enforced in the app
-- layer, not by a DB constraint.
CREATE TABLE currency (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    atlas_id   BIGINT UNSIGNED NOT NULL,
    name       VARCHAR(255) NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (id),
    UNIQUE KEY uq_currency_atlas_name (atlas_id, name),
    KEY idx_currency_atlas (atlas_id),
    CONSTRAINT fk_currency_atlas FOREIGN KEY (atlas_id) REFERENCES atlas (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A price is one entry of {kind (buy/sell), location, currency, amount} for an
-- item. The same item+location can hold prices in several currencies and for
-- both kinds, so the UI shows two switchable lists (buy = Einkauf, sell = Verkauf).
CREATE TABLE item_price (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    item_id     BIGINT UNSIGNED NOT NULL,
    location_id BIGINT UNSIGNED NOT NULL,
    currency_id BIGINT UNSIGNED NOT NULL,
    kind        ENUM('buy','sell') NOT NULL,
    amount      BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_item_price (item_id, location_id, currency_id, kind),
    KEY idx_ip_location (location_id),
    KEY idx_ip_currency (currency_id),
    CONSTRAINT fk_ip_item     FOREIGN KEY (item_id)     REFERENCES item (id)     ON DELETE CASCADE,
    CONSTRAINT fk_ip_location FOREIGN KEY (location_id) REFERENCES location (id) ON DELETE CASCADE,
    CONSTRAINT fk_ip_currency FOREIGN KEY (currency_id) REFERENCES currency (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
