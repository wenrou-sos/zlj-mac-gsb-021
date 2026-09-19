<script setup>
import { ref, onMounted } from 'vue';
import { Migrations } from '../api.js';

const stats = ref(null);
const loading = ref(true);

onMounted(async () => {
  try {
    stats.value = await Migrations.stats();
  } finally {
    loading.value = false;
  }
});

const pct = (used, cap) => (cap > 0 ? ((used / cap) * 100).toFixed(1) : 0);
</script>

<template>
  <h2>📊 容量总览</h2>
  <p class="muted">机柜空间（U）、电力负载（W）与制冷能力（W）统一登记与监控。</p>

  <div v-if="loading">加载中…</div>
  <template v-else-if="stats">
    <div class="card-grid">
      <div class="card stat">
        <span class="num">{{ stats.rack_count }}</span>
        <span class="label">机柜总数</span>
      </div>
      <div class="card stat" :class="stats.overloaded_racks > 0 ? 'danger' : 'ok'">
        <span class="num">{{ stats.overloaded_racks }}</span>
        <span class="label">超载机柜（空间/电力/制冷）</span>
      </div>
      <div class="card stat">
        <span class="num">{{ stats.unmounted_devices }}</span>
        <span class="label">未上架设备</span>
      </div>
    </div>

    <div class="card">
      <h3 style="margin-top: 0">全局资源水位</h3>
      <div class="meter">
        <div class="bar"><div class="fill" :style="{ width: pct(stats.totals.usedU, stats.totals.u) + '%', background: 'var(--accent)' }"></div></div>
        <div class="txt">空间 {{ stats.totals.usedU }}/{{ stats.totals.u }}U ({{ pct(stats.totals.usedU, stats.totals.u) }}%)</div>
      </div>
      <div class="meter">
        <div class="bar"><div class="fill" :style="{ width: pct(stats.totals.usedPower, stats.totals.power) + '%', background: 'var(--warn)' }"></div></div>
        <div class="txt">电力 {{ stats.totals.usedPower }}/{{ stats.totals.power }}W ({{ pct(stats.totals.usedPower, stats.totals.power) }}%)</div>
      </div>
      <div class="meter">
        <div class="bar"><div class="fill" :style="{ width: pct(stats.totals.usedCooling, stats.totals.cooling) + '%', background: 'var(--ok)' }"></div></div>
        <div class="txt">制冷 {{ stats.totals.usedCooling }}/{{ stats.totals.cooling }}W ({{ pct(stats.totals.usedCooling, stats.totals.cooling) }}%)</div>
      </div>
    </div>

    <div v-if="stats.overloaded_racks > 0" class="card" style="border-color: var(--danger)">
      ⚠️ 检测到 {{ stats.overloaded_racks }} 个超载机柜，请前往
      <RouterLink class="link" to="/migrations">迁移方案</RouterLink>
      页面自动计算设备搬迁计划。
    </div>
  </template>
</template>
