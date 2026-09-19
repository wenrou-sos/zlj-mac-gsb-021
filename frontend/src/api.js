import axios from 'axios';

const api = axios.create({ baseURL: '/api', timeout: 15000 });

export function errorMessage(err) {
  return err.response?.data?.error?.message || err.message || '请求失败';
}

export const Racks = {
  list: () => api.get('/racks').then((r) => r.data),
  get: (id) => api.get(`/racks/${id}`).then((r) => r.data),
  create: (data) => api.post('/racks', data).then((r) => r.data),
  update: (id, data) => api.patch(`/racks/${id}`, data).then((r) => r.data),
  remove: (id) => api.delete(`/racks/${id}`),
  mountCheck: (rackId, deviceId, uStart) =>
    api.get(`/racks/${rackId}/mount-check`, { params: { device_id: deviceId, u_start: uStart } }).then((r) => r.data),
};

export const Devices = {
  list: () => api.get('/devices').then((r) => r.data),
  create: (data) => api.post('/devices', data).then((r) => r.data),
  remove: (id) => api.delete(`/devices/${id}`),
  mount: (id, rackId, uStart) => api.post(`/devices/${id}/mount`, { rack_id: rackId, u_start: uStart }).then((r) => r.data),
  offline: (id) => api.post(`/devices/${id}/offline`).then((r) => r.data),
};

export const Migrations = {
  plan: (rackId = null) =>
    api.get('/migrations/plan', { params: rackId ? { rack_id: rackId } : {} }).then((r) => r.data),
  execute: (moves) => api.post('/migrations/execute', { moves }).then((r) => r.data),
  stats: () => api.get('/migrations/stats').then((r) => r.data),
};

export default api;
