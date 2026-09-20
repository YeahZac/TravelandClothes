const express = require('express')
const cors = require('cors')
require('dotenv').config()

const app = express()

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// 路由
app.use('/api/user', require('./routes/user'))
app.use('/api/member', require('./routes/member'))
app.use('/api/card', require('./routes/card'))
app.use('/api/passport', require('./routes/passport'))
app.use('/api/order', require('./routes/order'))
app.use('/api/post', require('./routes/post'))

// 健康检查
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'travel-clothes-backend' }))

// 错误处理
app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ code: 500, msg: '服务器内部错误', data: null })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`同袍会后端运行在端口 ${PORT}`)
})

module.exports = app
