<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Racks, Devices } from '../api.js';
import { toast } from '../toast.js';
import UsageBar from '../components/UsageBar.vue';

const props = defineProps({ id: String });
const router = useRouter();

const rack = ref(null);
const unmounted = ref([]);
const selectedDevice = ref('');
const uStart = ref(1);
const checkResult = ref(null);

// Build the per-U rendering rows from the top of the rack to the bottom.
const rows = computed(() => {
  if (!rack.value) return [];
  const cap = rack.value.u_capacity;
  const map = new Map();
  for (const d of rack.value.devices) {
    for (let u = d.u_start; u <= d.u_end; u++) map.set(u, d);
  }
  const out = [];
  for (let u = cap; u >= 1; u--) {
    const d = map.get(u);
    out.push({ u, device: d || null, isStart: d && d.u_start === u });
  }
  return out;
});

async function load() {
  try {
    rack.value = await Racks.get(props.id);
    const all = await Devices.list();
    unmounted.value = all.filter((d) => d.status === 'unmounted');
  } catch (err) {
    toast(err.response?.data?.error?.message || '加载失败', 'error');
  }
}

async function runCheck() {
  if (!selectedDevice.value) return toast('请先选择设备', 'error');
  checkResult.value = await Racks.mountCheck(selectedDevice.value, props.id, Number(uStart.value));
}

async function mountDevice() {
  if (!selectedDevice.value) return toast('请先选择设备', 'error');
  try {
    const res = await Devices.mount(selectedDevice.value, props.id, Number(uStart.value));
    toast(res.message || '上架成功');
    checkResult.value = null;
    selectedDevice.value = '';
    await load();
  } catch (err) {
    toast(err.response?.data?.error?.message || '上架被拒绝', 'error');
  }
}

async function offline(deviceId, name) {
  if (!confirm(`确认将设备 ${name} 下架？下架后释放空间/电力/制冷资源。`)) return;
  try {
    const res = await Devices.offline(deviceId);
    toast(res.message, 'info');
    await load();
  } catch (err) {
    toast(err.response?.data?.error?.message || '下架失败', 'error');
  }
}

onMounted(load);
</script>

<template>
  <div v-if="rack">
    <div style="display:flex; justify-content:space-between; align-items:center">
      <h2>{{ rack.name }} <span class="muted" style="font-size:14px">{{ rack.location }}</span></h2>
      <button class="secondary" @click="router.push('/racks')">← 返回列表</button>
    </div>

    <div class="card">
      <UsageBar label="空间" :used="rack.usage.used_u" :capacity="rack.u_capacity" unit="U" />
      <UsageBar label="电力" :used="rack.usage.used_power" :capacity="rack.power_capacity" unit="W" />
      <UsageBar label="制冷" :used="rack.usage.used_cooling" :capacity="rack.cooling_capacity" unit="W" />
    </div>

    <div style="display: grid; grid-template-columns: 280px 1fr; gap: 20px">
      <div>
        <div class="card">
          <h3 style="margin-top:0">设备上架（自动冲突检查）</h3>
          <label>选择未上架设备</label>
          <select v-model="selectedDevice" @change="checkResult = null">
            <option value="">— 请选择 —</option>
            <option v-for="d in unmounted" :key="d.id" :value="d.id">
              {{ d.name }} ({{ d.u_size }}U / {{ d.power_draw }}W)
            </option>
          </select>
          <div style="height:10px"></div>
          <label>起始 U 位（底部为 1）</label>
          <input v-model.number="uStart" type="number" min="1" :max="rack.u_capacity" />
          <div style="height:12px"></div>
          <div class="form-row">
            <button class="secondary" @click="runCheck" :disabled="!selectedDevice">检查冲突</button>
            <button @click="mountDevice" :disabled="!selectedDevice">确认上架</button>
          </div>
          <div v-if="checkResult" style="margin-top:12px">
            <span :class="['badge', checkResult.allowed ? 'ok' : 'danger']">
              {{ checkResult.allowed ? '✓ 允许上架' : '✕ 拒绝上架' }}
            </span>
            <div class="muted" style="font-size:12px; margin-top:6px">{{ checkResult.message }}</div>
          </div>
        </div>
      </div>

      <div class="card">
        <h3 style="margin-top:0">机柜 U 位俯视图</h3>
        <div class="rack-vis">
          <div v-for="row in rows" :key="row.u" :class="['u-row', row.device ? 'device' : '']">
            <span class="u-label">U{{ row.u }}</span>
            <span class="u-cell">
              <template v-if="row.isStart">
                {{ row.device.name }} · {{ row.device.u_size }}U · {{ row.device.power_draw }}W
                <button class="danger" style="margin-left:auto; padding:2px 8px" @click="offline(row.device.device_id, row.device.name)">下架</button>
              </template>
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div v-else>加载中…</div>
</template>
