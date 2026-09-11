import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

let s3ClientInstance: S3Client | null = null;

function getR2Client(): S3Client | null {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();

  if (!accountId || !accessKeyId || !secretAccessKey) {
    return null;
  }

  if (!s3ClientInstance) {
    s3ClientInstance = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  return s3ClientInstance;
}

/**
 * Uploads a base64 encoded image or data URL to Cloudflare R2 bucket "drawva".
 * If R2 credentials are not configured yet, gracefully falls back to the data URL.
 */
export async function uploadThumbnailToR2(
  dataOrBase64: string,
  dravId: string
): Promise<string> {
  if (!dataOrBase64) return "";

  const client = getR2Client();
  const bucketName = process.env.R2_BUCKET_NAME?.trim() || "drawva";
  const publicBaseUrl = process.env.R2_PUBLIC_URL?.trim();

  // If R2 credentials are not configured, fallback to data URL directly so system remains functional
  if (!client || !publicBaseUrl) {
    console.warn(
      "[R2] R2 credentials or R2_PUBLIC_URL not fully configured. Using direct preview data URL as fallback."
    );
    return dataOrBase64;
  }

  try {
    // Extract mime type and clean base64 buffer
    let mimeType = "image/webp";
    let base64Payload = dataOrBase64;

    const matches = dataOrBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      mimeType = matches[1];
      base64Payload = matches[2];
    }

    const buffer = Buffer.from(base64Payload, "base64");
    const extension = mimeType.includes("png") ? "png" : "webp";
    const objectKey = `thumbnails/${dravId}-${Date.now()}.${extension}`;

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      Body: buffer,
      ContentType: mimeType,
      CacheControl: "public, max-age=31536000, immutable",
    });

    await client.send(command);

    // Format public URL
    const cleanBase = publicBaseUrl.replace(/\/$/, "");
    return `${cleanBase}/${objectKey}`;
  } catch (error) {
    console.error("[R2] Failed to upload thumbnail to Cloudflare R2:", error);
    // Fallback to data URL so publishing doesn't fail catastrophically
    return dataOrBase64;
  }
}
