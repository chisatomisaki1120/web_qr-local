const http = require('http')
const https = require('https')
const fs = require('fs')
const path = require('path')

const FORWARD_URL = process.env.WEBHOOK_FORWARD_URL || 'http://46.250.230.153:2202/webhook/forward'
const FORWARD_API_KEY = process.env.WEBHOOK_FORWARD_API_KEY || 'ARKKUSBYNUJOPQN92PACIVFTSOQM38H5FGDFT38JRUPBYNSL11MV47LGJOJQ0WYV'

const LOG_DIR = path.join(process.cwd(), 'data', 'logs')

function ensureLogDir() {
    if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true })
    }
}

function logForwardResult(source, entry) {
    try {
        ensureLogDir()
        const logFile = path.join(LOG_DIR, 'webhook-forward.json')

        let logs = []
        if (fs.existsSync(logFile)) {
            const data = fs.readFileSync(logFile, 'utf8')
            logs = JSON.parse(data)
        }

        logs.push(entry)
        fs.writeFileSync(logFile, JSON.stringify(logs, null, 2), 'utf8')
    } catch (err) {
        console.error(`[WebhookForward] Error writing forward log:`, err.message)
    }
}

/**
 * Forward webhook payload to an external endpoint.
 * Fires and forgets — does not block the main webhook response.
 *
 * @param {'sepay' | 'casso'} source - Webhook source identifier
 * @param {object} body - The raw webhook payload to forward
 */
function forwardWebhook(source, body) {
    const payload = JSON.stringify({
        source,
        forwardedAt: new Date().toISOString(),
        data: body,
    })

    const url = new URL(FORWARD_URL)

    const isHttps = url.protocol === 'https:'
    const transport = isHttps ? https : http

    const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            'Authorization': `Apikey ${FORWARD_API_KEY}`,
            'X-Webhook-Source': source,
        },
        // Allow self-signed certificates on the target server
        rejectUnauthorized: false,
        timeout: 10000,
    }

    const req = transport.request(options, (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => {
            const success = res.statusCode >= 200 && res.statusCode < 300
            console.log(`[WebhookForward] ${source} → ${FORWARD_URL} | Status: ${res.statusCode} | ${success ? 'OK' : 'FAILED'} | Response: ${data.substring(0, 200)}`)
            logForwardResult(source, {
                time: new Date().toISOString(),
                source,
                url: FORWARD_URL,
                status: res.statusCode,
                success,
                response: data.substring(0, 500),
            })
        })
    })

    req.on('error', (err) => {
        console.error(`[WebhookForward] ${source} → ${FORWARD_URL} | Error: ${err.message}`)
        logForwardResult(source, {
            time: new Date().toISOString(),
            source,
            url: FORWARD_URL,
            status: null,
            success: false,
            error: err.message,
        })
    })

    req.on('timeout', () => {
        console.error(`[WebhookForward] ${source} → ${FORWARD_URL} | Timeout after 10s`)
        logForwardResult(source, {
            time: new Date().toISOString(),
            source,
            url: FORWARD_URL,
            status: null,
            success: false,
            error: 'Timeout after 10s',
        })
        req.destroy()
    })

    req.write(payload)
    req.end()
}

module.exports = { forwardWebhook }
