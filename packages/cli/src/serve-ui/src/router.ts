import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: () => import('./components/layout/AppLayout.vue'),
      children: [
        { path: '', name: 'dashboard', component: () => import('./components/pages/DashboardPage.vue') },
        { path: 'models', name: 'models', component: () => import('./components/pages/ModelsPage.vue') },
        { path: 'models/:modelId', name: 'model-detail', component: () => import('./components/pages/ModelDetailPage.vue') },
        { path: 'content', name: 'content', component: () => import('./components/pages/ContentPage.vue') },
        { path: 'content/:modelId', name: 'content-list', component: () => import('./components/pages/ContentListPage.vue') },
        { path: 'validate', name: 'validate', component: () => import('./components/pages/ValidatePage.vue') },
        { path: 'branches', name: 'branches', component: () => import('./components/pages/BranchesPage.vue') },
        { path: 'branches/:branchName(.*)', name: 'branch-detail', component: () => import('./components/pages/BranchDetailPage.vue') },
        { path: 'normalize', name: 'normalize', component: () => import('./components/pages/NormalizePage.vue') },
      ],
    },
  ],
})
