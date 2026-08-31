const crypto = require('crypto')
const fs = require('fs/promises')
const path = require('path')
const multer = require('multer')

const settingsModel = require('../models/settingsModel')
const ApiError = require('../utils/ApiError')
const asyncHandler = require('../utils/asyncHandler')

/* Image uploads for listing photos.

   >>> THE FILE TYPE IS DECIDED BY THE BYTES, NOT BY THE CLIENT <<<
   Both `file.mimetype` and the filename come from the browser and can say
   anything. A .php or .html file renamed to .jpg would pass a mimetype check
   and then be served back from our own origin -- which is how an upload form
   becomes stored XSS. So the signature below is read from the actual buffer and
   is the only thing that decides the extension we write.

   SVG is deliberately absent: it is XML, it can carry <script>, and there is no
   signature that distinguishes a safe one from a hostile one. */

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads')

const SIGNATURES = [
  { ext: 'jpg', mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', mime: 'image/png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'gif', mime: 'image/gif', test: (b) => b.subarray(0, 6).toString('latin1') === 'GIF89a' || b.subarray(0, 6).toString('latin1') === 'GIF87a' },
  { ext: 'webp', mime: 'image/webp', test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
]

/** The matching signature, or null when the bytes are not a known image. */
function detect(buffer) {
  if (!buffer || buffer.length < 12) return null
  return SIGNATURES.find((s) => s.test(buffer)) ?? null
}

/* Held in memory rather than streamed to disk, so nothing is written until the
   signature check has passed -- a rejected upload leaves no file behind.
   The hard ceiling is generous; the real limit is the admin's max_image_mb,
   enforced below so it can change without a restart. */
const HARD_LIMIT_BYTES = 16 * 1024 * 1024

const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: HARD_LIMIT_BYTES, files: 1 },
})

/** Multer as middleware, with its errors mapped to our envelope. */
const receiveImage = (req, res, next) =>
  memoryUpload.single('image')(req, res, (err) => {
    if (!err) return next()
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(ApiError.badRequest('That image is too large'))
    }
    if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
      return next(ApiError.badRequest('Send exactly one file, in a field named "image"'))
    }
    return next(err)
  })

const uploadImage = asyncHandler(async (req, res) => {
  if (!(await settingsModel.get('allow_image_uploads'))) {
    throw ApiError.forbidden('Photo uploads are currently disabled')
  }

  if (!req.file) throw ApiError.badRequest('No image was received')

  const maxMb = await settingsModel.get('max_image_mb')
  if (maxMb > 0 && req.file.size > maxMb * 1024 * 1024) {
    throw ApiError.badRequest(`Images must be ${maxMb}MB or smaller`)
  }

  const kind = detect(req.file.buffer)
  if (!kind) {
    throw ApiError.badRequest('That file is not a JPEG, PNG, GIF or WebP image')
  }

  /* Our own name, never the client's. An uploaded name can contain path
     separators, traversal, or a second extension -- and we have no use for it
     anyway, since the listing carries the caption. */
  const name = `${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}.${kind.ext}`

  await fs.mkdir(UPLOAD_DIR, { recursive: true })
  await fs.writeFile(path.join(UPLOAD_DIR, name), req.file.buffer)

  res.status(201).json({
    success: true,
    message: 'Photo uploaded',
    data: { url: `/uploads/${name}`, bytes: req.file.size, type: kind.mime },
  })
})

module.exports = { receiveImage, uploadImage, UPLOAD_DIR }
