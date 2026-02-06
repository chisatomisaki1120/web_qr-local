import Head from 'next/head'
import { useState, useEffect, useRef, useCallback } from 'react'

export default function Home() {
    const [bankAccounts, setBankAccounts] = useState([])
    const [selectedAccount, setSelectedAccount] = useState(null)
    const [accountSearch, setAccountSearch] = useState('')
    const [showAccountDropdown, setShowAccountDropdown] = useState(false)
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
                setShowAccountDropdown(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    const filteredAccounts = bankAccounts.filter(acc => {
        const q = accountSearch.toLowerCase()
        return (
            acc.bank_short_name.toLowerCase().includes(q) ||
            acc.bank_full_name.toLowerCase().includes(q) ||
            acc.account_number.toLowerCase().includes(q) ||
            acc.account_holder_name.toLowerCase().includes(q) ||
            (acc.label && acc.label.toLowerCase().includes(q))
        )
    })

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
        if (!selectedAccount) return

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
            startPolling(des)
        }, 500)
    }, [selectedAccount, amount])

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
        setSelectedAccount(null)
        setAccountSearch('')
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

    const canGenerate = !!selectedAccount

    const startPolling = useCallback((code) => {
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
        if (selectedAccount) params.set('accountNumber', selectedAccount.account_number)
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
    }, [selectedAccount, amount])

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
                                <div ref={dropdownRef} className="bank-search-wrapper">
                                    {selectedAccount ? (
                                        <div
                                            className="bank-selected"
                                            onClick={() => {
                                                setSelectedAccount(null)
                                                setAccountSearch('')
                                                setShowAccountDropdown(true)
                                                setTimeout(() => searchInputRef.current?.focus(), 50)
                                            }}
                                        >
                                            <img
                                                className="bank-selected__logo"
                                                src={`https://api.vietqr.io/img/${selectedAccount.bank_code}.png`}
                                                alt={selectedAccount.bank_short_name}
                                                onError={(e) => { e.target.style.display = 'none' }}
                                            />
                                            <div className="bank-selected__info">
                                                <span className="bank-selected__name">{selectedAccount.bank_short_name} - {selectedAccount.account_number}</span>
                                                <span className="bank-selected__holder">{selectedAccount.account_holder_name}</span>
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
                                                placeholder="Tìm tài khoản ngân hàng..."
                                                value={accountSearch}
                                                onChange={(e) => {
                                                    setAccountSearch(e.target.value)
                                                    setShowAccountDropdown(true)
                                                }}
                                                onFocus={() => setShowAccountDropdown(true)}
                                            />
                                        </>
                                    )}

                                    {showAccountDropdown && !selectedAccount && (
                                        <div className="bank-dropdown">
                                            {filteredAccounts.length > 0 ? (
                                                filteredAccounts.map(acc => (
                                                    <button
                                                        key={acc.id}
                                                        type="button"
                                                        className="bank-option"
                                                        onClick={() => {
                                                            setSelectedAccount(acc)
                                                            setAccountSearch('')
                                                            setShowAccountDropdown(false)
                                                        }}
                                                    >
                                                        <img
                                                            className="bank-option__logo"
                                                            src={`https://api.vietqr.io/img/${acc.bank_code}.png`}
                                                            alt={acc.bank_short_name}
                                                            onError={(e) => { e.target.style.display = 'none' }}
                                                        />
                                                        <div className="bank-option__info">
                                                            <div className="bank-option__name">
                                                                {acc.bank_short_name} - {acc.account_number}
                                                                {acc.label && <span className="bank-option__label">{acc.label}</span>}
                                                            </div>
                                                            <div className="bank-option__full">{acc.account_holder_name}</div>
                                                        </div>
                                                        <span className={`bank-option__status ${acc.active === '1' ? 'active' : 'inactive'}`}>
                                                            {acc.active === '1' ? 'Hoạt động' : 'Tạm khóa'}
                                                        </span>
                                                    </button>
                                                ))
                                            ) : (
                                                <div className="no-results">Không tìm thấy tài khoản</div>
                                            )}
                                        </div>
                                    )}
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
                {qrUrl && !loading && !confirmedTx && !txExpired && (
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
                                    <img
                                        className="qr-result__image"
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
