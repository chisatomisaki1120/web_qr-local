const SEPAY_API_KEY = process.env.SEPAY_API_KEY

// Shared transaction store (persisted to JSON file)
const transactionStore = require('../../lib/transactions')
const { logWebhook } = require('../../lib/webhook-logger')

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

    // POST: receive webhook from SePay
    if (req.method === 'POST') {
        // Verify API Key authentication
        const authHeader = req.headers['authorization'] || ''
        const expectedAuth = `Apikey ${SEPAY_API_KEY}`

        if (authHeader !== expectedAuth) {
            console.log('[Webhook] Unauthorized request - invalid API key')
            return res.status(401).json({ success: false, error: 'Unauthorized' })
        }

        const transaction = req.body

        // Log raw webhook payload for history tracking
        logWebhook('sepay', transaction)

        // Validate required fields
        if (!transaction || !transaction.id) {
            return res.status(400).json({ success: false, error: 'Invalid transaction data' })
        }

        // Check duplicate
        if (transactionStore.exists(transaction.id)) {
            console.log(`[Webhook] Duplicate transaction ID: ${transaction.id}`)
            return res.status(200).json({ success: true, message: 'Transaction already processed' })
        }

        // Store transaction (auto-saves to file)
        const record = {
            id: transaction.id,
            gateway: transaction.gateway || '',
            transactionDate: transaction.transactionDate || '',
            accountNumber: transaction.accountNumber || '',
            code: transaction.code || null,
            content: transaction.content || '',
            transferType: transaction.transferType || '',
            transferAmount: transaction.transferAmount || 0,
            accumulated: transaction.accumulated || 0,
            subAccount: transaction.subAccount || null,
            referenceCode: transaction.referenceCode || '',
            description: transaction.description || '',
            receivedAt: new Date().toISOString(),
            source: 'sepay',
        }

        transactionStore.add(record)

        const typeLabel = record.transferType === 'in' ? 'Nhận tiền' : 'Chuyển tiền'
        console.log(`[Webhook] ${typeLabel}: ${record.transferAmount.toLocaleString()} VND | ${record.gateway} | ${record.content}`)

        return res.status(200).json({ success: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
