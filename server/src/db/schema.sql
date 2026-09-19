-- 数据中心机柜容量管理平台 数据结构

CREATE TABLE IF NOT EXISTS racks (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(32) NOT NULL UNIQUE,
  location    VARCHAR(128) NOT NULL DEFAULT '',
  total_u     INTEGER NOT NULL CHECK (total_u > 0 AND total_u <= 52),
  power_kw    NUMERIC(8,3) NOT NULL CHECK (power_kw >= 0),
  cooling_kw  NUMERIC(8,3) NOT NULL CHECK (cooling_kw >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS devices (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(64) NOT NULL,
  rack_id     INTEGER REFERENCES racks(id) ON DELETE CASCADE,
  start_u     INTEGER CHECK (start_u IS NULL OR start_u >= 1),
  size_u      INTEGER NOT NULL CHECK (size_u >= 1),
  power_kw    NUMERIC(8,3) NOT NULL DEFAULT 0 CHECK (power_kw >= 0),
  cooling_kw  NUMERIC(8,3) NOT NULL DEFAULT 0 CHECK (cooling_kw >= 0),
  status      VARCHAR(16) NOT NULL DEFAULT 'unmounted'
              CHECK (status IN ('mounted', 'unmounted')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_devices_rack ON devices(rack_id) WHERE status = 'mounted';
