// Storage helpers — usa AWS S3 (ou compatível: R2, Spaces, MinIO) quando configurado.
// Se as variáveis de S3 não estiverem definidas, faz fallback para storage local
// em ./uploads/ servido como /uploads/* pelo Express. Isso permite rodar em dev
// sem precisar configurar S3.

import fs from "fs";
import path from "path";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

type S3Cfg = {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicUrlBase?: string;
};

function readS3Config(): S3Cfg | null {
  const bucket = process.env.S3_BUCKET;
  const region = process.env.S3_REGION || "us-east-1";
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const endpoint = process.env.S3_ENDPOINT || undefined;
  const publicUrlBase = process.env.S3_PUBLIC_URL_BASE || undefined;

  if (!bucket || !accessKeyId || !secretAccessKey) return null;
  return { bucket, region, accessKeyId, secretAccessKey, endpoint, publicUrlBase };
}

let _client: S3Client | null = null;
function getClient(cfg: S3Cfg): S3Client {
  if (_client) return _client;
  _client = new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    forcePathStyle: !!cfg.endpoint,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
  return _client;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

const LOCAL_DIR = path.resolve(process.cwd(), "uploads");

function ensureLocalDir(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const cfg = readS3Config();

  if (cfg) {
    const client = getClient(cfg);
    const body =
      typeof data === "string"
        ? Buffer.from(data)
        : Buffer.isBuffer(data)
        ? data
        : Buffer.from(data);
    await client.send(
      new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    );
    const url = cfg.publicUrlBase
      ? `${cfg.publicUrlBase.replace(/\/+$/, "")}/${key}`
      : await getSignedUrl(
          client,
          new GetObjectCommand({ Bucket: cfg.bucket, Key: key }),
          { expiresIn: 60 * 60 * 24 * 7 }
        );
    return { key, url };
  }

  const localPath = path.join(LOCAL_DIR, key);
  ensureLocalDir(localPath);
  const buf =
    typeof data === "string"
      ? Buffer.from(data)
      : Buffer.isBuffer(data)
      ? data
      : Buffer.from(data);
  fs.writeFileSync(localPath, buf);
  const publicBase = process.env.PUBLIC_BASE_URL || "";
  const url = `${publicBase.replace(/\/+$/, "")}/uploads/${key}`;
  return { key, url };
}

export async function storageGet(
  relKey: string
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const cfg = readS3Config();

  if (cfg) {
    const client = getClient(cfg);
    const url = cfg.publicUrlBase
      ? `${cfg.publicUrlBase.replace(/\/+$/, "")}/${key}`
      : await getSignedUrl(
          client,
          new GetObjectCommand({ Bucket: cfg.bucket, Key: key }),
          { expiresIn: 60 * 60 * 24 * 7 }
        );
    return { key, url };
  }

  const publicBase = process.env.PUBLIC_BASE_URL || "";
  const url = `${publicBase.replace(/\/+$/, "")}/uploads/${key}`;
  return { key, url };
}
