<template>
  <div class="layout">
    <aside class="sidebar">
      <h1>🏢 DC 容量管理</h1>
      <nav>
        <RouterLink to="/">📊 总览</RouterLink>
        <RouterLink to="/racks">🗄️ 机柜管理</RouterLink>
        <RouterLink to="/devices">💻 设备管理</RouterLink>
        <RouterLink to="/migrations">🔀 迁移方案</RouterLink>
      </nav>
    </aside>
    <main class="content">
      <RouterView />
    </main>
    <div class="toast-wrap">
      <div v-for="t in toastState.items" :key="t.id" :class="['toast', t.type]">
        {{ t.message }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { RouterLink, RouterView } from 'vue-router';
import { toastState } from './toast.js';
</script>
