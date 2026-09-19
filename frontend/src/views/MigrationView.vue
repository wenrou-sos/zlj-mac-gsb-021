<script setup>
import { ref, onMounted } from 'vue';
import { Racks, Migrations } from '../api.js';
import { toast } from '../toast.js';

const racks = ref([]);
const scopedRack = ref('');
const plan = ref(null);
const loading = ref(false);

async function loadRacks() {
  racks.value = await Racks.list();
}

async function computePlan() {
  loading.value = true;
  plan.value = null;
  try {
    plan.value = await Migrations.plan(scopedRack.value || null);
    if (plan.value.feasible && plan.value.moves.length === 0) {
      toast('当前没有需要迁移的超载机柜', 'info');
    } else if (!plan.value.feasible) {
      toast('存在无法解决的超载：剩余机柜资源不足', 'error');
    } else {
      toast(`已生成 ${plan.value.moves.length} 步迁移方案`, 'success');
    }
  } catch (err) {
    toast(err.response?.data?.error?.message || '方案计算失败', 'error');
  } finally {
    loading.value = false;
  }
}

async function executePlan() {
  if (!plan.value?.moves?.length) return;
  if (!confirm(`确认执行 ${plan.value.moves.length} 步设备迁移？`)) return;
  try {
    const res = await Migrations.execute(plan.value.moves);
    toast(`已执行 ${res.applied_count} 步迁移，所有资源重新平衡`);
    plan.value = null;
    await loadRacks();
  } catch (err) {
    toast(err.response?.data?.error?.message || '迁移执行失败', 'error');
  }
}

onMounted(loadRacks);
</script>

<template>
  <h2>🔀 迁移方案计算</h2>
  <p class="muted">
    当机柜出现电力 / 制冷 / 空间超载，或设备下线后释放了资源时，可在此重新计算设备搬迁方案。
    算法自动挑选高负载设备迁移到资源水位最低的机柜，并保证目标机柜不会产生新的超载。
  </p>

  <div class="card">
    <div class="form-row">
      <div style="flex:2">
        <label>范围（默认检查全部超载机柜）</label>
        <select v-model="scopedRack">
          <option value="">全部机柜</option>
          <option v-for="r in racks" :key="r.id" :value="r.id">{{ r.name }}</option>
        </select>
      </div>
      <div style="flex:0">
        <button @click="computePlan" :disabled="loading">{{ loading ? '计算中…' : '重新计算迁移方案' }}</button>
      </div>
    </div>
  </div>

  <template v-if="plan">
    <div class="card" :style="{ borderColor: plan.feasible ? 'var(--ok)' : 'var(--danger)' }">
      <h3 style="margin-top:0">
        结果：
        <span :class="['badge', plan.feasible ? 'ok' : 'danger']">
          {{ plan.feasible ? '✓ 超载可完全消除' : '✕ 资源不足，无法完全解决' }}
        </span>
      </h3>

      <div v-if="plan.moves.length === 0" class="muted">无需迁移。</div>

      <div v-for="(m, i) in plan.moves" :key="i" class="move-step">
        <strong>{{ i + 1 }}.</strong>
        <span>设备 <strong>{{ m.device_name }}</strong></span>
        <span class="muted">{{ m.from_rack_name }} U{{ m.from_u_start }}</span>
        <span class="arrow">➜</span>
        <span class="link" style="font-weight:600">{{ m.to_rack_name }} U{{ m.to_u_start }}</span>
      </div>

      <div v-if="plan.unresolved.length">
        <h3>仍超载的机柜：</h3>
        <ul>
          <li v-for="u in plan.unresolved" :key="u.rack_id">
            {{ u.rack_name }} —
            电力 {{ u.summary.power.used }}/{{ u.summary.power.capacity }}W，
            制冷 {{ u.summary.cooling.used }}/{{ u.summary.cooling.capacity }}W，
            空间 {{ u.summary.u.used }}/{{ u.summary.u.capacity }}U
          </li>
        </ul>
      </div>

      <button v-if="plan.moves.length && plan.feasible" @click="executePlan" style="margin-top:10px">
        ✓ 一键执行迁移方案
      </button>
    </div>
  </template>
</template>
