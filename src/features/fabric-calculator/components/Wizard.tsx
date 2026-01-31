import type { FC, JSX } from 'hono/jsx'

interface WizardStep {
  id: string
  title: string
  description?: string
  content: JSX.Element
}

interface WizardProps {
  steps: WizardStep[]
}

export const Wizard: FC<WizardProps> = ({ steps }) => {
  return (
    <div class="space-y-6">
      {steps.map((step, index) => (
        <section
          id={step.id}
          class="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"
        >
          <div class="mb-4 flex items-start justify-between">
            <div>
              <p class="text-xs font-semibold text-blue-600">
                STEP {index + 1}
              </p>
              <h3 class="text-lg font-bold text-slate-900">{step.title}</h3>
              {step.description && (
                <p class="mt-1 text-sm text-slate-500">{step.description}</p>
              )}
            </div>
          </div>
          {step.content}
        </section>
      ))}
    </div>
  )
}
