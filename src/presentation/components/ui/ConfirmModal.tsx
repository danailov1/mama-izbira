import { Modal } from './Modal'
import { Msr } from './Msr'

export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Потвърди',
  danger = false,
  busy = false,
  onConfirm,
  onClose,
}: {
  title: string
  message: React.ReactNode
  confirmLabel?: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <p>{message}</p>
      <div className="row">
        <button
          className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? <span className="spinner" /> : <Msr icon={danger ? 'delete' : 'check'} size="sm" />}
          {confirmLabel}
        </button>
        <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
          Отказ
        </button>
      </div>
    </Modal>
  )
}
