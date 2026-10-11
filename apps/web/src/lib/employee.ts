/**
 * The authenticated API route that serves a barber's photo; 404 falls back to the initial avatar.
 * `version` (the employee's `photoUpdatedAt`) makes a replaced photo a new address so the browser
 * cannot reuse the old image from its cache.
 */
export function employeePhotoUrl(employeeId: string, version?: string | null): string {
  const base = `/api/employees/${employeeId}/photo`;
  return version ? `${base}?v=${encodeURIComponent(version)}` : base;
}
