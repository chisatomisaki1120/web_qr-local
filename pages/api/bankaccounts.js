const SEPAY_API_TOKEN = process.env.SEPAY_API_KEY

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
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
            return res.status(200).json({
                success: true,
                bankaccounts: data.bankaccounts || [],
            })
        }

        return res.status(400).json({
            success: false,
            error: data.error || 'Không thể lấy danh sách tài khoản',
        })
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: 'Lỗi kết nối đến SePay API',
        })
    }
}
