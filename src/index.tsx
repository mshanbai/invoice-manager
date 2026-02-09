import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { Layout } from './components/Layout'
import { FabricCalculatorPage } from './features/fabric-calculator'
import api from './routes/api'
import { accountTypeCodeToLabel, normalizeAccountTypeToCode } from './utils/bankAccount'

const app = new Hono()

const bankAccountTypeHelpers = `
  var normalizeAccountTypeToCode = ${normalizeAccountTypeToCode.toString()};
  var accountTypeCodeToLabel = ${accountTypeCodeToLabel.toString()};
`

const docHeaderTitleHelpers = `
  function normalizeHeaderText(value) {
    if (value === null || value === undefined) return '';
    var text = String(value).trim();
    if (!text || text === 'undefined' || text === 'null') return '';
    return text;
  }
  function getClientDisplayLabel(client) {
    if (!client) return '';
    var name = normalizeHeaderText(client.client_name || client.name || '');
    if (!name) return '';
    var code = normalizeHeaderText(client.client_code);
    return code ? name + ' (' + code + ')' : name;
  }
  function buildDocHeaderTitle(params) {
    var docTypeLabel = normalizeHeaderText(params && params.docTypeLabel);
    var mode = normalizeHeaderText(params && params.mode);
    var clientLabel = normalizeHeaderText(params && params.clientLabel);
    var docNo = normalizeHeaderText(params && params.docNo);
    var baseTitle = '';
    if (mode === 'edit') {
      baseTitle = (docTypeLabel ? docTypeLabel : '') + '編集';
    } else if (mode === 'new') {
      baseTitle = '新規' + (docTypeLabel ? docTypeLabel : '') + '作成';
    } else {
      baseTitle = docTypeLabel || '';
    }
    var parts = [];
    if (clientLabel) parts.push(clientLabel);
    if (docNo) parts.push(docNo);
    if (parts.length > 0 && baseTitle) return baseTitle + ': ' + parts.join(' ');
    return baseTitle || parts.join(' ');
  }
`;

const taxRateHelpers = `
  function normalizeTaxRate(rate, fallback) {
    if (rate === null || rate === undefined || rate === '') return fallback;
    var n = Number(rate);
    return Number.isFinite(n) ? n : fallback;
  }
  function resolveCategoryTaxRate(category, fallback) {
    if (!category) return fallback;
    var taxType = category.tax_type ?? category.taxType ?? category.taxCategory ?? null;
    if (taxType === 'standard') return 10;
    if (taxType === 'reduced') return 8;
    if (taxType === 'non_taxable') return 0;
    if (taxType === 'exempt') return 0;
    if (taxType === 'excluded') return 0;
    if (taxType === 'custom') return normalizeTaxRate(category.tax_rate ?? category.taxRate, fallback);
    return normalizeTaxRate(category.tax_rate ?? category.taxRate, fallback);
  }
  function resolveLineTaxRate(params) {
    var product = params && params.product ? params.product : null;
    var category = params && params.category ? params.category : null;
    var fallback = params ? params.fallback : 10;
    var productRateRaw = product && (product.tax_rate ?? product.taxRate);
    if (productRateRaw !== null && productRateRaw !== undefined && productRateRaw !== '') {
      return normalizeTaxRate(productRateRaw, fallback);
    }
    return resolveCategoryTaxRate(category, fallback);
  }
`;

const recentAccordionScript = `
  (function setupRecentAccordion() {
    var w = window;
    if (w.__sbRecentAccordionInstalled) return;
    w.__sbRecentAccordionInstalled = true;

    function findRoot(toggleEl) {
      return toggleEl.closest('[data-subsidebar]');
    }

    function applyOpen(root) {
      var body = root.querySelector('[data-recent-body]');
      if (!body) return;
      body.classList.remove('hidden');
      var chevron = root.querySelector('[data-recent-chevron]');
      if (chevron) {
        chevron.classList.add('rotate-180');
      }
    }

    function toggle(root) {
      var body = root.querySelector('[data-recent-body]');
      if (!body) return;
      var willOpen = body.classList.contains('hidden');
      body.classList.toggle('hidden', !willOpen);
      var chevron = root.querySelector('[data-recent-chevron]');
      if (chevron) {
        chevron.classList.toggle('rotate-180', willOpen);
      }
    }

    function initAll() {
      var toggles = document.querySelectorAll('[data-recent-toggle]');
      toggles.forEach(function(t) {
        var root = findRoot(t);
        if (root) applyOpen(root);
      });
    }

    document.addEventListener('click', function(ev) {
      var target = ev.target;
      if (!target || !target.closest) return;
      var toggleEl = target.closest('[data-recent-toggle]');
      if (!toggleEl) return;
      var root = findRoot(toggleEl);
      if (!root) return;
      toggle(root);
    });

    if (document.body) {
      var observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(m) {
          Array.prototype.forEach.call(m.addedNodes, function(node) {
            if (!node || node.nodeType !== 1) return;
            if (node.matches && node.matches('[data-recent-toggle]')) {
              var root = findRoot(node);
              if (root) applyOpen(root);
            }
            if (node.querySelectorAll) {
              var innerToggles = node.querySelectorAll('[data-recent-toggle]');
              Array.prototype.forEach.call(innerToggles, function(t) {
                var root = findRoot(t);
                if (root) applyOpen(root);
              });
            }
          });
        });
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initAll);
    } else {
      initAll();
    }
  })();
`;

const supabaseEnv = {
  url: (import.meta as any).env?.VITE_SUPABASE_URL || '',
  anonKey: (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || ''
}

// CORS設定
app.use('/api/*', cors())

// API ルート
app.route('/api', api)

// =====================================
// ダッシュボード
// =====================================
app.get('/', async (c) => {
  return c.html(
    <Layout title="ダッシュボード" currentPath="/">
      <div id="dashboard">
        {/* クイックアクション */}
        <div class="bg-white rounded-lg shadow p-4 mb-6">
          <div class="flex flex-wrap gap-3">
            <a href="/estimates?action=new" class="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition">
              <i class="fas fa-plus mr-2"></i>新規見積作成
            </a>
            <a href="/deliveries?action=new" class="inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition">
              <i class="fas fa-plus mr-2"></i>新規納品作成
            </a>
            <a href="/invoices?action=new" class="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
              <i class="fas fa-plus mr-2"></i>新規請求作成
            </a>
          </div>
        </div>

        {/* メイン統計カード - 1行目 */}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div class="bg-white rounded-lg shadow p-5">
            <div class="flex items-center">
              <div class="bg-blue-500 rounded-full p-3">
                <i class="fas fa-yen-sign text-white text-xl"></i>
              </div>
              <div class="ml-4">
                <p class="text-gray-500 text-sm">今月の売上</p>
                <p id="monthlySales" class="text-xl font-bold text-gray-800">読込中...</p>
              </div>
            </div>
          </div>
          <div class="bg-white rounded-lg shadow p-5">
            <div class="flex items-center">
              <div class="bg-orange-500 rounded-full p-3">
                <i class="fas fa-exclamation-circle text-white text-xl"></i>
              </div>
              <div class="ml-4">
                <p class="text-gray-500 text-sm">未入金請求</p>
                <p id="unpaidInvoices" class="text-xl font-bold text-gray-800">読込中...</p>
                <p id="unpaidAmount" class="text-sm text-orange-600"></p>
              </div>
            </div>
          </div>
          <div class="bg-white rounded-lg shadow p-5">
            <div class="flex items-center">
              <div class="bg-green-500 rounded-full p-3">
                <i class="fas fa-file-invoice text-white text-xl"></i>
              </div>
              <div class="ml-4">
                <p class="text-gray-500 text-sm">未請求納品書</p>
                <p id="uninvoicedCount" class="text-xl font-bold text-gray-800">読込中...</p>
              </div>
            </div>
          </div>
          <div class="bg-white rounded-lg shadow p-5">
            <div class="flex items-center">
              <div class="bg-purple-500 rounded-full p-3">
                <i class="fas fa-building text-white text-xl"></i>
              </div>
              <div class="ml-4">
                <p class="text-gray-500 text-sm">取引先数</p>
                <p id="clientCount" class="text-xl font-bold text-gray-800">読込中...</p>
              </div>
            </div>
          </div>
        </div>

        {/* 今月の書類数 - 2行目 */}
        <div class="grid grid-cols-3 gap-4 mb-6">
          <div class="bg-white rounded-lg shadow p-4">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-gray-500 text-sm">今月の見積</p>
                <p id="monthlyEstimates" class="text-2xl font-bold text-green-600">-</p>
              </div>
              <i class="fas fa-file-alt text-green-200 text-3xl"></i>
            </div>
          </div>
          <div class="bg-white rounded-lg shadow p-4">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-gray-500 text-sm">今月の納品</p>
                <p id="monthlyDeliveries" class="text-2xl font-bold text-purple-600">-</p>
              </div>
              <i class="fas fa-truck text-purple-200 text-3xl"></i>
            </div>
          </div>
          <div class="bg-white rounded-lg shadow p-4">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-gray-500 text-sm">今月の請求</p>
                <p id="monthlyInvoicesCount" class="text-2xl font-bold text-blue-600">-</p>
              </div>
              <i class="fas fa-file-invoice-dollar text-blue-200 text-3xl"></i>
            </div>
          </div>
        </div>

        {/* 下部: グラフと取引先別売上 */}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 6ヶ月売上グラフ */}
          <div class="bg-white rounded-lg shadow p-6">
            <h3 class="text-lg font-bold mb-4">月別売上（直近6ヶ月）</h3>
            <div style="height: 200px;">
              <canvas id="salesChart"></canvas>
            </div>
          </div>

          {/* 取引先別売上 */}
          <div class="bg-white rounded-lg shadow p-6">
            <h3 class="text-lg font-bold mb-4">取引先別売上（今月）</h3>
            <div id="clientSales" class="space-y-3 overflow-y-auto" style="max-height: 200px;">
              <p class="text-gray-500">読込中...</p>
            </div>
          </div>
        </div>
      </div>
      
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
      <script dangerouslySetInnerHTML={{__html: `
        async function loadDashboard() {
          const defaultSummary = {
            monthly_sales: 0,
            client_sales: [],
            uninvoiced_count: 0,
            monthly_estimates: 0,
            monthly_deliveries: 0,
            monthly_invoices: 0,
            unpaid_invoices: { count: 0, total: 0 },
            monthly_sales_chart: []
          };
          let summaryData = defaultSummary;
          let clientsData = [];
          try {
            const [summary, clients] = await Promise.all([
              axios.get('/api/dashboard/summary'),
              axios.get('/api/clients')
            ]);
            summaryData = summary.data || defaultSummary;
            clientsData = clients.data || [];
          } catch (e) {
            console.error(e);
            summaryData = defaultSummary;
            try {
              const clients = await axios.get('/api/clients');
              clientsData = clients.data || [];
            } catch (e2) {
              console.error(e2);
              clientsData = [];
            }
          }
          
          try {
            // 今月の売上
            document.getElementById('monthlySales').textContent = 
              '¥' + (summaryData.monthly_sales || 0).toLocaleString();
            
            // 未入金請求書
            document.getElementById('unpaidInvoices').textContent = 
              summaryData.unpaid_invoices.count + '件';
            if (summaryData.unpaid_invoices.total > 0) {
              document.getElementById('unpaidAmount').textContent = 
                '¥' + summaryData.unpaid_invoices.total.toLocaleString();
            }
            
            // 未請求納品書
            document.getElementById('uninvoicedCount').textContent = 
              summaryData.uninvoiced_count + '件';
            
            // 取引先数
            document.getElementById('clientCount').textContent = 
              clientsData.length + '社';
            
            // 今月の書類数
            document.getElementById('monthlyEstimates').textContent = 
              summaryData.monthly_estimates + '件';
            document.getElementById('monthlyDeliveries').textContent = 
              summaryData.monthly_deliveries + '件';
            document.getElementById('monthlyInvoicesCount').textContent = 
              summaryData.monthly_invoices + '件';
            
            // 取引先別売上
            const salesHtml = summaryData.client_sales.length > 0
              ? summaryData.client_sales.map(s => 
                  '<div class="flex justify-between py-2 border-b">' +
                  '<span>' + s.client_name + '</span>' +
                  '<span class="font-bold">¥' + (s.total || 0).toLocaleString() + '</span>' +
                  '</div>'
                ).join('')
              : '<p class="text-gray-500">今月のデータはありません</p>';
            document.getElementById('clientSales').innerHTML = salesHtml;
            
            // 6ヶ月売上グラフ
            const chartData = summaryData.monthly_sales_chart || [];
            const ctx = document.getElementById('salesChart').getContext('2d');
            new Chart(ctx, {
              type: 'bar',
              data: {
                labels: chartData.map(d => d.label),
                datasets: [{
                  label: '売上',
                  data: chartData.map(d => d.total),
                  backgroundColor: 'rgba(59, 130, 246, 0.7)',
                  borderColor: 'rgb(59, 130, 246)',
                  borderWidth: 1
                }]
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false }
                },
                scales: {
                  y: {
                    beginAtZero: true,
                    ticks: {
                      callback: function(value) {
                        return '¥' + value.toLocaleString();
                      }
                    }
                  }
                }
              }
            });
          } catch (e) {
            console.error(e);
          }
        }
        loadDashboard();
      `}} />
    </Layout>
  )
})

// =====================================
// 椅子張り替え用・生地必要量 自動計算ツール
// =====================================
app.get('/fabric-calculator', async (c) => {
  return c.html(
    <Layout
      title="椅子張り替え用・生地必要量 自動計算"
      currentPath="/fabric-calculator"
    >
      <FabricCalculatorPage />
    </Layout>
  )
})

// =====================================
// 自社情報
// =====================================
app.get('/company', async (c) => {
  return c.html(
    <Layout title="自社情報" currentPath="/company" hideTitle={true}>
      <div class="sticky top-0 z-50 -mx-4 md:-mx-8 px-4 md:px-8 bg-white border-b mb-6">
        <div class="flex items-center justify-between py-4">
          <h2 class="text-2xl font-bold text-gray-800">自社情報</h2>
          <div class="flex items-center gap-3">
            <span id="pageUnsavedIndicator" class="text-sm text-red-600 font-semibold hidden">●未保存</span>
            <button id="saveCompanyBtnTop" type="button"
              class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition-colors">
              <i class="fas fa-save mr-2"></i>保存
            </button>
          </div>
        </div>
      </div>
      <div class="bg-white rounded-lg shadow p-6">
        <form id="companyForm" class="space-y-8" data-track-unsaved="true">
          <input type="hidden" id="bankAccountsDirtyToken" name="bank_accounts_dirty_token" value="" />
          {/* 基本情報 */}
          <div>
            <h3 class="text-lg font-bold mb-4 pb-2 border-b text-gray-800">
              <i class="fas fa-building mr-2 text-blue-600"></i>基本情報
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">会社名 *</label>
                <input type="text" name="company_name" required
                  class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">部署名</label>
                <input type="text" name="department_name"
                  class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">担当者名</label>
                <input type="text" name="person_name"
                  class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">適格請求書登録番号</label>
                <input type="text" name="invoice_registration_no" placeholder="T1234567890123"
                  class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
                <p class="text-xs text-gray-500 mt-1">インボイス制度対応の登録番号（T+13桁の数字）</p>
              </div>
            </div>
          </div>

          {/* 代表者情報 */}
          <div>
            <h3 class="text-lg font-bold mb-4 pb-2 border-b text-gray-800">
              <i class="fas fa-user-tie mr-2 text-indigo-600"></i>代表者情報
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">役職</label>
                <input type="text" name="representative_title" placeholder="例: 代表取締役"
                  class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">代表者名</label>
                <input type="text" name="representative_name"
                  class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          </div>

          {/* 住所情報 */}
          <div>
            <h3 class="text-lg font-bold mb-4 pb-2 border-b text-gray-800">
              <i class="fas fa-map-marker-alt mr-2 text-green-600"></i>住所情報
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">郵便番号</label>
                <input type="text" name="postal_code" placeholder="123-4567" maxLength={8}
                  class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
              </div>
              <div class="md:col-span-2">
                <label class="block text-sm font-medium text-gray-700 mb-1">住所</label>
                <input type="text" name="address"
                  class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">番地</label>
                <input type="text" name="address_number"
                  class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">ビル名等</label>
                <input type="text" name="building_name"
                  class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          </div>

          {/* 連絡先情報 */}
          <div>
            <h3 class="text-lg font-bold mb-4 pb-2 border-b text-gray-800">
              <i class="fas fa-phone mr-2 text-purple-600"></i>連絡先情報
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">TEL</label>
                <input type="text" name="tel"
                  class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">FAX</label>
                <input type="text" name="fax"
                  class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">メールアドレス</label>
                <input type="email" name="email"
                  class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">ホームページ</label>
                <input type="text" name="website"
                  class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          </div>

          {/* ロゴ・会社印 */}
          <div>
            <h3 class="text-lg font-bold mb-4 pb-2 border-b text-gray-800">
              <i class="fas fa-image mr-2 text-pink-600"></i>ロゴ・会社印
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">会社ロゴ</label>
                <div class="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-blue-400 transition-colors">
                  <input type="file" id="logoInput" accept="image/*" class="hidden" />
                  <input type="hidden" name="logo_url" id="logoUrl" />
                  <div id="logoPreview" class="mb-2">
                    <i class="fas fa-image text-4xl text-gray-300"></i>
                  </div>
                  <button type="button" onclick="document.getElementById('logoInput').click()"
                    class="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm">
                    <i class="fas fa-upload mr-1"></i>画像を選択
                  </button>
                  <p class="text-xs text-gray-500 mt-2">推奨: 横長画像（PNG/JPG、500KB以下）</p>
                  <button type="button" id="clearLogoBtn" class="text-xs text-red-500 hover:text-red-700 mt-1 hidden">
                    <i class="fas fa-trash-alt mr-1"></i>削除
                  </button>
                </div>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">会社印</label>
                <div class="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-blue-400 transition-colors">
                  <input type="file" id="stampInput" accept="image/*" class="hidden" />
                  <input type="hidden" name="stamp_url" id="stampUrl" />
                  <div id="stampPreview" class="mb-2">
                    <i class="fas fa-stamp text-4xl text-gray-300"></i>
                  </div>
                  <button type="button" onclick="document.getElementById('stampInput').click()"
                    class="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm">
                    <i class="fas fa-upload mr-1"></i>画像を選択
                  </button>
                  <p class="text-xs text-gray-500 mt-2">推奨: 正方形画像（PNG/透過背景、500KB以下）</p>
                  <button type="button" id="clearStampBtn" class="text-xs text-red-500 hover:text-red-700 mt-1 hidden">
                    <i class="fas fa-trash-alt mr-1"></i>削除
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 振込先情報（メイン） */}
          <div id="mainBankSection">
            <h3 class="text-lg font-bold mb-4 pb-2 border-b text-gray-800">
              <i class="fas fa-university mr-2 text-teal-600"></i>振込先情報（請求書用）
              <span class="ml-2 text-xs text-gray-500 font-semibold">メイン口座</span>
              <span id="bankAccountsTotalCount" class="ml-2 text-xs text-gray-500 font-semibold">合計：1/5（デフォルト含む）</span>
            </h3>
            <p class="text-sm text-gray-500 mb-3">
              <i class="fas fa-info-circle mr-1"></i>
              ※請求書には、ここに登録した振込先（メイン＋追加）の中から最大3件まで表示できます。
            </p>
            <div id="mainBankDefaultLabel" class="flex items-center gap-2 mb-3">
              <input type="radio" name="default_bank_account" id="mainBankRadio" value="-1" checked class="w-4 h-4 text-blue-600" />
              <label for="mainBankRadio" class="text-sm font-medium text-blue-600">請求書のデフォルト振込先 <i class="fas fa-check-circle"></i></label>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">銀行名</label>
                <input type="text" name="bank_name"
                  class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">支店名</label>
                <input type="text" name="bank_branch"
                  class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">口座種別</label>
                <select name="account_type"
                  class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500">
                  <option value="">選択してください</option>
                  <option value="ordinary">普通</option>
                  <option value="current">当座</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">口座番号</label>
                <input type="text" name="account_number"
                  class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
              </div>
              <div class="md:col-span-2">
                <label class="block text-sm font-medium text-gray-700 mb-1">口座名義<span class="ml-2 inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600">デフォルト</span></label>
                <input type="text" name="account_holder" placeholder="例: カ）〇〇〇〇"
                  class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
                <p class="text-xs text-gray-500 mt-1">カタカナ表記（振込名義）</p>
              </div>
            </div>
          </div>

          {/* 追加口座 */}
          <div>
            <div class="flex items-center justify-between mb-4 pb-2 border-b">
              <h3 class="text-lg font-bold text-gray-800">
                <i class="fas fa-plus-circle mr-2 text-teal-600"></i>追加の振込先
                <span id="bankAccountsExtraCount" class="ml-2 text-xs text-gray-500 font-semibold">追加：0件（最大4件）</span>
              </h3>
              <div class="flex items-center gap-2">
                <p id="bankAccountsLimitNote" class="text-sm text-red-600 hidden">
                  ※上限に達しています（合計：5/5件）削除すると追加できます。
                </p>
                <button type="button" id="addBankBtn"
                  class="bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg text-sm">
                  <i class="fas fa-plus mr-1"></i>口座を追加
                </button>
              </div>
            </div>
            <div id="draftBankAccountContainer" class="space-y-4"></div>
            <div id="bankAccountsContainer" class="space-y-4">
              {/* 追加口座がここに動的に追加される */}
            </div>
          </div>

          {/* デフォルト設定 */}
          <div class="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg p-5">
            <h3 class="text-lg font-bold mb-4 text-blue-800">
              <i class="fas fa-cog mr-2"></i>デフォルト設定
            </h3>
            
            {/* 消費税設定 */}
            <div class="mb-6">
              <label class="block text-sm font-bold text-blue-700 mb-3">デフォルト消費税</label>
              <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                <label class="flex items-center p-3 bg-white rounded-lg border-2 cursor-pointer hover:border-blue-400 transition-colors border-gray-200">
                  <input type="radio" name="default_tax_type" value="standard" class="w-4 h-4 text-blue-600" />
                  <span class="ml-2 text-sm font-medium">標準税率<br/><span class="text-xs text-gray-500">10%</span></span>
                </label>
                <label class="flex items-center p-3 bg-white rounded-lg border-2 cursor-pointer hover:border-green-400 transition-colors border-gray-200">
                  <input type="radio" name="default_tax_type" value="reduced" class="w-4 h-4 text-green-600" />
                  <span class="ml-2 text-sm font-medium">軽減税率<br/><span class="text-xs text-gray-500">8%</span></span>
                </label>
                <label class="flex items-center p-3 bg-white rounded-lg border-2 cursor-pointer hover:border-gray-400 transition-colors border-gray-200">
                  <input type="radio" name="default_tax_type" value="exempt" class="w-4 h-4 text-gray-600" />
                  <span class="ml-2 text-sm font-medium">非課税<br/><span class="text-xs text-gray-500">0%</span></span>
                </label>
                <label class="flex items-center p-3 bg-white rounded-lg border-2 cursor-pointer hover:border-purple-400 transition-colors border-gray-200">
                  <input type="radio" name="default_tax_type" value="custom" class="w-4 h-4 text-purple-600" />
                  <span class="ml-2 text-sm font-medium">カスタム</span>
                </label>
              </div>
              <div id="customTaxRateSection" class="mt-3 hidden">
                <div class="flex items-center gap-2">
                  <input type="number" name="default_tax_rate" id="defaultTaxRate" value="10" step="0.1" min="0" max="100"
                    class="w-24 border-2 border-purple-300 rounded-lg px-3 py-2 text-center font-bold focus:ring-2 focus:ring-purple-500" />
                  <span class="font-bold text-gray-600">%</span>
                </div>
              </div>
            </div>

            {/* 消費税表示設定 */}
            <div class="bg-yellow-50 rounded-lg p-4 mb-6">
              <label class="flex items-center cursor-pointer">
                <div class="relative">
                  <input type="checkbox" name="show_tax_on_estimate_delivery" id="showTaxToggle" class="sr-only peer" />
                  <div class="w-11 h-6 bg-gray-300 rounded-full peer peer-checked:bg-green-500 transition-colors"></div>
                  <div class="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5"></div>
                </div>
                <span class="ml-3 text-sm font-bold text-gray-700">
                  <i class="fas fa-calculator mr-1 text-yellow-600"></i>見積書・納品書に消費税を表示
                </span>
              </label>
              <p class="text-xs text-gray-500 mt-2 ml-14">
                <i class="fas fa-info-circle mr-1"></i>OFFの場合、見積書・納品書では税抜き金額のみ表示されます。請求書では常に消費税が表示されます。
              </p>
            </div>

            {/* 見積有効期限・締め日・支払い期限 */}
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label class="block text-sm font-bold text-green-700 mb-2">見積有効期限（日数）</label>
                <input type="number" name="estimate_valid_days" placeholder="30" min="1" max="365"
                  class="w-full border-2 border-green-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 bg-white" />
                <p class="text-xs text-green-600 mt-1"><i class="fas fa-info-circle mr-1"></i>見積書作成時のデフォルト有効期限</p>
              </div>
              <div>
                <label class="block text-sm font-bold text-blue-700 mb-2">デフォルト締め日</label>
                <input type="text" name="default_closing_day" placeholder="例: 末、20"
                  class="w-full border-2 border-blue-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 bg-white" />
                <p class="text-xs text-blue-600 mt-1"><i class="fas fa-info-circle mr-1"></i>取引先新規登録時のデフォルト値</p>
              </div>
              <div>
                <label class="block text-sm font-bold text-blue-700 mb-2">デフォルト支払い期限</label>
                <input type="text" name="default_payment_day" placeholder="例: 翌月末、翌月20"
                  class="w-full border-2 border-blue-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 bg-white" />
                <p class="text-xs text-blue-600 mt-1"><i class="fas fa-info-circle mr-1"></i>取引先新規登録時のデフォルト値</p>
              </div>
            </div>

            {/* 見積書デフォルト設定 */}
            <div class="mt-6 p-4 bg-green-50 rounded-lg border border-green-200">
              <h3 class="text-sm font-bold text-green-800 mb-4"><i class="fas fa-file-invoice mr-2"></i>見積書デフォルト設定</h3>
              <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label class="block text-sm font-bold text-green-700 mb-1">受渡場所</label>
                  <input type="text" name="default_delivery_place" placeholder="例: 御社指定場所"
                    class="w-full border border-green-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 bg-white" />
                </div>
                <div>
                  <label class="block text-sm font-bold text-green-700 mb-1">取引条件</label>
                  <input type="text" name="default_payment_terms" placeholder="例: 納品後30日以内"
                    class="w-full border border-green-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 bg-white" />
                </div>
                <div>
                  <label class="block text-sm font-bold text-green-700 mb-1">納期</label>
                  <input type="text" name="default_delivery_date" placeholder="例: ご発注後2週間以内"
                    class="w-full border border-green-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 bg-white" />
                </div>
              </div>
              <p class="text-xs text-green-600 mt-2"><i class="fas fa-info-circle mr-1"></i>見積書作成時に自動反映されます（各見積書で編集可能）</p>
            </div>

            {/* 納品書設定 */}
            <div class="mt-6 p-4 bg-purple-50 rounded-lg border border-purple-200">
              <h3 class="text-sm font-bold text-purple-800 mb-4"><i class="fas fa-truck mr-2"></i>納品書設定</h3>
              <div>
                <label class="block text-sm font-bold text-purple-700 mb-2">納品書の用紙形式</label>
                <div class="flex gap-4">
                  <label class="flex items-center cursor-pointer">
                    <input type="radio" name="delivery_note_format" value="half" class="w-4 h-4 text-purple-600" />
                    <span class="ml-2 text-sm text-purple-800">A4 2分割（納品書＋控）</span>
                  </label>
                  <label class="flex items-center cursor-pointer">
                    <input type="radio" name="delivery_note_format" value="full" class="w-4 h-4 text-purple-600" />
                    <span class="ml-2 text-sm text-purple-800">A4 1枚もの</span>
                  </label>
                </div>
                <p class="text-xs text-purple-600 mt-2"><i class="fas fa-info-circle mr-1"></i>2分割: 上が納品書、下が納品書（控）として印刷されます</p>
              </div>
            </div>
          </div>

          <div class="flex justify-end pt-4">
            <button id="saveCompanyBtn" type="submit"
              class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition-colors">
              <i class="fas fa-save mr-2"></i>保存
            </button>
          </div>
        </form>
      </div>
      
      <script dangerouslySetInnerHTML={{__html: `
        ${bankAccountTypeHelpers}
        var form = document.getElementById('companyForm');
        var saveCompanyBtn = document.getElementById('saveCompanyBtn');
        var saveCompanyBtnTop = document.getElementById('saveCompanyBtnTop');
        
        function syncSaveButtonState() {
          if (!saveCompanyBtn || !saveCompanyBtnTop) return;
          saveCompanyBtnTop.disabled = !!saveCompanyBtn.disabled;
          saveCompanyBtnTop.innerHTML = saveCompanyBtn.innerHTML;
          saveCompanyBtnTop.className = saveCompanyBtn.className;
        }
        
        if (saveCompanyBtnTop && saveCompanyBtn) {
          saveCompanyBtnTop.addEventListener('click', function() {
            saveCompanyBtn.click();
          });
          syncSaveButtonState();
          var saveBtnObserver = new MutationObserver(function() {
            syncSaveButtonState();
          });
          saveBtnObserver.observe(saveCompanyBtn, {
            attributes: true,
            childList: true,
            subtree: true,
            characterData: true
          });
        }
        var bankAccounts = [];
        var defaultBankAccountIndex = -1; // -1 = メイン口座がデフォルト
        
        // 郵便番号→住所自動入力を有効化
        window.SmartBill.setupPostalCodeLookup('postal_code', 'address');
        
        // 画像アップロード処理
        function setupImageUpload(inputId, previewId, urlInputId, iconClass) {
          var input = document.getElementById(inputId);
          var preview = document.getElementById(previewId);
          var urlInput = document.getElementById(urlInputId);
          
          input.addEventListener('change', function(e) {
            var file = e.target.files[0];
            if (!file) return;
            
            // ファイルサイズチェック（500KB以下）
            if (file.size > 500 * 1024) {
              alert('ファイルサイズは500KB以下にしてください');
              return;
            }
            
            var reader = new FileReader();
            reader.onload = function(e) {
              var base64 = e.target.result;
              urlInput.value = base64;
              preview.innerHTML = '<img src="' + base64 + '" class="max-h-24 max-w-full mx-auto rounded" />';
              // 削除ボタンを表示
              var clearBtnId = inputId === 'logoInput' ? 'clearLogoBtn' : 'clearStampBtn';
              document.getElementById(clearBtnId).classList.remove('hidden');
            };
            reader.readAsDataURL(file);
          });
        }
        
        setupImageUpload('logoInput', 'logoPreview', 'logoUrl', 'fa-image');
        setupImageUpload('stampInput', 'stampPreview', 'stampUrl', 'fa-stamp');
        
        // 画像削除機能
        function setupImageClear(clearBtnId, previewId, urlInputId, defaultIcon) {
          var clearBtn = document.getElementById(clearBtnId);
          var preview = document.getElementById(previewId);
          var urlInput = document.getElementById(urlInputId);
          
          clearBtn.addEventListener('click', function() {
            urlInput.value = '';
            preview.innerHTML = '<i class="' + defaultIcon + ' text-4xl text-gray-300"></i>';
            clearBtn.classList.add('hidden');
          });
        }
        
        setupImageClear('clearLogoBtn', 'logoPreview', 'logoUrl', 'fas fa-image');
        setupImageClear('clearStampBtn', 'stampPreview', 'stampUrl', 'fas fa-stamp');
        
        // 画像プレビュー後に削除ボタンを表示
        function showClearButton(urlInputId, clearBtnId) {
          var urlInput = document.getElementById(urlInputId);
          var clearBtn = document.getElementById(clearBtnId);
          if (urlInput.value) {
            clearBtn.classList.remove('hidden');
          }
        }
        
        // 追加口座の管理
        var bankAccountsContainer = document.getElementById('bankAccountsContainer');
        var addBankBtn = document.getElementById('addBankBtn');
        var draftBankAccountContainer = document.getElementById('draftBankAccountContainer');
        var bankAccountsDirtyToken = document.getElementById('bankAccountsDirtyToken');
        var draftBankAccount = null;
        var mainBankAccountId = null;
        var mainBankAccountDisplayOrder = null;
        var selectedDefaultBankAccountId = '';
        // 直前までデフォルトだった口座を、保存後の1回だけ追加枠先頭に寄せるための一時ID
        var prevDefaultIdToPromote = null;

        function markBankAccountsDirty() {
          if (!bankAccountsDirtyToken) return;
          bankAccountsDirtyToken.value = String(Date.now());
          bankAccountsDirtyToken.dispatchEvent(new Event('change', { bubbles: true }));
        }

        function updateBankAccountsLimitUI() {
          var count = Array.isArray(bankAccounts) ? bankAccounts.length : 0;
          var totalCount = count + 1;
          var extraCount = Math.max(totalCount - 1, 0);
          var totalCountEl = document.getElementById('bankAccountsTotalCount');
          if (totalCountEl) {
            totalCountEl.textContent = '合計：' + totalCount + '/5（デフォルト含む）';
            if (totalCount >= 5) {
              totalCountEl.classList.add('text-red-600');
              totalCountEl.classList.remove('text-gray-500');
            } else {
              totalCountEl.classList.add('text-gray-500');
              totalCountEl.classList.remove('text-red-600');
            }
          }
          var extraCountEl = document.getElementById('bankAccountsExtraCount');
          if (extraCountEl) {
            extraCountEl.textContent = '追加：' + extraCount + '件（最大4件）';
          }
          if (addBankBtn) {
            var disabled = totalCount >= 5;
            addBankBtn.disabled = disabled;
            addBankBtn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
          }
          var limitNoteEl = document.getElementById('bankAccountsLimitNote');
          if (limitNoteEl) {
            if (totalCount >= 5) {
              limitNoteEl.textContent = '※上限に達しています（合計：' + totalCount + '/5件）削除すると追加できます。';
              limitNoteEl.classList.remove('hidden');
            } else {
              limitNoteEl.classList.add('hidden');
            }
          }
        }
        
        function createEmptyBankAccount() {
          return { bank_name: '', bank_branch: '', account_type: '', account_number: '', account_holder: '' };
        }
        
        function hasDraftBankAccountValues(account) {
          if (!account) return false;
          return ['bank_name', 'bank_branch', 'account_type', 'account_number', 'account_holder'].some(function(key) {
            var value = account[key];
            return value !== null && value !== undefined && String(value).trim() !== '';
          });
        }

        function escapeHtml(str) {
          return String(str === undefined || str === null ? '' : str)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
        }

        function toBool(v) {
          return v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
        }

        function getDraftSummaryText(account) {
          if (!account) return '';
          var parts = [];
          var bankName = String(account.bank_name || '').trim();
          if (bankName) parts.push(bankName);
          var branchName = String(account.branch_name || account.bank_branch || '').trim();
          if (branchName) parts.push(branchName);
          var accountTypeRaw = String(account.account_type || account.accountType || account.account_type_label || '').trim();
          var accountTypeLabel = accountTypeRaw;
          if (accountTypeRaw === 'ordinary') accountTypeLabel = '普通';
          else if (accountTypeRaw === 'current') accountTypeLabel = '当座';
          if (accountTypeLabel) parts.push(accountTypeLabel);
          var accountNumber = String(account.account_number || '').trim();
          if (accountNumber) parts.push(accountNumber);
          return parts.join(' / ');
        }
        
        function clearDraftBankAccount() {
          draftBankAccount = null;
          if (selectedDefaultBankAccountId === 'draft') {
            selectedDefaultBankAccountId = (mainBankAccountId !== null && mainBankAccountId !== undefined)
              ? String(mainBankAccountId)
              : '';
          }
          renderDraftBankAccount();
          renderBankAccounts();
        }
        
        function renderBankAccounts() {
          // メイン口座のデフォルト表示を更新
          var mainBankSection = document.getElementById('mainBankSection');
          var mainBankRadio = document.getElementById('mainBankRadio');
          var mainBankLabel = document.getElementById('mainBankDefaultLabel');
          var mainIdStr = (mainBankAccountId !== null && mainBankAccountId !== undefined)
            ? String(mainBankAccountId)
            : '';
          var isMainDefault = selectedDefaultBankAccountId
            ? selectedDefaultBankAccountId === mainIdStr
            : (mainIdStr === '');
          
          mainBankRadio.checked = isMainDefault;
          if (isMainDefault) {
            mainBankSection.classList.add('ring-2', 'ring-blue-500', 'rounded-lg', 'p-4', '-m-4');
            mainBankLabel.querySelector('label').className = 'text-sm font-medium text-blue-600';
            mainBankLabel.querySelector('label').innerHTML = '請求書のデフォルト振込先 <i class="fas fa-check-circle"></i>';
          } else {
            mainBankSection.classList.remove('ring-2', 'ring-blue-500', 'rounded-lg', 'p-4', '-m-4');
            mainBankLabel.querySelector('label').className = 'text-sm font-medium text-gray-600';
            mainBankLabel.querySelector('label').innerHTML = '請求書のデフォルト振込先';
          }
          
          // 追加口座の描画
          bankAccountsContainer.innerHTML = bankAccounts.map(function(account, index) {
            var isDefaultAccount = !!(account && (account.is_default ?? account.isDefault));
            if (isDefaultAccount) return '';
            var isDefault = (selectedDefaultBankAccountId === String(account.id));
            var accountType = normalizeAccountTypeToCode(account.account_type || account.accountType || account.account_type_label || '') || '';
            return '<div class="bg-gray-50 rounded-lg p-4 border relative' + (isDefault ? ' ring-2 ring-blue-500' : '') + '" data-index="' + index + '">' +
              '<button type="button" class="absolute top-2 right-2 text-red-500 hover:text-red-700 remove-bank-btn" data-index="' + index + '">' +
              '<i class="fas fa-times-circle"></i></button>' +
              '<div class="flex items-center gap-2 mb-3">' +
              '<input type="radio" name="default_bank_account" class="default-bank-radio w-4 h-4 text-blue-600" value="' + String(account.id || '') + '" data-index="' + index + '"' + (isDefault ? ' checked' : '') + ' />' +
              '<label class="text-sm font-medium ' + (isDefault ? 'text-blue-600' : 'text-gray-600') + '">デフォルトにする' + (isDefault ? ' <i class="fas fa-check-circle"></i>' : '') + '</label>' +
              '</div>' +
              '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">' +
              '<div><label class="block text-xs font-medium text-gray-600 mb-1">銀行名</label>' +
              '<input type="text" class="bank-field w-full border rounded px-2 py-1 text-sm" data-field="bank_name" value="' + (account.bank_name || '') + '" /></div>' +
              '<div><label class="block text-xs font-medium text-gray-600 mb-1">支店名</label>' +
              '<input type="text" class="bank-field w-full border rounded px-2 py-1 text-sm" data-field="bank_branch" value="' + (account.bank_branch || account.branch_name || '') + '" /></div>' +
              '<div><label class="block text-xs font-medium text-gray-600 mb-1">口座種別</label>' +
              '<select class="bank-field w-full border rounded px-2 py-1 text-sm" data-field="account_type">' +
              '<option value="">選択</option>' +
              '<option value="ordinary"' + (accountType === 'ordinary' ? ' selected' : '') + '>普通</option>' +
              '<option value="current"' + (accountType === 'current' ? ' selected' : '') + '>当座</option>' +
              '</select></div>' +
              '<div><label class="block text-xs font-medium text-gray-600 mb-1">口座番号</label>' +
              '<input type="text" class="bank-field w-full border rounded px-2 py-1 text-sm" data-field="account_number" value="' + (account.account_number || '') + '" /></div>' +
              '<div class="md:col-span-2"><label class="block text-xs font-medium text-gray-600 mb-1">口座名義</label>' +
              '<input type="text" class="bank-field w-full border rounded px-2 py-1 text-sm" data-field="account_holder" value="' + (account.account_holder || '') + '" /></div>' +
              '</div></div>';
          }).join('');
          
          // イベント設定: 削除ボタン
          bankAccountsContainer.querySelectorAll('.remove-bank-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
              var index = parseInt(this.getAttribute('data-index'));
              var removed = bankAccounts[index];
              bankAccounts.splice(index, 1);
              if (removed && selectedDefaultBankAccountId && String(removed.id) === selectedDefaultBankAccountId) {
                selectedDefaultBankAccountId = (mainBankAccountId !== null && mainBankAccountId !== undefined)
                  ? String(mainBankAccountId)
                  : '';
              }
              markBankAccountsDirty();
              renderBankAccounts();
            });
          });
          
          // イベント設定: フィールド変更
          bankAccountsContainer.querySelectorAll('.bank-field').forEach(function(field) {
            field.addEventListener('change', function() {
              var container = this.closest('[data-index]');
              var index = parseInt(container.getAttribute('data-index'));
              var fieldName = this.getAttribute('data-field');
              bankAccounts[index][fieldName] = this.value;
            });
          });
          
          // イベント設定: 追加口座のデフォルト選択ラジオボタン
          bankAccountsContainer.querySelectorAll('.default-bank-radio').forEach(function(radio) {
            radio.addEventListener('change', function() {
              selectedDefaultBankAccountId = this.value || '';
              markBankAccountsDirty();
              renderBankAccounts();
              renderDraftBankAccount();
            });
          });

          updateBankAccountsLimitUI();
        }
        
        function renderDraftBankAccount() {
          if (!draftBankAccountContainer) return;
          if (!draftBankAccount) {
            draftBankAccountContainer.innerHTML = '';
            return;
          }
          
          var account = draftBankAccount;
          var isDefault = (selectedDefaultBankAccountId === 'draft');
          var accountType = normalizeAccountTypeToCode(account.account_type || account.accountType || account.account_type_label || '') || '';
          draftBankAccountContainer.innerHTML =
            '<div class="bg-gray-50 rounded-lg p-4 border relative' + (isDefault ? ' ring-2 ring-blue-500' : '') + '" data-index="draft">' +
              '<button type="button" class="absolute top-2 right-2 text-red-500 hover:text-red-700 remove-bank-btn" data-index="draft">' +
              '<i class="fas fa-times-circle"></i></button>' +
              '<div class="flex items-center gap-2 mb-3">' +
              '<input type="radio" name="default_bank_account" class="default-bank-radio w-4 h-4 text-blue-600" value="draft" data-index="draft"' + (isDefault ? ' checked' : '') + ' />' +
              '<label class="text-sm font-medium ' + (isDefault ? 'text-blue-600' : 'text-gray-600') + '">デフォルトにする' + (isDefault ? ' <i class="fas fa-check-circle"></i>' : '') + '</label>' +
              '</div>' +
              '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">' +
              '<div><label class="block text-xs font-medium text-gray-600 mb-1">銀行名</label>' +
              '<input type="text" class="bank-field w-full border rounded px-2 py-1 text-sm" data-field="bank_name" value="' + (account.bank_name || '') + '" /></div>' +
              '<div><label class="block text-xs font-medium text-gray-600 mb-1">支店名</label>' +
              '<input type="text" class="bank-field w-full border rounded px-2 py-1 text-sm" data-field="bank_branch" value="' + (account.bank_branch || account.branch_name || '') + '" /></div>' +
              '<div><label class="block text-xs font-medium text-gray-600 mb-1">口座種別</label>' +
              '<select class="bank-field w-full border rounded px-2 py-1 text-sm" data-field="account_type">' +
              '<option value="">選択</option>' +
              '<option value="ordinary"' + (accountType === 'ordinary' ? ' selected' : '') + '>普通</option>' +
              '<option value="current"' + (accountType === 'current' ? ' selected' : '') + '>当座</option>' +
              '</select></div>' +
              '<div><label class="block text-xs font-medium text-gray-600 mb-1">口座番号</label>' +
              '<input type="text" class="bank-field w-full border rounded px-2 py-1 text-sm" data-field="account_number" value="' + (account.account_number || '') + '" /></div>' +
              '<div class="md:col-span-2"><label class="block text-xs font-medium text-gray-600 mb-1">口座名義</label>' +
              '<input type="text" class="bank-field w-full border rounded px-2 py-1 text-sm" data-field="account_holder" value="' + (account.account_holder || '') + '" /></div>' +
              '</div></div>';
          
          draftBankAccountContainer.querySelectorAll('.remove-bank-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
              markBankAccountsDirty();
              clearDraftBankAccount();
            });
          });
          
          draftBankAccountContainer.querySelectorAll('.bank-field').forEach(function(field) {
            field.addEventListener('change', function() {
              var fieldName = this.getAttribute('data-field');
              draftBankAccount[fieldName] = this.value;
            });
          });
          
          draftBankAccountContainer.querySelectorAll('.default-bank-radio').forEach(function(radio) {
            radio.addEventListener('change', function() {
              selectedDefaultBankAccountId = this.value || '';
              markBankAccountsDirty();
              renderBankAccounts();
              renderDraftBankAccount();
            });
          });
        }
        
        function focusDraftBankAccount() {
          if (!draftBankAccountContainer || !draftBankAccount) return;
          draftBankAccountContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
          var firstInput = draftBankAccountContainer.querySelector('input[data-field="bank_name"], input, select, textarea');
          if (firstInput) firstInput.focus();
        }
        
        // メイン口座のラジオボタンイベント
        document.getElementById('mainBankRadio').addEventListener('change', function() {
          if (this.checked) {
            selectedDefaultBankAccountId = (mainBankAccountId !== null && mainBankAccountId !== undefined)
              ? String(mainBankAccountId)
              : '';
            markBankAccountsDirty();
            renderBankAccounts();
            renderDraftBankAccount();
          }
        });
        
        addBankBtn.addEventListener('click', function() {
          if (draftBankAccount) {
            focusDraftBankAccount();
            return;
          }
          if (bankAccounts.length >= 5) return;
          draftBankAccount = createEmptyBankAccount();
          markBankAccountsDirty();
          renderDraftBankAccount();
          focusDraftBankAccount();
        });
        
        // 消費税タイプの切り替え
        var taxTypeRadios = document.querySelectorAll('input[name="default_tax_type"]');
        var customTaxSection = document.getElementById('customTaxRateSection');
        var defaultTaxRateInput = document.getElementById('defaultTaxRate');
        
        taxTypeRadios.forEach(function(radio) {
          radio.addEventListener('change', function() {
            if (this.value === 'custom') {
              customTaxSection.classList.remove('hidden');
            } else {
              customTaxSection.classList.add('hidden');
              // 税率を自動設定
              if (this.value === 'standard') defaultTaxRateInput.value = '10';
              else if (this.value === 'reduced') defaultTaxRateInput.value = '8';
              else defaultTaxRateInput.value = '0';
            }
          });
        });
        
        function loadCompany() {
          return axios.get('/api/company').then(function(res) {
            var data = res.data;
            Object.keys(data).forEach(function(key) {
              var input = form.querySelector('[name="' + key + '"]');
              if (input) {
                if (input.type === 'radio') {
                  var radio = form.querySelector('[name="' + key + '"][value="' + data[key] + '"]');
                  if (radio) radio.checked = true;
                } else {
                  input.value = data[key] || '';
                }
              }
            });

            var accountTypeValue = normalizeAccountTypeToCode(data.account_type || data.accountType || data.account_type_label || '') || '';
            var accountTypeInput = form.querySelector('[name="account_type"]');
            if (accountTypeInput) accountTypeInput.value = accountTypeValue;
            
            // ロゴプレビュー
            if (data.logo_url) {
              document.getElementById('logoUrl').value = data.logo_url;
              document.getElementById('logoPreview').innerHTML = '<img src="' + data.logo_url + '" class="max-h-24 max-w-full mx-auto rounded" />';
              document.getElementById('clearLogoBtn').classList.remove('hidden');
            }
            
            // 会社印プレビュー
            if (data.stamp_url) {
              document.getElementById('stampUrl').value = data.stamp_url;
              document.getElementById('stampPreview').innerHTML = '<img src="' + data.stamp_url + '" class="max-h-24 max-w-full mx-auto rounded" />';
              document.getElementById('clearStampBtn').classList.remove('hidden');
            }
            
            // 追加口座
            if (Array.isArray(data.bank_accounts)) {
              bankAccounts = data.bank_accounts || [];
            } else if (data.bank_accounts) {
              try {
                bankAccounts = JSON.parse(data.bank_accounts) || [];
              } catch (e) {
                bankAccounts = [];
              }
            }
            bankAccounts = (bankAccounts || []).map(function(account) {
              var branchName = account.branch_name || account.bank_branch || '';
              var accountType = normalizeAccountTypeToCode(account.account_type || account.accountType || account.account_type_label || '') || '';
              var accountHolder = account.account_holder || account.account_name || account.accountName || '';
              return Object.assign({}, account, {
                branch_name: branchName,
                bank_branch: branchName,
                account_type: accountType,
                accountType: accountType,
                account_type_label: account.account_type_label || accountTypeCodeToLabel(accountType),
                account_holder: accountHolder,
                account_name: accountHolder,
              });
            });

            var sortedAccounts = (bankAccounts || []).slice().sort(function(a, b) {
              var aDefault = toBool((a && (a.is_default ?? a.isDefault)));
              var bDefault = toBool((b && (b.is_default ?? b.isDefault)));
              if (aDefault !== bDefault) return aDefault ? -1 : 1;
              var aOrder = parseInt(a && a.display_order, 10);
              var bOrder = parseInt(b && b.display_order, 10);
              if (isNaN(aOrder)) aOrder = 0;
              if (isNaN(bOrder)) bOrder = 0;
              if (aOrder !== bOrder) return aOrder - bOrder;
              var aId = a && a.id;
              var bId = b && b.id;
              var aIdNum = parseInt(aId, 10);
              var bIdNum = parseInt(bId, 10);
              if (!isNaN(aIdNum) && !isNaN(bIdNum) && aIdNum !== bIdNum) return aIdNum - bIdNum;
              var aIdStr = String(aId || '');
              var bIdStr = String(bId || '');
              if (aIdStr < bIdStr) return -1;
              if (aIdStr > bIdStr) return 1;
              return 0;
            });
            
            var defaultAccount = null;
            var extraAccounts = [];
            sortedAccounts.forEach(function(account) {
              if (!defaultAccount && toBool((account && (account.is_default ?? account.isDefault)))) {
                defaultAccount = account;
              } else {
                extraAccounts.push(account);
              }
            });

            // --- 方法A: 保存直後の1回だけ、旧デフォルト口座を追加枠先頭に寄せる（表示のみ） ---
            if (prevDefaultIdToPromote) {
              var promoteIdx = -1;
              for (var i = 0; i < extraAccounts.length; i++) {
                var idNum = Number(extraAccounts[i] && extraAccounts[i].id);
                if (isFinite(idNum) && idNum === prevDefaultIdToPromote) {
                  promoteIdx = i;
                  break;
                }
              }
              if (promoteIdx > 0) {
                var moved = extraAccounts.splice(promoteIdx, 1)[0];
                extraAccounts.unshift(moved);
              }
              prevDefaultIdToPromote = null;
            }
            
            if (defaultAccount) {
              var bankNameInput = form.querySelector('[name="bank_name"]');
              if (bankNameInput) bankNameInput.value = defaultAccount.bank_name || '';
              var bankBranchInput = form.querySelector('[name="bank_branch"]');
              if (bankBranchInput) bankBranchInput.value = defaultAccount.bank_branch || defaultAccount.branch_name || '';
              var accountTypeValueFromDefault = normalizeAccountTypeToCode(defaultAccount.account_type || defaultAccount.accountType || defaultAccount.account_type_label || '') || '';
              var accountTypeInputFromDefault = form.querySelector('[name="account_type"]');
              if (accountTypeInputFromDefault) accountTypeInputFromDefault.value = accountTypeValueFromDefault;
              var accountNumberInput = form.querySelector('[name="account_number"]');
              if (accountNumberInput) accountNumberInput.value = defaultAccount.account_number || '';
              var accountHolderInput = form.querySelector('[name="account_holder"]');
              if (accountHolderInput) accountHolderInput.value = defaultAccount.account_holder || '';
            }

            mainBankAccountId = defaultAccount ? defaultAccount.id : null;
            mainBankAccountDisplayOrder = defaultAccount ? defaultAccount.display_order : null;
            selectedDefaultBankAccountId = (defaultAccount && defaultAccount.id) ? String(defaultAccount.id) : '';

            bankAccounts = extraAccounts;
            
            // デフォルト振込先インデックス（-1 = メイン口座がデフォルト）
            if (defaultAccount) {
              defaultBankAccountIndex = -1;
            } else {
              defaultBankAccountIndex = (data.default_bank_account_index !== null && data.default_bank_account_index !== undefined) 
                ? data.default_bank_account_index 
                : -1;
              // 追加口座が削除されてインデックスが無効になった場合はメインに戻す
              if (defaultBankAccountIndex >= 0 && defaultBankAccountIndex >= bankAccounts.length) {
                defaultBankAccountIndex = -1;
              }
            }
            if (!selectedDefaultBankAccountId && defaultBankAccountIndex >= 0 && bankAccounts[defaultBankAccountIndex]) {
              selectedDefaultBankAccountId = String(bankAccounts[defaultBankAccountIndex].id || '');
            }
            renderBankAccounts();
            
            // 消費税タイプ
            var taxType = data.default_tax_type || 'standard';
            var taxRadio = form.querySelector('[name="default_tax_type"][value="' + taxType + '"]');
            if (taxRadio) {
              taxRadio.checked = true;
              if (taxType === 'custom') {
                customTaxSection.classList.remove('hidden');
              }
            }
            
            // 消費税表示設定
            var showTaxToggle = document.getElementById('showTaxToggle');
            if (showTaxToggle) {
              showTaxToggle.checked = data.show_tax_on_estimate_delivery === 1;
            }
            
            // 納品書形式（デフォルトはhalf）
            var deliveryFormat = data.delivery_note_format || 'half';
            var deliveryRadio = form.querySelector('[name="delivery_note_format"][value="' + deliveryFormat + '"]');
            if (deliveryRadio) deliveryRadio.checked = true;
          }).catch(function(e) {
            console.error(e);
          });
        }
        
        form.addEventListener('submit', function(e) {
          e.preventDefault();
          var formData = new FormData(form);
          var data = Object.fromEntries(formData);
          var didIncludeDraft = !!(draftBankAccount && hasDraftBankAccountValues(draftBankAccount));
          var draftSummaryText = didIncludeDraft ? escapeHtml(getDraftSummaryText(draftBankAccount)) : '';
          
          // 追加口座を含める
          var mainBankAccountPayload = {
            id: mainBankAccountId,
            bank_name: data.bank_name || '',
            bank_branch: data.bank_branch || '',
            account_type: data.account_type || '',
            account_number: data.account_number || '',
            account_holder: data.account_holder || ''
          };
          if (mainBankAccountDisplayOrder !== null && mainBankAccountDisplayOrder !== undefined) {
            mainBankAccountPayload.display_order = mainBankAccountDisplayOrder;
          }
          var shouldIncludeMain = (mainBankAccountId !== null && mainBankAccountId !== undefined && mainBankAccountId !== '') ||
            hasDraftBankAccountValues(mainBankAccountPayload);
          
          var payloadBankAccounts = [];
          var pushWithDefaultFlag = function(account, isDefault) {
            payloadBankAccounts.push(Object.assign({}, account, { is_default: isDefault }));
          };
          var effectiveSelectedDefaultId = selectedDefaultBankAccountId;
          if (
            !effectiveSelectedDefaultId &&
            shouldIncludeMain &&
            mainBankAccountId !== null &&
            mainBankAccountId !== undefined
          ) {
            effectiveSelectedDefaultId = String(mainBankAccountId);
          }
          
          if (effectiveSelectedDefaultId && String(mainBankAccountId) === effectiveSelectedDefaultId) {
            if (shouldIncludeMain) pushWithDefaultFlag(mainBankAccountPayload, true);
          } else if (effectiveSelectedDefaultId === 'draft') {
            if (didIncludeDraft) pushWithDefaultFlag(draftBankAccount, true);
          } else if (effectiveSelectedDefaultId) {
            var defaultExtraAccount = bankAccounts.find(function(account) {
              return String(account && account.id) === effectiveSelectedDefaultId;
            });
            if (defaultExtraAccount) pushWithDefaultFlag(defaultExtraAccount, true);
          }
          
          bankAccounts.forEach(function(account, index) {
            if (effectiveSelectedDefaultId && String(account && account.id) === effectiveSelectedDefaultId) return;
            pushWithDefaultFlag(account, false);
          });
          
          if (didIncludeDraft && effectiveSelectedDefaultId !== 'draft') {
            pushWithDefaultFlag(draftBankAccount, false);
          }
          
          if (shouldIncludeMain && effectiveSelectedDefaultId !== String(mainBankAccountId)) {
            pushWithDefaultFlag(mainBankAccountPayload, false);
          }
          
          data.bank_accounts = payloadBankAccounts;
          
          // --- 方法A: デフォルト切替後に旧デフォルトを追加枠先頭に出すため、旧デフォルトIDを一時保持 ---
          var currentDefaultId = (typeof mainBankAccountId === 'number' && isFinite(mainBankAccountId))
            ? mainBankAccountId
            : (mainBankAccountId ? Number(mainBankAccountId) : null);
          if (
            currentDefaultId &&
            isFinite(currentDefaultId) &&
            selectedDefaultBankAccountId &&
            selectedDefaultBankAccountId !== String(currentDefaultId)
          ) {
            prevDefaultIdToPromote = currentDefaultId;
          }

          // デフォルト振込先インデックス
          var mergedBankAccounts = data.bank_accounts || [];
          var computedDefaultIndex = -1;
          var computedDefaultSelectionId = selectedDefaultBankAccountId || effectiveSelectedDefaultId || '';
          if (computedDefaultSelectionId === 'draft') {
            if (draftBankAccount && hasDraftBankAccountValues(draftBankAccount)) {
              computedDefaultIndex = mergedBankAccounts.length - 1;
            } else {
              computedDefaultIndex = -1;
            }
          } else if (computedDefaultSelectionId) {
            var selectedIdNum = Number(computedDefaultSelectionId);
            if (isFinite(selectedIdNum)) {
              computedDefaultIndex = mergedBankAccounts.findIndex(function(a) {
                return isFinite(Number(a && a.id)) && Number(a.id) === selectedIdNum;
              });
            }
          }
          data.default_bank_account_index = computedDefaultIndex;
          
          // 消費税表示設定（チェックボックスの値を明示的に設定）
          data.show_tax_on_estimate_delivery = document.getElementById('showTaxToggle').checked;
          
          // 税率の処理
          if (data.default_tax_type === 'standard') data.default_tax_rate = 10;
          else if (data.default_tax_type === 'reduced') data.default_tax_rate = 8;
          else if (data.default_tax_type === 'exempt') data.default_tax_rate = 0;
          
          axios.put('/api/company', data).then(function() {
            window.SmartBill.resetFormTracking();
            if (didIncludeDraft) {
              window.SmartBill.showSuccessDialog('自社情報を保存しました。\\n追加した口座：' + draftSummaryText);
            } else {
              window.SmartBill.showSuccessDialog('自社情報を保存しました。');
            }
            loadCompany().then(function() {
              clearDraftBankAccount();
              setTimeout(function() { window.SmartBill.trackFormChanges('companyForm'); }, 100);
            });
          }).catch(function(e) {
            alert('エラーが発生しました');
            console.error(e);
          });
        });
        
        // データ読み込み後にフォーム変更検知を有効化
        loadCompany().then(function() {
          setTimeout(function() { window.SmartBill.trackFormChanges('companyForm'); }, 100);
        });
      `}} />
    </Layout>
  )
})

// =====================================
// 分類マスタ（段階的表示: 一覧 → 2カラムレイアウト）
// =====================================
app.get('/categories', async (c) => {
  return c.html(
    <Layout title="分類マスタ" currentPath="/categories" hideTitle={true}>
      {/* 初期表示: テーブル一覧 */}
      <div id="tableView">
        {/* 固定ヘッダー: タイトル + 検索バー */}
        <div class="sticky top-0 z-20 -mx-4 md:-mx-8 px-4 md:px-8 pt-0 pb-4 bg-gray-100">
          <h2 class="text-2xl font-bold text-gray-800 mb-4 pt-0">分類マスタ</h2>
          <div class="bg-white rounded-lg shadow p-4">
            <div class="flex flex-wrap gap-4 items-end justify-between">
              <div class="flex flex-wrap gap-3 items-end flex-1">
                <div class="flex-1 min-w-64 max-w-md">
                  <label class="block text-xs font-medium text-gray-600 mb-1">
                    <i class="fas fa-search mr-1"></i>検索
                  </label>
                  <input type="text" id="searchInputTable" 
                    placeholder="分類コード、分類名、メモで検索..."
                    class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
                </div>
                <button type="button" id="clearFiltersBtn" 
                  class="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm transition-colors" 
                  title="検索をクリア">
                  <i class="fas fa-times"></i>
                </button>
              </div>
              <button id="newCategoryBtnTable" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg">
                <i class="fas fa-plus mr-2"></i>新規登録
              </button>
            </div>
          </div>
        </div>
        
        <div class="bg-white rounded-lg shadow overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">コード</th>
                  <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">分類名</th>
                  <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">課税区分</th>
                  <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">税率</th>
                  <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">メモ</th>
                  <th class="px-4 py-3 text-center text-sm font-medium text-gray-700">操作</th>
                </tr>
              </thead>
              <tbody id="categoryTableBody" class="divide-y">
                <tr><td colSpan={6} class="px-4 py-8 text-center text-gray-500">読込中...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <div id="searchResultCount" class="mt-3 text-sm text-gray-600"></div>
      </div>
      
      {/* 詳細表示: 2カラムレイアウト（初期非表示） */}
      <div id="detailView" class="hidden h-full">
        <div class="flex gap-4 h-full">
          {/* 左サイドバー: 分類リスト */}
          <div class="w-80 flex-shrink-0 bg-white rounded-lg shadow flex flex-col overflow-hidden">
            <div class="p-4 border-b flex-shrink-0">
              <div class="flex items-center justify-between mb-3">
                <button id="backToListBtn" class="text-blue-600 hover:text-blue-800 text-sm">
                  <i class="fas fa-arrow-left mr-1"></i>一覧に戻る
                </button>
                <button id="newCategoryBtn" class="bg-green-600 hover:bg-green-700 text-white text-sm font-bold py-1.5 px-3 rounded-lg">
                  <i class="fas fa-plus mr-1"></i>新規
                </button>
              </div>
              <input type="text" id="searchInput" placeholder="検索..."
                class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
            </div>
            
            {/* 最近編集した分類 */}
            <div id="recentCategoriesSection" class="border-b flex-shrink-0">
              <div class="px-4 py-2 bg-gray-50 flex items-center justify-between cursor-pointer" id="recentToggle">
                <span class="text-xs font-bold text-gray-600">
                  <i class="fas fa-clock mr-1 text-blue-500"></i>最近編集
                </span>
                <i class="fas fa-chevron-down text-gray-400 text-xs" id="recentToggleIcon"></i>
              </div>
              <div id="recentCategoriesList" class="max-h-40 overflow-y-auto">
                <div class="p-2 text-center text-gray-400 text-xs">読込中...</div>
              </div>
            </div>
            
            {/* 分類一覧 見出し（最近編集とトーン統一） */}
            <div class="border-t border-slate-200">
              <div class="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  class="h-4 w-4 text-blue-600"
                  aria-hidden="true"
                  focusable="false"
                >
                  <line x1="8" y1="6" x2="21" y2="6"></line>
                  <line x1="8" y1="12" x2="21" y2="12"></line>
                  <line x1="8" y1="18" x2="21" y2="18"></line>
                  <circle cx="4" cy="6" r="1"></circle>
                  <circle cx="4" cy="12" r="1"></circle>
                  <circle cx="4" cy="18" r="1"></circle>
                </svg>
                <span>分類一覧</span>
              </div>
            </div>
            <div id="categoryListContainer" class="flex-1 overflow-y-auto min-h-0">
              <div class="p-4 text-center text-gray-500 text-sm">読込中...</div>
            </div>
          </div>
          
          {/* 右メインエリア: 詳細・編集フォーム */}
          <div class="flex-1 bg-white rounded-lg shadow overflow-y-auto min-h-0">
            <div id="formContainer" class="p-6">
              <div class="text-center py-12 text-gray-400">
                <i class="fas fa-tags text-6xl mb-4"></i>
                <p>左のリストから分類を選択するか、<br/>「新規」をクリックして登録してください</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <script dangerouslySetInnerHTML={{__html: `
        ${taxRateHelpers}
        // ビュー要素
        var tableView = document.getElementById('tableView');
        var detailView = document.getElementById('detailView');
        var searchInputTable = document.getElementById('searchInputTable');
        var clearFiltersBtn = document.getElementById('clearFiltersBtn');
        var searchResultCount = document.getElementById('searchResultCount');
        var categoryTableBody = document.getElementById('categoryTableBody');
        var newCategoryBtnTable = document.getElementById('newCategoryBtnTable');
        
        var searchInput = document.getElementById('searchInput');
        var categoryListContainer = document.getElementById('categoryListContainer');
        var formContainer = document.getElementById('formContainer');
        var newCategoryBtn = document.getElementById('newCategoryBtn');
        var backToListBtn = document.getElementById('backToListBtn');
        
        var searchTimeout;
        var currentCategoryId = null;
        var categories = [];
        var recentCategories = [];
        var recentSectionCollapsed = false;
        
        // 最近編集セクション要素
        var recentToggle = document.getElementById('recentToggle');
        var recentToggleIcon = document.getElementById('recentToggleIcon');
        var recentCategoriesList = document.getElementById('recentCategoriesList');
        
        // 課税区分の表示名マッピング
        var taxTypeLabels = {
          'standard': '標準税率',
          'reduced': '軽減税率',
          'exempt': '非課税',
          'excluded': '対象外',
          'custom': 'カスタム'
        };
        
        // 最近編集セクションの開閉
        if (recentToggle) {
          recentToggle.addEventListener('click', function() {
            recentSectionCollapsed = !recentSectionCollapsed;
            recentCategoriesList.classList.toggle('hidden', recentSectionCollapsed);
            recentToggleIcon.classList.toggle('fa-chevron-down', !recentSectionCollapsed);
            recentToggleIcon.classList.toggle('fa-chevron-right', recentSectionCollapsed);
          });
        }
        
        // フォームの変更状態をリセット
        function resetFormState() {
          if (window.SmartBill) window.SmartBill.formChanged = false;
          window.SmartBill.skipConfirm = false;
        }
        
        // ビュー切り替え
        function showTableView() {
          if (window.SmartBill.formChanged) {
            window.SmartBill.confirmLeave(function() {
              resetFormState();
              tableView.classList.remove('hidden');
              detailView.classList.add('hidden');
              currentCategoryId = null;
              window.SmartBill.expandSidebar();
            });
          } else {
            tableView.classList.remove('hidden');
            detailView.classList.add('hidden');
            currentCategoryId = null;
            window.SmartBill.expandSidebar();
          }
        }
        
        function showDetailView() {
          tableView.classList.add('hidden');
          detailView.classList.remove('hidden');
          window.SmartBill.collapseSidebar();
        }
        
        // 分類リスト読み込み
        async function loadCategories(search) {
          try {
            var params = new URLSearchParams();
            if (searchInputTable.value) params.set('search', searchInputTable.value);
            if (search && !params.has('search')) params.set('search', search);
            
            var url = '/api/categories' + (params.toString() ? '?' + params.toString() : '');
            var res = await axios.get(url);
            categories = res.data;
            renderCategoryTable();
            renderCategoryList();
            updateSearchResultCount();
          } catch (e) {
            console.error(e);
          }
        }
        
        // 最近編集した分類を読み込み
        async function loadRecentCategories() {
          try {
            var res = await axios.get('/api/categories/recent?limit=5');
            recentCategories = res.data;
            renderRecentCategories();
          } catch (e) {
            console.error(e);
          }
        }
        
        // 検索結果件数を更新
        function updateSearchResultCount() {
          var hasFilter = searchInputTable.value;
          if (hasFilter) {
            searchResultCount.innerHTML = '<i class="fas fa-search mr-1"></i>検索結果: <strong>' + categories.length + '</strong> 件';
          } else {
            searchResultCount.innerHTML = '全 <strong>' + categories.length + '</strong> 件の分類';
          }
        }
        
        // テーブル一覧描画
        function renderCategoryTable() {
          if (categories.length === 0) {
            var message = searchInputTable.value ? '検索条件に一致する分類がありません' : 'データがありません';
            categoryTableBody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-gray-500">' + message + '</td></tr>';
            return;
          }
          
          categoryTableBody.innerHTML = categories.map(function(c) {
            var taxTypeLabel = taxTypeLabels[c.tax_type] || taxTypeLabels['standard'];
            var resolvedTaxRate = resolveCategoryTaxRate(c, 10);
            var taxBadgeColor = c.tax_type === 'reduced' ? 'bg-green-100 text-green-800' : 
                               c.tax_type === 'exempt' || c.tax_type === 'excluded' ? 'bg-gray-100 text-gray-800' : 
                               'bg-blue-100 text-blue-800';
            return '<tr class="hover:bg-gray-50 cursor-pointer" data-id="' + c.id + '">' +
              '<td class="px-4 py-3 font-mono text-sm">' + (c.category_code || '-') + '</td>' +
              '<td class="px-4 py-3 font-medium">' + c.category_name + '</td>' +
              '<td class="px-4 py-3"><span class="text-xs font-bold px-2 py-1 rounded ' + taxBadgeColor + '">' + taxTypeLabel + '</span></td>' +
              '<td class="px-4 py-3 text-sm">' + resolvedTaxRate + '%</td>' +
              '<td class="px-4 py-3 text-sm text-gray-500 truncate max-w-xs">' + (c.notes || '-') + '</td>' +
              '<td class="px-4 py-3 text-center">' +
              '<button class="text-blue-600 hover:text-blue-800 edit-btn" data-id="' + c.id + '"><i class="fas fa-edit"></i></button>' +
              '</td></tr>';
          }).join('');
          
          // 行クリックイベント
          categoryTableBody.querySelectorAll('tr[data-id]').forEach(function(row) {
            row.addEventListener('click', function(e) {
              if (e.target.closest('.edit-btn')) return;
              var id = parseInt(this.getAttribute('data-id'));
              showDetailView();
              loadCategoryForm(id);
            });
          });
          
          // 編集ボタンクリック
          categoryTableBody.querySelectorAll('.edit-btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
              e.stopPropagation();
              var id = parseInt(this.getAttribute('data-id'));
              showDetailView();
              loadCategoryForm(id);
            });
          });
        }
        
        // サイドバー分類リスト描画
        function renderCategoryList() {
          if (categories.length === 0) {
            categoryListContainer.innerHTML = '<div class="p-4 text-center text-gray-500 text-sm">データがありません</div>';
            return;
          }
          
          var html = categories.map(function(c) {
            var isSelected = currentCategoryId === c.id;
            var taxTypeLabel = taxTypeLabels[c.tax_type] || taxTypeLabels['standard'];
            var resolvedTaxRate = resolveCategoryTaxRate(c, 10);
            return '<div class="category-item p-3 border-b cursor-pointer hover:bg-blue-50 ' + (isSelected ? 'bg-blue-100 border-l-4 border-l-blue-600' : '') + '" data-id="' + c.id + '">' +
              '<div class="flex justify-between items-start">' +
              '<div class="flex-1 min-w-0">' +
              '<p class="font-medium text-gray-800 truncate">' + c.category_name + '</p>' +
              '<p class="text-xs text-gray-500 mt-1"><i class="fas fa-hashtag mr-1"></i>' + (c.category_code || '-') + ' / ' + taxTypeLabel + ' ' + resolvedTaxRate + '%</p>' +
              '</div>' +
              '</div></div>';
          }).join('');
          
          categoryListContainer.innerHTML = html;
          
          // クリックイベント
          categoryListContainer.querySelectorAll('.category-item').forEach(function(item) {
            item.addEventListener('click', function() {
              var id = parseInt(this.getAttribute('data-id'));
              if (window.SmartBill.formChanged) {
                window.SmartBill.confirmLeave(function() {
                  resetFormState();
                  loadCategoryForm(id);
                });
              } else {
                loadCategoryForm(id);
              }
            });
          });
        }
        
        // 最近編集した分類を描画
        function renderRecentCategories() {
          if (recentCategories.length === 0) {
            recentCategoriesList.innerHTML = '<div class="p-2 text-center text-gray-400 text-xs">なし</div>';
            return;
          }
          
          recentCategoriesList.innerHTML = recentCategories.map(function(c) {
            var isSelected = currentCategoryId === c.id;
            var updatedAt = c.updated_at ? new Date(c.updated_at).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
            return '<div class="recent-category-item px-4 py-2 cursor-pointer hover:bg-blue-50 text-sm border-b border-gray-100 ' + (isSelected ? 'bg-blue-100' : '') + '" data-id="' + c.id + '">' +
              '<div class="flex justify-between items-center">' +
              '<span class="truncate"><span class="text-gray-400 mr-1">' + (c.category_code || '') + '</span><span class="font-medium text-gray-700">' + c.category_name + '</span></span>' +
              '<span class="text-xs text-gray-400 ml-2 whitespace-nowrap">' + updatedAt + '</span>' +
              '</div></div>';
          }).join('');
          
          recentCategoriesList.querySelectorAll('.recent-category-item').forEach(function(item) {
            item.addEventListener('click', function() {
              var id = parseInt(this.getAttribute('data-id'));
              if (window.SmartBill.formChanged) {
                window.SmartBill.confirmLeave(function() {
                  resetFormState();
                  loadCategoryForm(id);
                });
              } else {
                loadCategoryForm(id);
              }
            });
          });
        }
        
        // 新規登録フォーム
        function showNewForm() {
          if (window.SmartBill.formChanged) {
            window.SmartBill.confirmLeave(function() {
              resetFormState();
              showDetailView();
              currentCategoryId = null;
              renderCategoryList();
              renderRecentCategories();
              renderForm(null);
              formContainer.scrollTop = 0;
              formContainer.parentElement.scrollTop = 0;
            });
          } else {
            showDetailView();
            currentCategoryId = null;
            renderCategoryList();
            renderRecentCategories();
            renderForm(null);
            formContainer.scrollTop = 0;
            formContainer.parentElement.scrollTop = 0;
          }
        }
        
        // 編集フォーム読み込み
        async function loadCategoryForm(id) {
          try {
            var res = await axios.get('/api/categories/' + id);
            currentCategoryId = id;
            renderCategoryList();
            renderRecentCategories();
            renderForm(res.data);
            formContainer.scrollTop = 0;
            formContainer.parentElement.scrollTop = 0;
          } catch (e) {
            console.error(e);
          }
        }
        
        // フォーム描画
        function renderForm(data) {
          var isNew = !data;
          var taxType = data ? (data.tax_type || 'standard') : 'standard';
          var taxRate = resolveCategoryTaxRate(data, 10);
          
          // 固定ヘッダー
          var headerHtml = '<div class="sticky top-0 bg-white z-10 -mt-6 -mx-6 px-6 py-4 border-b-2 border-gray-200 shadow-sm mb-6">' +
            '<div class="flex items-center justify-between">' +
            '<h2 class="text-xl font-bold text-gray-800 flex items-center">' +
            '<i class="fas ' + (isNew ? 'fa-folder-plus text-green-600' : 'fa-edit text-blue-600') + ' mr-3"></i>' +
            (isNew ? '新規分類登録' : '分類編集') + '</h2>' +
            '<div class="flex items-center gap-3">' +
            '<button type="button" onclick="window.SmartBill.showShortcutHelp()" class="text-gray-400 hover:text-gray-600 text-sm" title="キーボードショートカット"><i class="fas fa-keyboard"></i></button>' +
            (isNew ? '' : '<button type="button" id="deleteBtn" class="bg-red-50 hover:bg-red-100 text-red-600 font-medium py-2 px-4 rounded-lg text-sm transition-colors border border-red-200"><i class="fas fa-trash-alt mr-1"></i>削除</button>') +
            '<span id="pageUnsavedIndicator" class="text-sm text-red-600 font-semibold hidden">●未保存</span>' +
            '<button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-lg text-sm transition-colors shadow-sm" title="Ctrl+S / ⌘+S">' +
            '<i class="fas ' + (isNew ? 'fa-plus-circle' : 'fa-save') + ' mr-1"></i>' + (isNew ? '登録' : '保存') + '</button>' +
            '</div></div></div>';
          
          var formHtml = '<form id="categoryForm" class="space-y-6" data-track-unsaved="true">' +
            headerHtml +
            
            // 基本情報
            '<div>' +
            '<h3 class="text-lg font-bold mb-4 pb-2 border-b text-gray-800"><i class="fas fa-tags mr-2 text-blue-600"></i>基本情報</h3>' +
            '<div class="grid grid-cols-1 md:grid-cols-2 gap-6">' +
            '<div><label class="block text-sm font-medium text-gray-700 mb-1">分類名 *</label>' +
            '<input type="text" name="category_name" value="' + (data ? (data.category_name || '') : '') + '" required class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" /></div>' +
            '<div><label class="block text-sm font-medium text-gray-700 mb-1">分類コード <span class="text-xs text-blue-600">※空欄で自動採番</span></label>' +
            '<div class="flex gap-2"><input type="text" name="category_code" value="' + (data ? (data.category_code || '') : '') + '" placeholder="自動採番" class="flex-1 border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />' +
            (isNew ? '<button type="button" id="getNextCode" class="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm">次の番号</button>' : '') + '</div></div>' +
            '<div><label class="block text-sm font-medium text-gray-700 mb-1">表示順</label>' +
            '<input type="number" name="display_order" value="' + (data ? data.display_order : '') + '" placeholder="自動設定" min="0" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" /></div>' +
            '</div></div>' +
            
            // 課税区分
            '<div class="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg p-5">' +
            '<h3 class="text-lg font-bold mb-4 text-blue-800"><i class="fas fa-percentage mr-2"></i>消費税設定</h3>' +
            '<div class="space-y-4">' +
            '<div>' +
            '<label class="block text-sm font-bold text-blue-700 mb-3">課税区分</label>' +
            '<div class="grid grid-cols-2 md:grid-cols-4 gap-3">' +
            '<label class="flex items-center p-3 bg-white rounded-lg border-2 cursor-pointer hover:border-blue-400 transition-colors ' + (taxType === 'standard' ? 'border-blue-500 bg-blue-50' : 'border-gray-200') + '">' +
            '<input type="radio" name="tax_type" value="standard" ' + (taxType === 'standard' ? 'checked' : '') + ' class="w-4 h-4 text-blue-600" />' +
            '<span class="ml-2 text-sm font-medium">標準税率<br/><span class="text-xs text-gray-500">10%</span></span></label>' +
            '<label class="flex items-center p-3 bg-white rounded-lg border-2 cursor-pointer hover:border-green-400 transition-colors ' + (taxType === 'reduced' ? 'border-green-500 bg-green-50' : 'border-gray-200') + '">' +
            '<input type="radio" name="tax_type" value="reduced" ' + (taxType === 'reduced' ? 'checked' : '') + ' class="w-4 h-4 text-green-600" />' +
            '<span class="ml-2 text-sm font-medium">軽減税率<br/><span class="text-xs text-gray-500">8%</span></span></label>' +
            '<label class="flex items-center p-3 bg-white rounded-lg border-2 cursor-pointer hover:border-gray-400 transition-colors ' + (taxType === 'exempt' ? 'border-gray-500 bg-gray-50' : 'border-gray-200') + '">' +
            '<input type="radio" name="tax_type" value="exempt" ' + (taxType === 'exempt' ? 'checked' : '') + ' class="w-4 h-4 text-gray-600" />' +
            '<span class="ml-2 text-sm font-medium">非課税<br/><span class="text-xs text-gray-500">0%</span></span></label>' +
            '<label class="flex items-center p-3 bg-white rounded-lg border-2 cursor-pointer hover:border-gray-400 transition-colors ' + (taxType === 'excluded' ? 'border-gray-500 bg-gray-50' : 'border-gray-200') + '">' +
            '<input type="radio" name="tax_type" value="excluded" ' + (taxType === 'excluded' ? 'checked' : '') + ' class="w-4 h-4 text-gray-600" />' +
            '<span class="ml-2 text-sm font-medium">対象外<br/><span class="text-xs text-gray-500">0%</span></span></label>' +
            '</div>' +
            '</div>' +
            
            // カスタム税率
            '<div class="p-4 bg-white rounded-lg border border-blue-200">' +
            '<label class="flex items-center cursor-pointer mb-3">' +
            '<input type="radio" name="tax_type" value="custom" ' + (taxType === 'custom' ? 'checked' : '') + ' class="w-4 h-4 text-purple-600" />' +
            '<span class="ml-2 text-sm font-bold text-purple-700">カスタム税率（将来の税率変更対応）</span></label>' +
            '<div id="customTaxRateSection" class="flex items-center gap-3 ' + (taxType === 'custom' ? '' : 'opacity-50') + '">' +
            '<input type="number" name="tax_rate" id="taxRateInput" value="' + taxRate + '" step="0.1" min="0" max="100" class="w-24 border-2 border-purple-300 rounded-lg px-3 py-2 text-center font-bold focus:ring-2 focus:ring-purple-500" />' +
            '<span class="text-gray-700 font-bold">%</span>' +
            '<p class="text-xs text-gray-500">任意の税率を入力できます</p>' +
            '</div></div>' +
            '</div></div>' +
            
            // メモ
            '<div>' +
            '<h3 class="text-lg font-bold mb-4 pb-2 border-b text-gray-800"><i class="fas fa-sticky-note mr-2 text-gray-600"></i>メモ</h3>' +
            '<textarea name="notes" rows="3" placeholder="この分類に関するメモを入力..." class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 resize-y">' + (data ? (data.notes || '') : '') + '</textarea>' +
            '</div>' +
            '</form>';
          
          formContainer.innerHTML = formHtml;
          
          // 課税区分の変更で税率を自動設定
          var taxTypeRadios = document.querySelectorAll('input[name="tax_type"]');
          var taxRateInput = document.getElementById('taxRateInput');
          var customTaxRateSection = document.getElementById('customTaxRateSection');
          
          taxTypeRadios.forEach(function(radio) {
            radio.addEventListener('change', function() {
              var selectedType = this.value;
              if (selectedType === 'standard') {
                taxRateInput.value = '10';
                customTaxRateSection.classList.add('opacity-50');
              } else if (selectedType === 'reduced') {
                taxRateInput.value = '8';
                customTaxRateSection.classList.add('opacity-50');
              } else if (selectedType === 'exempt' || selectedType === 'excluded') {
                taxRateInput.value = '0';
                customTaxRateSection.classList.add('opacity-50');
              } else if (selectedType === 'custom') {
                customTaxRateSection.classList.remove('opacity-50');
                taxRateInput.focus();
              }
            });
          });
          
          // 次の分類コード取得
          var getNextCodeBtn = document.getElementById('getNextCode');
          if (getNextCodeBtn) {
            getNextCodeBtn.addEventListener('click', function() {
              axios.get('/api/categories/next-code').then(function(res) {
                document.querySelector('[name="category_code"]').value = res.data.next_code;
              });
            });
          }
          
          // 必須項目の赤枠表示
          window.SmartBill.setupRequiredValidation('categoryForm');
          
          // フォーム変更検知
          setTimeout(function() { window.SmartBill.trackFormChanges('categoryForm'); }, 100);
          
          // 削除ボタン
          var deleteBtn = document.getElementById('deleteBtn');
          if (deleteBtn) {
            deleteBtn.addEventListener('click', function() {
              var categoryName = document.querySelector('[name="category_name"]').value;
              window.SmartBill.confirmDelete(categoryName).then(function(confirmed) {
                if (!confirmed) return;
                axios.delete('/api/categories/' + currentCategoryId).then(function() {
                  resetFormState();
                  currentCategoryId = null;
                  loadCategories(searchInput.value);
                  loadRecentCategories();
                  formContainer.innerHTML = '<div class="text-center py-12 text-gray-400"><i class="fas fa-tags text-6xl mb-4"></i><p>左のリストから分類を選択してください</p></div>';
                });
              });
            });
          }
          
          // フォーム送信
          document.getElementById('categoryForm').addEventListener('submit', function(e) {
            e.preventDefault();
            var formData = new FormData(this);
            var sendData = Object.fromEntries(formData);
            sendData.tax_rate = resolveCategoryTaxRate(sendData, 10);
            sendData.display_order = parseInt(sendData.display_order) || 0;
            
            var method = isNew ? 'post' : 'put';
            var url = isNew ? '/api/categories' : '/api/categories/' + currentCategoryId;
            
            axios[method](url, sendData).then(function(res) {
              resetFormState();
              loadCategories(searchInput.value);
              loadRecentCategories();
              if (isNew) {
                // 新規作成後、一覧を更新
                axios.get('/api/categories').then(function(listRes) {
                  categories = listRes.data;
                  renderCategoryList();
                });
              }
              window.SmartBill.showSuccessDialog('分類情報を保存しました。');
            }).catch(function(e) {
              window.SmartBill.showConfirmDialog({
                title: 'エラー',
                message: 'データの保存に失敗しました。<br/>もう一度お試しください。',
                confirmText: 'OK',
                cancelText: '',
                icon: 'fa-times-circle',
                type: 'danger'
              });
              console.error(e);
            });
          });
        }
        
        // フィルターをクリア
        function clearFilters() {
          searchInputTable.value = '';
          loadCategories();
        }
        
        // イベント設定
        searchInputTable.addEventListener('input', function(e) {
          clearTimeout(searchTimeout);
          searchTimeout = setTimeout(function() { loadCategories(); }, 300);
        });
        
        searchInput.addEventListener('input', function(e) {
          clearTimeout(searchTimeout);
          searchTimeout = setTimeout(function() { loadCategories(e.target.value); }, 300);
        });
        
        clearFiltersBtn.addEventListener('click', clearFilters);
        newCategoryBtnTable.addEventListener('click', showNewForm);
        newCategoryBtn.addEventListener('click', showNewForm);
        backToListBtn.addEventListener('click', showTableView);
        
        // キーボードショートカット設定
        window.SmartBill.setupKeyboardShortcuts({
          saveCallback: function() {
            var form = document.getElementById('categoryForm');
            if (form) {
              var submitEvent = new Event('submit', { bubbles: true, cancelable: true });
              form.dispatchEvent(submitEvent);
            }
          },
          escapeCallback: function() {
            if (!detailView.classList.contains('hidden')) {
              showTableView();
            }
          }
        });
        
        // 初期読み込み
        loadCategories();
        loadRecentCategories();
      `}} />
    </Layout>
  )
})

// =====================================
// 取引先マスタ（段階的表示: 一覧 → 2カラムレイアウト）
// =====================================
app.get('/clients', async (c) => {
  return c.html(
    <Layout title="取引先マスタ" currentPath="/clients" hideTitle={true}>
      {/* 初期表示: テーブル一覧 */}
      <div id="tableView">
        {/* 固定ヘッダー: タイトル + 検索バー */}
        <div class="sticky top-0 z-20 -mx-4 md:-mx-8 px-4 md:px-8 pt-0 pb-4 bg-gray-100">
          <h2 class="text-2xl font-bold text-gray-800 mb-4 pt-0">取引先マスタ</h2>
          <div class="bg-white rounded-lg shadow p-4">
            <div class="flex flex-wrap gap-4 items-end justify-between">
              <div class="flex flex-wrap gap-3 items-end flex-1">
                {/* 統合検索 */}
                <div class="flex-1 min-w-64 max-w-md">
                  <label class="block text-xs font-medium text-gray-600 mb-1">
                    <i class="fas fa-search mr-1"></i>検索
                  </label>
                  <input type="text" id="searchInputTable" 
                    placeholder="取引先名、担当者、代表者、電話、メール、締め日..."
                    class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
                </div>
                {/* 上代/下代フィルター */}
                <div class="w-32">
                  <label class="block text-xs font-medium text-gray-600 mb-1">
                    <i class="fas fa-tags mr-1"></i>上代/下代
                  </label>
                  <select id="filterWholesale"
                    class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
                    <option value="">すべて</option>
                    <option value="1">使用する</option>
                    <option value="0">使用しない</option>
                  </select>
                </div>
                {/* クリアボタン */}
                <button type="button" id="clearFiltersBtn" 
                  class="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm transition-colors" 
                  title="検索をクリア">
                  <i class="fas fa-times"></i>
                </button>
              </div>
              <button id="newClientBtnTable" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg">
                <i class="fas fa-plus mr-2"></i>新規登録
              </button>
            </div>
          </div>
        </div>
        
        <div class="bg-white rounded-lg shadow overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">コード</th>
                  <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">取引先名</th>
                  <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">代表者</th>
                  <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">担当者</th>
                  <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">電話番号</th>
                  <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">締め日</th>
                  <th class="px-4 py-3 text-center text-sm font-medium text-gray-700">上代/下代</th>
                  <th class="px-4 py-3 text-center text-sm font-medium text-gray-700">操作</th>
                </tr>
              </thead>
              <tbody id="clientTableBody" class="divide-y">
                <tr><td colSpan={8} class="px-4 py-8 text-center text-gray-500">読込中...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        {/* 検索結果件数表示 */}
        <div id="searchResultCount" class="mt-3 text-sm text-gray-600"></div>
      </div>
      
      {/* 詳細表示: 2カラムレイアウト（初期非表示） */}
      <div id="detailView" class="hidden h-full">
        <div class="flex gap-4 h-full">
          {/* 左サイドバー: 取引先リスト */}
          <div class="w-80 flex-shrink-0 bg-white rounded-lg shadow flex flex-col overflow-hidden">
            <div class="p-4 border-b flex-shrink-0">
              <div class="flex items-center justify-between mb-3">
                <button id="backToListBtn" class="text-blue-600 hover:text-blue-800 text-sm">
                  <i class="fas fa-arrow-left mr-1"></i>一覧に戻る
                </button>
                <button id="newClientBtn" class="bg-green-600 hover:bg-green-700 text-white text-sm font-bold py-1.5 px-3 rounded-lg">
                  <i class="fas fa-plus mr-1"></i>新規
                </button>
              </div>
              <input type="text" id="searchInput" placeholder="検索..."
                class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
            </div>
            
            {/* 最近編集した取引先 */}
            <div id="recentClientsSection" class="border-b flex-shrink-0">
              <div class="px-4 py-2 bg-gray-50 flex items-center justify-between cursor-pointer" id="recentToggle">
                <span class="text-xs font-bold text-gray-600">
                  <i class="fas fa-clock mr-1 text-blue-500"></i>最近編集
                </span>
                <i class="fas fa-chevron-down text-gray-400 text-xs" id="recentToggleIcon"></i>
              </div>
              <div id="recentClientsList" class="max-h-40 overflow-y-auto">
                <div class="p-2 text-center text-gray-400 text-xs">読込中...</div>
              </div>
            </div>
            
            {/* 取引先一覧 見出し（最近編集とトーン統一） */}
            <div class="border-t border-slate-200">
              <div class="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  class="h-4 w-4 text-blue-600"
                  aria-hidden="true"
                  focusable="false"
                >
                  <line x1="8" y1="6" x2="21" y2="6"></line>
                  <line x1="8" y1="12" x2="21" y2="12"></line>
                  <line x1="8" y1="18" x2="21" y2="18"></line>
                  <circle cx="4" cy="6" r="1"></circle>
                  <circle cx="4" cy="12" r="1"></circle>
                  <circle cx="4" cy="18" r="1"></circle>
                </svg>
                <span>取引先一覧</span>
              </div>
            </div>
            <div id="clientListContainer" class="flex-1 overflow-y-auto min-h-0">
              <div class="p-4 text-center text-gray-500 text-sm">読込中...</div>
            </div>
          </div>
          
          {/* 右メインエリア: 詳細・編集フォーム */}
          <div class="flex-1 bg-white rounded-lg shadow overflow-y-auto min-h-0">
            <div id="formContainer" class="p-6">
              <div class="text-center py-12 text-gray-400">
                <i class="fas fa-building text-6xl mb-4"></i>
                <p>左のリストから取引先を選択するか、<br/>「新規」をクリックして登録してください</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <script dangerouslySetInnerHTML={{__html: `
        ${taxRateHelpers}
        // ビュー要素
        var tableView = document.getElementById('tableView');
        var detailView = document.getElementById('detailView');
        var searchInputTable = document.getElementById('searchInputTable');
        var filterWholesale = document.getElementById('filterWholesale');
        var clearFiltersBtn = document.getElementById('clearFiltersBtn');
        var searchResultCount = document.getElementById('searchResultCount');
        var clientTableBody = document.getElementById('clientTableBody');
        var newClientBtnTable = document.getElementById('newClientBtnTable');
        
        var searchInput = document.getElementById('searchInput');
        var clientListContainer = document.getElementById('clientListContainer');
        var formContainer = document.getElementById('formContainer');
        var newClientBtn = document.getElementById('newClientBtn');
        var backToListBtn = document.getElementById('backToListBtn');
        
        var searchTimeout;
        var currentClientId = null;
        var clients = [];
        var recentClients = [];
        var recentSectionCollapsed = false;
        
        // 最近編集セクション要素
        var recentToggle = document.getElementById('recentToggle');
        var recentToggleIcon = document.getElementById('recentToggleIcon');
        var recentClientsList = document.getElementById('recentClientsList');
        var recentClientsSection = document.getElementById('recentClientsSection');
        
        // 最近編集セクションの開閉
        if (recentToggle) {
          recentToggle.addEventListener('click', function() {
            recentSectionCollapsed = !recentSectionCollapsed;
            recentClientsList.classList.toggle('hidden', recentSectionCollapsed);
            recentToggleIcon.classList.toggle('fa-chevron-down', !recentSectionCollapsed);
            recentToggleIcon.classList.toggle('fa-chevron-right', recentSectionCollapsed);
          });
        }
        
        // 最近編集した取引先を読み込み
        async function loadRecentClients() {
          try {
            var res = await axios.get('/api/clients/recent?limit=5');
            recentClients = res.data;
            renderRecentClients();
          } catch (e) {
            console.error(e);
          }
        }
        
        // 最近編集した取引先を描画
        function renderRecentClients() {
          if (recentClients.length === 0) {
            recentClientsList.innerHTML = '<div class="p-2 text-center text-gray-400 text-xs">なし</div>';
            return;
          }
          
          recentClientsList.innerHTML = recentClients.map(function(c) {
            var isSelected = currentClientId === c.id;
            var updatedAt = c.updated_at ? new Date(c.updated_at).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
            return '<div class="recent-client-item px-4 py-2 cursor-pointer hover:bg-blue-50 text-sm border-b border-gray-100 ' + (isSelected ? 'bg-blue-100' : '') + '" data-id="' + c.id + '">' +
              '<div class="flex justify-between items-center">' +
              '<span class="truncate font-medium text-gray-700">' + c.client_name + '</span>' +
              '<span class="text-xs text-gray-400 ml-2 whitespace-nowrap">' + updatedAt + '</span>' +
              '</div></div>';
          }).join('');
          
          // クリックイベント
          recentClientsList.querySelectorAll('.recent-client-item').forEach(function(item) {
            item.addEventListener('click', function() {
              var id = parseInt(this.getAttribute('data-id'));
              if (window.SmartBill.formChanged) {
                window.SmartBill.confirmLeave(function() {
                  resetFormState();
                  loadClientForm(id);
                });
              } else {
                loadClientForm(id);
              }
            });
          });
        }
        
        // 現在のフィルター条件を取得
        function getFilterParams() {
          var params = new URLSearchParams();
          if (searchInputTable.value) params.set('search', searchInputTable.value);
          if (filterWholesale.value !== '') params.set('use_wholesale', filterWholesale.value);
          return params;
        }
        
        // フィルターをクリア
        function clearFilters() {
          searchInputTable.value = '';
          filterWholesale.value = '';
          loadClients();
        }
        
        // フォームの変更状態をリセット
        function resetFormState() {
          if (window.SmartBill) window.SmartBill.formChanged = false;
          window.SmartBill.skipConfirm = false;
        }
        
        // ビュー切り替え
        function showTableView() {
          if (window.SmartBill.formChanged) {
            window.SmartBill.confirmLeave(function() {
              resetFormState();
              tableView.classList.remove('hidden');
              detailView.classList.add('hidden');
              currentClientId = null;
              // サイドバーを展開
              window.SmartBill.expandSidebar();
            });
          } else {
            tableView.classList.remove('hidden');
            detailView.classList.add('hidden');
            currentClientId = null;
            // サイドバーを展開
            window.SmartBill.expandSidebar();
          }
        }
        
        function showDetailView() {
          tableView.classList.add('hidden');
          detailView.classList.remove('hidden');
          // サイドバーを縮小
          window.SmartBill.collapseSidebar();
        }
        
        // 取引先リスト読み込み
        async function loadClients(search) {
          try {
            // フィルター条件を取得
            var params = getFilterParams();
            // サイドバー用のsearch引数も対応
            if (search && !params.has('search')) {
              params.set('search', search);
            }
            var url = '/api/clients' + (params.toString() ? '?' + params.toString() : '');
            var res = await axios.get(url);
            clients = res.data;
            renderClientTable();
            renderClientList();
            // 検索結果件数を表示
            updateSearchResultCount();
          } catch (e) {
            console.error(e);
          }
        }
        
        // 検索結果件数を更新
        function updateSearchResultCount() {
          var hasFilter = searchInputTable.value || filterWholesale.value !== '';
          if (hasFilter) {
            searchResultCount.innerHTML = '<i class="fas fa-search mr-1"></i>検索結果: <strong>' + clients.length + '</strong> 件';
          } else {
            searchResultCount.innerHTML = '全 <strong>' + clients.length + '</strong> 件の取引先';
          }
        }
        
        // テーブル一覧描画
        function renderClientTable() {
          if (clients.length === 0) {
            var hasFilter = searchInputTable.value || filterWholesale.value !== '';
            var message = hasFilter ? '検索条件に一致する取引先がありません' : 'データがありません';
            clientTableBody.innerHTML = '<tr><td colspan="8" class="px-4 py-8 text-center text-gray-500">' + message + '</td></tr>';
            return;
          }
          
          clientTableBody.innerHTML = clients.map(function(c) {
            var closingDisplay = c.closing_day === '末' ? '末日' : (c.closing_day ? c.closing_day + '日' : '-');
            var representativeDisplay = c.representative_name ? 
              ((c.representative_title ? c.representative_title + ' ' : '') + c.representative_name) : '-';
            var wholesaleDisplay = c.use_wholesale_price ? 
              '<span class="bg-yellow-100 text-yellow-800 text-xs font-bold px-2 py-1 rounded border border-yellow-300">' + (c.discount_rate || 100) + '%</span>' : '-';
            return '<tr class="hover:bg-gray-50 cursor-pointer" data-id="' + c.id + '">' +
              '<td class="px-4 py-3 font-mono text-sm">' + (c.client_code || '-') + '</td>' +
              '<td class="px-4 py-3 font-medium">' + c.client_name + '</td>' +
              '<td class="px-4 py-3 text-sm">' + representativeDisplay + '</td>' +
              '<td class="px-4 py-3 text-sm">' + (c.person_name || '-') + '</td>' +
              '<td class="px-4 py-3 text-sm">' + (c.tel || c.mobile || '-') + '</td>' +
              '<td class="px-4 py-3 text-sm">' + closingDisplay + '</td>' +
              '<td class="px-4 py-3 text-center">' + wholesaleDisplay + '</td>' +
              '<td class="px-4 py-3 text-center">' +
              '<button class="text-blue-600 hover:text-blue-800 edit-btn" data-id="' + c.id + '"><i class="fas fa-edit"></i></button>' +
              '</td></tr>';
          }).join('');
          
          // 行クリックイベント
          clientTableBody.querySelectorAll('tr[data-id]').forEach(function(row) {
            row.addEventListener('click', function(e) {
              if (e.target.closest('.edit-btn')) return;
              var id = parseInt(this.getAttribute('data-id'));
              showDetailView();
              loadClientForm(id);
            });
          });
          
          // 編集ボタンクリック
          clientTableBody.querySelectorAll('.edit-btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
              e.stopPropagation();
              var id = parseInt(this.getAttribute('data-id'));
              showDetailView();
              loadClientForm(id);
            });
          });
        }
        
        // サイドバー取引先リスト描画
        function renderClientList() {
          if (clients.length === 0) {
            clientListContainer.innerHTML = '<div class="p-4 text-center text-gray-500 text-sm">データがありません</div>';
            return;
          }
          
          var html = clients.map(function(c) {
            var isSelected = currentClientId === c.id;
            var closingText = c.closing_day ? c.closing_day + '日締' : '末日締';
            return '<div class="client-item p-3 border-b cursor-pointer hover:bg-blue-50 ' + (isSelected ? 'bg-blue-100 border-l-4 border-l-blue-600' : '') + '" data-id="' + c.id + '">' +
              '<div class="flex justify-between items-start">' +
              '<div class="flex-1 min-w-0">' +
              '<p class="font-medium text-gray-800 truncate">' + c.client_name + '</p>' +
              '<p class="text-xs text-gray-500 mt-1">' +
              '<span class="mr-2"><i class="fas fa-hashtag mr-1"></i>' + (c.client_code || '-') + '</span>' +
              '<span class="' + (c.closing_day ? 'text-orange-600' : 'text-gray-500') + '">' + closingText + '</span>' +
              '</p>' +
              '</div>' +
              (c.use_wholesale_price ? '<span class="bg-yellow-100 text-yellow-700 text-xs px-1.5 py-0.5 rounded">卸</span>' : '') +
              '</div></div>';
          }).join('');
          
          clientListContainer.innerHTML = html;
          
          // クリックイベント
          clientListContainer.querySelectorAll('.client-item').forEach(function(item) {
            item.addEventListener('click', function() {
              var id = parseInt(this.getAttribute('data-id'));
              var itemEl = this;
              
              if (window.SmartBill.formChanged) {
                window.SmartBill.confirmLeave(function() {
                  resetFormState();
                  loadClientForm(id);
                });
              } else {
                loadClientForm(id);
              }
            });
          });
        }
        
        // 新規登録フォーム
        function showNewForm() {
          if (window.SmartBill.formChanged) {
            window.SmartBill.confirmLeave(function() {
              resetFormState();
              showDetailView();
              currentClientId = null;
              renderClientList();
              renderForm(null);
              // フォームエリアを一番上にスクロール
              formContainer.scrollTop = 0;
              formContainer.parentElement.scrollTop = 0;
            });
          } else {
            showDetailView();
            currentClientId = null;
            renderClientList();
            renderForm(null);
            // フォームエリアを一番上にスクロール
            formContainer.scrollTop = 0;
            formContainer.parentElement.scrollTop = 0;
          }
        }
        
        // 編集フォーム読み込み
        async function loadClientForm(id) {
          try {
            var res = await axios.get('/api/clients/' + id);
            currentClientId = id;
            renderClientList();
            renderRecentClients(); // 最近編集リストの選択状態も更新
            renderForm(res.data);
            // フォームエリアを一番上にスクロール
            formContainer.scrollTop = 0;
            formContainer.parentElement.scrollTop = 0;
          } catch (e) {
            console.error(e);
          }
        }
        
        // フォーム描画（取引条件改善版）
        function renderForm(data) {
          var isNew = !data;
          
          // 固定ヘッダー部分（スクロールしても常に表示）
          var headerHtml = '<div class="sticky top-0 bg-white z-10 -mt-6 -mx-6 px-6 py-4 border-b-2 border-gray-200 shadow-sm mb-6">' +
            '<div class="flex items-center justify-between">' +
            '<h2 class="text-xl font-bold text-gray-800 flex items-center">' +
            '<i class="fas ' + (isNew ? 'fa-user-plus text-green-600' : 'fa-edit text-blue-600') + ' mr-3"></i>' +
            (isNew ? '新規取引先登録' : '取引先編集') + '</h2>' +
            '<div class="flex items-center gap-3">' +
            '<button type="button" onclick="window.SmartBill.showShortcutHelp()" class="text-gray-400 hover:text-gray-600 text-sm" title="キーボードショートカット"><i class="fas fa-keyboard"></i></button>' +
            (isNew ? '' : '<button type="button" id="deleteBtn" class="bg-red-50 hover:bg-red-100 text-red-600 font-medium py-2 px-4 rounded-lg text-sm transition-colors border border-red-200"><i class="fas fa-trash-alt mr-1"></i>削除</button>') +
            '<span id="pageUnsavedIndicator" class="text-sm text-red-600 font-semibold hidden">●未保存</span>' +
            '<button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-lg text-sm transition-colors shadow-sm" title="Ctrl+S / ⌘+S">' +
            '<i class="fas ' + (isNew ? 'fa-plus-circle' : 'fa-save') + ' mr-1"></i>' + (isNew ? '登録' : '保存') + '</button>' +
            '</div></div></div>';
          
          var formHtml = '<form id="clientForm" class="space-y-6" data-track-unsaved="true">' +
            headerHtml +
            
            // 基本情報
            '<div>' +
            '<h3 class="text-lg font-bold mb-4 pb-2 border-b text-gray-800"><i class="fas fa-building mr-2 text-blue-600"></i>基本情報</h3>' +
            '<div class="grid grid-cols-1 md:grid-cols-2 gap-6">' +
            '<div><label class="block text-sm font-medium text-gray-700 mb-1">取引先名 *</label>' +
            '<input type="text" name="client_name" value="' + (data ? (data.client_name || '') : '') + '" required class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" /></div>' +
            '<div><label class="block text-sm font-medium text-gray-700 mb-1">取引先コード <span class="text-xs text-blue-600">※空欄で自動採番</span></label>' +
            '<div class="flex gap-2"><input type="text" name="client_code" value="' + (data ? (data.client_code || '') : '') + '" placeholder="自動採番" class="flex-1 border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />' +
            (isNew ? '<button type="button" id="getNextCode" class="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm">次の番号</button>' : '') + '</div></div>' +
            '<div><label class="block text-sm font-medium text-gray-700 mb-1">部署名</label>' +
            '<input type="text" name="department_name" value="' + (data ? (data.department_name || '') : '') + '" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" /></div>' +
            '<div><label class="block text-sm font-medium text-gray-700 mb-1">担当者名</label>' +
            '<input type="text" name="person_name" value="' + (data ? (data.person_name || '') : '') + '" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" /></div>' +
            '</div></div>' +
            
            // 代表者情報
            '<div>' +
            '<h3 class="text-lg font-bold mb-4 pb-2 border-b text-gray-800"><i class="fas fa-user-tie mr-2 text-indigo-600"></i>代表者情報</h3>' +
            '<div class="grid grid-cols-1 md:grid-cols-2 gap-6">' +
            '<div><label class="block text-sm font-medium text-gray-700 mb-1">役職</label>' +
            '<input type="text" name="representative_title" value="' + (data ? (data.representative_title || '') : '') + '" placeholder="例: 代表取締役、社長" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" /></div>' +
            '<div><label class="block text-sm font-medium text-gray-700 mb-1">代表者名</label>' +
            '<input type="text" name="representative_name" value="' + (data ? (data.representative_name || '') : '') + '" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" /></div>' +
            '</div></div>' +
            
            // 住所情報
            '<div>' +
            '<h3 class="text-lg font-bold mb-4 pb-2 border-b text-gray-800"><i class="fas fa-map-marker-alt mr-2 text-green-600"></i>住所情報</h3>' +
            '<div class="grid grid-cols-1 md:grid-cols-2 gap-6">' +
            '<div><label class="block text-sm font-medium text-gray-700 mb-1">郵便番号 <span class="text-xs text-gray-500">（自動フォーマット）</span></label>' +
            '<input type="text" name="postal_code" value="' + (data ? (data.postal_code || '') : '') + '" placeholder="123-4567" maxlength="8" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" /></div>' +
            '<div class="md:col-span-2"><label class="block text-sm font-medium text-gray-700 mb-1">住所</label>' +
            '<input type="text" name="address" value="' + (data ? (data.address || '') : '') + '" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" /></div>' +
            '<div><label class="block text-sm font-medium text-gray-700 mb-1">番地</label>' +
            '<input type="text" name="address_number" value="' + (data ? (data.address_number || '') : '') + '" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" /></div>' +
            '<div><label class="block text-sm font-medium text-gray-700 mb-1">ビル名等</label>' +
            '<input type="text" name="building_name" value="' + (data ? (data.building_name || '') : '') + '" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" /></div>' +
            '</div></div>' +
            
            // 連絡先情報
            '<div>' +
            '<h3 class="text-lg font-bold mb-4 pb-2 border-b text-gray-800"><i class="fas fa-phone mr-2 text-purple-600"></i>連絡先情報</h3>' +
            '<div class="grid grid-cols-1 md:grid-cols-2 gap-6">' +
            '<div><label class="block text-sm font-medium text-gray-700 mb-1">電話番号 <span class="text-xs text-gray-500">（自動フォーマット）</span></label>' +
            '<input type="text" name="tel" value="' + (data ? (data.tel || '') : '') + '" placeholder="03-1234-5678" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" /></div>' +
            '<div><label class="block text-sm font-medium text-gray-700 mb-1">FAX番号 <span class="text-xs text-gray-500">（自動フォーマット）</span></label>' +
            '<input type="text" name="fax" value="' + (data ? (data.fax || '') : '') + '" placeholder="03-1234-5678" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" /></div>' +
            '<div><label class="block text-sm font-medium text-gray-700 mb-1">携帯番号 <span class="text-xs text-gray-500">（自動フォーマット）</span></label>' +
            '<input type="text" name="mobile" value="' + (data ? (data.mobile || '') : '') + '" placeholder="090-1234-5678" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" /></div>' +
            '<div><label class="block text-sm font-medium text-gray-700 mb-1">メールアドレス</label>' +
            '<input type="email" name="email" value="' + (data ? (data.email || '') : '') + '" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" /></div>' +
            '<div class="md:col-span-2"><label class="block text-sm font-medium text-gray-700 mb-1">ウェブサイト</label>' +
            '<input type="url" name="website" value="' + (data ? (data.website || '') : '') + '" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" /></div>' +
            '</div></div>' +
            
            // 取引条件（改善版）
            '<div class="bg-gradient-to-r from-orange-50 to-yellow-50 border-2 border-orange-200 rounded-lg p-5">' +
            '<h3 class="text-lg font-bold mb-4 text-orange-800"><i class="fas fa-file-contract mr-2"></i>取引条件</h3>' +
            '<div class="grid grid-cols-1 md:grid-cols-2 gap-6">' +
            '<div>' +
            '<label class="block text-sm font-bold text-orange-700 mb-2">締め日</label>' +
            '<input type="text" name="closing_day" value="' + (data ? (data.closing_day || '') : '') + '" placeholder="例: 20, 末" class="w-full border-2 border-orange-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-500 bg-white" />' +
            '<p class="text-xs text-orange-600 mt-1"><i class="fas fa-info-circle mr-1"></i>月末締めの場合は「末」と入力</p>' +
            '</div>' +
            '<div>' +
            '<label class="block text-sm font-bold text-orange-700 mb-2">支払い期日</label>' +
            '<input type="text" name="payment_day" value="' + (data ? (data.payment_day || '') : '') + '" placeholder="例: 翌月20, 翌月末, 翌々月10" class="w-full border-2 border-orange-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-500 bg-white" />' +
            '<p class="text-xs text-orange-600 mt-1"><i class="fas fa-info-circle mr-1"></i>翌月20日払いなら「翌月20」、翌々月末なら「翌々月末」</p>' +
            '</div>' +
            '</div>' +
            '<div class="mt-3 p-3 bg-white rounded border border-orange-200">' +
            '<p class="text-sm text-gray-600"><i class="fas fa-lightbulb text-yellow-500 mr-2"></i>' +
            '<strong>入力例:</strong> 末日締め・翌月20日払い → 締め日:「末」、支払い期日:「翌月20」</p>' +
            '</div>' +
            '</div>' +
            
            // 敬称設定（個人/法人）
            '<div class="bg-purple-50 border-2 border-purple-300 rounded-lg p-4">' +
            '<h3 class="text-lg font-bold mb-3 text-purple-800"><i class="fas fa-user-tag mr-2"></i>敬称設定</h3>' +
            '<p class="text-sm text-purple-700 mb-3">請求書・見積書での敬称を設定します</p>' +
            '<div class="flex flex-wrap gap-4">' +
            '<label class="flex items-center cursor-pointer"><input type="radio" name="is_individual" value="0" ' + ((!data || !data.is_individual) ? 'checked' : '') + ' class="w-5 h-5 text-blue-600" /><span class="ml-2 text-gray-700 font-medium">法人（御中）</span></label>' +
            '<label class="flex items-center cursor-pointer"><input type="radio" name="is_individual" value="1" ' + ((data && data.is_individual) ? 'checked' : '') + ' class="w-5 h-5 text-purple-600" /><span class="ml-2 text-purple-800 font-medium">個人（様）</span></label>' +
            '</div>' +
            '</div>' +
            
            // 上代・下代設定
            '<div class="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-4">' +
            '<h3 class="text-lg font-bold mb-3 text-yellow-800"><i class="fas fa-tags mr-2"></i>上代・下代設定</h3>' +
            '<p class="text-sm text-yellow-700 mb-3">この取引先が上代（定価）・下代（卸価格）の商品を扱う場合は「はい」を選択</p>' +
            '<div class="flex flex-wrap gap-4 items-start">' +
            '<label class="flex items-center cursor-pointer"><input type="radio" name="use_wholesale_price" value="0" ' + ((!data || !data.use_wholesale_price) ? 'checked' : '') + ' class="w-5 h-5 text-blue-600" id="wholesaleNo" /><span class="ml-2 text-gray-700 font-medium">いいえ（通常取引）</span></label>' +
            '<label class="flex items-center cursor-pointer"><input type="radio" name="use_wholesale_price" value="1" ' + ((data && data.use_wholesale_price) ? 'checked' : '') + ' class="w-5 h-5 text-yellow-600" id="wholesaleYes" /><span class="ml-2 text-yellow-800 font-medium">はい（上代・下代を使用）</span></label>' +
            '</div>' +
            // 掛け率入力欄（上代・下代使用時のみ表示）
            '<div id="discountRateSection" class="mt-4 p-3 bg-white rounded-lg border border-yellow-300 ' + ((data && data.use_wholesale_price) ? '' : 'hidden') + '">' +
            '<div class="flex items-center gap-4">' +
            '<label class="text-sm font-bold text-yellow-800 whitespace-nowrap"><i class="fas fa-percentage mr-1"></i>掛け率</label>' +
            '<div class="flex items-center gap-2">' +
            '<input type="number" name="discount_rate" id="discountRateInput" value="' + (data ? (data.discount_rate || 100) : 100) + '" min="1" max="100" step="1" class="w-24 border-2 border-yellow-400 rounded-lg px-3 py-2 text-center font-bold focus:ring-2 focus:ring-yellow-500" />' +
            '<span class="text-yellow-800 font-bold">%</span>' +
            '</div>' +
            '<p class="text-xs text-yellow-600">数字のみ入力（例: 70 → 70%）</p>' +
            '</div></div>' +
            '</div>' +
            
            // 消費税表示設定
            '<div class="bg-green-50 border-2 border-green-300 rounded-lg p-4">' +
            '<h3 class="text-lg font-bold mb-3 text-green-800"><i class="fas fa-calculator mr-2"></i>消費税表示設定</h3>' +
            '<p class="text-sm text-green-700 mb-3">この取引先の見積書・納品書で消費税を表示するかどうかを設定します</p>' +
            '<div class="flex flex-wrap gap-4">' +
            '<label class="flex items-center cursor-pointer"><input type="radio" name="tax_display_setting" value="default" ' + ((!data || data.tax_display_setting === 'default' || !data.tax_display_setting) ? 'checked' : '') + ' class="w-5 h-5 text-blue-600" /><span class="ml-2 text-gray-700 font-medium">自社設定に従う</span></label>' +
            '<label class="flex items-center cursor-pointer"><input type="radio" name="tax_display_setting" value="show" ' + ((data && data.tax_display_setting === 'show') ? 'checked' : '') + ' class="w-5 h-5 text-green-600" /><span class="ml-2 text-green-800 font-medium">表示する</span></label>' +
            '<label class="flex items-center cursor-pointer"><input type="radio" name="tax_display_setting" value="hide" ' + ((data && data.tax_display_setting === 'hide') ? 'checked' : '') + ' class="w-5 h-5 text-gray-600" /><span class="ml-2 text-gray-700 font-medium">表示しない</span></label>' +
            '</div>' +
            '</div>' +
            
            // 銀行情報
            '<div>' +
            '<h3 class="text-lg font-bold mb-4 pb-2 border-b text-gray-800"><i class="fas fa-university mr-2 text-teal-600"></i>取引先銀行情報</h3>' +
            '<p class="text-sm text-gray-500 mb-4">取引先の振込先情報を登録します。</p>' +
            '<div class="grid grid-cols-1 md:grid-cols-2 gap-6">' +
            '<div><label class="block text-sm font-medium text-gray-700 mb-1">銀行名</label>' +
            '<input type="text" name="bank_name" value="' + (data ? (data.bank_name || '') : '') + '" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" /></div>' +
            '<div><label class="block text-sm font-medium text-gray-700 mb-1">支店名</label>' +
            '<input type="text" name="bank_branch" value="' + (data ? (data.bank_branch || '') : '') + '" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" /></div>' +
            '<div><label class="block text-sm font-medium text-gray-700 mb-1">口座種別</label>' +
            '<select name="bank_account_type" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500">' +
            '<option value="">選択してください</option>' +
            '<option value="普通" ' + ((data && data.bank_account_type === '普通') ? 'selected' : '') + '>普通</option>' +
            '<option value="当座" ' + ((data && data.bank_account_type === '当座') ? 'selected' : '') + '>当座</option>' +
            '</select></div>' +
            '<div><label class="block text-sm font-medium text-gray-700 mb-1">口座番号</label>' +
            '<input type="text" name="bank_account_number" value="' + (data ? (data.bank_account_number || '') : '') + '" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" /></div>' +
            '<div class="md:col-span-2"><label class="block text-sm font-medium text-gray-700 mb-1">口座名義</label>' +
            '<input type="text" name="bank_account_holder" value="' + (data ? (data.bank_account_holder || '') : '') + '" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" /></div>' +
            '</div></div>' +
            
            // メモ欄
            '<div class="pb-8">' +
            '<h3 class="text-lg font-bold mb-4 pb-2 border-b text-gray-800"><i class="fas fa-sticky-note mr-2 text-gray-600"></i>メモ</h3>' +
            '<p class="text-sm text-gray-500 mb-3">この取引先に関する社内メモ（取引先には表示されません）</p>' +
            '<textarea name="notes" rows="4" placeholder="取引先に関するメモを入力..." class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 resize-y">' + (data ? (data.notes || '') : '') + '</textarea>' +
            '</div>' +
            '</form>';
          
          formContainer.innerHTML = formHtml;
          
          // 郵便番号→住所自動入力
          window.SmartBill.setupPostalCodeLookup('postal_code', 'address');
          
          // 入力補助機能（郵便番号・電話番号の自動フォーマット）
          window.SmartBill.setupAutoFormat();
          
          // 必須項目の赤枠表示
          window.SmartBill.setupRequiredValidation('clientForm');
          
          // 上代・下代設定の掛け率セクション表示切り替え
          var wholesaleYes = document.getElementById('wholesaleYes');
          var wholesaleNo = document.getElementById('wholesaleNo');
          var discountRateSection = document.getElementById('discountRateSection');
          
          function toggleDiscountRateSection() {
            if (wholesaleYes.checked) {
              discountRateSection.classList.remove('hidden');
            } else {
              discountRateSection.classList.add('hidden');
            }
          }
          
          if (wholesaleYes) wholesaleYes.addEventListener('change', toggleDiscountRateSection);
          if (wholesaleNo) wholesaleNo.addEventListener('change', toggleDiscountRateSection);
          
          // フォーム変更検知
          setTimeout(function() { window.SmartBill.trackFormChanges('clientForm'); }, 100);
          
          // 次の取引先コード取得
          var getNextCodeBtn = document.getElementById('getNextCode');
          if (getNextCodeBtn) {
            getNextCodeBtn.addEventListener('click', function() {
              axios.get('/api/clients/next-code').then(function(res) {
                document.querySelector('[name="client_code"]').value = res.data.next_code;
              });
            });
          }
          
          // 削除ボタン
          var deleteBtn = document.getElementById('deleteBtn');
          if (deleteBtn) {
            deleteBtn.addEventListener('click', function() {
              var clientName = document.querySelector('[name="client_name"]').value;
              window.SmartBill.confirmDelete(clientName).then(function(confirmed) {
                if (!confirmed) return;
                axios.delete('/api/clients/' + currentClientId).then(function() {
                  resetFormState();
                  currentClientId = null;
                  loadClients(searchInput.value);
                  formContainer.innerHTML = '<div class="text-center py-12 text-gray-400"><i class="fas fa-building text-6xl mb-4"></i><p>左のリストから取引先を選択してください</p></div>';
                });
              });
            });
          }
          
          // フォーム送信
          document.getElementById('clientForm').addEventListener('submit', function(e) {
            e.preventDefault();
            var formData = new FormData(this);
            var sendData = Object.fromEntries(formData);
            sendData.use_wholesale_price = parseInt(sendData.use_wholesale_price);
            sendData.discount_rate = parseFloat(sendData.discount_rate) || 100;
            sendData.is_individual = parseInt(sendData.is_individual) || 0;
            
            var method = isNew ? 'post' : 'put';
            var url = isNew ? '/api/clients' : '/api/clients/' + currentClientId;
            
            axios[method](url, sendData).then(function(res) {
              resetFormState();
              loadClients(searchInput.value);
              loadRecentClients(); // 最近編集リストも更新
              if (isNew && res.data.client_code) {
                // 新規作成後、作成したクライアントを選択
                axios.get('/api/clients').then(function(listRes) {
                  var newClient = listRes.data.find(function(c) { return c.client_code === res.data.client_code; });
                  if (newClient) {
                    loadClientForm(newClient.id);
                  }
                });
              }
              window.SmartBill.showSuccessDialog('取引先情報を保存しました。');
            }).catch(function(e) {
              window.SmartBill.showConfirmDialog({
                title: 'エラー',
                message: 'データの保存に失敗しました。<br/>もう一度お試しください。',
                confirmText: 'OK',
                cancelText: '',
                icon: 'fa-times-circle',
                type: 'danger'
              });
              console.error(e);
            });
          });
        }
        
        // イベント設定 - テーブル検索フィルター
        searchInputTable.addEventListener('input', function(e) {
          clearTimeout(searchTimeout);
          searchTimeout = setTimeout(function() { loadClients(); }, 300);
        });
        
        filterWholesale.addEventListener('change', function(e) {
          loadClients();
        });
        
        clearFiltersBtn.addEventListener('click', clearFilters);
        
        // サイドバー検索
        searchInput.addEventListener('input', function(e) {
          clearTimeout(searchTimeout);
          searchTimeout = setTimeout(function() { loadClients(e.target.value); }, 300);
        });
        
        newClientBtnTable.addEventListener('click', showNewForm);
        newClientBtn.addEventListener('click', showNewForm);
        backToListBtn.addEventListener('click', showTableView);
        
        // キーボードショートカット設定
        window.SmartBill.setupKeyboardShortcuts({
          saveCallback: function() {
            var form = document.getElementById('clientForm');
            if (form) {
              var submitEvent = new Event('submit', { bubbles: true, cancelable: true });
              form.dispatchEvent(submitEvent);
            }
          },
          escapeCallback: function() {
            // 詳細ビューが表示されている場合のみ一覧に戻る
            if (!detailView.classList.contains('hidden')) {
              showTableView();
            }
          }
        });
        
        // 初期読み込み
        loadClients();
        loadRecentClients();
      `}} />
    </Layout>
  )
})

// 取引先 新規作成 → メインページへリダイレクト
app.get('/clients/new', async (c) => {
  return c.redirect('/clients')
})

// 取引先 編集 → メインページへリダイレクト
app.get('/clients/:id', async (c) => {
  return c.redirect('/clients')
})

// =====================================
// 商品マスタ（段階的表示: 一覧 → 2カラムレイアウト）
// =====================================
app.get('/products', async (c) => {
  return c.html(
    <Layout title="商品マスタ" currentPath="/products" hideTitle={true}>
      {/* 初期表示: テーブル一覧 */}
      <div id="tableView">
        {/* 固定ヘッダー: タイトル + 検索バー */}
        <div class="sticky top-0 z-20 -mx-4 md:-mx-8 px-4 md:px-8 pt-0 pb-4 bg-gray-100">
          <h2 class="text-2xl font-bold text-gray-800 mb-4 pt-0">商品マスタ</h2>
          <div class="bg-white rounded-lg shadow p-4">
            <div class="flex flex-wrap gap-4 items-end justify-between">
              <div class="flex flex-wrap gap-3 items-end flex-1">
                <div class="flex-1 min-w-64 max-w-md">
                  <label class="block text-xs font-medium text-gray-600 mb-1">
                    <i class="fas fa-search mr-1"></i>検索
                  </label>
                  <input type="text" id="searchInputTable" 
                    placeholder="商品コード、商品名、分類、備考、メモで検索..."
                    class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
                </div>
                <div class="w-40">
                  <label class="block text-xs font-medium text-gray-600 mb-1">
                    <i class="fas fa-folder mr-1"></i>分類
                  </label>
                  <select id="filterCategory"
                    class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
                    <option value="">すべて</option>
                  </select>
                </div>
                <div class="w-32">
                  <label class="block text-xs font-medium text-gray-600 mb-1">
                    <i class="fas fa-tags mr-1"></i>上代商品
                  </label>
                  <select id="filterWholesale"
                    class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
                    <option value="">すべて</option>
                    <option value="1">はい</option>
                    <option value="0">いいえ</option>
                  </select>
                </div>
                <button type="button" id="clearFiltersBtn" 
                  class="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm transition-colors" 
                  title="検索をクリア">
                  <i class="fas fa-times"></i>
                </button>
              </div>
              <div class="flex items-center gap-2">
                <button id="exportProductsCsvBtn" class="bg-white hover:bg-gray-50 text-gray-700 font-bold py-2 px-4 rounded-lg border border-gray-300">
                  <i class="fas fa-file-csv mr-2"></i>CSV出力
                </button>
                <button id="newProductBtnTable" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg">
                  <i class="fas fa-plus mr-2"></i>新規登録
                </button>
              </div>
            </div>
          </div>
        </div>
        
        <div class="bg-white rounded-lg shadow overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">コード</th>
                  <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">商品名</th>
                  <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">分類</th>
                  <th class="px-4 py-3 text-right text-sm font-medium text-gray-700">単価</th>
                  <th class="px-4 py-3 text-right text-sm font-medium text-gray-700">上代</th>
                  <th class="px-4 py-3 text-right text-sm font-medium text-gray-700">原価率</th>
                  <th class="px-4 py-3 text-center text-sm font-medium text-gray-700">操作</th>
                </tr>
              </thead>
              <tbody id="productTableBody" class="divide-y">
                <tr><td colSpan={7} class="px-4 py-8 text-center text-gray-500">読込中...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <div id="searchResultCount" class="mt-3 text-sm text-gray-600"></div>
      </div>
      
      {/* 詳細表示: 2カラムレイアウト（初期非表示） */}
      <div id="detailView" class="hidden h-full">
        <div class="flex gap-4 h-full">
          {/* 左サイドバー: 商品リスト */}
          <div class="w-80 flex-shrink-0 bg-white rounded-lg shadow flex flex-col overflow-hidden">
            <div class="p-4 border-b flex-shrink-0">
              <div class="flex items-center justify-between mb-3">
                <button id="backToListBtn" class="text-blue-600 hover:text-blue-800 text-sm">
                  <i class="fas fa-arrow-left mr-1"></i>一覧に戻る
                </button>
                <button id="newProductBtn" class="bg-green-600 hover:bg-green-700 text-white text-sm font-bold py-1.5 px-3 rounded-lg">
                  <i class="fas fa-plus mr-1"></i>新規
                </button>
              </div>
              <input type="text" id="searchInput" placeholder="検索..."
                class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
            </div>
            
            {/* 最近編集した商品 */}
            <div id="recentProductsSection" class="border-b flex-shrink-0">
              <div class="px-4 py-2 bg-gray-50 flex items-center justify-between cursor-pointer" id="recentToggle">
                <span class="text-xs font-bold text-gray-600">
                  <i class="fas fa-clock mr-1 text-blue-500"></i>最近編集
                </span>
                <i class="fas fa-chevron-down text-gray-400 text-xs" id="recentToggleIcon"></i>
              </div>
              <div id="recentProductsList" class="max-h-40 overflow-y-auto">
                <div class="p-2 text-center text-gray-400 text-xs">読込中...</div>
              </div>
            </div>
            
            {/* 商品一覧 見出し（最近編集とトーン統一） */}
            <div class="border-t border-slate-200">
              <div class="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  class="h-4 w-4 text-blue-600"
                  aria-hidden="true"
                  focusable="false"
                >
                  <line x1="8" y1="6" x2="21" y2="6"></line>
                  <line x1="8" y1="12" x2="21" y2="12"></line>
                  <line x1="8" y1="18" x2="21" y2="18"></line>
                  <circle cx="4" cy="6" r="1"></circle>
                  <circle cx="4" cy="12" r="1"></circle>
                  <circle cx="4" cy="18" r="1"></circle>
                </svg>
                <span>商品一覧</span>
              </div>
            </div>
            <div id="productListContainer" class="flex-1 overflow-y-auto min-h-0">
              <div class="p-4 text-center text-gray-500 text-sm">読込中...</div>
            </div>
          </div>
          
          {/* 右メインエリア: 詳細・編集フォーム */}
          <div class="flex-1 bg-white rounded-lg shadow overflow-y-auto min-h-0">
            <div id="formContainer" class="p-6">
              <div class="text-center py-12 text-gray-400">
                <i class="fas fa-box text-6xl mb-4"></i>
                <p>左のリストから商品を選択するか、<br/>「新規」をクリックして登録してください</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <script dangerouslySetInnerHTML={{__html: `
        ${taxRateHelpers}
        // ビュー要素
        var tableView = document.getElementById('tableView');
        var detailView = document.getElementById('detailView');
        var searchInputTable = document.getElementById('searchInputTable');
        var filterCategory = document.getElementById('filterCategory');
        var filterWholesale = document.getElementById('filterWholesale');
        var clearFiltersBtn = document.getElementById('clearFiltersBtn');
        var searchResultCount = document.getElementById('searchResultCount');
        var productTableBody = document.getElementById('productTableBody');
        var newProductBtnTable = document.getElementById('newProductBtnTable');
        var exportProductsCsvBtn = document.getElementById('exportProductsCsvBtn');
        
        var searchInput = document.getElementById('searchInput');
        var productListContainer = document.getElementById('productListContainer');
        var formContainer = document.getElementById('formContainer');
        var newProductBtn = document.getElementById('newProductBtn');
        var backToListBtn = document.getElementById('backToListBtn');
        
        var searchTimeout;
        var currentProductId = null;
        var products = [];
        var categories = [];
        var recentProducts = [];
        var recentSectionCollapsed = false;
        
        // 最近編集セクション要素
        var recentToggle = document.getElementById('recentToggle');
        var recentToggleIcon = document.getElementById('recentToggleIcon');
        var recentProductsList = document.getElementById('recentProductsList');
        
        var supabaseUrl = ${JSON.stringify(supabaseEnv.url)};
        var supabaseAnonKey = ${JSON.stringify(supabaseEnv.anonKey)};
        var supabaseClientPromise = null;
        
        function showSupabaseConfigError() {
          var message = '接続情報が未設定です';
          if (productTableBody) {
            productTableBody.innerHTML = '<tr><td colspan="7" class="px-4 py-8 text-center text-red-500">' + message + '</td></tr>';
          }
          if (productListContainer) {
            productListContainer.innerHTML = '<div class="p-4 text-center text-red-500 text-sm">' + message + '</div>';
          }
          if (searchResultCount) {
            searchResultCount.innerHTML = '<span class="text-red-500">' + message + '</span>';
          }
        }
        
        function getSupabaseClient() {
          if (window.SmartBill && window.SmartBill.supabaseClient) {
            return Promise.resolve(window.SmartBill.supabaseClient);
          }
          if (supabaseClientPromise) return supabaseClientPromise;
          
          supabaseClientPromise = new Promise(function(resolve, reject) {
            if (!supabaseUrl || !supabaseAnonKey) {
              console.error('Supabaseの環境変数が未設定です');
              showSupabaseConfigError();
              resolve(null);
              return;
            }
            
            function initClient() {
              if (window.supabase && window.supabase.createClient) {
                var client = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
                if (window.SmartBill) window.SmartBill.supabaseClient = client;
                resolve(client);
                return;
              }
              reject(new Error('Supabaseクライアントの初期化に失敗しました'));
            }
            
            if (window.supabase && window.supabase.createClient) {
              initClient();
              return;
            }
            
            var script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
            script.async = true;
            script.onload = initClient;
            script.onerror = function() {
              reject(new Error('Supabaseスクリプトの読み込みに失敗しました'));
            };
            document.head.appendChild(script);
          });
          
          return supabaseClientPromise;
        }
        
        // 最近編集セクションの開閉
        if (recentToggle) {
          recentToggle.addEventListener('click', function() {
            recentSectionCollapsed = !recentSectionCollapsed;
            recentProductsList.classList.toggle('hidden', recentSectionCollapsed);
            recentToggleIcon.classList.toggle('fa-chevron-down', !recentSectionCollapsed);
            recentToggleIcon.classList.toggle('fa-chevron-right', recentSectionCollapsed);
          });
        }
        
        // フォームの変更状態をリセット
        function resetFormState() {
          if (window.SmartBill) window.SmartBill.formChanged = false;
          window.SmartBill.skipConfirm = false;
        }
        
        // ビュー切り替え
        function showTableView() {
          if (window.SmartBill.formChanged) {
            window.SmartBill.confirmLeave(function() {
              resetFormState();
              tableView.classList.remove('hidden');
              detailView.classList.add('hidden');
              currentProductId = null;
              window.SmartBill.expandSidebar();
            });
          } else {
            tableView.classList.remove('hidden');
            detailView.classList.add('hidden');
            currentProductId = null;
            window.SmartBill.expandSidebar();
          }
        }
        
        function showDetailView() {
          tableView.classList.add('hidden');
          detailView.classList.remove('hidden');
          window.SmartBill.collapseSidebar();
        }
        
        // 分類リスト読み込み
        async function loadCategories() {
          try {
            var res = await axios.get('/api/categories');
            categories = res.data;
            
            // フィルター用プルダウン
            filterCategory.innerHTML = '<option value="">すべて</option>' +
              categories.map(function(c) { return '<option value="' + c.id + '">' + c.category_name + '</option>'; }).join('');
          } catch (e) {
            console.error(e);
          }
        }
        
        // 商品リスト読み込み
        async function loadProducts(search) {
          try {
            var searchValue = searchInputTable.value || '';
            var searchTerm = searchValue ? searchValue : (search || '');
            var client = await getSupabaseClient();
            if (!client) return;
            
            var query = client
              .from('products')
              .select('*, categories(category_name, category_code, display_order)')
              .eq('is_active', 1)
              .eq('user_id', 'demo-user-001');
            
            if (filterCategory.value) {
              query = query.eq('category_id', filterCategory.value);
            }
            
            if (searchTerm) {
              var rawSearch = typeof searchTerm === 'string' ? searchTerm : '';
              var s = rawSearch.trim();
              
              if (s.length > 0) {
                var like = '%' + s + '%';
                
                var orFilters = [
                  'product_code.ilike.' + like,
                  'product_name.ilike.' + like,
                  'jan_code.ilike.' + like,
                  'remarks.ilike.' + like,
                  'notes.ilike.' + like
                ].join(',');
                
                query = query.or(orFilters);
              }
            }
            
            if (filterWholesale.value !== '') {
              query = query.eq('is_wholesale', parseInt(filterWholesale.value));
            }
            
            var res = await query
              .order('display_order', { foreignTable: 'categories', ascending: true, nullsFirst: true })
              .order('product_code', { ascending: true })
              .order('product_name', { ascending: true });
            
            if (res.error) throw res.error;
            products = (res.data || []).map(function(row) {
              return Object.assign({}, row, {
                category_name: row.categories ? (row.categories.category_name || null) : null,
                category_code: row.categories ? (row.categories.category_code || null) : null
              });
            });
            renderProductTable();
            renderProductList();
            updateSearchResultCount();
          } catch (e) {
            console.error(e);
          }
        }
        
        // 最近編集した商品を読み込み
        async function loadRecentProducts() {
          try {
            var res = await axios.get('/api/products/recent?limit=5');
            recentProducts = res.data;
            renderRecentProducts();
          } catch (e) {
            console.error(e);
          }
        }
        
        // 検索結果件数を更新
        function updateSearchResultCount() {
          var hasFilter = searchInputTable.value || filterCategory.value || filterWholesale.value !== '';
          if (hasFilter) {
            searchResultCount.innerHTML = '<i class="fas fa-search mr-1"></i>検索結果: <strong>' + products.length + '</strong> 件';
          } else {
            searchResultCount.innerHTML = '全 <strong>' + products.length + '</strong> 件の商品';
          }
        }
        
        // 原価率計算
        function calcCostRate(costPrice, retailPrice) {
          if (!retailPrice || retailPrice === 0) return '-';
          return Math.round(costPrice / retailPrice * 100) + '%';
        }
        
        // テーブル一覧描画
        function renderProductTable() {
          if (products.length === 0) {
            var message = (searchInputTable.value || filterCategory.value || filterWholesale.value !== '') 
              ? '検索条件に一致する商品がありません' : 'データがありません';
            productTableBody.innerHTML = '<tr><td colspan="7" class="px-4 py-8 text-center text-gray-500">' + message + '</td></tr>';
            return;
          }
          
          productTableBody.innerHTML = products.map(function(p) {
            var costRate = p.is_wholesale ? calcCostRate(p.cost_price, p.retail_price) : '-';
            return '<tr class="hover:bg-gray-50 cursor-pointer" data-id="' + p.id + '">' +
              '<td class="px-4 py-3 font-mono text-sm">' + (p.product_code || '-') + '</td>' +
              '<td class="px-4 py-3 font-medium truncate max-w-xs">' + p.product_name + '</td>' +
              '<td class="px-4 py-3 text-sm">' + (p.category_name || '-') + '</td>' +
              '<td class="px-4 py-3 text-right text-sm">¥' + (p.unit_price || 0).toLocaleString() + '</td>' +
              '<td class="px-4 py-3 text-right text-sm">' + (p.is_wholesale ? '¥' + (p.retail_price || 0).toLocaleString() : '-') + '</td>' +
              '<td class="px-4 py-3 text-right text-sm">' + costRate + '</td>' +
              '<td class="px-4 py-3 text-center">' +
              '<button class="text-blue-600 hover:text-blue-800 edit-btn" data-id="' + p.id + '"><i class="fas fa-edit"></i></button>' +
              '</td></tr>';
          }).join('');
          
          // 行クリックイベント
          productTableBody.querySelectorAll('tr[data-id]').forEach(function(row) {
            row.addEventListener('click', function(e) {
              if (e.target.closest('.edit-btn')) return;
              var id = parseInt(this.getAttribute('data-id'));
              showDetailView();
              loadProductForm(id);
            });
          });
          
          // 編集ボタンクリック
          productTableBody.querySelectorAll('.edit-btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
              e.stopPropagation();
              var id = parseInt(this.getAttribute('data-id'));
              showDetailView();
              loadProductForm(id);
            });
          });
        }
        
        // サイドバー商品リスト描画
        function renderProductList() {
          if (products.length === 0) {
            productListContainer.innerHTML = '<div class="p-4 text-center text-gray-500 text-sm">データがありません</div>';
            return;
          }
          
          var html = products.map(function(p) {
            var isSelected = currentProductId === p.id;
            return '<div class="product-item p-3 border-b cursor-pointer hover:bg-blue-50 ' + (isSelected ? 'bg-blue-100 border-l-4 border-l-blue-600' : '') + '" data-id="' + p.id + '">' +
              '<div class="flex justify-between items-start">' +
              '<div class="flex-1 min-w-0">' +
              '<p class="font-medium text-gray-800 truncate">' + p.product_name + '</p>' +
              '<p class="text-xs text-gray-500 mt-1"><i class="fas fa-hashtag mr-1"></i>' + (p.product_code || '-') + ' / ' + (p.category_name || '未分類') + '</p>' +
              '</div>' +
              '<span class="text-xs text-gray-600 font-bold whitespace-nowrap ml-2">¥' + (p.unit_price || 0).toLocaleString() + '</span>' +
              '</div></div>';
          }).join('');
          
          productListContainer.innerHTML = html;
          
          // クリックイベント
          productListContainer.querySelectorAll('.product-item').forEach(function(item) {
            item.addEventListener('click', function() {
              var id = parseInt(this.getAttribute('data-id'));
              if (window.SmartBill.formChanged) {
                window.SmartBill.confirmLeave(function() {
                  resetFormState();
                  loadProductForm(id);
                });
              } else {
                loadProductForm(id);
              }
            });
          });
        }
        
        function exportProductsCsv() {
          window.location.href = '/api/products/export.csv';
        }
        
        // 最近編集した商品を描画
        function renderRecentProducts() {
          if (recentProducts.length === 0) {
            recentProductsList.innerHTML = '<div class="p-2 text-center text-gray-400 text-xs">なし</div>';
            return;
          }
          
          recentProductsList.innerHTML = recentProducts.map(function(p) {
            var isSelected = currentProductId === p.id;
            var updatedAt = p.updated_at ? new Date(p.updated_at).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
            return '<div class="recent-product-item px-4 py-2 cursor-pointer hover:bg-blue-50 text-sm border-b border-gray-100 ' + (isSelected ? 'bg-blue-100' : '') + '" data-id="' + p.id + '">' +
              '<div class="flex justify-between items-center">' +
              '<span class="truncate"><span class="text-gray-400 mr-1">' + (p.product_code || '') + '</span><span class="font-medium text-gray-700">' + p.product_name + '</span></span>' +
              '<span class="text-xs text-gray-400 ml-2 whitespace-nowrap">' + updatedAt + '</span>' +
              '</div></div>';
          }).join('');
          
          recentProductsList.querySelectorAll('.recent-product-item').forEach(function(item) {
            item.addEventListener('click', function() {
              var id = parseInt(this.getAttribute('data-id'));
              if (window.SmartBill.formChanged) {
                window.SmartBill.confirmLeave(function() {
                  resetFormState();
                  loadProductForm(id);
                });
              } else {
                loadProductForm(id);
              }
            });
          });
        }
        
        // 新規登録フォーム
        function showNewForm() {
          if (window.SmartBill.formChanged) {
            window.SmartBill.confirmLeave(function() {
              resetFormState();
              showDetailView();
              currentProductId = null;
              renderProductList();
              renderRecentProducts();
              renderForm(null);
              formContainer.scrollTop = 0;
              formContainer.parentElement.scrollTop = 0;
            });
          } else {
            showDetailView();
            currentProductId = null;
            renderProductList();
            renderRecentProducts();
            renderForm(null);
            formContainer.scrollTop = 0;
            formContainer.parentElement.scrollTop = 0;
          }
        }
        
        // 編集フォーム読み込み
        async function loadProductForm(id) {
          try {
            var res = await axios.get('/api/products/' + id);
            currentProductId = id;
            renderProductList();
            renderRecentProducts();
            renderForm(res.data);
            formContainer.scrollTop = 0;
            formContainer.parentElement.scrollTop = 0;
          } catch (e) {
            console.error(e);
          }
        }
        
        // フォーム描画
        function renderForm(data) {
          var isNew = !data;
          
          // 分類選択肢（分類名のみ表示）
          var categoryOptions = '<option value="">選択してください</option>' +
            categories.map(function(c) {
              var selected = (data && data.category_id == c.id) ? 'selected' : '';
              return '<option value="' + c.id + '" data-tax-rate="' + c.tax_rate + '" data-tax-type="' + c.tax_type + '" ' + selected + '>' + c.category_name + '</option>';
            }).join('');
          
          // 新規登録時の税率初期値（分類が選択されていればそこから取得）
          var initialTaxRate = '';
          if (data && data.tax_rate !== null && data.tax_rate !== undefined && data.tax_rate !== '') {
            initialTaxRate = normalizeTaxRate(data.tax_rate, 10);
          } else if (data && data.category_tax_rate !== null && data.category_tax_rate !== undefined && data.category_tax_rate !== '') {
            initialTaxRate = normalizeTaxRate(data.category_tax_rate, 10);
          }
          
          // 固定ヘッダー
          var headerHtml = '<div class="sticky top-0 bg-white z-10 -mt-6 -mx-6 px-6 py-4 border-b-2 border-gray-200 shadow-sm mb-6">' +
            '<div class="flex items-center justify-between">' +
            '<h2 class="text-xl font-bold text-gray-800 flex items-center">' +
            '<i class="fas ' + (isNew ? 'fa-box text-green-600' : 'fa-edit text-blue-600') + ' mr-3"></i>' +
            (isNew ? '新規商品登録' : '商品編集') + '</h2>' +
            '<div class="flex items-center gap-3">' +
            '<button type="button" onclick="window.SmartBill.showShortcutHelp()" class="text-gray-400 hover:text-gray-600 text-sm" title="キーボードショートカット"><i class="fas fa-keyboard"></i></button>' +
            (isNew ? '' : '<button type="button" id="duplicateBtn" class="bg-purple-50 hover:bg-purple-100 text-purple-600 font-medium py-2 px-4 rounded-lg text-sm transition-colors border border-purple-200" title="この商品をコピーして新規作成"><i class="fas fa-copy mr-1"></i>複製</button>') +
            (isNew ? '' : '<button type="button" id="deleteBtn" class="bg-red-50 hover:bg-red-100 text-red-600 font-medium py-2 px-4 rounded-lg text-sm transition-colors border border-red-200"><i class="fas fa-trash-alt mr-1"></i>削除</button>') +
            '<span id="pageUnsavedIndicator" class="text-sm text-red-600 font-semibold hidden">●未保存</span>' +
            '<button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-lg text-sm transition-colors shadow-sm" title="Ctrl+S / ⌘+S">' +
            '<i class="fas ' + (isNew ? 'fa-plus-circle' : 'fa-save') + ' mr-1"></i>' + (isNew ? '登録' : '保存') + '</button>' +
            '</div></div></div>';
          
          var formHtml = '<form id="productForm" class="space-y-6" data-track-unsaved="true">' +
            headerHtml +
            
            // 基本情報
            '<div>' +
            '<h3 class="text-lg font-bold mb-4 pb-2 border-b text-gray-800"><i class="fas fa-box mr-2 text-blue-600"></i>基本情報</h3>' +
            '<div class="grid grid-cols-1 md:grid-cols-2 gap-6">' +
            '<div class="md:col-span-2">' +
            '<label class="block text-sm font-medium text-gray-700 mb-1">商品名 *</label>' +
            '<div class="relative">' +
            '<input type="text" name="product_name" id="productNameInput" value="' + (data ? (data.product_name || '') : '') + '" required class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />' +
            '<div id="productSuggest" class="hidden absolute z-20 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto"></div>' +
            '</div>' +
            '</div>' +
            '<div><label class="block text-sm font-medium text-gray-700 mb-1">商品コード <span class="text-xs text-blue-600">※空欄で自動採番</span></label>' +
            '<div class="flex gap-2"><input type="text" name="product_code" id="productCodeInput" value="' + (data ? (data.product_code || '') : '') + '" placeholder="自動採番" class="flex-1 border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />' +
            (isNew ? '<button type="button" id="getNextCode" class="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm">次の番号</button>' : '') + '</div>' +
            '<p id="productCodeError" class="mt-1 text-sm text-red-600 hidden"></p></div>' +
            '<div><label class="block text-sm font-medium text-gray-700 mb-1">JANコード</label>' +
            '<input type="text" name="jan_code" id="janCodeInput" value="' + (data ? (data.jan_code || '') : '') + '" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />' +
            '<p id="janCodeError" class="mt-1 text-sm text-red-600 hidden"></p></div>' +
            '<div><label class="block text-sm font-medium text-gray-700 mb-1">分類</label>' +
            '<select name="category_id" id="categorySelect" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500">' + categoryOptions + '</select></div>' +
            '<div><label class="block text-sm font-medium text-gray-700 mb-1">税率 <span class="text-xs text-gray-500">（分類から自動反映）</span></label>' +
            '<div class="flex items-center gap-2"><input type="number" name="tax_rate" id="taxRateInput" value="' + initialTaxRate + '" step="0.1" placeholder="分類の税率を使用" class="flex-1 border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" /><span class="text-gray-500">%</span></div></div>' +
            '<div><label class="block text-sm font-medium text-gray-700 mb-1">最小ロット</label>' +
            '<div class="flex gap-2">' +
            '<input type="number" name="min_lot" value="' + (data ? (data.min_lot || 1) : 1) + '" min="1" class="w-24 border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />' +
            '<input type="text" name="unit" value="' + (data ? (data.unit || '個') : '個') + '" placeholder="単位" class="flex-1 border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />' +
            '</div></div>' +
            '</div></div>' +
            
            // 単価（適用中）
            '<div class="bg-green-50 rounded-lg border-2 border-green-300 p-5 shadow-sm">' +
            '<div class="flex items-start justify-between gap-2">' +
            '<h3 class="text-xl font-extrabold text-gray-800"><i class="fas fa-check-circle mr-2 text-green-600"></i>現在単価</h3>' +
            '<div id="activePriceNextChange" class="text-lg font-extrabold text-blue-700">次回単価変更日：なし</div>' +
            '</div>' +
            '<div class="mt-4">' +
            '<div id="activePriceNormalSection" class="' + ((data && data.is_wholesale) ? 'hidden' : '') + '">' +
            '<div class="grid grid-cols-1 md:grid-cols-3 gap-4">' +
            '<div><label class="block text-sm font-medium text-gray-700 mb-1">単価</label><div id="activeUnitPrice" class="bg-white/70 px-1 py-1 text-lg font-extrabold text-gray-800 cursor-default select-none">-</div></div>' +
            '<div><label class="block text-sm font-medium text-gray-700 mb-1">原価</label><div id="activeCostPriceNormal" class="bg-white/70 px-1 py-1 text-lg font-extrabold text-gray-800 cursor-default select-none">-</div></div>' +
            '<div><label class="block text-sm font-medium text-gray-700 mb-1">原価率（原価/単価）</label><div id="activeCostRateNormal" class="bg-white/70 px-1 py-1 text-base font-extrabold text-gray-800 cursor-default select-none">-</div></div>' +
            '</div></div>' +
            '<div id="activePriceWholesaleSection" class="' + ((data && data.is_wholesale) ? '' : 'hidden') + '">' +
            '<div class="grid grid-cols-1 md:grid-cols-3 gap-4">' +
            '<div><label class="block text-sm font-medium text-gray-700 mb-1">上代</label><div id="activeListPrice" class="bg-white/70 px-1 py-1 text-lg font-extrabold text-gray-800 cursor-default select-none">-</div></div>' +
            '<div><label class="block text-sm font-medium text-gray-700 mb-1">下代</label><div id="activeWholesalePrice" class="bg-white/70 px-1 py-1 text-lg font-extrabold text-gray-800 cursor-default select-none">-</div></div>' +
            '<div><label class="block text-sm font-medium text-gray-700 mb-1">原価</label><div id="activeCostPriceWholesale" class="bg-white/70 px-1 py-1 text-lg font-extrabold text-gray-800 cursor-default select-none">-</div></div>' +
            '</div>' +
            '<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">' +
            '<div><label class="block text-sm font-medium text-gray-700 mb-1">掛け率</label><div id="activeDiscountRate" class="bg-white/70 px-1 py-1 text-base font-extrabold text-gray-800 cursor-default select-none">-</div></div>' +
            '<div><label class="block text-sm font-medium text-gray-700 mb-1">原価率（原価/下代）</label><div id="activeCostRateWholesale" class="bg-white/70 px-1 py-1 text-base font-extrabold text-gray-800 cursor-default select-none">-</div></div>' +
            '</div></div>' +
            '</div>' +
            '</div>' +
            
            // 上代設定
            '<div class="bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-300 rounded-lg p-5">' +
            '<h3 class="text-lg font-bold mb-1 text-yellow-800"><i class="fas fa-yen-sign mr-2"></i>単価変更（適用日ベース）</h3>' +
            '<div class="text-xs text-gray-600 mb-3">単価の変更はここで追加します（未来日は予約になります）。</div>' +
            '<div class="mb-4">' +
            '<label class="block text-sm font-bold text-yellow-700 mb-2">上代商品（希望小売価格あり）</label>' +
            '<div class="flex gap-4">' +
            '<label class="flex items-center cursor-pointer"><input type="radio" name="is_wholesale" value="0" ' + ((!data || !data.is_wholesale) ? 'checked' : '') + ' class="w-5 h-5 text-blue-600" /><span class="ml-2 font-medium">いいえ（通常商品）</span></label>' +
            '<label class="flex items-center cursor-pointer"><input type="radio" name="is_wholesale" value="1" ' + ((data && data.is_wholesale) ? 'checked' : '') + ' class="w-5 h-5 text-yellow-600" /><span class="ml-2 font-medium text-yellow-800">はい（上代商品）</span></label>' +
            '</div></div>' +
            
            // 通常商品価格
            '<div id="normalPriceSection" class="' + ((data && data.is_wholesale) ? 'hidden' : '') + '">' +
            '<div class="grid grid-cols-1 md:grid-cols-3 gap-4">' +
            '<div><label class="block text-sm font-medium text-gray-700 mb-1">適用日 *</label>' +
            '<input type="date" id="priceHistoryEffectiveDateNormal" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />' +
            '<p id="priceHistoryEffectiveDateErrorNormal" class="mt-1 text-sm text-red-600 hidden"></p>' +
            '</div>' +
            '<div><label class="block text-sm font-medium text-gray-700 mb-1">原価 *</label>' +
            '<input type="number" name="cost_price" id="costPriceNormal" value="' + (data ? (data.cost_price || 0) : 0) + '" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />' +
            '<p id="priceHistoryCostPriceErrorNormal" class="mt-1 text-sm text-red-600 hidden"></p>' +
            '</div>' +
            '<div><label class="block text-sm font-medium text-gray-700 mb-1">単価（卸価格） *</label>' +
            '<input type="number" name="unit_price" id="unitPriceInput" value="' + (data ? (data.unit_price || 0) : 0) + '" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />' +
            '<p id="priceHistoryListPriceErrorNormal" class="mt-1 text-sm text-red-600 hidden"></p></div>' +
            '</div>' +
            '<div class="grid grid-cols-1 md:grid-cols-1 gap-4 mt-4">' +
            '<div><label class="block text-sm font-medium text-gray-700 mb-1">原価率（原価/単価）</label>' +
            '<div class="flex items-center"><input type="text" id="costRateNormalDisplay" readonly class="w-full border rounded-lg px-3 py-2 bg-gray-100 text-gray-700 font-bold" /><span class="ml-2 font-bold text-gray-600">%</span></div></div>' +
            '</div></div>' +
            
            // 上代商品価格
            '<div id="wholesalePriceSection" class="' + ((data && data.is_wholesale) ? '' : 'hidden') + '">' +
            '<div class="mb-3 text-sm text-gray-600">下代の決め方：</div>' +
            '<div class="flex gap-4 mb-4">' +
            '<label class="flex items-center cursor-pointer text-sm"><input type="radio" name="wholesale_mode" id="wholesaleModeRate" value="rate" checked class="w-4 h-4 text-blue-600" /><span class="ml-2">掛け率で計算（推奨）</span></label>' +
            '<label class="flex items-center cursor-pointer text-sm"><input type="radio" name="wholesale_mode" id="wholesaleModeManual" value="manual" class="w-4 h-4 text-blue-600" /><span class="ml-2">下代を手入力（掛け率を逆算）</span></label>' +
            '</div>' +
            '<div class="grid grid-cols-1 md:grid-cols-3 gap-4">' +
            '<div><label class="block text-sm font-medium text-gray-700 mb-1">適用日 *</label>' +
            '<input type="date" id="priceHistoryEffectiveDateWholesale" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />' +
            '<p id="priceHistoryEffectiveDateErrorWholesale" class="mt-1 text-sm text-red-600 hidden"></p>' +
            '</div>' +
            '<div><label class="block text-sm font-medium text-gray-700 mb-1">原価 *</label>' +
            '<input type="number" name="cost_price_wholesale" id="costPriceWholesale" value="' + (data ? (data.cost_price || 0) : 0) + '" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />' +
            '<p id="priceHistoryCostPriceErrorWholesale" class="mt-1 text-sm text-red-600 hidden"></p>' +
            '</div>' +
            '<div><label class="block text-sm font-medium text-gray-700 mb-1">上代 *</label>' +
            '<input type="number" name="retail_price" id="retailPriceInput" value="' + (data ? (data.retail_price || 0) : 0) + '" class="w-full border-2 border-yellow-400 rounded-lg px-3 py-2 focus:ring-2 focus:ring-yellow-500" /></div>' +
            '<p id="priceHistoryListPriceErrorWholesale" class="mt-1 text-sm text-red-600 hidden"></p></div>' +
            '</div>' +
            '<div id="wholesaleExtraFieldsWrapper" class="' + ((data && data.is_wholesale) ? '' : 'hidden') + '">' +
            '<div class="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">' +
            '<div><label class="block text-sm font-medium text-gray-700 mb-1">下代 *</label>' +
            '<input type="number" id="wholesalePriceInput" min="0" step="1" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />' +
            '<p id="priceHistoryWholesalePriceErrorWholesale" class="mt-1 text-sm text-red-600 hidden"></p>' +
            '</div>' +
            '<div><label class="block text-sm font-medium text-gray-700 mb-1">掛け率</label>' +
            '<div class="flex items-center"><input type="number" name="discount_rate" id="discountRateInput" value="' + (data ? (data.discount_rate || 100) : 100) + '" step="0.01" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" /><span class="ml-2 font-bold text-gray-600">%</span></div></div>' +
            '<div><label class="block text-sm font-medium text-gray-700 mb-1">原価率（原価/下代）</label>' +
            '<div class="flex items-center"><input type="text" id="costRateDisplay" readonly class="w-full border rounded-lg px-3 py-2 bg-gray-100 text-gray-700 font-bold" placeholder="-" /><span class="ml-2 font-bold text-gray-600">%</span></div></div>' +
            '</div>' +
            '<div class="mt-2 text-sm text-gray-500">下代 = 上代 × 掛け率</div>' +
            '</div>' +
            '</div>' +
            '</div>' +
            '<div class="mt-4 flex items-center gap-2">' +
            '<button type="button" id="addPriceHistoryBtn" class="' + (isNew ? 'bg-gray-200 text-gray-400' : 'bg-blue-600 hover:bg-blue-700 text-white') + ' font-bold py-2 px-4 rounded-lg text-sm" ' + (isNew ? 'disabled' : '') + '>履歴追加</button>' +
            '<button type="button" id="cancelPriceHistoryBtn" class="hidden bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-2 px-4 rounded-lg text-sm">キャンセル</button>' +
            (isNew ? '<span class="text-xs text-gray-400">※保存後に追加できます</span>' : '') +
            '</div>' +
            '<div class="mt-6 border-t pt-4">' +
            '<h4 class="text-sm font-bold text-gray-700 mb-3">単価変更履歴（最新3件）</h4>' +
            '<div id="priceHistoryList" class="space-y-3">' +
            '<div id="priceHistoryEmpty" class="text-sm text-gray-400">履歴がありません</div>' +
            '</div>' +
            '</div>' +
            
            // 備考・メモ
            '<div class="grid grid-cols-1 md:grid-cols-2 gap-6">' +
            '<div>' +
            '<h3 class="text-lg font-bold mb-4 pb-2 border-b text-gray-800"><i class="fas fa-comment mr-2 text-green-600"></i>備考</h3>' +
            '<p class="text-xs text-gray-500 mb-2">見積書に記載される内容（短めに）</p>' +
            '<input type="text" name="remarks" maxlength="100" value="' + (data ? (data.remarks || '') : '') + '" placeholder="見積書に表示される備考..." class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" /></div>' +
            '<div>' +
            '<h3 class="text-lg font-bold mb-4 pb-2 border-b text-gray-800"><i class="fas fa-sticky-note mr-2 text-gray-600"></i>メモ</h3>' +
            '<p class="text-xs text-gray-500 mb-2">社内共有用（帳票に出力されません）</p>' +
            '<textarea name="notes" rows="2" placeholder="社内メモ..." class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 resize-y">' + (data ? (data.notes || '') : '') + '</textarea>' +
            '</div></div>' +
            '</form>';
          
          formContainer.innerHTML = formHtml;
          
          // イベント設定
          setupFormEvents(isNew, data);
        }
        
        // フォームイベント設定
        function setupFormEvents(isNew, data) {
          var categorySelect = document.getElementById('categorySelect');
          var taxRateInput = document.getElementById('taxRateInput');
          var productNameInput = document.getElementById('productNameInput');
          var productSuggest = document.getElementById('productSuggest');
          var wholesaleRadios = document.querySelectorAll('input[name="is_wholesale"]');
          var normalSection = document.getElementById('normalPriceSection');
          var wholesaleSection = document.getElementById('wholesalePriceSection');
          var retailPriceInput = document.getElementById('retailPriceInput');
          var costPriceWholesale = document.getElementById('costPriceWholesale');
          var discountRateInput = document.getElementById('discountRateInput');
          var costRateDisplay = document.getElementById('costRateDisplay');
          var wholesalePriceInput = document.getElementById('wholesalePriceInput');
          var wholesaleModeRate = document.getElementById('wholesaleModeRate');
          var wholesaleModeManual = document.getElementById('wholesaleModeManual');
          var unitPriceInput = document.getElementById('unitPriceInput');
          var costPriceNormal = document.getElementById('costPriceNormal');
          var costRateNormalDisplay = document.getElementById('costRateNormalDisplay');
          var wholesaleExtraFieldsWrapper = document.getElementById('wholesaleExtraFieldsWrapper');
          var productCodeInput = document.getElementById('productCodeInput');
          var janCodeInput = document.getElementById('janCodeInput');
          var productCodeError = document.getElementById('productCodeError');
          var janCodeError = document.getElementById('janCodeError');
          
          var priceHistoryEffectiveDateNormal = document.getElementById('priceHistoryEffectiveDateNormal');
          var priceHistoryEffectiveDateWholesale = document.getElementById('priceHistoryEffectiveDateWholesale');
          var priceHistoryEffectiveDate = null;
          var priceHistoryEffectiveDateErrorNormal = document.getElementById('priceHistoryEffectiveDateErrorNormal');
          var priceHistoryEffectiveDateErrorWholesale = document.getElementById('priceHistoryEffectiveDateErrorWholesale');
          var priceHistoryCostPriceErrorNormal = document.getElementById('priceHistoryCostPriceErrorNormal');
          var priceHistoryCostPriceErrorWholesale = document.getElementById('priceHistoryCostPriceErrorWholesale');
          var priceHistoryListPriceErrorNormal = document.getElementById('priceHistoryListPriceErrorNormal');
          var priceHistoryListPriceErrorWholesale = document.getElementById('priceHistoryListPriceErrorWholesale');
          var priceHistoryWholesalePriceErrorWholesale = document.getElementById('priceHistoryWholesalePriceErrorWholesale');
          var priceHistoryCostPrice = null;
          var priceHistoryWholesalePrice = null;
          var priceHistoryListPrice = null;
          var priceHistoryModeRate = null;
          var priceHistoryModeManual = null;
          var priceHistoryRateInput = document.getElementById('priceHistoryRateInput');
          var priceHistoryCostRateDisplay = document.getElementById('priceHistoryCostRateDisplay');
          var priceHistoryList = document.getElementById('priceHistoryList');
          var addPriceHistoryBtn = document.getElementById('addPriceHistoryBtn');
          var cancelPriceHistoryBtn = document.getElementById('cancelPriceHistoryBtn');
          var priceSettingNextReservation = document.getElementById('priceSettingNextReservation');
          var activePriceNextChange = document.getElementById('activePriceNextChange');
          
          if (priceHistoryEffectiveDateNormal) {
            priceHistoryEffectiveDateNormal.addEventListener('input', updateAddPriceHistoryButtonState);
          }
          if (priceHistoryEffectiveDateWholesale) {
            priceHistoryEffectiveDateWholesale.addEventListener('input', updateAddPriceHistoryButtonState);
          }
          
          if (priceHistoryEffectiveDateNormal) {
            priceHistoryEffectiveDateNormal.addEventListener('input', updateAddPriceHistoryButtonState);
          }
          if (priceHistoryEffectiveDateWholesale) {
            priceHistoryEffectiveDateWholesale.addEventListener('input', updateAddPriceHistoryButtonState);
          }
          var activePriceNormalSection = document.getElementById('activePriceNormalSection');
          var activePriceWholesaleSection = document.getElementById('activePriceWholesaleSection');
          var activeUnitPrice = document.getElementById('activeUnitPrice');
          var activeCostPriceNormal = document.getElementById('activeCostPriceNormal');
          var activeCostRateNormal = document.getElementById('activeCostRateNormal');
          var activeListPrice = document.getElementById('activeListPrice');
          var activeWholesalePrice = document.getElementById('activeWholesalePrice');
          var activeCostPriceWholesale = document.getElementById('activeCostPriceWholesale');
          var activeDiscountRate = document.getElementById('activeDiscountRate');
          var activeCostRateWholesale = document.getElementById('activeCostRateWholesale');
          var priceHistoryItems = [];
          var editingPriceHistoryId = null;
          var activePriceSnapshot = data ? {
            is_wholesale: data.is_wholesale || 0,
            unit_price: data.unit_price,
            cost_price: data.cost_price,
            retail_price: data.retail_price,
            discount_rate: data.discount_rate,
            wholesale_price: data.unit_price
          } : null;

          function showFieldError(element, message) {
            if (!element) return;
            element.textContent = message;
            element.classList.remove('hidden');
          }
          
          function clearFieldError(element) {
            if (!element) return;
            element.textContent = '';
            element.classList.add('hidden');
          }
          
          function showSaveErrorDialog() {
            window.SmartBill.showConfirmDialog({
              title: 'エラー',
              message: 'データの保存に失敗しました。<br/>もう一度お試しください。',
              confirmText: 'OK',
              cancelText: '',
              icon: 'fa-times-circle',
              type: 'danger'
            });
          }

          function setInputReadonly(input, readonly) {
            if (!input) return;
            input.readOnly = readonly;
          input.disabled = readonly;
            input.classList.toggle('bg-gray-100', readonly);
          input.classList.toggle('text-gray-500', readonly);
          input.classList.toggle('cursor-not-allowed', readonly);
          }
          
          function setRateValue(input, value) {
            if (!input) return;
            input.value = (value === null || value === undefined) ? '' : value.toFixed(2);
          }
          
          if (productCodeInput) {
            productCodeInput.addEventListener('input', function() {
              clearFieldError(productCodeError);
            });
          }
          
          if (janCodeInput) {
            janCodeInput.addEventListener('input', function() {
              clearFieldError(janCodeError);
            });
          }
          
          async function checkDuplicateProductCode() {
            if (!productCodeInput) return;
            var normalized = window.SmartBill.normalizeProductCode(productCodeInput.value);
            if (!normalized) {
              clearFieldError(productCodeError);
              return;
            }
            
            try {
              var allProductsRes = await axios.get('/api/products');
              var allProducts = allProductsRes.data || [];
              var hasDuplicate = allProducts.some(function(p) {
                if (!isNew && p.id === currentProductId) return false;
                return window.SmartBill.normalizeProductCode(p.product_code) === normalized;
              });
              
              if (hasDuplicate) {
                showFieldError(productCodeError, '商品コードが重複しています');
              } else {
                clearFieldError(productCodeError);
              }
            } catch (e) {
              console.error(e);
            }
          }
          
          async function checkDuplicateJanCode() {
            if (!janCodeInput) return;
            var normalized = window.SmartBill.normalizeJan(janCodeInput.value);
            if (!normalized) {
              clearFieldError(janCodeError);
              return;
            }
            
            try {
              var allProductsRes = await axios.get('/api/products');
              var allProducts = allProductsRes.data || [];
              var hasDuplicate = allProducts.some(function(p) {
                if (!isNew && p.id === currentProductId) return false;
                return window.SmartBill.normalizeJan(p.jan_code) === normalized;
              });
              
              if (hasDuplicate) {
                showFieldError(janCodeError, 'JANコードが重複しています');
              } else {
                clearFieldError(janCodeError);
              }
            } catch (e) {
              console.error(e);
            }
          }
          
          if (productCodeInput) {
            productCodeInput.addEventListener('blur', function() {
              checkDuplicateProductCode();
            });
          }
          
          if (janCodeInput) {
            janCodeInput.addEventListener('blur', function() {
              checkDuplicateJanCode();
            });
          }
          
          // 分類変更で税率を自動反映
          categorySelect.addEventListener('change', function() {
            var selectedOption = this.options[this.selectedIndex];
            if (selectedOption) {
              var resolvedRate = resolveCategoryTaxRate({
                tax_type: selectedOption.dataset.taxType,
                tax_rate: selectedOption.dataset.taxRate
              }, 10);
              taxRateInput.value = resolvedRate;
              var typeLabel = selectedOption.dataset.taxType === 'reduced'
                ? '軽減'
                : (selectedOption.dataset.taxType === 'standard' ? '標準'
                : (selectedOption.dataset.taxType === 'custom' ? 'カスタム' : '非課税'));
              taxRateInput.placeholder = resolvedRate + '% (' + typeLabel + ')';
            }
            // 分類内の商品名サジェストをリセット
            loadProductSuggestions();
          });
          
          // 新規登録時または編集時で税率が未設定なら分類から反映
          if (categorySelect.value && taxRateInput.value === '') {
            var selectedOption = categorySelect.options[categorySelect.selectedIndex];
            if (selectedOption) {
              var resolvedRate = resolveCategoryTaxRate({
                tax_type: selectedOption.dataset.taxType,
                tax_rate: selectedOption.dataset.taxRate
              }, 10);
              taxRateInput.value = resolvedRate;
            }
          }
          
          // 商品名サジェスト
          var suggestTimeout;
          productNameInput.addEventListener('input', function() {
            clearTimeout(suggestTimeout);
            suggestTimeout = setTimeout(function() {
              if (categorySelect.value) {
                showProductSuggestions(productNameInput.value);
              }
            }, 200);
          });
          
          productNameInput.addEventListener('focus', function() {
            if (categorySelect.value && this.value.length === 0) {
              showProductSuggestions('');
            }
          });
          
          productNameInput.addEventListener('blur', function() {
            setTimeout(function() { productSuggest.classList.add('hidden'); }, 200);
          });
          
          async function loadProductSuggestions() {
            if (!categorySelect.value) return;
            try {
              var res = await axios.get('/api/products/by-category/' + categorySelect.value);
              window.productSuggestions = res.data.map(function(p) { return p.product_name; });
            } catch (e) {
              window.productSuggestions = [];
            }
          }
          
          function showProductSuggestions(query) {
            if (!window.productSuggestions || window.productSuggestions.length === 0) {
              productSuggest.classList.add('hidden');
              return;
            }
            var filtered = window.productSuggestions.filter(function(name) {
              return name.toLowerCase().includes(query.toLowerCase());
            }).slice(0, 10);
            
            if (filtered.length === 0) {
              productSuggest.classList.add('hidden');
              return;
            }
            
            productSuggest.innerHTML = filtered.map(function(name) {
              return '<div class="px-4 py-2 hover:bg-blue-50 cursor-pointer text-sm border-b last:border-b-0">' + name + '</div>';
            }).join('');
            productSuggest.classList.remove('hidden');
            
            productSuggest.querySelectorAll('div').forEach(function(item) {
              item.addEventListener('mousedown', function(e) {
                e.preventDefault();
                productNameInput.value = this.textContent;
                productSuggest.classList.add('hidden');
              });
            });
          }
          
          // 初期サジェストデータ読み込み
          if (categorySelect.value) loadProductSuggestions();
          
          // 上代商品切り替え
          wholesaleRadios.forEach(function(radio) {
            radio.addEventListener('change', function() {
              var isWholesale = this.value === '1';
              if (normalSection && wholesaleSection) {
                normalSection.classList.toggle('hidden', isWholesale);
                wholesaleSection.classList.toggle('hidden', !isWholesale);
              }
              if (wholesaleExtraFieldsWrapper) {
                wholesaleExtraFieldsWrapper.classList.toggle('hidden', !isWholesale);
              }
              if (activePriceSnapshot) {
                activePriceSnapshot.is_wholesale = isWholesale ? 1 : 0;
                updateActivePriceCard();
              }
              if (isWholesale) {
                applyMsrpModeState(true);
              } else {
                calculateNormalCostRate();
              }
              syncPriceHistoryInputRefs();
              updateAddPriceHistoryButtonState();
              clearPriceHistoryErrors();
              updatePriceHistoryLayout();
            });
          });
          if (normalSection && wholesaleSection) {
            var initialWholesale = isWholesaleModeSelected();
            normalSection.classList.toggle('hidden', initialWholesale);
            wholesaleSection.classList.toggle('hidden', !initialWholesale);
            if (initialWholesale) {
              applyMsrpModeState(true);
            }
          }
          
          // 通常商品の原価率計算
          function calculateNormalCostRate() {
          if (!unitPriceInput || !costPriceNormal || !costRateNormalDisplay) return;
            var unitPrice = parseFloat(unitPriceInput.value) || 0;
            var cost = parseFloat(costPriceNormal.value) || 0;
            
            if (unitPrice > 0) {
              costRateNormalDisplay.value = Math.round(cost / unitPrice * 100);
            } else {
              costRateNormalDisplay.value = '-';
            }
          }
        
        if (unitPriceInput) {
          unitPriceInput.addEventListener('input', function() {
            calculateNormalCostRate();
            updatePriceHistoryCalculations();
          });
        }
        if (costPriceNormal) {
          costPriceNormal.addEventListener('input', function() {
            calculateNormalCostRate();
            updatePriceHistoryCalculations();
          });
        }
        calculateNormalCostRate();
        
        var isUpdatingWholesale = false;
        function applyMsrpModeState(forceRateMode) {
          if (!wholesaleModeRate || !wholesaleModeManual) return;
          if (forceRateMode) {
            wholesaleModeRate.checked = true;
            wholesaleModeManual.checked = false;
          }
          applyWholesaleMode();
          updateWholesaleCalculations();
        }
        function applyWholesaleMode() {
          if (!wholesaleModeRate || !wholesaleModeManual || !wholesalePriceInput || !discountRateInput) return;
          if (wholesaleModeRate && wholesaleModeRate.checked) {
            setInputReadonly(wholesalePriceInput, true);
            setInputReadonly(discountRateInput, false);
          } else {
            setInputReadonly(wholesalePriceInput, false);
            setInputReadonly(discountRateInput, true);
          }
        }
        
        function updateWholesaleCalculations() {
          if (isUpdatingWholesale) return;
          if (!retailPriceInput || !costPriceWholesale || !discountRateInput || !wholesalePriceInput || !costRateDisplay) return;
          isUpdatingWholesale = true;
          
          var retail = window.SmartBill.parseNumber(retailPriceInput && retailPriceInput.value);
          var cost = window.SmartBill.parseNumber(costPriceWholesale && costPriceWholesale.value);
          var rate = window.SmartBill.parseNumber(discountRateInput && discountRateInput.value);
          var wholesale = window.SmartBill.parseNumber(wholesalePriceInput && wholesalePriceInput.value);
          
          if (wholesaleModeRate && wholesaleModeRate.checked) {
            var nextWholesale = window.SmartBill.calcWholesaleFromRate(retail, rate);
            wholesalePriceInput.value = nextWholesale === null ? '' : nextWholesale;
            wholesale = window.SmartBill.parseNumber(wholesalePriceInput.value);
          } else {
            var nextRate = window.SmartBill.calcRateFromWholesale(retail, wholesale);
            setRateValue(discountRateInput, nextRate);
          }
          
          var costRate = window.SmartBill.calcCostRate(cost, wholesale);
          costRateDisplay.value = costRate === null ? '-' : costRate.toFixed(2);
          
          isUpdatingWholesale = false;
        }
        
        if (wholesaleModeRate) {
          wholesaleModeRate.addEventListener('change', function() {
            applyMsrpModeState(false);
          });
        }
        if (wholesaleModeManual) {
          wholesaleModeManual.addEventListener('change', function() {
            applyMsrpModeState(false);
          });
        }
        
        if (retailPriceInput) {
          retailPriceInput.addEventListener('input', function() {
            updateWholesaleCalculations();
            updatePriceHistoryCalculations();
          });
        }
        if (costPriceWholesale) {
          costPriceWholesale.addEventListener('input', function() {
            updateWholesaleCalculations();
            updatePriceHistoryCalculations();
          });
        }
        if (discountRateInput) {
          discountRateInput.addEventListener('input', function() {
            if (wholesaleModeRate && wholesaleModeRate.checked) {
              updateWholesaleCalculations();
              updatePriceHistoryCalculations();
            }
          });
        }
        if (wholesalePriceInput) {
          wholesalePriceInput.addEventListener('input', function() {
            if (wholesaleModeManual && wholesaleModeManual.checked) {
              updateWholesaleCalculations();
              updatePriceHistoryCalculations();
            }
          });
        }

        applyMsrpModeState(false);
        
        function syncPriceHistoryInputRefs() {
          var isWholesale = document.querySelector('input[name="is_wholesale"]:checked')?.value === '1';
          priceHistoryEffectiveDate = isWholesale ? priceHistoryEffectiveDateWholesale : priceHistoryEffectiveDateNormal;
          priceHistoryCostPrice = isWholesale ? costPriceWholesale : costPriceNormal;
          priceHistoryWholesalePrice = isWholesale ? wholesalePriceInput : null;
          priceHistoryListPrice = isWholesale ? retailPriceInput : unitPriceInput;
          priceHistoryRateInput = isWholesale ? discountRateInput : null;
          priceHistoryCostRateDisplay = isWholesale ? costRateDisplay : costRateNormalDisplay;
          priceHistoryModeRate = wholesaleModeRate;
          priceHistoryModeManual = wholesaleModeManual;
        }

        syncPriceHistoryInputRefs();
        updateAddPriceHistoryButtonState();
        
        var isUpdatingPriceHistory = false;
        function applyPriceHistoryMode() {
          if (!isWholesaleModeSelected()) return;
          if (!priceHistoryWholesalePrice || !priceHistoryRateInput) return;
          if (priceHistoryModeRate && priceHistoryModeRate.checked) {
            setInputReadonly(priceHistoryWholesalePrice, true);
            setInputReadonly(priceHistoryRateInput, false);
          } else {
            setInputReadonly(priceHistoryWholesalePrice, false);
            setInputReadonly(priceHistoryRateInput, true);
          }
        }
        
        function updatePriceHistoryCalculations() {
          if (isUpdatingPriceHistory) return;
          isUpdatingPriceHistory = true;
          
          if (!isWholesaleModeSelected()) {
            calculateNormalCostRate();
            isUpdatingPriceHistory = false;
            return;
          }
          if (!priceHistoryListPrice || !priceHistoryWholesalePrice || !priceHistoryRateInput) {
            isUpdatingPriceHistory = false;
            return;
          }

          var retail = window.SmartBill.parseNumber(priceHistoryListPrice && priceHistoryListPrice.value);
          var cost = window.SmartBill.parseNumber(priceHistoryCostPrice && priceHistoryCostPrice.value);
          var rate = window.SmartBill.parseNumber(priceHistoryRateInput && priceHistoryRateInput.value);
          var wholesale = window.SmartBill.parseNumber(priceHistoryWholesalePrice && priceHistoryWholesalePrice.value);
          
          if (priceHistoryModeRate && priceHistoryModeRate.checked) {
            var nextWholesale = window.SmartBill.calcWholesaleFromRate(retail, rate);
            if (priceHistoryWholesalePrice) {
              priceHistoryWholesalePrice.value = nextWholesale === null ? '' : nextWholesale;
            }
            wholesale = window.SmartBill.parseNumber(priceHistoryWholesalePrice && priceHistoryWholesalePrice.value);
          } else {
            var nextRate = window.SmartBill.calcRateFromWholesale(retail, wholesale);
            setRateValue(priceHistoryRateInput, nextRate);
          }
          
          if (priceHistoryCostRateDisplay) {
            var costRate = window.SmartBill.calcCostRate(cost, wholesale);
            priceHistoryCostRateDisplay.value = costRate === null ? '-' : costRate.toFixed(2);
          }
          
          isUpdatingPriceHistory = false;
        }
        
        if (priceHistoryModeRate) {
          priceHistoryModeRate.addEventListener('change', function() {
            applyPriceHistoryMode();
            updatePriceHistoryCalculations();
          });
        }
        if (priceHistoryModeManual) {
          priceHistoryModeManual.addEventListener('change', function() {
            applyPriceHistoryMode();
            updatePriceHistoryCalculations();
          });
        }
        
        if (priceHistoryListPrice) {
          priceHistoryListPrice.addEventListener('input', updatePriceHistoryCalculations);
        }
        if (priceHistoryCostPrice) {
          priceHistoryCostPrice.addEventListener('input', updatePriceHistoryCalculations);
        }
        if (priceHistoryRateInput) {
          priceHistoryRateInput.addEventListener('input', function() {
            if (priceHistoryModeRate && priceHistoryModeRate.checked) {
              updatePriceHistoryCalculations();
            }
          });
        }
        if (priceHistoryWholesalePrice) {
          priceHistoryWholesalePrice.addEventListener('input', function() {
            if (priceHistoryModeManual && priceHistoryModeManual.checked) {
              updatePriceHistoryCalculations();
            }
          });
        }
        
        applyPriceHistoryMode();
        updatePriceHistoryCalculations();
        updateActivePriceCard();
        updateNextChangeLabel(null);
        updatePriceHistoryLayout();

        function updatePriceHistoryLayout() {
          return;
        }

        function clearPriceHistoryErrors() {
          clearFieldError(priceHistoryEffectiveDateErrorNormal);
          clearFieldError(priceHistoryEffectiveDateErrorWholesale);
          clearFieldError(priceHistoryCostPriceErrorNormal);
          clearFieldError(priceHistoryCostPriceErrorWholesale);
          clearFieldError(priceHistoryListPriceErrorNormal);
          clearFieldError(priceHistoryListPriceErrorWholesale);
          clearFieldError(priceHistoryWholesalePriceErrorWholesale);
        }

        function showPriceHistoryError(message) {
          showFieldError(getEffectiveDateError(), message);
        }

        function showPriceHistoryAlert(message) {
          var text = message || 'エラーが発生しました。';
          if (window.SmartBill && window.SmartBill.showConfirmDialog) {
            window.SmartBill.showConfirmDialog({
              title: 'エラー',
              message: text,
              confirmText: 'OK',
              cancelText: '',
              icon: 'fa-times-circle',
              type: 'danger'
            });
          } else {
            alert(text);
          }
        }

        function updateAddPriceHistoryButtonState() {
          if (!addPriceHistoryBtn || isNew) return;
          var effectiveInput = getEffectiveDateInput();
          var hasDate = !!(effectiveInput && effectiveInput.value);
          addPriceHistoryBtn.disabled = !hasDate;
          addPriceHistoryBtn.classList.toggle('bg-gray-200', !hasDate);
          addPriceHistoryBtn.classList.toggle('text-gray-400', !hasDate);
          addPriceHistoryBtn.classList.toggle('bg-blue-600', hasDate && !editingPriceHistoryId);
          addPriceHistoryBtn.classList.toggle('hover:bg-blue-700', hasDate && !editingPriceHistoryId);
          addPriceHistoryBtn.classList.toggle('bg-green-600', hasDate && editingPriceHistoryId);
          addPriceHistoryBtn.classList.toggle('hover:bg-green-700', hasDate && editingPriceHistoryId);
        }

        function isWholesaleModeSelected() {
          return document.querySelector('input[name="is_wholesale"]:checked')?.value === '1';
        }

        function getEffectiveDateInput() {
          return isWholesaleModeSelected() ? priceHistoryEffectiveDateWholesale : priceHistoryEffectiveDateNormal;
        }

        function getEffectiveDateError() {
          return isWholesaleModeSelected() ? priceHistoryEffectiveDateErrorWholesale : priceHistoryEffectiveDateErrorNormal;
        }

        function getCostPriceError() {
          return isWholesaleModeSelected() ? priceHistoryCostPriceErrorWholesale : priceHistoryCostPriceErrorNormal;
        }

        function getListPriceError() {
          return isWholesaleModeSelected() ? priceHistoryListPriceErrorWholesale : priceHistoryListPriceErrorNormal;
        }

        function getWholesalePriceError() {
          return priceHistoryWholesalePriceErrorWholesale;
        }

        function formatCurrency(value) {
          if (value === null || value === undefined || value === '') return '-';
          return '¥' + Number(value || 0).toLocaleString();
        }

        function formatRate(value) {
          if (value === null || value === undefined || value === '') return '-';
          return Number(value).toFixed(2) + '%';
        }

        function updateActivePriceCard() {
          if (!activePriceSnapshot) return;
          if (activePriceNormalSection && activePriceWholesaleSection) {
            var isWholesaleActive = Boolean(Number(activePriceSnapshot.is_wholesale || 0));
            activePriceNormalSection.classList.toggle('hidden', isWholesaleActive);
            activePriceWholesaleSection.classList.toggle('hidden', !isWholesaleActive);
          }

          var normalUnit = activePriceSnapshot.unit_price;
          var normalCost = activePriceSnapshot.cost_price;
          var normalRate = (normalUnit && normalUnit !== 0)
            ? Math.round((normalCost || 0) / normalUnit * 100)
            : null;

          if (activeUnitPrice) activeUnitPrice.textContent = formatCurrency(normalUnit);
          if (activeCostPriceNormal) activeCostPriceNormal.textContent = formatCurrency(normalCost);
          if (activeCostRateNormal) activeCostRateNormal.textContent = normalRate === null ? '-' : normalRate + '%';

          var listPrice = activePriceSnapshot.list_price ?? activePriceSnapshot.retail_price;
          var wholesalePrice = activePriceSnapshot.wholesale_price ?? activePriceSnapshot.unit_price;
          var costPrice = activePriceSnapshot.cost_price;
          var rateValue = (listPrice && listPrice !== 0)
            ? (Number(wholesalePrice || 0) / listPrice * 100)
            : null;
          var wholesaleCostRate = (wholesalePrice && wholesalePrice !== 0)
            ? (Number(costPrice || 0) / wholesalePrice * 100)
            : null;

          if (activeListPrice) activeListPrice.textContent = formatCurrency(listPrice);
          if (activeWholesalePrice) activeWholesalePrice.textContent = formatCurrency(wholesalePrice);
          if (activeCostPriceWholesale) activeCostPriceWholesale.textContent = formatCurrency(costPrice);
          if (activeDiscountRate) activeDiscountRate.textContent = rateValue === null ? '-' : rateValue.toFixed(2) + '%';
          if (activeCostRateWholesale) activeCostRateWholesale.textContent = wholesaleCostRate === null ? '-' : wholesaleCostRate.toFixed(2) + '%';
        }

        function updateNextChangeLabel(nextItem) {
          var text = nextItem && nextItem.effective_date ? nextItem.effective_date : 'なし';
          if (activePriceNextChange) {
            if (nextItem && nextItem.effective_date) {
              activePriceNextChange.innerHTML =
                '次回単価変更日：' +
                text +
                '<span class="ml-2 inline-flex items-center rounded-full bg-yellow-100 text-yellow-800 text-xs font-bold px-2 py-0.5">予約あり</span>';
            } else {
              activePriceNextChange.textContent = '次回単価変更日：なし';
            }
          }
          if (priceSettingNextReservation) {
            if (nextItem && nextItem.effective_date) {
              priceSettingNextReservation.textContent = '次回単価変更日：' + nextItem.effective_date;
              priceSettingNextReservation.classList.remove('hidden');
            } else {
              priceSettingNextReservation.textContent = '';
              priceSettingNextReservation.classList.add('hidden');
            }
          }
        }

        function setPriceHistoryEditMode(item) {
          if (!item) return;
          editingPriceHistoryId = item.id;
          var effectiveInput = getEffectiveDateInput();
          if (effectiveInput) effectiveInput.value = item.effective_date || '';
          if (isWholesaleModeSelected()) {
            if (costPriceWholesale) costPriceWholesale.value = item.cost_price ?? '';
            if (wholesalePriceInput) wholesalePriceInput.value = item.wholesale_price ?? '';
            if (retailPriceInput) retailPriceInput.value = item.list_price ?? '';
          } else {
            if (costPriceNormal) costPriceNormal.value = item.cost_price ?? '';
            if (unitPriceInput) unitPriceInput.value = item.wholesale_price ?? '';
          }
          updatePriceHistoryCalculations();
          if (addPriceHistoryBtn) {
            addPriceHistoryBtn.textContent = '更新';
            addPriceHistoryBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
            addPriceHistoryBtn.classList.add('bg-green-600', 'hover:bg-green-700');
          }
          if (cancelPriceHistoryBtn) cancelPriceHistoryBtn.classList.remove('hidden');
          updateAddPriceHistoryButtonState();
          renderPriceHistoryList(priceHistoryItems);
        }

        function clearPriceHistoryEditMode(keepValues) {
          editingPriceHistoryId = null;
          if (addPriceHistoryBtn) {
            addPriceHistoryBtn.textContent = '履歴追加';
            addPriceHistoryBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
            addPriceHistoryBtn.classList.add('bg-blue-600', 'hover:bg-blue-700');
          }
          if (cancelPriceHistoryBtn) cancelPriceHistoryBtn.classList.add('hidden');
          var effectiveInput = getEffectiveDateInput();
          if (effectiveInput) effectiveInput.value = '';
          if (!keepValues) {
            if (unitPriceInput) unitPriceInput.value = '';
            if (costPriceNormal) costPriceNormal.value = '';
            if (costRateNormalDisplay) costRateNormalDisplay.value = '-';
            if (retailPriceInput) retailPriceInput.value = '';
            if (costPriceWholesale) costPriceWholesale.value = '';
            if (wholesalePriceInput) wholesalePriceInput.value = '';
            if (discountRateInput) discountRateInput.value = '';
            if (priceHistoryRateInput) priceHistoryRateInput.value = '';
            if (priceHistoryCostRateDisplay) priceHistoryCostRateDisplay.value = '-';
          }
          updatePriceHistoryCalculations();
          clearPriceHistoryErrors();
          renderPriceHistoryList(priceHistoryItems);
          updateAddPriceHistoryButtonState();
        }

        function getTodayString() {
          var formatter = new Intl.DateTimeFormat('ja-JP', {
            timeZone: 'Asia/Tokyo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          });
          var parts = formatter.formatToParts(new Date());
          var year = '';
          var month = '';
          var day = '';
          for (var i = 0; i < parts.length; i++) {
            if (parts[i].type === 'year') year = parts[i].value;
            if (parts[i].type === 'month') month = parts[i].value;
            if (parts[i].type === 'day') day = parts[i].value;
          }
          return year + '-' + month + '-' + day;
        }

        function normalizeYmd(value) {
          if (!value) return '';
          var str = String(value);
          if (!str) return '';
          if (str.indexOf('T') !== -1) {
            str = str.split('T')[0];
          }
          if (str.indexOf(' ') !== -1) {
            str = str.split(' ')[0];
          }
          if (str.indexOf('/') !== -1) {
            str = str.split('/').join('-');
          }
          if (str.length > 10) {
            str = str.slice(0, 10);
          }
          if (str.length !== 10) return '';
          return str;
        }

        function applyActivePriceToForm(activeItem) {
          if (!activeItem) return;
          if (unitPriceInput) unitPriceInput.value = activeItem.wholesale_price ?? '';
          if (retailPriceInput) retailPriceInput.value = activeItem.list_price ?? '';
          if (costPriceNormal) costPriceNormal.value = activeItem.cost_price ?? '';
          if (costPriceWholesale) costPriceWholesale.value = activeItem.cost_price ?? '';
          if (wholesalePriceInput) wholesalePriceInput.value = activeItem.wholesale_price ?? '';
          if (discountRateInput) {
            var rateBase = window.SmartBill.calcRateFromWholesale(
              activeItem.list_price ?? '',
              activeItem.wholesale_price ?? ''
            );
            setRateValue(discountRateInput, rateBase);
          }
          calculateNormalCostRate();
          updateWholesaleCalculations();
          updatePriceHistoryCalculations();
        }

        function updateNextReservationLabel(nextItem) {
          updateNextChangeLabel(nextItem);
        }

        function syncPriceSettingsFromHistory(items) {
          var todayStr = getTodayString();
          var toDateString = function(value) {
            return normalizeYmd(value);
          };

          var sorted = (items || []).slice().sort(function(a, b) {
            var aStr = toDateString(a && a.effective_date);
            var bStr = toDateString(b && b.effective_date);
            if (!aStr && !bStr) return 0;
            if (!aStr) return 1;
            if (!bStr) return -1;
            return bStr.localeCompare(aStr);
          });

          var activeItem = null;
          for (var i = 0; i < sorted.length; i++) {
            var dateStr = toDateString(sorted[i] && sorted[i].effective_date);
            if (dateStr && dateStr <= todayStr) {
              activeItem = sorted[i];
              break;
            }
          }

          if (activeItem) {
            applyActivePriceToForm(activeItem);
            activePriceSnapshot = {
              is_wholesale: data && data.is_wholesale ? 1 : 0,
              unit_price: activeItem.wholesale_price,
              wholesale_price: activeItem.wholesale_price,
              list_price: activeItem.list_price,
              retail_price: activeItem.list_price,
              cost_price: activeItem.cost_price
            };
            updateActivePriceCard();
          }

          var nextReservation = null;
          for (var j = 0; j < sorted.length; j++) {
            var futureStr = toDateString(sorted[j] && sorted[j].effective_date);
            if (futureStr && futureStr > todayStr) {
              nextReservation = sorted[j];
            }
          }
          updateNextReservationLabel(nextReservation);
        }

        function getPriceSettingsPayload() {
          var isWholesaleValue = document.querySelector('input[name="is_wholesale"]:checked');
          var isWholesale = isWholesaleValue ? isWholesaleValue.value === '1' : false;
          var costPrice = isWholesale
            ? window.SmartBill.parseNumber(costPriceWholesale && costPriceWholesale.value)
            : window.SmartBill.parseNumber(costPriceNormal && costPriceNormal.value);
          var wholesalePrice = isWholesale
            ? window.SmartBill.parseNumber(wholesalePriceInput && wholesalePriceInput.value)
            : window.SmartBill.parseNumber(unitPriceInput && unitPriceInput.value);
          var listPrice = isWholesale
            ? window.SmartBill.parseNumber(retailPriceInput && retailPriceInput.value)
            : window.SmartBill.parseNumber(unitPriceInput && unitPriceInput.value);

          if (costPrice === null || wholesalePrice === null || listPrice === null) {
            return null;
          }

          return {
            effective_date: getTodayString(),
            cost_price: costPrice,
            wholesale_price: wholesalePrice,
            list_price: listPrice
          };
        }

        function upsertTodayPriceHistory(productId) {
          var payload = getPriceSettingsPayload();
          if (!payload) return Promise.resolve();

          return axios
            .get('/api/products/' + productId + '/price-history?limit=100')
            .then(function(res) {
              var items = res.data || [];
              var existing = items.find(function(item) {
                return normalizeYmd(item && item.effective_date) === normalizeYmd(payload && payload.effective_date);
              });

              if (existing && existing.id) {
                return axios.put('/api/products/' + productId + '/price-history/' + existing.id, payload);
              }
              return axios.post('/api/products/' + productId + '/price-history', payload);
            })
            .then(function() {
              loadPriceHistory();
            })
            .catch(function(e) {
              var status = e && e.response && e.response.status;
              var message = '';
              if (e && e.response && e.response.data) {
                message = e.response.data.error || JSON.stringify(e.response.data);
              } else if (e && e.message) {
                message = e.message;
              } else {
                message = String(e);
              }
              if (status === 409) {
                showPriceHistoryAlert('同じ適用日の履歴は1件までです。修正したい場合は編集を使ってください');
                return;
              }
              showPriceHistoryAlert(message);
            });
        }

        function renderPriceHistoryList(items) {
          if (!priceHistoryList) return;
          priceHistoryItems = items || [];
          var todayStr = getTodayString();
          var sorted = (items || []).slice().sort(function(a, b) {
            var aStr = normalizeYmd(a && a.effective_date);
            var bStr = normalizeYmd(b && b.effective_date);
            if (!aStr && !bStr) return 0;
            if (!aStr) return 1;
            if (!bStr) return -1;
            return bStr.localeCompare(aStr);
          });

          var activeItemId = null;
          var pastOrToday = (sorted || []).filter(function(item) {
            var dateStr = normalizeYmd(item && item.effective_date);
            return dateStr && dateStr <= todayStr;
          });
          if (pastOrToday.length > 0) {
            pastOrToday.sort(function(a, b) {
              var aStr = normalizeYmd(a && a.effective_date);
              var bStr = normalizeYmd(b && b.effective_date);
              if (!aStr && !bStr) return 0;
              if (!aStr) return 1;
              if (!bStr) return -1;
              return bStr.localeCompare(aStr);
            });
            activeItemId = pastOrToday[0].id;
          }

          if (sorted.length === 0) {
            priceHistoryList.innerHTML = '<div id="priceHistoryEmpty" class="text-sm text-gray-400">履歴がありません</div>';
            return;
          }

          priceHistoryList.innerHTML = sorted.map(function(item) {
            var effectiveDate = item.effective_date || '';
            var costPrice = (item.cost_price !== null && item.cost_price !== undefined) ? item.cost_price : '';
            var wholesalePrice = (item.wholesale_price !== null && item.wholesale_price !== undefined) ? item.wholesale_price : '';
            var listPrice = (item.list_price !== null && item.list_price !== undefined) ? item.list_price : '';
            var effectiveDateStr = normalizeYmd(effectiveDate);
            var isFuture = effectiveDateStr && effectiveDateStr > todayStr;
            var isActive = String(activeItemId) === String(item.id);
            var isEditing = String(editingPriceHistoryId) === String(item.id);
            var badgeText = isFuture ? '予約' : (isActive ? '適用中' : '');
            var badgeClass = isFuture ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700';
            var cardClass = 'border rounded-lg p-3 ' + (isEditing ? 'bg-yellow-50 border-yellow-300' : 'bg-gray-50');
            return (
              '<div class="' + cardClass + '" data-history-id="' + item.id + '">' +
                '<div class="flex justify-between items-start mb-2 gap-2">' +
                  '<div class="flex items-center gap-2">' +
                    '<div class="text-sm font-bold text-gray-700">' + effectiveDate + '</div>' +
                    (badgeText ? '<span class="text-[10px] px-2 py-0.5 rounded-full ' + badgeClass + '">' + badgeText + '</span>' : '') +
                    (isEditing ? '<span class="text-[10px] px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">編集中</span>' : '') +
                  '</div>' +
                  '<div class="flex items-center gap-1">' +
                    '<button type="button" class="price-history-edit-btn text-xs text-blue-600 border border-blue-300 hover:bg-blue-50 hover:text-blue-800 px-2.5 py-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1" aria-label="履歴を編集" title="編集" data-history-id="' + item.id + '">✏️</button>' +
                    '<button type="button" class="price-history-delete-btn text-xs text-red-600 border border-red-300 hover:bg-red-50 hover:text-red-800 px-2.5 py-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1" aria-label="履歴を削除" title="削除" data-history-id="' + item.id + '">🗑️</button>' +
                  '</div>' +
                '</div>' +
                '<div class="grid grid-cols-3 gap-2 text-xs text-gray-600">' +
                  '<div>原価: <span class="font-bold text-gray-800">¥' + Number(costPrice || 0).toLocaleString() + '</span></div>' +
                  '<div>下代: <span class="font-bold text-gray-800">¥' + Number(wholesalePrice || 0).toLocaleString() + '</span></div>' +
                  '<div>上代: <span class="font-bold text-gray-800">¥' + Number(listPrice || 0).toLocaleString() + '</span></div>' +
                '</div>' +
              '</div>'
            );
          }).join('');

          priceHistoryList.querySelectorAll('.price-history-edit-btn').forEach(function(button) {
            button.addEventListener('click', function() {
              var historyId = this.getAttribute('data-history-id');
              var item = (priceHistoryItems || []).find(function(row) { return String(row.id) === String(historyId); });
              if (!item) return;
              clearPriceHistoryErrors();
              setPriceHistoryEditMode(item);
            });
          });

          priceHistoryList.querySelectorAll('.price-history-delete-btn').forEach(function(button) {
            button.addEventListener('click', function() {
              var historyId = this.getAttribute('data-history-id');
              if (!historyId) return;
              var confirmPromise = window.SmartBill && window.SmartBill.confirmDelete
                ? window.SmartBill.confirmDelete('単価変更履歴')
                : Promise.resolve(confirm('この履歴を削除しますか？'));

              confirmPromise.then(function(confirmed) {
                if (!confirmed) return;
                axios.delete('/api/products/' + currentProductId + '/price-history/' + historyId)
                  .then(function() {
                    if (String(editingPriceHistoryId) === String(historyId)) {
                      clearPriceHistoryEditMode();
                    }
                    loadPriceHistory();
                  })
                  .catch(function(e) {
                    var message = '';
                    if (e && e.response && e.response.data) {
                      message = e.response.data.error || JSON.stringify(e.response.data);
                    } else if (e && e.message) {
                      message = e.message;
                    } else {
                      message = String(e);
                    }
                    showPriceHistoryAlert(message);
                  });
              });
            });
          });
        }

        function loadPriceHistory() {
          if (!currentProductId) return;
          axios.get('/api/products/' + currentProductId + '/price-history?limit=3')
            .then(function(res) {
              renderPriceHistoryList(res.data || []);
              syncPriceSettingsFromHistory(res.data || []);
            })
            .catch(function(e) {
              console.error(e);
              renderPriceHistoryList([]);
              updateNextReservationLabel(null);
            });
        }

        function getPriceHistoryPayload() {
          var effectiveDate = getEffectiveDateInput() && getEffectiveDateInput().value;
          var costPrice = window.SmartBill.parseNumber((isWholesaleModeSelected() ? costPriceWholesale : costPriceNormal)?.value);
          var wholesalePrice = window.SmartBill.parseNumber((isWholesaleModeSelected() ? wholesalePriceInput : unitPriceInput)?.value);
          var listPrice = window.SmartBill.parseNumber((isWholesaleModeSelected() ? retailPriceInput : unitPriceInput)?.value);

          if (!effectiveDate) {
            showFieldError(getEffectiveDateError(), '適用日を入力してください');
            return null;
          }
          if (costPrice === null) {
            showFieldError(getCostPriceError(), '原価を入力してください');
            return null;
          }
          if (isWholesaleModeSelected() && wholesalePrice === null) {
            showFieldError(getWholesalePriceError(), '下代を入力してください');
            return null;
          }
          if (listPrice === null) {
            showFieldError(getListPriceError(), isWholesaleModeSelected() ? '上代を入力してください' : '単価を入力してください');
            return null;
          }

          return {
            effective_date: effectiveDate,
            cost_price: costPrice,
            wholesale_price: wholesalePrice,
            list_price: listPrice
          };
        }

        if (addPriceHistoryBtn) {
          addPriceHistoryBtn.addEventListener('click', function() {
            if (!currentProductId) return;
            clearPriceHistoryErrors();
            var payload = getPriceHistoryPayload();
            if (!payload) return;

            var request;
            if (editingPriceHistoryId) {
              request = axios.put('/api/products/' + currentProductId + '/price-history/' + editingPriceHistoryId, payload);
            } else {
              request = axios.post('/api/products/' + currentProductId + '/price-history', payload);
            }

            request
              .then(function() {
                loadPriceHistory();
                clearPriceHistoryEditMode(true);
              })
              .catch(function(e) {
                var status = e && e.response && e.response.status;
                var message = '';
                if (e && e.response && e.response.data) {
                  message = e.response.data.error || JSON.stringify(e.response.data);
                } else if (e && e.message) {
                  message = e.message;
                } else {
                  message = String(e);
                }

                if (status === 409) {
                  showPriceHistoryError('同じ適用日の履歴は1件までです。修正したい場合は編集を使ってください');
                  return;
                }

                if (status === 400) {
                  showPriceHistoryError(message);
                  return;
                }

                showPriceHistoryError('保存に失敗しました。時間をおいて再度お試しください。');
              });
          });
        }

        if (cancelPriceHistoryBtn) {
          cancelPriceHistoryBtn.addEventListener('click', function() {
            clearPriceHistoryEditMode();
          });
        }
          
        loadPriceHistory();

        // 次の商品コード取得
          var getNextCodeBtn = document.getElementById('getNextCode');
          if (getNextCodeBtn) {
            getNextCodeBtn.addEventListener('click', function() {
              axios.get('/api/products/next-code').then(function(res) {
                document.querySelector('[name="product_code"]').value = res.data.next_code;
              });
            });
          }
          
          // 必須項目の赤枠表示
          window.SmartBill.setupRequiredValidation('productForm');
          
          // フォーム変更検知
          setTimeout(function() { window.SmartBill.trackFormChanges('productForm'); }, 100);
          
          // 複製ボタン
          var duplicateBtn = document.getElementById('duplicateBtn');
          if (duplicateBtn) {
            duplicateBtn.addEventListener('click', function() {
              // 現在のフォームデータを取得
              var formData = new FormData(document.getElementById('productForm'));
              var duplicateData = Object.fromEntries(formData);
              
              // 商品コードをクリア（新規採番用）
              duplicateData.product_code = '';
              // 商品名に「（コピー）」を追加
              duplicateData.product_name = duplicateData.product_name + '（コピー）';
              
              // 複製データをオブジェクト形式に変換
              var newData = {
                product_name: duplicateData.product_name,
                product_code: '',
                jan_code: duplicateData.jan_code || '',
                category_id: duplicateData.category_id || null,
                tax_rate: (duplicateData.tax_rate === null || duplicateData.tax_rate === undefined || duplicateData.tax_rate === '') ? null : normalizeTaxRate(duplicateData.tax_rate, 10),
                min_lot: parseInt(duplicateData.min_lot) || 1,
                unit: duplicateData.unit || '個',
                is_wholesale: parseInt(duplicateData.is_wholesale) || 0,
                unit_price: parseFloat(duplicateData.unit_price) || 0,
                cost_price: duplicateData.is_wholesale == '1' 
                  ? parseFloat(document.getElementById('costPriceWholesale').value) || 0
                  : parseFloat(document.getElementById('costPriceNormal').value) || 0,
                retail_price: parseFloat(duplicateData.retail_price) || 0,
                discount_rate: parseFloat(duplicateData.discount_rate) || 100,
                remarks: duplicateData.remarks || '',
                notes: duplicateData.notes || '',
                // 分類の税率情報も引き継ぐ
                category_tax_rate: data ? data.category_tax_rate : null,
                category_tax_type: data ? data.category_tax_type : null
              };
              
              // 新規作成モードでフォームを再描画
              resetFormState();
              currentProductId = null;
              renderProductList();
              renderRecentProducts();
              renderForm(newData);
              formContainer.scrollTop = 0;
              formContainer.parentElement.scrollTop = 0;
              
              // 複製完了メッセージ
              window.SmartBill.showSuccessDialog('商品を複製しました。<br/>内容を編集して保存してください。');
            });
          }
          
          // 削除ボタン
          var deleteBtn = document.getElementById('deleteBtn');
          if (deleteBtn) {
            deleteBtn.addEventListener('click', function() {
              var productName = document.querySelector('[name="product_name"]').value;
              window.SmartBill.confirmDelete(productName).then(function(confirmed) {
                if (!confirmed) return;
                axios.delete('/api/products/' + currentProductId).then(function() {
                  resetFormState();
                  currentProductId = null;
                  loadProducts(searchInput.value);
                  loadRecentProducts();
                  formContainer.innerHTML = '<div class="text-center py-12 text-gray-400"><i class="fas fa-box text-6xl mb-4"></i><p>左のリストから商品を選択してください</p></div>';
                });
              });
            });
          }
          
          // フォーム送信
          document.getElementById('productForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            clearFieldError(productCodeError);
            clearFieldError(janCodeError);
            var formData = new FormData(this);
            var sendData = Object.fromEntries(formData);
            
            sendData.is_wholesale = parseInt(sendData.is_wholesale);
            if (sendData.is_wholesale) {
              sendData.unit_price = parseFloat(wholesalePriceInput && wholesalePriceInput.value) || 0;
              sendData.retail_price = parseFloat(retailPriceInput && retailPriceInput.value) || 0;
              sendData.discount_rate = parseFloat(discountRateInput && discountRateInput.value) || 100;
            } else {
              sendData.unit_price = parseFloat(sendData.unit_price) || 0;
              sendData.retail_price = 0;
              sendData.discount_rate = 100;
            }
            sendData.min_lot = parseInt(sendData.min_lot) || 1;
            sendData.category_id = sendData.category_id || null;
            sendData.tax_rate = (sendData.tax_rate === null || sendData.tax_rate === undefined || sendData.tax_rate === '') ? null : normalizeTaxRate(sendData.tax_rate, 10);
            
            // 原価の処理
            if (sendData.is_wholesale) {
              sendData.cost_price = parseFloat(document.getElementById('costPriceWholesale').value) || 0;
            } else {
              sendData.cost_price = parseFloat(document.getElementById('costPriceNormal').value) || 0;
            }
            
            var normalizedProductCode = window.SmartBill.normalizeProductCode(sendData.product_code);
            if (!normalizedProductCode) {
              try {
                var nextCodeRes = await axios.get('/api/products/next-code');
                normalizedProductCode = nextCodeRes.data.next_code || '';
              } catch (e) {
                showSaveErrorDialog();
                console.error(e);
                return;
              }
            }
            
            if (!normalizedProductCode) {
              showSaveErrorDialog();
              return;
            }
            
            sendData.product_code = normalizedProductCode;
            if (productCodeInput) productCodeInput.value = normalizedProductCode;
            
            var normalizedJan = window.SmartBill.normalizeJan(sendData.jan_code);
            sendData.jan_code = normalizedJan;
            
            var allProducts;
            try {
              var allProductsRes = await axios.get('/api/products');
              allProducts = allProductsRes.data || [];
            } catch (e) {
              showSaveErrorDialog();
              console.error(e);
              return;
            }
            
            var isSameProduct = function(p) {
              return !isNew && p.id === currentProductId;
            };
            
            var hasDuplicateProductCode = allProducts.some(function(p) {
              return !isSameProduct(p) && window.SmartBill.normalizeProductCode(p.product_code) === normalizedProductCode;
            });
            
            if (hasDuplicateProductCode) {
              showFieldError(productCodeError, '商品コードが重複しています');
              return;
            }
            
            if (normalizedJan !== '') {
              var hasDuplicateJan = allProducts.some(function(p) {
                return !isSameProduct(p) && window.SmartBill.normalizeJan(p.jan_code) === normalizedJan;
              });
              
              if (hasDuplicateJan) {
                showFieldError(janCodeError, 'JANコードが重複しています');
                return;
              }
            }
            
            var method = isNew ? 'post' : 'put';
            var url = isNew ? '/api/products' : '/api/products/' + currentProductId;
            
            axios[method](url, sendData).then(function(res) {
              resetFormState();
              loadProducts(searchInput.value);
              loadRecentProducts();
              if (isNew && res.data.product_code) {
                axios.get('/api/products').then(function(listRes) {
                  var newProduct = listRes.data.find(function(p) { return p.product_code === res.data.product_code; });
                  if (newProduct) {
                    loadProductForm(newProduct.id).then(function() {
                      upsertTodayPriceHistory(newProduct.id);
                    });
                  }
                });
              } else if (currentProductId) {
                upsertTodayPriceHistory(currentProductId);
              }
              window.SmartBill.showSuccessDialog('商品情報を保存しました。');
            }).catch(function(e) {
              var errorMessage = '';
              if (e && e.response && e.response.data) {
                errorMessage = JSON.stringify(e.response.data);
              } else if (e && e.message) {
                errorMessage = e.message;
              } else {
                errorMessage = String(e);
              }
              
              if (/unique/i.test(errorMessage) || /constraint/i.test(errorMessage)) {
                if (/product_code/i.test(errorMessage)) {
                  showFieldError(productCodeError, '商品コードが重複しています');
                  return;
                }
                if (/jan_code/i.test(errorMessage)) {
                  showFieldError(janCodeError, 'JANコードが重複しています');
                  return;
                }
              }
              
              showSaveErrorDialog();
              console.error(e);
            });
          });
        }
        
        // フィルターをクリア
        function clearFilters() {
          searchInputTable.value = '';
          filterCategory.value = '';
          filterWholesale.value = '';
          loadProducts();
        }
        
        // イベント設定
        searchInputTable.addEventListener('input', function(e) {
          clearTimeout(searchTimeout);
          searchTimeout = setTimeout(function() { loadProducts(); }, 300);
        });
        
        filterCategory.addEventListener('change', function() { loadProducts(); });
        filterWholesale.addEventListener('change', function() { loadProducts(); });
        
        searchInput.addEventListener('input', function(e) {
          clearTimeout(searchTimeout);
          searchTimeout = setTimeout(function() { loadProducts(e.target.value); }, 300);
        });
        
        clearFiltersBtn.addEventListener('click', clearFilters);
        newProductBtnTable.addEventListener('click', showNewForm);
        if (exportProductsCsvBtn) {
          exportProductsCsvBtn.addEventListener('click', exportProductsCsv);
        }
        newProductBtn.addEventListener('click', showNewForm);
        backToListBtn.addEventListener('click', showTableView);
        
        // キーボードショートカット設定
        window.SmartBill.setupKeyboardShortcuts({
          saveCallback: function() {
            var form = document.getElementById('productForm');
            if (form) {
              var submitEvent = new Event('submit', { bubbles: true, cancelable: true });
              form.dispatchEvent(submitEvent);
            }
          },
          escapeCallback: function() {
            if (!detailView.classList.contains('hidden')) {
              showTableView();
            }
          }
        });
        
        // 初期読み込み
        loadCategories().then(function() {
          loadProducts();
        });
        loadRecentProducts();
      `}} />
    </Layout>
  )
})

// 商品 新規作成 → メインページへリダイレクト
app.get('/products/new', async (c) => {
  return c.redirect('/products')
})

// 商品 編集 → メインページへリダイレクト
app.get('/products/:id', async (c) => {
  return c.redirect('/products')
})

// 納品データ入力
app.get('/deliveries', async (c) => {
  return c.html(
    <Layout title="納品データ入力" currentPath="/deliveries" hideTitle={true}>
      {/* 初期表示: テーブル一覧 */}
      <div id="tableView">
        {/* 固定ヘッダー: タイトル + 検索バー */}
        <div class="sticky top-0 z-20 -mx-4 md:-mx-8 px-4 md:px-8 pt-0 pb-4 bg-gray-100">
          <h2 class="text-2xl font-bold text-gray-800 mb-4 pt-0">納品データ入力</h2>
          <div class="bg-white rounded-lg shadow p-4">
            <div class="flex flex-wrap gap-4 items-end justify-between">
              <div class="flex flex-wrap gap-3 items-end flex-1">
                <div class="flex-1 min-w-64 max-w-md">
                  <label class="block text-xs font-medium text-gray-600 mb-1">
                    <i class="fas fa-search mr-1"></i>検索
                  </label>
                  <input type="text" id="searchInputTable" 
                    placeholder="納品番号、得意先名、備考で検索..."
                    class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
              </div>
              <div class="w-36">
                <label class="block text-xs font-medium text-gray-600 mb-1">ステータス</label>
                <select id="statusFilter" class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
                  <option value="">すべて</option>
                  <option value="draft">作成中</option>
                  <option value="pending">未送付</option>
                  <option value="delivered">納品済</option>
                  <option value="invoiced">請求済</option>
                </select>
              </div>
              <div class="w-36">
                <label class="block text-xs font-medium text-gray-600 mb-1">年月</label>
                <input type="month" id="monthFilter" 
                  class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
              </div>
              <button type="button" id="clearFiltersBtn" 
                class="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm transition-colors" 
                title="検索をクリア">
                <i class="fas fa-times"></i>
              </button>
            </div>
            <div class="flex gap-2">
              <button id="fromEstimateBtnTable" class="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg">
                <i class="fas fa-file-import mr-2"></i>見積から作成
              </button>
              <button id="newDeliveryBtnTable" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg">
                <i class="fas fa-plus mr-2"></i>新規作成
              </button>
            </div>
          </div>
        </div>
        </div>
        
        <div class="bg-white rounded-lg shadow overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">納品番号</th>
                  <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">納品日</th>
                  <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">得意先</th>
                  <th class="px-4 py-3 text-right text-sm font-medium text-gray-700">合計金額</th>
                  <th class="px-4 py-3 text-center text-sm font-medium text-gray-700">ステータス</th>
                  <th class="px-4 py-3 text-center text-sm font-medium text-gray-700">操作</th>
                </tr>
              </thead>
              <tbody id="deliveryTableBody" class="divide-y">
                {/* 動的に生成 */}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 詳細表示: 2カラムレイアウト（サイドバー + フォーム） */}
      <div id="detailView" class="hidden">
        <div class="flex gap-4">
          {/* 左サイドバー（折りたたみ時） */}
          <div id="sidebarCollapsed" class="w-12 flex-shrink-0">
            <div class="bg-white rounded-lg shadow p-2 sticky top-4">
              <button id="expandSidebarBtn" class="w-full text-center py-2 text-gray-600 hover:text-blue-600" title="サイドバーを開く">
                <i class="fas fa-chevron-right"></i>
              </button>
              <div class="border-t my-2"></div>
              <button id="backToTableBtnCollapsed" class="w-full text-center py-2 text-gray-600 hover:text-blue-600" title="一覧に戻る">
                <i class="fas fa-th-list"></i>
              </button>
            </div>
          </div>
          
          {/* 左サイドバー（展開時） */}
          <div id="sidebarExpanded" class="w-80 flex-shrink-0 hidden sticky top-4 self-start" data-subsidebar="deliveries">
            {/* 検索 */}
            <div class="bg-white rounded-lg shadow mb-4">
              <div class="p-3">
                <div class="flex items-center justify-between mb-2">
                  <button id="backToTableBtn" class="text-sm text-slate-700 hover:text-slate-900" title="一覧に戻る">
                    <i class="fas fa-th-list mr-1"></i>一覧に戻る
                  </button>
                  <button id="collapseSidebarBtn" class="text-sm text-slate-700 hover:text-slate-900" title="サイドバーを閉じる">
                    <i class="fas fa-times mr-1"></i>閉じる
                  </button>
                </div>
                <input type="text" id="sidebarSearch" placeholder="検索..." 
                  class="w-full border rounded px-2 py-1 text-sm" />
              </div>
            </div>
            
            {/* 最近編集した納品 */}
            <div class="bg-white rounded-lg shadow mb-4" id="recentDeliveriesSection">
              <div class="p-3 border-b bg-gray-50 flex items-center justify-between cursor-pointer" id="recentToggle" data-recent-toggle="deliveries">
                <h3 class="text-slate-700 text-sm font-medium">
                  <i class="fas fa-clock mr-2 text-orange-500 text-sm"></i>最近編集
                </h3>
                <i class="fas fa-chevron-down text-gray-400 text-xs transition-transform duration-200" id="recentToggleIcon" data-recent-chevron="deliveries"></i>
              </div>
              <div id="recentDeliveries" class="p-2 space-y-1 max-h-48 overflow-y-auto" data-recent-body="deliveries">
                {/* 動的に生成 */}
              </div>
            </div>
            
            {/* 納品一覧 */}
            <div class="bg-white rounded-lg shadow">
              <div class="p-3 border-b bg-gray-50 flex items-center justify-between">
                <h3 class="text-slate-700 text-sm font-medium">
                  <i class="fas fa-truck mr-2 text-green-600 text-sm"></i>納品一覧
                </h3>
              </div>
              <div class="p-2">
                <div id="sidebarDeliveryList" class="max-h-[calc(100vh-220px)] overflow-y-auto space-y-1">
                  {/* 動的に生成 */}
                </div>
              </div>
            </div>
          </div>

          {/* 右側フォーム */}
          <div class="flex-1">
            <div class="bg-white rounded-lg shadow">
              {/* ヘッダー - 固定 */}
              <div class="sticky top-0 z-10 p-4 border-b bg-gradient-to-r from-green-50 to-teal-50 flex items-center justify-between rounded-t-lg flex-wrap gap-2 shadow-sm">
                <h2 id="formTitle" class="text-xl font-bold text-gray-800">
                  <i class="fas fa-truck mr-2 text-green-600"></i>新規納品作成
                </h2>
                <div class="flex gap-2 flex-wrap">
                  <button type="button" id="newDeliveryBtnDetail" class="hidden bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-sm">
                    <i class="fas fa-plus mr-1"></i>新規
                  </button>
                  <button type="button" id="duplicateDeliveryBtn" class="hidden bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg text-sm">
                    <i class="fas fa-copy mr-1"></i>複製
                  </button>
                  <button type="button" id="deleteDeliveryBtn" class="hidden bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-sm">
                    <i class="fas fa-trash-alt mr-1"></i>削除
                  </button>
                  <span id="pageUnsavedIndicator" class="text-sm text-red-600 font-semibold hidden">●未保存</span>
                  <button type="button" id="saveDeliveryBtn" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-sm font-bold">
                    <i class="fas fa-save mr-1"></i>保存
                  </button>
                  <button type="button" id="pdfDeliveryBtn" class="hidden bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded-lg text-sm font-bold">
                    <i class="fas fa-file-pdf mr-1"></i>PDF出力
                  </button>
                </div>
              </div>

              <form id="deliveryForm" class="p-6" data-track-unsaved="true">
                {/* 基本情報 */}
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div class="md:col-span-1">
                    <label class="block text-sm font-medium text-gray-700 mb-1">納品番号 *</label>
                    <div class="flex gap-1">
                      <input type="text" name="delivery_no"
                        class="flex-1 min-w-0 border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <p class="text-xs text-gray-500 mt-1">未入力のまま保存すると自動採番されます。</p>
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">納品日 *</label>
                    <input type="date" name="delivery_date"
                      class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">ステータス</label>
                    <select name="status" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500">
                      <option value="draft">作成中</option>
                      <option value="pending">未送付</option>
                      <option value="delivered">納品済</option>
                      <option value="invoiced">請求済</option>
                    </select>
                  </div>
                </div>

                {/* 得意先選択 */}
                <div class="mb-6 p-4 bg-gray-50 rounded-lg">
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-1">得意先 *</label>
                      {/* テキスト入力でサジェスト */}
                      <div class="relative">
                        <div class="flex gap-2">
                          <div class="flex-1 relative">
                            <input type="text" id="clientSearchInput" placeholder="取引先名・コードで検索..."
                              class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" autocomplete="off" />
                            <div id="clientSuggestList" class="absolute z-50 w-full bg-white border rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto hidden">
                              {/* サジェスト候補がここに表示される */}
                            </div>
                          </div>
                          <button type="button" id="clientSelectToggle" class="bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-lg text-gray-600" title="一覧から選択">
                            <i class="fas fa-chevron-down"></i>
                          </button>
                        </div>
                        {/* 従来のプルダウン（非表示だがフォーム送信用） */}
                        <select name="client_id" id="clientSelect" class="hidden">
                          <option value="">得意先を選択...</option>
                        </select>
                        {/* 選択された得意先の表示 */}
                        <div id="selectedClientDisplay" class="hidden mt-2 p-2 bg-gray-50 rounded-lg flex items-center justify-between">
                          <span id="selectedClientName" class="font-medium text-gray-700"></span>
                          <button type="button" id="clearClientBtn" class="text-blue-600 hover:text-blue-800 text-sm">
                            <i class="fas fa-times"></i> クリア
                          </button>
                        </div>
                      </div>
                    </div>
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-1">件名</label>
                      <input type="text" name="subject" placeholder="例: 商品納品"
                        class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                  {/* 得意先情報表示 */}
                  <div id="clientInfo" class="mt-3 text-sm text-gray-600 hidden">
                    <div class="flex flex-wrap gap-4">
                      <span id="clientClosingInfo"></span>
                    </div>
                  </div>
                </div>

                {/* 明細テーブル */}
                <div class="mb-6">
                  <div class="flex items-center justify-between mb-2">
                    <h3 class="font-bold text-gray-700">
                      <i class="fas fa-list mr-2 text-green-600"></i>明細
                    </h3>
                    <button type="button" id="addItemBtn" class="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-sm">
                      <i class="fas fa-plus mr-1"></i>明細追加
                    </button>
                  </div>
                  <div class="overflow-x-auto border rounded-lg">
                    <table class="w-full text-sm">
                      <thead id="itemsTableHead" class="bg-gray-100">
                        <tr>
                          <th class="px-2 py-2 text-left w-12" title="ドラッグで並び替え可能"><i class="fas fa-grip-vertical text-gray-400 mr-1"></i>#</th>
                          <th class="px-2 py-2 text-left min-w-48">商品名</th>
                          <th class="px-2 py-2 text-right w-28">単価</th>
                          <th class="px-2 py-2 text-center w-20">数量</th>
                          <th class="px-2 py-2 text-center w-20">税率</th>
                          <th class="px-2 py-2 text-right w-28">金額</th>
                          <th class="px-2 py-2 text-left w-32">備考</th>
                          <th class="px-2 py-2 w-10"></th>
                        </tr>
                      </thead>
                      <tbody id="itemsTableBody">
                        {/* 動的に生成 */}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 合計金額 */}
                <div class="flex justify-end mb-6">
                  <div class="w-72 bg-gray-50 rounded-lg p-4">
                    <div class="flex justify-between py-2 border-b">
                      <span id="subtotalLabel" class="text-gray-600">小計</span>
                      <span id="subtotalDisplay" class="font-bold">¥0</span>
                    </div>
                    <div id="taxSection" style="display: none;">
                      <div id="taxBreakdown" class="text-sm">
                        {/* 税率別の内訳が入る */}
                      </div>
                      <div class="flex justify-between py-2 border-b">
                        <span class="text-gray-600">消費税</span>
                        <span id="taxDisplay" class="font-bold">¥0</span>
                      </div>
                    </div>
                    <div class="flex justify-between py-3 text-lg">
                      <span id="totalLabel" class="font-bold text-gray-800">合計</span>
                      <span id="totalDisplay" class="font-bold text-green-600">¥0</span>
                    </div>
                  </div>
                </div>

                {/* 備考 */}
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">
                    <i class="fas fa-sticky-note mr-1 text-yellow-500"></i>備考
                  </label>
                  <textarea name="notes" rows={3} placeholder="納品書に印刷される備考欄"
                    class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"></textarea>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* 商品選択モーダル */}
      <div id="productModal" class="fixed inset-0 bg-black bg-opacity-50 hidden z-50 flex items-center justify-center">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
          <div class="p-4 border-b bg-gray-50 flex items-center justify-between">
            <h3 class="font-bold text-gray-800">
              <i class="fas fa-box mr-2 text-blue-600"></i>商品を選択
            </h3>
            <button type="button" id="closeProductModal" class="text-gray-500 hover:text-gray-700">
              <i class="fas fa-times text-xl"></i>
            </button>
          </div>
          <div class="p-4">
            <div class="flex gap-2 mb-4">
              <input type="text" id="productSearchInput" placeholder="商品名・コードで検索..."
                class="flex-1 border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
              <select id="productCategoryFilter" class="border rounded-lg px-3 py-2">
                <option value="">全カテゴリ</option>
              </select>
            </div>
            <div id="productList" class="max-h-[calc(100vh-260px)] overflow-y-auto space-y-2 pb-12">
              {/* 動的に生成 */}
            </div>
          </div>
        </div>
      </div>

      {/* 見積選択モーダル */}
      <div id="estimateModal" class="fixed inset-0 bg-black bg-opacity-50 hidden z-50 flex items-center justify-center">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] overflow-hidden">
          <div class="p-4 border-b bg-gradient-to-r from-purple-50 to-indigo-50 flex items-center justify-between">
            <h3 class="font-bold text-gray-800">
              <i class="fas fa-file-invoice mr-2 text-purple-600"></i>見積から納品書を作成
            </h3>
            <button type="button" id="closeEstimateModal" class="text-gray-500 hover:text-gray-700">
              <i class="fas fa-times text-xl"></i>
            </button>
          </div>
          <div class="p-4">
            <div class="flex gap-2 mb-4">
              <input type="text" id="estimateSearchInput" placeholder="見積番号、得意先名で検索..."
                class="flex-1 border rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500" />
              <select id="estimateStatusFilter" class="border rounded-lg px-3 py-2">
                <option value="">すべて</option>
                <option value="accepted" selected>受注のみ</option>
                <option value="sent">送付済</option>
                <option value="pending">未送付</option>
              </select>
            </div>
            <p class="text-sm text-gray-500 mb-3">
              <i class="fas fa-info-circle mr-1"></i>
              見積を選択すると、明細がコピーされた新規納品書が作成されます
            </p>
            <div id="estimateList" class="max-h-96 overflow-y-auto space-y-2">
              {/* 動的に生成 */}
            </div>
          </div>
        </div>
      </div>

      <script dangerouslySetInnerHTML={{__html: `
        ${docHeaderTitleHelpers}
        ${taxRateHelpers}
        ${taxRateHelpers}
        ${recentAccordionScript}
        // 状態管理
        var currentDeliveryId = null;
        var originalDeliveryStatus = null;
        var deliveries = [];
        var clients = [];
        var products = [];
        var categories = [];
        var items = [];
        var estimates = [];
        var formChanged = false; if (window.SmartBill) window.SmartBill.formChanged = false;
        var currentItemIndex = null;
        var selectedClient = null;
        var lastSelectedClientId = localStorage.getItem('lastSelectedClientId');
        var companySettings = {};  // 自社設定（消費税表示設定など）
        var showTax = false;  // 消費税を表示するかどうか
        var currentHeaderMode = null;
        var currentHeaderIconHtml = '';

        function setFormHeaderMode(mode, iconHtml) {
          currentHeaderMode = mode;
          currentHeaderIconHtml = iconHtml || '';
        }

        function getCurrentClientLabel() {
          if (selectedClient) return getClientDisplayLabel(selectedClient);
          var selectedName = document.getElementById('selectedClientName');
          return selectedName ? normalizeHeaderText(selectedName.textContent) : '';
        }

        function updateFormHeaderTitle() {
          if (currentHeaderMode !== 'new' && currentHeaderMode !== 'edit') return;
          var titleEl = document.getElementById('formTitle');
          if (!titleEl) return;
          var docNoInput = document.querySelector('[name="delivery_no"]');
          var docNo = normalizeHeaderText(docNoInput ? docNoInput.value : '');
          var clientLabel = getCurrentClientLabel();
          var titleText = buildDocHeaderTitle({
            docTypeLabel: '納品',
            mode: currentHeaderMode,
            clientLabel: clientLabel,
            docNo: docNo
          });
          if (!titleText) return;
          titleEl.innerHTML = (currentHeaderIconHtml || '') + titleText;
        }

        function updateDeliverySummaryLabels() {
          var subtotalLabel = document.getElementById('subtotalLabel');
          var totalLabel = document.getElementById('totalLabel');
          if (!subtotalLabel || !totalLabel) return;
          if (showTax) {
            subtotalLabel.textContent = '小計（税抜）';
            totalLabel.textContent = '合計（税込）';
          } else {
            subtotalLabel.textContent = '小計';
            totalLabel.textContent = '合計';
          }
        }

        function isShowTaxOnDelivery(companyInfo) {
          var setting = companyInfo && companyInfo.show_tax_on_estimate_delivery;
          return Number(setting != null ? setting : 1) === 1;
        }

        function getDeliveryListDisplayTotal(delivery, companyInfo) {
          var showTaxOn = isShowTaxOnDelivery(companyInfo);
          var subtotal = delivery && delivery.subtotal != null
            ? delivery.subtotal
            : (delivery && delivery.total_amount != null && delivery.tax_amount != null
              ? delivery.total_amount - delivery.tax_amount
              : 0);
          var total = delivery && delivery.total_amount != null
            ? delivery.total_amount
            : (delivery && delivery.tax_amount != null ? subtotal + delivery.tax_amount : subtotal);
          return showTaxOn ? Number(total != null ? total : 0) : Number(subtotal != null ? subtotal : 0);
        }

        function getDeliveryListTotalHeaderLabel(companyInfo) {
          return isShowTaxOnDelivery(companyInfo) ? '合計金額' : '合計金額（税抜）';
        }

        function updateDeliveryListTotalHeader() {
          var tbody = document.getElementById('deliveryTableBody');
          if (!tbody) return;
          var table = tbody.closest ? tbody.closest('table') : null;
          if (!table) {
            var parent = tbody.parentElement;
            while (parent && parent.tagName !== 'TABLE') {
              parent = parent.parentElement;
            }
            table = parent;
          }
          if (!table) return;
          var headerCell = table.querySelector('thead th:nth-child(4)');
          if (headerCell) {
            headerCell.textContent = getDeliveryListTotalHeaderLabel(companySettings);
          }
        }
        
        // 初期化
        async function init() {
          await Promise.all([
            loadDeliveries(),
            loadClients(),
            loadProducts(),
            loadCategories(),
            loadRecentDeliveries(),
            loadCompanySettings()
          ]);
          
          var params = new URLSearchParams(window.location.search || '');
          var isNewAction = params.get('action') === 'new' || window.location.pathname.endsWith('/new');
          if (isNewAction) {
            await newDelivery();
          } else {
            // 今日の日付をデフォルト設定
            var today = new Date().toISOString().split('T')[0];
            document.querySelector('[name="delivery_date"]').value = today;
            
            // 空の明細行を1つ追加
            addItemRow();
          }
          
          setupEventListeners();
        }
        
        // データ読み込み
        async function loadDeliveries(search, status, month) {
          var url = '/api/deliveries';
          var params = [];
          if (search) params.push('search=' + encodeURIComponent(search));
          if (status) params.push('status=' + encodeURIComponent(status));
          if (month) params.push('month=' + encodeURIComponent(month));
          if (params.length > 0) url += '?' + params.join('&');
          
          var res = await axios.get(url);
          deliveries = res.data;
          renderDeliveryTable();
          renderSidebarDeliveries();
        }
        
        async function loadClients() {
          var res = await axios.get('/api/clients');
          clients = res.data;
          var select = document.getElementById('clientSelect');
          select.innerHTML = '<option value="">得意先を選択...</option>' +
            clients.map(function(c) {
              return '<option value="' + c.id + '">' + c.client_name + '</option>';
            }).join('');
        }
        
        async function loadCompanySettings() {
          var res = await axios.get('/api/company');
          companySettings = res.data || {};
          updateDeliveryListTotalHeader();
          updateDeliverySummaryLabels();
          updateTaxDisplay(document.getElementById('clientSelect').value || null);
          renderDeliveryTable();
          renderSidebarDeliveries();
        }
        
        // 消費税表示を切り替える（納品）
        function updateTaxDisplay(clientId) {
          var client = clients.find(function(c) { return c.id == clientId; });
          var clientSetting = client ? client.tax_display_setting : 'default';
          
          // 優先順位: 取引先設定 > 自社設定
          if (clientSetting === 'show') {
            showTax = true;
          } else if (clientSetting === 'hide') {
            showTax = false;
          } else {
            // 自社設定に従う
            showTax = companySettings.show_tax_on_estimate_delivery === 1;
          }
          
          // UIを更新
          var taxSection = document.getElementById('taxSection');
          if (taxSection) {
            taxSection.style.display = showTax ? 'block' : 'none';
          }
          
          updateDeliverySummaryLabels();
          // 合計を再計算
          calculateTotals();
        }
        
        // 得意先サジェスト機能（納品）
        function showClientSuggest(searchText) {
          var suggestList = document.getElementById('clientSuggestList');
          
          if (!searchText || searchText.length === 0) {
            var filtered = clients.slice(0, 20);
          } else {
            var lowerSearch = searchText.toLowerCase();
            var filtered = clients.filter(function(c) {
              var nameMatch = c.client_name && c.client_name.toLowerCase().includes(lowerSearch);
              var codeMatch = c.client_code && c.client_code.toLowerCase().includes(lowerSearch);
              return nameMatch || codeMatch;
            }).slice(0, 20);
          }
          
          if (filtered.length === 0) {
            suggestList.innerHTML = '<div class="p-3 text-gray-500 text-sm">該当する取引先がありません</div>';
          } else {
            suggestList.innerHTML = filtered.map(function(c) {
              var codeDisplay = c.client_code ? '<span class="text-gray-400 text-xs ml-2">' + c.client_code + '</span>' : '';
              return '<div class="client-suggest-item p-2 hover:bg-blue-50 cursor-pointer border-b last:border-b-0" data-id="' + c.id + '">' +
                '<span class="font-medium">' + c.client_name + '</span>' + codeDisplay +
                '</div>';
            }).join('');
            
            suggestList.querySelectorAll('.client-suggest-item').forEach(function(el) {
              el.addEventListener('click', function() {
                var clientId = parseInt(this.getAttribute('data-id'));
                selectClient(clientId);
              });
            });
          }
          
          suggestList.classList.remove('hidden');
        }
        
        function hideClientSuggest() {
          document.getElementById('clientSuggestList').classList.add('hidden');
        }
        
        function selectClient(clientId) {
          var client = clients.find(function(c) { return c.id === clientId; });
          if (!client) return;
          
          document.getElementById('clientSelect').value = clientId;
          var codeDisplay = client.client_code ? ' (' + client.client_code + ')' : '';
          document.getElementById('clientSearchInput').value = client.client_name + codeDisplay;
          document.getElementById('selectedClientName').textContent = client.client_name + codeDisplay;
          document.getElementById('selectedClientDisplay').classList.remove('hidden');
          
          // 最後に選んだ得意先を記憶
          localStorage.setItem('lastSelectedClientId', clientId);
          lastSelectedClientId = clientId;
          
          // 消費税表示を更新
          updateTaxDisplay(clientId);
          
          hideClientSuggest();
          onClientChange();
          formChanged = true; if (window.SmartBill) window.SmartBill.formChanged = true;
        }
        
        function clearClientSelection() {
          document.getElementById('clientSelect').value = '';
          document.getElementById('clientSearchInput').value = '';
          document.getElementById('selectedClientDisplay').classList.add('hidden');
          document.getElementById('selectedClientName').textContent = '';
          selectedClient = null;
          document.getElementById('clientInfo').classList.add('hidden');
          // 消費税表示をデフォルトに戻す
          updateTaxDisplay(null);
          updateFormHeaderTitle();
          formChanged = true; if (window.SmartBill) window.SmartBill.formChanged = true;
        }
        
        async function loadProducts() {
          var res = await axios.get('/api/products');
          products = res.data;
        }
        
        async function loadCategories() {
          var res = await axios.get('/api/categories');
          categories = res.data;
          var select = document.getElementById('productCategoryFilter');
          select.innerHTML = '<option value="">全カテゴリ</option>' +
            categories.map(function(c) {
              return '<option value="' + c.id + '">' + c.category_name + '</option>';
            }).join('');
        }
        
        async function loadRecentDeliveries() {
          var res = await axios.get('/api/deliveries/recent?limit=5');
          var container = document.getElementById('recentDeliveries');
          if (res.data.length === 0) {
            container.innerHTML = '<p class="text-xs text-gray-400 p-2">最近の編集はありません</p>';
            return;
          }
          container.innerHTML = res.data.map(function(d) {
            var displayNo = d.delivery_no || '';
            return '<div class="p-2 hover:bg-gray-50 rounded cursor-pointer text-xs border-b delivery-item" data-id="' + d.id + '">' +
              '<div class="font-medium text-gray-800">' + displayNo + '</div>' +
              '<div class="text-gray-500">' + (d.client_name || '得意先未設定') + '</div>' +
              '</div>';
          }).join('');
        }
        
        // テーブル描画
        function renderDeliveryTable() {
          var tbody = document.getElementById('deliveryTableBody');
          if (deliveries.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-gray-500">納品データがありません</td></tr>';
            return;
          }
          tbody.innerHTML = deliveries.map(function(d) {
            var statusSelect = getStatusSelect(d.id, d.status);
            var displayNo = d.delivery_no || '';
            var displayTotal = getDeliveryListDisplayTotal(d, companySettings);
            return '<tr class="hover:bg-gray-50 delivery-row" data-id="' + d.id + '">' +
              '<td class="px-4 py-3 font-medium text-green-600 cursor-pointer delivery-cell" data-id="' + d.id + '">' + displayNo + '</td>' +
              '<td class="px-4 py-3 cursor-pointer delivery-cell" data-id="' + d.id + '">' + d.delivery_date + '</td>' +
              '<td class="px-4 py-3 cursor-pointer delivery-cell" data-id="' + d.id + '">' + (d.client_name || '-') + '</td>' +
              '<td class="px-4 py-3 text-right font-bold cursor-pointer delivery-cell" data-id="' + d.id + '">¥' + displayTotal.toLocaleString() + '</td>' +
              '<td class="px-4 py-3 text-center">' + statusSelect + '</td>' +
              '<td class="px-4 py-3 text-center">' +
              '<button class="text-blue-600 hover:text-blue-800 edit-btn" data-id="' + d.id + '"><i class="fas fa-edit"></i></button>' +
              '</td></tr>';
          }).join('');
          
          // ステータス変更イベント設定
          tbody.querySelectorAll('.status-select').forEach(function(select) {
            select.addEventListener('change', function(e) {
              e.stopPropagation();
              var id = parseInt(this.getAttribute('data-id'));
              var newStatus = this.value;
              changeDeliveryStatus(id, newStatus);
            });
            select.addEventListener('click', function(e) {
              e.stopPropagation();
            });
          });
          
          // 行クリックで編集
          tbody.querySelectorAll('.delivery-cell').forEach(function(cell) {
            cell.addEventListener('click', function() {
              var id = parseInt(this.getAttribute('data-id'));
              editDelivery(id);
            });
          });
          updateDeliveryListTotalHeader();
        }
        
        // ステータス選択プルダウン生成
        function getStatusSelect(id, currentStatus) {
          var options = [
            { value: 'draft', label: '作成中', color: 'text-gray-700' },
            { value: 'pending', label: '未送付', color: 'text-yellow-700' },
            { value: 'delivered', label: '納品済', color: 'text-blue-700' },
            { value: 'invoiced', label: '請求済', color: 'text-green-700' }
          ];
          
          var bgColors = {
            'draft': 'bg-gray-100',
            'pending': 'bg-yellow-100',
            'delivered': 'bg-blue-100',
            'invoiced': 'bg-green-100'
          };
          
          var optionsHtml = options.map(function(opt) {
            return '<option value="' + opt.value + '"' + (opt.value === currentStatus ? ' selected' : '') + '>' + opt.label + '</option>';
          }).join('');
          
          return '<select class="status-select px-2 py-1 rounded-full text-xs font-medium border-0 cursor-pointer ' + (bgColors[currentStatus] || 'bg-gray-100') + '" data-id="' + id + '">' + optionsHtml + '</select>';
        }
        
        // ステータス変更処理
        async function changeDeliveryStatus(id, newStatus) {
          try {
            await axios.patch('/api/deliveries/' + id + '/status', { status: newStatus });
            
            var delivery = deliveries.find(function(d) { return d.id === id; });
            if (delivery) {
              delivery.status = newStatus;
            }
            
            renderDeliveryTable();
          } catch (e) {
            alert('ステータスの変更に失敗しました');
            console.error(e);
            loadDeliveries();
          }
        }
        
        function getStatusBadge(status) {
          var colors = {
            'draft': 'bg-gray-100 text-gray-700',
            'pending': 'bg-yellow-100 text-yellow-700',
            'delivered': 'bg-blue-100 text-blue-700',
            'invoiced': 'bg-green-100 text-green-700'
          };
          var labels = {
            'draft': '作成中',
            'pending': '未送付',
            'delivered': '納品済',
            'invoiced': '請求済'
          };
          return '<span class="px-2 py-1 rounded-full text-xs font-medium ' + (colors[status] || colors['draft']) + '">' + (labels[status] || '作成中') + '</span>';
        }
        
        function getStatusLabel(status) {
          var labels = {
            'draft': '作成中',
            'pending': '未送付',
            'delivered': '納品済',
            'invoiced': '請求済'
          };
          return labels[status] || '作成中';
        }
        
        function renderSidebarDeliveries() {
          var container = document.getElementById('sidebarDeliveryList');
          if (deliveries.length === 0) {
            container.innerHTML = '<p class="text-xs text-gray-400 p-2">納品データがありません</p>';
            return;
          }
          container.innerHTML = deliveries.slice(0, 20).map(function(d) {
            var isActive = currentDeliveryId === d.id;
            var displayNo = d.delivery_no || '';
            var displayTotal = getDeliveryListDisplayTotal(d, companySettings);
            return '<div class="p-2 rounded cursor-pointer text-xs border-b delivery-item ' + (isActive ? 'bg-green-100 border-green-300' : 'hover:bg-gray-50') + '" data-id="' + d.id + '">' +
              '<div class="font-medium ' + (isActive ? 'text-green-800' : 'text-gray-800') + '">' + displayNo + '</div>' +
              '<div class="text-gray-500 flex justify-between">' +
              '<span>' + (d.client_name || '得意先未設定') + '</span>' +
              '<span>¥' + displayTotal.toLocaleString() + '</span>' +
              '</div></div>';
          }).join('');
        }
        
        // サイドバー折りたたみ
        var sidebarCollapsed = true;
        
        function toggleSidebar(collapsed) {
          sidebarCollapsed = collapsed;
          var collapsedDiv = document.getElementById('sidebarCollapsed');
          var expandedDiv = document.getElementById('sidebarExpanded');
          
          if (collapsed) {
            collapsedDiv.classList.remove('hidden');
            expandedDiv.classList.add('hidden');
          } else {
            collapsedDiv.classList.add('hidden');
            expandedDiv.classList.remove('hidden');
          }
        }
        
        // 明細行の管理
        function addItemRow(item) {
          var index = items.length;
          items.push(item || { product_id: null, product_name: '', quantity: 1, unit_price: 0, tax_rate: 10, notes: '' });
          renderItemsTable();
        }
        
        function removeItemRow(index) {
          items.splice(index, 1);
          renderItemsTable();
          calculateTotals();
        }
        
        function renderItemsTable() {
          var tbody = document.getElementById('itemsTableBody');
          
          tbody.innerHTML = items.map(function(item, index) {
            var amount = item.quantity * item.unit_price;
            var rateValue = normalizeTaxRate(item.tax_rate, 10);
            var customRateOption = '';
            if (rateValue !== 10 && rateValue !== 8 && rateValue !== 0) {
              customRateOption = '<option value="' + rateValue + '" selected>' + rateValue + '%</option>';
            }
            return '<tr class="border-b hover:bg-gray-50 item-row" data-index="' + index + '">' +
              '<td class="px-2 py-2 text-gray-500">' +
              '<span class="drag-handle mr-1" title="ドラッグで並び替え"><i class="fas fa-grip-vertical"></i></span>' +
              (index + 1) + '</td>' +
              '<td class="px-2 py-2">' +
              '<div class="flex gap-1">' +
              '<input type="text" class="item-product-name flex-1 border rounded px-2 py-1 text-sm" value="' + (item.product_name || '') + '" placeholder="商品名を入力..." />' +
              '<button type="button" class="select-product-btn bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded text-xs" data-index="' + index + '"><i class="fas fa-search"></i></button>' +
              '</div></td>' +
              '<td class="px-2 py-2"><input type="number" class="item-unit-price w-full border rounded px-2 py-1 text-sm text-right" value="' + item.unit_price + '" /></td>' +
              '<td class="px-2 py-2"><input type="number" class="item-quantity w-full border rounded px-2 py-1 text-sm text-center" value="' + item.quantity + '" min="1" /></td>' +
              '<td class="px-2 py-2">' +
              '<select class="item-tax-rate w-full border rounded px-1 py-1 text-sm">' +
              customRateOption +
              '<option value="10"' + (rateValue == 10 ? ' selected' : '') + '>10%</option>' +
              '<option value="8"' + (rateValue == 8 ? ' selected' : '') + '>8%</option>' +
              '<option value="0"' + (rateValue == 0 ? ' selected' : '') + '>0%</option>' +
              '</select></td>' +
              '<td class="px-2 py-2 text-right font-medium">¥' + amount.toLocaleString() + '</td>' +
              '<td class="px-2 py-2"><input type="text" class="item-notes w-full border rounded px-2 py-1 text-sm" value="' + (item.notes || '') + '" placeholder="備考" /></td>' +
              '<td class="px-2 py-2"><button type="button" class="remove-item-btn text-red-500 hover:text-red-700" data-index="' + index + '"><i class="fas fa-times"></i></button></td>' +
              '</tr>';
          }).join('');
          
          // Sortable.js初期化（ドラッグ&ドロップ）
          if (typeof Sortable !== 'undefined') {
            new Sortable(tbody, {
              handle: '.drag-handle',
              animation: 150,
              ghostClass: 'sortable-ghost',
              chosenClass: 'sortable-chosen',
              onEnd: function(evt) {
                var movedItem = items.splice(evt.oldIndex, 1)[0];
                items.splice(evt.newIndex, 0, movedItem);
                formChanged = true; if (window.SmartBill) window.SmartBill.formChanged = true;
                renderItemsTable();
                calculateTotals();
              }
            });
          }
          
          // イベント設定
          tbody.querySelectorAll('.item-product-name').forEach(function(input, idx) {
            input.addEventListener('change', function() { items[idx].product_name = this.value; formChanged = true; if (window.SmartBill) window.SmartBill.formChanged = true; });
          });
          tbody.querySelectorAll('.item-unit-price').forEach(function(input, idx) {
            input.addEventListener('change', function() {
              items[idx].unit_price = parseFloat(this.value) || 0;
              formChanged = true; if (window.SmartBill) window.SmartBill.formChanged = true;
              renderItemsTable();
              calculateTotals();
            });
          });
          tbody.querySelectorAll('.item-quantity').forEach(function(input, idx) {
            input.addEventListener('change', function() { items[idx].quantity = parseInt(this.value) || 1; formChanged = true; if (window.SmartBill) window.SmartBill.formChanged = true; calculateTotals(); renderItemsTable(); });
          });
          tbody.querySelectorAll('.item-tax-rate').forEach(function(select, idx) {
            select.addEventListener('change', function() { items[idx].tax_rate = parseFloat(this.value); formChanged = true; if (window.SmartBill) window.SmartBill.formChanged = true; calculateTotals(); });
          });
          tbody.querySelectorAll('.item-notes').forEach(function(input, idx) {
            input.addEventListener('change', function() { items[idx].notes = this.value; formChanged = true; if (window.SmartBill) window.SmartBill.formChanged = true; });
          });
          tbody.querySelectorAll('.select-product-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
              currentItemIndex = parseInt(this.getAttribute('data-index'));
              openProductModal();
            });
          });
          tbody.querySelectorAll('.remove-item-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
              var idx = parseInt(this.getAttribute('data-index'));
              removeItemRow(idx);
            });
          });
        }
        
        // 金額計算
        function calculateTotals() {
          var subtotal = 0;
          var taxByRate = {};
          
          items.forEach(function(item) {
            var amount = item.quantity * item.unit_price;
            subtotal += amount;
            
            // 税率0%に対応：nullやundefinedの場合のみデフォルト10%
            var rate = normalizeTaxRate(item.tax_rate, 10);
            if (!taxByRate[rate]) taxByRate[rate] = 0;
            taxByRate[rate] += Math.floor(amount * rate / 100);
          });
          
          var totalTax = 0;
          var taxBreakdownHtml = '';
          Object.keys(taxByRate).sort(function(a, b) { return parseFloat(a) - parseFloat(b); }).forEach(function(rate) {
            var rateNum = parseFloat(rate);
            totalTax += taxByRate[rate];
            if (rateNum === 0) {
              taxBreakdownHtml += '<div class="flex justify-between py-1 text-xs text-gray-500">' +
                '<span>非課税</span><span>¥0</span></div>';
            } else {
              taxBreakdownHtml += '<div class="flex justify-between py-1 text-xs text-gray-500">' +
                '<span>消費税(' + rateNum + '%)</span><span>¥' + taxByRate[rate].toLocaleString() + '</span></div>';
            }
          });
          
          document.getElementById('subtotalDisplay').textContent = '¥' + subtotal.toLocaleString();
          document.getElementById('taxBreakdown').innerHTML = taxBreakdownHtml;
          document.getElementById('taxDisplay').textContent = '¥' + totalTax.toLocaleString();
          
          // 消費税表示設定に基づいて合計を計算
          if (showTax) {
            document.getElementById('totalDisplay').textContent = '¥' + (subtotal + totalTax).toLocaleString();
          } else {
            document.getElementById('totalDisplay').textContent = '¥' + subtotal.toLocaleString();
          }
          updateDeliverySummaryLabels();
        }
        
        // 商品モーダル（納品データ入力）
        function openProductModal() {
          document.getElementById('productModal').classList.remove('hidden');
          renderProductList();
        }
        
        function closeProductModal() {
          document.getElementById('productModal').classList.add('hidden');
          currentItemIndex = null;
        }
        
        function renderProductList(search, categoryId) {
          var filtered = products.filter(function(p) {
            if (search && !p.product_name.includes(search) && !(p.product_code || '').includes(search)) return false;
            if (categoryId && p.category_id != categoryId) return false;
            return true;
          });
          
          var container = document.getElementById('productList');
          if (filtered.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-center py-4">商品が見つかりません</p>';
            return;
          }
          
          container.innerHTML = filtered.map(function(p) {
            return '<div class="p-3 border rounded-lg hover:bg-blue-50 cursor-pointer product-item" data-id="' + p.id + '">' +
              '<div class="flex justify-between">' +
              '<span class="font-medium">' + p.product_name + '</span>' +
              '<span class="text-sm text-gray-500">' + (p.product_code || '') + '</span>' +
              '</div>' +
              '<div class="text-sm text-gray-600 flex justify-between mt-1">' +
              '<span>' + (p.category_name || '') + '</span>' +
              '<span>¥' + (p.unit_price || 0).toLocaleString() + '</span>' +
              '</div></div>';
          }).join('');
          
          container.querySelectorAll('.product-item').forEach(function(el) {
            el.addEventListener('click', function() {
              var productId = parseInt(this.getAttribute('data-id'));
              selectProduct(productId);
            });
          });
        }
        
        function selectProduct(productId) {
          var product = products.find(function(p) { return p.id === productId; });
          if (!product || currentItemIndex === null) return;
          
          var quantity = product.min_lot || items[currentItemIndex].quantity || 1;
          
          var category = categories.find(function(c) { return c.id == product.category_id; }) || null;
          var resolvedTaxRate = resolveLineTaxRate({ product: product, category: category, fallback: 10 });
          items[currentItemIndex] = {
            product_id: product.id,
            product_name: product.product_name,
            quantity: quantity,
            unit_price: product.unit_price || 0,
            tax_rate: resolvedTaxRate,
            notes: product.remarks || '',
            unit: product.unit || '個'
          };
          
          formChanged = true; if (window.SmartBill) window.SmartBill.formChanged = true;
          closeProductModal();
          renderItemsTable();
          calculateTotals();
        }
        
        // 見積選択モーダル
        function openEstimateModal() {
          document.getElementById('estimateModal').classList.remove('hidden');
          loadEstimatesForModal('', 'accepted');
        }
        
        function closeEstimateModal() {
          document.getElementById('estimateModal').classList.add('hidden');
        }
        
        async function loadEstimatesForModal(search, status) {
          var url = '/api/estimates';
          var params = [];
          if (search) params.push('search=' + encodeURIComponent(search));
          if (status) params.push('status=' + encodeURIComponent(status));
          if (params.length > 0) url += '?' + params.join('&');
          
          var res = await axios.get(url);
          estimates = res.data;
          renderEstimateList();
        }
        
        function renderEstimateList() {
          var container = document.getElementById('estimateList');
          
          if (estimates.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-center py-8">該当する見積がありません</p>';
            return;
          }
          
          var statusLabels = {
            'draft': '作成中',
            'pending': '未送付',
            'sent': '送付済',
            'accepted': '受注',
            'rejected': '失注'
          };
          
          var statusColors = {
            'draft': 'bg-gray-100 text-gray-700',
            'pending': 'bg-yellow-100 text-yellow-700',
            'sent': 'bg-blue-100 text-blue-700',
            'accepted': 'bg-green-100 text-green-700',
            'rejected': 'bg-red-100 text-red-700'
          };
          
          container.innerHTML = estimates.map(function(e) {
            var statusBadge = '<span class="px-2 py-0.5 rounded-full text-xs font-medium ' + (statusColors[e.status] || statusColors['draft']) + '">' + (statusLabels[e.status] || '作成中') + '</span>';
            return '<div class="p-3 border rounded-lg hover:bg-purple-50 cursor-pointer estimate-item transition-colors" data-id="' + e.id + '">' +
              '<div class="flex justify-between items-start mb-1">' +
              '<span class="font-medium text-purple-700">' + e.estimate_no + '</span>' +
              statusBadge +
              '</div>' +
              '<div class="flex justify-between text-sm">' +
              '<span class="text-gray-600">' + (e.client_name || '得意先未設定') + '</span>' +
              '<span class="font-bold">¥' + (e.total_amount || 0).toLocaleString() + '</span>' +
              '</div>' +
              '<div class="text-xs text-gray-400 mt-1">' + e.estimate_date + (e.subject ? ' / ' + e.subject : '') + '</div>' +
              '</div>';
          }).join('');
          
          container.querySelectorAll('.estimate-item').forEach(function(el) {
            el.addEventListener('click', function() {
              var estimateId = parseInt(this.getAttribute('data-id'));
              createDeliveryFromEstimate(estimateId);
            });
          });
        }
        
        async function createDeliveryFromEstimate(estimateId) {
          try {
            // 見積の詳細を取得
            var res = await axios.get('/api/estimates/' + estimateId);
            var estimate = res.data;
            
            closeEstimateModal();
            
            // フォームをリセットして見積データを反映
            currentDeliveryId = null;
            document.getElementById('deliveryForm').reset();
            
            // 新規作成時は番号を空にする（保存時に採番）
            document.querySelector('[name="delivery_no"]').value = '';
            
            // 今日の日付
            var today = new Date().toISOString().split('T')[0];
            document.querySelector('[name="delivery_date"]').value = today;
            
            // 得意先を設定
            if (estimate.client_id) {
              document.getElementById('clientSelect').value = estimate.client_id;
              var client = clients.find(function(c) { return c.id == estimate.client_id; });
              if (client) {
                var codeDisplay = client.client_code ? ' (' + client.client_code + ')' : '';
                document.getElementById('selectedClientName').textContent = client.client_name + codeDisplay;
                document.getElementById('selectedClientDisplay').classList.remove('hidden');
                // 最後に選んだ得意先を記憶
                localStorage.setItem('lastSelectedClientId', estimate.client_id);
              }
            }
            
            // 件名を設定
            if (estimate.subject) {
              document.querySelector('[name="subject"]').value = estimate.subject;
            }
            
            // 明細をコピー
            items = (estimate.items || []).map(function(item) {
              return {
                product_id: item.product_id,
                product_name: item.product_name,
                quantity: item.quantity,
                unit_price: item.unit_price,
                tax_rate: normalizeTaxRate(item.tax_rate, 10),
                notes: item.notes || ''
              };
            });
            
            if (items.length === 0) addItemRow();
            
            setFormHeaderMode('custom', '<i class="fas fa-file-import mr-2 text-purple-600"></i>');
            document.getElementById('formTitle').innerHTML = '<i class="fas fa-file-import mr-2 text-purple-600"></i>見積から作成: ' + estimate.estimate_no;
            document.getElementById('deleteDeliveryBtn').classList.add('hidden');
            document.getElementById('duplicateDeliveryBtn').classList.add('hidden');
            document.getElementById('newDeliveryBtnDetail').classList.add('hidden');
            
            originalDeliveryStatus = null;
            onClientChange();
            renderItemsTable();
            calculateTotals();
            showDetailView();
            formChanged = true; if (window.SmartBill) window.SmartBill.formChanged = true;
            
            window.SmartBill.showSuccessDialog('見積「' + estimate.estimate_no + '」から納品書を作成しました');
          } catch (e) {
            alert('見積データの読み込みに失敗しました');
            console.error(e);
          }
        }
        
        // 得意先選択時
        function onClientChange() {
          var clientId = document.getElementById('clientSelect').value;
          var clientInfoDiv = document.getElementById('clientInfo');
          
          if (!clientId) {
            selectedClient = null;
            clientInfoDiv.classList.add('hidden');
            document.getElementById('selectedClientDisplay').classList.add('hidden');
            document.getElementById('selectedClientName').textContent = '';
            updateTaxDisplay(null);
            updateFormHeaderTitle();
            return;
          }
          
          selectedClient = clients.find(function(c) { return c.id == clientId; });
          if (!selectedClient) return;
          
          clientInfoDiv.classList.remove('hidden');
          var codeDisplay = selectedClient.client_code ? ' (' + selectedClient.client_code + ')' : '';
          document.getElementById('clientSearchInput').value = selectedClient.client_name + codeDisplay;
          var codeDisplay = selectedClient.client_code ? ' (' + selectedClient.client_code + ')' : '';
          document.getElementById('clientSearchInput').value = selectedClient.client_name + codeDisplay;
          updateTaxDisplay(clientId);
          
          var closingInfo = document.getElementById('clientClosingInfo');
          closingInfo.innerHTML = '<i class="fas fa-calendar text-blue-600 mr-1"></i>締日: ' + (selectedClient.closing_day || '未設定') + ' / 支払: ' + (selectedClient.payment_day || '未設定');
          updateFormHeaderTitle();
        }
        
        // フォーム表示制御
        function showTableView() {
          document.getElementById('tableView').classList.remove('hidden');
          document.getElementById('detailView').classList.add('hidden');
        }
        
        function showDetailView() {
          document.getElementById('tableView').classList.add('hidden');
          document.getElementById('detailView').classList.remove('hidden');
          window.SmartBill.collapseSidebar();
          document.querySelector('main').scrollTo(0, 0);
        }
        
        function resetDeliveryFormState() {
          currentDeliveryId = null;
          originalDeliveryStatus = null;
          selectedClient = null;
          document.getElementById('deliveryForm').reset();
          items = [];
          addItemRow();
          
          document.querySelector('[name="delivery_no"]').value = '';
          document.getElementById('clientSelect').value = '';
          document.getElementById('clientSearchInput').value = '';
          document.getElementById('selectedClientName').textContent = '';
          document.getElementById('selectedClientDisplay').classList.add('hidden');
          document.getElementById('clientInfo').classList.add('hidden');
          
          updateTaxDisplay(null);
          updateFormHeaderTitle();
        }
        
        // 新規作成
        async function newDelivery() {
          if (formChanged && !(await window.SmartBill.confirmLeaveAsync())) return;
          
          setFormHeaderMode('new', '<i class="fas fa-truck mr-2 text-green-600"></i>');
          resetDeliveryFormState();
          
          // 今日の日付
          var today = new Date().toISOString().split('T')[0];
          document.querySelector('[name="delivery_date"]').value = today;
          
          document.getElementById('deleteDeliveryBtn').classList.add('hidden');
          document.getElementById('duplicateDeliveryBtn').classList.add('hidden');
          document.getElementById('pdfDeliveryBtn').classList.add('hidden');
          document.getElementById('newDeliveryBtnDetail').classList.add('hidden');
          
          renderItemsTable();
          calculateTotals();
          showDetailView();
          formChanged = false; if (window.SmartBill) window.SmartBill.formChanged = false;
        }
        
        // 編集
        async function editDelivery(id) {
          if (formChanged && !(await window.SmartBill.confirmLeaveAsync())) return;
          
          var res = await axios.get('/api/deliveries/' + id);
          var data = res.data;
          
          currentDeliveryId = id;
          originalDeliveryStatus = data.status || 'draft';
          document.querySelector('[name="delivery_no"]').value = data.delivery_no;
          document.querySelector('[name="delivery_date"]').value = data.delivery_date;
          document.querySelector('[name="status"]').value = data.status || 'draft';
          document.querySelector('[name="client_id"]').value = data.client_id;
          document.querySelector('[name="notes"]').value = data.notes || '';
          
          if (data.subject) {
            document.querySelector('[name="subject"]').value = data.subject;
          }
          
          items = (data.items || []).map(function(item) {
            return {
              product_id: item.product_id,
              product_name: item.product_name,
              quantity: item.quantity,
              unit_price: item.unit_price,
              tax_rate: item.tax_rate,
              notes: item.notes || ''
            };
          });
          
          if (items.length === 0) addItemRow();
          
          setFormHeaderMode('edit', '<i class="fas fa-edit mr-2 text-green-600"></i>');
          updateFormHeaderTitle();
          document.getElementById('deleteDeliveryBtn').classList.remove('hidden');
          document.getElementById('duplicateDeliveryBtn').classList.remove('hidden');
          document.getElementById('pdfDeliveryBtn').classList.remove('hidden');
          document.getElementById('newDeliveryBtnDetail').classList.remove('hidden');
          
          // 得意先の選択表示を更新
          if (data.client_id) {
            var client = clients.find(function(c) { return c.id == data.client_id; });
            if (client) {
              var codeDisplay = client.client_code ? ' (' + client.client_code + ')' : '';
              document.getElementById('clientSearchInput').value = client.client_name + codeDisplay;
              document.getElementById('selectedClientName').textContent = client.client_name + codeDisplay;
              document.getElementById('selectedClientDisplay').classList.remove('hidden');
            }
          } else {
            document.getElementById('selectedClientDisplay').classList.add('hidden');
          }
          
          onClientChange();
          renderItemsTable();
          calculateTotals();
          renderSidebarDeliveries();
          showDetailView();
          formChanged = false; if (window.SmartBill) window.SmartBill.formChanged = false;
        }
        
        // 保存
        async function saveDelivery() {
          var form = document.getElementById('deliveryForm');
          var clientIdValue = form.querySelector('[name="client_id"]').value;
          if (!clientIdValue) {
            window.SmartBill.showErrorDialog('得意先を選択してください。');
            return;
          }
          
          var validItems = items.filter(function(item) { return item.product_name && item.quantity > 0; });
          
          // 納品済み以降のステータスで内容変更時の警告
          var deliveredOrLaterStatuses = ['delivered', 'invoiced'];
          if (currentDeliveryId && originalDeliveryStatus && deliveredOrLaterStatuses.includes(originalDeliveryStatus)) {
            if (!confirm('この納品は「' + getStatusLabel(originalDeliveryStatus) + '」です。\\n内容を変更すると、関連する請求書と異なる可能性があります。\\n\\n保存してもよろしいですか？')) {
              return;
            }
          }
          
          var formData = new FormData(form);
          var data = {
            delivery_no: formData.get('delivery_no'),
            delivery_date: formData.get('delivery_date'),
            status: formData.get('status'),
            client_id: parseInt(formData.get('client_id')),
            subject: formData.get('subject') || '',
            notes: formData.get('notes') || '',
            items: validItems
          };
          
          try {
            if (currentDeliveryId) {
              await axios.put('/api/deliveries/' + currentDeliveryId, data);
            } else {
              var res = await axios.post('/api/deliveries', data);
              currentDeliveryId = res.data.id;
              if (res.data && res.data.delivery_no) {
                document.querySelector('[name="delivery_no"]').value = res.data.delivery_no;
                updateFormHeaderTitle();
              }
            }
            
            formChanged = false; if (window.SmartBill) window.SmartBill.formChanged = false;
            if (window.SmartBill) window.SmartBill.resetFormTracking();
            await loadDeliveries();
            await loadRecentDeliveries();
            renderSidebarDeliveries();
            
            window.SmartBill.showSuccessDialog('納品を保存しました');
            
            setFormHeaderMode('edit', '<i class="fas fa-edit mr-2 text-green-600"></i>');
            updateFormHeaderTitle();
            document.getElementById('deleteDeliveryBtn').classList.remove('hidden');
            document.getElementById('duplicateDeliveryBtn').classList.remove('hidden');
            document.getElementById('pdfDeliveryBtn').classList.remove('hidden');
            document.getElementById('newDeliveryBtnDetail').classList.remove('hidden');
          } catch (e) {
            window.SmartBill.showErrorDialog('納品の保存に失敗しました');
            console.error(e);
          }
        }
        
        // PDF出力（納品書）- 出力時にステータスを「納品済」に変更
        async function exportDeliveryPDF() {
          if (!currentDeliveryId) {
            alert('納品書を保存してからPDF出力してください');
            return;
          }
          
          try {
            // 納品データを取得
            var res = await axios.get('/api/deliveries/' + currentDeliveryId);
            var deliveryData = res.data;
            
            // 自社情報を取得
            var companyRes = await axios.get('/api/company');
            var companyInfo = companyRes.data;
            
            // 取引先情報を取得（敬称のため）
            var clientInfo = {};
            if (deliveryData.client_id) {
              try {
                var clientRes = await axios.get('/api/clients/' + deliveryData.client_id);
                clientInfo = clientRes.data || {};
              } catch (e) {
                console.error('取引先情報取得エラー:', e);
              }
            }
            
            // PDFデータを構築
            var pdfData = {
              delivery_no: deliveryData.delivery_no,
              delivery_date: deliveryData.delivery_date,
              client_name: deliveryData.client_name,
              subject: deliveryData.subject,
              items: deliveryData.items || [],
              subtotal: deliveryData.subtotal,
              tax_amount: deliveryData.tax_amount,
              total_amount: deliveryData.total_amount,
              notes: deliveryData.notes,
              companyInfo: companyInfo,
              clientInfo: clientInfo,
              delivery_note_format: companyInfo.delivery_note_format || 'half'
            };
            
            // プレビュー表示
            window.SmartBillPDF.previewDeliveryPDF(pdfData);
            
            // ステータスが「納品済」または「請求済」でなければ「納品済」に変更
            if (deliveryData.status !== 'delivered' && deliveryData.status !== 'invoiced') {
              await axios.put('/api/deliveries/' + currentDeliveryId, {
                ...deliveryData,
                status: 'delivered'
              });
              
              // フォームのステータスも更新
              document.querySelector('[name="status"]').value = 'delivered';
              originalDeliveryStatus = 'delivered';
              
              // リストを再読み込み
              await loadDeliveries();
              await loadRecentDeliveries();
              renderSidebarDeliveries();
              
              window.SmartBill.showSuccessDialog('納品書を出力し、ステータスを「納品済」に変更しました');
            }
            
          } catch (e) {
            alert('PDF出力に失敗しました');
            console.error(e);
          }
        }
        
        // 削除
        async function deleteDelivery() {
          if (!currentDeliveryId) return;
          
          var confirmed = await window.SmartBill.confirmDelete('この納品');
          if (!confirmed) return;
          
          try {
            await axios.delete('/api/deliveries/' + currentDeliveryId);
            formChanged = false; if (window.SmartBill) window.SmartBill.formChanged = false;
            await loadDeliveries();
            await loadRecentDeliveries();
            newDelivery();
            window.SmartBill.showSuccessDialog('納品を削除しました');
          } catch (e) {
            alert('削除に失敗しました');
            console.error(e);
          }
        }
        
        // 複製
        async function duplicateDelivery() {
          if (!currentDeliveryId) return;
          
          currentDeliveryId = null;
          
          document.querySelector('[name="delivery_no"]').value = '';
          
          var today = new Date().toISOString().split('T')[0];
          document.querySelector('[name="delivery_date"]').value = today;
          
          document.querySelector('[name="status"]').value = 'draft';
          
          setFormHeaderMode('custom', '<i class="fas fa-copy mr-2 text-purple-600"></i>');
          document.getElementById('formTitle').innerHTML = '<i class="fas fa-copy mr-2 text-purple-600"></i>納品複製（新規）';
          document.getElementById('deleteDeliveryBtn').classList.add('hidden');
          document.getElementById('duplicateDeliveryBtn').classList.add('hidden');
          document.getElementById('pdfDeliveryBtn').classList.add('hidden');
          document.getElementById('newDeliveryBtnDetail').classList.add('hidden');
          
          formChanged = true; if (window.SmartBill) window.SmartBill.formChanged = true;
        }
        
        // イベント設定
        function setupEventListeners() {
          // 検索・フィルター用のヘルパー関数
          function getFilterValues() {
            return {
              search: document.getElementById('searchInputTable').value,
              status: document.getElementById('statusFilter').value,
              month: document.getElementById('monthFilter').value
            };
          }
          
          function applyFilters() {
            var f = getFilterValues();
            loadDeliveries(f.search, f.status, f.month);
          }
          
          // 検索
          var searchTimeout;
          document.getElementById('searchInputTable').addEventListener('input', function() {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(function() { applyFilters(); }, 300);
          });
          
          document.getElementById('statusFilter').addEventListener('change', function() {
            applyFilters();
          });
          
          document.getElementById('monthFilter').addEventListener('change', function() {
            applyFilters();
          });
          
          document.getElementById('clearFiltersBtn').addEventListener('click', function() {
            document.getElementById('searchInputTable').value = '';
            document.getElementById('statusFilter').value = '';
            document.getElementById('monthFilter').value = '';
            loadDeliveries();
          });
          
          document.getElementById('sidebarSearch').addEventListener('input', function() {
            var search = this.value.toLowerCase();
            document.querySelectorAll('#sidebarDeliveryList .delivery-item').forEach(function(el) {
              var text = el.textContent.toLowerCase();
              el.style.display = text.includes(search) ? '' : 'none';
            });
          });
          
          // ボタン
          document.getElementById('newDeliveryBtnTable').addEventListener('click', newDelivery);
          document.getElementById('newDeliveryBtnDetail').addEventListener('click', newDelivery);
          document.getElementById('fromEstimateBtnTable').addEventListener('click', openEstimateModal);
          document.getElementById('backToTableBtn').addEventListener('click', async function() {
            if (formChanged && !(await window.SmartBill.confirmLeaveAsync())) return;
            formChanged = false; if (window.SmartBill) window.SmartBill.formChanged = false;
            showTableView();
          });
          document.getElementById('backToTableBtnCollapsed').addEventListener('click', async function() {
            if (formChanged && !(await window.SmartBill.confirmLeaveAsync())) return;
            formChanged = false; if (window.SmartBill) window.SmartBill.formChanged = false;
            showTableView();
          });
          document.getElementById('saveDeliveryBtn').addEventListener('click', saveDelivery);
          document.getElementById('deleteDeliveryBtn').addEventListener('click', deleteDelivery);
          document.getElementById('duplicateDeliveryBtn').addEventListener('click', duplicateDelivery);
          document.getElementById('pdfDeliveryBtn').addEventListener('click', exportDeliveryPDF);
          document.querySelector('[name="delivery_no"]').addEventListener('input', function() {
            updateFormHeaderTitle();
          });
          document.getElementById('addItemBtn').addEventListener('click', function() { addItemRow(); });
          
          // サイドバー折りたたみ
          document.getElementById('expandSidebarBtn').addEventListener('click', function() {
            toggleSidebar(false);
          });
          document.getElementById('collapseSidebarBtn').addEventListener('click', function() {
            toggleSidebar(true);
          });
          
          // 得意先サジェスト
          var clientSearchInput = document.getElementById('clientSearchInput');
          var clientSearchTimeout;
          
          clientSearchInput.addEventListener('input', function() {
            clearTimeout(clientSearchTimeout);
            var search = this.value;
            clientSearchTimeout = setTimeout(function() {
              showClientSuggest(search);
            }, 150);
          });
          
          clientSearchInput.addEventListener('focus', function() {
            showClientSuggest(this.value);
          });
          
          document.addEventListener('click', function(e) {
            var suggestList = document.getElementById('clientSuggestList');
            var searchInput = document.getElementById('clientSearchInput');
            var toggleBtn = document.getElementById('clientSelectToggle');
            if (!suggestList.contains(e.target) && e.target !== searchInput && e.target !== toggleBtn && !toggleBtn.contains(e.target)) {
              hideClientSuggest();
            }
          });
          
          document.getElementById('clientSelectToggle').addEventListener('click', function() {
            var suggestList = document.getElementById('clientSuggestList');
            if (suggestList.classList.contains('hidden')) {
              showClientSuggest('');
            } else {
              hideClientSuggest();
            }
          });
          
          document.getElementById('clearClientBtn').addEventListener('click', function() {
            clearClientSelection();
          });
          
          document.getElementById('clientSelect').addEventListener('change', function() {
            onClientChange();
            formChanged = true; if (window.SmartBill) window.SmartBill.formChanged = true;
          });
          
          // 商品モーダル
          document.getElementById('closeProductModal').addEventListener('click', closeProductModal);
          document.getElementById('productModal').addEventListener('click', function(e) {
            if (e.target === this) closeProductModal();
          });
          
          var productSearchTimeout;
          document.getElementById('productSearchInput').addEventListener('input', function() {
            clearTimeout(productSearchTimeout);
            var search = this.value;
            var categoryId = document.getElementById('productCategoryFilter').value;
            productSearchTimeout = setTimeout(function() { renderProductList(search, categoryId); }, 300);
          });
          
          document.getElementById('productCategoryFilter').addEventListener('change', function() {
            var search = document.getElementById('productSearchInput').value;
            renderProductList(search, this.value);
          });
          
          // 見積モーダル
          document.getElementById('closeEstimateModal').addEventListener('click', closeEstimateModal);
          document.getElementById('estimateModal').addEventListener('click', function(e) {
            if (e.target === this) closeEstimateModal();
          });
          
          var estimateSearchTimeout;
          document.getElementById('estimateSearchInput').addEventListener('input', function() {
            clearTimeout(estimateSearchTimeout);
            var search = this.value;
            var status = document.getElementById('estimateStatusFilter').value;
            estimateSearchTimeout = setTimeout(function() { loadEstimatesForModal(search, status); }, 300);
          });
          
          document.getElementById('estimateStatusFilter').addEventListener('change', function() {
            var search = document.getElementById('estimateSearchInput').value;
            loadEstimatesForModal(search, this.value);
          });
          
          // サイドバーと最近編集のクリックイベント
          document.addEventListener('click', function(e) {
            var deliveryItem = e.target.closest('.delivery-item');
            if (deliveryItem) {
              var id = parseInt(deliveryItem.getAttribute('data-id'));
              editDelivery(id);
            }
          });
          
          // キーボードショートカット
          window.SmartBill.setupKeyboardShortcuts({
            saveCallback: function() { saveDelivery(); },
            escapeCallback: async function() {
              var productModal = document.getElementById('productModal');
              var estimateModal = document.getElementById('estimateModal');
              if (!productModal.classList.contains('hidden')) {
                closeProductModal();
              } else if (!estimateModal.classList.contains('hidden')) {
                closeEstimateModal();
              } else if (!document.getElementById('detailView').classList.contains('hidden')) {
                if (formChanged && !(await window.SmartBill.confirmLeaveAsync())) return;
                formChanged = false; if (window.SmartBill) window.SmartBill.formChanged = false;
                showTableView();
              }
            }
          });
        }
        
        // 初期化実行
        init();
      `}} />
    </Layout>
  )
})

app.get('/estimates', async (c) => {
  return c.html(
    <Layout title="見積データ入力" currentPath="/estimates" hideTitle={true}>
      {/* 初期表示: テーブル一覧 */}
      <div id="tableView">
        {/* 固定ヘッダー: タイトル + 検索バー */}
        <div class="sticky top-0 z-20 -mx-4 md:-mx-8 px-4 md:px-8 pt-0 pb-4 bg-gray-100">
          <h2 class="text-2xl font-bold text-gray-800 mb-4 pt-0">見積データ入力</h2>
          <div class="bg-white rounded-lg shadow p-4">
            <div class="flex flex-wrap gap-4 items-end justify-between">
              <div class="flex flex-wrap gap-3 items-end flex-1">
                <div class="flex-1 min-w-64 max-w-md">
                  <label class="block text-xs font-medium text-gray-600 mb-1">
                    <i class="fas fa-search mr-1"></i>検索
                  </label>
                  <input type="text" id="searchInputTable" 
                    placeholder="見積番号、得意先名、備考で検索..."
                    class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
                </div>
                <div class="w-36">
                  <label class="block text-xs font-medium text-gray-600 mb-1">ステータス</label>
                  <select id="statusFilter" class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
                    <option value="">すべて</option>
                    <option value="draft">作成中</option>
                    <option value="pending">未送付</option>
                    <option value="sent">送付済</option>
                    <option value="accepted">受注</option>
                    <option value="rejected">失注</option>
                  </select>
                </div>
                <div class="w-36">
                  <label class="block text-xs font-medium text-gray-600 mb-1">年月</label>
                  <input type="month" id="monthFilter" 
                    class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
                </div>
                <button type="button" id="clearFiltersBtn" 
                  class="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm transition-colors" 
                  title="検索をクリア">
                  <i class="fas fa-times"></i>
                </button>
              </div>
              <button id="newEstimateBtnTable" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg">
                <i class="fas fa-plus mr-2"></i>新規作成
              </button>
            </div>
          </div>
        </div>
        
        <div class="bg-white rounded-lg shadow overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">見積番号</th>
                  <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">見積日</th>
                  <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">得意先</th>
                  <th class="px-4 py-3 text-right text-sm font-medium text-gray-700">合計金額</th>
                  <th class="px-4 py-3 text-center text-sm font-medium text-gray-700">ステータス</th>
                  <th class="px-4 py-3 text-center text-sm font-medium text-gray-700">操作</th>
                </tr>
              </thead>
              <tbody id="estimateTableBody" class="divide-y">
                {/* 動的に生成 */}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 詳細表示: 2カラムレイアウト（サイドバー + フォーム） */}
      <div id="detailView" class="hidden">
        <div class="flex gap-4">
          {/* 左サイドバー（折りたたみ時） */}
          <div id="sidebarCollapsed" class="w-12 flex-shrink-0">
            <div class="bg-white rounded-lg shadow p-2 sticky top-4">
              <button id="expandSidebarBtn" class="w-full text-center py-2 text-gray-600 hover:text-blue-600" title="サイドバーを開く">
                <i class="fas fa-chevron-right"></i>
              </button>
              <div class="border-t my-2"></div>
              <button id="backToTableBtnCollapsed" class="w-full text-center py-2 text-gray-600 hover:text-blue-600" title="一覧に戻る">
                <i class="fas fa-th-list"></i>
              </button>
            </div>
          </div>
          
          {/* 左サイドバー（展開時） */}
          <div id="sidebarExpanded" class="w-80 flex-shrink-0 hidden sticky top-4 self-start" data-subsidebar="estimates">
            {/* 検索 */}
            <div class="bg-white rounded-lg shadow mb-4">
              <div class="p-3">
                <div class="flex items-center justify-between mb-2">
                  <button id="backToTableBtn" class="text-sm text-slate-700 hover:text-slate-900" title="一覧に戻る">
                    <i class="fas fa-th-list mr-1"></i>一覧に戻る
                  </button>
                  <button id="collapseSidebarBtn" class="text-sm text-slate-700 hover:text-slate-900" title="サイドバーを閉じる">
                    <i class="fas fa-times mr-1"></i>閉じる
                  </button>
                </div>
                <input type="text" id="sidebarSearch" placeholder="検索..."
                  class="w-full border rounded px-2 py-1 text-sm" />
              </div>
            </div>
            
            {/* 最近編集した見積 */}
            <div class="bg-white rounded-lg shadow mb-4" id="recentEstimatesSection">
              <div class="p-3 border-b bg-gray-50 flex items-center justify-between cursor-pointer" id="recentToggle" data-recent-toggle="estimates">
                <h3 class="text-slate-700 text-sm font-medium">
                  <i class="fas fa-clock mr-2 text-orange-500 text-sm"></i>最近編集
                </h3>
                <i class="fas fa-chevron-down text-gray-400 text-xs transition-transform duration-200" id="recentToggleIcon" data-recent-chevron="estimates"></i>
              </div>
              <div id="recentEstimates" class="p-2 space-y-1 max-h-48 overflow-y-auto" data-recent-body="estimates">
                {/* 動的に生成 */}
              </div>
            </div>
            
            {/* 見積一覧 */}
            <div class="bg-white rounded-lg shadow">
              <div class="p-3 border-b bg-gray-50 flex items-center justify-between">
                <h3 class="text-slate-700 text-sm font-medium">
                  <i class="fas fa-file-invoice mr-2 text-blue-600 text-sm"></i>見積一覧
                </h3>
              </div>
              <div class="p-2">
                <div id="sidebarEstimateList" class="max-h-[calc(100vh-220px)] overflow-y-auto space-y-1">
                  {/* 動的に生成 */}
                </div>
              </div>
            </div>
          </div>

          {/* 右側フォーム */}
          <div class="flex-1">
            <div class="bg-white rounded-lg shadow">
              {/* ヘッダー - 固定 */}
              <div class="sticky top-0 z-10 p-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50 flex items-center justify-between rounded-t-lg flex-wrap gap-2 shadow-sm">
                <h2 id="formTitle" class="text-xl font-bold text-gray-800">
                  <i class="fas fa-file-invoice mr-2 text-blue-600"></i>新規見積作成
                </h2>
                <div class="flex gap-2 flex-wrap">
                  <button type="button" id="newEstimateBtnDetail" class="hidden bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-sm">
                    <i class="fas fa-plus mr-1"></i>新規
                  </button>
                  <button type="button" id="duplicateEstimateBtn" class="hidden bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg text-sm">
                    <i class="fas fa-copy mr-1"></i>複製
                  </button>
                  <button type="button" id="deleteEstimateBtn" class="hidden bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-sm">
                    <i class="fas fa-trash-alt mr-1"></i>削除
                  </button>
                  <span id="pageUnsavedIndicator" class="text-sm text-red-600 font-semibold hidden">●未保存</span>
                  <button type="button" id="saveEstimateBtn" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-sm font-bold">
                    <i class="fas fa-save mr-1"></i>保存
                  </button>
                  <button type="button" id="pdfEstimateBtn" class="hidden bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded-lg text-sm font-bold">
                    <i class="fas fa-file-pdf mr-1"></i>PDF出力
                  </button>
                </div>
              </div>

              <form id="estimateForm" class="p-6" data-track-unsaved="true">
                {/* 基本情報 */}
                <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <div class="md:col-span-2 lg:col-span-1">
                    <label class="block text-sm font-medium text-gray-700 mb-1">見積番号 *</label>
                    <div class="flex gap-1">
                      <input type="text" name="estimate_no"
                        class="flex-1 min-w-0 border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <p class="text-xs text-gray-500 mt-1">未入力のまま保存すると自動採番されます。</p>
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">見積日 *</label>
                    <input type="date" name="estimate_date"
                      class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">有効期限</label>
                    <input type="date" name="valid_until"
                      class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">ステータス</label>
                    <select name="status" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500">
                      <option value="draft">作成中</option>
                      <option value="pending">未送付</option>
                      <option value="sent">送付済</option>
                      <option value="accepted">受注</option>
                      <option value="rejected">失注</option>
                    </select>
                  </div>
                </div>

                {/* 得意先選択 */}
                <div class="mb-6 p-4 bg-gray-50 rounded-lg">
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-1">得意先 *</label>
                      {/* テキスト入力でサジェスト */}
                      <div class="relative">
                        <div class="flex gap-2">
                          <div class="flex-1 relative">
                            <input type="text" id="clientSearchInput" placeholder="取引先名・コードで検索..."
                              class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" autocomplete="off" />
                            <div id="clientSuggestList" class="absolute z-50 w-full bg-white border rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto hidden">
                              {/* サジェスト候補がここに表示される */}
                            </div>
                          </div>
                          <button type="button" id="clientSelectToggle" class="bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-lg text-gray-600" title="一覧から選択">
                            <i class="fas fa-chevron-down"></i>
                          </button>
                        </div>
                        {/* 従来のプルダウン（非表示だがフォーム送信用） */}
                        <select name="client_id" id="clientSelect" class="hidden">
                          <option value="">得意先を選択...</option>
                        </select>
                        {/* 選択された得意先の表示 */}
                        <div id="selectedClientDisplay" class="hidden mt-2 p-2 bg-gray-50 rounded-lg flex items-center justify-between">
                          <span id="selectedClientName" class="font-medium text-gray-700"></span>
                          <button type="button" id="clearClientBtn" class="text-blue-600 hover:text-blue-800 text-sm">
                            <i class="fas fa-times"></i> クリア
                          </button>
                        </div>
                      </div>
                    </div>
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-1">件名</label>
                      <input type="text" name="subject" placeholder="例: ホームページ制作のお見積り"
                        class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                  {/* 得意先情報表示 */}
                  <div id="clientInfo" class="mt-3 text-sm text-gray-600 hidden">
                    <div class="flex flex-wrap gap-4">
                      <span id="clientWholesaleInfo"></span>
                      <span id="clientClosingInfo"></span>
                    </div>
                  </div>
                </div>

                {/* 上代表記設定 */}
                <div class="mb-4 flex items-center gap-4 p-3 bg-indigo-50 rounded-lg">
                  <span class="text-sm font-medium text-indigo-800">上代表記:</span>
                  <label class="flex items-center cursor-pointer">
                    <input type="radio" name="show_retail" value="no" checked class="w-4 h-4 text-indigo-600" />
                    <span class="ml-2 text-sm font-medium text-gray-700">いいえ（単価のみ）</span>
                  </label>
                  <label class="flex items-center cursor-pointer">
                    <input type="radio" name="show_retail" value="yes" class="w-4 h-4 text-indigo-600" />
                    <span class="ml-2 text-sm font-medium text-gray-700">はい（上代・下代表示）</span>
                  </label>
                  <span id="priceTypeHint" class="text-xs text-indigo-600 ml-auto"></span>
                </div>

                {/* 受渡場所・取引条件・納期 */}
                <div class="mb-4 p-3 bg-green-50 rounded-lg border border-green-200">
                  <h4 class="text-sm font-bold text-green-800 mb-2"><i class="fas fa-handshake mr-1"></i>取引条件</h4>
                  <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label class="block text-xs font-medium text-green-700 mb-1">受渡場所</label>
                      <input type="text" name="delivery_place" placeholder="例: 御社指定場所"
                        class="w-full border border-green-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-green-500" />
                    </div>
                    <div>
                      <label class="block text-xs font-medium text-green-700 mb-1">取引条件</label>
                      <input type="text" name="payment_terms" placeholder="例: 納品後30日以内"
                        class="w-full border border-green-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-green-500" />
                    </div>
                    <div>
                      <label class="block text-xs font-medium text-green-700 mb-1">納期</label>
                      <input type="text" name="delivery_date_text" placeholder="例: ご発注後2週間以内"
                        class="w-full border border-green-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-green-500" />
                    </div>
                  </div>
                </div>

                {/* 明細テーブル */}
                <div class="mb-6">
                  <div class="flex items-center justify-between mb-2">
                    <h3 class="font-bold text-gray-700">
                      <i class="fas fa-list mr-2 text-green-600"></i>明細
                    </h3>
                    <button type="button" id="addItemBtn" class="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-sm">
                      <i class="fas fa-plus mr-1"></i>明細追加
                    </button>
                  </div>
                  <div class="overflow-x-auto border rounded-lg">
                    <table class="w-full text-sm">
                      <thead id="itemsTableHead" class="bg-gray-100">
                        {/* 動的に生成 */}
                      </thead>
                      <tbody id="itemsTableBody">
                        {/* 動的に生成 */}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 合計金額 */}
                <div class="flex justify-end mb-6">
                  <div class="w-72 bg-gray-50 rounded-lg p-4">
                    <div class="flex justify-between py-2 border-b">
                      <span id="subtotalLabel" class="text-gray-600">小計</span>
                      <span id="subtotalDisplay" class="font-bold">¥0</span>
                    </div>
                    <div id="taxSection" style="display: none;">
                      <div id="taxBreakdown" class="text-sm">
                        {/* 税率別の内訳が入る */}
                      </div>
                      <div class="flex justify-between py-2 border-b">
                        <span class="text-gray-600">消費税</span>
                        <span id="taxDisplay" class="font-bold">¥0</span>
                      </div>
                    </div>
                    <div class="flex justify-between py-3 text-lg">
                      <span id="totalLabel" class="font-bold text-gray-800">合計</span>
                      <span id="totalDisplay" class="font-bold text-blue-600">¥0</span>
                    </div>
                  </div>
                </div>

                {/* 備考 */}
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">
                    <i class="fas fa-sticky-note mr-1 text-yellow-500"></i>備考
                  </label>
                  <textarea name="notes" rows={3} placeholder="見積書に印刷される備考欄"
                    class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"></textarea>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* 商品選択モーダル */}
      <div id="productModal" class="fixed inset-0 bg-black bg-opacity-50 hidden z-50 flex items-center justify-center">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
          <div class="p-4 border-b bg-gray-50 flex items-center justify-between">
            <h3 class="font-bold text-gray-800">
              <i class="fas fa-box mr-2 text-blue-600"></i>商品を選択
            </h3>
            <button type="button" id="closeProductModal" class="text-gray-500 hover:text-gray-700">
              <i class="fas fa-times text-xl"></i>
            </button>
          </div>
          <div class="p-4">
            <div class="flex gap-2 mb-4">
              <input type="text" id="productSearchInput" placeholder="商品名・コードで検索..."
                class="flex-1 border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
              <select id="productCategoryFilter" class="border rounded-lg px-3 py-2">
                <option value="">全カテゴリ</option>
              </select>
            </div>
            <div id="productList" class="max-h-[calc(100vh-260px)] overflow-y-auto space-y-2 pb-12">
              {/* 動的に生成 */}
            </div>
          </div>
        </div>
      </div>

      <script dangerouslySetInnerHTML={{__html: `
        ${docHeaderTitleHelpers}
        ${taxRateHelpers}
        ${recentAccordionScript}
        // 状態管理
        var currentEstimateId = null;
        var originalEstimateStatus = null;  // 編集開始時のステータス（警告用）
        var estimates = [];
        var clients = [];
        var products = [];
        var categories = [];
        var items = [];
        var formChanged = false; if (window.SmartBill) window.SmartBill.formChanged = false;
        var currentItemIndex = null;
        var selectedClient = null;
        var companySettings = {};  // 自社設定（消費税表示設定など）
        var showTax = false;  // 消費税を表示するかどうか
        var currentHeaderMode = null;
        var currentHeaderIconHtml = '';

        function setFormHeaderMode(mode, iconHtml) {
          currentHeaderMode = mode;
          currentHeaderIconHtml = iconHtml || '';
        }

        function getCurrentClientLabel() {
          if (selectedClient) return getClientDisplayLabel(selectedClient);
          var selectedName = document.getElementById('selectedClientName');
          return selectedName ? normalizeHeaderText(selectedName.textContent) : '';
        }

        function updateFormHeaderTitle() {
          if (currentHeaderMode !== 'new' && currentHeaderMode !== 'edit') return;
          var titleEl = document.getElementById('formTitle');
          if (!titleEl) return;
          var docNoInput = document.querySelector('[name="estimate_no"]');
          var docNo = normalizeHeaderText(docNoInput ? docNoInput.value : '');
          var clientLabel = getCurrentClientLabel();
          var titleText = buildDocHeaderTitle({
            docTypeLabel: '見積',
            mode: currentHeaderMode,
            clientLabel: clientLabel,
            docNo: docNo
          });
          if (!titleText) return;
          titleEl.innerHTML = (currentHeaderIconHtml || '') + titleText;
        }

        function updateEstimateSummaryLabels() {
          var subtotalLabel = document.getElementById('subtotalLabel');
          var totalLabel = document.getElementById('totalLabel');
          if (!subtotalLabel || !totalLabel) return;
          if (showTax) {
            subtotalLabel.textContent = '小計（税抜）';
            totalLabel.textContent = '合計（税込）';
          } else {
            subtotalLabel.textContent = '小計';
            totalLabel.textContent = '合計';
          }
        }

        function isShowTaxOnEstimate(companyInfo) {
          var setting = companyInfo && companyInfo.show_tax_on_estimate_delivery;
          return Number(setting != null ? setting : 1) === 1;
        }

        function getEstimateListDisplayTotal(estimate, companyInfo) {
          var showTaxOn = isShowTaxOnEstimate(companyInfo);
          var subtotal = estimate && estimate.subtotal != null
            ? estimate.subtotal
            : (estimate && estimate.total_amount != null && estimate.tax_amount != null
              ? estimate.total_amount - estimate.tax_amount
              : 0);
          var total = estimate && estimate.total_amount != null
            ? estimate.total_amount
            : (estimate && estimate.tax_amount != null ? subtotal + estimate.tax_amount : subtotal);
          return showTaxOn ? Number(total != null ? total : 0) : Number(subtotal != null ? subtotal : 0);
        }

        function getEstimateListTotalHeaderLabel(companyInfo) {
          return isShowTaxOnEstimate(companyInfo) ? '合計金額' : '合計金額（税抜）';
        }

        function updateEstimateListTotalHeader() {
          var tbody = document.getElementById('estimateTableBody');
          if (!tbody) return;
          var table = tbody.closest ? tbody.closest('table') : null;
          if (!table) {
            var parent = tbody.parentElement;
            while (parent && parent.tagName !== 'TABLE') {
              parent = parent.parentElement;
            }
            table = parent;
          }
          if (!table) return;
          var headerCell = table.querySelector('thead th:nth-child(4)');
          if (headerCell) {
            headerCell.textContent = getEstimateListTotalHeaderLabel(companySettings);
          }
        }
        
        // 初期化
        async function init() {
          await Promise.all([
            loadEstimates(),
            loadClients(),
            loadProducts(),
            loadCategories(),
            loadRecentEstimates(),
            loadCompanySettings()
          ]);
          
          var params = new URLSearchParams(window.location.search || '');
          var isNewAction = params.get('action') === 'new' || window.location.pathname.endsWith('/new');
          if (isNewAction) {
            await newEstimate();
          } else {
            // 今日の日付をデフォルト設定
            var today = new Date().toISOString().split('T')[0];
            document.querySelector('[name="estimate_date"]').value = today;
            
            // 有効期限を30日後に設定
            var validUntil = new Date();
            validUntil.setDate(validUntil.getDate() + 30);
            document.querySelector('[name="valid_until"]').value = validUntil.toISOString().split('T')[0];
            
            // 空の明細行を1つ追加
            addItemRow();
          }
          
          setupEventListeners();
        }
        
        // データ読み込み
        async function loadEstimates(search, status, month) {
          var url = '/api/estimates';
          var params = [];
          if (search) params.push('search=' + encodeURIComponent(search));
          if (status) params.push('status=' + encodeURIComponent(status));
          if (month) params.push('month=' + encodeURIComponent(month));
          if (params.length > 0) url += '?' + params.join('&');
          
          var res = await axios.get(url);
          estimates = res.data;
          renderEstimateTable();
          renderSidebarEstimates();
        }
        
        async function loadClients() {
          var res = await axios.get('/api/clients');
          clients = res.data;
          var select = document.getElementById('clientSelect');
          select.innerHTML = '<option value="">得意先を選択...</option>' +
            clients.map(function(c) {
              return '<option value="' + c.id + '">' + c.client_name + '</option>';
            }).join('');
        }
        
        async function loadCompanySettings() {
          var res = await axios.get('/api/company');
          companySettings = res.data || {};
          updateEstimateListTotalHeader();
          updateEstimateSummaryLabels();
          updateTaxDisplay(document.getElementById('clientSelect').value || null);
          renderEstimateTable();
          renderSidebarEstimates();
        }
        
        // 消費税表示を切り替える（見積）
        function updateTaxDisplay(clientId) {
          var client = clients.find(function(c) { return c.id == clientId; });
          var clientSetting = client ? client.tax_display_setting : 'default';
          
          // 優先順位: 取引先設定 > 自社設定
          if (clientSetting === 'show') {
            showTax = true;
          } else if (clientSetting === 'hide') {
            showTax = false;
          } else {
            // 自社設定に従う
            showTax = companySettings.show_tax_on_estimate_delivery === 1;
          }
          
          // UIを更新
          var taxSection = document.getElementById('taxSection');
          if (taxSection) {
            taxSection.style.display = showTax ? 'block' : 'none';
          }
          
          updateEstimateSummaryLabels();
          // 合計を再計算
          calculateTotals();
        }
        
        // 得意先サジェスト機能（見積）
        function showClientSuggest(searchText) {
          var suggestList = document.getElementById('clientSuggestList');
          
          if (!searchText || searchText.length === 0) {
            // 空の場合は全件表示（最大20件）
            var filtered = clients.slice(0, 20);
          } else {
            // 部分一致検索（取引先名・コード）
            var lowerSearch = searchText.toLowerCase();
            var filtered = clients.filter(function(c) {
              var nameMatch = c.client_name && c.client_name.toLowerCase().includes(lowerSearch);
              var codeMatch = c.client_code && c.client_code.toLowerCase().includes(lowerSearch);
              return nameMatch || codeMatch;
            }).slice(0, 20);
          }
          
          if (filtered.length === 0) {
            suggestList.innerHTML = '<div class="p-3 text-gray-500 text-sm">該当する取引先がありません</div>';
          } else {
            suggestList.innerHTML = filtered.map(function(c) {
              var codeDisplay = c.client_code ? '<span class="text-gray-400 text-xs ml-2">' + c.client_code + '</span>' : '';
              var wholesaleIcon = c.is_wholesale ? '<i class="fas fa-tag text-green-500 ml-2" title="卸売"></i>' : '';
              return '<div class="client-suggest-item p-2 hover:bg-blue-50 cursor-pointer border-b last:border-b-0" data-id="' + c.id + '">' +
                '<span class="font-medium">' + c.client_name + '</span>' + codeDisplay + wholesaleIcon +
                '</div>';
            }).join('');
            
            // クリックイベント設定
            suggestList.querySelectorAll('.client-suggest-item').forEach(function(el) {
              el.addEventListener('click', function() {
                var clientId = parseInt(this.getAttribute('data-id'));
                selectClient(clientId);
              });
            });
          }
          
          suggestList.classList.remove('hidden');
        }
        
        function hideClientSuggest() {
          document.getElementById('clientSuggestList').classList.add('hidden');
        }
        
        function selectClient(clientId) {
          var client = clients.find(function(c) { return c.id === clientId; });
          if (!client) return;
          
          // hidden selectに値をセット
          document.getElementById('clientSelect').value = clientId;
          
          // 選択表示を更新
          var codeDisplay = client.client_code ? ' (' + client.client_code + ')' : '';
          document.getElementById('clientSearchInput').value = client.client_name + codeDisplay;
          document.getElementById('selectedClientName').textContent = client.client_name + codeDisplay;
          document.getElementById('selectedClientDisplay').classList.remove('hidden');
          
          // サジェストを閉じる
          hideClientSuggest();
          
          // 消費税表示を更新
          updateTaxDisplay(clientId);
          
          // 得意先情報を更新
          onClientChange();
          formChanged = true; if (window.SmartBill) window.SmartBill.formChanged = true;
        }
        
        function clearClientSelection() {
          document.getElementById('clientSelect').value = '';
          document.getElementById('clientSearchInput').value = '';
          document.getElementById('selectedClientDisplay').classList.add('hidden');
          document.getElementById('selectedClientName').textContent = '';
          selectedClient = null;
          document.getElementById('clientInfo').classList.add('hidden');
          document.getElementById('priceTypeHint').textContent = '';
          // 消費税表示をデフォルトに戻す
          updateTaxDisplay(null);
          updateFormHeaderTitle();
          formChanged = true; if (window.SmartBill) window.SmartBill.formChanged = true;
        }
        
        async function loadProducts() {
          var res = await axios.get('/api/products');
          products = res.data;
        }
        
        async function loadCategories() {
          var res = await axios.get('/api/categories');
          categories = res.data;
          var select = document.getElementById('productCategoryFilter');
          select.innerHTML = '<option value="">全カテゴリ</option>' +
            categories.map(function(c) {
              return '<option value="' + c.id + '">' + c.category_name + '</option>';
            }).join('');
        }
        
        async function loadRecentEstimates() {
          var data = [];
          try {
            var res = await axios.get('/api/estimates/recent?limit=5');
            data = res.data || [];
          } catch (e) {
            console.error(e);
            data = [];
          }
          var container = document.getElementById('recentEstimates');
          if (data.length === 0) {
            container.innerHTML = '<p class="text-xs text-gray-400 p-2">最近の編集はありません</p>';
            return;
          }
          container.innerHTML = data.map(function(e) {
            var displayNo = e.estimate_display_no || e.estimate_no || e.estimate_number || (e.id ? 'EST-' + String(e.id).padStart(6, '0') : '');
            return '<div class="p-2 hover:bg-gray-50 rounded cursor-pointer text-xs border-b estimate-item" data-id="' + e.id + '">' +
              '<div class="font-medium text-gray-800">' + displayNo + '</div>' +
              '<div class="text-gray-500">' + (e.client_name || '得意先未設定') + '</div>' +
              '</div>';
          }).join('');
        }
        
        // テーブル描画
        function renderEstimateTable() {
          var tbody = document.getElementById('estimateTableBody');
          if (estimates.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-gray-500">見積データがありません</td></tr>';
            return;
          }
          tbody.innerHTML = estimates.map(function(e) {
            var statusSelect = getStatusSelect(e.id, e.status);
            var displayNo = e.estimate_display_no || e.estimate_no || e.estimate_number || (e.id ? 'EST-' + String(e.id).padStart(6, '0') : '');
            var displayTotal = getEstimateListDisplayTotal(e, companySettings);
            return '<tr class="hover:bg-gray-50 estimate-row" data-id="' + e.id + '">' +
              '<td class="px-4 py-3 font-medium text-blue-600 cursor-pointer estimate-cell" data-id="' + e.id + '">' + displayNo + '</td>' +
              '<td class="px-4 py-3 cursor-pointer estimate-cell" data-id="' + e.id + '">' + e.estimate_date + '</td>' +
              '<td class="px-4 py-3 cursor-pointer estimate-cell" data-id="' + e.id + '">' + (e.client_name || '-') + '</td>' +
              '<td class="px-4 py-3 text-right font-bold cursor-pointer estimate-cell" data-id="' + e.id + '">¥' + displayTotal.toLocaleString() + '</td>' +
              '<td class="px-4 py-3 text-center">' + statusSelect + '</td>' +
              '<td class="px-4 py-3 text-center">' +
              '<button class="text-blue-600 hover:text-blue-800 edit-btn" data-id="' + e.id + '"><i class="fas fa-edit"></i></button>' +
              '</td></tr>';
          }).join('');
          
          // ステータス変更イベント設定
          tbody.querySelectorAll('.status-select').forEach(function(select) {
            select.addEventListener('change', function(e) {
              e.stopPropagation();
              var id = parseInt(this.getAttribute('data-id'));
              var newStatus = this.value;
              changeEstimateStatus(id, newStatus);
            });
            select.addEventListener('click', function(e) {
              e.stopPropagation();
            });
          });
          
          // 行クリックで編集（ステータス以外の列）
          tbody.querySelectorAll('.estimate-cell').forEach(function(cell) {
            cell.addEventListener('click', function() {
              var id = parseInt(this.getAttribute('data-id'));
              editEstimate(id);
            });
          });
          updateEstimateListTotalHeader();
        }
        
        // ステータス選択プルダウン生成
        function getStatusSelect(id, currentStatus) {
          var options = [
            { value: 'draft', label: '作成中', color: 'text-gray-700' },
            { value: 'pending', label: '未送付', color: 'text-yellow-700' },
            { value: 'sent', label: '送付済', color: 'text-blue-700' },
            { value: 'accepted', label: '受注', color: 'text-green-700' },
            { value: 'rejected', label: '失注', color: 'text-red-700' }
          ];
          
          var bgColors = {
            'draft': 'bg-gray-100',
            'pending': 'bg-yellow-100',
            'sent': 'bg-blue-100',
            'accepted': 'bg-green-100',
            'rejected': 'bg-red-100'
          };
          
          var optionsHtml = options.map(function(opt) {
            return '<option value="' + opt.value + '"' + (opt.value === currentStatus ? ' selected' : '') + '>' + opt.label + '</option>';
          }).join('');
          
          return '<select class="status-select px-2 py-1 rounded-full text-xs font-medium border-0 cursor-pointer ' + (bgColors[currentStatus] || 'bg-gray-100') + '" data-id="' + id + '">' + optionsHtml + '</select>';
        }
        
        // ステータス変更処理
        async function changeEstimateStatus(id, newStatus) {
          try {
            await axios.patch('/api/estimates/' + id + '/status', { status: newStatus });
            
            // ローカルデータも更新
            var estimate = estimates.find(function(e) { return e.id === id; });
            if (estimate) {
              estimate.status = newStatus;
            }
            
            // テーブルを再描画（選択状態を維持するため）
            renderEstimateTable();
            
          } catch (e) {
            alert('ステータスの変更に失敗しました');
            console.error(e);
            // 失敗時は元に戻すため再読み込み
            loadEstimates();
          }
        }
        
        function getStatusBadge(status) {
          var colors = {
            'draft': 'bg-gray-100 text-gray-700',
            'pending': 'bg-yellow-100 text-yellow-700',
            'sent': 'bg-blue-100 text-blue-700',
            'accepted': 'bg-green-100 text-green-700',
            'rejected': 'bg-red-100 text-red-700'
          };
          var labels = {
            'draft': '作成中',
            'pending': '未送付',
            'sent': '送付済',
            'accepted': '受注',
            'rejected': '失注'
          };
          return '<span class="px-2 py-1 rounded-full text-xs font-medium ' + (colors[status] || colors['draft']) + '">' + (labels[status] || '作成中') + '</span>';
        }
        
        // ステータスラベル取得（警告メッセージ用）
        function getStatusLabel(status) {
          var labels = {
            'draft': '作成中',
            'pending': '未送付',
            'sent': '送付済',
            'accepted': '受注',
            'rejected': '失注'
          };
          return labels[status] || '作成中';
        }
        
        function renderSidebarEstimates() {
          var container = document.getElementById('sidebarEstimateList');
          if (estimates.length === 0) {
            container.innerHTML = '<p class="text-xs text-gray-400 p-2">見積データがありません</p>';
            return;
          }
          container.innerHTML = estimates.slice(0, 20).map(function(e) {
            var isActive = currentEstimateId === e.id;
            var displayNo = e.estimate_display_no || e.estimate_no || e.estimate_number || (e.id ? 'EST-' + String(e.id).padStart(6, '0') : '');
            var displayTotal = getEstimateListDisplayTotal(e, companySettings);
            return '<div class="p-2 rounded cursor-pointer text-xs border-b estimate-item ' + (isActive ? 'bg-blue-100 border-blue-300' : 'hover:bg-gray-50') + '" data-id="' + e.id + '">' +
              '<div class="font-medium ' + (isActive ? 'text-blue-800' : 'text-gray-800') + '">' + displayNo + '</div>' +
              '<div class="text-gray-500 flex justify-between">' +
              '<span>' + (e.client_name || '得意先未設定') + '</span>' +
              '<span>¥' + displayTotal.toLocaleString() + '</span>' +
              '</div></div>';
          }).join('');
        }
        
        // サイドバー折りたたみ
        var sidebarCollapsed = true;
        
        function toggleSidebar(collapsed) {
          sidebarCollapsed = collapsed;
          var collapsedDiv = document.getElementById('sidebarCollapsed');
          var expandedDiv = document.getElementById('sidebarExpanded');
          
          if (collapsed) {
            collapsedDiv.classList.remove('hidden');
            expandedDiv.classList.add('hidden');
          } else {
            collapsedDiv.classList.add('hidden');
            expandedDiv.classList.remove('hidden');
          }
        }
        
        // 明細行の管理
        function addItemRow(item) {
          var index = items.length;
          items.push(item || { product_id: null, product_name: '', quantity: 1, unit_price: 0, retail_price: 0, tax_rate: 10, item_notes: '' });
          renderItemsTable();
        }
        
        function removeItemRow(index) {
          items.splice(index, 1);
          renderItemsTable();
          calculateTotals();
        }
        
        function renderItemsTable() {
          var thead = document.getElementById('itemsTableHead');
          var tbody = document.getElementById('itemsTableBody');
          var showRetail = document.querySelector('[name="show_retail"]:checked').value === 'yes';
          
          // ヘッダー描画（上代表記の有無で変わる）
          if (showRetail) {
            thead.innerHTML = '<tr>' +
              '<th class="px-2 py-2 text-left w-8">#</th>' +
              '<th class="px-2 py-2 text-left min-w-40">商品名</th>' +
              '<th class="px-2 py-2 text-right w-24">上代</th>' +
              '<th class="px-2 py-2 text-right w-24">下代</th>' +
              '<th class="px-2 py-2 text-center w-16">数量</th>' +
              '<th class="px-2 py-2 text-center w-16">税率</th>' +
              '<th class="px-2 py-2 text-right w-24">金額</th>' +
              '<th class="px-2 py-2 w-8"></th>' +
              '</tr>';
          } else {
            thead.innerHTML = '<tr>' +
              '<th class="px-2 py-2 text-left w-8">#</th>' +
              '<th class="px-2 py-2 text-left min-w-48">商品名</th>' +
              '<th class="px-2 py-2 text-right w-28">単価</th>' +
              '<th class="px-2 py-2 text-center w-20">数量</th>' +
              '<th class="px-2 py-2 text-center w-20">税率</th>' +
              '<th class="px-2 py-2 text-right w-28">金額</th>' +
              '<th class="px-2 py-2 w-10"></th>' +
              '</tr>';
          }
          
          // 明細行描画
          tbody.innerHTML = items.map(function(item, index) {
            var amount = item.quantity * item.unit_price;
            var rateValue = normalizeTaxRate(item.tax_rate, 10);
            var customRateOption = '';
            if (rateValue !== 10 && rateValue !== 8 && rateValue !== 0) {
              customRateOption = '<option value="' + rateValue + '" selected>' + rateValue + '%</option>';
            }
            
            if (showRetail) {
              // 上代表記あり
              var retailDisplay = item.retail_price ? item.retail_price : '';
              return '<tr class="border-b hover:bg-gray-50" data-index="' + index + '">' +
                '<td class="px-2 py-2 text-gray-500">' + (index + 1) + '</td>' +
                '<td class="px-2 py-2">' +
                '<div class="flex gap-1 mb-1">' +
                '<input type="text" class="item-product-name flex-1 border rounded px-2 py-1 text-sm" value="' + (item.product_name || '') + '" placeholder="商品名..." />' +
                '<button type="button" class="select-product-btn bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded text-xs" data-index="' + index + '"><i class="fas fa-search"></i></button>' +
                '</div>' +
                '<input type="text" class="item-item-notes w-full border border-dashed border-gray-300 rounded px-2 py-0.5 text-xs text-gray-600" value="' + (item.item_notes || '') + '" placeholder="規格・備考（PDFの品名下に表示）" />' +
                '</td>' +
                '<td class="px-2 py-2"><input type="number" class="item-retail-price w-full border rounded px-2 py-1 text-sm text-right" value="' + retailDisplay + '" placeholder="-" /></td>' +
                '<td class="px-2 py-2"><input type="number" class="item-unit-price w-full border rounded px-2 py-1 text-sm text-right" value="' + item.unit_price + '" /></td>' +
                '<td class="px-2 py-2"><input type="number" class="item-quantity w-full border rounded px-2 py-1 text-sm text-center" value="' + item.quantity + '" min="1" /></td>' +
                '<td class="px-2 py-2">' +
                '<select class="item-tax-rate w-full border rounded px-1 py-1 text-sm">' +
                customRateOption +
                '<option value="10"' + (rateValue == 10 ? ' selected' : '') + '>10%</option>' +
                '<option value="8"' + (rateValue == 8 ? ' selected' : '') + '>8%</option>' +
                '<option value="0"' + (rateValue == 0 ? ' selected' : '') + '>0%</option>' +
                '</select></td>' +
                '<td class="px-2 py-2 text-right font-medium">¥' + amount.toLocaleString() + '</td>' +
                '<td class="px-2 py-2"><button type="button" class="remove-item-btn text-red-500 hover:text-red-700" data-index="' + index + '"><i class="fas fa-times"></i></button></td>' +
                '</tr>';
            } else {
              // 上代表記なし（単価のみ）
              return '<tr class="border-b hover:bg-gray-50" data-index="' + index + '">' +
                '<td class="px-2 py-2 text-gray-500">' + (index + 1) + '</td>' +
                '<td class="px-2 py-2">' +
                '<div class="flex gap-1 mb-1">' +
                '<input type="text" class="item-product-name flex-1 border rounded px-2 py-1 text-sm" value="' + (item.product_name || '') + '" placeholder="商品名を入力..." />' +
                '<button type="button" class="select-product-btn bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded text-xs" data-index="' + index + '"><i class="fas fa-search"></i></button>' +
                '</div>' +
                '<input type="text" class="item-item-notes w-full border border-dashed border-gray-300 rounded px-2 py-0.5 text-xs text-gray-600" value="' + (item.item_notes || '') + '" placeholder="規格・備考（PDFの品名下に表示）" />' +
                '</td>' +
                '<td class="px-2 py-2"><input type="number" class="item-unit-price w-full border rounded px-2 py-1 text-sm text-right" value="' + item.unit_price + '" /></td>' +
                '<td class="px-2 py-2"><input type="number" class="item-quantity w-full border rounded px-2 py-1 text-sm text-center" value="' + item.quantity + '" min="1" /></td>' +
                '<td class="px-2 py-2">' +
                '<select class="item-tax-rate w-full border rounded px-1 py-1 text-sm">' +
                customRateOption +
                '<option value="10"' + (rateValue == 10 ? ' selected' : '') + '>10%</option>' +
                '<option value="8"' + (rateValue == 8 ? ' selected' : '') + '>8%</option>' +
                '<option value="0"' + (rateValue == 0 ? ' selected' : '') + '>0%</option>' +
                '</select></td>' +
                '<td class="px-2 py-2 text-right font-medium">¥' + amount.toLocaleString() + '</td>' +
                '<td class="px-2 py-2"><button type="button" class="remove-item-btn text-red-500 hover:text-red-700" data-index="' + index + '"><i class="fas fa-times"></i></button></td>' +
                '</tr>';
            }
          }).join('');
          
          // イベント設定
          tbody.querySelectorAll('.item-product-name').forEach(function(input, idx) {
            input.addEventListener('change', function() { items[idx].product_name = this.value; formChanged = true; if (window.SmartBill) window.SmartBill.formChanged = true; });
          });
          
          // 上代入力（上代表記時のみ）
          tbody.querySelectorAll('.item-retail-price').forEach(function(input, idx) {
            input.addEventListener('change', function() {
              items[idx].retail_price = parseFloat(this.value) || 0;
              // 上代から下代を計算（得意先の掛け率を使用）
              if (items[idx].retail_price > 0 && selectedClient && selectedClient.discount_rate) {
                items[idx].unit_price = Math.floor(items[idx].retail_price * selectedClient.discount_rate / 100);
              }
              formChanged = true; if (window.SmartBill) window.SmartBill.formChanged = true;
              renderItemsTable();
              calculateTotals();
            });
          });
          
          // 下代/単価入力
          tbody.querySelectorAll('.item-unit-price').forEach(function(input, idx) {
            input.addEventListener('change', function() {
              items[idx].unit_price = parseFloat(this.value) || 0;
              formChanged = true; if (window.SmartBill) window.SmartBill.formChanged = true;
              renderItemsTable();
              calculateTotals();
            });
          });
          
          tbody.querySelectorAll('.item-quantity').forEach(function(input, idx) {
            input.addEventListener('change', function() { items[idx].quantity = parseInt(this.value) || 1; formChanged = true; if (window.SmartBill) window.SmartBill.formChanged = true; calculateTotals(); renderItemsTable(); });
          });
          tbody.querySelectorAll('.item-tax-rate').forEach(function(select, idx) {
            select.addEventListener('change', function() { items[idx].tax_rate = parseFloat(this.value); formChanged = true; if (window.SmartBill) window.SmartBill.formChanged = true; calculateTotals(); });
          });
          tbody.querySelectorAll('.item-item-notes').forEach(function(input, idx) {
            input.addEventListener('change', function() { items[idx].item_notes = this.value; formChanged = true; if (window.SmartBill) window.SmartBill.formChanged = true; });
          });
          tbody.querySelectorAll('.select-product-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
              currentItemIndex = parseInt(this.getAttribute('data-index'));
              openProductModal();
            });
          });
          tbody.querySelectorAll('.remove-item-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
              var idx = parseInt(this.getAttribute('data-index'));
              removeItemRow(idx);
            });
          });
        }
        
        // 金額計算
        function calculateTotals() {
          var subtotal = 0;
          var taxByRate = {};
          
          items.forEach(function(item) {
            var amount = item.quantity * item.unit_price;
            subtotal += amount;
            
            // 税率0%に対応：nullやundefinedの場合のみデフォルト10%
            var rate = normalizeTaxRate(item.tax_rate, 10);
            if (!taxByRate[rate]) taxByRate[rate] = 0;
            taxByRate[rate] += Math.floor(amount * rate / 100);
          });
          
          var totalTax = 0;
          var taxBreakdownHtml = '';
          Object.keys(taxByRate).sort(function(a, b) { return parseFloat(a) - parseFloat(b); }).forEach(function(rate) {
            var rateNum = parseFloat(rate);
            totalTax += taxByRate[rate];
            if (rateNum === 0) {
              taxBreakdownHtml += '<div class="flex justify-between py-1 text-xs text-gray-500">' +
                '<span>非課税</span><span>¥0</span></div>';
            } else {
              taxBreakdownHtml += '<div class="flex justify-between py-1 text-xs text-gray-500">' +
                '<span>消費税(' + rateNum + '%)</span><span>¥' + taxByRate[rate].toLocaleString() + '</span></div>';
            }
          });
          
          document.getElementById('subtotalDisplay').textContent = '¥' + subtotal.toLocaleString();
          document.getElementById('taxBreakdown').innerHTML = taxBreakdownHtml;
          document.getElementById('taxDisplay').textContent = '¥' + totalTax.toLocaleString();
          
          // 消費税表示設定に基づいて合計を計算
          if (showTax) {
            document.getElementById('totalDisplay').textContent = '¥' + (subtotal + totalTax).toLocaleString();
          } else {
            document.getElementById('totalDisplay').textContent = '¥' + subtotal.toLocaleString();
          }
          updateEstimateSummaryLabels();
        }
        
        // 商品モーダル（見積データ入力）
        function openProductModal() {
          document.getElementById('productModal').classList.remove('hidden');
          renderProductList();
        }
        
        function closeProductModal() {
          document.getElementById('productModal').classList.add('hidden');
          currentItemIndex = null;
        }
        
        function renderProductList(search, categoryId) {
          var filtered = products.filter(function(p) {
            if (search && !p.product_name.includes(search) && !(p.product_code || '').includes(search)) return false;
            if (categoryId && p.category_id != categoryId) return false;
            return true;
          });
          
          var container = document.getElementById('productList');
          if (filtered.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-center py-4">商品が見つかりません</p>';
            return;
          }
          
          container.innerHTML = filtered.map(function(p) {
            var priceInfo = p.retail_price ? '上代: ¥' + p.retail_price.toLocaleString() + ' / 下代: ¥' + p.unit_price.toLocaleString() : '¥' + p.unit_price.toLocaleString();
            return '<div class="p-3 border rounded-lg hover:bg-blue-50 cursor-pointer product-item" data-id="' + p.id + '">' +
              '<div class="flex justify-between">' +
              '<span class="font-medium">' + p.product_name + '</span>' +
              '<span class="text-sm text-gray-500">' + (p.product_code || '') + '</span>' +
              '</div>' +
              '<div class="text-sm text-gray-600 flex justify-between mt-1">' +
              '<span>' + (p.category_name || '') + '</span>' +
              '<span>' + priceInfo + '</span>' +
              '</div></div>';
          }).join('');
          
          container.querySelectorAll('.product-item').forEach(function(el) {
            el.addEventListener('click', function() {
              var productId = parseInt(this.getAttribute('data-id'));
              selectProduct(productId);
            });
          });
        }
        
        function selectProduct(productId) {
          var product = products.find(function(p) { return p.id === productId; });
          if (!product || currentItemIndex === null) return;
          
          var showRetail = document.querySelector('[name="show_retail"]:checked').value === 'yes';
          
          // 最小ロットがあれば数量に設定（なければ既存値または1）
          var quantity = product.min_lot || items[currentItemIndex].quantity || 1;
          
          var category = categories.find(function(c) { return c.id == product.category_id; }) || null;
          var resolvedTaxRate = resolveLineTaxRate({ product: product, category: category, fallback: 10 });
          items[currentItemIndex] = {
            product_id: product.id,
            product_name: product.product_name,
            quantity: quantity,
            unit_price: product.unit_price || 0,
            retail_price: product.retail_price || 0,
            tax_rate: resolvedTaxRate,
            item_notes: product.remarks || '',  // 商品マスタの備考をitem_notesに転記
            unit: product.unit || '個'  // 単位も保持
          };
          
          // 上代表記「はい」で上代がある商品の場合、得意先の掛け率で下代を計算
          if (showRetail && selectedClient && selectedClient.discount_rate && product.retail_price) {
            items[currentItemIndex].unit_price = Math.floor(product.retail_price * selectedClient.discount_rate / 100);
          }
          
          formChanged = true; if (window.SmartBill) window.SmartBill.formChanged = true;
          closeProductModal();
          renderItemsTable();
          calculateTotals();
        }
        
        // 得意先選択時
        function onClientChange() {
          var clientId = document.getElementById('clientSelect').value;
          var clientInfoDiv = document.getElementById('clientInfo');
          
          if (!clientId) {
            selectedClient = null;
            clientInfoDiv.classList.add('hidden');
            document.getElementById('selectedClientDisplay').classList.add('hidden');
            document.getElementById('selectedClientName').textContent = '';
            document.getElementById('priceTypeHint').textContent = '';
            updateTaxDisplay(null);
            updateFormHeaderTitle();
            return;
          }
          
          selectedClient = clients.find(function(c) { return c.id == clientId; });
          if (!selectedClient) return;
          
          clientInfoDiv.classList.remove('hidden');
          updateTaxDisplay(clientId);
          
          var wholesaleInfo = document.getElementById('clientWholesaleInfo');
          var closingInfo = document.getElementById('clientClosingInfo');
          
          if (selectedClient.is_wholesale) {
            wholesaleInfo.innerHTML = '<i class="fas fa-tag text-green-600 mr-1"></i>卸売価格適用（掛け率: ' + (selectedClient.discount_rate || 100) + '%）';
            document.getElementById('priceTypeHint').textContent = '※この得意先は卸売価格が適用されます';
            // 卸売得意先は上代表記を「はい」に自動切替
            document.querySelector('[name="show_retail"][value="yes"]').checked = true;
            renderItemsTable();
          } else {
            wholesaleInfo.innerHTML = '<i class="fas fa-tag text-gray-400 mr-1"></i>通常価格';
            document.getElementById('priceTypeHint').textContent = '';
          }
          
          closingInfo.innerHTML = '<i class="fas fa-calendar text-blue-600 mr-1"></i>締日: ' + (selectedClient.closing_day || '未設定') + ' / 支払: ' + (selectedClient.payment_day || '未設定');
          updateFormHeaderTitle();
        }
        
        // フォーム表示制御
        function showTableView() {
          document.getElementById('tableView').classList.remove('hidden');
          document.getElementById('detailView').classList.add('hidden');
        }
        
        function showDetailView() {
          document.getElementById('tableView').classList.add('hidden');
          document.getElementById('detailView').classList.remove('hidden');
          // メインサイドバーを閉じる（他のマスタと同じ挙動）
          window.SmartBill.collapseSidebar();
          document.querySelector('main').scrollTo(0, 0);
        }
        
        function resetEstimateFormState() {
          currentEstimateId = null;
          originalEstimateStatus = null;
          selectedClient = null;
          document.getElementById('estimateForm').reset();
          items = [];
          addItemRow();
          
          document.querySelector('[name="estimate_no"]').value = '';
          document.getElementById('clientInfo').classList.add('hidden');
          document.getElementById('selectedClientDisplay').classList.add('hidden');
          document.getElementById('selectedClientName').textContent = '';
          document.getElementById('clientSearchInput').value = '';
          document.getElementById('clientSelect').value = '';
          document.getElementById('priceTypeHint').textContent = '';
          document.getElementById('clientWholesaleInfo').textContent = '';
          
          updateTaxDisplay(null);
          updateFormHeaderTitle();
        }
        
        // 新規作成
        async function newEstimate() {
          if (formChanged && !(await window.SmartBill.confirmLeaveAsync())) return;
          
          setFormHeaderMode('new', '<i class="fas fa-file-invoice mr-2 text-blue-600"></i>');
          resetEstimateFormState();
          
          // 今日の日付
          var today = new Date().toISOString().split('T')[0];
          document.querySelector('[name="estimate_date"]').value = today;
          
          // 有効期限・取引条件を自社情報から取得
          try {
            var companyRes = await axios.get('/api/company');
            var companyData = companyRes.data;
            var validDays = companyData.estimate_valid_days || 30;
            var validUntil = new Date();
            validUntil.setDate(validUntil.getDate() + validDays);
            document.querySelector('[name="valid_until"]').value = validUntil.toISOString().split('T')[0];
            
            // 受渡場所・取引条件・納期のデフォルト値を設定
            document.querySelector('[name="delivery_place"]').value = companyData.default_delivery_place || '';
            document.querySelector('[name="payment_terms"]').value = companyData.default_payment_terms || '';
            document.querySelector('[name="delivery_date_text"]').value = companyData.default_delivery_date || '';
          } catch (e) {
            // デフォルト30日
            var validUntil = new Date();
            validUntil.setDate(validUntil.getDate() + 30);
            document.querySelector('[name="valid_until"]').value = validUntil.toISOString().split('T')[0];
          }
          
          document.getElementById('deleteEstimateBtn').classList.add('hidden');
          document.getElementById('duplicateEstimateBtn').classList.add('hidden');
          document.getElementById('pdfEstimateBtn').classList.add('hidden');
          document.getElementById('newEstimateBtnDetail').classList.add('hidden');
          
          renderItemsTable();
          calculateTotals();
          showDetailView();
          formChanged = false; if (window.SmartBill) window.SmartBill.formChanged = false;
        }
        
        // 編集
        async function editEstimate(id) {
          var params = new URLSearchParams(window.location.search || '');
          if (params.get('action') === 'new' || window.location.pathname.endsWith('/new')) {
            console.warn('editEstimate skipped on new action', { id: id, path: window.location.pathname, search: window.location.search });
            return;
          }
          if (formChanged && !(await window.SmartBill.confirmLeaveAsync())) return;
          
          var res = await axios.get('/api/estimates/' + id);
          var data = res.data;
          var displayNo = (data && (data.estimate_no ?? data.estimate_display_no ?? data.estimate_number)) || '';
          
          currentEstimateId = id;
          originalEstimateStatus = data.status || 'draft';  // 元のステータスを保持
          document.querySelector('[name="estimate_no"]').value = displayNo;
          document.querySelector('[name="estimate_date"]').value = data.estimate_date;
          
          // 有効期限：空なら自社情報から計算して設定
          if (data.valid_until) {
            document.querySelector('[name="valid_until"]').value = data.valid_until;
          } else {
            try {
              var companyRes = await axios.get('/api/company');
              var validDays = companyRes.data.estimate_valid_days || 30;
              var baseDate = data.estimate_date ? new Date(data.estimate_date) : new Date();
              baseDate.setDate(baseDate.getDate() + validDays);
              document.querySelector('[name="valid_until"]').value = baseDate.toISOString().split('T')[0];
            } catch (e) {
              document.querySelector('[name="valid_until"]').value = '';
            }
          }
          
          document.querySelector('[name="status"]').value = data.status || 'draft';
          document.querySelector('[name="client_id"]').value = data.client_id;
          document.querySelector('[name="notes"]').value = data.notes || '';
          
          // 件名をセット（空の場合もクリア）
          document.querySelector('[name="subject"]').value = data.subject || '';
          
          // 受渡場所・取引条件・納期
          document.querySelector('[name="delivery_place"]').value = data.delivery_place || '';
          document.querySelector('[name="payment_terms"]').value = data.payment_terms || '';
          document.querySelector('[name="delivery_date_text"]').value = data.delivery_date_text || '';
          
          items = (data.items || []).map(function(item) {
            return {
              product_id: item.product_id,
              product_name: item.product_name,
              quantity: item.quantity,
              unit_price: item.unit_price,
              retail_price: item.retail_price || 0,
              tax_rate: item.tax_rate,
              item_notes: item.item_notes || ''
            };
          });
          
          if (items.length === 0) addItemRow();
          
          setFormHeaderMode('edit', '<i class="fas fa-edit mr-2 text-blue-600"></i>');
          updateFormHeaderTitle();
          document.getElementById('deleteEstimateBtn').classList.remove('hidden');
          document.getElementById('duplicateEstimateBtn').classList.remove('hidden');
          document.getElementById('pdfEstimateBtn').classList.remove('hidden');
          document.getElementById('newEstimateBtnDetail').classList.remove('hidden');
          
          // 得意先の選択表示を更新
          if (data.client_id) {
            var client = clients.find(function(c) { return c.id == data.client_id; });
            if (client) {
              var codeDisplay = client.client_code ? ' (' + client.client_code + ')' : '';
              document.getElementById('clientSearchInput').value = client.client_name + codeDisplay;
              document.getElementById('selectedClientName').textContent = client.client_name + codeDisplay;
              document.getElementById('selectedClientDisplay').classList.remove('hidden');
            }
          } else {
            document.getElementById('selectedClientDisplay').classList.add('hidden');
          }
          
          onClientChange();
          renderItemsTable();
          calculateTotals();
          renderSidebarEstimates();
          showDetailView();
          formChanged = false; if (window.SmartBill) window.SmartBill.formChanged = false;
        }
        
        // 保存
        async function saveEstimate() {
          var form = document.getElementById('estimateForm');
          var clientIdValue = form.querySelector('[name="client_id"]').value;
          if (!clientIdValue) {
            window.SmartBill.showErrorDialog('得意先を選択してください。');
            return;
          }
          
          var validItems = items.filter(function(item) { return item.product_name && item.quantity > 0; });
          
          // 送付済み以降のステータスで内容変更時の警告
          var sentOrLaterStatuses = ['sent', 'accepted', 'rejected'];
          if (currentEstimateId && originalEstimateStatus && sentOrLaterStatuses.includes(originalEstimateStatus)) {
            if (!confirm('この見積は「' + getStatusLabel(originalEstimateStatus) + '」です。\\n内容を変更すると、関連する納品書・請求書と異なる可能性があります。\\n\\n保存してもよろしいですか？')) {
              return;
            }
          }
          
          // 上代表記「はい」で上代なし商品がある場合の警告
          var showRetail = document.querySelector('[name="show_retail"]:checked').value === 'yes';
          if (showRetail) {
            var hasNoRetailPrice = validItems.some(function(item) { return !item.retail_price || item.retail_price === 0; });
            if (hasNoRetailPrice) {
              if (!confirm('上代表記ありですが、上代が設定されていない商品があります。\\nこのまま保存しますか？')) {
                return;
              }
            }
          }
          
          var formData = new FormData(form);
          var data = {
            estimate_no: formData.get('estimate_no'),
            estimate_date: formData.get('estimate_date'),
            valid_until: formData.get('valid_until') || null,
            status: formData.get('status'),
            client_id: parseInt(formData.get('client_id')),
            subject: formData.get('subject') || '',
            notes: formData.get('notes') || '',
            delivery_place: formData.get('delivery_place') || '',
            payment_terms: formData.get('payment_terms') || '',
            delivery_date_text: formData.get('delivery_date_text') || '',
            items: validItems
          };
          
          try {
            if (currentEstimateId) {
              await axios.put('/api/estimates/' + currentEstimateId, data);
            } else {
              var res = await axios.post('/api/estimates', data);
              currentEstimateId = res.data.id;
              if (res.data && res.data.estimate_no) {
                document.querySelector('[name="estimate_no"]').value = res.data.estimate_no;
                updateFormHeaderTitle();
              }
            }
            
            formChanged = false; if (window.SmartBill) window.SmartBill.formChanged = false;
            if (window.SmartBill) window.SmartBill.resetFormTracking();
            await loadEstimates();
            await loadRecentEstimates();
            renderSidebarEstimates();
            
            window.SmartBill.showSuccessDialog('見積を保存しました');
            
            setFormHeaderMode('edit', '<i class="fas fa-edit mr-2 text-blue-600"></i>');
            updateFormHeaderTitle();
            document.getElementById('deleteEstimateBtn').classList.remove('hidden');
            document.getElementById('duplicateEstimateBtn').classList.remove('hidden');
            document.getElementById('pdfEstimateBtn').classList.remove('hidden');
          } catch (e) {
            window.SmartBill.showErrorDialog('見積の保存に失敗しました');
            console.error(e);
          }
        }
        
        // PDF出力（プレビュー表示）
        async function exportEstimatePDF() {
          if (!currentEstimateId) {
            alert('見積を保存してからPDF出力してください');
            return;
          }
          
          try {
            // 見積データを取得
            var res = await axios.get('/api/estimates/' + currentEstimateId);
            var estimateData = res.data;
            
            // 自社情報を取得
            var companyRes = await axios.get('/api/company');
            var companyInfo = companyRes.data;
            
            // 取引先情報を取得（住所・敬称等のため）
            var clientInfo = {};
            if (estimateData.client_id) {
              try {
                var clientRes = await axios.get('/api/clients/' + estimateData.client_id);
                clientInfo = clientRes.data || {};
              } catch (e) {
                console.error('取引先情報取得エラー:', e);
              }
            }
            
            // 現在の上代表記設定を取得
            var showRetail = document.querySelector('[name="show_retail"]:checked');
            var showRetailValue = showRetail ? showRetail.value === 'yes' : false;
            
            // PDFデータを構築
            var pdfData = {
              estimate_no: estimateData.estimate_no,
              estimate_date: estimateData.estimate_date,
              valid_until: estimateData.valid_until,
              client_name: estimateData.client_name,
              subject: estimateData.subject,
              items: estimateData.items || [],
              subtotal: estimateData.subtotal,
              tax_amount: estimateData.tax_amount,
              total_amount: estimateData.total_amount,
              notes: estimateData.notes,
              delivery_place: estimateData.delivery_place,
              payment_terms: estimateData.payment_terms,
              delivery_date_text: estimateData.delivery_date_text,
              companyInfo: companyInfo,
              clientInfo: clientInfo,
              show_retail: showRetailValue
            };
            
            // プレビュー表示
            window.SmartBillPDF.previewEstimatePDF(pdfData);
            
            // 見積書ステータスを「未送付」に自動変更（作成中の場合のみ）
            if (estimateData.status === 'draft') {
              try {
                await axios.patch('/api/estimates/' + currentEstimateId + '/status', { status: 'pending' });
                // 画面上のステータスも更新
                var statusSelect = document.querySelector('[name="status"]');
                if (statusSelect) statusSelect.value = 'pending';
                var estimate = estimates.find(function(est) { return est.id === currentEstimateId; });
                if (estimate) estimate.status = 'pending';
                renderEstimateTable();
              } catch (err) {
                console.error('見積書ステータス更新エラー:', err);
              }
            }
            
          } catch (e) {
            alert('PDF出力に失敗しました');
            console.error(e);
          }
        }
        
        // 削除
        async function deleteEstimate() {
          if (!currentEstimateId) return;
          
          var confirmed = await window.SmartBill.confirmDelete('この見積');
          if (!confirmed) return;
          
          try {
            await axios.delete('/api/estimates/' + currentEstimateId);
            formChanged = false; if (window.SmartBill) window.SmartBill.formChanged = false;
            await loadEstimates();
            await loadRecentEstimates();
            newEstimate();
            window.SmartBill.showSuccessDialog('見積を削除しました');
          } catch (e) {
            alert('削除に失敗しました');
            console.error(e);
          }
        }
        
        // 複製
        async function duplicateEstimate() {
          if (!currentEstimateId) return;
          
          // 新規として扱う
          currentEstimateId = null;
          
          // 複製時は番号を空にする（保存時に採番）
          document.querySelector('[name="estimate_no"]').value = '';
          
          // 今日の日付
          var today = new Date().toISOString().split('T')[0];
          document.querySelector('[name="estimate_date"]').value = today;
          
          // ステータスを下書きに
          document.querySelector('[name="status"]').value = 'draft';
          
          setFormHeaderMode('custom', '<i class="fas fa-copy mr-2 text-purple-600"></i>');
          document.getElementById('formTitle').innerHTML = '<i class="fas fa-copy mr-2 text-purple-600"></i>見積複製（新規）';
          document.getElementById('deleteEstimateBtn').classList.add('hidden');
          document.getElementById('duplicateEstimateBtn').classList.add('hidden');
          document.getElementById('pdfEstimateBtn').classList.add('hidden');
          
          formChanged = true; if (window.SmartBill) window.SmartBill.formChanged = true;
        }
        
        // イベント設定
        function setupEventListeners() {
          // 検索・フィルター用のヘルパー関数
          function getFilterValues() {
            return {
              search: document.getElementById('searchInputTable').value,
              status: document.getElementById('statusFilter').value,
              month: document.getElementById('monthFilter').value
            };
          }
          
          function applyFilters() {
            var f = getFilterValues();
            loadEstimates(f.search, f.status, f.month);
          }
          
          // 検索
          var searchTimeout;
          document.getElementById('searchInputTable').addEventListener('input', function() {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(function() { applyFilters(); }, 300);
          });
          
          document.getElementById('statusFilter').addEventListener('change', function() {
            applyFilters();
          });
          
          document.getElementById('monthFilter').addEventListener('change', function() {
            applyFilters();
          });
          
          document.getElementById('clearFiltersBtn').addEventListener('click', function() {
            document.getElementById('searchInputTable').value = '';
            document.getElementById('statusFilter').value = '';
            document.getElementById('monthFilter').value = '';
            loadEstimates();
          });
          
          document.getElementById('sidebarSearch').addEventListener('input', function() {
            var search = this.value.toLowerCase();
            document.querySelectorAll('#sidebarEstimateList .estimate-item').forEach(function(el) {
              var text = el.textContent.toLowerCase();
              el.style.display = text.includes(search) ? '' : 'none';
            });
          });
          
          // ボタン
          document.getElementById('newEstimateBtnTable').addEventListener('click', newEstimate);
          document.getElementById('newEstimateBtnDetail').addEventListener('click', newEstimate);
          document.getElementById('backToTableBtn').addEventListener('click', async function() {
            if (formChanged && !(await window.SmartBill.confirmLeaveAsync())) return;
            formChanged = false; if (window.SmartBill) window.SmartBill.formChanged = false;
            showTableView();
          });
          document.getElementById('backToTableBtnCollapsed').addEventListener('click', async function() {
            if (formChanged && !(await window.SmartBill.confirmLeaveAsync())) return;
            formChanged = false; if (window.SmartBill) window.SmartBill.formChanged = false;
            showTableView();
          });
          document.getElementById('saveEstimateBtn').addEventListener('click', saveEstimate);
          document.getElementById('deleteEstimateBtn').addEventListener('click', deleteEstimate);
          document.getElementById('duplicateEstimateBtn').addEventListener('click', duplicateEstimate);
          document.getElementById('pdfEstimateBtn').addEventListener('click', exportEstimatePDF);
          document.querySelector('[name="estimate_no"]').addEventListener('input', function() {
            updateFormHeaderTitle();
          });
          document.getElementById('addItemBtn').addEventListener('click', function() { addItemRow(); });
          
          // サイドバー折りたたみ
          document.getElementById('expandSidebarBtn').addEventListener('click', function() {
            toggleSidebar(false);
          });
          document.getElementById('collapseSidebarBtn').addEventListener('click', function() {
            toggleSidebar(true);
          });
          
          // 得意先サジェスト
          var clientSearchInput = document.getElementById('clientSearchInput');
          var clientSearchTimeout;
          
          clientSearchInput.addEventListener('input', function() {
            clearTimeout(clientSearchTimeout);
            var search = this.value;
            clientSearchTimeout = setTimeout(function() {
              showClientSuggest(search);
            }, 150);
          });
          
          clientSearchInput.addEventListener('focus', function() {
            showClientSuggest(this.value);
          });
          
          // 外側クリックでサジェストを閉じる
          document.addEventListener('click', function(e) {
            var suggestList = document.getElementById('clientSuggestList');
            var searchInput = document.getElementById('clientSearchInput');
            var toggleBtn = document.getElementById('clientSelectToggle');
            if (!suggestList.contains(e.target) && e.target !== searchInput && e.target !== toggleBtn && !toggleBtn.contains(e.target)) {
              hideClientSuggest();
            }
          });
          
          // 一覧表示トグルボタン
          document.getElementById('clientSelectToggle').addEventListener('click', function() {
            var suggestList = document.getElementById('clientSuggestList');
            if (suggestList.classList.contains('hidden')) {
              showClientSuggest('');
            } else {
              hideClientSuggest();
            }
          });
          
          // 選択クリアボタン
          document.getElementById('clearClientBtn').addEventListener('click', function() {
            clearClientSelection();
          });
          
          // 得意先変更（従来のselect用 - 互換性のため残す）
          document.getElementById('clientSelect').addEventListener('change', function() {
            onClientChange();
            formChanged = true; if (window.SmartBill) window.SmartBill.formChanged = true;
          });
          
          // 上代表記切替
          document.querySelectorAll('[name="show_retail"]').forEach(function(radio) {
            radio.addEventListener('change', function() {
              renderItemsTable();
              formChanged = true; if (window.SmartBill) window.SmartBill.formChanged = true;
            });
          });
          
          // 商品モーダル
          document.getElementById('closeProductModal').addEventListener('click', closeProductModal);
          document.getElementById('productModal').addEventListener('click', function(e) {
            if (e.target === this) closeProductModal();
          });
          document.getElementById('productSearchInput').addEventListener('input', function() {
            renderProductList(this.value, document.getElementById('productCategoryFilter').value);
          });
          document.getElementById('productCategoryFilter').addEventListener('change', function() {
            renderProductList(document.getElementById('productSearchInput').value, this.value);
          });
          
          // テーブル行クリック
          document.getElementById('estimateTableBody').addEventListener('click', function(e) {
            var row = e.target.closest('.estimate-row');
            if (row) editEstimate(parseInt(row.getAttribute('data-id')));
          });
          
          // サイドバー・最近編集クリック
          document.addEventListener('click', function(e) {
            var item = e.target.closest('.estimate-item');
            if (item) editEstimate(parseInt(item.getAttribute('data-id')));
          });
          
          // キーボードショートカット
          document.addEventListener('keydown', function(e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
              e.preventDefault();
              if (!document.getElementById('detailView').classList.contains('hidden')) {
                saveEstimate();
              }
            }
            if (e.key === 'Escape') {
              if (!document.getElementById('productModal').classList.contains('hidden')) {
                closeProductModal();
              }
            }
          });
          
          // フォーム変更検知
          document.getElementById('estimateForm').addEventListener('input', function() { formChanged = true; if (window.SmartBill) window.SmartBill.formChanged = true; });
        }
        
        // 初期化実行
        init();
      `}} />
    </Layout>
  )
})

app.get('/invoices', async (c) => {
  return c.html(
    <Layout title="請求書作成" currentPath="/invoices" hideTitle={true}>
      {/* 初期表示: テーブル一覧 */}
      <div id="tableView">
        {/* 固定ヘッダー: タイトル + 検索バー */}
        <div class="sticky top-0 z-20 -mx-4 md:-mx-8 px-4 md:px-8 pt-0 pb-4 bg-gray-100">
          <h2 class="text-2xl font-bold text-gray-800 mb-4 pt-0">請求書作成</h2>
          <div class="bg-white rounded-lg shadow p-4">
            <div class="flex flex-wrap gap-4 items-end justify-between">
              <div class="flex flex-wrap gap-3 items-end flex-1">
                <div class="flex-1 min-w-64 max-w-md">
                  <label class="block text-xs font-medium text-gray-600 mb-1">
                    <i class="fas fa-search mr-1"></i>検索
                  </label>
                  <input type="text" id="searchInputTable" 
                    placeholder="請求番号、得意先名、備考で検索..."
                    class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
                </div>
                <div class="w-36">
                  <label class="block text-xs font-medium text-gray-600 mb-1">ステータス</label>
                  <select id="statusFilter" class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
                    <option value="">すべて</option>
                    <option value="draft">作成中</option>
                    <option value="pending">未送付</option>
                    <option value="sent">送付済</option>
                    <option value="paid">入金済</option>
                    <option value="overdue">支払遅延</option>
                  </select>
                </div>
                <div class="w-36">
                  <label class="block text-xs font-medium text-gray-600 mb-1">年月</label>
                  <input type="month" id="monthFilter" 
                    class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
                </div>
                <button type="button" id="clearFiltersBtn" 
                  class="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm transition-colors" 
                  title="検索をクリア">
                  <i class="fas fa-times"></i>
                </button>
              </div>
              <div class="flex gap-2">
                <button id="fromDeliveriesBtnTable" class="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg">
                  <i class="fas fa-file-import mr-2"></i>納品書から作成
                </button>
                <button id="newInvoiceBtnTable" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg">
                  <i class="fas fa-plus mr-2"></i>新規作成
                </button>
              </div>
            </div>
          </div>
        </div>
        
        <div class="bg-white rounded-lg shadow overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">請求番号</th>
                  <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">請求日</th>
                  <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">得意先</th>
                  <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">請求期間</th>
                  <th class="px-4 py-3 text-right text-sm font-medium text-gray-700">合計金額</th>
                  <th class="px-4 py-3 text-center text-sm font-medium text-gray-700">ステータス</th>
                  <th class="px-4 py-3 text-center text-sm font-medium text-gray-700">操作</th>
                </tr>
              </thead>
              <tbody id="invoiceTableBody" class="divide-y">
                {/* 動的に生成 */}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 詳細表示: 2カラムレイアウト */}
      <div id="detailView" class="hidden">
        <div class="flex gap-4">
          {/* 左サイドバー（折りたたみ時） */}
          <div id="sidebarCollapsed" class="w-12 flex-shrink-0">
            <div class="bg-white rounded-lg shadow p-2 sticky top-4">
              <button id="expandSidebarBtn" class="w-full text-center py-2 text-gray-600 hover:text-blue-600" title="サイドバーを開く">
                <i class="fas fa-chevron-right"></i>
              </button>
              <div class="border-t my-2"></div>
              <button id="backToTableBtnCollapsed" class="w-full text-center py-2 text-gray-600 hover:text-blue-600" title="一覧に戻る">
                <i class="fas fa-th-list"></i>
              </button>
            </div>
          </div>
          
          {/* 左サイドバー（展開時） */}
          <div id="sidebarExpanded" class="w-80 flex-shrink-0 hidden sticky top-4 self-start" data-subsidebar="invoices">
            {/* 検索 */}
            <div class="bg-white rounded-lg shadow mb-4">
              <div class="p-3">
                <div class="flex items-center justify-between mb-2">
                  <button id="backToTableBtn" class="text-sm text-slate-700 hover:text-slate-900" title="一覧に戻る">
                    <i class="fas fa-th-list mr-1"></i>一覧に戻る
                  </button>
                  <button id="collapseSidebarBtn" class="text-sm text-slate-700 hover:text-slate-900" title="サイドバーを閉じる">
                    <i class="fas fa-times mr-1"></i>閉じる
                  </button>
                </div>
                <input type="text" id="sidebarSearch" placeholder="検索..." 
                  class="w-full border rounded px-2 py-1 text-sm" />
              </div>
            </div>
            
            <div class="bg-white rounded-lg shadow mb-4" id="recentInvoicesSection">
              <div class="p-3 border-b bg-gray-50 flex items-center justify-between cursor-pointer" id="recentToggle" data-recent-toggle="invoices">
                <h3 class="text-slate-700 text-sm font-medium">
                  <i class="fas fa-clock mr-2 text-orange-500 text-sm"></i>最近編集
                </h3>
                <i class="fas fa-chevron-down text-gray-400 text-xs transition-transform duration-200" id="recentToggleIcon" data-recent-chevron="invoices"></i>
              </div>
              <div id="recentInvoices" class="p-2 space-y-1 max-h-48 overflow-y-auto" data-recent-body="invoices">
                {/* 動的に生成 */}
              </div>
            </div>
            
            <div class="bg-white rounded-lg shadow">
              <div class="p-3 border-b bg-gray-50 flex items-center justify-between">
                <h3 class="text-slate-700 text-sm font-medium">
                  <i class="fas fa-file-invoice-dollar mr-2 text-indigo-600 text-sm"></i>請求書一覧
                </h3>
              </div>
              <div class="p-2">
                <div id="sidebarInvoiceList" class="max-h-[calc(100vh-220px)] overflow-y-auto space-y-1">
                  {/* 動的に生成 */}
                </div>
              </div>
            </div>
          </div>

          {/* 右側フォーム */}
          <div class="flex-1">
            <div class="bg-white rounded-lg shadow">
              {/* ヘッダー - 固定 */}
              <div class="sticky top-0 z-10 p-4 border-b bg-gradient-to-r from-indigo-50 to-purple-50 flex items-center justify-between rounded-t-lg flex-wrap gap-2 shadow-sm">
                <h2 id="formTitle" class="text-xl font-bold text-gray-800">
                  <i class="fas fa-file-invoice-dollar mr-2 text-indigo-600"></i>新規請求書作成
                </h2>
                <div class="flex gap-2 flex-wrap">
                  <button type="button" id="newInvoiceBtnDetail" class="hidden bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-sm">
                    <i class="fas fa-plus mr-1"></i>新規
                  </button>
                  <button type="button" id="duplicateInvoiceBtn" class="hidden bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg text-sm">
                    <i class="fas fa-copy mr-1"></i>複製
                  </button>
                  <button type="button" id="deleteInvoiceBtn" class="hidden bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-sm">
                    <i class="fas fa-trash-alt mr-1"></i>削除
                  </button>
                  <span id="pageUnsavedIndicator" class="text-sm text-red-600 font-semibold hidden">●未保存</span>
                  <button type="button" id="saveInvoiceBtn" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-sm font-bold">
                    <i class="fas fa-save mr-1"></i>保存
                  </button>
                  <button type="button" id="pdfInvoiceBtn" class="hidden bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded-lg text-sm font-bold">
                    <i class="fas fa-file-pdf mr-1"></i>PDF出力
                  </button>
                </div>
              </div>

              <form id="invoiceForm" class="p-6" data-track-unsaved="true">
                {/* 基本情報 */}
                <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">請求番号 *</label>
                    <div class="flex gap-1">
                      <input type="text" name="invoice_no"
                        class="flex-1 min-w-0 border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <p class="text-xs text-gray-500 mt-1">未入力のまま保存すると自動採番されます。</p>
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">請求日 *</label>
                    <input type="date" name="invoice_date"
                      class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">支払期限</label>
                    <input type="date" name="payment_due_date"
                      class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">ステータス</label>
                    <select name="status" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500">
                      <option value="draft">作成中</option>
                      <option value="pending">未送付</option>
                      <option value="sent">送付済</option>
                      <option value="paid">入金済</option>
                      <option value="overdue">支払遅延</option>
                    </select>
                  </div>
                </div>

                {/* 得意先選択 */}
                <div class="mb-6 p-4 bg-gray-50 rounded-lg">
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-1">得意先 *</label>
                      <div class="relative">
                        <div class="flex gap-2">
                          <div class="flex-1 relative">
                            <input type="text" id="clientSearchInput" placeholder="取引先名・コードで検索..."
                              class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" autocomplete="off" />
                            <div id="clientSuggestList" class="absolute z-50 w-full bg-white border rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto hidden">
                            </div>
                          </div>
                          <button type="button" id="clientSelectToggle" class="bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-lg text-gray-600" title="一覧から選択">
                            <i class="fas fa-chevron-down"></i>
                          </button>
                        </div>
                        <select name="client_id" id="clientSelect" class="hidden">
                          <option value="">得意先を選択...</option>
                        </select>
                        <div id="selectedClientDisplay" class="hidden mt-2 p-2 bg-gray-50 rounded-lg flex items-center justify-between">
                          <span id="selectedClientName" class="font-medium text-gray-700"></span>
                          <button type="button" id="clearClientBtn" class="text-blue-600 hover:text-blue-800 text-sm">
                            <i class="fas fa-times"></i> クリア
                          </button>
                        </div>
                      </div>
                    </div>
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-1">請求期間</label>
                      <div class="flex gap-2 items-center">
                        <input type="date" name="billing_period_start"
                          class="flex-1 border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
                        <span class="text-gray-500">〜</span>
                        <input type="date" name="billing_period_end"
                          class="flex-1 border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
                      </div>
                    </div>
                  </div>
                  <div id="clientInfo" class="mt-3 text-sm text-gray-600 hidden">
                    <div class="flex flex-wrap gap-4">
                      <span id="clientClosingInfo"></span>
                      <span id="clientPaymentInfo"></span>
                    </div>
                  </div>
                </div>

                {/* 対象納品書セクション */}
                <div id="deliveriesSection" class="mb-6 p-4 bg-yellow-50 rounded-lg hidden">
                  <div class="flex items-center justify-between mb-3">
                    <h3 class="font-bold text-gray-700">
                      <i class="fas fa-truck mr-2 text-yellow-600"></i>対象納品書
                    </h3>
                    <button type="button" id="loadDeliveriesBtn" class="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1.5 rounded-lg text-sm">
                      <i class="fas fa-sync-alt mr-1"></i>納品書を取得
                    </button>
                  </div>
                  <div id="deliveriesList" class="space-y-2 max-h-48 overflow-y-auto">
                    <p class="text-sm text-gray-500">得意先を選択して「納品書を取得」をクリックしてください</p>
                  </div>
                  <div id="selectedDeliveriesInfo" class="mt-3 pt-3 border-t border-yellow-200 hidden">
                    <span class="text-sm font-medium text-yellow-800">
                      <i class="fas fa-check-circle mr-1"></i>
                      <span id="selectedDeliveriesCount">0</span>件の納品書を選択中
                    </span>
                  </div>
                </div>

                {/* 明細テーブル */}
                <div class="mb-6">
                  <div class="flex items-center justify-between mb-2">
                    <h3 class="font-bold text-gray-700">
                      <i class="fas fa-list mr-2 text-indigo-600"></i>明細
                    </h3>
                    <button type="button" id="addItemBtn" class="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-sm">
                      <i class="fas fa-plus mr-1"></i>明細追加
                    </button>
                  </div>
                  <div class="overflow-x-auto border rounded-lg">
                    <table class="w-full text-sm">
                      <thead id="itemsTableHead" class="bg-gray-100">
                        <tr>
                          <th class="px-2 py-2 text-left w-12" title="ドラッグで並び替え可能"><i class="fas fa-grip-vertical text-gray-400 mr-1"></i>#</th>
                          <th class="px-2 py-2 text-left w-24">納品日</th>
                          <th class="px-2 py-2 text-left min-w-48">品名</th>
                          <th class="px-2 py-2 text-right w-28">単価</th>
                          <th class="px-2 py-2 text-center w-20">数量</th>
                          <th class="px-2 py-2 text-center w-20">税率</th>
                          <th class="px-2 py-2 text-right w-28">金額</th>
                          <th class="px-2 py-2 w-10"></th>
                        </tr>
                      </thead>
                      <tbody id="itemsTableBody">
                        {/* 動的に生成 */}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 合計金額 */}
                <div class="flex justify-end mb-6">
                  <div class="w-72 bg-gray-50 rounded-lg p-4">
                    <div class="flex justify-between py-2 border-b">
                      <span class="text-gray-600">小計</span>
                      <span id="subtotalDisplay" class="font-bold">¥0</span>
                    </div>
                    <div id="taxBreakdown" class="text-sm">
                    </div>
                    <div class="flex justify-between py-2 border-b">
                      <span class="text-gray-600">消費税</span>
                      <span id="taxDisplay" class="font-bold">¥0</span>
                    </div>
                    <div class="flex justify-between py-3 text-lg">
                      <span class="font-bold text-gray-800">合計</span>
                      <span id="totalDisplay" class="font-bold text-indigo-600">¥0</span>
                    </div>
                  </div>
                </div>

                {/* 振込先 */}
                <div class="mb-6 p-4 bg-blue-50 rounded-lg">
                  <h3 class="font-bold text-gray-700 mb-3 flex items-center justify-between">
                    <span><i class="fas fa-university mr-2 text-blue-600"></i>振込先</span>
                    <span class="flex items-center gap-2">
                      <span id="invoiceBankAccountLimitHint" class="hidden text-sm text-red-600 font-semibold">
                        ※上限3件です。選択を外すと追加できます。
                      </span>
                      <span id="bankAccountSelectedCount" class="text-xs text-gray-500 font-semibold">振込先：0/3</span>
                    </span>
                  </h3>
                  <div id="bankAccountLimitNote" class="text-sm text-red-600 hidden"></div>
                  <div id="bankAccountsEmpty" class="text-sm text-gray-600">
                    振込先が登録されていません
                    <div class="mt-1 text-xs text-gray-500">※最大3件まで選択できます</div>
                  </div>
                  <div id="bankAccountsOptions" class="mt-3 space-y-2"></div>
                  <div id="bankAccountPreview" class="text-sm text-gray-600 hidden p-2 bg-white rounded">
                  </div>
                  <input type="hidden" name="bank_info" id="bankInfoInput" />
                </div>

                {/* 備考 */}
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">
                    <i class="fas fa-sticky-note mr-1 text-yellow-500"></i>備考
                  </label>
                  <textarea name="notes" rows={3} placeholder="請求書に印刷される備考欄"
                    class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"></textarea>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* 商品選択モーダル */}
      <div id="productModal" class="fixed inset-0 bg-black bg-opacity-50 hidden z-50 flex items-center justify-center">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
          <div class="p-4 border-b bg-gray-50 flex items-center justify-between">
            <h3 class="font-bold text-gray-800">
              <i class="fas fa-box mr-2 text-blue-600"></i>商品を選択
            </h3>
            <button type="button" id="closeProductModal" class="text-gray-500 hover:text-gray-700">
              <i class="fas fa-times text-xl"></i>
            </button>
          </div>
          <div class="p-4">
            <div class="flex gap-2 mb-4">
              <input type="text" id="productSearchInput" placeholder="商品名・コードで検索..."
                class="flex-1 border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
              <select id="productCategoryFilter" class="border rounded-lg px-3 py-2">
                <option value="">全カテゴリ</option>
              </select>
            </div>
            <div id="productList" class="max-h-[calc(100vh-260px)] overflow-y-auto space-y-2 pb-12">
              {/* 動的に生成 */}
            </div>
          </div>
        </div>
      </div>

      {/* 納品書から一括作成モーダル */}
      <div id="batchCreateModal" class="fixed inset-0 bg-black bg-opacity-50 hidden z-50 flex items-center justify-center">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[85vh] overflow-hidden">
          <div class="p-4 border-b bg-gradient-to-r from-purple-50 to-indigo-50 flex items-center justify-between">
            <h3 class="font-bold text-gray-800 text-lg">
              <i class="fas fa-file-import mr-2 text-purple-600"></i>納品書から請求書を一括作成
            </h3>
            <button type="button" id="closeBatchModal" class="text-gray-500 hover:text-gray-700">
              <i class="fas fa-times text-xl"></i>
            </button>
          </div>
          <div class="p-4">
            {/* ステップ1: 締め月選択 */}
            <div class="flex gap-4 mb-4 items-end">
              <div class="w-48">
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  <i class="fas fa-calendar mr-1 text-blue-600"></i>締め月
                </label>
                <input type="month" id="batchTargetMonth" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
              </div>
              <button type="button" id="searchClientsBtn" class="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-bold">
                <i class="fas fa-search mr-1"></i>未請求の得意先を検索
              </button>
            </div>
            
            {/* 未納品データアラート */}
            <div id="undeliveredAlert"></div>
            
            {/* 得意先一覧 */}
            <div class="border rounded-lg overflow-hidden mb-4">
              <div class="bg-gray-100 px-4 py-2 border-b flex items-center justify-between">
                <span class="font-medium text-gray-700">
                  <i class="fas fa-building mr-1"></i>未請求納品書のある得意先
                </span>
                <div class="flex gap-2">
                  <button type="button" id="selectAllClientsBtn" class="text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 px-2 py-1 rounded">
                    <i class="fas fa-check-double mr-1"></i>全選択
                  </button>
                  <button type="button" id="unselectAllClientsBtn" class="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded">
                    <i class="fas fa-times mr-1"></i>全解除
                  </button>
                </div>
              </div>
              <div class="max-h-80 overflow-y-auto">
                <table class="w-full text-sm">
                  <thead class="bg-gray-50 sticky top-0">
                    <tr>
                      <th class="px-3 py-2 text-center w-12">
                        <input type="checkbox" id="selectAllClientsCheck" class="rounded" title="全選択/解除" />
                      </th>
                      <th class="px-3 py-2 text-left">得意先名</th>
                      <th class="px-3 py-2 text-left w-24">得意先コード</th>
                      <th class="px-3 py-2 text-center w-20">締め日</th>
                      <th class="px-3 py-2 text-center w-20">納品件数</th>
                      <th class="px-3 py-2 text-right w-32">合計金額</th>
                      <th class="px-3 py-2 text-center w-24">詳細</th>
                    </tr>
                  </thead>
                  <tbody id="batchClientList" class="divide-y">
                    <tr><td colSpan={7} class="px-3 py-8 text-center text-gray-500">締め月を選択して「検索」をクリックしてください</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
            
            {/* アクションエリア */}
            <div class="bg-gray-50 rounded-lg p-4 flex flex-wrap gap-4 items-center justify-between">
              <div class="flex items-center gap-4">
                <span class="text-gray-700">
                  <i class="fas fa-check-circle text-green-600 mr-1"></i>
                  <span id="batchSelectedCount" class="font-bold">0</span>社選択中
                </span>
                <span class="text-gray-500">|</span>
                <span class="text-gray-700">
                  合計: <span id="batchSelectedTotal" class="font-bold text-indigo-600">¥0</span>
                </span>
              </div>
              <div class="flex gap-2">
                <button type="button" id="batchCreateBtn" class="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed">
                  <i class="fas fa-file-invoice-dollar mr-2"></i>選択した得意先の請求書を作成
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* 納品書詳細モーダル（1社分） */}
      <div id="deliveryDetailModal" class="fixed inset-0 bg-black bg-opacity-50 hidden z-50 flex items-center justify-center">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] overflow-hidden">
          <div class="p-4 border-b bg-gradient-to-r from-green-50 to-teal-50 flex items-center justify-between">
            <h3 id="deliveryDetailTitle" class="font-bold text-gray-800">
              <i class="fas fa-truck mr-2 text-green-600"></i>納品書詳細
            </h3>
            <button type="button" id="closeDeliveryDetailModal" class="text-gray-500 hover:text-gray-700">
              <i class="fas fa-times text-xl"></i>
            </button>
          </div>
          <div class="p-4">
            <div id="deliveryDetailPeriod" class="text-sm text-gray-600 mb-3">
              <i class="fas fa-calendar-alt mr-1"></i>請求期間: <span id="deliveryDetailPeriodText"></span>
            </div>
            <div class="border rounded-lg overflow-hidden mb-4 max-h-64 overflow-y-auto">
              <table class="w-full text-sm">
                <thead class="bg-gray-100 sticky top-0">
                  <tr>
                    <th class="px-3 py-2 text-left">納品番号</th>
                    <th class="px-3 py-2 text-left">納品日</th>
                    <th class="px-3 py-2 text-right">金額</th>
                  </tr>
                </thead>
                <tbody id="deliveryDetailList" class="divide-y">
                </tbody>
              </table>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-gray-700">
                合計: <span id="deliveryDetailTotal" class="font-bold text-lg text-green-600">¥0</span>
              </span>
              <button type="button" id="createSingleInvoiceBtn" class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-bold">
                <i class="fas fa-file-invoice-dollar mr-2"></i>この得意先の請求書を作成
              </button>
            </div>
          </div>
        </div>
      </div>

      <script dangerouslySetInnerHTML={{__html: `
        ${docHeaderTitleHelpers}
        ${bankAccountTypeHelpers}
        ${taxRateHelpers}
        ${recentAccordionScript}
        // 状態管理
        var currentInvoiceId = null;
        var originalInvoiceStatus = null;
        var invoices = [];
        var clients = [];
        var products = [];
        var categories = [];
        var items = [];
        var formChanged = false; if (window.SmartBill) window.SmartBill.formChanged = false;
        var selectedClient = null;
        var currentItemIndex = null;
        var bankAccounts = [];
        var selectedBankAccountIds = [];
        var BANK_ACCOUNT_SELECT_MAX = 3;
        var bankAccountLimitNoteMode = '';
        var companyDefaults = { closing_day: '', payment_day: '' };
        var selectedDeliveryIds = [];
        var lastSelectedClientId = localStorage.getItem('lastSelectedClientId');
        var currentHeaderMode = null;
        var currentHeaderIconHtml = '';

        function setFormHeaderMode(mode, iconHtml) {
          currentHeaderMode = mode;
          currentHeaderIconHtml = iconHtml || '';
        }

        function getCurrentClientLabel() {
          if (selectedClient) return getClientDisplayLabel(selectedClient);
          var selectedName = document.getElementById('selectedClientName');
          return selectedName ? normalizeHeaderText(selectedName.textContent) : '';
        }

        function updateFormHeaderTitle() {
          if (currentHeaderMode !== 'new' && currentHeaderMode !== 'edit') return;
          var titleEl = document.getElementById('formTitle');
          if (!titleEl) return;
          var docNoInput = document.querySelector('[name="invoice_no"]');
          var docNo = normalizeHeaderText(docNoInput ? docNoInput.value : '');
          var clientLabel = getCurrentClientLabel();
          var titleText = buildDocHeaderTitle({
            docTypeLabel: '請求書',
            mode: currentHeaderMode,
            clientLabel: clientLabel,
            docNo: docNo
          });
          if (!titleText) return;
          titleEl.innerHTML = (currentHeaderIconHtml || '') + titleText;
        }

        function normalizeToYYYYMM(input) {
          var s = String(input === undefined || input === null ? '' : input).trim();

          function isDigits(str) {
            if (!str || str.length === 0) return false;
            for (var i = 0; i < str.length; i++) {
              var code = str.charCodeAt(i);
              if (code < 48 || code > 57) return false;
            }
            return true;
          }

          function isValidMM(mm) {
            if (!isDigits(mm) || mm.length !== 2) return false;
            var n = Number(mm);
            return n >= 1 && n <= 12;
          }

          // YYYY-MM
          if (s.length === 7 && s.charAt(4) === '-' && isDigits(s.slice(0, 4)) && isValidMM(s.slice(5, 7))) {
            return s;
          }

          // YYYY/MM -> YYYY-MM（※正規表現を使わない）
          if (s.length === 7 && s.charAt(4) === '/' && isDigits(s.slice(0, 4)) && isValidMM(s.slice(5, 7))) {
            return s.slice(0, 4) + '-' + s.slice(5, 7);
          }

          // YYYY-MM-DD... -> YYYY-MM
          if (s.length >= 10 && s.charAt(4) === '-' && s.charAt(7) === '-' && isDigits(s.slice(0, 4)) && isValidMM(s.slice(5, 7))) {
            return s.slice(0, 7);
          }

          // YYYY/MM/DD... -> YYYY-MM（※正規表現を使わない）
          if (s.length >= 10 && s.charAt(4) === '/' && s.charAt(7) === '/' && isDigits(s.slice(0, 4)) && isValidMM(s.slice(5, 7))) {
            return s.slice(0, 4) + '-' + s.slice(5, 7);
          }

          // 2026年2月 -> YYYY-MM（スラッシュを含まない正規表現なので安全）
          var jp = /^(\d{4})年(\d{1,2})月/.exec(s);
          if (jp) {
            var y = jp[1];
            var mRaw = String(jp[2]);
            var m = mRaw.length === 1 ? '0' + mRaw : mRaw;
            if (isValidMM(m)) return y + '-' + m;
          }

          return '';
        }

        function parseYYYYMM(yyyyMm) {
          var normalized = normalizeToYYYYMM(yyyyMm);
          var m = /^(\d{4})-(\d{2})$/.exec(normalized);
          if (!m) {
            return null;
          }

          var year = Number(m[1]);
          var month = Number(m[2]);

          if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
            return null;
          }

          return { year: year, month: month, yyyyMm: normalized };
        }

        function toISODate(d) {
          return d.toISOString().slice(0, 10);
        }

        function lastDayOfMonthUTC(year, month1to12) {
          return new Date(Date.UTC(year, month1to12, 0));
        }

        function addDaysUTC(isoDate, days) {
          var d = new Date(isoDate + 'T00:00:00.000Z');
          d.setUTCDate(d.getUTCDate() + days);
          return toISODate(d);
        }

        function clampDayToMonthEndUTC(year, month1to12, day) {
          var end = lastDayOfMonthUTC(year, month1to12);
          var endDay = end.getUTCDate();
          return Math.min(Math.max(1, day), endDay);
        }

        function normalizeClosingDay(closingDay) {
          if (closingDay === undefined || closingDay === null || closingDay === '') return null;
          if (closingDay === 'eom' || closingDay === '末') return 'eom';
          var n = Number(closingDay);
          if (!Number.isFinite(n)) return null;
          if (n === 0 || n === 31) return 'eom';
          return n;
        }

        function calcBillingPeriodFromClosing(yyyyMm, closingDayRaw) {
          var parsed = parseYYYYMM(yyyyMm);
          if (!parsed) return null;
          var year = parsed.year;
          var month = parsed.month;
          var closingDay = normalizeClosingDay(closingDayRaw);

          if (closingDay === 'eom' || closingDay === null) {
            var start = new Date(Date.UTC(year, month - 1, 1));
            var end = lastDayOfMonthUTC(year, month);
            var startDate = toISODate(start);
            var endDate = toISODate(end);
            var issueDate = addDaysUTC(endDate, 1);
            return { periodStart: startDate, periodEnd: endDate, issueDate: issueDate };
          }

          var endDay = clampDayToMonthEndUTC(year, month, closingDay);
          var periodEnd = toISODate(new Date(Date.UTC(year, month - 1, endDay)));

          var prev = { year: month === 1 ? year - 1 : year, month: month === 1 ? 12 : month - 1 };
          var prevEndDay = clampDayToMonthEndUTC(prev.year, prev.month, closingDay);
          var prevPeriodEnd = toISODate(new Date(Date.UTC(prev.year, prev.month - 1, prevEndDay)));
          var periodStart = addDaysUTC(prevPeriodEnd, 1);

          var issueDate = addDaysUTC(periodEnd, 1);
          return { periodStart: periodStart, periodEnd: periodEnd, issueDate: issueDate };
        }

        function normalizeDueDay(dueDayRaw) {
          if (dueDayRaw === undefined || dueDayRaw === null || dueDayRaw === '') return null;
          if (dueDayRaw === 'eom' || dueDayRaw === '末') return 'eom';
          var n = Number(dueDayRaw);
          if (!Number.isFinite(n)) return null;
          if (n === 0 || n === 31) return 'eom';
          return n;
        }

        function parsePaymentRule(paymentDayRaw) {
          if (paymentDayRaw === undefined || paymentDayRaw === null || paymentDayRaw === '') return null;
          var value = String(paymentDayRaw || '').trim();
          if (!value) return null;
          var monthOffset = 1;
          if (value.includes('翌々月')) {
            monthOffset = 2;
          } else if (value.includes('翌月')) {
            monthOffset = 1;
          } else if (value.includes('当月')) {
            monthOffset = 0;
          }
          var dueDayRaw = null;
          if (value.includes('末')) {
            dueDayRaw = 'eom';
          } else {
            var m = value.match(/(\d{1,2})/);
            if (m) dueDayRaw = Number(m[1]);
          }
          return { monthOffset: monthOffset, dueDayRaw: dueDayRaw };
        }

        function calcDueDateFromRule(periodEndISO, monthOffsetRaw, dueDayRaw) {
          var monthOffset = Number(monthOffsetRaw || 0);
          var dueDay = normalizeDueDay(dueDayRaw);

          var base = new Date(periodEndISO + 'T00:00:00.000Z');
          var y = base.getUTCFullYear();
          var m = base.getUTCMonth() + 1;

          var payMonthFirst = new Date(Date.UTC(y, m - 1, 1));
          payMonthFirst.setUTCMonth(payMonthFirst.getUTCMonth() + monthOffset);

          var payYear = payMonthFirst.getUTCFullYear();
          var payMonth = payMonthFirst.getUTCMonth() + 1;

          if (dueDay === 'eom' || dueDay === null) {
            return toISODate(lastDayOfMonthUTC(payYear, payMonth));
          }

          var d = clampDayToMonthEndUTC(payYear, payMonth, dueDay);
          return toISODate(new Date(Date.UTC(payYear, payMonth - 1, d)));
        }

        function formatClosingDayDisplay(closingDay) {
          if (closingDay === undefined || closingDay === null || closingDay === '') return '末';
          if (closingDay === '末' || closingDay === 'eom') return '末';
          var n = Number(closingDay);
          if (!Number.isFinite(n) || n === 0 || n === 31) return '末';
          return n;
        }

        function normalizeBankAccountId(value) {
          if (value === undefined || value === null) return null;
          if (typeof value === 'object') {
            if (value.id !== undefined && value.id !== null) return normalizeBankAccountId(value.id);
            if (value.bank_account_id !== undefined && value.bank_account_id !== null) return normalizeBankAccountId(value.bank_account_id);
            if (value.bankAccountId !== undefined && value.bankAccountId !== null) return normalizeBankAccountId(value.bankAccountId);
            if (value._id !== undefined && value._id !== null) return normalizeBankAccountId(value._id);
            return null;
          }
          var id = String(value).trim();
          return id ? id : null;
        }

        function normalizeBankAccountIdsAll(ids) {
          if (!Array.isArray(ids)) return [];
          var result = [];
          var seen = {};
          ids.forEach(function(id) {
            var normalized = normalizeBankAccountId(id);
            if (!normalized) return;
            var key = String(normalized);
            if (seen[key]) return;
            seen[key] = true;
            result.push(key);
          });
          return result;
        }

        function normalizeBankAccounts(list) {
          var result = (list || []).map(function(account) {
            var id = normalizeBankAccountId(account);
            return Object.assign({}, account, { _id: id });
          }).filter(function(account) {
            return account._id !== null;
          });
          return result;
        }

        function uniqueBankAccounts(list) {
          var seen = {};
          var result = [];
          (list || []).forEach(function(account) {
            var id = account && account._id ? String(account._id) : '';
            if (!id || seen[id]) return;
            seen[id] = true;
            result.push(account);
          });
          return result;
        }

        function buildBankAccountLabel(account) {
          var name = account.bank_name || account.bankName || '';
          var branch = account.bank_branch || account.branch_name || account.branchName || '';
          var type = account.account_type_label || account.accountTypeLabel || accountTypeCodeToLabel(account.account_type || account.accountType || account.account_type_label || '');
          var number = account.account_number || account.accountNumber || '';
          var holder = account.account_name || account.accountName || account.account_holder || account.accountHolder || '';
          var line1 = [name, branch].filter(Boolean).join(' ');
          var line2 = [type, number].filter(Boolean).join(' ');
          var line3 = holder ? ('名義: ' + holder) : '';
          return [line1, line2, line3].filter(Boolean).join(' / ');
        }

        function buildBankInfoText(accounts) {
          if (!accounts || accounts.length === 0) return '';
          return accounts.map(function(account) {
            var name = account.bank_name || account.bankName || '';
            var branch = account.bank_branch || account.branch_name || account.branchName || '';
            var type = account.account_type_label || account.accountTypeLabel || accountTypeCodeToLabel(account.account_type || account.accountType || account.account_type_label || '');
            var number = account.account_number || account.accountNumber || '';
            var holder = account.account_name || account.accountName || account.account_holder || account.accountHolder || '';
            var lines = [];
            if (name || branch) lines.push([name, branch].filter(Boolean).join(' '));
            lines.push([type, number].filter(Boolean).join(' '));
            if (holder) lines.push('名義: ' + holder);
            return lines.join('\\n');
          }).join('\\n\\n');
        }

        function getSelectedBankAccounts() {
          var idSet = {};
          normalizeBankAccountIds(selectedBankAccountIds).forEach(function(id) { idSet[String(id)] = true; });
          return bankAccounts.filter(function(account) {
            var bid = String(account && account._id ? account._id : '');
            return bid && idSet[bid];
          });
        }

        function updateBankAccountPreview() {
          var preview = document.getElementById('bankAccountPreview');
          var hidden = document.getElementById('bankInfoInput');
          var selected = getSelectedBankAccounts();
          var text = buildBankInfoText(selected);
          hidden.value = text;
          if (text) {
            preview.innerHTML = text.replace(/\\n\\n/g, '<br><br>').replace(/\\n/g, '<br>');
            preview.classList.remove('hidden');
          } else {
            preview.innerHTML = '';
            preview.classList.add('hidden');
          }
        }

        function updateBankAccountSelectionCounter() {
          var count = normalizeBankAccountIds(selectedBankAccountIds).length;
          var counterEl = document.getElementById('bankAccountSelectedCount');
          var hintEl = document.getElementById('invoiceBankAccountLimitHint');
          if (!counterEl) return;
          counterEl.textContent = '振込先：' + count + '/' + BANK_ACCOUNT_SELECT_MAX;
          if (hintEl) {
            var totalChoices = Array.isArray(bankAccounts) ? bankAccounts.length : 0;
            if (count >= BANK_ACCOUNT_SELECT_MAX && totalChoices > BANK_ACCOUNT_SELECT_MAX) {
              hintEl.classList.remove('hidden');
            } else {
              hintEl.classList.add('hidden');
            }
          }
        }

        function setBankAccountLimitNote(message, mode) {
          var noteEl = document.getElementById('bankAccountLimitNote');
          bankAccountLimitNoteMode = mode || '';
          if (!noteEl) return;
          if (message) {
            noteEl.textContent = message;
            noteEl.classList.remove('hidden');
          } else {
            noteEl.textContent = '';
            noteEl.classList.add('hidden');
          }
        }

        function clearBankAccountLimitNote(mode) {
          if (!mode || bankAccountLimitNoteMode === mode) {
            setBankAccountLimitNote('', '');
          }
        }

        function updateBankAccountCheckboxState() {
          var list = document.getElementById('bankAccountsOptions') || document.getElementById('bankAccountList');
          var normalizedSelected = normalizeBankAccountIds(selectedBankAccountIds);
          selectedBankAccountIds = normalizedSelected;
          updateBankAccountSelectionCounter();
          if (!list) return;
          var count = normalizedSelected.length;
          list.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
            var id = cb.getAttribute('data-id');
            var isChecked = normalizedSelected.indexOf(id) !== -1;
            cb.checked = isChecked;
            cb.disabled = !isChecked && count >= BANK_ACCOUNT_SELECT_MAX;
            var label = cb.closest('label');
            if (label) {
              if (cb.disabled) {
                label.classList.add('opacity-60', 'cursor-not-allowed');
              } else {
                label.classList.remove('opacity-60', 'cursor-not-allowed');
              }
            }
          });
          if (count < BANK_ACCOUNT_SELECT_MAX && bankAccountLimitNoteMode === 'limit') {
            clearBankAccountLimitNote('limit');
          }
        }

        function escapeHtml(str) {
          return String(str === undefined || str === null ? '' : str)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
        }

        function renderBankAccountOptions(list) {
          var container = document.getElementById('bankAccountsOptions') || document.getElementById('bankAccountList');
          var emptyEl = document.getElementById('bankAccountsEmpty');
          console.log('[UI] bankAccounts container=', container);
          if (!container) {
            console.warn('[UI] #bankAccountsOptions not found -> HTML側に描画先がない/ID不一致');
            return;
          }
          var arr = Array.isArray(list) ? list : (Array.isArray(bankAccounts) ? bankAccounts : []);
          if (arr.length === 0) {
            container.innerHTML = '';
            if (emptyEl) emptyEl.classList.remove('hidden');
            updateBankAccountCheckboxState();
            updateBankAccountPreview();
            return;
          }
          if (emptyEl) emptyEl.classList.add('hidden');
          container.innerHTML = arr.map(function(account) {
            var id = account && (account.id ?? account.bank_account_id ?? account.bankAccountId);
            if (id === undefined || id === null || String(id).trim() === '') return '';
            var label = buildBankAccountLabel(account);
            var isDefault = !!(account.is_default ?? account.isDefault);
            var badge = isDefault
              ? '<span class="ml-2 inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">既定</span>'
              : '';
            return '<label class="bank-account-option flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50">' +
              '<input type="checkbox" class="bank-account-check bankAccountPick h-4 w-4" data-id="' + escapeHtml(id) + '">' +
              '<div class="min-w-0">' +
              '<div class="flex items-center">' +
              '<div class="truncate text-sm font-medium text-slate-900">' + escapeHtml(label) + '</div>' +
              badge +
              '</div>' +
              '</div>' +
              '</label>';
          }).join('');
          console.log('[UI] rendered bank accounts options count=', arr.length);

          container.querySelectorAll('.bank-account-check').forEach(function(cb) {
            cb.addEventListener('change', function() {
              var id = this.getAttribute('data-id');
              if (this.checked) {
                var normalized = normalizeBankAccountIdsAll(selectedBankAccountIds);
                if (normalized.length >= BANK_ACCOUNT_SELECT_MAX) {
                  this.checked = false;
                  setBankAccountLimitNote('※最大3件まで表示できます（' + BANK_ACCOUNT_SELECT_MAX + '/' + BANK_ACCOUNT_SELECT_MAX + '）', 'limit');
                  updateBankAccountSelectionCounter();
                  return;
                }
                if (normalized.indexOf(id) === -1) {
                  normalized.push(id);
                }
                selectedBankAccountIds = normalized.slice(0, BANK_ACCOUNT_SELECT_MAX);
              } else {
                selectedBankAccountIds = normalizeBankAccountIdsAll(selectedBankAccountIds)
                  .filter(function(x) { return x !== id; });
              }
              if (bankAccountLimitNoteMode === 'adjusted') {
                clearBankAccountLimitNote('adjusted');
              }
              updateBankAccountCheckboxState();
              updateBankAccountPreview();
              formChanged = true; if (window.SmartBill) window.SmartBill.formChanged = true;
            });
          });

          updateBankAccountCheckboxState();
          updateBankAccountPreview();
        }

        function applyDefaultBankAccountSelection() {
          if (!bankAccounts || bankAccounts.length === 0) return;
          if (selectedBankAccountIds.length > 0) return;
          selectedBankAccountIds = normalizeBankAccountIds([bankAccounts[0]._id || '']);
          updateBankAccountCheckboxState();
          updateBankAccountPreview();
        }

        function getDefaultBankAccountIds() {
          if (!bankAccounts || bankAccounts.length === 0) return [];
          return normalizeBankAccountIds(bankAccounts.slice(0, BANK_ACCOUNT_SELECT_MAX).map(function(account) { return account._id; }));
        }

        function normalizeBankAccountIds(ids) {
          return normalizeBankAccountIdsAll(ids).slice(0, BANK_ACCOUNT_SELECT_MAX);
        }

        function applyBankAccountSelectionLimit(reason) {
          var normalizedAll = normalizeBankAccountIdsAll(selectedBankAccountIds);
          var limited = normalizedAll.slice(0, BANK_ACCOUNT_SELECT_MAX);
          var wasTrimmed = normalizedAll.length > limited.length;
          selectedBankAccountIds = limited;
          if (wasTrimmed && reason === 'init') {
            setBankAccountLimitNote('※最大3件までに自動調整しました', 'adjusted');
          }
          return wasTrimmed;
        }
        
        // 初期化
        async function init() {
          await Promise.all([
            loadInvoices(),
            loadClients(),
            loadProducts(),
            loadCategories(),
            loadRecentInvoices(),
            loadCompanyBankAccounts()
          ]);
          
          var params = new URLSearchParams(window.location.search || '');
          var isNewAction = params.get('action') === 'new' || window.location.pathname.endsWith('/new');
          if (isNewAction) {
            await newInvoice();
          } else {
            // 今日の日付をデフォルト設定
            var today = new Date().toISOString().split('T')[0];
            document.querySelector('[name="invoice_date"]').value = today;
            
            // 今月をデフォルト設定（一括作成モーダル用）
            var thisMonth = today.substring(0, 7);
            var batchMonthInput = document.getElementById('batchTargetMonth');
            if (batchMonthInput) {
              batchMonthInput.value = thisMonth;
            }
            
            // 空の明細行を1つ追加
            addItemRow();
          }
          
          setupEventListeners();
        }
        
        // データ読み込み
        async function loadInvoices(search, status, month) {
          var url = '/api/invoices';
          var params = [];
          if (search) params.push('search=' + encodeURIComponent(search));
          if (status) params.push('status=' + encodeURIComponent(status));
          if (month) params.push('month=' + encodeURIComponent(month));
          if (params.length > 0) url += '?' + params.join('&');
          
          var res = await axios.get(url);
          invoices = res.data;
          renderInvoiceTable();
          renderSidebarInvoices();
        }
        
        async function loadClients() {
          var res = await axios.get('/api/clients');
          clients = res.data;
          
          var select = document.getElementById('clientSelect');
          if (select) {
            select.innerHTML = '<option value="">得意先を選択...</option>' +
              clients.map(function(c) {
                return '<option value="' + c.id + '">' + c.client_name + '</option>';
              }).join('');
          }
        }

        async function loadProducts() {
          var res = await axios.get('/api/products');
          products = res.data;
        }

        async function loadCategories() {
          var res = await axios.get('/api/categories');
          categories = res.data;
          var select = document.getElementById('productCategoryFilter');
          if (select) {
            select.innerHTML = '<option value="">全カテゴリ</option>' +
              categories.map(function(c) {
                return '<option value="' + c.id + '">' + c.category_name + '</option>';
              }).join('');
          }
        }
        
        async function loadRecentInvoices() {
          var data = [];
          try {
            var res = await axios.get('/api/invoices/recent?limit=5');
            data = res.data || [];
          } catch (e) {
            console.error(e);
            data = [];
          }
          var container = document.getElementById('recentInvoices');
          if (data.length === 0) {
            container.innerHTML = '<p class="text-xs text-gray-400 p-2">最近の編集はありません</p>';
            return;
          }
          container.innerHTML = data.map(function(inv) {
            var displayNo = inv.invoice_display_no || inv.invoice_no || inv.invoice_number || (inv.id ? 'INV-' + String(inv.id).padStart(6, '0') : '');
            return '<div class="p-2 hover:bg-gray-50 rounded cursor-pointer text-xs border-b invoice-item" data-id="' + inv.id + '">' +
              '<div class="font-medium text-gray-800">' + displayNo + '</div>' +
              '<div class="text-gray-500">' + (inv.client_name || '得意先未設定') + '</div>' +
              '</div>';
          }).join('');
        }
        
        async function loadCompanyBankAccounts() {
          var companyRes = await axios.get('/api/company');
          var company = companyRes.data;
          var bankList = [];
          try {
            var bankRes = await axios.get('/api/bank-accounts');
            console.log('[UI] bank-accounts raw=', bankRes.data);
            var resData = bankRes.data;
            bankList = Array.isArray(resData) ? resData : (resData && (resData.bank_accounts || resData.data) ? (resData.bank_accounts || resData.data) : []);
          } catch (e) {
            console.error(e);
            bankList = [];
          }

          bankAccounts = [];
          companyDefaults.closing_day = company.default_closing_day || '';
          companyDefaults.payment_day = company.default_payment_day || '';

          if (Array.isArray(bankList) && bankList.length > 0) {
            console.log('[UI] bankAccounts length=', bankList.length);
            bankAccounts = uniqueBankAccounts(normalizeBankAccounts(bankList));
          } else {
            var companyBankAccounts =
              (company && Array.isArray(company.bank_accounts_list) && company.bank_accounts_list) ||
              (company && Array.isArray(company.bank_accounts) && company.bank_accounts) ||
              (company && Array.isArray(company.bankAccounts) && company.bankAccounts) ||
              [];
            if (companyBankAccounts.length > 0) {
              console.log('[UI] bankAccounts length=', companyBankAccounts.length);
              bankAccounts = uniqueBankAccounts(normalizeBankAccounts(companyBankAccounts));
            } else {
              // 基本の銀行口座
              if (company.bank_name) {
                bankAccounts.push({
                  bank_name: company.bank_name,
                  bank_branch: company.bank_branch || company.branch_name,
                  account_type: company.account_type,
                  account_number: company.account_number,
                  account_holder: company.account_holder
                });
              }
              
              // 追加の銀行口座
              if (company.bank_accounts) {
                try {
                  var additional = JSON.parse(company.bank_accounts);
                  if (Array.isArray(additional)) {
                    bankAccounts = bankAccounts.concat(additional);
                  }
                } catch (e) {}
              }
              bankAccounts = uniqueBankAccounts(normalizeBankAccounts(bankAccounts));
              console.log('[UI] bankAccounts length=', bankAccounts.length);
            }
          }

          renderBankAccountOptions(bankAccounts);
          applyDefaultBankAccountSelection();
        }
        
        // 得意先サジェスト機能
        function showClientSuggest(searchText) {
          var suggestList = document.getElementById('clientSuggestList');
          
          if (!searchText || searchText.length === 0) {
            var filtered = clients.slice(0, 20);
          } else {
            var lowerSearch = searchText.toLowerCase();
            var filtered = clients.filter(function(c) {
              var nameMatch = c.client_name && c.client_name.toLowerCase().includes(lowerSearch);
              var codeMatch = c.client_code && c.client_code.toLowerCase().includes(lowerSearch);
              return nameMatch || codeMatch;
            }).slice(0, 20);
          }
          
          if (filtered.length === 0) {
            suggestList.innerHTML = '<div class="p-3 text-gray-500 text-sm">該当する取引先がありません</div>';
          } else {
            suggestList.innerHTML = filtered.map(function(c) {
              var codeDisplay = c.client_code ? '<span class="text-gray-400 text-xs ml-2">' + c.client_code + '</span>' : '';
              return '<div class="client-suggest-item p-2 hover:bg-blue-50 cursor-pointer border-b last:border-b-0" data-id="' + c.id + '">' +
                '<span class="font-medium">' + c.client_name + '</span>' + codeDisplay +
                '</div>';
            }).join('');
            
            suggestList.querySelectorAll('.client-suggest-item').forEach(function(el) {
              el.addEventListener('click', function() {
                var clientId = parseInt(this.getAttribute('data-id'));
                selectClient(clientId);
              });
            });
          }
          
          suggestList.classList.remove('hidden');
        }
        
        function hideClientSuggest() {
          document.getElementById('clientSuggestList').classList.add('hidden');
        }
        
        function selectClient(clientId) {
          var client = clients.find(function(c) { return c.id === clientId; });
          if (!client) return;
          
          document.getElementById('clientSelect').value = clientId;
          var codeDisplay = client.client_code ? ' (' + client.client_code + ')' : '';
          document.getElementById('clientSearchInput').value = client.client_name + codeDisplay;
          document.getElementById('selectedClientName').textContent = client.client_name + codeDisplay;
          document.getElementById('selectedClientDisplay').classList.remove('hidden');
          
          localStorage.setItem('lastSelectedClientId', clientId);
          lastSelectedClientId = clientId;
          
          hideClientSuggest();
          onClientChange();
          formChanged = true; if (window.SmartBill) window.SmartBill.formChanged = true;
        }
        
        function clearClientSelection() {
          document.getElementById('clientSelect').value = '';
          document.getElementById('clientSearchInput').value = '';
          document.getElementById('selectedClientDisplay').classList.add('hidden');
          document.getElementById('selectedClientName').textContent = '';
          selectedClient = null;
          document.getElementById('clientInfo').classList.add('hidden');
          document.getElementById('deliveriesSection').classList.add('hidden');
          formChanged = true; if (window.SmartBill) window.SmartBill.formChanged = true;
          updateFormHeaderTitle();
        }
        
        // 得意先選択時
        function onClientChange() {
          var clientId = document.getElementById('clientSelect').value;
          var clientInfoDiv = document.getElementById('clientInfo');
          var deliveriesSection = document.getElementById('deliveriesSection');
          
          if (!clientId) {
            selectedClient = null;
            clientInfoDiv.classList.add('hidden');
            deliveriesSection.classList.add('hidden');
            document.getElementById('selectedClientDisplay').classList.add('hidden');
            document.getElementById('selectedClientName').textContent = '';
            updateFormHeaderTitle();
            return;
          }
          
          selectedClient = clients.find(function(c) { return c.id == clientId; });
          if (!selectedClient) return;
          
          clientInfoDiv.classList.remove('hidden');
          deliveriesSection.classList.remove('hidden');
          var codeDisplay = selectedClient.client_code ? ' (' + selectedClient.client_code + ')' : '';
          document.getElementById('clientSearchInput').value = selectedClient.client_name + codeDisplay;
          
          var closingInfo = document.getElementById('clientClosingInfo');
          var paymentInfo = document.getElementById('clientPaymentInfo');
          var resolvedClosingDay = selectedClient.closing_day || companyDefaults.closing_day || '';
          var resolvedPaymentDay = selectedClient.payment_day || companyDefaults.payment_day || '';
          var closingDisplay = formatClosingDayDisplay(resolvedClosingDay);
          closingInfo.innerHTML = '<i class="fas fa-calendar text-blue-600 mr-1"></i>締日: ' + closingDisplay + '日';
          paymentInfo.innerHTML = '<i class="fas fa-yen-sign text-green-600 mr-1"></i>支払: ' + (resolvedPaymentDay || '未設定');
          
          var invoiceDateInput = document.querySelector('[name="invoice_date"]');
          var dueDateInput = document.querySelector('[name="payment_due_date"]');
          var periodStartInput = document.querySelector('[name="billing_period_start"]');
          var periodEndInput = document.querySelector('[name="billing_period_end"]');
          var shouldAutoFill = !currentInvoiceId ||
            ((invoiceDateInput && !invoiceDateInput.value) &&
             (dueDateInput && !dueDateInput.value) &&
             (periodStartInput && !periodStartInput.value) &&
             (periodEndInput && !periodEndInput.value));
          
          try {
            var today = new Date();
            var targetMonth = today.toISOString().slice(0, 7);
            var billing = calcBillingPeriodFromClosing(targetMonth, resolvedClosingDay);
            if (!billing) {
              updateFormHeaderTitle();
              return;
            }
            
            if (periodStartInput && (shouldAutoFill || !periodStartInput.value)) {
              periodStartInput.value = billing.periodStart;
            }
            if (periodEndInput && (shouldAutoFill || !periodEndInput.value)) {
              periodEndInput.value = billing.periodEnd;
            }
            if (invoiceDateInput && (shouldAutoFill || !invoiceDateInput.value)) {
              invoiceDateInput.value = billing.issueDate;
            }
            
            var paymentRule = parsePaymentRule(resolvedPaymentDay);
            if (paymentRule && dueDateInput && (shouldAutoFill || !dueDateInput.value)) {
              dueDateInput.value = calcDueDateFromRule(billing.periodEnd, paymentRule.monthOffset, paymentRule.dueDayRaw);
            } else if (!paymentRule && dueDateInput && shouldAutoFill) {
              dueDateInput.value = '';
            }
          } catch (e) {
            console.error(e);
          }
          updateFormHeaderTitle();
        }
        
        // テーブル描画
        function renderInvoiceTable() {
          var tbody = document.getElementById('invoiceTableBody');
          if (invoices.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="px-4 py-8 text-center text-gray-500">請求書データがありません</td></tr>';
            return;
          }
          tbody.innerHTML = invoices.map(function(inv) {
            var statusSelect = getStatusSelect(inv.id, inv.status);
            var period = inv.billing_period_start && inv.billing_period_end 
              ? inv.billing_period_start.substring(5) + '〜' + inv.billing_period_end.substring(5)
              : '-';
            var displayNo = inv.invoice_display_no || inv.invoice_no || inv.invoice_number || (inv.id ? 'INV-' + String(inv.id).padStart(6, '0') : '');
            return '<tr class="hover:bg-gray-50 invoice-row" data-id="' + inv.id + '">' +
              '<td class="px-4 py-3 font-medium text-indigo-600 cursor-pointer invoice-cell" data-id="' + inv.id + '">' + displayNo + '</td>' +
              '<td class="px-4 py-3 cursor-pointer invoice-cell" data-id="' + inv.id + '">' + inv.invoice_date + '</td>' +
              '<td class="px-4 py-3 cursor-pointer invoice-cell" data-id="' + inv.id + '">' + (inv.client_name || '-') + '</td>' +
              '<td class="px-4 py-3 cursor-pointer invoice-cell text-xs" data-id="' + inv.id + '">' + period + '</td>' +
              '<td class="px-4 py-3 text-right font-bold cursor-pointer invoice-cell" data-id="' + inv.id + '">¥' + (inv.total_amount || 0).toLocaleString() + '</td>' +
              '<td class="px-4 py-3 text-center">' + statusSelect + '</td>' +
              '<td class="px-4 py-3 text-center">' +
              '<button class="text-blue-600 hover:text-blue-800 edit-btn" data-id="' + inv.id + '"><i class="fas fa-edit"></i></button>' +
              '</td></tr>';
          }).join('');
          
          // ステータス変更イベント
          tbody.querySelectorAll('.status-select').forEach(function(select) {
            select.addEventListener('change', function(e) {
              e.stopPropagation();
              var id = parseInt(this.getAttribute('data-id'));
              var newStatus = this.value;
              changeInvoiceStatus(id, newStatus);
            });
            select.addEventListener('click', function(e) { e.stopPropagation(); });
          });
          
          // 行クリックで編集
          tbody.querySelectorAll('.invoice-cell').forEach(function(cell) {
            cell.addEventListener('click', function() {
              var id = parseInt(this.getAttribute('data-id'));
              editInvoice(id);
            });
          });
        }
        
        function getStatusSelect(id, currentStatus) {
          var options = [
            { value: 'draft', label: '作成中', color: 'text-gray-700' },
            { value: 'pending', label: '未送付', color: 'text-yellow-700' },
            { value: 'sent', label: '送付済', color: 'text-blue-700' },
            { value: 'paid', label: '入金済', color: 'text-green-700' },
            { value: 'overdue', label: '支払遅延', color: 'text-red-700' }
          ];
          
          var bgColors = {
            'draft': 'bg-gray-100',
            'pending': 'bg-yellow-100',
            'sent': 'bg-blue-100',
            'paid': 'bg-green-100',
            'overdue': 'bg-red-100'
          };
          
          var optionsHtml = options.map(function(opt) {
            return '<option value="' + opt.value + '"' + (opt.value === currentStatus ? ' selected' : '') + '>' + opt.label + '</option>';
          }).join('');
          
          return '<select class="status-select px-2 py-1 rounded-full text-xs font-medium border-0 cursor-pointer ' + (bgColors[currentStatus] || 'bg-gray-100') + '" data-id="' + id + '">' + optionsHtml + '</select>';
        }
        
        async function changeInvoiceStatus(id, newStatus) {
          try {
            await axios.patch('/api/invoices/' + id + '/status', { status: newStatus });
            var invoice = invoices.find(function(inv) { return inv.id === id; });
            if (invoice) invoice.status = newStatus;
            renderInvoiceTable();
          } catch (e) {
            alert('ステータスの変更に失敗しました');
            loadInvoices();
          }
        }
        
        function getStatusLabel(status) {
          var labels = {
            'draft': '作成中',
            'pending': '未送付',
            'sent': '送付済',
            'paid': '入金済',
            'overdue': '支払遅延'
          };
          return labels[status] || '作成中';
        }
        
        function renderSidebarInvoices() {
          var container = document.getElementById('sidebarInvoiceList');
          if (invoices.length === 0) {
            container.innerHTML = '<p class="text-xs text-gray-400 p-2">請求書データがありません</p>';
            return;
          }
          container.innerHTML = invoices.slice(0, 20).map(function(inv) {
            var isActive = currentInvoiceId === inv.id;
            var displayNo = inv.invoice_display_no || inv.invoice_no || inv.invoice_number || (inv.id ? 'INV-' + String(inv.id).padStart(6, '0') : '');
            return '<div class="p-2 rounded cursor-pointer text-xs border-b invoice-item ' + (isActive ? 'bg-indigo-100 border-indigo-300' : 'hover:bg-gray-50') + '" data-id="' + inv.id + '">' +
              '<div class="font-medium ' + (isActive ? 'text-indigo-800' : 'text-gray-800') + '">' + displayNo + '</div>' +
              '<div class="text-gray-500 flex justify-between">' +
              '<span>' + (inv.client_name || '得意先未設定') + '</span>' +
              '<span>¥' + (inv.total_amount || 0).toLocaleString() + '</span>' +
              '</div></div>';
          }).join('');
        }
        
        // サイドバー折りたたみ
        var sidebarCollapsed = true;
        
        function toggleSidebar(collapsed) {
          sidebarCollapsed = collapsed;
          var collapsedDiv = document.getElementById('sidebarCollapsed');
          var expandedDiv = document.getElementById('sidebarExpanded');
          
          if (collapsed) {
            collapsedDiv.classList.remove('hidden');
            expandedDiv.classList.add('hidden');
          } else {
            collapsedDiv.classList.add('hidden');
            expandedDiv.classList.remove('hidden');
          }
        }
        
        // 明細行の管理
        function addItemRow(item) {
          items.push(item || { delivery_id: null, delivery_date: '', product_id: null, product_name: '', quantity: 1, unit_price: 0, tax_rate: 10 });
          renderItemsTable();
        }
        
        function removeItemRow(index) {
          items.splice(index, 1);
          renderItemsTable();
          calculateTotals();
        }
        
        function renderItemsTable() {
          var tbody = document.getElementById('itemsTableBody');
          
          tbody.innerHTML = items.map(function(item, index) {
            var amount = item.quantity * item.unit_price;
            var rateValue = normalizeTaxRate(item.tax_rate, 10);
            var customRateOption = '';
            if (rateValue !== 10 && rateValue !== 8 && rateValue !== 0) {
              customRateOption = '<option value="' + rateValue + '" selected>' + rateValue + '%</option>';
            }
            return '<tr class="border-b hover:bg-gray-50 item-row" data-index="' + index + '">' +
              '<td class="px-2 py-2 text-gray-500">' +
              '<span class="drag-handle mr-1" title="ドラッグで並び替え"><i class="fas fa-grip-vertical"></i></span>' +
              (index + 1) + '</td>' +
              '<td class="px-2 py-2"><input type="date" class="item-delivery-date w-full border rounded px-1 py-1 text-sm" value="' + (item.delivery_date || '') + '" /></td>' +
              '<td class="px-2 py-2">' +
              '<div class="flex gap-1">' +
              '<input type="text" class="item-product-name flex-1 border rounded px-2 py-1 text-sm" value="' + (item.product_name || '') + '" placeholder="品名を入力..." />' +
              '<button type="button" class="select-product-btn bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded text-xs" data-index="' + index + '"><i class="fas fa-search"></i></button>' +
              '</div></td>' +
              '<td class="px-2 py-2"><input type="number" class="item-unit-price w-full border rounded px-2 py-1 text-sm text-right" value="' + item.unit_price + '" /></td>' +
              '<td class="px-2 py-2"><input type="number" class="item-quantity w-full border rounded px-2 py-1 text-sm text-center" value="' + item.quantity + '" min="1" /></td>' +
              '<td class="px-2 py-2">' +
              '<select class="item-tax-rate w-full border rounded px-1 py-1 text-sm">' +
              customRateOption +
              '<option value="10"' + (rateValue == 10 ? ' selected' : '') + '>10%</option>' +
              '<option value="8"' + (rateValue == 8 ? ' selected' : '') + '>8%</option>' +
              '<option value="0"' + (rateValue == 0 ? ' selected' : '') + '>0%</option>' +
              '</select></td>' +
              '<td class="px-2 py-2 text-right font-medium">¥' + amount.toLocaleString() + '</td>' +
              '<td class="px-2 py-2"><button type="button" class="remove-item-btn text-red-500 hover:text-red-700" data-index="' + index + '"><i class="fas fa-times"></i></button></td>' +
              '</tr>';
          }).join('');
          
          // Sortable.js初期化
          if (typeof Sortable !== 'undefined') {
            new Sortable(tbody, {
              handle: '.drag-handle',
              animation: 150,
              ghostClass: 'sortable-ghost',
              chosenClass: 'sortable-chosen',
              onEnd: function(evt) {
                var movedItem = items.splice(evt.oldIndex, 1)[0];
                items.splice(evt.newIndex, 0, movedItem);
                formChanged = true; if (window.SmartBill) window.SmartBill.formChanged = true;
                renderItemsTable();
                calculateTotals();
              }
            });
          }
          
          // イベント設定
          tbody.querySelectorAll('.item-delivery-date').forEach(function(input, idx) {
            input.addEventListener('change', function() { items[idx].delivery_date = this.value; formChanged = true; if (window.SmartBill) window.SmartBill.formChanged = true; });
          });
          tbody.querySelectorAll('.item-product-name').forEach(function(input, idx) {
            input.addEventListener('change', function() { items[idx].product_name = this.value; formChanged = true; if (window.SmartBill) window.SmartBill.formChanged = true; });
          });
          tbody.querySelectorAll('.item-unit-price').forEach(function(input, idx) {
            input.addEventListener('change', function() {
              items[idx].unit_price = parseFloat(this.value) || 0;
              formChanged = true; if (window.SmartBill) window.SmartBill.formChanged = true;
              renderItemsTable();
              calculateTotals();
            });
          });
          tbody.querySelectorAll('.item-quantity').forEach(function(input, idx) {
            input.addEventListener('change', function() {
              items[idx].quantity = parseInt(this.value) || 1;
              formChanged = true; if (window.SmartBill) window.SmartBill.formChanged = true;
              renderItemsTable();
              calculateTotals();
            });
          });
          tbody.querySelectorAll('.item-tax-rate').forEach(function(select, idx) {
            select.addEventListener('change', function() { items[idx].tax_rate = parseFloat(this.value); formChanged = true; if (window.SmartBill) window.SmartBill.formChanged = true; calculateTotals(); });
          });
          tbody.querySelectorAll('.select-product-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
              currentItemIndex = parseInt(this.getAttribute('data-index'));
              openProductModal();
            });
          });
          tbody.querySelectorAll('.remove-item-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
              var idx = parseInt(this.getAttribute('data-index'));
              removeItemRow(idx);
            });
          });
        }
        
        // 金額計算
        function calculateTotals() {
          var subtotal = 0;
          var taxByRate = {};
          
          items.forEach(function(item) {
            var amount = item.quantity * item.unit_price;
            subtotal += amount;
            
            // 税率0%に対応：nullやundefinedの場合のみデフォルト10%
            var rate = normalizeTaxRate(item.tax_rate, 10);
            if (!taxByRate[rate]) taxByRate[rate] = 0;
            taxByRate[rate] += Math.floor(amount * rate / 100);
          });
          
          var totalTax = 0;
          var taxBreakdownHtml = '';
          Object.keys(taxByRate).sort(function(a, b) { return parseFloat(a) - parseFloat(b); }).forEach(function(rate) {
            var rateNum = parseFloat(rate);
            totalTax += taxByRate[rate];
            if (rateNum === 0) {
              taxBreakdownHtml += '<div class="flex justify-between py-1 text-xs text-gray-500">' +
                '<span>非課税</span><span>¥0</span></div>';
            } else {
              taxBreakdownHtml += '<div class="flex justify-between py-1 text-xs text-gray-500">' +
                '<span>消費税(' + rateNum + '%)</span><span>¥' + taxByRate[rate].toLocaleString() + '</span></div>';
            }
          });
          
          document.getElementById('subtotalDisplay').textContent = '¥' + subtotal.toLocaleString();
          document.getElementById('taxBreakdown').innerHTML = taxBreakdownHtml;
          document.getElementById('taxDisplay').textContent = '¥' + totalTax.toLocaleString();
          document.getElementById('totalDisplay').textContent = '¥' + (subtotal + totalTax).toLocaleString();
        }

        // 商品モーダル（請求データ入力）
        function openProductModal() {
          document.getElementById('productModal').classList.remove('hidden');
          renderProductList();
        }

        function closeProductModal() {
          document.getElementById('productModal').classList.add('hidden');
          currentItemIndex = null;
        }

        function renderProductList(search, categoryId) {
          var filtered = products.filter(function(p) {
            if (search && !p.product_name.includes(search) && !(p.product_code || '').includes(search)) return false;
            if (categoryId && p.category_id != categoryId) return false;
            return true;
          });

          var container = document.getElementById('productList');
          if (filtered.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-center py-4">商品が見つかりません</p>';
            return;
          }

          container.innerHTML = filtered.map(function(p) {
            return '<div class="p-3 border rounded-lg hover:bg-blue-50 cursor-pointer product-item" data-id="' + p.id + '">' +
              '<div class="flex justify-between">' +
              '<span class="font-medium">' + p.product_name + '</span>' +
              '<span class="text-sm text-gray-500">' + (p.product_code || '') + '</span>' +
              '</div>' +
              '<div class="text-sm text-gray-600 flex justify-between mt-1">' +
              '<span>' + (p.category_name || '') + '</span>' +
              '<span>¥' + (p.unit_price || 0).toLocaleString() + '</span>' +
              '</div></div>';
          }).join('');

          container.querySelectorAll('.product-item').forEach(function(el) {
            el.addEventListener('click', function() {
              var productId = parseInt(this.getAttribute('data-id'));
              selectProduct(productId);
            });
          });
        }

        function selectProduct(productId) {
          var product = products.find(function(p) { return p.id === productId; });
          if (!product || currentItemIndex === null) return;

          var currentItem = items[currentItemIndex] || {};
          var quantity = product.min_lot || currentItem.quantity || 1;

          var category = categories.find(function(c) { return c.id == product.category_id; }) || null;
          var resolvedTaxRate = resolveLineTaxRate({ product: product, category: category, fallback: 10 });
          items[currentItemIndex] = {
            delivery_id: currentItem.delivery_id || null,
            delivery_date: currentItem.delivery_date || '',
            product_id: product.id,
            product_name: product.product_name,
            quantity: quantity,
            unit_price: product.unit_price || 0,
            tax_rate: resolvedTaxRate
          };

          formChanged = true; if (window.SmartBill) window.SmartBill.formChanged = true;
          closeProductModal();
          renderItemsTable();
          calculateTotals();
        }
        
        // フォーム表示制御
        function showTableView() {
          document.getElementById('tableView').classList.remove('hidden');
          document.getElementById('detailView').classList.add('hidden');
        }
        
        function showDetailView() {
          document.getElementById('tableView').classList.add('hidden');
          document.getElementById('detailView').classList.remove('hidden');
          window.SmartBill.collapseSidebar();
          document.querySelector('main').scrollTo(0, 0);
        }
        
        function resetInvoiceFormState() {
          currentInvoiceId = null;
          originalInvoiceStatus = null;
          selectedDeliveryIds = [];
          selectedClient = null;
          document.getElementById('invoiceForm').reset();
          items = [];
          addItemRow();
          
          document.querySelector('[name="invoice_no"]').value = '';
          document.getElementById('clientInfo').classList.add('hidden');
          document.getElementById('selectedClientDisplay').classList.add('hidden');
          document.getElementById('selectedClientName').textContent = '';
          document.getElementById('clientSearchInput').value = '';
          document.getElementById('clientSelect').value = '';
          
          document.getElementById('deliveriesSection').classList.add('hidden');
          document.getElementById('deliveriesList').innerHTML = '<p class="text-sm text-gray-500">得意先を選択して「納品書を取得」をクリックしてください</p>';
          document.getElementById('selectedDeliveriesInfo').classList.add('hidden');
          selectedBankAccountIds = [];
          clearBankAccountLimitNote();
          updateBankAccountCheckboxState();
          updateBankAccountPreview();
          
          updateFormHeaderTitle();
        }
        
        // 新規作成
        async function newInvoice() {
          if (formChanged && !(await window.SmartBill.confirmLeaveAsync())) return;
          
          setFormHeaderMode('new', '<i class="fas fa-file-invoice-dollar mr-2 text-indigo-600"></i>');
          resetInvoiceFormState();
          applyDefaultBankAccountSelection();
          
          // 今日の日付
          var today = new Date().toISOString().split('T')[0];
          document.querySelector('[name="invoice_date"]').value = today;
          
          document.getElementById('deleteInvoiceBtn').classList.add('hidden');
          document.getElementById('duplicateInvoiceBtn').classList.add('hidden');
          document.getElementById('pdfInvoiceBtn').classList.add('hidden');
          document.getElementById('newInvoiceBtnDetail').classList.add('hidden');
          
          renderItemsTable();
          calculateTotals();
          showDetailView();
          formChanged = false; if (window.SmartBill) window.SmartBill.formChanged = false;
        }
        
        // 編集
        async function editInvoice(id) {
          if (formChanged && !(await window.SmartBill.confirmLeaveAsync())) return;
          var data = null;
          try {
            var res = await axios.get('/api/invoices/' + id);
            data = res.data || null;
          } catch (e) {
            console.error(e);
            return;
          }
          if (!data) return;
          
          currentInvoiceId = id;
          originalInvoiceStatus = data.status || 'draft';
          selectedDeliveryIds = (data.deliveries || []).map(function(d) { return d.id; });
          
          document.querySelector('[name="invoice_no"]').value = data.invoice_no;
          document.querySelector('[name="invoice_date"]').value = data.invoice_date;
          document.querySelector('[name="status"]').value = data.status || 'draft';
          document.querySelector('[name="client_id"]').value = data.client_id;
          document.querySelector('[name="payment_due_date"]').value = data.payment_due_date || '';
          document.querySelector('[name="billing_period_start"]').value = data.billing_period_start || '';
          document.querySelector('[name="billing_period_end"]').value = data.billing_period_end || '';
          document.querySelector('[name="notes"]').value = data.notes || '';
          
          items = (data.items || []).map(function(item) {
            return {
              delivery_id: item.delivery_id,
              delivery_date: item.delivery_date || '',
              product_name: item.product_name,
              quantity: item.quantity,
              unit_price: item.unit_price,
              tax_rate: normalizeTaxRate(item.tax_rate, 10)
            };
          });
          
          if (items.length === 0) addItemRow();
          
          setFormHeaderMode('edit', '<i class="fas fa-edit mr-2 text-indigo-600"></i>');
          updateFormHeaderTitle();
          document.getElementById('deleteInvoiceBtn').classList.remove('hidden');
          document.getElementById('duplicateInvoiceBtn').classList.remove('hidden');
          document.getElementById('pdfInvoiceBtn').classList.remove('hidden');
          document.getElementById('newInvoiceBtnDetail').classList.remove('hidden');
          
          // 得意先の選択表示を更新
          if (data.client_id) {
            var client = clients.find(function(c) { return c.id == data.client_id; });
            if (client) {
              var codeDisplay = client.client_code ? ' (' + client.client_code + ')' : '';
              document.getElementById('clientSearchInput').value = client.client_name + codeDisplay;
              document.getElementById('selectedClientName').textContent = client.client_name + codeDisplay;
              document.getElementById('selectedClientDisplay').classList.remove('hidden');
            }
          } else {
            document.getElementById('selectedClientDisplay').classList.add('hidden');
          }
          
          // 振込先
          selectedBankAccountIds = [];
          if (Array.isArray(data.bank_account_ids) && data.bank_account_ids.length > 0) {
            selectedBankAccountIds = data.bank_account_ids.map(function(id) { return String(id); });
          } else if (data.bank_account_id) {
            selectedBankAccountIds = [String(data.bank_account_id)];
          } else if (bankAccounts.length > 0) {
            selectedBankAccountIds = [String(bankAccounts[0]._id || '')];
          }
          applyBankAccountSelectionLimit('init');
          renderBankAccountOptions(bankAccounts);
          updateBankAccountCheckboxState();
          updateBankAccountPreview();
          
          // 紐づく納品書を表示
          if (data.deliveries && data.deliveries.length > 0) {
            document.getElementById('deliveriesSection').classList.remove('hidden');
            document.getElementById('deliveriesList').innerHTML = data.deliveries.map(function(d) {
              return '<div class="p-2 bg-white rounded border text-sm flex justify-between">' +
                '<span>' + d.delivery_no + ' (' + d.delivery_date + ')</span>' +
                '<span class="font-bold">¥' + (d.total_amount || 0).toLocaleString() + '</span>' +
                '</div>';
            }).join('');
            document.getElementById('selectedDeliveriesInfo').classList.remove('hidden');
            document.getElementById('selectedDeliveriesCount').textContent = data.deliveries.length;
          }
          
          onClientChange();
          renderItemsTable();
          calculateTotals();
          renderSidebarInvoices();
          showDetailView();
          formChanged = false; if (window.SmartBill) window.SmartBill.formChanged = false;
        }
        
        // 保存
        async function saveInvoice() {
          var form = document.getElementById('invoiceForm');
          var clientIdValue = form.querySelector('[name="client_id"]').value;
          if (!clientIdValue) {
            window.SmartBill.showErrorDialog('得意先を選択してください。');
            return;
          }
          
          var validItems = items.filter(function(item) { return item.product_name && item.quantity > 0; });
          
          // 送付済み以降の編集時の警告
          var sentOrLaterStatuses = ['sent', 'paid', 'overdue'];
          if (currentInvoiceId && originalInvoiceStatus && sentOrLaterStatuses.includes(originalInvoiceStatus)) {
            if (!confirm('この請求書は「' + getStatusLabel(originalInvoiceStatus) + '」です。\\n内容を変更してもよろしいですか？')) {
              return;
            }
          }
          
          var formData = new FormData(form);
          var data = {
            invoice_no: formData.get('invoice_no'),
            invoice_date: formData.get('invoice_date'),
            status: formData.get('status'),
            client_id: parseInt(formData.get('client_id')),
            payment_due_date: formData.get('payment_due_date') || null,
            billing_period_start: formData.get('billing_period_start') || null,
            billing_period_end: formData.get('billing_period_end') || null,
            notes: formData.get('notes') || '',
            bank_info: formData.get('bank_info') || '',
            bank_account_ids: normalizeBankAccountIds(selectedBankAccountIds),
            items: validItems,
            delivery_ids: selectedDeliveryIds
          };
          
          try {
            if (currentInvoiceId) {
              var updateRes = await axios.put('/api/invoices/' + currentInvoiceId, data);
              if (updateRes && updateRes.data && Array.isArray(updateRes.data.bank_account_ids) && updateRes.data.bank_account_ids.length > 0) {
                selectedBankAccountIds = normalizeBankAccountIds(updateRes.data.bank_account_ids);
                updateBankAccountCheckboxState();
                updateBankAccountPreview();
              }
            } else {
              var res = await axios.post('/api/invoices', data);
              currentInvoiceId = res.data.id;
              if (res.data && res.data.invoice_no) {
                document.querySelector('[name="invoice_no"]').value = res.data.invoice_no;
                updateFormHeaderTitle();
              }
            }
            
            formChanged = false; if (window.SmartBill) window.SmartBill.formChanged = false;
            if (window.SmartBill) window.SmartBill.resetFormTracking();
            await loadInvoices();
            await loadRecentInvoices();
            renderSidebarInvoices();
            
            window.SmartBill.showSuccessDialog('請求書を保存しました');
            
            setFormHeaderMode('edit', '<i class="fas fa-edit mr-2 text-indigo-600"></i>');
            updateFormHeaderTitle();
            document.getElementById('deleteInvoiceBtn').classList.remove('hidden');
            document.getElementById('duplicateInvoiceBtn').classList.remove('hidden');
            document.getElementById('pdfInvoiceBtn').classList.remove('hidden');
            document.getElementById('newInvoiceBtnDetail').classList.remove('hidden');
          } catch (e) {
            window.SmartBill.showErrorDialog('請求書の保存に失敗しました');
            console.error(e);
          }
        }
        
        // PDF出力
        async function exportInvoicePDF() {
          if (!currentInvoiceId) {
            alert('請求書を保存してからPDF出力してください');
            return;
          }
          
          try {
            // 請求書データを取得
            var res = await axios.get('/api/invoices/' + currentInvoiceId);
            var invoiceData = res.data;
            if (!invoiceData) {
              console.error('invoice data not found');
              return;
            }
            
            // 自社情報を取得
            var companyRes = await axios.get('/api/company');
            var companyInfo = companyRes.data;
            
            // 振込先情報を取得（最大3件）
            var bankInfoList = [];
            if (Array.isArray(invoiceData.bank_accounts) && invoiceData.bank_accounts.length > 0) {
              bankInfoList = invoiceData.bank_accounts.slice(0, 3);
            } else {
              var bankAccounts = [];
              if (Array.isArray(companyInfo.bank_accounts_list) && companyInfo.bank_accounts_list.length > 0) {
                bankAccounts = companyInfo.bank_accounts_list;
              } else {
                if (companyInfo.bank_name) {
                  bankAccounts.push({
                    bank_name: companyInfo.bank_name,
                    bank_branch: companyInfo.bank_branch,
                    account_type: companyInfo.account_type,
                    account_number: companyInfo.account_number,
                    account_holder: companyInfo.account_holder
                  });
                }
                if (companyInfo.bank_accounts) {
                  try {
                    bankAccounts = bankAccounts.concat(JSON.parse(companyInfo.bank_accounts) || []);
                  } catch (e) {}
                }
              }
            if (Array.isArray(invoiceData.bank_account_ids) && invoiceData.bank_account_ids.length > 0) {
              var idSet = {};
              normalizeBankAccountIds(invoiceData.bank_account_ids).forEach(function(id) { idSet[String(id)] = true; });
                bankInfoList = bankAccounts.filter(function(b, idx) {
                var bid = b && b.id !== undefined && b.id !== null ? String(b.id) : '';
                return bid && idSet[bid];
                }).slice(0, 3);
              } else {
                bankInfoList = bankAccounts.slice(0, 3);
              }
            }
            var bankInfo = bankInfoList[0] || {};
            
            // 取引先情報を取得
            var clientInfo = {};
            if (invoiceData.client_id) {
              try {
                var clientRes = await axios.get('/api/clients/' + invoiceData.client_id);
                clientInfo = clientRes.data || {};
              } catch (e) {
                console.error('取引先情報取得エラー:', e);
              }
            }
            
            // PDFデータを構築
            var pdfData = {
              invoice_no: invoiceData.invoice_no,
              invoice_date: invoiceData.invoice_date,
              payment_due_date: invoiceData.payment_due_date,
              client_name: invoiceData.client_name,
              subject: invoiceData.subject,
              items: invoiceData.items || [],
              subtotal: invoiceData.subtotal,
              tax_amount: invoiceData.tax_amount,
              total_amount: invoiceData.total_amount,
              notes: invoiceData.notes,
              companyInfo: companyInfo,
              bankInfo: bankInfo,
              bankInfoList: bankInfoList,
              clientInfo: clientInfo
            };
            
            // プレビュー表示
            window.SmartBillPDF.previewInvoicePDF(pdfData);
            
            // 請求書ステータスを「未送付」に自動変更（作成中の場合のみ）
            if (invoiceData.status === 'draft') {
              try {
                await axios.patch('/api/invoices/' + currentInvoiceId + '/status', { status: 'pending' });
                // 画面上のステータスも更新
                document.querySelector('[name="status"]').value = 'pending';
                var invoice = invoices.find(function(inv) { return inv.id === currentInvoiceId; });
                if (invoice) invoice.status = 'pending';
                renderInvoiceTable();
              } catch (err) {
                console.error('請求書ステータス更新エラー:', err);
              }
            }
            
            // 紐づく納品データを「請求済」に変更
            var deliveryIds = (invoiceData.deliveries || []).map(function(d) { return d.id; });
            if (deliveryIds.length > 0) {
              var updateCount = 0;
              for (var i = 0; i < deliveryIds.length; i++) {
                try {
                  var deliveryRes = await axios.get('/api/deliveries/' + deliveryIds[i]);
                  var deliveryData = deliveryRes.data;
                  if (deliveryData.status !== 'invoiced') {
                    await axios.put('/api/deliveries/' + deliveryIds[i], {
                      ...deliveryData,
                      status: 'invoiced'
                    });
                    updateCount++;
                  }
                } catch (err) {
                  console.error('納品ステータス更新エラー:', err);
                }
              }
              if (updateCount > 0) {
                window.SmartBill.showSuccessDialog('請求書を出力し、' + updateCount + '件の納品データを「請求済」に変更しました');
              }
            }
            
          } catch (e) {
            alert('PDF出力に失敗しました');
            console.error(e);
          }
        }
        
        // 削除
        async function deleteInvoice() {
          if (!currentInvoiceId) return;
          
          var confirmed = await window.SmartBill.showConfirmDialog({
            title: '請求書を削除',
            message: 'この請求書を削除しますか？<br/>紐づく納品書は未請求状態に戻ります。',
            confirmText: '削除する',
            cancelText: 'キャンセル',
            icon: 'fa-trash-alt',
            type: 'danger'
          });
          if (!confirmed) return;
          
          try {
            await axios.delete('/api/invoices/' + currentInvoiceId);
            formChanged = false; if (window.SmartBill) window.SmartBill.formChanged = false;
            await loadInvoices();
            await loadRecentInvoices();
            newInvoice();
            window.SmartBill.showSuccessDialog('請求書を削除しました');
          } catch (e) {
            alert('削除に失敗しました');
            console.error(e);
          }
        }
        
        // 複製
        async function duplicateInvoice() {
          if (!currentInvoiceId) return;
          
          currentInvoiceId = null;
          selectedDeliveryIds = [];
          
          document.querySelector('[name="invoice_no"]').value = '';
          
          var today = new Date().toISOString().split('T')[0];
          document.querySelector('[name="invoice_date"]').value = today;
          
          document.querySelector('[name="status"]').value = 'draft';
          
          setFormHeaderMode('custom', '<i class="fas fa-copy mr-2 text-purple-600"></i>');
          document.getElementById('formTitle').innerHTML = '<i class="fas fa-copy mr-2 text-purple-600"></i>請求書複製（新規）';
          document.getElementById('deleteInvoiceBtn').classList.add('hidden');
          document.getElementById('duplicateInvoiceBtn').classList.add('hidden');
          document.getElementById('pdfInvoiceBtn').classList.add('hidden');
          document.getElementById('newInvoiceBtnDetail').classList.add('hidden');
          
          formChanged = true; if (window.SmartBill) window.SmartBill.formChanged = true;
        }
        
        // =====================================
        // 一括請求書作成モーダル
        // =====================================
        var batchClientSummary = [];
        var batchSelectedClientIds = [];
        var currentDetailClientId = null;
        var currentDetailDeliveries = [];
        
        function openBatchCreateModal() {
          document.getElementById('batchCreateModal').classList.remove('hidden');
          var today = new Date().toISOString().split('T')[0];
          document.getElementById('batchTargetMonth').value = today.substring(0, 7);
          batchClientSummary = [];
          batchSelectedClientIds = [];
          document.getElementById('batchClientList').innerHTML = '<tr><td colspan="7" class="px-3 py-8 text-center text-gray-500">締め月を選択して「検索」をクリックしてください</td></tr>';
          document.getElementById('undeliveredAlert').innerHTML = '';
          updateBatchSelectedInfo();
        }
        
        function closeBatchCreateModal() {
          document.getElementById('batchCreateModal').classList.add('hidden');
        }
        
        async function searchUninvoicedClients() {
          var targetMonth = document.getElementById('batchTargetMonth').value;
          if (!targetMonth) {
            alert('締め月を選択してください');
            return;
          }
          
          try {
            // 未納品データのチェック
            var undeliveredRes = await axios.get('/api/invoices/undelivered-check?month=' + targetMonth);
            var alertArea = document.getElementById('undeliveredAlert');
            
            if (undeliveredRes.data.has_undelivered) {
              var clientNames = undeliveredRes.data.client_names || '不明';
              alertArea.innerHTML = '<div class="bg-yellow-50 border-l-4 border-yellow-400 p-3 mb-4">' +
                '<div class="flex items-center">' +
                '<i class="fas fa-exclamation-triangle text-yellow-600 mr-2"></i>' +
                '<div class="text-sm text-yellow-700">' +
                '<strong>' + targetMonth + '</strong> に未納品（作成中・未送付）の納品データが ' +
                '<strong>' + undeliveredRes.data.count + '件</strong> あります。<br>' +
                '<span class="text-xs">対象得意先: ' + clientNames + '</span><br>' +
                '<span class="text-xs">納品書のステータスを「納品済」に変更すると、請求対象に含まれます。</span>' +
                '</div></div></div>';
            } else {
              alertArea.innerHTML = '';
            }
            
            var res = await axios.get('/api/invoices/uninvoiced-summary?month=' + targetMonth);
            batchClientSummary = res.data;
            batchSelectedClientIds = [];
            renderBatchClientList();
            updateBatchSelectedInfo();
          } catch (e) {
            alert('検索に失敗しました');
            console.error(e);
          }
        }
        
        function renderBatchClientList() {
          var tbody = document.getElementById('batchClientList');
          
          if (batchClientSummary.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="px-3 py-8 text-center text-gray-500">この月に未請求の納品書がある得意先はありません</td></tr>';
            return;
          }
          
          tbody.innerHTML = batchClientSummary.map(function(c) {
            var checked = batchSelectedClientIds.includes(c.client_id) ? ' checked' : '';
            var closingDisplay = formatClosingDayDisplay(c.closing_day) + '日';
            return '<tr class="hover:bg-gray-50">' +
              '<td class="px-3 py-2 text-center"><input type="checkbox" class="batch-client-check rounded" data-id="' + c.client_id + '"' + checked + ' /></td>' +
              '<td class="px-3 py-2 font-medium text-gray-800">' + c.client_name + '</td>' +
              '<td class="px-3 py-2 text-gray-500 text-sm">' + (c.client_code || '-') + '</td>' +
              '<td class="px-3 py-2 text-center text-sm">' + closingDisplay + '</td>' +
              '<td class="px-3 py-2 text-center font-medium text-blue-600">' + c.delivery_count + '件</td>' +
              '<td class="px-3 py-2 text-right font-bold text-green-600">¥' + (c.total_amount || 0).toLocaleString() + '</td>' +
              '<td class="px-3 py-2 text-center">' +
              '<button type="button" class="view-detail-btn text-blue-600 hover:text-blue-800 text-sm" data-id="' + c.client_id + '" title="納品書詳細を見る">' +
              '<i class="fas fa-search"></i>' +
              '</button></td></tr>';
          }).join('');
          
          // チェックボックスイベント
          tbody.querySelectorAll('.batch-client-check').forEach(function(cb) {
            cb.addEventListener('change', function() {
              var id = parseInt(this.getAttribute('data-id'));
              if (this.checked) {
                if (!batchSelectedClientIds.includes(id)) batchSelectedClientIds.push(id);
              } else {
                batchSelectedClientIds = batchSelectedClientIds.filter(function(x) { return x !== id; });
              }
              updateBatchSelectedInfo();
              updateSelectAllCheckbox();
            });
          });
          
          // 詳細ボタンイベント
          tbody.querySelectorAll('.view-detail-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
              var clientId = parseInt(this.getAttribute('data-id'));
              showDeliveryDetail(clientId);
            });
          });
        }
        
        function updateBatchSelectedInfo() {
          var total = 0;
          batchSelectedClientIds.forEach(function(id) {
            var c = batchClientSummary.find(function(x) { return x.client_id === id; });
            if (c) total += (c.total_amount || 0);
          });
          document.getElementById('batchSelectedCount').textContent = batchSelectedClientIds.length;
          document.getElementById('batchSelectedTotal').textContent = '¥' + total.toLocaleString();
          
          var btn = document.getElementById('batchCreateBtn');
          btn.disabled = batchSelectedClientIds.length === 0;
        }
        
        function updateSelectAllCheckbox() {
          var checkbox = document.getElementById('selectAllClientsCheck');
          if (batchClientSummary.length === 0) {
            checkbox.checked = false;
            checkbox.indeterminate = false;
          } else if (batchSelectedClientIds.length === 0) {
            checkbox.checked = false;
            checkbox.indeterminate = false;
          } else if (batchSelectedClientIds.length === batchClientSummary.length) {
            checkbox.checked = true;
            checkbox.indeterminate = false;
          } else {
            checkbox.checked = false;
            checkbox.indeterminate = true;
          }
        }
        
        function selectAllClients() {
          batchSelectedClientIds = batchClientSummary.map(function(c) { return c.client_id; });
          renderBatchClientList();
          updateBatchSelectedInfo();
          updateSelectAllCheckbox();
        }
        
        function unselectAllClients() {
          batchSelectedClientIds = [];
          renderBatchClientList();
          updateBatchSelectedInfo();
          updateSelectAllCheckbox();
        }
        
        async function batchCreateInvoices() {
          if (batchSelectedClientIds.length === 0) {
            alert('得意先を1社以上選択してください');
            return;
          }
          
          var count = batchSelectedClientIds.length;
          var confirmed = await window.SmartBill.showConfirmDialog({
            title: '請求書を一括作成',
            message: '<strong>' + count + '社</strong>の請求書を作成します。<br/>よろしいですか？',
            confirmText: '作成する',
            cancelText: 'キャンセル',
            icon: 'fa-file-invoice-dollar',
            type: 'info'
          });
          
          if (!confirmed) return;
          
          try {
            var targetMonth = document.getElementById('batchTargetMonth').value;
            var bankAccountIds = getDefaultBankAccountIds();
            var bankInfo = buildBankInfoText(bankAccounts.filter(function(account) {
              return bankAccountIds.indexOf(String(account._id)) !== -1;
            }));
            
            var res = await axios.post('/api/invoices/batch-create', {
              client_ids: batchSelectedClientIds,
              target_month: targetMonth,
              bank_info: bankInfo,
              bank_account_ids: bankAccountIds
            });
            
            closeBatchCreateModal();
            await loadInvoices();
            await loadRecentInvoices();
            
            window.SmartBill.showSuccessDialog(
              '<strong>' + res.data.created_count + '件</strong>の請求書を作成しました。<br/>' +
              res.data.invoices.map(function(inv) {
                return inv.invoice_no + ' - ' + inv.client_name + ' (¥' + inv.total_amount.toLocaleString() + ')';
              }).join('<br/>')
            );
          } catch (e) {
            alert('請求書の作成に失敗しました');
            console.error(e);
          }
        }
        
        // 納品書詳細モーダル（1社分）
        async function showDeliveryDetail(clientId) {
          currentDetailClientId = clientId;
          var targetMonth = document.getElementById('batchTargetMonth').value;
          var clientSummary = batchClientSummary.find(function(c) { return c.client_id === clientId; });
          
          if (!clientSummary) return;
          
          document.getElementById('deliveryDetailTitle').innerHTML = 
            '<i class="fas fa-truck mr-2 text-green-600"></i>' + clientSummary.client_name + ' の納品書';
          
          try {
            var res = await axios.get('/api/invoices/uninvoiced-deliveries?client_id=' + clientId + '&month=' + targetMonth + '&closing_day=' + (clientSummary.closing_day || 31));
            currentDetailDeliveries = res.data.deliveries;
            var period = res.data.billing_period;
            
            document.getElementById('deliveryDetailPeriodText').textContent = period.start + ' 〜 ' + period.end;
            
            var tbody = document.getElementById('deliveryDetailList');
            tbody.innerHTML = currentDetailDeliveries.map(function(d) {
              return '<tr class="hover:bg-gray-50">' +
                '<td class="px-3 py-2 font-medium text-green-600">' + d.delivery_no + '</td>' +
                '<td class="px-3 py-2">' + d.delivery_date + '</td>' +
                '<td class="px-3 py-2 text-right font-bold">¥' + (d.total_amount || 0).toLocaleString() + '</td>' +
                '</tr>';
            }).join('');
            
            document.getElementById('deliveryDetailTotal').textContent = '¥' + (clientSummary.total_amount || 0).toLocaleString();
            
            document.getElementById('deliveryDetailModal').classList.remove('hidden');
          } catch (e) {
            alert('詳細の取得に失敗しました');
            console.error(e);
          }
        }
        
        function closeDeliveryDetailModal() {
          document.getElementById('deliveryDetailModal').classList.add('hidden');
        }
        
        async function createSingleInvoice() {
          if (!currentDetailClientId) return;
          
          var confirmed = await window.SmartBill.showConfirmDialog({
            title: '請求書を作成',
            message: 'この得意先の請求書を作成します。<br/>よろしいですか？',
            confirmText: '作成する',
            cancelText: 'キャンセル',
            icon: 'fa-file-invoice-dollar',
            type: 'info'
          });
          
          if (!confirmed) return;
          
          try {
            var targetMonth = document.getElementById('batchTargetMonth').value;
            var bankAccountIds = getDefaultBankAccountIds();
            var bankInfo = buildBankInfoText(bankAccounts.filter(function(account) {
              return bankAccountIds.indexOf(String(account._id)) !== -1;
            }));
            
            var res = await axios.post('/api/invoices/batch-create', {
              client_ids: [currentDetailClientId],
              target_month: targetMonth,
              bank_info: bankInfo,
              bank_account_ids: bankAccountIds
            });
            
            closeDeliveryDetailModal();
            closeBatchCreateModal();
            await loadInvoices();
            await loadRecentInvoices();
            
            if (res.data.invoices.length > 0) {
              window.SmartBill.showSuccessDialog('請求書 ' + res.data.invoices[0].invoice_no + ' を作成しました');
            }
          } catch (e) {
            alert('請求書の作成に失敗しました');
            console.error(e);
          }
        }
        
        // イベント設定
        function setupEventListeners() {
          // 検索・フィルター
          function getFilterValues() {
            return {
              search: document.getElementById('searchInputTable').value,
              status: document.getElementById('statusFilter').value,
              month: document.getElementById('monthFilter').value
            };
          }
          
          function applyFilters() {
            var f = getFilterValues();
            loadInvoices(f.search, f.status, f.month);
          }
          
          var searchTimeout;
          document.getElementById('searchInputTable').addEventListener('input', function() {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(function() { applyFilters(); }, 300);
          });
          
          document.getElementById('statusFilter').addEventListener('change', applyFilters);
          document.getElementById('monthFilter').addEventListener('change', applyFilters);
          
          document.getElementById('clearFiltersBtn').addEventListener('click', function() {
            document.getElementById('searchInputTable').value = '';
            document.getElementById('statusFilter').value = '';
            document.getElementById('monthFilter').value = '';
            loadInvoices();
          });
          
          document.getElementById('sidebarSearch').addEventListener('input', function() {
            var search = this.value.toLowerCase();
            document.querySelectorAll('#sidebarInvoiceList .invoice-item').forEach(function(el) {
              var text = el.textContent.toLowerCase();
              el.style.display = text.includes(search) ? '' : 'none';
            });
          });
          
          // ボタン
          document.getElementById('newInvoiceBtnTable').addEventListener('click', newInvoice);
          document.getElementById('newInvoiceBtnDetail').addEventListener('click', newInvoice);
          document.getElementById('fromDeliveriesBtnTable').addEventListener('click', openBatchCreateModal);
          document.getElementById('backToTableBtn').addEventListener('click', async function() {
            if (formChanged && !(await window.SmartBill.confirmLeaveAsync())) return;
            formChanged = false; if (window.SmartBill) window.SmartBill.formChanged = false;
            showTableView();
          });
          document.getElementById('backToTableBtnCollapsed').addEventListener('click', async function() {
            if (formChanged && !(await window.SmartBill.confirmLeaveAsync())) return;
            formChanged = false; if (window.SmartBill) window.SmartBill.formChanged = false;
            showTableView();
          });
          document.getElementById('saveInvoiceBtn').addEventListener('click', saveInvoice);
          document.getElementById('deleteInvoiceBtn').addEventListener('click', deleteInvoice);
          document.getElementById('duplicateInvoiceBtn').addEventListener('click', duplicateInvoice);
          document.getElementById('pdfInvoiceBtn').addEventListener('click', exportInvoicePDF);
          document.querySelector('[name="invoice_no"]').addEventListener('input', function() {
            updateFormHeaderTitle();
          });
          document.getElementById('addItemBtn').addEventListener('click', function() { addItemRow(); });

          // 商品モーダル
          document.getElementById('closeProductModal').addEventListener('click', closeProductModal);
          document.getElementById('productModal').addEventListener('click', function(e) {
            if (e.target === this) closeProductModal();
          });
          document.getElementById('productSearchInput').addEventListener('input', function() {
            renderProductList(this.value, document.getElementById('productCategoryFilter').value);
          });
          document.getElementById('productCategoryFilter').addEventListener('change', function() {
            renderProductList(document.getElementById('productSearchInput').value, this.value);
          });
          
          // サイドバー
          document.getElementById('expandSidebarBtn').addEventListener('click', function() { toggleSidebar(false); });
          document.getElementById('collapseSidebarBtn').addEventListener('click', function() { toggleSidebar(true); });
          
          // 得意先サジェスト
          var clientSearchInput = document.getElementById('clientSearchInput');
          var clientSearchTimeout;
          
          clientSearchInput.addEventListener('input', function() {
            clearTimeout(clientSearchTimeout);
            var search = this.value;
            clientSearchTimeout = setTimeout(function() { showClientSuggest(search); }, 150);
          });
          
          clientSearchInput.addEventListener('focus', function() { showClientSuggest(this.value); });
          
          document.addEventListener('click', function(e) {
            var suggestList = document.getElementById('clientSuggestList');
            var searchInput = document.getElementById('clientSearchInput');
            var toggleBtn = document.getElementById('clientSelectToggle');
            if (!suggestList.contains(e.target) && e.target !== searchInput && e.target !== toggleBtn && !toggleBtn.contains(e.target)) {
              hideClientSuggest();
            }
          });
          
          document.getElementById('clientSelectToggle').addEventListener('click', function() {
            var suggestList = document.getElementById('clientSuggestList');
            if (suggestList.classList.contains('hidden')) {
              showClientSuggest('');
            } else {
              hideClientSuggest();
            }
          });
          
          document.getElementById('clearClientBtn').addEventListener('click', clearClientSelection);
          document.getElementById('clientSelect').addEventListener('change', function() { onClientChange(); formChanged = true; if (window.SmartBill) window.SmartBill.formChanged = true; });
          
          // 振込先
          
          // 納品書取得ボタン（詳細画面用）
          document.getElementById('loadDeliveriesBtn').addEventListener('click', function() {
            if (!selectedClient) {
              alert('得意先を選択してください');
              return;
            }
            // 一括作成モーダルを開く
            openBatchCreateModal();
          });
          
          // 一括作成モーダル
          document.getElementById('closeBatchModal').addEventListener('click', closeBatchCreateModal);
          document.getElementById('batchCreateModal').addEventListener('click', function(e) {
            if (e.target === this) closeBatchCreateModal();
          });
          document.getElementById('searchClientsBtn').addEventListener('click', searchUninvoicedClients);
          document.getElementById('selectAllClientsBtn').addEventListener('click', selectAllClients);
          document.getElementById('unselectAllClientsBtn').addEventListener('click', unselectAllClients);
          document.getElementById('selectAllClientsCheck').addEventListener('change', function() {
            if (this.checked) {
              selectAllClients();
            } else {
              unselectAllClients();
            }
          });
          document.getElementById('batchCreateBtn').addEventListener('click', batchCreateInvoices);
          
          // 納品書詳細モーダル
          document.getElementById('closeDeliveryDetailModal').addEventListener('click', closeDeliveryDetailModal);
          document.getElementById('deliveryDetailModal').addEventListener('click', function(e) {
            if (e.target === this) closeDeliveryDetailModal();
          });
          document.getElementById('createSingleInvoiceBtn').addEventListener('click', createSingleInvoice);
          
          // サイドバーと最近編集のクリックイベント
          document.addEventListener('click', function(e) {
            var invoiceItem = e.target.closest('.invoice-item');
            if (invoiceItem) {
              var id = parseInt(invoiceItem.getAttribute('data-id'));
              editInvoice(id);
            }
          });
          
          // キーボードショートカット
          window.SmartBill.setupKeyboardShortcuts({
            saveCallback: function() { saveInvoice(); },
            escapeCallback: async function() {
              var productModal = document.getElementById('productModal');
              if (productModal && !productModal.classList.contains('hidden')) {
                closeProductModal();
                return;
              }
              var deliveryDetailModal = document.getElementById('deliveryDetailModal');
              var batchModal = document.getElementById('batchCreateModal');
              if (!deliveryDetailModal.classList.contains('hidden')) {
                closeDeliveryDetailModal();
              } else if (!batchModal.classList.contains('hidden')) {
                closeBatchCreateModal();
              } else if (!document.getElementById('detailView').classList.contains('hidden')) {
                if (formChanged && !(await window.SmartBill.confirmLeaveAsync())) return;
                formChanged = false; if (window.SmartBill) window.SmartBill.formChanged = false;
                showTableView();
              }
            }
          });
        }
        
        // 初期化実行
        init();
      `}} />
    </Layout>
  )
})

export default app
