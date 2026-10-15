/** react-query `retry`: a 4xx (NOT_FOUND, FORBIDDEN, …) won't change on retry, so fail fast. */
export function retryQuery(failureCount: number, error: unknown) {
  const status = (error as { data?: { httpStatus?: number } } | null)?.data
    ?.httpStatus;
  if (status && status >= 400 && status < 500) return false;
  return failureCount < 3;
}
