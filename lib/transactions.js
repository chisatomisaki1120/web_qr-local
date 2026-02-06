const fs = require('fs')
const path = require('path')

const DATA_FILE = path.join(process.cwd(), 'data', 'transactions.json')

// Ensure data directory exists
function ensureDataDir() {
    const dir = path.dirname(DATA_FILE)
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
    }
}

// Load transactions from file
function loadTransactions() {
    try {
        ensureDataDir()
        if (fs.existsSync(DATA_FILE)) {
            const data = fs.readFileSync(DATA_FILE, 'utf8')
            return JSON.parse(data)
        }
    } catch (err) {
        console.error('[Transactions] Error loading:', err.message)
    }
    return []
}

// Save transactions to file
function saveTransactions(transactions) {
    try {
        ensureDataDir()
        fs.writeFileSync(DATA_FILE, JSON.stringify(transactions, null, 2), 'utf8')
    } catch (err) {
        console.error('[Transactions] Error saving:', err.message)
    }
}

// Initialize global store from file
if (!global.__transactions) {
    global.__transactions = loadTransactions()
}

// Export helper functions
module.exports = {
    getAll: () => global.__transactions,
    find: (predicate) => global.__transactions.find(predicate),
    exists: (id) => global.__transactions.some(t => t.id === id),
    add: (transaction) => {
        global.__transactions.push(transaction)
        saveTransactions(global.__transactions)
    },
    save: () => saveTransactions(global.__transactions),
}
