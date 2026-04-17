export function getApiEndpoint(apiBaseUrl: string, path: string) {
  const normalizedBaseUrl = apiBaseUrl.replace(/\/+$/, '')
  const normalizedPath = path.replace(/^\/+/, '').replace(/^api\/+/, '')

  return normalizedPath
    ? `${normalizedBaseUrl}/${normalizedPath}`
    : normalizedBaseUrl
}
