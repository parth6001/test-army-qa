export function createApiClient(baseUrl: string, fetcher?: typeof fetch): (url: string, options?: RequestInit) => Promise<Response>;
