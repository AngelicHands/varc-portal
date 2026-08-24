import { S3Client } from "@aws-sdk/client-s3";

type S3ClientConfig = {
  region: string;
  endpoint: string;
  accessKey: string;
  secretKey: string;
  forcePathStyle: boolean;
};

/** S3 client compatible with MinIO and other S3-compatible endpoints. */
export function createS3Client(config: S3ClientConfig) {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    },
    // Avoid CRC32 checksum trailers that break signing on some S3-compatible stores.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}
