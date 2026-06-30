package db

import (
	"database/sql"
	"fmt"
	"log"
	"os"

	_ "github.com/lib/pq"
)

func Connect() (*sql.DB, error) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
			getEnv("DB_HOST", "localhost"),
			getEnv("DB_PORT", "5432"),
			getEnv("DB_USER", "postgres"),
			os.Getenv("DB_PASSWORD"), // never hardcode — must be set via env
			getEnv("DB_NAME", "flowforge"),
		)
	}
	return sql.Open("postgres", dsn)
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// RunMigrations creates tables if they don't exist
func RunMigrations(db *sql.DB) {
	schema := `
	CREATE TABLE IF NOT EXISTS workflows (
		id UUID PRIMARY KEY,
		name TEXT NOT NULL,
		description TEXT,
		created_at TIMESTAMP DEFAULT NOW()
	);

	CREATE TABLE IF NOT EXISTS steps (
		id UUID PRIMARY KEY,
		workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
		name TEXT NOT NULL,
		depends_on TEXT[] DEFAULT '{}',
		position_x FLOAT DEFAULT 0,
		position_y FLOAT DEFAULT 0
	);

	CREATE TABLE IF NOT EXISTS executions (
		id UUID PRIMARY KEY,
		workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
		status TEXT NOT NULL DEFAULT 'pending',
		started_at TIMESTAMP,
		finished_at TIMESTAMP,
		created_at TIMESTAMP DEFAULT NOW()
	);

	CREATE TABLE IF NOT EXISTS step_executions (
		id UUID PRIMARY KEY,
		execution_id UUID REFERENCES executions(id) ON DELETE CASCADE,
		step_id UUID REFERENCES steps(id) ON DELETE CASCADE,
		status TEXT NOT NULL DEFAULT 'pending',
		retries INT DEFAULT 0,
		started_at TIMESTAMP,
		finished_at TIMESTAMP,
		log TEXT DEFAULT ''
	);`

	if _, err := db.Exec(schema); err != nil {
		log.Fatal("migration failed:", err)
	}
	log.Println("✅ Database migrations ran successfully")
}
