const DAY = 86_400_000

export function formatDate(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleDateString('bg-BG', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'току-що'
  if (diff < 3_600_000) return `преди ${Math.floor(diff / 60_000)} мин`
  if (diff < DAY) return `преди ${Math.floor(diff / 3_600_000)} ч`
  if (diff < 30 * DAY) return `преди ${Math.floor(diff / DAY)} ден${Math.floor(diff / DAY) > 1 ? 'а' : ''}`
  return formatDate(ts)
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

export function roleLabel(role: string): string {
  switch (role) {
    case 'admin':
      return 'Админ'
    case 'moderator':
      return 'Модератор'
    default:
      return 'Потребител'
  }
}
