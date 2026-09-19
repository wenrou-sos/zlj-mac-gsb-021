<script setup>
import { computed } from 'vue';

const props = defineProps({
  label: String,
  used: Number,
  capacity: Number,
  unit: { type: String, default: '' },
  util: Number,
});

const color = computed(() => {
  if (props.util >= 100) return 'var(--danger)';
  if (props.util >= 80) return 'var(--warn)';
  return 'var(--ok)';
});
const width = computed(() => `${Math.min(100, Math.max(0, props.util))}%`);
</script>

<template>
  <div class="cap">
    <div class="cap-label">
      <span>{{ label }}</span>
      <span :style="{ color }">{{ used }}{{ unit }} / {{ capacity }}{{ unit }}（{{ util }}%）</span>
    </div>
    <div class="meter"><div :style="{ width, background: color }" /></div>
  </div>
</template>

<style scoped>
.cap { display: flex; flex-direction: column; gap: 4px; }
.cap-label { display: flex; justify-content: space-between; font-size: 12px; color: var(--muted); }
</style>
