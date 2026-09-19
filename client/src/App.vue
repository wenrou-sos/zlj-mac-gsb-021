<script setup>
import { ref, computed, onMounted } from 'vue';
import { api } from './api.js';
import RackCard from './components/RackCard.vue';
import RackVisual from './components/RackVisual.vue';
import MountDialog from './components/MountDialog.vue';
import MigrationPanel from './components/MigrationPanel.vue';
import CapacityBar from './components/CapacityBar.vue';

const racks = ref([]);
const devices = ref([]);
const selectedRackId = ref(null);
const health = ref(null);

const toasts = ref([]);
let toastSeq = 0;
function toast(type, message, ms = 4500) {
  const id = ++toastSeq;
  toasts.value.push({ id, type, message });
  setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }, ms);
}

async function load() {
  try {
    const [r, d, h] = await Promise.all([api.listRacks(), api.listDevices(), api.health().catch(() => null)]);
    racks.value = r;
    devices.value = d;
    health.value = h;
    if (selectedRackId.value != null && !r.some((x) => x.id === selectedRackId.value)) {
      selectedRackId.value = null;
    }
  } catch (err) {
    toast('error', `加载失败：${err.message}`);
  }
}

onMounted(load);

const selectedRack = computed(() => racks.value.find((r) => r.id === selectedRackId.value) || null);
const unmountedDevices = computed(() => devices.value.filter((d) => d.status === 'unmounted'));

const stats = computed(() => {
  const mounted = devices.value.filter((d) => d.status === 'mounted').length;
  const overloaded = racks.value.filter((r) => r.usage.isOverload).length;
  const powerUsed = racks.value.reduce((s, r) => s + r.usage.powerKw, 0);
  const powerCap = racks.value.reduce((s, r) => s + r.power_kw, 0);
  return {
    racks: racks.value.length,
    mounted,
    overloaded,
    powerUtil: powerCap > 0 ? Math.round((powerUsed / powerCap) * 100) : 0,
  };
});

// ---- 机柜表单 ----
const rackDlg = ref(false);
const rackForm = ref({ name: '', location: '', total_u: 42, power_kw: 10, cooling_kw: 10 });
async function submitRack() {
  try {
    const r = await api.createRack(rackForm.value);
    rackDlg.value = false;
    rackForm.value = { name: '', location: '', total_u: 42, power_kw: 10, cooling_kw: 10 };
    await load();
    selectedRackId.value = r.id;
    toast('success', `机柜 ${r.name} 创建成功`);
  } catch (err) {
    toast('error', err.message);
  }
}

// ---- 机柜容量编辑 ----
const editDlg = ref(false);
const editForm = ref({ id: null, name: '', location: '', total_u: 0, power_kw: 0, cooling_kw: 0 });
function openEdit() {
  if (!selectedRack.value) return;
  editForm.value = { ...selectedRack.value };
  editDlg.value = true;
}
async function submitEdit() {
  try {
    const r = await api.updateRack(editForm.value.id, {
      name: editForm.value.name,
      location: editForm.value.location,
      total_u: editForm.value.total_u,
      power_kw: editForm.value.power_kw,
      cooling_kw: editForm.value.cooling_kw,
    });
    editDlg.value = false;
    await load();
    if (r.overload) {
      toast('warn', `容量已更新，但 ${r.name} 已超载：建议迁移 ${r.migration.moves} 台设备（方案${r.migration.feasible ? '可行' : '不可行'}）`, 7000);
    } else {
      toast('success', '机柜容量已更新');
    }
  } catch (err) {
    toast('error', err.message);
  }
}

async function removeRack(id) {
  const rack = racks.value.find((r) => r.id === id);
  if (!confirm(`确认删除机柜 ${rack?.name}？机柜内设备将同时被删除。`)) return;
  try {
    await api.deleteRack(id);
    if (selectedRackId.value === id) selectedRackId.value = null;
    await load();
    toast('info', '机柜已删除');
  } catch (err) {
    toast('error', err.message);
  }
}

// ---- 设备表单 ----
const deviceDlg = ref(false);
const deviceForm = ref({ name: '', size_u: 2, power_kw: 0.8, cooling_kw: 0.8 });
async function submitDevice() {
  try {
    await api.createDevice(deviceForm.value);
    deviceDlg.value = false;
    deviceForm.value = { name: '', size_u: 2, power_kw: 0.8, cooling_kw: 0.8 };
    await load();
    toast('success', '设备已登记到台账（未上架）');
  } catch (err) {
    toast('error', err.message);
  }
}

async function removeDevice(id) {
  if (!confirm('确认删除该设备记录？')) return;
  try {
    await api.deleteDevice(id);
    await load();
  } catch (err) {
    toast('error', err.message);
  }
}

// ---- 上架 / 下线 ----
const mountDlg = ref(false);
const mountDefaults = ref({ rackId: null, startU: null });
function openMount(rackId = null, startU = null) {
  mountDefaults.value = { rackId, startU };
  mountDlg.value = true;
}

async function onMountSubmit({ deviceId, rackId, startU }) {
  try {
    const res = await api.mount(deviceId, { rack_id: rackId, start_u: startU ?? undefined });
    mountDlg.value = false;
    selectedRackId.value = rackId;
    await load();
    toast('success', `设备已上架至 ${res.rack.name}，起始 U${res.device.start_u}`);
  } catch (err) {
    if (err.status === 409 && err.data?.conflicts) {
      toast('error', `上架被拒绝：\n${err.data.conflicts.map((c) => '• ' + c.message).join('\n')}`, 7000);
    } else {
      toast('error', err.message);
    }
  }
}

async function unmount(device) {
  if (!confirm(`确认将 ${device.name} 下线？下线后机柜资源立即释放。`)) return;
  try {
    await api.unmount(device.id);
    await load();
    toast('info', `${device.name} 已下线，资源已释放，可重新计算迁移方案`);
  } catch (err) {
    toast('error', err.message);
  }
}

function onPlanApplied(body) {
  load();
  toast('success', `迁移已执行：${body.moves.length} 台设备完成迁移，所有机柜恢复正常水位`);
}
</script>

<template>
  <div class="page">
    <header class="topbar">
      <div>
        <h1>🏢 数据中心机柜容量管理平台</h1>
        <div class="sub">
          空间 U 位 · 电力负载 · 制冷能力统一登记，上架自动冲突检测，超载/下线智能迁移
        </div>
      </div>
      <div class="health">
        <span class="badge" :class="health?.status === 'ok' ? 'ok' : 'danger'">
          API {{ health?.status === 'ok' ? '在线' : '离线' }}
        </span>
        <span v-if="health" class="muted">{{ health.storage === 'memory' ? '内存存储' : 'PostgreSQL' }}</span>
      </div>
    </header>

    <section class="stats">
      <div class="stat panel"><div class="num">{{ stats.racks }}</div><div class="lbl">机柜总数</div></div>
      <div class="stat panel"><div class="num">{{ stats.mounted }}</div><div class="lbl">在架设备</div></div>
      <div class="stat panel">
        <div class="num" :class="{ red: stats.overloaded > 0 }">{{ stats.overloaded }}</div>
        <div class="lbl">超载机柜</div>
      </div>
      <div class="stat panel power-stat">
        <div class="lbl">整体电力水位 {{ stats.powerUtil }}%</div>
        <CapacityBar label="" :used="0" :capacity="100" :util="stats.powerUtil" />
      </div>
      <div class="stat actions">
        <button class="primary" @click="rackDlg = true">+ 新机柜登记</button>
        <button @click="deviceDlg = true">+ 新设备登记</button>
        <button @click="openMount()">设备上架</button>
      </div>
    </section>

    <main class="content">
      <section class="racks-col">
        <h2>机柜资源总览</h2>
        <div v-if="racks.length === 0" class="empty panel">
          暂无机柜，点击右上角「新机柜登记」开始。
        </div>
        <div class="rack-grid">
          <RackCard
            v-for="r in racks" :key="r.id" :rack="r"
            :selected="r.id === selectedRackId"
            @select="selectedRackId = $event"
            @delete="removeRack"
          />
        </div>

        <div class="inventory panel">
          <div class="inv-head">
            <h3>📦 设备台账（{{ devices.length }}）</h3>
            <span class="muted">未上架 {{ unmountedDevices.length }} 台</span>
          </div>
          <table>
            <thead>
              <tr><th>名称</th><th>规格</th><th>功率/制冷</th><th>状态</th><th></th></tr>
            </thead>
            <tbody>
              <tr v-for="d in devices" :key="d.id">
                <td>{{ d.name }}</td>
                <td>{{ d.size_u }}U</td>
                <td>{{ d.power_kw }}kW / {{ d.cooling_kw }}kW</td>
                <td>
                  <span v-if="d.status === 'mounted'" class="badge ok">
                    {{ racks.find((r) => r.id === d.rack_id)?.name }} U{{ d.start_u }}
                  </span>
                  <span v-else class="badge muted">未上架</span>
                </td>
                <td class="ta-right">
                  <button v-if="d.status === 'unmounted'" class="sm" @click="openMount(d.rack_id ?? selectedRackId)">上架</button>
                  <button v-else class="sm" @click="unmount(d)">下线</button>
                  <button class="sm danger" @click="removeDevice(d.id)">删除</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <aside class="side-col">
        <div v-if="selectedRack" class="panel detail">
          <div class="detail-head">
            <div>
              <h2>{{ selectedRack.name }}</h2>
              <div class="muted">{{ selectedRack.location || '未设置位置' }} · {{ selectedRack.total_u }}U 机柜</div>
            </div>
            <div class="row">
              <button class="sm" @click="openEdit">编辑容量</button>
              <span v-if="selectedRack.usage.isOverload" class="badge danger">资源超载</span>
            </div>
          </div>
          <div class="bars">
            <CapacityBar label="空间" :used="selectedRack.usage.usedU" :capacity="selectedRack.total_u" unit="U" :util="selectedRack.usage.spaceUtil" />
            <CapacityBar label="电力" :used="selectedRack.usage.powerKw" :capacity="selectedRack.power_kw" unit="kW" :util="selectedRack.usage.powerUtil" />
            <CapacityBar label="制冷" :used="selectedRack.usage.coolingKw" :capacity="selectedRack.cooling_kw" unit="kW" :util="selectedRack.usage.coolingUtil" />
          </div>
          <div v-if="selectedRack.usage.isOverload" class="conflict-tip">
            ⚠ 该机柜存在超载：
            {{ [selectedRack.usage.overload.space && '空间', selectedRack.usage.overload.power && '电力', selectedRack.usage.overload.cooling && '制冷'].filter(Boolean).join('、') }}
            ，请使用下方迁移方案。
          </div>
          <RackVisual :rack="selectedRack" @mount-at="(u) => openMount(selectedRack.id, u)" @unmount="unmount" />
          <div class="hint">点击机柜空位可从该 U 位上架设备。</div>
        </div>
        <div v-else class="panel placeholder">
          <h2>机柜详情</h2>
          <p class="muted">点击左侧机柜卡片查看 U 位布局并执行上架 / 下线。</p>
        </div>

        <MigrationPanel
          :rack-id="selectedRackId"
          @applied="onPlanApplied"
          @error="(m) => toast('error', m, 7000)"
        />
      </aside>
    </main>

    <!-- 新机柜 -->
    <dialog :open="rackDlg" @close="rackDlg = false">
      <div class="dlg-head">新机柜登记</div>
      <div class="dlg-body">
        <div><label>机柜名称</label><input v-model="rackForm.name" placeholder="如 R-C03" /></div>
        <div><label>位置</label><input v-model="rackForm.location" placeholder="如 C 排" /></div>
        <div class="form-3">
          <div><label>空间（U）</label><input type="number" min="1" max="52" v-model.number="rackForm.total_u" /></div>
          <div><label>额定电力（kW）</label><input type="number" min="0" step="0.1" v-model.number="rackForm.power_kw" /></div>
          <div><label>制冷能力（kW）</label><input type="number" min="0" step="0.1" v-model.number="rackForm.cooling_kw" /></div>
        </div>
      </div>
      <div class="dlg-foot">
        <button @click="rackDlg = false">取消</button>
        <button class="primary" @click="submitRack">登记</button>
      </div>
    </dialog>

    <!-- 编辑机柜容量 -->
    <dialog :open="editDlg" @close="editDlg = false">
      <div class="dlg-head">编辑机柜容量 - {{ editForm.name }}</div>
      <div class="dlg-body">
        <div><label>机柜名称</label><input v-model="editForm.name" /></div>
        <div><label>位置</label><input v-model="editForm.location" /></div>
        <div class="form-3">
          <div><label>空间（U）</label><input type="number" min="1" max="52" v-model.number="editForm.total_u" /></div>
          <div><label>额定电力（kW）</label><input type="number" min="0" step="0.1" v-model.number="editForm.power_kw" /></div>
          <div><label>制冷能力（kW）</label><input type="number" min="0" step="0.1" v-model.number="editForm.cooling_kw" /></div>
        </div>
        <div class="hint">调低容量若导致超载，保存后将提示迁移建议。</div>
      </div>
      <div class="dlg-foot">
        <button @click="editDlg = false">取消</button>
        <button class="primary" @click="submitEdit">保存</button>
      </div>
    </dialog>

    <!-- 新设备 -->
    <dialog :open="deviceDlg" @close="deviceDlg = false">
      <div class="dlg-head">新设备登记</div>
      <div class="dlg-body">
        <div><label>设备名称</label><input v-model="deviceForm.name" placeholder="如 web-node-03" /></div>
        <div class="form-3">
          <div><label>尺寸（U）</label><input type="number" min="1" v-model.number="deviceForm.size_u" /></div>
          <div><label>功耗（kW）</label><input type="number" min="0" step="0.1" v-model.number="deviceForm.power_kw" /></div>
          <div><label>散热需求（kW）</label><input type="number" min="0" step="0.1" v-model.number="deviceForm.cooling_kw" /></div>
        </div>
      </div>
      <div class="dlg-foot">
        <button @click="deviceDlg = false">取消</button>
        <button class="primary" @click="submitDevice">登记</button>
      </div>
    </dialog>

    <MountDialog
      :open="mountDlg"
      :devices="unmountedDevices"
      :racks="racks"
      :default-rack-id="mountDefaults.rackId"
      :default-start-u="mountDefaults.startU"
      @close="mountDlg = false"
      @submit="onMountSubmit"
    />

    <div class="toast-wrap">
      <div v-for="t in toasts" :key="t.id" class="toast" :class="t.type">{{ t.message }}</div>
    </div>
  </div>
</template>

<style scoped>
.page { max-width: 1440px; margin: 0 auto; padding: 20px 24px 48px; }
.topbar { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; }
.topbar h1 { font-size: 22px; }
.sub { color: var(--muted); font-size: 13px; margin-top: 6px; }
.health { display: flex; align-items: center; gap: 8px; }
.muted { color: var(--muted); font-size: 12px; }

.stats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 18px; }
.stat { padding: 14px; display: flex; flex-direction: column; justify-content: center; gap: 6px; }
.num { font-size: 26px; font-weight: 700; }
.num.red { color: var(--danger); }
.lbl { color: var(--muted); font-size: 12px; }
.power-stat { gap: 10px; }
.actions { background: transparent; border: none; padding: 0; gap: 8px; justify-content: center; align-items: stretch; flex-direction: column; }

.content { display: grid; grid-template-columns: 1fr 420px; gap: 18px; align-items: start; }
.racks-col { display: flex; flex-direction: column; gap: 12px; }
.racks-col h2, .detail h2 { font-size: 16px; }
.rack-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
.empty { color: var(--muted); text-align: center; padding: 40px 0; }

.inventory table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 10px; }
.inventory th, .inventory td { text-align: left; padding: 8px 6px; border-bottom: 1px solid var(--border); }
.inventory th { color: var(--muted); font-weight: 500; font-size: 12px; }
.inv-head { display: flex; justify-content: space-between; align-items: center; }
.ta-right { text-align: right; white-space: nowrap; }
.ta-right button { margin-left: 4px; }

.side-col { display: flex; flex-direction: column; gap: 14px; position: sticky; top: 16px; }
.detail { display: flex; flex-direction: column; gap: 12px; }
.detail-head { display: flex; justify-content: space-between; align-items: flex-start; }
.bars { display: flex; flex-direction: column; gap: 8px; }
.conflict-tip {
  background: rgba(239,68,68,.1); border: 1px solid rgba(239,68,68,.35);
  color: #fca5a5; border-radius: 6px; padding: 8px 10px; font-size: 12.5px;
}
.hint { color: var(--muted); font-size: 11.5px; }
.placeholder p { margin-top: 10px; }

.form-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }

@media (max-width: 1100px) {
  .content { grid-template-columns: 1fr; }
  .side-col { position: static; }
  .stats { grid-template-columns: repeat(2, 1fr); }
}
</style>
