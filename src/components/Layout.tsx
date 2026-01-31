import type { FC } from 'hono/jsx'

interface LayoutProps {
  title: string;
  currentPath: string;
  children: any;
  hideTitle?: boolean;
}

const menuItems = [
  { path: '/', label: 'ダッシュボード', icon: 'fa-chart-line' },
  { path: '/fabric-calculator', label: '椅子生地計算', icon: 'fa-couch' },
  { path: '/estimates', label: '見積データ入力', icon: 'fa-file-invoice' },
  { path: '/deliveries', label: '納品データ入力', icon: 'fa-truck' },
  { path: '/invoices', label: '請求書作成', icon: 'fa-file-invoice-dollar' },
  { path: '/clients', label: '取引先マスタ', icon: 'fa-building' },
  { path: '/products', label: '商品マスタ', icon: 'fa-box' },
  { path: '/categories', label: '分類マスタ', icon: 'fa-tags' },
  { path: '/company', label: '自社情報', icon: 'fa-user-tie' },
]

export const Layout: FC<LayoutProps> = ({ title, currentPath, children, hideTitle = false }) => {
  return (
    <html lang="ja">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title} - SmartBill</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet" />
        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
        <script src="/static/smartbill.js"></script>
        <script src="/static/pdf-generator.js"></script>
        <style dangerouslySetInnerHTML={{__html: `
          .sidebar { transition: all 0.3s ease-in-out; width: 256px; }
          .sidebar.collapsed { width: 72px; }
          .sidebar.collapsed .sidebar-logo-text,
          .sidebar.collapsed .sidebar-subtitle,
          .sidebar.collapsed .menu-label { display: none; }
          .sidebar.collapsed .menu-item { justify-content: center; padding-left: 0; padding-right: 0; }
          .sidebar.collapsed .menu-item i { margin: 0; width: auto; }
          .sidebar.collapsed .sidebar-header { padding: 16px 8px; text-align: center; }
          .sidebar.collapsed .sidebar-toggle-icon { transform: rotate(180deg); }
          .sidebar-toggle { transition: all 0.3s ease-in-out; }
          .sidebar-toggle-icon { transition: transform 0.3s ease-in-out; }
          @media (max-width: 768px) {
            .sidebar { transform: translateX(-100%); width: 256px !important; }
            .sidebar.open { transform: translateX(0); }
            .sidebar.collapsed { transform: translateX(-100%); }
          }
          .menu-item.active { background-color: #3b82f6; color: white; }
          .menu-item:hover:not(.active) { background-color: #e5e7eb; }
          
          /* ドラッグ&ドロップスタイル */
          .sortable-ghost { opacity: 0.4; background-color: #dbeafe; }
          .sortable-chosen { background-color: #eff6ff; }
          .drag-handle { cursor: grab; color: #9ca3af; }
          .drag-handle:hover { color: #6b7280; }
          .drag-handle:active { cursor: grabbing; }
          
          /* カスタムダイアログスタイル */
          .modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.6);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 9999;
          }
          .modal-overlay.show {
            display: flex;
          }
          .modal-content {
            background: white;
            border-radius: 16px;
            padding: 0;
            max-width: 420px;
            width: 90%;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.4);
            animation: modalIn 0.2s ease-out;
          }
          @keyframes modalIn {
            from { transform: scale(0.9); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
          }
        `}} />
      </head>
      <body class="bg-gray-100 min-h-screen">
        {/* カスタム離脱確認ダイアログ */}
        <div id="leaveConfirmModal" class="modal-overlay">
          <div class="modal-content">
            <div class="bg-gradient-to-r from-orange-500 to-red-500 p-6 rounded-t-2xl">
              <div class="flex items-center justify-center">
                <div class="bg-white/20 rounded-full p-4">
                  <i class="fas fa-exclamation-triangle text-white text-3xl"></i>
                </div>
              </div>
            </div>
            <div class="p-6 text-center">
              <h3 class="text-xl font-bold text-gray-800 mb-2">ページを離れますか？</h3>
              <p class="text-gray-600 mb-6">
                入力中のデータがあります。<br />
                保存せずに移動すると、変更内容が失われます。
              </p>
              <div class="flex gap-3">
                <button id="modalCancelBtn" class="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-3 px-4 rounded-lg transition-colors">
                  <i class="fas fa-edit mr-2"></i>編集を続ける
                </button>
                <button id="modalConfirmBtn" class="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-4 rounded-lg transition-colors">
                  <i class="fas fa-sign-out-alt mr-2"></i>移動する
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Header */}
        <div class="md:hidden bg-blue-600 text-white p-4 flex items-center justify-between">
          <button id="menuToggle" class="text-2xl">
            <i class="fas fa-bars"></i>
          </button>
          <h1 class="text-xl font-bold">SmartBill</h1>
          <div class="w-8"></div>
        </div>

        <div class="flex h-screen overflow-hidden">
          {/* Sidebar */}
          <aside id="sidebar" class="sidebar fixed md:static inset-y-0 left-0 z-50 bg-white shadow-lg md:transform-none flex-shrink-0 overflow-y-auto">
            <div class="sidebar-header p-4 border-b hidden md:block">
              <div class="flex items-center justify-between">
                <h1 class="text-2xl font-bold text-blue-600">
                  <i class="fas fa-file-invoice-dollar mr-2"></i>
                  <span class="sidebar-logo-text">SmartBill</span>
                </h1>
                <button id="sidebarToggle" class="sidebar-toggle text-gray-400 hover:text-gray-600 p-1 rounded hidden md:block" title="サイドバーを開閉">
                  <i class="fas fa-chevron-left sidebar-toggle-icon"></i>
                </button>
              </div>
              <p class="sidebar-subtitle text-sm text-gray-500 mt-1">帳票管理システム</p>
            </div>
            <nav class="p-4">
              <ul class="space-y-2">
                {menuItems.map((item) => (
                  <li>
                    <a
                      href={item.path}
                      class={`menu-item nav-link flex items-center px-4 py-3 rounded-lg transition-colors ${
                        currentPath === item.path ? 'active' : 'text-gray-700'
                      }`}
                      title={item.label}
                    >
                      <i class={`fas ${item.icon} w-6`}></i>
                      <span class="menu-label ml-3">{item.label}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          {/* Overlay for mobile */}
          <div id="overlay" class="fixed inset-0 bg-black bg-opacity-50 z-40 hidden md:hidden"></div>

          {/* Main Content */}
          <main class="flex-1 p-4 md:p-8 overflow-y-auto">
            <div class="max-w-7xl mx-auto">
              {!hideTitle && <h2 class="text-2xl font-bold text-gray-800 mb-6">{title}</h2>}
              {children}
            </div>
          </main>
        </div>

      </body>
    </html>
  )
}
