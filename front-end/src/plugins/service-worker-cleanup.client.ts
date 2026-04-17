const reloadKey = 'np-servicerequest-sw-cleanup-reloaded'

export default defineNuxtPlugin(async () => {
  if (!('serviceWorker' in navigator))
    return

  try {
    const registrations = await navigator.serviceWorker.getRegistrations()

    if (!registrations.length)
      return

    await Promise.all(registrations.map(registration => registration.unregister()))

    if ('caches' in window) {
      const cacheKeys = await caches.keys()
      await Promise.all(cacheKeys.map(cacheKey => caches.delete(cacheKey)))
    }

    if (!sessionStorage.getItem(reloadKey)) {
      sessionStorage.setItem(reloadKey, 'true')
      window.location.reload()
      return
    }

    sessionStorage.removeItem(reloadKey)
  }
  catch (error) {
    console.warn('Failed to clean up old service worker state.', error)
  }
})
