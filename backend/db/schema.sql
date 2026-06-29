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
    depends_on UUID[] DEFAULT '{}',
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
);
