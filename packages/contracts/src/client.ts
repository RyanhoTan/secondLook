export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function createClient(baseUrl: string, getToken: () => string | null) {
  return async function api<T>(
    path: string,
    options: RequestInit & { responseType?: "blob" } = {},
  ): Promise<T> {
    const token = getToken();
    const { responseType, ...init } = options;
    const multipart =
      typeof FormData !== "undefined" && options.body instanceof FormData;
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        ...(options.body && !multipart
          ? { "Content-Type": "application/json" }
          : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
    if (response.status === 204) return undefined as T;
    if (response.ok && responseType === "blob")
      return (await response.blob()) as T;
    const payload = await response.json().catch(() => null);
    if (!response.ok)
      throw new ApiError(
        response.status,
        payload?.message ?? "请求失败，请稍后重试",
      );
    return payload as T;
  };
}
