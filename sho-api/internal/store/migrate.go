package store

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"

	"github.com/jackc/pgx/v5"
)

func RunMigrations(ctx context.Context, conn *pgx.Conn) error {
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
		path := filepath.Join(migrationsDir, name)
		sql, err := os.ReadFile(path)
		if err != nil {
			return fmt.Errorf("read migration %s: %w", name, err)
		}
		if _, err := conn.Exec(ctx, string(sql)); err != nil {
			return fmt.Errorf("run migration %s: %w", name, err)
		}
	}
	return nil
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
