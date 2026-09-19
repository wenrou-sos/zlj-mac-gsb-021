<script setup>
import { computed } from 'vue';

const props = defineProps({ rack: Object });
const emit = defineEmits(['mountAt', 'unmount']);

const ROW_H = 22;

// 每个 U 号 -> 占用它的设备
const slotMap = computed(() => {
  const map = new Map();
  for (const d of props.rack.devices) {
    if (d.status !== 'mounted') continue;
    for (let u = d.start_u; u < d.start_u + d.size_u; u += 1) map.set(u, d);
  }
  return map;
});

const blocks = computed(() => {
  const seen = new Set();
  const list = [];
  for (const d of props.rack.devices) {
    if (d.status !== 'mounted' || seen.has(d.id)) continue;
    seen.add(d.id);
    list.push({
      device: d,
      top: (props.rack.total_u - (d.start_u + d.size_u - 1)) * ROW_H,
      height: d.size_u * ROW_H - 2,
    });
  }
  return list;
});

const rows = computed(() => {
  const arr = [];
  for (let u = props.rack.total_u; u >= 1; u -= 1) arr.push(u);
  return arr;
});
</script>

<template>
  <div class="rack-vis">
    <div class="rail">
      <div v-for="u in rows" :key="u" class="u-label" :style="{ height: ROW_H + 'px' }">U{{ u }}</div>
    </div>
    <div class="slots" :style="{ height: rack.total_u * ROW_H + 'px' }">
      <div v-for="u in rows" :key="'s' + u" class="slot-line"
           :style="{ top: (rack.total_u - u) * ROW_H + 'px', height: ROW_H + 'px' }"
           @click="emit('mountAt', u)" />
      <div v-for="b in blocks" :key="b.device.id" class="dev-block"
           :class="{ overload: rack.usage.isOverload }"
           :style="{ top: b.top + 'px', height: b.height + 'px' }"
           :title="`${b.device.name} · ${b.device.power_kw}kW / ${b.device.cooling_kw}kW`">
        <span class="dev-name">{{ b.device.name }}</span>
        <span class="dev-meta">{{ b.device.size_u }}U · {{ b.device.power_kw }}kW</span>
        <button class="sm" @click.stop="emit('unmount', b.device)">下线</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rack-vis { display: flex; gap: 6px; }
.rail { width: 38px; flex-shrink: 0; }
.u-label {
  font-size: 10px; color: var(--muted); text-align: right;
  line-height: 22px; padding-right: 4px;
}
.slots { position: relative; flex: 1; background: #0b1220; border: 1px solid var(--border); border-radius: 6px; }
.slot-line {
  position: absolute; left: 0; right: 0;
  border-bottom: 1px dashed rgba(148,163,184,.15);
}
.slot-line:hover { background: rgba(56,189,248,.08); cursor: pointer; }
.dev-block {
  position: absolute; left: 3px; right: 3px;
  background: linear-gradient(135deg, #0369a1, #075985);
  border: 1px solid #38bdf8; border-radius: 5px;
  display: flex; align-items: center; gap: 8px;
  padding: 0 8px; font-size: 12px; overflow: hidden;
}
.dev-block.overload { background: linear-gradient(135deg, #991b1b, #7f1d1d); border-color: #ef4444; }
.dev-name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dev-meta { color: #bae6fd; font-size: 11px; white-space: nowrap; }
.dev-block button { margin-left: auto; padding: 1px 6px; font-size: 11px; }
</style>
