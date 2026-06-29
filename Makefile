DB_URL=postgres://postgres:postgres@localhost:5432/flowforge?sslmode=disable

.PHONY: db-setup backend frontend dev

db-setup:
	psql -U postgres -c "CREATE DATABASE flowforge;" || true
	psql -U postgres -d flowforge -f backend/db/schema.sql

backend:
	go run main.go

frontend:
	cd frontend && npm run dev

dev:
	make -j2 backend frontend
