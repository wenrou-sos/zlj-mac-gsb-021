<script setup>
import { ref } from 'vue';

const props = defineProps({ rackId: { type: Number, default: null } });
const emit = defineEmits(['applied', 'error']);

const plan = ref(null);
const loading = ref(false);
const executing = ref(false);

async function generate() {
  loading.value = true;
  try {
    const res = await fetch(
      `/api/migration/plan${props.rackId ? `?rack_id=${props.rackId}` : ''}`,
    ).then((r) => r.json());
    plan.value = res;
  } finally {
    loading.value = false;
  }
}

async function execute() {
  executing.value = true;
  try {
    const res = await fetch(
      `/api/migration/execute${props.rackId ? `?rack_id=${props.rackId}` : ''}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
    );
    const body = await res.json();
    if (!res.ok) {
      emit('error', body.error || '执行失败');
      return;
    }
    plan.value = body;
    if (body.applied) emit('applied', body);
    else emit('error', '方案不可行，存在无法安置的设备');
  } finally {
    executing.value = false;
  }
}
</script>

<template>
  <div class="panel migration">
    <div class="title-row">
      <h3>🔀 迁移方案重算{{ rackId ? '（当前机柜）' : '（全局）' }}</h3>
      <div class="row">
        <button class="sm" :disabled="loading" @click="generate">
          {{ loading ? '计算中…' : '生成方案' }}
        </button>
        <button class="sm primary" :disabled="!plan?.feasible || executing" @click="execute">
          {{ executing ? '执行中…' : '执行迁移' }}
        </button>
      </div>
    </div>

    <div v-if="!plan" class="hint">
      当机柜出现空间/电力/制冷超载，或设备下线后需要重平衡时，点击「生成方案」。
      系统优先迁出高功率密度设备，并为每台设备自动选择仍有余量的目标机柜与 U 位。
    </div>

    <template v-else>
      <div class="summary">
        <span class="badge" :class="plan.feasible ? 'ok' : 'danger'">
          {{ plan.feasible ? '方案可行' : '方案不可行' }}
        </span>
        <span class="muted">
          迁移 {{ plan.summary.movedDevices }} 台设备 · 涉及 {{ plan.summary.affectedRacks }} 个机柜
        </span>
      </div>

      <div v-if="plan.moves.length === 0" class="hint">无需迁移，所有机柜资源均在限额内。</div>

      <table v-else class="moves">
        <thead>
          <tr><th>设备</th><th>迁出</th><th>迁入</th><th>U 位</th><th>规格</th></tr>
        </thead>
        <tbody>
          <tr v-for="m in plan.moves" :key="m.deviceId">
            <td>{{ m.deviceName }}</td>
            <td class="warn-text">{{ m.fromRackName }}</td>
            <td class="ok-text">{{ m.toRackName }}</td>
            <td>U{{ m.targetStartU }}-U{{ m.targetStartU + m.sizeU - 1 }}</td>
            <td>{{ m.sizeU }}U · {{ m.powerKw }}kW · {{ m.coolingKw }}kW冷</td>
          </tr>
        </tbody>
      </table>

      <div v-if="plan.remaining.length" class="remaining">
        <div class="warn-text">⚠ 以下资源无法通过迁移消化：</div>
        <ul>
          <li v-for="(r, i) in plan.remaining" :key="i">
            机柜 {{ r.rackName }}<template v-if="r.deviceName"> / 设备 {{ r.deviceName }}</template>
            （{{ (r.reasons || []).join('、') }}）
          </li>
        </ul>
      </div>
    </template>
  </div>
</template>

<style scoped>
.migration { display: flex; flex-direction: column; gap: 12px; }
.title-row { display: flex; justify-content: space-between; align-items: center; }
.hint { color: var(--muted); font-size: 12.5px; line-height: 1.7; }
.summary { display: flex; align-items: center; gap: 10px; }
.muted { color: var(--muted); font-size: 12px; }
.moves { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.moves th, .moves td { text-align: left; padding: 7px 8px; border-bottom: 1px solid var(--border); }
.moves th { color: var(--muted); font-weight: 500; }
.warn-text { color: var(--warn); }
.ok-text { color: var(--ok); }
.remaining { background: rgba(239,68,68,.08); border: 1px solid rgba(239,68,68,.3); border-radius: 6px; padding: 10px; font-size: 12.5px; }
.remaining ul { margin: 6px 0 0; padding-left: 18px; }
</style>
