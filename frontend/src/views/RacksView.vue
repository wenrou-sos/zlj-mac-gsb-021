<script setup>
import { ref, onMounted } from 'vue';
import { Racks } from '../api.js';
import { toast } from '../toast.js';
import UsageBar from '../components/UsageBar.vue';

const racks = ref([]);
const loading = ref(true);
const showForm = ref(false);
const form = ref({ name: '', location: '', u_capacity: 42, power_capacity: 8000, cooling_capacity: 8000 });

async function load() {
  loading.value = true;
  try {
    racks.value = await Racks.list();
  } catch (err) {
    toast(err.message || '加载失败', 'error');
  } finally {
    loading.value = false;
  }
}

function level(rack) {
  const u = rack.usage;
  if (u.used_u > rack.u_capacity || u.used_power > rack.power_capacity || u.used_cooling > rack.cooling_capacity) return 'danger';
  if (u.used_u / rack.u_capacity >= 0.8 || u.used_power / rack.power_capacity >= 0.8 || u.used_cooling / rack.cooling_capacity >= 0.8) return 'warn';
  return 'ok';
}

async function createRack() {
  try {
    await Racks.create({
      name: form.value.name.trim(),
      location: form.value.location,
      u_capacity: Number(form.value.u_capacity),
      power_capacity: Number(form.value.power_capacity),
      cooling_capacity: Number(form.value.cooling_capacity),
    });
    toast('机柜登记成功');
    showForm.value = false;
    form.value = { name: '', location: '', u_capacity: 42, power_capacity: 8000, cooling_capacity: 8000 };
    load();
  } catch (err) {
    toast(err.response?.data?.error?.message || '登记失败', 'error');
  }
}

onMounted(load);
</script>

<template>
  <div style="display: flex; justify-content: space-between; align-items: center">
    <h2>🗄️ 机柜管理</h2>
    <button @click="showForm = !showForm">{{ showForm ? '取消' : '＋ 登记新机柜' }}</button>
  </div>

  <div v-if="showForm" class="card">
    <div class="form-row">
      <div><label>机柜名称</label><input v-model="form.name" placeholder="如 RACK-D01" /></div>
      <div><label>位置</label><input v-model="form.location" placeholder="如 DC1 / 第3列" /></div>
      <div><label>空间 (U)</label><input v-model.number="form.u_capacity" type="number" min="1" /></div>
      <div><label>电力上限 (W)</label><input v-model.number="form.power_capacity" type="number" min="1" /></div>
      <div><label>制冷能力 (W)</label><input v-model.number="form.cooling_capacity" type="number" min="1" /></div>
      <div style="flex: 0"><button @click="createRack">提交登记</button></div>
    </div>
  </div>

  <div v-if="loading">加载中…</div>
  <div v-else-if="racks.length === 0" class="card muted">暂无机柜，点击右上角登记第一个机柜。</div>

  <div v-else class="card-grid">
    <div v-for="r in racks" :key="r.id" class="card">
      <div style="display: flex; justify-content: space-between; align-items: center">
        <RouterLink class="link" :to="`/racks/${r.id}`" style="font-size: 16px; font-weight: 700">{{ r.name }}</RouterLink>
        <span :class="['badge', level(r)]">
          {{ level(r) === 'danger' ? '超载' : level(r) === 'warn' ? '高负载' : '正常' }}
        </span>
      </div>
      <div class="muted" style="font-size: 12px; margin: 4px 0 12px">{{ r.location }} · {{ r.usage.device_count }} 台设备</div>
      <UsageBar label="空间" :used="r.usage.used_u" :capacity="r.u_capacity" unit="U" />
      <UsageBar label="电力" :used="r.usage.used_power" :capacity="r.power_capacity" unit="W" />
      <UsageBar label="制冷" :used="r.usage.used_cooling" :capacity="r.cooling_capacity" unit="W" />
    </div>
  </div>
</template>
