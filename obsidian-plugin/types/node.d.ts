declare module 'node:crypto' {
  export function createHash(algorithm: string): {
    update(data: Uint8Array): { digest(encoding: 'hex'): string };
  };
}
declare module 'node:http' {
  export interface IncomingMessage {
    statusCode?: number;
    headers: Record<string, string | string[] | undefined>;
    on(event: string, listener: (...args: any[]) => void): this;
    resume(): this;
    destroy(error?: Error): this;
  }
  export interface ClientRequest {
    setTimeout(ms: number, cb: () => void): this;
    on(event: string, listener: (...args: any[]) => void): this;
    write(chunk: Uint8Array): void;
    end(): void;
    destroy(error?: Error): this;
  }
  export function request(url: URL, options: object, cb: (res: IncomingMessage) => void): ClientRequest;
}
declare module 'node:https' {
  import type { IncomingMessage, ClientRequest } from 'node:http';
  export function request(url: URL, options: object, cb: (res: IncomingMessage) => void): ClientRequest;
}
declare const Buffer: { concat(parts: Uint8Array[]): Uint8Array };
interface Buffer extends Uint8Array {}
