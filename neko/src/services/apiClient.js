const JSON_CONTENT_TYPE = 'application/json';

class ApiClient {
  constructor() {
    this.isOnline = navigator.onLine;
    window.addEventListener('online', () => { this.isOnline = true; });
    window.addEventListener('offline', () => { this.isOnline = false; });
  }

  async request(url, options = {}) {
    const isFormData = options.body instanceof FormData;
    const headers = new Headers(options.headers || {});

    if (!isFormData && options.body != null && !headers.has('Content-Type')) {
      headers.set('Content-Type', JSON_CONTENT_TYPE);
    }

    return fetch(url, {
      ...options,
      cache: options.cache ?? 'no-store',
      headers,
    });
  }

  isNetworkError(error) {
    const message = error?.message?.toLowerCase() || '';
    const patterns = [
      'fetch failed',
      'enotfound',
      'getaddrinfo',
      'econnreset',
      'network request failed',
      'failed to fetch',
      'timeout',
    ];
    return !this.isOnline || patterns.some((pattern) => message.includes(pattern));
  }
}

const apiClient = new ApiClient();
export default apiClient;
