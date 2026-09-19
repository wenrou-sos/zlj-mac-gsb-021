const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 204) return null;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `请求失败 (${res.status})`);
    err.status = res.status;
    err.data = body;
    throw err;
  }
  return body;
}

export const api = {
  health: () => request('/health'),
  listRacks: () => request('/racks'),
  createRack: (data) => request('/racks', { method: 'POST', body: JSON.stringify(data) }),
  updateRack: (id, data) => request(`/racks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteRack: (id) => request(`/racks/${id}`, { method: 'DELETE' }),
  listDevices: () => request('/devices'),
  createDevice: (data) => request('/devices', { method: 'POST', body: JSON.stringify(data) }),
  deleteDevice: (id) => request(`/devices/${id}`, { method: 'DELETE' }),
  mount: (id, data) => request(`/devices/${id}/mount`, { method: 'POST', body: JSON.stringify(data) }),
  unmount: (id) => request(`/devices/${id}/unmount`, { method: 'POST' }),
  plan: (rackId = null) => request(`/migration/plan${rackId ? `?rack_id=${rackId}` : ''}`),
  executePlan: (rackId = null) =>
    request(`/migration/execute${rackId ? `?rack_id=${rackId}` : ''}`, { method: 'POST', body: '{}' }),
};
