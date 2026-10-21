// details are merged into the JSON error body, e.g. { error, options } for a locked episode.
export function httpError(statusCode, message, details) {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (details) err.details = details;
  return err;
}
