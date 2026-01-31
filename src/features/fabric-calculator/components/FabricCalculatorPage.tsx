import type { FC } from 'hono/jsx'
import { demoFabricOptions } from '../data/demoFabricDict'
import { templates } from '../data/templates'
import { CalculatorKeypad } from './CalculatorKeypad'
import { PartsList } from './PartsList'
import { Wizard } from './Wizard'

const buildClientScript = (): string => {
  const templatePayload = JSON.stringify(templates)
  const fabricOptionsPayload = JSON.stringify(demoFabricOptions)

  return `
    const templates = ${templatePayload};
    const fabricOptions = ${fabricOptionsPayload};

    const productInput = document.querySelector('[data-product-input]');
    const productSelect = document.querySelector('[data-product-select]');
    const productStatus = document.querySelector('[data-product-status]');
    const fabricWidthInput = document.querySelector('[data-fabric-width]');
    const repeatVerticalInput = document.querySelector('[data-repeat-vertical]');
    const repeatHorizontalInput = document.querySelector('[data-repeat-horizontal]');
    const priceInput = document.querySelector('[data-price-per-meter]');
    const cutDirectionRadios = document.querySelectorAll('[name="cutDirection"]');
    const templateSelect = document.querySelector('[data-template-select]');
    const addPartButton = document.querySelector('[data-add-part]');
    const partRowTemplate = document.getElementById('partRowTemplate');
    const partsBody = document.querySelector('[data-parts-body]');
    const calculateButton = document.querySelector('[data-calc-submit]');
    const resultTotalMm = document.querySelector('[data-result-total-mm]');
    const resultTotalMeter = document.querySelector('[data-result-total-meter]');
    const resultTable = document.querySelector('[data-result-table]');
    const resultWarnings = document.querySelector('[data-result-warnings]');

    let keypadInputs = [];
    let activeInput = null;

    const parseNumber = (value) => {
      if (!value) return 0;
      const n = Number(String(value).replace(/[^0-9.-]/g, ''));
      return Number.isFinite(n) ? n : 0;
    };

    const setActiveInput = (input) => {
      if (!input) return;
      if (activeInput) activeInput.classList.remove('ring-2', 'ring-blue-500');
      activeInput = input;
      activeInput.classList.add('ring-2', 'ring-blue-500');
    };

    const refreshKeypadInputs = () => {
      keypadInputs = Array.from(document.querySelectorAll('[data-keypad-input]'));
      keypadInputs.forEach((input) => {
        input.addEventListener('click', () => setActiveInput(input));
      });
      if (!activeInput && keypadInputs.length) {
        setActiveInput(keypadInputs[0]);
      }
    };

    const attachRemoveHandler = (row) => {
      const removeButton = row.querySelector('[data-remove-part]');
      if (removeButton) {
        removeButton.addEventListener('click', () => {
          row.remove();
          refreshKeypadInputs();
        });
      }
    };

    const addPartRow = (part) => {
      if (!partRowTemplate || !partsBody) return;
      const fragment = partRowTemplate.content.cloneNode(true);
      const row = fragment.querySelector('tr');
      if (!row) return;
      const nameSelect = row.querySelector('[data-part-name]');
      const countInput = row.querySelector('[data-part-count]');
      const widthInput = row.querySelector('[data-part-width]');
      const depthInput = row.querySelector('[data-part-depth]');

      if (nameSelect && part && part.name) nameSelect.value = part.name;
      if (countInput && part && part.count !== undefined) countInput.value = String(part.count);
      if (widthInput && part && part.width !== undefined) widthInput.value = String(part.width);
      if (depthInput && part && part.depth !== undefined) depthInput.value = String(part.depth);

      partsBody.appendChild(fragment);
      attachRemoveHandler(partsBody.lastElementChild);
      refreshKeypadInputs();
    };

    const applyTemplate = (templateId) => {
      if (!partsBody) return;
      partsBody.innerHTML = '';
      const selected = templates.find((item) => item.id === templateId);
      if (selected) {
        selected.parts.forEach(addPartRow);
      } else {
        addPartRow({ name: '座面', count: 1, width: 0, depth: 0 });
      }
    };

    const setStatus = (text, className) => {
      if (!productStatus) return;
      productStatus.textContent = text;
      productStatus.className = className;
    };

    const lookupFabricSpec = async (productCode) => {
      const code = String(productCode || '').trim();
      if (!code) {
        setStatus('品番を入力してください', 'text-xs text-slate-400');
        return;
      }
      setStatus('検索中...', 'text-xs text-slate-400');
      try {
        const res = await axios.get('/api/fabric-calculator/fabric-spec', {
          params: { productCode: code },
        });
        if (res.data && res.data.found) {
          const spec = res.data.spec;
          fabricWidthInput.value = spec.width || '';
          repeatVerticalInput.value = spec.repeatVertical || '';
          repeatHorizontalInput.value = spec.repeatHorizontal || '';
          if (spec.pricePerMeter !== undefined && spec.pricePerMeter !== null) {
            priceInput.value = spec.pricePerMeter;
          }
          setStatus(
            '主要品番を検出しました。スペックを自動入力済みです。',
            'text-xs text-emerald-600'
          );
        } else {
          setStatus('該当なし（手入力をしてください）', 'text-xs text-rose-500');
        }
      } catch (err) {
        console.error(err);
        setStatus(
          '検索に失敗しました。通信状態を確認してください。',
          'text-xs text-rose-500'
        );
      }
    };

    if (productSelect) {
      fabricOptions.forEach((code) => {
        const option = document.createElement('option');
        option.value = code;
        option.textContent = code;
        productSelect.appendChild(option);
      });
      productSelect.addEventListener('change', (event) => {
        const value = event.target.value;
        if (value) {
          productInput.value = value;
          lookupFabricSpec(value);
        }
      });
    }

    document.querySelectorAll('[data-product-lookup]').forEach((button) => {
      button.addEventListener('click', () => lookupFabricSpec(productInput.value));
    });

    if (templateSelect) {
      templates.forEach((template) => {
        const option = document.createElement('option');
        option.value = template.id;
        option.textContent = template.label;
        templateSelect.appendChild(option);
      });
      templateSelect.addEventListener('change', (event) => {
        applyTemplate(event.target.value);
      });
    }

    if (addPartButton) {
      addPartButton.addEventListener('click', () => addPartRow({ name: '座面', count: 1, width: 0, depth: 0 }));
    }

    document.querySelectorAll('[data-keypad-key]').forEach((button) => {
      button.addEventListener('click', () => {
        if (!activeInput) return;
        const key = button.getAttribute('data-keypad-key');
        if (key === 'C') {
          activeInput.value = '';
          return;
        }
        if (key === 'Next') {
          if (!keypadInputs.length) return;
          const index = keypadInputs.indexOf(activeInput);
          const nextIndex = index === -1 ? 0 : (index + 1) % keypadInputs.length;
          setActiveInput(keypadInputs[nextIndex]);
          return;
        }
        if (/^\\d$/.test(key)) {
          activeInput.value = (activeInput.value || '') + key;
        }
      });
    });

    const collectParts = () => {
      if (!partsBody) return [];
      const rows = Array.from(partsBody.querySelectorAll('tr'));
      return rows.map((row, index) => {
        const name = row.querySelector('[data-part-name]').value || 'パーツ';
        const count = parseNumber(row.querySelector('[data-part-count]').value);
        const width = parseNumber(row.querySelector('[data-part-width]').value);
        const depth = parseNumber(row.querySelector('[data-part-depth]').value);
        return {
          id: row.getAttribute('data-part-id') || \`part-\${index + 1}\`,
          name,
          count,
          width,
          depth,
          allowRailroading: true,
        };
      });
    };

    const renderResult = (result) => {
      resultTotalMm.textContent = result.totalLengthMm.toLocaleString();
      resultTotalMeter.textContent = result.totalLengthMeter.toLocaleString();
      resultTable.innerHTML = '';
      result.parts.forEach((part) => {
        const row = document.createElement('tr');
        row.innerHTML = \`
          <td class="py-2 pr-3 text-slate-800">\${part.name}</td>
          <td class="py-2 pr-3 text-right">\${part.count}</td>
          <td class="py-2 pr-3 text-right">\${part.columns}</td>
          <td class="py-2 pr-3 text-right">\${part.rows}</td>
          <td class="py-2 text-right">\${part.lengthRequired.toLocaleString()}</td>
        \`;
        resultTable.appendChild(row);
      });

      resultWarnings.innerHTML = '';
      if (result.warnings && result.warnings.length) {
        resultWarnings.innerHTML = result.warnings
          .map((warning) => \`<li>\${warning}</li>\`)
          .join('');
      }
    };

    if (calculateButton) {
      calculateButton.addEventListener('click', async () => {
        const cutDirection = Array.from(cutDirectionRadios).find((radio) => radio.checked)?.value || 'regular';
        const payload = {
          cutDirection,
          fabricSpec: {
            productCode: productInput.value || '',
            width: parseNumber(fabricWidthInput.value),
            repeatVertical: parseNumber(repeatVerticalInput.value),
            repeatHorizontal: parseNumber(repeatHorizontalInput.value),
            pricePerMeter: parseNumber(priceInput.value),
          },
          parts: collectParts(),
        };
        try {
          const res = await axios.post('/api/fabric-calculator/calculate', payload);
          renderResult(res.data.result);
        } catch (err) {
          console.error(err);
          resultWarnings.innerHTML = '<li>計算に失敗しました。入力内容を確認してください。</li>';
        }
      });
    }

    applyTemplate(templates[0]?.id);
    refreshKeypadInputs();
  `
}

export const FabricCalculatorPage: FC = () => {
  const steps = [
    {
      id: 'fabric-step',
      title: '生地の仕様を入力',
      description: '主要品番検索または手入力でスペックをセットします。',
      content: (
        <div class="space-y-4">
          <div class="rounded-xl bg-slate-50 p-4">
            <div class="grid gap-3 md:grid-cols-2">
              <div>
                <label class="text-sm font-semibold text-slate-700">
                  品番
                </label>
                <div class="mt-2 flex gap-2">
                  <input
                    data-product-input
                    type="text"
                    placeholder="例: UP5198"
                    class="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    data-product-lookup
                    class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                  >
                    主要品番検索
                  </button>
                </div>
                <p data-product-status class="mt-2 text-xs text-slate-400">
                  主要品番のみ自動入力します。
                </p>
              </div>
              <div>
                <label class="text-sm font-semibold text-slate-700">
                  主要品番から選択
                </label>
                <select
                  data-product-select
                  class="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">選択してください</option>
                </select>
              </div>
            </div>
          </div>

          <div class="grid gap-3 md:grid-cols-4">
            <div>
              <label class="text-sm font-semibold text-slate-700">
                有効巾 (mm)
              </label>
              <input
                data-fabric-width
                data-keypad-input
                type="text"
                inputmode="none"
                readonly
                class="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-right text-sm"
                placeholder="例: 1370"
              />
            </div>
            <div>
              <label class="text-sm font-semibold text-slate-700">
                タテリピート (mm)
              </label>
              <input
                data-repeat-vertical
                data-keypad-input
                type="text"
                inputmode="none"
                readonly
                class="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-right text-sm"
                placeholder="0"
              />
            </div>
            <div>
              <label class="text-sm font-semibold text-slate-700">
                ヨコリピート (mm)
              </label>
              <input
                data-repeat-horizontal
                data-keypad-input
                type="text"
                inputmode="none"
                readonly
                class="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-right text-sm"
                placeholder="0"
              />
            </div>
            <div>
              <label class="text-sm font-semibold text-slate-700">
                価格 (円/m)
              </label>
              <input
                data-price-per-meter
                data-keypad-input
                type="text"
                inputmode="none"
                readonly
                class="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-right text-sm"
                placeholder="0"
              />
            </div>
          </div>

          <div class="flex flex-wrap gap-3">
            <label class="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm">
              <input
                type="radio"
                name="cutDirection"
                value="regular"
                checked
              />
              縦取り（Regular）
            </label>
            <label class="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm">
              <input type="radio" name="cutDirection" value="railroading" />
              横取り（Railroading）
            </label>
          </div>
        </div>
      ),
    },
    {
      id: 'parts-step',
      title: 'パーツを設定',
      description: 'テンプレートから自動生成した後、現場寸法に合わせて調整します。',
      content: (
        <div class="space-y-4">
          <div class="rounded-xl bg-slate-50 p-4">
            <label class="text-sm font-semibold text-slate-700">
              椅子テンプレート
            </label>
            <select
              data-template-select
              class="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">テンプレートを選択</option>
            </select>
          </div>
          <PartsList />
        </div>
      ),
    },
    {
      id: 'result-step',
      title: '必要量を計算',
      description: '取り都合とリピートを反映した長さを算出します。',
      content: (
        <div class="space-y-4">
          <button
            type="button"
            data-calc-submit
            class="w-full rounded-xl bg-emerald-500 px-4 py-3 text-lg font-semibold text-white"
          >
            計算する
          </button>
          <div class="rounded-2xl bg-white p-4 shadow">
            <div class="grid gap-4 md:grid-cols-2">
              <div class="rounded-xl bg-slate-50 p-4">
                <p class="text-xs text-slate-500">必要長さ</p>
                <p class="text-2xl font-bold text-slate-900">
                  <span data-result-total-mm>0</span> mm
                </p>
                <p class="mt-1 text-sm text-slate-500">
                  <span data-result-total-meter>0</span> m
                </p>
              </div>
              <div class="rounded-xl bg-slate-50 p-4">
                <p class="text-xs text-slate-500">注意点</p>
                <ul
                  data-result-warnings
                  class="mt-2 space-y-1 text-xs text-rose-500"
                ></ul>
              </div>
            </div>

            <div class="mt-4 overflow-x-auto">
              <table class="min-w-full text-sm">
                <thead>
                  <tr class="text-left text-slate-500">
                    <th class="py-2 pr-3">パーツ</th>
                    <th class="py-2 pr-3 text-right">枚数</th>
                    <th class="py-2 pr-3 text-right">横並び</th>
                    <th class="py-2 pr-3 text-right">行数</th>
                    <th class="py-2 text-right">必要長さ (mm)</th>
                  </tr>
                </thead>
                <tbody data-result-table></tbody>
              </table>
            </div>
          </div>
        </div>
      ),
    },
  ]

  return (
    <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div class="space-y-6">
        <Wizard steps={steps} />
      </div>
      <div class="lg:sticky lg:top-6">
        <CalculatorKeypad className="w-full" />
      </div>
      <script dangerouslySetInnerHTML={{ __html: buildClientScript() }} />
    </div>
  )
}
