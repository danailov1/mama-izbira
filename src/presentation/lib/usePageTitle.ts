import { useEffect } from 'react'

const SUFFIX = 'мамаИзбира'

export function usePageTitle(title?: string | null): void {
  useEffect(() => {
    document.title = title ? `${title} — ${SUFFIX}` : `${SUFFIX} — ревюта на детски продукти`
  }, [title])
}
