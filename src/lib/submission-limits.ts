export const MAX_SUBMISSION_PHOTOS = 5;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_SUBMISSION_PHOTO_BYTES = 50 * 1024 * 1024;
// Multipart headers and fields need a small bounded margin. The route also
// checks the actual sum of uploaded File bytes after parsing formData().
export const MAX_SUBMISSION_REQUEST_BYTES = 52 * 1024 * 1024;
export const SUBMISSIONS_PER_HOUR = 3;
export const PHOTOS_PER_DAY = 15;
export const SUBMISSION_HOUR_MS = 60 * 60 * 1000;
export const SUBMISSION_DAY_MS = 24 * 60 * 60 * 1000;
