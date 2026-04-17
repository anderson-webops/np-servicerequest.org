globalThis.addEventListener('install', (event) => {
  event.waitUntil(globalThis.skipWaiting())
})

globalThis.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheKeys = await caches.keys()
    await Promise.all(cacheKeys.map(cacheKey => caches.delete(cacheKey)))
    await globalThis.registration.unregister()

    const clients = await globalThis.clients.matchAll({
      includeUncontrolled: true,
      type: 'window',
    })

    await Promise.all(clients.map(client => client.navigate(client.url)))
  })())
})

globalThis.addEventListener('fetch', () => {
  // Intentionally empty. This worker only exists to clean up older cached PWA installs.
})
