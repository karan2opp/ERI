import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import fs from 'node:fs'
import { seoPlugin } from './seo-plugin.ts'
import { fileURLToPath } from 'node:url'

// Dev HTTPS. A locally trusted certificate in client/.cert (made with mkcert, see the README) lets
// Chrome cache map tiles between reloads; Chrome caches nothing from a site with a certificate error.
// Without it we fall back to a self-signed certificate, which works but caches nothing.
const certDir = fileURLToPath(new URL('./.cert/', import.meta.url))
const trustedCert = fs.existsSync(certDir + 'localhost.pem') && fs.existsSync(certDir + 'localhost-key.pem')

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    seoPlugin(),
    ...(trustedCert ? [] : [basicSsl()])
  ],
  server: {
    https: trustedCert
      ? { cert: fs.readFileSync(certDir + 'localhost.pem'), key: fs.readFileSync(certDir + 'localhost-key.pem') }
      : undefined,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false,
      },
      '/socket.io': {
        target: 'http://127.0.0.1:5000',
        ws: true,
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
