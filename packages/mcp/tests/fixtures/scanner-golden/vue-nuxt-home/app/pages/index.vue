<template>
  <section class="flex items-center text-xl">
    <h1>Platforma Hos Geldin</h1>
    <UiButton label="Teklifi Al" />
    <p>Uretime daha hizli basla</p>
    <a href="/pricing">Fiyatlari Incele</a>
  </section>
</template>

<script setup lang="ts">
import { useHead } from '#imports'

const seo = {
  title: 'Platforma Hos Geldin',
  description: 'Uretime daha hizli basla',
}

useHead({ title: seo.title })
console.log('debug: home')
</script>
