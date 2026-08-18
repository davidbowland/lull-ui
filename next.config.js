/** @type {import('next').NextConfig} */

if (process.env.DEVELOPMENT === 'true') {
  const fs = require('fs')
  fs.readFileSync('.env.development', 'utf8')
    .split('\n')
    .forEach((line) => {
      const match = line.match(/^([^#=\s][^=]*)=(.*)$/)
      if (match) process.env[match[1]] = match[2]
    })
}

const nextConfig = {
  ...(process.env.NODE_ENV !== 'development' && { output: 'export' }),
  pageExtensions: ['ts', 'tsx'],
  trailingSlash: true,
}

module.exports = nextConfig
