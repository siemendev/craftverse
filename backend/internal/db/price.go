package db

import "context"

// PriceInput is one price row in a replace request. LocationName is resolved
// (and created on the fly) when LocationID is zero.
type PriceInput struct {
	Kind         string // "buy" or "sell"
	LocationID   uint64
	LocationName string
	CurrencyID   uint64
	Amount       uint64
}

// PricesForItem returns all prices of an item with location and currency names,
// ordered by kind, location, currency.
func (s *Store) PricesForItem(ctx context.Context, itemID uint64) ([]Price, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT p.id, p.item_id, p.location_id, l.name, p.currency_id, c.name, p.kind, p.amount
		FROM item_price p
		JOIN location l ON l.id = p.location_id
		JOIN currency c ON c.id = p.currency_id
		WHERE p.item_id = ?
		ORDER BY p.kind, l.name, c.name`, itemID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Price
	for rows.Next() {
		var p Price
		if err := rows.Scan(&p.ID, &p.ItemID, &p.LocationID, &p.LocationName,
			&p.CurrencyID, &p.CurrencyName, &p.Kind, &p.Amount); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// ReplaceItemPrices replaces the full set of prices for an item. Rows missing a
// location/currency or with an invalid kind are skipped. Location names are
// upserted within the atlas.
func (s *Store) ReplaceItemPrices(ctx context.Context, itemID uint64, inputs []PriceInput) error {
	it, err := s.GetItem(ctx, itemID)
	if err != nil {
		return err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, `DELETE FROM item_price WHERE item_id = ?`, itemID); err != nil {
		return err
	}
	for _, in := range inputs {
		if in.Kind != "buy" && in.Kind != "sell" {
			continue
		}
		if in.CurrencyID == 0 {
			continue
		}
		locID := in.LocationID
		if locID == 0 && in.LocationName != "" {
			ids, rerr := resolveLocationNames(ctx, tx, it.AtlasID, []string{in.LocationName})
			if rerr != nil {
				return rerr
			}
			if len(ids) == 0 {
				continue
			}
			locID = ids[0]
		}
		if locID == 0 {
			continue
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO item_price (item_id, location_id, currency_id, kind, amount) VALUES (?, ?, ?, ?, ?)
			ON DUPLICATE KEY UPDATE amount = VALUES(amount)`,
			itemID, locID, in.CurrencyID, in.Kind, in.Amount); err != nil {
			return err
		}
	}
	return tx.Commit()
}
