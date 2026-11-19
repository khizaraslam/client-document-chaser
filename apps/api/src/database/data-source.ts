import * as dotenv from 'dotenv';
import * as path from 'path';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { ALL_ENTITIES } from './entities';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5433),
  username: process.env.DB_USERNAME ?? 'cdc_user',
  password: process.env.DB_PASSWORD ?? 'cdc_dev_password',
  database: process.env.DB_NAME ?? 'client_doc_chaser',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
  entities: ALL_ENTITIES,
  migrations: [path.join(__dirname, 'migrations/*{.ts,.js}')],
});
