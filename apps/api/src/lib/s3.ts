// Minimal binary S3 upload helper.
//
// The existing tutorial-storage.ts S3 provider only handles UTF-8 string
// content under a fixed "tutorials" prefix, so it isn't reusable for
// binary image uploads. This helper uploads an arbitrary Buffer to an
// explicit bucket + key. @aws-sdk/client-s3 is already a dependency.

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

let client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!client) {
    client = new S3Client({ region: process.env.AWS_REGION ?? "ap-south-1" });
  }
  return client;
}

export async function uploadBufferToS3(
  bucket: string,
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}
