const express = require('express');
const router = express.Router();
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { requireAuth, requireAdmin } = require('../middlewares/jwtAuth');

const {
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  AWS_BUCKET_NAME,
  AWS_S3_URL,
  AWS_REGION = 'eu-north-1',
} = process.env;

// Test S3 configuration and connectivity
router.get('/test-s3-config', requireAuth, requireAdmin, (req, res) => {
  console.log('[S3Test] Config check requested');

  const config = {
    hasAccessKey: !!AWS_ACCESS_KEY_ID,
    hasSecretKey: !!AWS_SECRET_ACCESS_KEY,
    hasBucketName: !!AWS_BUCKET_NAME,
    hasS3Url: !!AWS_S3_URL,
    region: AWS_REGION,
    status: !!AWS_ACCESS_KEY_ID && !!AWS_SECRET_ACCESS_KEY && !!AWS_BUCKET_NAME && !!AWS_S3_URL ? 'CONFIGURED' : 'NOT_CONFIGURED',
  };

  console.log('[S3Test] Configuration status:', config);

  res.json({
    s3: config,
    message: config.status === 'CONFIGURED' ? 'S3 is properly configured' : 'S3 is not fully configured',
  });
});

// Test S3 upload and download
router.post('/test-s3-upload', requireAuth, requireAdmin, async (req, res) => {
  try {
    console.log('[S3Test] Upload test requested');

    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_BUCKET_NAME || !AWS_S3_URL) {
      console.warn('[S3Test] S3 not configured properly');
      return res.status(400).json({
        success: false,
        message: 'S3 is not properly configured. Missing credentials or bucket name.',
        config: {
          hasAccessKey: !!AWS_ACCESS_KEY_ID,
          hasSecretKey: !!AWS_SECRET_ACCESS_KEY,
          hasBucketName: !!AWS_BUCKET_NAME,
          hasS3Url: !!AWS_S3_URL,
        },
      });
    }

    const s3 = new S3Client({
      region: AWS_REGION,
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
      },
    });

    // Create test file
    const testContent = `S3 Test File - Created at ${new Date().toISOString()}`;
    const testKey = `test-uploads/s3-test-${Date.now()}.txt`;

    console.log('[S3Test] Uploading test file:', { bucket: AWS_BUCKET_NAME, key: testKey });

    const uploadParams = {
      Bucket: AWS_BUCKET_NAME,
      Key: testKey,
      Body: Buffer.from(testContent),
      ContentType: 'text/plain',
    };

    await s3.send(new PutObjectCommand(uploadParams));

    console.log('[S3Test] Upload successful:', {
      key: testKey,
      location: `${AWS_S3_URL.replace(/\/$/, '')}/${testKey}`,
    });

    const testUrl = `${AWS_S3_URL.replace(/\/$/, '')}/${testKey}`;

    // Test download
    console.log('[S3Test] Testing download from:', testKey);
    const getParams = { Bucket: AWS_BUCKET_NAME, Key: testKey };
    const getResult = await s3.send(new GetObjectCommand(getParams));
    const chunks = [];
    for await (const chunk of getResult.Body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const downloadedContent = Buffer.concat(chunks).toString();

    console.log('[S3Test] Download successful, content matches:', downloadedContent === testContent);

    res.json({
      success: true,
      message: 'S3 is working correctly!',
      test: {
        uploadedKey: testKey,
        uploadedUrl: testUrl,
        contentMatch: downloadedContent === testContent,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[S3Test] Error during upload test:', {
      message: err.message,
      code: err.code,
      statusCode: err.statusCode,
    });

    res.status(500).json({
      success: false,
      message: 'S3 test failed',
      error: err.message,
      code: err.code,
    });
  }
});

module.exports = router;
