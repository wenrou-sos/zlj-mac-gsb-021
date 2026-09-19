<script setup>
import { ref, onMounted } from 'vue';
import { Devices } from '../api.js';
import { toast } from '../toast.js';

const devices = ref([]);
const loading = ref(true);
const showForm = ref(false);
const form = ref({ name: '', u_size: 1, power_draw: 0, heat_output: 0 });

async function load() {
  loading.value = true;
  try {
    devices.value = await Devices.list();
  } catch (err) {
    toast('加载失败', 'error');
  } finally {
    loading.value = false;
  }
}

async function createDevice() {
  try {
    await Devices.create({
      name: form.value.name.trim(),
      u_size: Number(form.value.u_size),
      power_draw: Number(form.value.power_draw),
      heat_output: Number(form.value.heat_output),
    });
    toast('设备登记成功');
    showForm.value = false;
    form.value = { name: '', u_size: 1, power_draw: 0, heat_output: 0 };
    load();
  } catch (err) {
    toast(err.response?.data?.error?.message || '登记失败', 'error');
  }
}

async function offline(d) {
  if (!confirm(`确认将设备 ${d.name} 下线？下线后可在迁移方案页面重新计算搬迁计划。`)) return;
  try {
    const res = await Devices.offline(d.id);
    toast(res.message, 'info');
    load();
  } catch (err) {
    toast(err.response?.data?.error?.message || '下线失败', 'error');
  }
}

async function remove(d) {
  if (!confirm(`确认删除设备 ${d.name}？`)) return;
  try {
    await Devices.remove(d.id);
    toast('设备已删除');
    load();
  } catch (err) {
    toast(err.response?.data?.error?.message || '删除失败', 'error');
  }
}

onMounted(load);
</script>

<template>
  <div style="display:flex; justify-content:space-between; align-items:center">
    <h2>💻 设备管理</h2>
    <button @click="showForm = !showForm">{{ showForm ? '取消' : '＋ 登记新设备' }}</button>
  </div>

  <div v-if="showForm" class="card">
    <div class="form-row">
      <div><label>设备名称</label><input v-model="form.name" placeholder="如 srv-gpu-02" /></div>
      <div><label>占用空间 (U)</label><input v-model.number="form.u_size" type="number" min="1" /></div>
      <div><label>功耗 (W)</label><input v-model.number="form.power_draw" type="number" min="0" /></div>
      <div><label>发热量 (W)</label><input v-model.number="form.heat_output" type="number" min="0" /></div>
      <div style="flex:0"><button @click="createDevice">提交登记</button></div>
    </div>
  </div>

  <div class="card" v-if="!loading">
    <table>
      <thead>
        <tr>
          <th>设备名称</th><th>规格</th><th>功耗/发热</th><th>状态</th><th>位置</th><th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="d in devices" :key="d.id">
          <td>{{ d.name }}</td>
          <td>{{ d.u_size }}U</td>
          <td>{{ d.power_draw }}W / {{ d.heat_output }}W</td>
          <td>
            <span :class="['badge', d.status === 'mounted' ? 'ok' : 'warn']">
              {{ d.status === 'mounted' ? '在架' : '未上架' }}
            </span>
          </td>
          <td>
            <template v-if="d.rack_name">
              <RouterLink class="link" :to="`/racks/${d.rack_id}`">{{ d.rack_name }} · U{{ d.u_start }}</RouterLink>
            </template>
            <span v-else class="muted">—</span>
          </td>
          <td>
            <button v-if="d.status === 'mounted'" class="secondary" @click="offline(d)">下线</button>
            <button v-else class="danger" @click="remove(d)">删除</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
