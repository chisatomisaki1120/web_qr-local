import Head from 'next/head'
import { useState, useEffect, useRef, useCallback } from 'react'

export default function Home() {
    const [bankAccounts, setBankAccounts] = useState([])
    const [selectedBank, setSelectedBank] = useState(null) // Only store bank name
    const [selectedAccount, setSelectedAccount] = useState(null) // Randomly selected account for QR
    const [bankSearch, setBankSearch] = useState('')
    const [showBankDropdown, setShowBankDropdown] = useState(false)
    const [amount, setAmount] = useState('')
    const [qrUrl, setQrUrl] = useState('')
    const [qrDescription, setQrDescription] = useState('')
    const [loading, setLoading] = useState(false)
    const [loadingAccounts, setLoadingAccounts] = useState(true)
    const [toast, setToast] = useState('')
    const [apiError, setApiError] = useState('')
    const [pendingConfirm, setPendingConfirm] = useState(false)
    const [confirmedTx, setConfirmedTx] = useState(null)
    const [txExpired, setTxExpired] = useState(false)
    const [countdown, setCountdown] = useState(0)

    const dropdownRef = useRef(null)
    const searchInputRef = useRef(null)
    const pollingRef = useRef(null)
    const timeoutRef = useRef(null)
    const countdownRef = useRef(null)

    // Fetch bank accounts from SePay API
    useEffect(() => {
        setLoadingAccounts(true)
        fetch('/api/bankaccounts')
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setBankAccounts(data.bankaccounts || [])
                    setApiError('')
                } else {
                    setApiError(data.error || 'Không thể lấy danh sách tài khoản')
                }
            })
            .catch(() => setApiError('Lỗi kết nối đến server'))
            .finally(() => setLoadingAccounts(false))
    }, [])

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setShowBankDropdown(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    // Get unique banks from accounts
    const uniqueBanks = bankAccounts.reduce((acc, bank) => {
        if (!acc.find(b => b.bank_short_name === bank.bank_short_name)) {
            acc.push({
                bank_short_name: bank.bank_short_name,
                bank_full_name: bank.bank_full_name,
                bank_code: bank.bank_code,
            })
        }
        return acc
    }, [])

    const filteredBanks = uniqueBanks.filter(bank => {
        const q = bankSearch.toLowerCase()
        return (
            bank.bank_short_name.toLowerCase().includes(q) ||
            bank.bank_full_name.toLowerCase().includes(q)
        )
    })

    // Get random account from selected bank
    const getRandomAccountForBank = (bankName) => {
        const accountsForBank = bankAccounts.filter(
            acc => acc.bank_short_name === bankName && acc.active === '1'
        )
        if (accountsForBank.length === 0) return null
        const randomIndex = Math.floor(Math.random() * accountsForBank.length)
        return accountsForBank[randomIndex]
    }

    const formatAmount = (value) => {
        const num = value.replace(/\D/g, '')
        return num
    }

    const displayAmount = (value) => {
        if (!value) return ''
        return Number(value).toLocaleString('vi-VN') + ' VND'
    }

    const handleAmountChange = (e) => {
        const raw = e.target.value.replace(/\D/g, '')
        setAmount(raw)
    }

    const generateRandomCode = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
        let result = ''
        for (let i = 0; i < 5; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length))
        }
        return 'SEVQR' + result
    }

    const generateQR = useCallback(() => {
        if (!selectedBank || !selectedAccount) return

        // Clear previous polling if exists
        if (pollingRef.current) {
            clearInterval(pollingRef.current)
            pollingRef.current = null
        }
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current)
            timeoutRef.current = null
        }
        if (countdownRef.current) {
            clearInterval(countdownRef.current)
            countdownRef.current = null
        }
        setLoading(true)
        const des = generateRandomCode()
        setQrDescription(des)
        const params = new URLSearchParams({
            acc: selectedAccount.account_number,
            bank: selectedAccount.bank_short_name,
        })
        if (amount) params.set('amount', amount)
        params.set('des', des)

        const url = `https://qr.sepay.vn/img?${params.toString()}`
        setQrUrl(url)

        // Simulate brief loading for UX
        setTimeout(() => {
            setLoading(false)
            // Start polling automatically after QR generation
            startPolling(des, selectedAccount)
        }, 500)
    }, [selectedBank, selectedAccount, amount])

    const handleSubmit = (e) => {
        e.preventDefault()
        generateQR()
    }

    const copyToClipboard = (text, label) => {
        navigator.clipboard.writeText(text).then(() => {
            setToast(`Đã sao chép ${label}`)
            setTimeout(() => setToast(''), 2000)
        })
    }

    const downloadQR = async () => {
        if (!qrUrl) return
        try {
            const res = await fetch(qrUrl)
            const blob = await res.blob()
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = `qr-${selectedAccount?.bank_short_name}-${selectedAccount?.account_number}.png`
            a.click()
            URL.revokeObjectURL(a.href)
        } catch {
            window.open(qrUrl, '_blank')
        }
    }

    const resetForm = () => {
        setSelectedBank(null)
        setSelectedAccount(null)
        setBankSearch('')
        setAmount('')
        setQrDescription('')
        setQrUrl('')
        setPendingConfirm(false)
        setConfirmedTx(null)
        setTxExpired(false)
        setCountdown(0)
        if (pollingRef.current) {
            clearInterval(pollingRef.current)
            pollingRef.current = null
        }
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current)
            timeoutRef.current = null
        }
        if (countdownRef.current) {
            clearInterval(countdownRef.current)
            countdownRef.current = null
        }
    }

    const canGenerate = !!selectedBank && !!selectedAccount

    const startPolling = useCallback((code, account) => {
        setPendingConfirm(true)
        setConfirmedTx(null)
        setTxExpired(false)

        // Set 30 minute countdown
        const TIMEOUT_MS = 30 * 60 * 1000
        setCountdown(30 * 60)

        countdownRef.current = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(countdownRef.current)
                    countdownRef.current = null
                    return 0
                }
                return prev - 1
            })
        }, 1000)

        // Set 30 minute timeout
        timeoutRef.current = setTimeout(() => {
            if (pollingRef.current) {
                clearInterval(pollingRef.current)
                pollingRef.current = null
            }
            if (countdownRef.current) {
                clearInterval(countdownRef.current)
                countdownRef.current = null
            }
            setPendingConfirm(false)
            setTxExpired(true)
            setCountdown(0)
        }, TIMEOUT_MS)

        // Start polling for transaction confirmation
        const params = new URLSearchParams({ code })
        if (account) params.set('accountNumber', account.account_number)
        if (amount) params.set('amount', amount)

        pollingRef.current = setInterval(async () => {
            try {
                const res = await fetch(`/api/check-transaction?${params.toString()}`)
                const data = await res.json()
                if (data.success && data.confirmed) {
                    clearInterval(pollingRef.current)
                    pollingRef.current = null
                    if (timeoutRef.current) {
                        clearTimeout(timeoutRef.current)
                        timeoutRef.current = null
                    }
                    if (countdownRef.current) {
                        clearInterval(countdownRef.current)
                        countdownRef.current = null
                    }
                    setConfirmedTx(data.transaction)
                    setPendingConfirm(false)
                    setCountdown(0)
                }
            } catch (err) {
                console.error('Poll error:', err)
            }
        }, 3000)
    }, [amount])

    const formatCountdown = (seconds) => {
        const m = Math.floor(seconds / 60)
        const s = seconds % 60
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    }

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (pollingRef.current) clearInterval(pollingRef.current)
            if (timeoutRef.current) clearTimeout(timeoutRef.current)
            if (countdownRef.current) clearInterval(countdownRef.current)
        }
    }, [])

    return (
        <>
            <Head>
                <title>Tạo QR Chuyển Khoản</title>
                <link rel="icon" href="/favicon.png" type="image/png" />
                <meta name="description" content="Tạo mã QR chuyển khoản ngân hàng nhanh chóng với SePay" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet" />
            </Head>

            <div className="container">
                {/* Header */}
                <div className="header">
                    <div className="header__logo">
                        <img src="/favicon.png" alt="Logo" width="56" height="56" />
                    </div>
                    <h1>Chuyển Khoản Nhanh 247</h1>
                    <p>Tạo mã QR chuyển khoản ngân hàng nhanh chóng</p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit}>
                    <div className="card">
                        <div className="card__title">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 7V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2" />
                                <polyline points="8 12 3 12 3 7" />
                                <path d="M3 12l4-4" />
                            </svg>
                            Thông tin chuyển khoản
                        </div>

                        {/* Bank Account Selection */}
                        <div className="form-group">
                            <label className="form-label">
                                Tài khoản ngân hàng <span className="required">*</span>
                            </label>
                            <div className="form-hint" style={{ color: '#e34444', fontWeight: 500, marginBottom: '0.5rem' }}>
                                ⚠ Lưu ý: Hội viên vui lòng chọn ngân hàng trùng với ngân hàng tạo lệnh nạp
                            </div>

                            {loadingAccounts ? (
                                <div className="account-loading">
                                    <span className="loading-spinner loading-spinner--dark" />
                                    <span>Đang tải danh sách tài khoản...</span>
                                </div>
                            ) : apiError ? (
                                <div className="api-error">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="12" cy="12" r="10" />
                                        <line x1="12" y1="8" x2="12" y2="12" />
                                        <line x1="12" y1="16" x2="12.01" y2="16" />
                                    </svg>
                                    <span>{apiError}</span>
                                </div>
                            ) : (
                                <div ref={dropdownRef} className={`bank-search-wrapper${selectedAccount ? ' bank-search-wrapper--with-account' : ''}`}>
                                    {selectedBank && !showBankDropdown ? (
                                        <div
                                            className="bank-selected"
                                            onClick={() => {
                                                setShowBankDropdown(true)
                                                setBankSearch('')
                                                setTimeout(() => searchInputRef.current?.focus(), 50)
                                            }}
                                        >
                                            <img
                                                className="bank-selected__logo"
                                                src={`https://api.vietqr.io/img/${selectedBank.bank_code}.png`}
                                                alt={selectedBank.bank_short_name}
                                                onError={(e) => { e.target.style.display = 'none' }}
                                            />
                                            <div className="bank-selected__info">
                                                <span className="bank-selected__name">{selectedBank.bank_short_name}</span>
                                                <span className="bank-selected__holder">{selectedBank.bank_full_name}</span>
                                            </div>
                                            <span className="bank-selected__change">Thay đổi</span>
                                        </div>
                                    ) : (
                                        <>
                                            <svg className="bank-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <circle cx="11" cy="11" r="8" />
                                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                            </svg>
                                            <input
                                                ref={searchInputRef}
                                                type="text"
                                                className="bank-search-input"
                                                placeholder="Tìm ngân hàng..."
                                                value={bankSearch}
                                                onChange={(e) => {
                                                    setBankSearch(e.target.value)
                                                    setShowBankDropdown(true)
                                                }}
                                                onFocus={() => setShowBankDropdown(true)}
                                            />
                                        </>
                                    )}

                                    {showBankDropdown && (
                                        <div className="bank-dropdown">
                                            {filteredBanks.length > 0 ? (
                                                filteredBanks.map(bank => (
                                                    <button
                                                        key={bank.bank_short_name}
                                                        type="button"
                                                        className="bank-option"
                                                        onClick={() => {
                                                            setSelectedBank(bank)
                                                            setBankSearch('')
                                                            setShowBankDropdown(false)
                                                            // Immediately select a random account from this bank
                                                            const account = getRandomAccountForBank(bank.bank_short_name)
                                                            setSelectedAccount(account)
                                                        }}
                                                    >
                                                        <img
                                                            className="bank-option__logo"
                                                            src={`https://api.vietqr.io/img/${bank.bank_code}.png`}
                                                            alt={bank.bank_short_name}
                                                            onError={(e) => { e.target.style.display = 'none' }}
                                                        />
                                                        <div className="bank-option__info">
                                                            <div className="bank-option__name">
                                                                {bank.bank_short_name}
                                                            </div>
                                                            <div className="bank-option__full">{bank.bank_full_name}</div>
                                                        </div>
                                                    </button>
                                                ))
                                            ) : (
                                                <div className="no-results">Không tìm thấy ngân hàng</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Selected Account Info */}
                            {selectedAccount && (
                                <>
                                    <div className="form-group">
                                        <label className="form-label">Số tài khoản</label>
                                        <div className="form-input form-input--readonly">{selectedAccount.account_number}</div>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Chủ tài khoản</label>
                                        <div className="form-input form-input--readonly">{selectedAccount.account_holder_name}</div>
                                    </div>
                                </>
                            )}

                            {selectedBank && !selectedAccount && (
                                <div className="api-error">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="12" cy="12" r="10" />
                                        <line x1="12" y1="8" x2="12" y2="12" />
                                        <line x1="12" y1="16" x2="12.01" y2="16" />
                                    </svg>
                                    <span>Không tìm thấy tài khoản hoạt động cho ngân hàng này</span>
                                </div>
                            )}
                        </div>

                        {/* Amount */}
                        <div className="form-group">
                            <label className="form-label">Số tiền</label>
                            <input
                                type="text"
                                className="form-input"
                                placeholder="Nhập số tiền (VND)"
                                value={amount ? Number(amount).toLocaleString('vi-VN') : ''}
                                onChange={handleAmountChange}
                                inputMode="numeric"
                            />
                            {amount && (
                                <div className="amount-display">{displayAmount(amount)}</div>
                            )}
                        </div>

                        {/* Submit */}
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={!canGenerate || loading}
                        >
                            {loading ? (
                                <span className="loading-spinner" />
                            ) : (
                                <>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="3" y="3" width="7" height="7" />
                                        <rect x="14" y="3" width="7" height="7" />
                                        <rect x="3" y="14" width="7" height="7" />
                                        <rect x="14" y="14" width="3" height="3" />
                                    </svg>
                                    Tạo mã QR
                                </>
                            )}
                        </button>
                    </div>
                </form>

                {/* Confirmed Success */}
                {confirmedTx && (
                    <div className="confirm-result">
                        <div className="card">
                            <div className="confirm-success">
                                <div className="confirm-success__icon">
                                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                        <polyline points="22 4 12 14.01 9 11.01" />
                                    </svg>
                                </div>
                                <h2 className="confirm-success__title">Chuyển khoản thành công!</h2>
                                <p className="confirm-success__desc">Giao dịch đã được xác nhận</p>

                                <div className="confirm-success__details">
                                    <div className="qr-info-row">
                                        <span className="qr-info-row__label">Mã giao dịch</span>
                                        <span className="qr-info-row__value">#{confirmedTx.id}</span>
                                    </div>
                                    <div className="qr-info-row">
                                        <span className="qr-info-row__label">Ngân hàng</span>
                                        <span className="qr-info-row__value">{confirmedTx.gateway}</span>
                                    </div>
                                    <div className="qr-info-row">
                                        <span className="qr-info-row__label">Số tài khoản</span>
                                        <span className="qr-info-row__value">{confirmedTx.accountNumber}</span>
                                    </div>
                                    <div className="qr-info-row">
                                        <span className="qr-info-row__label">Chủ tài khoản</span>
                                        <span className="qr-info-row__value">{selectedAccount?.account_holder_name}</span>
                                    </div>
                                    <div className="qr-info-row">
                                        <span className="qr-info-row__label">Số tiền</span>
                                        <span className="qr-info-row__value confirm-success__amount">{Number(confirmedTx.transferAmount).toLocaleString('vi-VN')} VND</span>
                                    </div>
                                    <div className="qr-info-row">
                                        <span className="qr-info-row__label">Nội dung</span>
                                        <span className="qr-info-row__value">{confirmedTx.content}</span>
                                    </div>
                                    <div className="qr-info-row">
                                        <span className="qr-info-row__label">Thời gian</span>
                                        <span className="qr-info-row__value">{confirmedTx.transactionDate}</span>
                                    </div>
                                </div>

                                <div className="support-note">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="12" cy="12" r="10" />
                                        <line x1="12" y1="16" x2="12" y2="12" />
                                        <line x1="12" y1="8" x2="12.01" y2="8" />
                                    </svg>
                                    <span>Hội viên vui lòng liên hệ CSKH để được hỗ trợ nếu gặp vấn đề khi nạp tiền</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Expired Transaction */}
                {txExpired && !confirmedTx && (
                    <div className="confirm-result">
                        <div className="card">
                            <div className="confirm-expired">
                                <div className="confirm-expired__icon">
                                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="12" cy="12" r="10" />
                                        <polyline points="12 6 12 12 16 14" />
                                    </svg>
                                </div>
                                <h2 className="confirm-expired__title">Giao dịch đã hết hạn</h2>
                                <p className="confirm-expired__desc">Giao dịch đã quá thời gian 30 phút mà chưa nhận được xác nhận chuyển khoản.</p>
                                <button type="button" className="btn btn-primary" onClick={resetForm} style={{ marginTop: '1.5rem' }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="1 4 1 10 7 10" />
                                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                                    </svg>
                                    Tạo giao dịch mới
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* QR Result */}
                {qrUrl && !confirmedTx && !txExpired && (
                    <div className="qr-result">
                        <div className="card">
                            <div className="card__title">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                    <polyline points="22 4 12 14.01 9 11.01" />
                                </svg>
                                Mã QR chuyển khoản
                            </div>
                            <div className="qr-result__content">
                                <div className="qr-result__image-wrapper">
                                    {loading && (
                                        <div className="qr-result__loading">
                                            <span className="loading-spinner loading-spinner--dark" />
                                        </div>
                                    )}
                                    <img
                                        className={`qr-result__image${loading ? ' qr-result__image--loading' : ''}`}
                                        src={qrUrl}
                                        alt="QR Code chuyển khoản"
                                    />
                                </div>

                                <div className="qr-result__info">
                                    <div className="qr-info-row">
                                        <span className="qr-info-row__label">Ngân hàng</span>
                                        <span className="qr-info-row__value">{selectedAccount?.bank_short_name}</span>
                                    </div>
                                    <div className="qr-info-row">
                                        <span className="qr-info-row__label">Số tài khoản</span>
                                        <span className="qr-info-row__value">{selectedAccount?.account_number}</span>
                                    </div>
                                    <div className="qr-info-row">
                                        <span className="qr-info-row__label">Chủ tài khoản</span>
                                        <span className="qr-info-row__value">{selectedAccount?.account_holder_name}</span>
                                    </div>
                                    {amount && (
                                        <div className="qr-info-row">
                                            <span className="qr-info-row__label">Số tiền</span>
                                            <span className="qr-info-row__value">{displayAmount(amount)}</span>
                                        </div>
                                    )}
                                    {qrDescription && (
                                        <div className="qr-info-row">
                                            <span className="qr-info-row__label">Nội dung</span>
                                            <span className="qr-info-row__value">{qrDescription}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Waiting indicator */}
                                {pendingConfirm && (
                                    <div className="qr-waiting">
                                        <div className="qr-waiting__spinner">
                                            <div className="pulse-ring"></div>
                                            <div className="pulse-ring pulse-ring--delay"></div>
                                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <circle cx="12" cy="12" r="10" />
                                                <polyline points="12 6 12 12 16 14" />
                                            </svg>
                                        </div>
                                        <div className="qr-waiting__text">
                                            <span>Đang chờ xác nhận giao dịch...</span>
                                            {countdown > 0 && (
                                                <span className="qr-waiting__countdown">Còn lại: <strong>{formatCountdown(countdown)}</strong></span>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <div className="qr-result__actions">
                                    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                                    <button type="button" className="btn btn-secondary" onClick={downloadQR}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                            <polyline points="7 10 12 15 17 10" />
                                            <line x1="12" y1="15" x2="12" y2="3" />
                                        </svg>
                                        Tải ảnh QR
                                    </button>
                                    <button type="button" className="btn btn-secondary" onClick={() => copyToClipboard(qrUrl, 'link QR')}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                        </svg>
                                        Sao chép link
                                    </button>
                                    <button type="button" className="btn btn-secondary" onClick={resetForm}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="1 4 1 10 7 10" />
                                            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                                        </svg>
                                        Tạo mới
                                    </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Toast */}
                <div className={`copy-toast ${toast ? 'show' : ''}`}>{toast}</div>
            </div>
        </>
    )
}
