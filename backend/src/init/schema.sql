-- Data center rack capacity management schema
-- All capacity numbers: space in rack U units (1U per row), power in watts, cooling in watts.

CREATE TABLE IF NOT EXISTS racks (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,
  location        TEXT NOT NULL DEFAULT '',
  u_capacity      INTEGER NOT NULL CHECK (u_capacity > 0),
  power_capacity  INTEGER NOT NULL CHECK (power_capacity > 0),  -- watts
  cooling_capacity INTEGER NOT NULL CHECK (cooling_capacity > 0), -- watts of heat removal
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS devices (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,
  u_size       INTEGER NOT NULL CHECK (u_size > 0),
  power_draw   INTEGER NOT NULL CHECK (power_draw >= 0), -- watts consumed
  heat_output  INTEGER NOT NULL CHECK (heat_output >= 0), -- watts of heat produced
  status       TEXT NOT NULL DEFAULT 'unmounted'
                 CHECK (status IN ('mounted', 'unmounted')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS placements (
  id         SERIAL PRIMARY KEY,
  rack_id    INTEGER NOT NULL REFERENCES racks(id) ON DELETE CASCADE,
  device_id  INTEGER NOT NULL UNIQUE REFERENCES devices(id) ON DELETE CASCADE,
  u_start    INTEGER NOT NULL CHECK (u_start >= 1),
  u_end      INTEGER NOT NULL CHECK (u_end >= u_start),
  mounted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_u_range CHECK (u_end - u_start + 1 > 0)
);

CREATE INDEX IF NOT EXISTS idx_placements_rack ON placements(rack_id);
