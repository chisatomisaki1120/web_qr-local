const SEPAY_API_TOKEN = process.env.SEPAY_API_KEY

// Cache configuration
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes in milliseconds
let cachedData = null
let cacheTimestamp = 0

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    // Check if cache is still valid
    const now = Date.now()
    if (cachedData && (now - cacheTimestamp) < CACHE_TTL) {
        console.log('[BankAccounts] Returning cached data')
        return res.status(200).json({
            success: true,
            bankaccounts: cachedData,
            cached: true,
        })
    }

    try {
        console.log('[BankAccounts] Fetching from SePay API')
        const response = await fetch('https://my.sepay.vn/userapi/bankaccounts/list', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SEPAY_API_TOKEN}`,
            },
        })

        if (!response.ok) {
            return res.status(response.status).json({
                success: false,
                error: `SePay API trả về lỗi ${response.status}`,
            })
        }

        const data = await response.json()

        if (data.status === 200 && data.messages?.success) {
            // Update cache
            cachedData = data.bankaccounts || []
            cacheTimestamp = now
            
            return res.status(200).json({
                success: true,
                bankaccounts: cachedData,
                cached: false,
            })
        }

        return res.status(400).json({
            success: false,
            error: data.error || 'Không thể lấy danh sách tài khoản',
        })
    } catch (error) {
        // If fetch fails but we have cached data, return it
        if (cachedData) {
            console.log('[BankAccounts] API error, returning stale cache')
            return res.status(200).json({
                success: true,
                bankaccounts: cachedData,
                cached: true,
                stale: true,
            })
        }
        
        return res.status(500).json({
            success: false,
            error: 'Lỗi kết nối đến SePay API',
        })
    }
}
