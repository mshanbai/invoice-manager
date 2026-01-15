// SmartBill グローバルオブジェクトをすぐに初期化
window.SmartBill = {
  formChanged: false,
  skipConfirm: false,
  pendingAction: null,
  pendingNavigation: null
};

window.SmartBill.normalizeJan = function(value) {
  if (value === null || value === undefined || value === '') return '';
  return String(value).replace(/\D/g, '');
};

window.SmartBill.normalizeProductCode = function(value) {
  if (value === null || value === undefined || value === '') return '';
  return String(value).trim();
};

// DOM読み込み後に実行
document.addEventListener('DOMContentLoaded', function() {
  // サイドバートグル
  var sidebar = document.getElementById('sidebar');
  var overlay = document.getElementById('overlay');
  var menuToggle = document.getElementById('menuToggle');
  
  if (menuToggle) {
    menuToggle.addEventListener('click', function() {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('hidden');
    });
  }
  
  if (overlay) {
    overlay.addEventListener('click', function() {
      sidebar.classList.remove('open');
      overlay.classList.add('hidden');
    });
  }
  
  var leaveModal = document.getElementById('leaveConfirmModal');
  var modalCancelBtn = document.getElementById('modalCancelBtn');
  var modalConfirmBtn = document.getElementById('modalConfirmBtn');
  var pendingNavigation = null;
  
  // モーダル表示
  function showLeaveModal(href) {
    console.log('showLeaveModal called, href:', href, 'formChanged:', window.SmartBill.formChanged);
    pendingNavigation = href;
    if (leaveModal) leaveModal.classList.add('show');
  }
  
  // モーダル非表示
  function hideLeaveModal() {
    if (leaveModal) leaveModal.classList.remove('show');
    pendingNavigation = null;
  }
  
  // キャンセルボタン
  if (modalCancelBtn) {
    modalCancelBtn.addEventListener('click', hideLeaveModal);
  }
  
  // 確認ボタン（移動する）
  if (modalConfirmBtn) {
    modalConfirmBtn.addEventListener('click', function() {
      if (pendingNavigation) {
        window.SmartBill.skipConfirm = true;
        window.SmartBill.formChanged = false;
        window.location.href = pendingNavigation;
      }
    });
  }
  
  // ESCキーでモーダルを閉じる
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && leaveModal && leaveModal.classList.contains('show')) {
      hideLeaveModal();
    }
  });
  
  // オーバーレイクリックでモーダルを閉じる
  if (leaveModal) {
    leaveModal.addEventListener('click', function(e) {
      if (e.target === leaveModal) {
        hideLeaveModal();
      }
    });
  }
  
  // ナビゲーションリンクのクリックをインターセプト
  document.addEventListener('click', function(e) {
    var link = e.target.closest('a[href^="/"]');
    if (link && window.SmartBill.formChanged && !window.SmartBill.skipConfirm) {
      e.preventDefault();
      e.stopPropagation();
      showLeaveModal(link.getAttribute('href'));
    }
  });
  
  // ブラウザの戻るボタン対策
  window.addEventListener('beforeunload', function(e) {
    if (window.SmartBill.formChanged && !window.SmartBill.skipConfirm) {
      e.preventDefault();
      e.returnValue = '';
      return '';
    }
  });
  
  // サイドバートグルボタン
  var sidebarToggle = document.getElementById('sidebarToggle');
  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', function() {
      window.SmartBill.toggleSidebar();
    });
  }
});

// =====================================
// フォーム変更検知（グローバル関数として定義）
// =====================================
window.SmartBill.trackFormChanges = function(formId) {
  var form = document.getElementById(formId);
  if (!form) {
    console.log('Form not found:', formId);
    return;
  }
  
  console.log('trackFormChanges started for:', formId);
  
  // 入力変更を検知
  form.addEventListener('input', function() {
    window.SmartBill.formChanged = true;
    console.log('Form changed (input)');
  });
  
  // セレクト、ラジオ、チェックボックスの変更を検知
  form.addEventListener('change', function() {
    window.SmartBill.formChanged = true;
    console.log('Form changed (change)');
  });
};

// フォーム変更をリセット
window.SmartBill.resetFormTracking = function() {
  window.SmartBill.formChanged = false;
  window.SmartBill.skipConfirm = false;
};

// =====================================
// キーボードショートカット
// =====================================
window.SmartBill.setupKeyboardShortcuts = function(options) {
  var opts = Object.assign({
    saveCallback: null,       // Ctrl+S/Cmd+S で呼び出す関数
    escapeCallback: null,     // Escape で呼び出す関数
    formId: null              // 対象フォームID（指定時はフォームをsubmit）
  }, options);
  
  document.addEventListener('keydown', function(e) {
    // Ctrl+S / Cmd+S で保存
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      
      if (opts.saveCallback) {
        opts.saveCallback();
      } else if (opts.formId) {
        var form = document.getElementById(opts.formId);
        if (form) {
          // フォームの submit イベントを発火
          var submitEvent = new Event('submit', { bubbles: true, cancelable: true });
          form.dispatchEvent(submitEvent);
        }
      }
    }
    
    // Escape で戻る（モーダルが開いていない場合のみ）
    if (e.key === 'Escape') {
      var leaveModal = document.getElementById('leaveConfirmModal');
      var customModal = document.getElementById('customConfirmModal');
      
      // モーダルが開いている場合は何もしない（モーダルのイベントに任せる）
      if (leaveModal && leaveModal.classList.contains('show')) return;
      if (customModal && customModal.classList.contains('show')) return;
      
      if (opts.escapeCallback) {
        opts.escapeCallback();
      }
    }
  });
};

// ショートカットヘルプを表示するためのアイコン追加
window.SmartBill.showShortcutHelp = function() {
  var helpHtml = 
    '<div class="fixed bottom-4 right-4 bg-gray-800 text-white text-xs rounded-lg p-3 shadow-lg z-50" id="shortcutHelp">' +
    '<div class="font-bold mb-2"><i class="fas fa-keyboard mr-1"></i>キーボードショートカット</div>' +
    '<div class="space-y-1">' +
    '<div><kbd class="bg-gray-600 px-1 rounded">Ctrl+S</kbd> / <kbd class="bg-gray-600 px-1 rounded">⌘+S</kbd> 保存</div>' +
    '<div><kbd class="bg-gray-600 px-1 rounded">Esc</kbd> 一覧に戻る</div>' +
    '</div>' +
    '<button onclick="this.parentElement.remove()" class="absolute top-1 right-2 text-gray-400 hover:text-white">&times;</button>' +
    '</div>';
  
  var existing = document.getElementById('shortcutHelp');
  if (existing) {
    existing.remove();
  } else {
    document.body.insertAdjacentHTML('beforeend', helpHtml);
    // 5秒後に自動で消す
    setTimeout(function() {
      var help = document.getElementById('shortcutHelp');
      if (help) help.remove();
    }, 5000);
  }
};

// =====================================
// カスタム確認ダイアログ
// =====================================

// 汎用確認ダイアログを表示（Promise版）
window.SmartBill.showConfirmDialog = function(options) {
  return new Promise(function(resolve) {
    var modal = document.getElementById('customConfirmModal');
    if (!modal) {
      // モーダルが存在しない場合は作成
      modal = document.createElement('div');
      modal.id = 'customConfirmModal';
      modal.className = 'modal-overlay';
      modal.innerHTML = 
        '<div class="modal-content">' +
        '<div id="confirmModalHeader" class="bg-gradient-to-r from-orange-500 to-red-500 p-6 rounded-t-2xl">' +
        '<div class="flex items-center justify-center">' +
        '<div class="bg-white/20 rounded-full p-4">' +
        '<i id="confirmModalIcon" class="fas fa-exclamation-triangle text-white text-3xl"></i>' +
        '</div></div></div>' +
        '<div class="p-6 text-center">' +
        '<h3 id="confirmModalTitle" class="text-xl font-bold text-gray-800 mb-2"></h3>' +
        '<p id="confirmModalMessage" class="text-gray-600 mb-6"></p>' +
        '<div class="flex gap-3">' +
        '<button id="confirmModalCancelBtn" class="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-3 px-4 rounded-lg transition-colors"></button>' +
        '<button id="confirmModalConfirmBtn" class="flex-1 font-bold py-3 px-4 rounded-lg transition-colors"></button>' +
        '</div></div></div>';
      document.body.appendChild(modal);
      
      // オーバーレイクリックで閉じる
      modal.addEventListener('click', function(e) {
        if (e.target === modal) {
          modal.classList.remove('show');
          resolve(false);
        }
      });
      
      // ESCキーで閉じる
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.classList.contains('show')) {
          modal.classList.remove('show');
          resolve(false);
        }
      });
    }
    
    // オプション設定
    var defaults = {
      title: '確認',
      message: '本当によろしいですか？',
      confirmText: 'はい',
      cancelText: 'キャンセル',
      icon: 'fa-exclamation-triangle',
      type: 'warning' // warning, danger, info
    };
    var opts = Object.assign({}, defaults, options);
    
    // ヘッダー色設定
    var headerColors = {
      warning: 'from-orange-500 to-red-500',
      danger: 'from-red-600 to-red-700',
      info: 'from-blue-500 to-blue-600',
      success: 'from-green-500 to-emerald-600'
    };
    var confirmBtnColors = {
      warning: 'bg-red-500 hover:bg-red-600 text-white',
      danger: 'bg-red-600 hover:bg-red-700 text-white',
      info: 'bg-blue-500 hover:bg-blue-600 text-white',
      success: 'bg-green-500 hover:bg-green-600 text-white'
    };
    
    document.getElementById('confirmModalHeader').className = 'bg-gradient-to-r ' + headerColors[opts.type] + ' p-6 rounded-t-2xl';
    document.getElementById('confirmModalIcon').className = 'fas ' + opts.icon + ' text-white text-3xl';
    document.getElementById('confirmModalTitle').textContent = opts.title;
    document.getElementById('confirmModalMessage').innerHTML = opts.message;
    
    var cancelBtnEl = document.getElementById('confirmModalCancelBtn');
    if (opts.cancelText) {
      cancelBtnEl.innerHTML = '<i class="fas fa-times mr-2"></i>' + opts.cancelText;
      cancelBtnEl.style.display = 'block';
    } else {
      cancelBtnEl.style.display = 'none';
    }
    
    document.getElementById('confirmModalConfirmBtn').innerHTML = '<i class="fas fa-check mr-2"></i>' + opts.confirmText;
    document.getElementById('confirmModalConfirmBtn').className = 'flex-1 font-bold py-3 px-4 rounded-lg transition-colors ' + confirmBtnColors[opts.type];
    
    // ボタンイベント（一度だけ実行）
    var cancelBtn = document.getElementById('confirmModalCancelBtn');
    var confirmBtn = document.getElementById('confirmModalConfirmBtn');
    
    var newCancelBtn = cancelBtn.cloneNode(true);
    var newConfirmBtn = confirmBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    
    newCancelBtn.addEventListener('click', function() {
      modal.classList.remove('show');
      resolve(false);
    });
    
    newConfirmBtn.addEventListener('click', function() {
      modal.classList.remove('show');
      resolve(true);
    });
    
    // モーダル表示
    modal.classList.add('show');
  });
};

// 離脱確認ダイアログ（コールバック形式）
window.SmartBill.confirmLeave = function(callback) {
  window.SmartBill.showConfirmDialog({
    title: 'ページを離れますか？',
    message: '入力中のデータがあります。<br/>保存せずに移動すると、変更内容が失われます。',
    confirmText: '移動する',
    cancelText: '編集を続ける',
    icon: 'fa-exclamation-triangle',
    type: 'warning'
  }).then(function(result) {
    if (result && callback) callback();
  });
};

// 離脱確認ダイアログ（Promise形式 - async/await対応）
window.SmartBill.confirmLeaveAsync = function() {
  return window.SmartBill.showConfirmDialog({
    title: 'ページを離れますか？',
    message: '入力中のデータがあります。<br/>保存せずに移動すると、変更内容が失われます。',
    confirmText: '移動する',
    cancelText: '編集を続ける',
    icon: 'fa-exclamation-triangle',
    type: 'warning'
  });
};

// 削除確認ダイアログ
window.SmartBill.confirmDelete = function(itemName) {
  return window.SmartBill.showConfirmDialog({
    title: '削除の確認',
    message: (itemName ? '「' + itemName + '」を' : 'このデータを') + '削除しますか？<br/>この操作は取り消せません。',
    confirmText: '削除する',
    cancelText: 'キャンセル',
    icon: 'fa-trash-alt',
    type: 'danger'
  });
};

// 保存成功ダイアログ
window.SmartBill.showSuccessDialog = function(message) {
  return window.SmartBill.showConfirmDialog({
    title: '保存完了',
    message: message || 'データを保存しました。',
    confirmText: 'OK',
    cancelText: '',
    icon: 'fa-check-circle',
    type: 'success'
  });
};

// 保存失敗ダイアログ（成功モーダルと同UI）
window.SmartBill.showErrorDialog = function(message) {
  return window.SmartBill.showConfirmDialog({
    title: '保存失敗',
    message: message || '保存に失敗しました。',
    confirmText: 'OK',
    cancelText: '',
    icon: 'fa-times-circle',
    type: 'danger'
  });
};

// =====================================
// サイドバー開閉機能
// =====================================
window.SmartBill.toggleSidebar = function() {
  var sidebar = document.getElementById('sidebar');
  if (sidebar) {
    sidebar.classList.toggle('collapsed');
  }
};

window.SmartBill.collapseSidebar = function() {
  var sidebar = document.getElementById('sidebar');
  if (sidebar) {
    sidebar.classList.add('collapsed');
  }
};

window.SmartBill.expandSidebar = function() {
  var sidebar = document.getElementById('sidebar');
  if (sidebar) {
    sidebar.classList.remove('collapsed');
  }
};

// =====================================
// 入力補助機能
// =====================================

// 郵便番号のハイフン自動挿入（1234567 → 123-4567）
window.SmartBill.formatPostalCode = function(value) {
  var cleaned = value.replace(/[^0-9]/g, '');
  if (cleaned.length >= 4) {
    return cleaned.substring(0, 3) + '-' + cleaned.substring(3, 7);
  }
  return cleaned;
};

// 電話番号の自動フォーマット
window.SmartBill.formatPhoneNumber = function(value) {
  var cleaned = value.replace(/[^0-9]/g, '');
  
  // 携帯番号（090, 080, 070）
  if (/^0[789]0/.test(cleaned)) {
    if (cleaned.length >= 7) {
      return cleaned.substring(0, 3) + '-' + cleaned.substring(3, 7) + '-' + cleaned.substring(7, 11);
    } else if (cleaned.length >= 4) {
      return cleaned.substring(0, 3) + '-' + cleaned.substring(3);
    }
  }
  // 固定電話（東京03など市外局番2桁）
  else if (/^0[3456]/.test(cleaned) && cleaned.length > 2) {
    if (cleaned.length >= 6) {
      return cleaned.substring(0, 2) + '-' + cleaned.substring(2, 6) + '-' + cleaned.substring(6, 10);
    } else if (cleaned.length >= 3) {
      return cleaned.substring(0, 2) + '-' + cleaned.substring(2);
    }
  }
  // その他（市外局番3桁または4桁）
  else if (/^0/.test(cleaned) && cleaned.length > 3) {
    // 0120など
    if (/^0120/.test(cleaned)) {
      if (cleaned.length >= 7) {
        return cleaned.substring(0, 4) + '-' + cleaned.substring(4, 7) + '-' + cleaned.substring(7, 10);
      } else if (cleaned.length >= 5) {
        return cleaned.substring(0, 4) + '-' + cleaned.substring(4);
      }
    }
    // 一般的な3桁市外局番
    else {
      if (cleaned.length >= 7) {
        return cleaned.substring(0, 3) + '-' + cleaned.substring(3, 6) + '-' + cleaned.substring(6, 10);
      } else if (cleaned.length >= 4) {
        return cleaned.substring(0, 3) + '-' + cleaned.substring(3);
      }
    }
  }
  
  return cleaned;
};

// 入力フィールドの自動フォーマット設定
window.SmartBill.setupAutoFormat = function() {
  // 郵便番号フィールドの自動フォーマット
  var postalInputs = document.querySelectorAll('input[name="postal_code"]');
  postalInputs.forEach(function(input) {
    input.addEventListener('input', function(e) {
      var cursorPos = e.target.selectionStart;
      var oldValue = e.target.value;
      var newValue = window.SmartBill.formatPostalCode(oldValue);
      
      if (newValue !== oldValue) {
        e.target.value = newValue;
        // カーソル位置を調整
        var diff = newValue.length - oldValue.length;
        e.target.setSelectionRange(cursorPos + diff, cursorPos + diff);
      }
    });
    
    // blurイベントでも最終フォーマット
    input.addEventListener('blur', function(e) {
      e.target.value = window.SmartBill.formatPostalCode(e.target.value);
    });
  });
  
  // 電話番号フィールドの自動フォーマット（tel, fax, mobile）
  var phoneInputs = document.querySelectorAll('input[name="tel"], input[name="fax"], input[name="mobile"]');
  phoneInputs.forEach(function(input) {
    input.addEventListener('blur', function(e) {
      var formatted = window.SmartBill.formatPhoneNumber(e.target.value);
      if (formatted !== e.target.value) {
        e.target.value = formatted;
      }
    });
  });
};

// 必須項目の赤枠表示
window.SmartBill.setupRequiredValidation = function(formId) {
  var form = document.getElementById(formId);
  if (!form) return;
  
  var requiredInputs = form.querySelectorAll('input[required], select[required], textarea[required]');
  
  requiredInputs.forEach(function(input) {
    // 初期チェック
    updateRequiredStyle(input);
    
    // 入力時にスタイル更新
    input.addEventListener('input', function() {
      updateRequiredStyle(input);
    });
    
    // blur時にもスタイル更新
    input.addEventListener('blur', function() {
      updateRequiredStyle(input);
    });
  });
  
  function updateRequiredStyle(input) {
    if (!input.value.trim()) {
      input.classList.add('border-red-400');
      input.classList.add('bg-red-50');
    } else {
      input.classList.remove('border-red-400');
      input.classList.remove('bg-red-50');
    }
  }
};

// =====================================
// 郵便番号から住所を自動入力
// =====================================
window.SmartBill.setupPostalCodeLookup = function(postalCodeFieldName, addressFieldName) {
  console.log('setupPostalCodeLookup called:', postalCodeFieldName, addressFieldName);
  
  var postalInput = document.querySelector('input[name="' + postalCodeFieldName + '"]');
  var addressInput = document.querySelector('input[name="' + addressFieldName + '"]');
  
  if (!postalInput) {
    console.log('Postal code input not found:', postalCodeFieldName);
    return;
  }
  if (!addressInput) {
    console.log('Address input not found:', addressFieldName);
    return;
  }
  
  console.log('Postal code lookup setup complete');
  
  // 郵便番号入力欄にボタンを追加
  var wrapper = postalInput.parentElement;
  var searchBtn = document.createElement('button');
  searchBtn.type = 'button';
  searchBtn.className = 'absolute right-2 top-1/2 -translate-y-1/2 text-blue-600 hover:text-blue-800 text-sm px-2';
  searchBtn.innerHTML = '<i class="fas fa-search"></i>';
  searchBtn.title = '住所検索';
  wrapper.style.position = 'relative';
  wrapper.appendChild(searchBtn);
  
  // 検索実行関数
  function searchAddress() {
    var postalCode = postalInput.value.replace(/[^0-9]/g, '');
    console.log('Searching address for postal code:', postalCode);
    
    if (postalCode.length !== 7) {
      console.log('Invalid postal code length:', postalCode.length);
      if (postalCode.length > 0) {
        alert('郵便番号は7桁で入力してください（ハイフンなし）');
      }
      return;
    }
    
    searchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    
    // 郵便番号API（zipcloud）を使用
    fetch('https://zipcloud.ibsnet.co.jp/api/search?zipcode=' + postalCode)
      .then(function(res) { return res.json(); })
      .then(function(data) {
        console.log('API response:', data);
        
        if (data.results && data.results[0]) {
          var result = data.results[0];
          var address = result.address1 + result.address2 + result.address3;
          addressInput.value = address;
          addressInput.dispatchEvent(new Event('input', { bubbles: true }));
          console.log('Address set:', address);
        } else {
          alert('住所が見つかりませんでした');
        }
      })
      .catch(function(e) {
        console.error('郵便番号検索エラー:', e);
        alert('住所検索に失敗しました');
      })
      .finally(function() {
        searchBtn.innerHTML = '<i class="fas fa-search"></i>';
      });
  }
  
  // ボタンクリックで検索
  searchBtn.addEventListener('click', searchAddress);
  
  // Enterキーで検索（郵便番号欄でEnter押した時）
  postalInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      searchAddress();
    }
  });
  
  // blurでも検索（7桁入力されていれば、住所が空の場合）
  postalInput.addEventListener('blur', function() {
    var postalCode = postalInput.value.replace(/[^0-9]/g, '');
    if (postalCode.length === 7 && !addressInput.value) {
      searchAddress();
    }
  });
};
