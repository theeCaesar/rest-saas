const { S3Client, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const { URL } = require("url");

const s3Client = new S3Client({
  endpoint: process.env.R2_ENDPOINT,
  region: process.env.AWS_REGION || "auto",
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME;


async function uploadBuffer(
  buffer,
  key,
  contentType = "application/octet-stream",
) {
  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    },
  });
  const result = await upload.done();
  const url = `${process.env.R2_BUCKET_PATH}/${key}`;
  return { url, key };
}


async function deleteByKey(key) {
  if (!key) return;
  const command = new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key });
  await s3Client.send(command);
}


async function deleteByUrl(urlStr) {
  if (!urlStr) return;
  try {
    const parsed = new URL(urlStr);
    let pathname = parsed.pathname;
    if (pathname.startsWith("/")) pathname = pathname.slice(1);
    const parts = pathname.split("/");
    if (parts[0] === BUCKET_NAME) parts.shift();
    const key = parts.join("/");
    if (key) {
      await deleteByKey(key);
    }
  } catch (err) {
    console.warn("R2: failed to parse URL for deletion", urlStr);
  }
}

module.exports = {
  uploadBuffer,
  deleteByKey,
  deleteByUrl,
};
