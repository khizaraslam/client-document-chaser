import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { Public } from '../../common/decorators/auth.decorators';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Get()
  async check() {
    let dbHealthy = false;
    try {
      await this.dataSource.query('SELECT 1');
      dbHealthy = true;
    } catch {
      dbHealthy = false;
    }

    let redisHealthy = false;
    let client: Redis | null = null;
    try {
      const redisUrl = this.configService.get<string>('REDIS_URL');
      client = redisUrl
        ? new Redis(redisUrl, {
            lazyConnect: true,
            connectTimeout: 1000,
            maxRetriesPerRequest: 1,
          })
        : new Redis({
            host: this.configService.get<string>('REDIS_HOST', 'localhost'),
            port: this.configService.get<number>('REDIS_PORT', 6379),
            lazyConnect: true,
            connectTimeout: 1000,
            maxRetriesPerRequest: 1,
          });
      await client.connect();
      const pong = await client.ping();
      redisHealthy = pong === 'PONG';
    } catch {
      redisHealthy = false;
    } finally {
      if (client) {
        client.disconnect();
      }
    }

    return {
      status: dbHealthy && redisHealthy ? 'ok' : 'degraded',
      database: dbHealthy ? 'connected' : 'unavailable',
      redis: redisHealthy ? 'connected' : 'unavailable',
      timestamp: new Date().toISOString(),
    };
  }
}
