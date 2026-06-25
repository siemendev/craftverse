package backend

import "embed"

// Migrations holds the embedded golang-migrate SQL files so the binary is
// self-contained (same image runs the server and `migrate up`).
//
//go:embed migrations/*.sql
var Migrations embed.FS
