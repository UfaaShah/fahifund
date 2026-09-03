import multer from "multer";
import path from "path";
import crypto from "crypto";
import fs from "fs";

const uploadDir = path.resolve(__dirname, "../../", process.env.UPLOAD_DIR || "./uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = [".png", ".jpg", ".jpeg", ".webp", ".pdf"].includes(ext) ? ext : "";
    cb(null, `${crypto.randomUUID()}${safeExt}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error("Only PNG, JPG, WEBP or PDF files are allowed"));
    }
    cb(null, true);
  },
});

export function publicUploadPath(filename: string) {
  return `/uploads/${filename}`;
}

/** Best-effort delete of a previously-uploaded receipt/proof file from disk,
 * given the public path stored on a payment/payout row (e.g. "/uploads/xyz.png").
 * Used when Super Admin permanently deletes a payment or payout record. Never
 * throws — a missing file (already cleaned up, or a legacy record) is fine. */
export function deleteUploadedFile(publicPath: string | null | undefined) {
  if (!publicPath) return;
  const filename = path.basename(publicPath);
  fs.unlink(path.join(uploadDir, filename), () => {
    /* ignore errors — best effort cleanup */
  });
}
