import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';

export interface StoredObjectMetadata {
  contentLength: number;
  contentType: string | null;
  etag: string | null;
}

@Injectable()
export class S3StorageService {
  private readonly client: S3Client | null;
  private readonly bucket: string;

  constructor(private readonly configService: ConfigService) {
    const endpoint = this.configService.get<string>('S3_ENDPOINT', '').trim();
    const region = this.configService.get<string>('S3_REGION', 'us-east-1').trim();
    this.bucket = this.configService
      .get<string>('S3_BUCKET', 'client-docs-private')
      .trim();
    const accessKeyId = this.configService
      .get<string>('S3_ACCESS_KEY_ID', '')
      .trim();
    const secretAccessKey = this.configService
      .get<string>('S3_SECRET_ACCESS_KEY', '')
      .trim();
    const forcePathStyle = this.configService.get<boolean>(
      'S3_FORCE_PATH_STYLE',
      true,
    );

    if (endpoint && accessKeyId && secretAccessKey) {
      this.client = new S3Client({
        region,
        endpoint,
        forcePathStyle,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
    } else {
      this.client = null;
    }
  }

  getBucketName(): string {
    return this.bucket;
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async createPresignedPutUrl(params: {
    key: string;
    contentType: string;
    expiresInSeconds?: number;
  }): Promise<string> {
    const client = this.requireClient();
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: params.key,
      ContentType: params.contentType,
    });
    return getSignedUrl(client, command, {
      expiresIn: params.expiresInSeconds ?? 900,
    });
  }

  async putObjectBuffer(params: {
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<void> {
    const client = this.requireClient();
    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: params.key,
        Body: params.body,
        ContentType: params.contentType,
        ContentLength: params.body.length,
      }),
    );
  }

  async headObject(key: string): Promise<StoredObjectMetadata> {
    const client = this.requireClient();
    const res = await client.send(
      new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
    return {
      contentLength: Number(res.ContentLength ?? 0),
      contentType: res.ContentType ?? null,
      etag: res.ETag ?? null,
    };
  }

  async getObjectBytes(key: string, maxBytes?: number): Promise<Buffer> {
    const client = this.requireClient();
    const res = await client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ...(maxBytes && maxBytes > 0 ? { Range: `bytes=0-${maxBytes - 1}` } : {}),
      }),
    );

    if (!res.Body) {
      return Buffer.alloc(0);
    }

    return this.streamToBuffer(res.Body as Readable | AsyncIterable<Uint8Array>);
  }

  async createPresignedGetUrl(params: {
    key: string;
    downloadFilename: string;
    contentType: string;
    expiresInSeconds?: number;
  }): Promise<string> {
    const client = this.requireClient();
    const safeDispositionName = params.downloadFilename.replace(/["\\\r\n]/g, '_');
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: params.key,
      ResponseContentType: params.contentType,
      ResponseContentDisposition: `attachment; filename="${safeDispositionName}"`,
    });
    return getSignedUrl(client, command, {
      expiresIn: params.expiresInSeconds ?? 120,
    });
  }

  async deleteObject(key: string): Promise<void> {
    const client = this.requireClient();
    await client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  private requireClient(): S3Client {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'Private object storage credentials are not configured',
      );
    }
    return this.client;
  }

  private async streamToBuffer(
    body: Readable | AsyncIterable<Uint8Array>,
  ): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
}
