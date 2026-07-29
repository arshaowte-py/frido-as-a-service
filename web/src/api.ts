export class ApiError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

async function request<T>(
  method: Method,
  path: string,
  options: { token?: string | null; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    // A response with no JSON body means the API itself is down or misrouted rather than
    // rejecting the request — say so, instead of a generic message with nothing to act on.
    const fallback = payload
      ? 'Something went wrong. Please try again.'
      : `The API returned ${response.status} with no error details. ` +
        'Check /api/health — it reports configuration and database problems.';
    throw new ApiError(
      response.status,
      payload?.error?.code ?? 'api_unavailable',
      payload?.error?.message ?? fallback,
    );
  }
  if (payload === null) {
    throw new ApiError(
      response.status,
      'api_unavailable',
      'The API returned something that was not JSON. Check /api/health.',
    );
  }
  return payload as T;
}

export const api = {
  get: <T,>(path: string, token?: string | null) => request<T>('GET', path, { token }),
  post: <T,>(path: string, body?: unknown, token?: string | null) =>
    request<T>('POST', path, { body, token }),
  patch: <T,>(path: string, body?: unknown, token?: string | null) =>
    request<T>('PATCH', path, { body, token }),
};

/** Triggers a browser download for an authenticated endpoint. */
export async function download(path: string, token: string, filename: string) {
  const response = await fetch(`/api${path}`, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new ApiError(response.status, 'download_failed', 'Export failed.');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
