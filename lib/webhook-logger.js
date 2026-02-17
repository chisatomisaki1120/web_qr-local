const fs = require('fs')
const path = require('path')

const LOG_DIR = path.join(process.cwd(), 'data', 'logs')

function ensureLogDir() {
    if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true })
    }
}

/**
 * Append raw webhook payload to a JSON log file.
 * Each log file stores an array of entries with timestamp + raw body.
 *
 * @param {'sepay' | 'casso'} source
 * @param {object} rawBody - The original request body
 */
function logWebhook(source, rawBody) {
    try {
        ensureLogDir()
        const logFile = path.join(LOG_DIR, `webhook-${source}.json`)

        let logs = []
        if (fs.existsSync(logFile)) {
            const data = fs.readFileSync(logFile, 'utf8')
            logs = JSON.parse(data)
        }

        logs.push({
            receivedAt: new Date().toISOString(),
            body: rawBody,
        })

        fs.writeFileSync(logFile, JSON.stringify(logs, null, 2), 'utf8')
    } catch (err) {
        console.error(`[WebhookLogger] Error writing ${source} log:`, err.message)
    }
}

module.exports = { logWebhook }
