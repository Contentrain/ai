import Link from 'next/link'

export default function Page() {
  const cta = "Teklifi Al"

  return (
    <main className="flex items-center text-xl">
      <h2>Bugun Basla</h2>
      <button aria-label="Sepete ekle">{cta}</button>
      <Link href="/checkout">Odeme</Link>
    </main>
  )
}
