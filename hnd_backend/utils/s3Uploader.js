const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');
const crypto = require('crypto');
const { PassThrough } = require('stream');

const {
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  AWS_REGION = 'eu-north-1',
  AWS_BUCKET_NAME,
  AWS_S3_URL,
} = process.env;

if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_BUCKET_NAME || !AWS_S3_URL) {
  console.warn('[S3Uploader] AWS credentials or config missing. S3 operations will fail until configured.');
}

const s3 = new S3Client({
  region: AWS_REGION,
  credentials: AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
      }
    : undefined,
});

const safeFilename = (name) => {
  const base = path.basename(name || 'file');
  return base.replace(/[\\\s]+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '_');
};

const getS3Key = (folder, originalName) => {
  const cleanName = safeFilename(originalName || `upload-${Date.now()}`);
  const random = crypto.randomBytes(6).toString('hex');
  return `${folder}/${Date.now()}-${random}-${cleanName}`;
};

const uploadFile = async (buffer, originalName, mimeType, folder = 'uploads') => {
  console.log('[S3Uploader] Starting file upload:', {
    fileName: originalName,
    mimeType,
    folder,
    bufferSize: buffer ? buffer.length : 0,
    hasConfig: !!(AWS_BUCKET_NAME && AWS_S3_URL),
  });

  if (!AWS_BUCKET_NAME || !AWS_S3_URL) {
    console.error('[S3Uploader] Configuration missing - cannot upload', {
      bucketName: !!AWS_BUCKET_NAME,
      s3Url: !!AWS_S3_URL,
      region: AWS_REGION,
    });
    throw new Error('AWS S3 configuration is missing (BUCKET_NAME or S3_URL)');
  }

  const key = getS3Key(folder, originalName);
  console.log('[S3Uploader] Generated S3 key:', key);

  const params = {
    Bucket: AWS_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: mimeType || 'application/octet-stream',
  };

  try {
    console.log('[S3Uploader] Uploading to S3:', {
      bucket: AWS_BUCKET_NAME,
      key,
      region: AWS_REGION,
    });

    try {
      // Try upload with ACL when explicitly allowed by env flag
      const allowAcls = String(process.env.AWS_ALLOW_ACLS || '').toLowerCase() === 'true';
      if (allowAcls) {
        const paramsWithAcl = Object.assign({}, params, { ACL: 'public-read' });
        await s3.send(new PutObjectCommand(paramsWithAcl));
      } else {
        await s3.send(new PutObjectCommand(params));
      }

      const url = `${AWS_S3_URL.replace(/\/$/, '')}/${key}`;
      console.log('[S3Uploader] Upload successful:', {
        key,
        url,
      });

      return { key, url };
    } catch (err) {
      // If the bucket does not allow ACLs, retry without ACL
      const msg = String(err?.message || '').toLowerCase();
      const code = err?.code || '';
      if (msg.includes('does not allow acls') || msg.includes('accesscontrol') || code === 'AccessControlListNotSupported') {
        console.warn('[S3Uploader] Bucket rejected ACLs; retrying without ACL');
        try {
          await s3.send(new PutObjectCommand(params));
          const url = `${AWS_S3_URL.replace(/\/$/, '')}/${key}`;
          console.log('[S3Uploader] Upload successful (without ACL):', { key, url });
          return { key, url };
        } catch (err2) {
          console.error('[S3Uploader] Retry without ACL failed:', { error: err2.message, code: err2.code });
          throw err2;
        }
      }
      console.error('[S3Uploader] Upload failed:', {
        error: err.message,
        code: err.code,
        statusCode: err.statusCode,
        key,
        bucket: AWS_BUCKET_NAME,
      });
      throw err;
    }
  } catch (err) {
    console.error('[S3Uploader] Upload failed:', {
      error: err.message,
      code: err.code,
      statusCode: err.statusCode,
      key,
      bucket: AWS_BUCKET_NAME,
    });
    throw err;
  }
};

const getS3ObjectStream = (key) => {
  console.log('[S3Uploader] Retrieving S3 object stream:', {
    key,
    bucket: AWS_BUCKET_NAME,
    hasConfig: !!(AWS_BUCKET_NAME),
  });

  if (!AWS_BUCKET_NAME) {
    console.error('[S3Uploader] Cannot retrieve object - bucket not configured');
    throw new Error('AWS S3 configuration is missing (BUCKET_NAME)');
  }

  const stream = new PassThrough();
  s3.send(new GetObjectCommand({ Bucket: AWS_BUCKET_NAME, Key: key }))
    .then((result) => {
      const bodyStream = result?.Body;
      if (!bodyStream || typeof bodyStream.pipe !== 'function') {
        throw new Error('S3 object body is not a readable stream');
      }
      bodyStream.on('error', (err) => stream.emit('error', err));
      bodyStream.pipe(stream);
      console.log('[S3Uploader] S3 read stream created successfully:', key);
    })
    .catch((err) => {
      console.error('[S3Uploader] Failed to create read stream:', {
        error: err.message,
        key,
        bucket: AWS_BUCKET_NAME,
      });
      stream.emit('error', err);
    });

  return stream;
};

module.exports = { uploadFile, getS3ObjectStream };
