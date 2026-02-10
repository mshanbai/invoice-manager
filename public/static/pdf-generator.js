/**
 * SmartBill PDF Generator
 * 見積書・請求書・納品書のPDF出力機能
 */

(function() {
  'use strict';
  
  function formatNumber(num) {
    if (num === null || num === undefined) return '0';
    return Math.floor(num).toLocaleString('ja-JP');
  }
  
  function formatDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return parts[0] + '年' + parseInt(parts[1]) + '月' + parseInt(parts[2]) + '日';
  }
  
  function formatDateShort(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return parseInt(parts[1]) + '月' + parseInt(parts[2]) + '日';
  }
  
  function formatDateYYYYMM(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return '';
    return parts[0] + parts[1].padStart(2, '0');
  }
  
  function formatDateYYYYMMDD(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return '';
    return parts[0] + parts[1].padStart(2, '0') + parts[2].padStart(2, '0');
  }
  
  function normalizeTaxRate(rateLike) {
    if (rateLike === null || rateLike === undefined) return 0;
    if (typeof rateLike === 'number' && Number.isFinite(rateLike)) return rateLike;
    var s = String(rateLike).trim();
    if (!s) return 0;
    var m = s.match(/(\d+(?:\.\d+)?)/);
    if (!m) return 0;
    var n = Number(m[1]);
    return Number.isFinite(n) ? n : 0;
  }

  function calculateTaxBreakdown(items) {
    var baseByRate = {};
    var subtotal = 0;
    
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var amount = item.amount || (item.quantity * item.unit_price);
      var rate = normalizeTaxRate(item.tax_rate);
      var key = String(rate);
      
      subtotal += amount;
      baseByRate[key] = (baseByRate[key] || 0) + amount;
    }
    
    var taxByRate = Object.keys(baseByRate)
      .map(function(key) {
        var rate = Number(key);
        var base = baseByRate[key] || 0;
        var tax = Math.floor(base * (rate / 100));
        return { rate: rate, base: base, tax: tax };
      })
      .sort(function(a, b) { return b.rate - a.rate; });
    
    var totalTax = taxByRate.reduce(function(sum, row) { return sum + row.tax; }, 0);
    var tax10Row = taxByRate.find(function(row) { return row.rate === 10; }) || { tax: 0, base: 0 };
    var tax8Row = taxByRate.find(function(row) { return row.rate === 8; }) || { tax: 0, base: 0 };
    var tax0Row = taxByRate.find(function(row) { return row.rate === 0; }) || { tax: 0, base: 0 };
    
    return {
      subtotal: subtotal,
      subtotal10: tax10Row.base,
      subtotal8: tax8Row.base,
      subtotal0: tax0Row.base,
      tax10Amount: tax10Row.tax,
      tax8Amount: tax8Row.tax,
      hasTax8: tax8Row.base > 0,
      hasTax0: tax0Row.base > 0,
      taxByRate: taxByRate,
      totalTax: totalTax,
      total: subtotal + totalTax
    };
  }
  
  function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
  
  function getPrintStyles() {
    return '\
@page { size: A4 portrait; margin: 10mm 15mm; }\
* { box-sizing: border-box; margin: 0; padding: 0; }\
body { font-family: "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif; font-size: 10pt; line-height: 1.4; color: #333; background: white; }\
.print-container { width: 180mm; margin: 0 auto; background: white; }\
.title-row { display: flex; margin-bottom: 3mm; min-height: 12mm; }\
.title-left { width: 55%; }\
.title-right { width: 45%; background: #2c5282; display: flex; align-items: center; justify-content: center; }\
.title-right.estimate { background: #16a34a; }\
.title-right.delivery { background: #9333ea; }\
.title-text { font-size: 16pt; font-weight: bold; letter-spacing: 8px; color: white; }\
.client-in-title { font-size: 9pt; padding-top: 2mm; }\
.client-postal { margin-bottom: 1mm; }\
.client-address { margin-bottom: 1mm; }\
.client-name { font-size: 12pt; font-weight: bold; margin-top: 1mm; }\
.client-suffix { font-size: 11pt; margin-left: 5px; }\
.main-section { display: flex; justify-content: space-between; margin-bottom: 3mm; }\
.left-col { width: 48%; }\
.right-col { width: 35%; }\
.doc-info { font-size: 9pt; margin-bottom: 4mm; }\
.doc-info-row { margin-bottom: 1mm; }\
.doc-info-label { display: inline-block; width: 75px; }\
.doc-info-value { display: inline-block; }\
.company-block { position: relative; }\
.company-logo { display: block; max-height: 30mm; max-width: 70mm; margin-bottom: 2mm; }\
.company-name-wrap { position: relative; display: inline-block; }\
.company-name { font-size: 11pt; font-weight: bold; margin-bottom: 1mm; }\
.company-stamp { position: absolute; left: calc(100% - 1.5em); top: -2mm; width: 14mm; height: 14mm; opacity: 0.85; }\
.company-info { font-size: 8pt; line-height: 1.5; }\
.billing-intro-align { display: flex; align-items: flex-start; min-height: 12mm; }\
.billing-intro { font-size: 9pt; margin-top: 16mm; margin-bottom: 2mm; }\
.billing-box { display: flex; width: 100%; border: 2px solid #333; margin-bottom: 3mm; }\
.billing-label { display: flex; align-items: center; font-size: 10pt; padding: 2mm 3mm; background: #2c5282; color: white; font-weight: bold; }\
.billing-label.estimate { background: #16a34a; }\
.billing-label.delivery { background: #9333ea; }\
.billing-label-sub { font-size: 8pt; font-weight: normal; }\
.billing-value { display: flex; align-items: center; justify-content: flex-end; flex: 1; font-size: 14pt; font-weight: bold; padding: 2mm 4mm; }\
.bank-box { display: flex; width: 100%; border: 1px solid #999; font-size: 9pt; margin-bottom: 1mm; }\
.bank-header { background: #2c5282; color: white; font-weight: bold; padding: 2mm 3mm; display: flex; align-items: center; }\
.bank-body { padding: 2mm 3mm; line-height: 1.6; flex: 1; }\
.bank-note { font-size: 7.5pt; color: #666; margin-bottom: 2mm; }\
.items-table { width: 100%; border-collapse: collapse; margin-bottom: 2mm; font-size: 8.5pt; }\
.items-table th { background: #e8e8e8; border: 1px solid #999; padding: 1.2mm 2mm; text-align: center; font-weight: bold; }\
.items-table td { border: 1px solid #999; padding: 1.2mm 2mm; }\
.col-date { width: 10%; text-align: center; }\
.col-name { width: 44%; }\
.col-qty { width: 8%; text-align: right; }\
.col-price { width: 13%; text-align: right; }\
.col-amount { width: 15%; text-align: right; }\
.col-tax { width: 6%; text-align: center; }\
.items-footer { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 3mm; }\
.tax-note { font-size: 8pt; color: #666; }\
.summary-table { border-collapse: collapse; font-size: 8.5pt; }\
.summary-table td { padding: 1mm 3mm; border: 1px solid #999; }\
.summary-table .label { background: #e8e8e8; text-align: center; font-weight: bold; }\
.summary-table .value { text-align: right; min-width: 70px; }\
.summary-table .total-label { background: #2c5282; color: white; }\
.summary-table .total-value { font-weight: bold; }\
.notes-box { margin-top: 3mm; padding: 2mm 3mm; border: 1px solid #ccc; background: #fafafa; min-height: 12mm; }\
.notes-title { font-weight: bold; margin-bottom: 1mm; font-size: 8.5pt; }\
.notes-content { font-size: 8.5pt; white-space: pre-wrap; min-height: 8mm; }\
.page-num { text-align: center; font-size: 8pt; color: #666; margin-top: 3mm; }\
.print-buttons { position: fixed; top: 10px; right: 10px; z-index: 1000; display: flex; gap: 10px; }\
.print-btn { padding: 10px 20px; font-size: 14px; font-weight: bold; border: none; border-radius: 5px; cursor: pointer; }\
.print-btn-primary { background: #3b82f6; color: white; }\
.print-btn-secondary { background: #6b7280; color: white; }\
@media print { .print-buttons { display: none !important; } html { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }\
@media screen { body { background: #e5e7eb; padding: 20px; } .print-container { padding: 15mm; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border-radius: 5px; } }\
.highlight-box { margin-top: 4mm; padding: 2mm 3mm; background: #eff6ff; border-left: 3px solid #3b82f6; }\
.highlight-label { font-size: 9pt; color: #666; }\
.highlight-amount { font-size: 12pt; font-weight: bold; color: #1e40af; margin-left: 6px; }\
.half-page { height: 133.5mm; overflow: hidden; position: relative; }\
.half-page + .half-page { border-top: 1px dashed #999; padding-top: 10mm; }\
.half-page .title-text { font-size: 14pt; letter-spacing: 4px; }\
.half-page .items-table { font-size: 7.5pt; }\
.half-page .items-table th, .half-page .items-table td { padding: 0.8mm 1.5mm; }\
.half-page .company-info { font-size: 7pt; }\
.half-page .doc-info { font-size: 8pt; }\
.half-page .billing-value { font-size: 12pt; }\
.half-page .notes-box { min-height: 6mm; padding: 1.5mm 2mm; }\
.half-page .notes-content { font-size: 7.5pt; min-height: 4mm; }\
.copy-label { position: absolute; top: 2mm; right: 2mm; font-size: 8pt; color: #666; background: #f0f0f0; padding: 1mm 2mm; border-radius: 2px; }\
';
  }
  
  function generateInvoiceItemsTableHTML(items, minRows) {
    var targetRows = items.length >= 12 ? items.length : (items.length >= 8 ? Math.max(items.length, 10) : Math.max(items.length + 2, minRows || 6));
    var has8Percent = items.some(function(item) { return item.tax_rate === 8; });
    
    var html = '<table class="items-table"><thead><tr>';
    html += '<th class="col-date">日付</th><th class="col-name">品目</th><th class="col-qty">数量</th><th class="col-price">単価</th><th class="col-amount">金額</th><th class="col-tax">税</th>';
    html += '</tr></thead><tbody>';
    
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var amount = item.amount || (item.quantity * item.unit_price);
      var dateStr = item.delivery_date ? formatDateShort(item.delivery_date) : '';
      var taxRate = item.tax_rate !== null && item.tax_rate !== undefined ? item.tax_rate : 10;
      // 税率表示: 10, 8, 0 のみ（%なし、税列があるので*不要）
      var taxDisplay = taxRate === 8 ? '8' : (taxRate === 0 ? '0' : '10');
      
      html += '<tr>';
      html += '<td class="col-date">' + dateStr + '</td>';
      html += '<td class="col-name">' + escapeHtml(item.product_name || '') + '</td>';
      html += '<td class="col-qty">' + formatNumber(item.quantity) + '</td>';
      html += '<td class="col-price">&yen;' + formatNumber(item.unit_price) + '</td>';
      html += '<td class="col-amount">&yen;' + formatNumber(amount) + '</td>';
      html += '<td class="col-tax">' + taxDisplay + '</td>';
      html += '</tr>';
    }
    
    var blankRows = Math.max(0, targetRows - items.length);
    for (var j = 0; j < blankRows; j++) {
      html += '<tr><td class="col-date">&nbsp;</td><td class="col-name">&nbsp;</td><td class="col-qty">&nbsp;</td><td class="col-price">&nbsp;</td><td class="col-amount">&nbsp;</td><td class="col-tax">&nbsp;</td></tr>';
    }
    
    html += '</tbody></table>';
    return { html: html, has8Percent: has8Percent };
  }
  
  // 税列なしテーブル（見積書・納品書用） - 備考列追加
  function generateSimpleItemsTableHTML(items, minRows, showRetail) {
    var actualMinRows = items.length >= 10 ? items.length : Math.min(minRows || 10, 15 - items.length);
    
    var html = '<table class="items-table"><thead><tr>';
    if (showRetail) {
      // 上代・下代表示あり
      html += '<th style="width:5%">No</th><th style="width:32%">品名・摘要</th><th style="width:8%">数量</th><th style="width:12%">上代</th><th style="width:12%">下代</th><th style="width:14%">金額</th><th style="width:17%">備考</th>';
    } else {
      // 通常表示（単価・金額・備考）
      html += '<th style="width:6%">No</th><th style="width:40%">品名・摘要</th><th style="width:10%">数量</th><th style="width:12%">単価</th><th style="width:14%">金額</th><th style="width:18%">備考</th>';
    }
    html += '</tr></thead><tbody>';
    
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var amount = item.amount || (item.quantity * item.unit_price);
      // 品名と備考（item_notes）を結合表示
      var productCell = escapeHtml(item.product_name || '');
      if (item.item_notes) {
        productCell += '<br><span style="font-size:8pt;color:#666;">' + escapeHtml(item.item_notes) + '</span>';
      }
      // 備考列（notes）
      var notesCell = escapeHtml(item.notes || '');
      
      if (showRetail) {
        // 上代・下代表示
        var retailPrice = item.retail_price || 0;
        html += '<tr><td style="text-align:center;vertical-align:top">' + (i + 1) + '</td><td style="vertical-align:top">' + productCell + '</td><td style="text-align:center;vertical-align:top">' + formatNumber(item.quantity) + '</td><td style="text-align:right;vertical-align:top">' + (retailPrice > 0 ? '&yen;' + formatNumber(retailPrice) : '-') + '</td><td style="text-align:right;vertical-align:top">&yen;' + formatNumber(item.unit_price) + '</td><td style="text-align:right;vertical-align:top">&yen;' + formatNumber(amount) + '</td><td style="vertical-align:top;font-size:8pt;">' + notesCell + '</td></tr>';
      } else {
        html += '<tr><td style="text-align:center;vertical-align:top">' + (i + 1) + '</td><td style="vertical-align:top">' + productCell + '</td><td style="text-align:center;vertical-align:top">' + formatNumber(item.quantity) + '</td><td style="text-align:right;vertical-align:top">&yen;' + formatNumber(item.unit_price) + '</td><td style="text-align:right;vertical-align:top">&yen;' + formatNumber(amount) + '</td><td style="vertical-align:top;font-size:8pt;">' + notesCell + '</td></tr>';
      }
    }
    
    var blankRows = Math.max(0, actualMinRows - items.length);
    for (var j = 0; j < blankRows; j++) {
      if (showRetail) {
        html += '<tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>';
      } else {
        html += '<tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>';
      }
    }
    
    html += '</tbody></table>';
    return html;
  }
  
  // 税列ありテーブル（請求書用 - 現在未使用だが互換性のため残す）
  function generateItemsTableHTML(items, minRows) {
    var actualMinRows = items.length >= 10 ? items.length : Math.min(minRows || 10, 15 - items.length);
    
    var html = '<table class="items-table"><thead><tr>';
    html += '<th style="width:6%">No</th><th style="width:44%">品名・摘要</th><th style="width:10%">数量</th><th style="width:14%">単価</th><th style="width:16%">金額</th><th style="width:10%">税率</th>';
    html += '</tr></thead><tbody>';
    
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var amount = item.amount || (item.quantity * item.unit_price);
      var taxRate = item.tax_rate !== null && item.tax_rate !== undefined ? item.tax_rate : 10;
      html += '<tr><td style="text-align:center">' + (i + 1) + '</td><td>' + escapeHtml(item.product_name || '') + '</td><td style="text-align:center">' + formatNumber(item.quantity) + '</td><td style="text-align:right">&yen;' + formatNumber(item.unit_price) + '</td><td style="text-align:right">&yen;' + formatNumber(amount) + '</td><td style="text-align:center">' + taxRate + '%</td></tr>';
    }
    
    var blankRows = Math.max(0, actualMinRows - items.length);
    for (var j = 0; j < blankRows; j++) {
      html += '<tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>';
    }
    
    html += '</tbody></table>';
    return html;
  }
  
  /**
   * 請求書HTML生成
   * レイアウト:
   * [タイトル行] 左50%:請求先情報 | 右50%:「請求書」タイトル背景色
   * [メイン行]   左50%:下記の通り+金額+振込先 | 右50%:請求日等+自社情報
   * [明細テーブル]
   * [合計]
   * [備考]
   */
  function generateInvoiceHTML(data) {
    var companyInfo = data.companyInfo || {};
    var bankInfo = data.bankInfo || {};
    var bankInfoList = Array.isArray(data.bankInfoList) ? data.bankInfoList.slice(0, 3) : [];
    var clientInfo = data.clientInfo || {};
    
    var logoHtml = '';
    if (companyInfo.logo_url && companyInfo.logo_url.startsWith('data:image')) {
      logoHtml = '<img src="' + companyInfo.logo_url + '" class="company-logo" alt="">';
    }
    
    var stampHtml = '';
    if (companyInfo.stamp_url && companyInfo.stamp_url.startsWith('data:image')) {
      stampHtml = '<img src="' + companyInfo.stamp_url + '" class="company-stamp" alt="">';
    }
    
    var companyAddress = [companyInfo.address || '', companyInfo.address_number || ''].filter(Boolean).join('');
    var clientAddress = [clientInfo.address || '', clientInfo.address_number || ''].filter(Boolean).join('');
    var honorific = clientInfo.is_individual ? '様' : '御中';
    
    var bankHtml = '';
    if (bankInfoList.length === 0 && bankInfo.bank_name) {
      bankInfoList = [bankInfo];
    }
    if (bankInfoList.length > 0) {
      bankHtml = '<div class="bank-box"><div class="bank-header">振込先</div>';
      bankInfoList.forEach(function(b, idx) {
        bankHtml += '<div class="bank-body">';
        bankHtml += escapeHtml(b.bank_name || '') + ' ' + escapeHtml(b.bank_branch || '') + '<br>';
        var typeLabel = b.account_type_label || (b.account_type === 'current' ? '当座' : '普通');
        bankHtml += escapeHtml(typeLabel) + ' ' + escapeHtml(b.account_number || '') + '<br>';
        bankHtml += '口座名義: ' + escapeHtml(b.account_holder || '');
        bankHtml += '</div>';
        if (idx < bankInfoList.length - 1) {
          bankHtml += '<div style="height:6px;"></div>';
        }
      });
      bankHtml += '</div>';
      bankHtml += '<div class="bank-note">※振込手数料は御社のご負担にてお願い申し上げます。</div>';
    }
    
    var itemsResult = generateInvoiceItemsTableHTML(data.items || [], 6);
    var taxBreakdown = calculateTaxBreakdown(data.items || []);
    
    // 常にtaxBreakdownの計算結果を使用
    var summaryHtml = '<table class="summary-table"><tr><td class="label">小計</td><td class="value">&yen;' + formatNumber(taxBreakdown.subtotal) + '</td>';
    taxBreakdown.taxByRate.forEach(function(row) {
      if (row.rate > 0 && row.base > 0) {
        summaryHtml += '<td class="label">消費税' + row.rate + '%</td><td class="value">&yen;' + formatNumber(row.tax) + '</td>';
      }
    });
    summaryHtml += '<td class="label total-label">合計</td><td class="value total-value">&yen;' + formatNumber(taxBreakdown.total) + '</td></tr></table>';
    
    // 税列があるので注記は不要
    var taxNote = '<div class="tax-note"></div>';
    
    var html = '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>請求書</title><style>' + getPrintStyles() + '</style></head><body>';
    html += '<div class="print-buttons"><button class="print-btn print-btn-primary" onclick="window.print()">印刷 / PDF保存</button><button class="print-btn print-btn-secondary" onclick="window.close()">閉じる</button></div>';
    html += '<div class="print-container">';
    
    // タイトル行: 左に請求先、右にタイトル
    html += '<div class="title-row">';
    html += '<div class="title-left"><div class="client-in-title">';
    if (clientInfo.postal_code) html += '<div class="client-postal">〒' + escapeHtml(clientInfo.postal_code) + '</div>';
    if (clientAddress) html += '<div class="client-address">' + escapeHtml(clientAddress) + '</div>';
    if (clientInfo.building_name) html += '<div class="client-address">' + escapeHtml(clientInfo.building_name) + '</div>';
    html += '<div class="client-name">' + escapeHtml(data.client_name || '') + '<span class="client-suffix">' + honorific + '</span></div>';
    html += '</div></div>';
    html += '<div class="title-right"><span class="title-text">請　求　書</span></div>';
    html += '</div>';
    
    // メイン行: 左右2カラム
    // 左50%: 下記の通り + 金額 + 振込先
    // 右40%: 請求日等 + 自社情報（右寄せ、間を空ける）
    html += '<div class="main-section">';
    
    // 左カラム（50%）- 触らない
    html += '<div class="left-col">';
    html += '<div class="billing-intro">下記の通り、ご請求申し上げます。</div>';
    html += '<div class="billing-box"><span class="billing-label">ご請求金額<span class="billing-label-sub">（税込）</span></span><span class="billing-value">&yen;' + formatNumber(data.total_amount) + '</span></div>';
    html += bankHtml;
    html += '</div>';
    
    // 右カラム（40%）- 請求日等 + 自社情報
    html += '<div class="right-col">';
    html += '<div class="doc-info">';
    html += '<div class="doc-info-row"><span class="doc-info-label">請求日:</span><span class="doc-info-value">' + formatDate(data.invoice_date) + '</span></div>';
    if (data.payment_due_date) html += '<div class="doc-info-row"><span class="doc-info-label">お支払期限:</span><span class="doc-info-value">' + formatDate(data.payment_due_date) + '</span></div>';
    html += '<div class="doc-info-row"><span class="doc-info-label">請求書No:</span><span class="doc-info-value">' + escapeHtml(data.invoice_no || '') + '</span></div>';
    html += '</div>';
    html += '<div class="company-block">';
    html += logoHtml;
    html += '<div class="company-name-wrap"><div class="company-name">' + escapeHtml(companyInfo.company_name || '') + '</div>' + stampHtml + '</div>';
    html += '<div class="company-info">';
    if (companyInfo.postal_code) html += '〒' + escapeHtml(companyInfo.postal_code) + '<br>';
    if (companyAddress) html += escapeHtml(companyAddress) + '<br>';
    if (companyInfo.building_name) html += escapeHtml(companyInfo.building_name) + '<br>';
    var telFax = [];
    if (companyInfo.tel) telFax.push('TEL: ' + escapeHtml(companyInfo.tel));
    if (companyInfo.fax) telFax.push('FAX: ' + escapeHtml(companyInfo.fax));
    if (telFax.length > 0) {
      var telFaxText = telFax.join(' ');
      var telFaxFont = telFaxText.length > 28 ? ' style="font-size:7pt;"' : '';
      html += '<span' + telFaxFont + '>' + telFaxText + '</span><br>';
    }
    if (companyInfo.email) html += 'Mail: ' + escapeHtml(companyInfo.email) + '<br>';
    if (companyInfo.website) html += 'HP: ' + escapeHtml(companyInfo.website) + '<br>';
    if (companyInfo.invoice_registration_no) html += '登録番号: ' + escapeHtml(companyInfo.invoice_registration_no);
    html += '</div></div></div>';
    
    html += '</div>'; // main-section end
    
    // 明細テーブル
    html += itemsResult.html;
    
    // 合計行
    html += '<div class="items-footer">' + taxNote + summaryHtml + '</div>';
    
    // 備考
    html += '<div class="notes-box"><div class="notes-title">備考</div><div class="notes-content">' + (data.notes ? escapeHtml(data.notes) : '&nbsp;<br>&nbsp;<br>&nbsp;') + '</div></div>';
    
    html += '<div class="page-num">1 / 1</div>';
    html += '</div></body></html>';
    
    return html;
  }
  
  /**
   * 見積書HTML生成
   * レイアウト: 請求書と同様だが、振込先・消費税表示なし、背景色は緑
   */
  function generateEstimateHTML(data) {
    var companyInfo = data.companyInfo || {};
    var clientInfo = data.clientInfo || {};
    var showTax = Number(companyInfo.show_tax_on_estimate_delivery ?? 1) === 1;
    var taxBreakdown = calculateTaxBreakdown(data.items || []);
    var totalTax = taxBreakdown.totalTax || 0;
    
    var logoHtml = '';
    if (companyInfo.logo_url && companyInfo.logo_url.startsWith('data:image')) {
      logoHtml = '<img src="' + companyInfo.logo_url + '" class="company-logo" alt="">';
    }
    
    var stampHtml = '';
    if (companyInfo.stamp_url && companyInfo.stamp_url.startsWith('data:image')) {
      stampHtml = '<img src="' + companyInfo.stamp_url + '" class="company-stamp" alt="">';
    }
    
    var companyAddress = [companyInfo.address || '', companyInfo.address_number || ''].filter(Boolean).join('');
    var clientAddress = [clientInfo.address || '', clientInfo.address_number || ''].filter(Boolean).join('');
    var honorific = clientInfo.is_individual ? '様' : '御中';
    
    var html = '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>御見積書</title><style>' + getPrintStyles() + '</style></head><body>';
    html += '<div class="print-buttons"><button class="print-btn print-btn-primary" onclick="window.print()">印刷 / PDF保存</button><button class="print-btn print-btn-secondary" onclick="window.close()">閉じる</button></div>';
    html += '<div class="print-container">';
    
    // タイトル行: 左に見積先（住所含む）、右にタイトル（緑背景）
    html += '<div class="title-row">';
    html += '<div class="title-left"><div class="client-in-title">';
    if (clientInfo.postal_code) html += '<div class="client-postal">〒' + escapeHtml(clientInfo.postal_code) + '</div>';
    if (clientAddress) html += '<div class="client-address">' + escapeHtml(clientAddress) + '</div>';
    if (clientInfo.building_name) html += '<div class="client-address">' + escapeHtml(clientInfo.building_name) + '</div>';
    html += '<div class="client-name">' + escapeHtml(data.client_name || '') + '<span class="client-suffix">' + honorific + '</span></div>';
    html += '</div></div>';
    html += '<div class="title-right estimate"><span class="title-text">御 見 積 書</span></div>';
    html += '</div>';
    
    // メイン行
    html += '<div class="main-section">';
    
    // 左カラム
    html += '<div class="left-col">';
    // 5行分空ける（約15mm）
    html += '<div style="height:15mm;"></div>';
    // 件名を目立つように表示（太字・大きめ）
    if (data.subject) html += '<div style="font-size:11pt;font-weight:bold;border-bottom:1px solid #333;padding-bottom:2mm;">件名: ' + escapeHtml(data.subject) + '</div>';
    // 件名の下1行空けて「下記の通り」
    html += '<div class="billing-intro" style="margin-top:4mm;">下記の通り、お見積り申し上げます。</div>';
    // 表示設定に合わせた金額
    var billingAmount = showTax ? taxBreakdown.total : taxBreakdown.subtotal;
    html += '<div class="billing-box"><span class="billing-label estimate">御見積金額</span><span class="billing-value">&yen;' + formatNumber(billingAmount) + '</span></div>';
    
    // 受渡場所・取引条件・納期（データがあれば表示）
    var hasTerms = data.delivery_place || data.payment_terms || data.delivery_date_text;
    if (hasTerms) {
      html += '<div class="terms-box" style="margin-top:3mm;font-size:9pt;">';
      if (data.delivery_place) html += '<div style="margin-bottom:1mm;">受渡場所: ' + escapeHtml(data.delivery_place) + '</div>';
      if (data.payment_terms) html += '<div style="margin-bottom:1mm;">取引条件: ' + escapeHtml(data.payment_terms) + '</div>';
      if (data.delivery_date_text) html += '<div>納　　期: ' + escapeHtml(data.delivery_date_text) + '</div>';
      html += '</div>';
    }
    html += '</div>';
    
    // 右カラム
    html += '<div class="right-col">';
    html += '<div class="doc-info">';
    html += '<div class="doc-info-row"><span class="doc-info-label">見積日:</span><span class="doc-info-value">' + formatDate(data.estimate_date) + '</span></div>';
    if (data.valid_until) html += '<div class="doc-info-row"><span class="doc-info-label">有効期限:</span><span class="doc-info-value">' + formatDate(data.valid_until) + '</span></div>';
    html += '<div class="doc-info-row"><span class="doc-info-label">見積書No:</span><span class="doc-info-value">' + escapeHtml(data.estimate_no || '') + '</span></div>';
    html += '</div>';
    html += '<div class="company-block">';
    html += logoHtml;
    html += '<div class="company-name-wrap"><div class="company-name">' + escapeHtml(companyInfo.company_name || '') + '</div>' + stampHtml + '</div>';
    html += '<div class="company-info">';
    if (companyInfo.postal_code) html += '〒' + escapeHtml(companyInfo.postal_code) + '<br>';
    if (companyAddress) html += escapeHtml(companyAddress) + '<br>';
    if (companyInfo.building_name) html += escapeHtml(companyInfo.building_name) + '<br>';
    var telFax = [];
    if (companyInfo.tel) telFax.push('TEL: ' + escapeHtml(companyInfo.tel));
    if (companyInfo.fax) telFax.push('FAX: ' + escapeHtml(companyInfo.fax));
    if (telFax.length > 0) {
      var telFaxText = telFax.join(' ');
      var telFaxFont = telFaxText.length > 28 ? ' style="font-size:7pt;"' : '';
      html += '<span' + telFaxFont + '>' + telFaxText + '</span><br>';
    }
    if (companyInfo.email) html += 'Mail: ' + escapeHtml(companyInfo.email) + '<br>';
    if (companyInfo.website) html += 'HP: ' + escapeHtml(companyInfo.website) + '<br>';
    if (companyInfo.invoice_registration_no) html += '登録番号: ' + escapeHtml(companyInfo.invoice_registration_no);
    html += '</div></div></div>';
    
    html += '</div>'; // main-section end
    
    // 明細テーブル（税列なし、上代・下代対応、備考列あり）
    html += generateSimpleItemsTableHTML(data.items || [], 10, data.show_retail);
    
    // 合計行（税表示設定に合わせて表示）
    if (showTax) {
      html += '<div class="items-footer"><div class="tax-note"></div><table class="summary-table">' +
        '<tr><td class="label">小計（税抜）</td><td class="value">&yen;' + formatNumber(taxBreakdown.subtotal) + '</td></tr>' +
        '<tr><td class="label">消費税</td><td class="value">&yen;' + formatNumber(totalTax) + '</td></tr>' +
        '<tr><td class="label total-label" style="background:#16a34a;">合計（税込）</td><td class="value total-value">&yen;' + formatNumber(taxBreakdown.total) + '</td></tr>' +
        '</table></div>';
    } else {
      html += '<div class="items-footer"><div class="tax-note"></div><table class="summary-table">' +
        '<tr><td class="label total-label" style="background:#16a34a;">合計（税抜）</td><td class="value total-value">&yen;' + formatNumber(taxBreakdown.subtotal) + '</td></tr>' +
        '</table></div>';
    }
    
    // 備考
    html += '<div class="notes-box"><div class="notes-title">備考</div><div class="notes-content">' + (data.notes ? escapeHtml(data.notes) : '&nbsp;<br>&nbsp;<br>&nbsp;') + '</div></div>';
    
    html += '<div class="page-num">1 / 1</div>';
    html += '</div></body></html>';
    
    return html;
  }
  
  // 納品書2分割用：1つの半ページを生成（見積書・請求書と同じレイアウト）
  function generateDeliveryHalfSection(data, pageItems, isCopy, pageNum, totalPages, isLastPage) {
    var companyInfo = data.companyInfo || {};
    var clientInfo = data.clientInfo || {};
    var showTax = Number(companyInfo.show_tax_on_estimate_delivery ?? 1) === 1;
    var taxBreakdown = calculateTaxBreakdown(data.items || []);
    var totalTax = taxBreakdown.totalTax || 0;
    var clientAddress = [clientInfo.address || '', clientInfo.address_number || ''].filter(Boolean).join('');
    var companyAddress = [companyInfo.address || '', companyInfo.address_number || ''].filter(Boolean).join('');
    var honorific = clientInfo.is_individual ? '様' : '御中';
    var ROWS_PER_HALF = 7;  // 2分割時の固定行数（TEL/FAXを1行にまとめて2行増）
    
    // 印鑑HTML
    var stampHtml = '';
    if (companyInfo.stamp_url && companyInfo.stamp_url.startsWith('data:image')) {
      stampHtml = '<img src="' + companyInfo.stamp_url + '" style="position:absolute;left:calc(100% - 1em);top:-1mm;width:10mm;height:10mm;opacity:0.85;" alt="">';
    }
    
    var html = '<div class="half-page">';
    
    // タイトル行：左に納品先（住所含む）、右にタイトル（他ドキュメントと同じ）
    html += '<div class="title-row" style="margin-bottom:3mm;min-height:12mm;">';
    html += '<div class="title-left" style="width:55%;font-size:8pt;">';
    if (clientInfo.postal_code) html += '<div>〒' + escapeHtml(clientInfo.postal_code) + '</div>';
    if (clientAddress) html += '<div>' + escapeHtml(clientAddress) + '</div>';
    if (clientInfo.building_name) html += '<div>' + escapeHtml(clientInfo.building_name) + '</div>';
    html += '<div style="font-size:11pt;font-weight:bold;margin-top:2mm;">' + escapeHtml(data.client_name || '') + '<span style="font-size:10pt;margin-left:3px;">' + honorific + '</span></div>';
    html += '</div>';
    html += '<div class="title-right delivery" style="width:45%;"><span class="title-text">納 品 書' + (isCopy ? '（控）' : '') + '</span></div>';
    html += '</div>';
    
    // メインセクション
    html += '<div class="main-section" style="margin-bottom:2mm;">';
    
    // 左カラム（件名 + 下記の通り）- 4行分下げる
    html += '<div class="left-col" style="width:48%;">';
    html += '<div style="height:12mm;"></div>';
    if (data.subject) html += '<div style="font-size:9pt;font-weight:bold;border-bottom:1px solid #333;padding-bottom:1mm;">件名: ' + escapeHtml(data.subject) + '</div>';
    html += '<div style="font-size:8pt;margin-top:1mm;">下記の通り納品いたします。</div>';
    html += '</div>';
    
    // 右カラム（見積書・請求書と同じ配置）
    html += '<div class="right-col" style="width:45%;">';
    html += '<div class="doc-info" style="font-size:8pt;margin-bottom:1mm;">';
    html += '<div>納品日: ' + formatDate(data.delivery_date) + ' 納品No: ' + escapeHtml(data.delivery_no || '') + '</div>';
    html += '</div>';
    html += '<div style="position:relative;display:inline-block;font-size:9pt;font-weight:bold;">' + escapeHtml(companyInfo.company_name || '') + stampHtml + '</div>';
    html += '<div style="font-size:7pt;line-height:1.4;">';
    if (companyInfo.postal_code) html += '〒' + escapeHtml(companyInfo.postal_code) + '<br>';
    if (companyAddress) html += escapeHtml(companyAddress) + '<br>';
    // TELとFAXを1行にまとめる
    var telFax = [];
    if (companyInfo.tel) telFax.push('TEL: ' + escapeHtml(companyInfo.tel));
    if (companyInfo.fax) telFax.push('FAX: ' + escapeHtml(companyInfo.fax));
    if (telFax.length > 0) {
      var telFaxText = telFax.join(' ');
      var telFaxFont = telFaxText.length > 26 ? ' style="font-size:6.5pt;"' : '';
      html += '<span' + telFaxFont + '>' + telFaxText + '</span><br>';
    }
    if (companyInfo.invoice_registration_no) html += '登録番号: ' + escapeHtml(companyInfo.invoice_registration_no);
    html += '</div>';
    html += '</div></div>';
    
    // 明細テーブル（税列なし、固定7行、備考列あり）
    html += '<table class="items-table" style="font-size:7.5pt;"><thead><tr>';
    html += '<th style="width:5%">No</th><th style="width:40%">品名</th><th style="width:9%">数量</th><th style="width:12%">単価</th><th style="width:14%">金額</th><th style="width:20%">備考</th>';
    html += '</tr></thead><tbody>';
    
    for (var i = 0; i < pageItems.length; i++) {
      var item = pageItems[i];
      var amount = item.amount || (item.quantity * item.unit_price);
      var notesCell = escapeHtml(item.notes || '');
      html += '<tr><td style="text-align:center">' + item.rowNum + '</td><td>' + escapeHtml(item.product_name || '') + '</td><td style="text-align:center">' + formatNumber(item.quantity) + '</td><td style="text-align:right">&yen;' + formatNumber(item.unit_price) + '</td><td style="text-align:right">&yen;' + formatNumber(amount) + '</td><td style="font-size:7pt;">' + notesCell + '</td></tr>';
    }
    
    // 固定行数まで空行を埋める
    for (var j = pageItems.length; j < ROWS_PER_HALF; j++) {
      html += '<tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>';
    }
    html += '</tbody></table>';
    
    // 合計（最終ページのみ表示、税なし）
    if (isLastPage) {
      html += '<div style="display:flex;justify-content:flex-end;margin-top:1mm;">';
      html += '<table class="summary-table" style="font-size:8pt;">';
      if (showTax) {
        html += '<tr><td class="label">小計（税抜）</td><td class="value">&yen;' + formatNumber(taxBreakdown.subtotal) + '</td></tr>';
        html += '<tr><td class="label">消費税</td><td class="value">&yen;' + formatNumber(totalTax) + '</td></tr>';
        html += '<tr><td class="label total-label" style="background:#9333ea;">合計（税込）</td><td class="value total-value">&yen;' + formatNumber(taxBreakdown.total) + '</td></tr>';
      } else {
        html += '<tr><td class="label total-label" style="background:#9333ea;">合計（税抜）</td><td class="value total-value">&yen;' + formatNumber(taxBreakdown.subtotal) + '</td></tr>';
      }
      html += '</table></div>';
    }
    
    // 備考欄（最終ページのみ、6行制限）
    if (isLastPage) {
      html += '<div style="margin-top:2mm;padding:1.5mm 2mm;border:1px solid #ccc;background:#fafafa;height:21mm;overflow:hidden;">';
      html += '<div style="font-weight:bold;font-size:7.5pt;margin-bottom:1mm;">備考</div>';
      html += '<div style="font-size:7.5pt;white-space:pre-wrap;line-height:1.4;max-height:17mm;overflow:hidden;">' + (data.notes ? escapeHtml(data.notes) : '') + '</div>';
      html += '</div>';
    }
    
    // ページ番号（複数ページの場合）
    if (totalPages > 1) {
      html += '<div style="text-align:right;font-size:7pt;color:#666;margin-top:1mm;">' + pageNum + ' / ' + totalPages + '</div>';
    }
    
    html += '</div>';
    return html;
  }

  function generateDeliveryHTML(data) {
    var companyInfo = data.companyInfo || {};
    var clientInfo = data.clientInfo || {};
    var format = data.delivery_note_format || 'half';
    var showTax = Number(companyInfo.show_tax_on_estimate_delivery ?? 1) === 1;
    var taxBreakdown = calculateTaxBreakdown(data.items || []);
    var totalTax = taxBreakdown.totalTax || 0;
    
    var logoHtml = '';
    if (companyInfo.logo_url && companyInfo.logo_url.startsWith('data:image')) {
      logoHtml = '<img src="' + companyInfo.logo_url + '" class="company-logo" style="max-height:20mm;max-width:50mm;" alt="">';
    }
    
    var stampHtml = '';
    if (companyInfo.stamp_url && companyInfo.stamp_url.startsWith('data:image')) {
      stampHtml = '<img src="' + companyInfo.stamp_url + '" class="company-stamp" alt="">';
    }
    
    var companyAddress = [companyInfo.address || '', companyInfo.address_number || ''].filter(Boolean).join('');
    var clientAddress = [clientInfo.address || '', clientInfo.address_number || ''].filter(Boolean).join('');
    var honorific = clientInfo.is_individual ? '様' : '御中';
    
    var html = '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>納品書</title><style>' + getPrintStyles() + '</style></head><body>';
    html += '<div class="print-buttons"><button class="print-btn print-btn-primary" onclick="window.print()">印刷 / PDF保存</button><button class="print-btn print-btn-secondary" onclick="window.close()">閉じる</button></div>';
    
    // 2分割形式
    if (format === 'half') {
      var items = data.items || [];
      var ROWS_PER_HALF = 7;  // 2分割時の固定行数（TEL/FAXを1行にまとめて2行増）
      
      // アイテムがない場合も1ページ生成（空の明細）
      var totalPages = items.length > 0 ? Math.ceil(items.length / ROWS_PER_HALF) : 1;
      
      // アイテムに通し番号を付与
      var numberedItems = items.map(function(item, idx) {
        return Object.assign({}, item, { rowNum: idx + 1 });
      });
      
      for (var pageNum = 1; pageNum <= totalPages; pageNum++) {
        var startIdx = (pageNum - 1) * ROWS_PER_HALF;
        var pageItems = numberedItems.slice(startIdx, startIdx + ROWS_PER_HALF);
        var isLastPage = pageNum === totalPages;
        
        html += '<div class="print-container">';
        html += generateDeliveryHalfSection(data, pageItems, false, pageNum, totalPages, isLastPage);  // 上：納品書
        html += generateDeliveryHalfSection(data, pageItems, true, pageNum, totalPages, isLastPage);   // 下：納品書（控）
        html += '</div>';
        
        // 最終ページ以外は改ページ
        if (!isLastPage) {
          html += '<div style="page-break-after: always;"></div>';
        }
      }
      
      html += '</body></html>';
      return html;
    }
    
    // 1枚もの形式（見積書・請求書と同じレイアウト）
    html += '<div class="print-container">';
    
    // タイトル行: 左に納品先（住所含む）、右にタイトル
    html += '<div class="title-row">';
    html += '<div class="title-left"><div class="client-in-title">';
    if (clientInfo.postal_code) html += '<div class="client-postal">〒' + escapeHtml(clientInfo.postal_code) + '</div>';
    if (clientAddress) html += '<div class="client-address">' + escapeHtml(clientAddress) + '</div>';
    if (clientInfo.building_name) html += '<div class="client-address">' + escapeHtml(clientInfo.building_name) + '</div>';
    html += '<div class="client-name">' + escapeHtml(data.client_name || '') + '<span class="client-suffix">' + honorific + '</span></div>';
    html += '</div></div>';
    html += '<div class="title-right delivery"><span class="title-text">納　品　書</span></div>';
    html += '</div>';
    
    // メインセクション（見積書・請求書と同じレイアウト）
    html += '<div class="main-section">';
    
    // 左カラム（件名のみ、「下記の通り」は明細の上に移動）
    html += '<div class="left-col">';
    html += '<div style="height:15mm;"></div>';
    if (data.subject) html += '<div style="font-size:11pt;font-weight:bold;border-bottom:1px solid #333;padding-bottom:2mm;">件名: ' + escapeHtml(data.subject) + '</div>';
    html += '</div>';
    
    // 右カラム（見積書・請求書と同じ配置）
    html += '<div class="right-col">';
    html += '<div class="doc-info">';
    html += '<div class="doc-info-row"><span class="doc-info-label">納品日:</span><span class="doc-info-value">' + formatDate(data.delivery_date) + '</span></div>';
    html += '<div class="doc-info-row"><span class="doc-info-label">納品書No:</span><span class="doc-info-value">' + escapeHtml(data.delivery_no || '') + '</span></div>';
    html += '</div>';
    html += '<div class="company-block">';
    html += logoHtml;
    html += '<div class="company-name-wrap"><div class="company-name">' + escapeHtml(companyInfo.company_name || '') + '</div>' + stampHtml + '</div>';
    html += '<div class="company-info">';
    if (companyInfo.postal_code) html += '〒' + escapeHtml(companyInfo.postal_code) + '<br>';
    if (companyAddress) html += escapeHtml(companyAddress) + '<br>';
    if (companyInfo.building_name) html += escapeHtml(companyInfo.building_name) + '<br>';
    var telFax = [];
    if (companyInfo.tel) telFax.push('TEL: ' + escapeHtml(companyInfo.tel));
    if (companyInfo.fax) telFax.push('FAX: ' + escapeHtml(companyInfo.fax));
    if (telFax.length > 0) {
      var telFaxText = telFax.join(' ');
      var telFaxFont = telFaxText.length > 28 ? ' style="font-size:7pt;"' : '';
      html += '<span' + telFaxFont + '>' + telFaxText + '</span><br>';
    }
    if (companyInfo.email) html += 'Mail: ' + escapeHtml(companyInfo.email) + '<br>';
    if (companyInfo.invoice_registration_no) html += '登録番号: ' + escapeHtml(companyInfo.invoice_registration_no);
    html += '</div></div></div>';
    
    html += '</div>'; // main-section end
    
    // 「下記の通り納品いたします」を明細の1行上に表示
    html += '<div class="billing-intro" style="margin-top:4mm;margin-bottom:2mm;">下記の通り納品いたします。</div>';
    
    // 明細テーブル（税列なし、備考列あり）
    html += generateSimpleItemsTableHTML(data.items || [], 10, false);
    
    // 合計行（税表示設定に合わせて表示）
    if (showTax) {
      html += '<div class="items-footer"><div class="tax-note"></div><table class="summary-table">' +
        '<tr><td class="label">小計（税抜）</td><td class="value">&yen;' + formatNumber(taxBreakdown.subtotal) + '</td></tr>' +
        '<tr><td class="label">消費税</td><td class="value">&yen;' + formatNumber(totalTax) + '</td></tr>' +
        '<tr><td class="label total-label" style="background:#9333ea;">合計（税込）</td><td class="value total-value">&yen;' + formatNumber(taxBreakdown.total) + '</td></tr>' +
        '</table></div>';
    } else {
      html += '<div class="items-footer"><div class="tax-note"></div><table class="summary-table">' +
        '<tr><td class="label total-label" style="background:#9333ea;">合計（税抜）</td><td class="value total-value">&yen;' + formatNumber(taxBreakdown.subtotal) + '</td></tr>' +
        '</table></div>';
    }
    
    // 備考
    if (data.notes) html += '<div class="notes-box"><div class="notes-title">備考</div><div class="notes-content">' + escapeHtml(data.notes) + '</div></div>';
    
    html += '<div class="page-num">1 / 1</div></div></body></html>';
    return html;
  }
  
  function openPreview(html, title) {
    var previewWindow = window.open('', '_blank', 'width=900,height=700,scrollbars=yes');
    if (!previewWindow) {
      alert('ポップアップがブロックされました。');
      return null;
    }
    previewWindow.document.write(html);
    previewWindow.document.close();
    previewWindow.document.title = title;
    return previewWindow;
  }
  
  function generatePdfFileName(type, date, clientName, isIndividual) {
    var honorific = isIndividual ? '様' : '御中';
    var safeName = (clientName || '取引先').replace(/[\\/:*?"<>|]/g, '_');
    if (type === 'invoice') return formatDateYYYYMM(date) + '請求書_' + safeName + honorific;
    if (type === 'estimate') return formatDateYYYYMMDD(date) + '見積書_' + safeName + honorific;
    if (type === 'delivery') return formatDateYYYYMMDD(date) + '納品書_' + safeName + honorific;
    return 'document_' + safeName;
  }

  function previewEstimatePDF(data) {
    var clientInfo = data.clientInfo || {};
    var fileName = generatePdfFileName('estimate', data.estimate_date, data.client_name, clientInfo.is_individual);
    return openPreview(generateEstimateHTML(data), fileName);
  }
  
  function previewInvoicePDF(data) {
    var clientInfo = data.clientInfo || {};
    var fileName = generatePdfFileName('invoice', data.invoice_date, data.client_name, clientInfo.is_individual);
    return openPreview(generateInvoiceHTML(data), fileName);
  }
  
  function previewDeliveryPDF(data) {
    var clientInfo = data.clientInfo || {};
    var fileName = generatePdfFileName('delivery', data.delivery_date, data.client_name, clientInfo.is_individual);
    return openPreview(generateDeliveryHTML(data), fileName);
  }
  
  window.SmartBillPDF = {
    previewEstimatePDF: previewEstimatePDF,
    previewInvoicePDF: previewInvoicePDF,
    previewDeliveryPDF: previewDeliveryPDF,
    generateEstimateHTML: generateEstimateHTML,
    generateInvoiceHTML: generateInvoiceHTML,
    generateDeliveryHTML: generateDeliveryHTML,
    generatePdfFileName: generatePdfFileName,
    formatDateYYYYMM: formatDateYYYYMM,
    formatDateYYYYMMDD: formatDateYYYYMMDD
  };
  
})();
