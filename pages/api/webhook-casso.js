const CASSO_SECURE_TOKEN = process.env.CASSO_SECURE_TOKEN

// Shared transaction store (persisted to JSON file)
const transactionStore = require('../../lib/transactions')
const { logWebhook } = require('../../lib/webhook-logger')
const { forwardWebhook } = require('../../lib/webhook-forwarder')

export default function handler(req, res) {
    // GET: retrieve stored transactions
    if (req.method === 'GET') {
        const transactions = transactionStore.getAll()
        return res.status(200).json({
            success: true,
            total: transactions.length,
            transactions,
        })
    }

    // POST: receive webhook from Casso
    if (req.method === 'POST') {
        // Verify Secure-Token authentication (Casso sends "Secure-Token" header)
        if (CASSO_SECURE_TOKEN) {
            const secureToken = req.headers['secure-token'] || req.headers['Secure-Token'] || ''

            if (secureToken !== CASSO_SECURE_TOKEN) {
                console.log('[Casso Webhook] Unauthorized request - invalid secure token')
                console.log('[Casso Webhook] Received token:', secureToken)
                return res.status(401).json({ success: false, error: 'Unauthorized' })
            }
        }

        const body = req.body

        // Log raw webhook payload for history tracking
        logWebhook('casso', body)

        // Forward webhook to external endpoint
        forwardWebhook('casso', body)

        // Validate Casso payload structure
        if (!body || body.error !== 0 || !Array.isArray(body.data)) {
            console.log('[Casso Webhook] Invalid payload:', JSON.stringify(body))
            return res.status(400).json({ success: false, error: 'Invalid Casso payload' })
        }

        const results = []

        for (const transaction of body.data) {
            // Validate required fields
            if (!transaction || !transaction.id) {
                results.push({ id: null, status: 'skipped', reason: 'Missing transaction id' })
                continue
            }

            // Build a unique ID prefixed with "casso_" to avoid collisions with SePay IDs
            const cassoId = `casso_${transaction.id}`

            // Check duplicate
            if (transactionStore.exists(cassoId)) {
                console.log(`[Casso Webhook] Duplicate transaction ID: ${cassoId}`)
                results.push({ id: cassoId, status: 'duplicate' })
                continue
            }

            // Map Casso fields to the internal transaction record format
            // so that check-transaction.js can match by content (description) and transferType
            const record = {
                id: cassoId,
                gateway: transaction.bankName || transaction.bankAbbreviation || '',
                transactionDate: transaction.when || '',
                accountNumber: transaction.bank_sub_acc_id || transaction.subAccId || '',
                code: null,
                content: transaction.description || '',
                transferType: transaction.amount > 0 ? 'in' : 'out',
                transferAmount: Math.abs(transaction.amount) || 0,
                accumulated: transaction.cusum_balance || 0,
                subAccount: transaction.virtualAccount || null,
                referenceCode: transaction.tid || '',
                description: transaction.description || '',
                receivedAt: new Date().toISOString(),
                source: 'casso',
                // Preserve original Casso fields for reference
                cassoOriginal: {
                    id: transaction.id,
                    tid: transaction.tid,
                    corresponsiveName: transaction.corresponsiveName || '',
                    corresponsiveAccount: transaction.corresponsiveAccount || '',
                    corresponsiveBankId: transaction.corresponsiveBankId || '',
                    corresponsiveBankName: transaction.corresponsiveBankName || '',
                    virtualAccountName: transaction.virtualAccountName || '',
                },
            }

            transactionStore.add(record)

            const typeLabel = record.transferType === 'in' ? 'Nhận tiền' : 'Chuyển tiền'
            console.log(`[Casso Webhook] ${typeLabel}: ${record.transferAmount.toLocaleString()} VND | ${record.gateway} | ${record.content}`)

            results.push({ id: cassoId, status: 'processed' })
        }

        return res.status(200).json({ success: true, results })
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
