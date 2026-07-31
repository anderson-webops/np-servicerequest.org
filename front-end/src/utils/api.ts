export function getApiEndpoint(apiBaseUrl: string, path: string) {
  const normalizedBaseUrl = apiBaseUrl.replace(/\/+$/, '')
  const normalizedPath = path.replace(/^\/+/, '').replace(/^api\/+/, '')

  return normalizedPath
    ? `${normalizedBaseUrl}/${normalizedPath}`
    : normalizedBaseUrl
}

export function withApiQuery(endpoint: string, searchParams: URLSearchParams) {
  const query = searchParams.toString()

  if (!query)
    return endpoint

  return `${endpoint}${endpoint.includes('?') ? '&' : '?'}${query}`
}
