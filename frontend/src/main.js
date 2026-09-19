import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import DashboardView from './views/DashboardView.vue';
import RacksView from './views/RacksView.vue';
import RackDetailView from './views/RackDetailView.vue';
import DevicesView from './views/DevicesView.vue';
import MigrationView from './views/MigrationView.vue';
import './styles.css';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: DashboardView },
    { path: '/racks', component: RacksView },
    { path: '/racks/:id', component: RackDetailView, props: true },
    { path: '/devices', component: DevicesView },
    { path: '/migrations', component: MigrationView },
  ],
});

createApp(App).use(router).mount('#app');
