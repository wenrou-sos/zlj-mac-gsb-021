<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  open: Boolean,
  devices: Array, // 未上架设备
  racks: Array,
  defaultRackId: Number,
  defaultStartU: Number,
});
const emit = defineEmits(['close', 'submit']);

const deviceId = ref(null);
const rackId = ref(null);
const startU = ref('');
const autoSlot = ref(true);

watch(
  () => props.open,
  (v) => {
    if (v) {
      deviceId.value = props.devices[0]?.id ?? null;
      rackId.value = props.defaultRackId ?? props.racks[0]?.id ?? null;
      startU.value = props.defaultStartU ?? '';
      autoSlot.value = !props.defaultStartU;
    }
  },
);

function submit() {
  if (!deviceId.value || !rackId.value) return;
  emit('submit', {
    deviceId: deviceId.value,
    rackId: rackId.value,
    startU: autoSlot.value || startU.value === '' ? null : Number(startU.value),
  });
}
</script>

<template>
  <dialog :open="open" @close="emit('close')">
    <div class="dlg-head">设备上架</div>
    <div class="dlg-body">
      <div>
        <label>选择设备（未上架）</label>
        <select v-model="deviceId">
          <option v-for="d in devices" :key="d.id" :value="d.id">
            {{ d.name }} · {{ d.size_u }}U · {{ d.power_kw }}kW / {{ d.cooling_kw }}kW制冷
          </option>
        </select>
        <div v-if="devices.length === 0" class="hint">没有未上架设备，请先在设备台账中新增。</div>
      </div>
      <div>
        <label>目标机柜</label>
        <select v-model="rackId">
          <option v-for="r in racks" :key="r.id" :value="r.id">{{ r.name }}（{{ r.location }}）</option>
        </select>
      </div>
      <div>
        <label class="check"><input type="checkbox" v-model="autoSlot" /> 自动分配 U 位</label>
      </div>
      <div v-if="!autoSlot">
        <label>起始 U 位</label>
        <input type="number" min="1" v-model="startU" placeholder="例如 3" />
      </div>
    </div>
    <div class="dlg-foot">
      <button @click="emit('close')">取消</button>
      <button class="primary" :disabled="!deviceId || !rackId" @click="submit">检查并上架</button>
    </div>
  </dialog>
</template>

<style scoped>
.check { display: flex; align-items: center; gap: 6px; color: var(--text); }
.check input { width: auto; }
.hint { color: var(--warn); font-size: 12px; margin-top: 4px; }
</style>
