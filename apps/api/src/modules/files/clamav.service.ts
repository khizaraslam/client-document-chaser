import { FileScanStatus } from '@cdc/contracts';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as net from 'net';

export interface MalwareScanResult {
  status: FileScanStatus.CLEAN | FileScanStatus.INFECTED | FileScanStatus.QUARANTINED;
  details: string;
}

@Injectable()
export class ClamavService {
  private readonly enabled: boolean;
  private readonly host: string;
  private readonly port: number;

  constructor(private readonly configService: ConfigService) {
    this.enabled = this.configService.get<boolean>(
      'MALWARE_SCAN_ENABLED',
      false,
    );
    this.host = this.configService.get<string>('CLAMAV_HOST', 'localhost');
    this.port = this.configService.get<number>('CLAMAV_PORT', 3310);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async scanBuffer(buffer: Buffer): Promise<MalwareScanResult> {
    if (!this.enabled) {
      return {
        status: FileScanStatus.CLEAN,
        details: 'ClamAV malware scanning disabled in environment',
      };
    }

    try {
      const response = await this.sendInstream(buffer);
      if (/\bOK\s*$/i.test(response)) {
        return {
          status: FileScanStatus.CLEAN,
          details: 'ClamAV scan passed',
        };
      }
      if (/\bFOUND\s*$/i.test(response)) {
        return {
          status: FileScanStatus.INFECTED,
          details: response.trim().slice(0, 500),
        };
      }
      return {
        status: FileScanStatus.QUARANTINED,
        details: 'Unexpected malware scanner response; file quarantined',
      };
    } catch {
      return {
        status: FileScanStatus.QUARANTINED,
        details: 'Malware scanner unavailable or timed out; file quarantined',
      };
    }
  }

  private sendInstream(buffer: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      const chunks: Buffer[] = [];
      let settled = false;

      const finish = (err?: Error) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (err) {
          reject(err);
        } else {
          resolve(Buffer.concat(chunks).toString('utf8').replace(/\0/g, '').trim());
        }
      };

      socket.setTimeout(10_000);
      socket.on('timeout', () => finish(new Error('ClamAV timeout')));
      socket.on('error', (err) => finish(err));
      socket.on('data', (data) => chunks.push(data));
      socket.on('end', () => finish());

      socket.connect(this.port, this.host, () => {
        socket.write('zINSTREAM\0');
        const chunkSize = 64 * 1024;
        for (let offset = 0; offset < buffer.length; offset += chunkSize) {
          const slice = buffer.subarray(
            offset,
            Math.min(offset + chunkSize, buffer.length),
          );
          const lenBuf = Buffer.alloc(4);
          lenBuf.writeUInt32BE(slice.length, 0);
          socket.write(lenBuf);
          socket.write(slice);
        }
        const eof = Buffer.alloc(4);
        eof.writeUInt32BE(0, 0);
        socket.write(eof);
      });
    });
  }
}
