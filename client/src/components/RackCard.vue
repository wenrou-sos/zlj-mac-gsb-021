<script setup>
import CapacityBar from './CapacityBar.vue';

defineProps({ rack: Object, selected: Boolean });
const emit = defineEmits(['select', 'delete']);
</script>

<template>
  <div
    class="rack-card panel"
    :class="{ active: selected }"
    @click="emit('select', rack.id)"
  >
    <div class="head">
      <div>
        <div class="name">{{ rack.name }}</div>
        <div class="loc">{{ rack.location || '—' }} · {{ rack.total_u }}U</div>
      </div>
      <span v-if="rack.usage.isOverload" class="badge danger">超载</span>
      <span v-else-if="Math.max(rack.usage.spaceUtil, rack.usage.powerUtil, rack.usage.coolingUtil) >= 80"
            class="badge warn">高负载</span>
      <span v-else class="badge ok">正常</span>
    </div>
    <div class="bars" @click.stop>
      <CapacityBar label="空间" :used="rack.usage.usedU" :capacity="rack.total_u" unit="U" :util="rack.usage.spaceUtil" />
      <CapacityBar label="电力" :used="rack.usage.powerKw" :capacity="rack.power_kw" unit="kW" :util="rack.usage.powerUtil" />
      <CapacityBar label="制冷" :used="rack.usage.coolingKw" :capacity="rack.cooling_kw" unit="kW" :util="rack.usage.coolingUtil" />
    </div>
    <div class="foot">
      <span class="muted">{{ rack.devices.length }} 台设备</span>
      <button class="sm danger" @click.stop="emit('delete', rack.id)">删除</button>
    </div>
  </div>
</template>

<style scoped>
.rack-card { cursor: pointer; display: flex; flex-direction: column; gap: 12px; border-color: var(--border); }
.rack-card:hover { border-color: var(--primary); }
.rack-card.active { border-color: var(--primary); box-shadow: 0 0 0 1px var(--primary); }
.head { display: flex; justify-content: space-between; align-items: flex-start; }
.name { font-weight: 700; font-size: 15px; }
.loc { color: var(--muted); font-size: 12px; margin-top: 2px; }
.bars { display: flex; flex-direction: column; gap: 8px; }
.foot { display: flex; justify-content: space-between; align-items: center; }
.muted { color: var(--muted); font-size: 12px; }
</style>
