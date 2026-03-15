<template>
  <form class="grid gap-4">
    <h2>Hemen Kayit Ol</h2>
    <input placeholder="Is e-posta adresin" aria-label="E-posta alani" />
    <button data-testid="signup-submit">Kaydi Tamamla</button>
    <p>Kaydolarak kosullari kabul edersin</p>
  </form>
</template>

<script setup lang="ts">
import { navigateTo } from '#imports'

const messages = {
  helper: 'Sadece sirket e-postasi kullan',
  success: 'Hesabin hazir',
}

const route = '/signup'
console.warn('ignore signup debug', route)
</script>
