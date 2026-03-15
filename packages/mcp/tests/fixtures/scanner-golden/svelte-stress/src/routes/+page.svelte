<script>
  import { goto } from '$app/navigation'

  const title = "Svelte ile hizli ilerle"
  const route = '/pricing'
  const classes = "grid gap-2"
</script>

<section class={classes}>
  <h1>{title}</h1>
  <p>Ilk kurulumu dakikalar icinde tamamla</p>
  <button aria-label="Paketi sec" on:click={() => goto(route)}>Paketi sec</button>
</section>
