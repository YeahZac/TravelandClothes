/** pm2: pm2 start deploy/ecosystem.config.cjs */
module.exports = {
  apps: [
    {
      name: 'qmyx-cms',
      cwd: '/home/ubuntu/qmyx-cms',
      script: 'src/server.js',
      env: {
        PORT: '3100',
        NODE_ENV: 'production',
      },
    },
  ],
}
