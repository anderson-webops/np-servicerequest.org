import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const nginxPath = new URL('../deploy/nginx/np-servicerequest.location.conf', import.meta.url)

test('production Nginx proxies the complete origin to the hardened same-origin runtime', async () => {
  const nginx = await readFile(nginxPath, 'utf8')

  assert.match(nginx, /location \/ \{/)
  assert.match(nginx, /client_max_body_size 100k;/)
  assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:3006;/)
  assert.match(nginx, /proxy_set_header X-Forwarded-For \$remote_addr;/)
  assert.doesNotMatch(nginx, /\$http_x_forwarded_for/)
  assert.match(nginx, /proxy_hide_header Server;/)
  assert.doesNotMatch(nginx, /add_header (?:Content-Security-Policy|X-Frame-Options)/)
})
