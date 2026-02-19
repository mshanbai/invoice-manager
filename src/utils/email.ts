/**
 * メール送信ユーティリティ
 * 環境変数未設定時は sent=false, error=EMAIL_NOT_CONFIGURED を返す
 */

export interface SendEmailResult {
  sent: boolean
  error?: string
}

export interface SendInvoiceNotificationParams {
  to: string
  companyName: string
  clientName: string
  invoiceNo: string
  portalPath?: string
}

/**
 * 請求書送付通知メールを送信
 */
export async function sendInvoiceNotification(
  params: SendInvoiceNotificationParams
): Promise<SendEmailResult> {
  const apiKey = process.env.EMAIL_API_KEY || process.env.RESEND_API_KEY
  if (!apiKey) {
    return { sent: false, error: 'EMAIL_NOT_CONFIGURED' }
  }

  const recipient = params.to?.trim()
  if (!recipient) {
    return { sent: false, error: 'NO_RECIPIENT' }
  }

  const baseUrl = (process.env.PORTAL_BASE_URL || 'http://localhost:5173').replace(/\/+$/, '')
  const portalPath = params.portalPath && params.portalPath.trim()
    ? params.portalPath.trim()
    : '/portal/invoice'
  const normalizedPortalPath = portalPath.startsWith('/') ? portalPath : `/${portalPath}`
  const receivePageUrl = `${baseUrl}${normalizedPortalPath}`
  const passwordResetUrl = `${baseUrl}/portal/reset-password`

  const subject = `【${params.companyName}】請求書が届きました`
  const body = `
${params.clientName} 様

${params.companyName}より請求書が届きました。

請求書番号: ${params.invoiceNo}

受取ページ: ${receivePageUrl}

パスワード再設定: ${passwordResetUrl}

---
このメールは自動送信されています。
`.trim()

  try {
    // Resend API を使用（他サービス利用時は差し替え）
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'noreply@example.com',
        to: [recipient],
        subject,
        text: body,
      }),
    })

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      const errMsg = errData?.message || res.statusText
      return { sent: false, error: errMsg }
    }
    return { sent: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { sent: false, error: msg }
  }
}
