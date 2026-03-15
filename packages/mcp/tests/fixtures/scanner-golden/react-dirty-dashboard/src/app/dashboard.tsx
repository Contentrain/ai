import clsx from 'clsx'
import { useRouter } from 'next/navigation'

const statusLabels = {
  active: 'Aktif Kullanici',
  pending: 'Onay Bekliyor',
}

export default function Dashboard() {
  const router = useRouter()
  const cardClass = clsx('grid', 'gap-2', 'text-sm')
  const apiRoute = '/api/v1/users'
  const highlight = '#00ff00'

  console.log('debug dashboard', apiRoute, highlight)

  return (
    <section className={cardClass}>
      <h3>Kullanici Listesi</h3>
      <button title="Filtreleri temizle" onClick={() => router.push('/users')}>
        Temizle
      </button>
      <p>{statusLabels.active}</p>
      <p>{statusLabels.pending}</p>
    </section>
  )
}
