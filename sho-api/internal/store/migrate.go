package store

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5"
)

func RunMigrations(ctx context.Context, conn *pgx.Conn) error {
	// Rename legacy schema_migrations → sho_schema_migrations (idempotent).
	conn.Exec(ctx, `ALTER TABLE IF EXISTS schema_migrations RENAME TO sho_schema_migrations`) //nolint:errcheck

	// Ensure tracking table exists
	if _, err := conn.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS sho_schema_migrations (
			name TEXT PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`); err != nil {
		return fmt.Errorf("create sho_schema_migrations table: %w", err)
	}

	migrationsDir := findMigrationsDir()

	entries, err := os.ReadDir(migrationsDir)
	if err != nil {
		return fmt.Errorf("read migrations dir: %w", err)
	}

	var files []string
	for _, entry := range entries {
		if !entry.IsDir() && filepath.Ext(entry.Name()) == ".sql" {
			files = append(files, entry.Name())
		}
	}
	sort.Strings(files)

	for _, name := range files {
		// Skip already-applied migrations
		var exists bool
		if err := conn.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM sho_schema_migrations WHERE name = $1)`,
			name,
		).Scan(&exists); err != nil {
			return fmt.Errorf("check migration %s: %w", name, err)
		}
		if exists {
			continue
		}

		path := filepath.Join(migrationsDir, name)
		raw, err := os.ReadFile(path)
		if err != nil {
			return fmt.Errorf("read migration %s: %w", name, err)
		}
		sql := extractUpSQL(string(raw))
		if _, err := conn.Exec(ctx, sql); err != nil {
			return fmt.Errorf("run migration %s: %w", name, err)
		}
		if _, err := conn.Exec(ctx,
			`INSERT INTO sho_schema_migrations (name) VALUES ($1)`, name,
		); err != nil {
			return fmt.Errorf("record migration %s: %w", name, err)
		}
	}
	return nil
}

// extractUpSQL returns only the "up" portion of a migration file.
// If the file contains "-- +migrate Down", everything after that line is dropped.
func extractUpSQL(raw string) string {
	if idx := strings.Index(raw, "-- +migrate Down"); idx >= 0 {
		return raw[:idx]
	}
	return raw
}

func findMigrationsDir() string {
	// 在二进制旁边找，也兼容开发时的相对路径
	candidates := []string{
		"/migrations",
		"migrations",
		"../../migrations",
	}
	for _, dir := range candidates {
		if _, err := os.Stat(dir); err == nil {
			return dir
		}
	}
	return "migrations"
}
