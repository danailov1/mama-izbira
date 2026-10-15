import { Msr } from './Msr'

export function Stars({ rating, size = 'md' }: { rating: number; size?: 'sm' | 'md' }) {
  const rounded = Math.round(rating)
  return (
    <div className="stars-row" aria-label={`Оценка ${rating.toFixed(1)} от 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Msr
          key={i}
          icon="star"
          fill={i <= rounded}
          size={size === 'sm' ? 'sm' : 'md'}
          className={i > rounded ? 'dim' : ''}
        />
      ))}
    </div>
  )
}

export function StarInput({
  value,
  onChange,
}: {
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="star-input">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i)}
          aria-label={`${i} звезди`}
          title={`${i} звезди`}
        >
          <Msr icon="star" fill={i <= value} className={i > value ? 'dim' : ''} />
        </button>
      ))}
    </div>
  )
}
