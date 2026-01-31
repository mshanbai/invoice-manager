import type { FC } from 'hono/jsx'

interface CalculatorKeypadProps {
  className?: string
}

const keypadRows = [
  ['7', '8', '9'],
  ['4', '5', '6'],
  ['1', '2', '3'],
  ['0', 'C', 'Next'],
]

export const CalculatorKeypad: FC<CalculatorKeypadProps> = ({ className }) => {
  return (
    <div class={`rounded-2xl bg-slate-900 p-4 shadow-lg ${className || ''}`}>
      <div class="grid grid-cols-3 gap-3">
        {keypadRows.flat().map((key) => (
          <button
            type="button"
            data-keypad-key={key}
            class={`h-14 rounded-xl text-lg font-semibold transition active:scale-95 ${
              key === 'C'
                ? 'bg-rose-500 text-white'
                : key === 'Next'
                  ? 'bg-emerald-500 text-white'
                  : 'bg-white text-slate-900'
            }`}
          >
            {key}
          </button>
        ))}
      </div>
      <p class="mt-3 text-xs text-slate-200">
        数値入力はこのテンキーを使用します
      </p>
    </div>
  )
}
