/**
 * 腾讯云短信验证码（年会主办方登录）
 * 未配置密钥时：开发模式打印验证码，固定接受 SMS_DEV_CODE 或 888888
 */
const crypto = require('crypto')
const https = require('https')

function smsConfigured() {
  return !!(
    process.env.SMS_SECRET_ID &&
    process.env.SMS_SECRET_KEY &&
    process.env.SMS_SDK_APP_ID &&
    process.env.SMS_SIGN_NAME &&
    process.env.SMS_TEMPLATE_ID
  )
}

function sha256(msg) {
  return crypto.createHash('sha256').update(msg, 'utf8').digest('hex')
}

function hmacSha256(key, msg) {
  return crypto.createHmac('sha256', key).update(msg, 'utf8').digest()
}

function tc3Sign({ secretId, secretKey, service, host, action, region, payload, timestamp }) {
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n`
  const signedHeaders = 'content-type;host;x-tc-action'
  const hashedPayload = sha256(payload)
  const canonicalRequest = [
    'POST',
    '/',
    '',
    canonicalHeaders,
    signedHeaders,
    hashedPayload,
  ].join('\n')
  const credentialScope = `${date}/${service}/tc3_request`
  const stringToSign = ['TC3-HMAC-SHA256', String(timestamp), credentialScope, sha256(canonicalRequest)].join(
    '\n'
  )
  const secretDate = hmacSha256(`TC3${secretKey}`, date)
  const secretService = hmacSha256(secretDate, service)
  const secretSigning = hmacSha256(secretService, 'tc3_request')
  const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign, 'utf8').digest('hex')
  return {
    authorization: `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    timestamp,
  }
}

function postJson(host, path, headers, body) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(body, 'utf8')
    const req = https.request(
      {
        hostname: host,
        path,
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': data.length,
        },
        timeout: 10000,
      },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          try {
            resolve(JSON.parse(text || '{}'))
          } catch (e) {
            reject(new Error(`短信响应解析失败: ${text.slice(0, 200)}`))
          }
        })
      }
    )
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('短信请求超时'))
    })
    req.write(data)
    req.end()
  })
}

/**
 * @param {string} phone 11 位手机号
 * @param {string} code 验证码
 * @param {number} [expireMin=5]
 */
async function sendLoginCode(phone, code, expireMin = 5) {
  const mobile = String(phone || '').replace(/\D/g, '')
  if (!/^1\d{10}$/.test(mobile)) throw new Error('手机号格式不正确')

  if (!smsConfigured()) {
    console.warn(`[galaSms:dev] phone=${mobile} code=${code} (未配置腾讯云短信，仅日志)`)
    return { ok: true, mode: 'dev' }
  }

  const secretId = process.env.SMS_SECRET_ID
  const secretKey = process.env.SMS_SECRET_KEY
  const sdkAppId = String(process.env.SMS_SDK_APP_ID)
  const signName = process.env.SMS_SIGN_NAME
  const templateId = String(process.env.SMS_TEMPLATE_ID)
  const region = process.env.SMS_REGION || 'ap-guangzhou'
  const host = 'sms.tencentcloudapi.com'
  const action = 'SendSms'
  const timestamp = Math.floor(Date.now() / 1000)
  const payloadObj = {
    PhoneNumberSet: [`+86${mobile}`],
    SmsSdkAppId: sdkAppId,
    SignName: signName,
    TemplateId: templateId,
    TemplateParamSet: [String(code), String(expireMin)],
  }
  const payload = JSON.stringify(payloadObj)
  const { authorization } = tc3Sign({
    secretId,
    secretKey,
    service: 'sms',
    host,
    action,
    region,
    payload,
    timestamp,
  })
  const resp = await postJson(
    host,
    '/',
    {
      Authorization: authorization,
      Host: host,
      'X-TC-Action': action,
      'X-TC-Timestamp': String(timestamp),
      'X-TC-Version': '2021-01-11',
      'X-TC-Region': region,
    },
    payload
  )
  if (resp.Response && resp.Response.Error) {
    const err = resp.Response.Error
    throw new Error(`短信发送失败: ${err.Message || err.Code || 'unknown'}`)
  }
  const set = (resp.Response && resp.Response.SendStatusSet) || []
  const first = set[0]
  if (first && first.Code && first.Code !== 'Ok') {
    throw new Error(`短信发送失败: ${first.Message || first.Code}`)
  }
  return { ok: true, mode: 'tencent' }
}

function isDevCode(input) {
  const expect = String(process.env.SMS_DEV_CODE || '888888')
  return String(input || '') === expect
}

module.exports = {
  smsConfigured,
  sendLoginCode,
  isDevCode,
}
