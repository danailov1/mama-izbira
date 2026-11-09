import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Msr } from './Msr'

interface ToastItem {
  id: number
  message: string
  icon: string
}

interface ToastCtx {
  showToast: (message: string, icon?: string) => void
}

const Ctx = createContext<ToastCtx>({ showToast: () => {} })

export function useToast() {
  return useContext(Ctx)
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(1)
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())

  useEffect(() => {
    const activeTimers = timers.current
    return () => {
      activeTimers.forEach((timer) => clearTimeout(timer))
      activeTimers.clear()
    }
  }, [])

  const showToast = useCallback((message: string, icon = 'check_circle') => {
    const id = nextId.current++
    setToasts((prev) => [...prev, { id, message, icon }])
    const timer = setTimeout(() => {
      timers.current.delete(timer)
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3200)
    timers.current.add(timer)
  }, [])

  return (
    <Ctx.Provider value={{ showToast }}>
      {children}
      <div
        style={{
          position: 'fixed',
          top: 72,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 70,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          alignItems: 'center',
        }}
      >
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <Msr icon={t.icon} />
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
