const transactionStore = require('../../lib/transactions')

export default function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const { code, accountNumber, amount } = req.query

    if (!code) {
        return res.status(400).json({ success: false, error: 'Missing code parameter' })
    }

    // Find matching transaction by content containing the SEVQR code
    // Only match transactions received within the last 30 minutes
    const THIRTY_MINUTES = 30 * 60 * 1000
    const now = Date.now()

    const match = transactionStore.find(t => {
        const contentMatch = t.content && t.content.toUpperCase().includes(code.toUpperCase())
        const isIncoming = t.transferType === 'in'

        // Check if transaction is within 30 minutes
        const receivedTime = t.receivedAt ? new Date(t.receivedAt).getTime() : 0
        const isRecent = (now - receivedTime) <= THIRTY_MINUTES

        // Optional: also check account number and amount if provided
        const accountMatch = !accountNumber || t.accountNumber === accountNumber
        const amountMatch = !amount || t.transferAmount === Number(amount)

        return contentMatch && isIncoming && isRecent && accountMatch && amountMatch
    })

    if (match) {
        return res.status(200).json({
            success: true,
            confirmed: true,
            transaction: {
                id: match.id,
                gateway: match.gateway,
                transactionDate: match.transactionDate,
                accountNumber: match.accountNumber,
                content: match.content,
                transferAmount: match.transferAmount,
                accumulated: match.accumulated,
                referenceCode: match.referenceCode,
            },
        })
    }

    return res.status(200).json({
        success: true,
        confirmed: false,
    })
}
