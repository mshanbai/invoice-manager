import type { FC } from 'hono/jsx'

const partOptions = ['座面', '背もたれ', '肘', '前垂れ', 'その他']

export const PartsList: FC = () => {
  return (
    <div class="rounded-2xl bg-white p-4 shadow">
      <div class="mb-3 flex items-center justify-between">
        <h3 class="text-lg font-bold text-slate-900">パーツ構成</h3>
        <button
          type="button"
          data-add-part
          class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
        >
          行を追加
        </button>
      </div>

      <div class="overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead>
            <tr class="text-left text-slate-500">
              <th class="py-2 pr-3">パーツ</th>
              <th class="py-2 pr-3">枚数</th>
              <th class="py-2 pr-3">巾 (mm)</th>
              <th class="py-2 pr-3">奥行/高さ (mm)</th>
              <th class="py-2"></th>
            </tr>
          </thead>
          <tbody data-parts-body></tbody>
        </table>
      </div>

      <template id="partRowTemplate">
        <tr class="border-t">
          <td class="py-2 pr-3">
            <select
              data-part-name
              class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              {partOptions.map((option) => (
                <option value={option}>{option}</option>
              ))}
            </select>
          </td>
          <td class="py-2 pr-3">
            <input
              data-part-count
              data-keypad-input
              type="text"
              inputmode="none"
              readonly
              class="w-20 rounded-lg border border-slate-200 px-3 py-2 text-right text-sm"
              placeholder="0"
            />
          </td>
          <td class="py-2 pr-3">
            <input
              data-part-width
              data-keypad-input
              type="text"
              inputmode="none"
              readonly
              class="w-24 rounded-lg border border-slate-200 px-3 py-2 text-right text-sm"
              placeholder="0"
            />
          </td>
          <td class="py-2 pr-3">
            <input
              data-part-depth
              data-keypad-input
              type="text"
              inputmode="none"
              readonly
              class="w-28 rounded-lg border border-slate-200 px-3 py-2 text-right text-sm"
              placeholder="0"
            />
          </td>
          <td class="py-2">
            <button
              type="button"
              data-remove-part
              class="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-500"
            >
              削除
            </button>
          </td>
        </tr>
      </template>
    </div>
  )
}
