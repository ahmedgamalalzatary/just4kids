export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

export class ForbiddenError extends HttpError {
  constructor() { super(403, "FORBIDDEN", "غير مسموح بهذا الإجراء"); }
}
