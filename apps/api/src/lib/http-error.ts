export class ForbiddenError extends Error {
  readonly status = 403;
  readonly code = "FORBIDDEN";
  constructor() { super("غير مسموح بهذا الإجراء"); }
}
