<script setup>
import { computed } from 'vue';

const props = defineProps({
  used: { type: Number, required: true },
  capacity: { type: Number, required: true },
  unit: { type: String, default: '' },
  label: { type: String, default: '' },
});

const pct = computed(() => (props.capacity > 0 ? Math.min(100, (props.used / props.capacity) * 100) : 0));
const level = computed(() => {
  if (pct.value >= 100) return 'danger';
  if (pct.value >= 80) return 'warn';
  return 'ok';
});
const color = computed(() => ({ ok: 'var(--ok)', warn: 'var(--warn)', danger: 'var(--danger)' }[level.value]));
const fmt = (n) => (Math.round(n * 100) / 100).toLocaleString();
</script>

<template>
  <div class="meter" :title="label">
    <div class="bar">
      <div class="fill" :style="{ width: pct + '%', background: color }"></div>
    </div>
    <div class="txt">
      {{ label }} {{ fmt(used) }}/{{ fmt(capacity) }}{{ unit }}
      <span :class="['badge', level]">{{ pct.toFixed(0) }}%</span>
    </div>
  </div>
</template>
