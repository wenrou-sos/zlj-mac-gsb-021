/** 内存存储：接口与 pgStore 保持一致，用于本地演示与测试 */
let rackSeq = 1;
let deviceSeq = 1;

export function createMemoryStore() {
  /** @type {Map<number,any>} */
  const racks = new Map();
  /** @type {Map<number,any>} */
  const devices = new Map();

  return {
    kind: 'memory',

    async reset() {
      racks.clear();
      devices.clear();
      rackSeq = 1;
      deviceSeq = 1;
    },

    async listRacks() {
      return [...racks.values()].sort((a, b) => a.id - b.id);
    },

    async getRack(id) {
      return racks.get(Number(id)) || null;
    },

    async createRack({ name, location = '', total_u, power_kw, cooling_kw }) {
      if ([...racks.values()].some((r) => r.name === name)) {
        throw Object.assign(new Error(`机柜名称已存在: ${name}`), { status: 409 });
      }
      const rack = {
        id: rackSeq++,
        name,
        location,
        total_u: Number(total_u),
        power_kw: Number(power_kw),
        cooling_kw: Number(cooling_kw),
        created_at: new Date().toISOString(),
      };
      racks.set(rack.id, rack);
      return rack;
    },

    async deleteRack(id) {
      const idn = Number(id);
      if (!racks.has(idn)) return false;
      racks.delete(idn);
      for (const [did, d] of devices) {
        if (d.rack_id === idn) devices.delete(did);
      }
      return true;
    },

    async updateRack(id, patch) {
      const rack = racks.get(Number(id));
      if (!rack) throw Object.assign(new Error('机柜不存在'), { status: 404 });
      if (
        patch.name != null &&
        [...racks.values()].some((r) => r.name === patch.name && r.id !== rack.id)
      ) {
        throw Object.assign(new Error(`机柜名称已存在: ${patch.name}`), { status: 409 });
      }
      if (patch.name != null) rack.name = String(patch.name);
      if (patch.location != null) rack.location = String(patch.location);
      if (patch.total_u != null) rack.total_u = Number(patch.total_u);
      if (patch.power_kw != null) rack.power_kw = Number(patch.power_kw);
      if (patch.cooling_kw != null) rack.cooling_kw = Number(patch.cooling_kw);
      return rack;
    },

    async listDevices(rackId = null) {
      let list = [...devices.values()];
      if (rackId != null) list = list.filter((d) => d.rack_id === Number(rackId));
      return list.sort((a, b) => a.id - b.id);
    },

    async getDevice(id) {
      return devices.get(Number(id)) || null;
    },

    async createDevice({ name, size_u, power_kw, cooling_kw }) {
      const device = {
        id: deviceSeq++,
        name,
        rack_id: null,
        start_u: null,
        size_u: Number(size_u),
        power_kw: Number(power_kw || 0),
        cooling_kw: Number(cooling_kw || 0),
        status: 'unmounted',
        created_at: new Date().toISOString(),
      };
      devices.set(device.id, device);
      return device;
    },

    async mountDevice(id, { rack_id, start_u }) {
      const device = devices.get(Number(id));
      if (!device) throw Object.assign(new Error('设备不存在'), { status: 404 });
      device.rack_id = Number(rack_id);
      device.start_u = Number(start_u);
      device.status = 'mounted';
      return device;
    },

    async unmountDevice(id) {
      const device = devices.get(Number(id));
      if (!device) throw Object.assign(new Error('设备不存在'), { status: 404 });
      device.rack_id = null;
      device.start_u = null;
      device.status = 'unmounted';
      return device;
    },

    async deleteDevice(id) {
      return devices.delete(Number(id));
    },
  };
}
