import { normalizeDevice, normalizeRack } from './pg.js';

/** PostgreSQL 存储，接口与 memoryStore 一致 */
export function createPgStore(pool) {
  const uniqueViolation = (err, message) => {
    if (err.code === '23505') throw Object.assign(new Error(message), { status: 409 });
    throw err;
  };

  return {
    kind: 'postgres',

    async listRacks() {
      const { rows } = await pool.query('SELECT * FROM racks ORDER BY id');
      return rows.map(normalizeRack);
    },

    async getRack(id) {
      const { rows } = await pool.query('SELECT * FROM racks WHERE id = $1', [Number(id)]);
      return normalizeRack(rows[0] || null);
    },

    async createRack({ name, location = '', total_u, power_kw, cooling_kw }) {
      try {
        const { rows } = await pool.query(
          `INSERT INTO racks (name, location, total_u, power_kw, cooling_kw)
           VALUES ($1,$2,$3,$4,$5) RETURNING *`,
          [name, location, Number(total_u), Number(power_kw), Number(cooling_kw)],
        );
        return normalizeRack(rows[0]);
      } catch (err) {
        return uniqueViolation(err, `机柜名称已存在: ${name}`);
      }
    },

    async deleteRack(id) {
      const { rowCount } = await pool.query('DELETE FROM racks WHERE id = $1', [Number(id)]);
      return rowCount > 0;
    },

    async updateRack(id, patch) {
      const fields = [];
      const values = [Number(id)];
      const assign = (col, val) => {
        values.push(val);
        fields.push(`${col} = $${values.length}`);
      };
      if (patch.name !== undefined) assign('name', String(patch.name));
      if (patch.location !== undefined) assign('location', String(patch.location));
      if (patch.total_u !== undefined) assign('total_u', Number(patch.total_u));
      if (patch.power_kw !== undefined) assign('power_kw', Number(patch.power_kw));
      if (patch.cooling_kw !== undefined) assign('cooling_kw', Number(patch.cooling_kw));
      try {
        const { rows } = fields.length
          ? (await pool.query(
              `UPDATE racks SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
              values,
            ))
          : await pool.query('SELECT * FROM racks WHERE id = $1', values);
        if (rows.length === 0) throw Object.assign(new Error('机柜不存在'), { status: 404 });
        return normalizeRack(rows[0]);
      } catch (err) {
        if (err.status) throw err;
        return uniqueViolation(err, `机柜名称已存在: ${patch.name}`);
      }
    },

    async listDevices(rackId = null) {
      if (rackId != null) {
        const { rows } = await pool.query(
          'SELECT * FROM devices WHERE rack_id = $1 ORDER BY id',
          [Number(rackId)],
        );
        return rows.map(normalizeDevice);
      }
      const { rows } = await pool.query('SELECT * FROM devices ORDER BY id');
      return rows.map(normalizeDevice);
    },

    async getDevice(id) {
      const { rows } = await pool.query('SELECT * FROM devices WHERE id = $1', [Number(id)]);
      return normalizeDevice(rows[0] || null);
    },

    async createDevice({ name, size_u, power_kw, cooling_kw }) {
      const { rows } = await pool.query(
        `INSERT INTO devices (name, size_u, power_kw, cooling_kw)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [name, Number(size_u), Number(power_kw || 0), Number(cooling_kw || 0)],
      );
      return normalizeDevice(rows[0]);
    },

    async mountDevice(id, { rack_id, start_u }) {
      const { rows } = await pool.query(
        `UPDATE devices SET rack_id=$2, start_u=$3, status='mounted'
         WHERE id=$1 RETURNING *`,
        [Number(id), Number(rack_id), Number(start_u)],
      );
      if (rows.length === 0) throw Object.assign(new Error('设备不存在'), { status: 404 });
      return normalizeDevice(rows[0]);
    },

    async unmountDevice(id) {
      const { rows } = await pool.query(
        `UPDATE devices SET rack_id=NULL, start_u=NULL, status='unmounted'
         WHERE id=$1 RETURNING *`,
        [Number(id)],
      );
      if (rows.length === 0) throw Object.assign(new Error('设备不存在'), { status: 404 });
      return normalizeDevice(rows[0]);
    },

    async deleteDevice(id) {
      const { rowCount } = await pool.query('DELETE FROM devices WHERE id = $1', [Number(id)]);
      return rowCount > 0;
    },
  };
}
