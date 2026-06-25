-- Locations gain editable detail fields: a free-text description/notes and an
-- address. Both are optional.
ALTER TABLE location
    ADD COLUMN description TEXT NULL AFTER name,
    ADD COLUMN address VARCHAR(512) NULL AFTER description;
