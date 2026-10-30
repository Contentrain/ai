<script setup lang="ts">
// The default home layout has no <main> landmark (doc pages get one from VPDoc).
import VPHome from 'vitepress/dist/client/theme-default/components/VPHome.vue'
</script>

<template>
  <main class="HomeMain">
    <VPHome>
      <template v-for="(_, name) in $slots" #[name]>
        <slot :name="name" />
      </template>
    </VPHome>
  </main>
</template>
