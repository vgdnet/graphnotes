import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

export interface WireResponse { status: number; headers: Record<string, string | string[] | undefined>; bytes: Uint8Array }
export type Transport = (url: string, method: string, headers: Record<string, string>, body?: Uint8Array, signal?: AbortSignal) => Promise<WireResponse>;
// Desktop Node transport: no CORS dependency, no cookies, no redirect following.
export const transport: Transport = (url, method, headers, body, signal) => new Promise((resolve, reject) => {
  const target = new URL(url);
  const send = target.protocol === 'https:' ? httpsRequest : httpRequest;
  const req = send(target, { method, headers, signal }, response => {
    if ((response.statusCode ?? 0) >= 300 && (response.statusCode ?? 0) < 400) {
      response.resume(); reject(new Error('Перенаправление API запрещено. Укажите конечный адрес сервера.')); return;
    }
    const parts: Buffer[] = []; let total = 0;
    response.on('data', (part: Buffer) => {
      total += part.length;
      if (total > 32 * 1024 * 1024) { response.destroy(new Error('Ответ сервера слишком большой.')); return; }
      parts.push(part);
    });
    response.on('error', reject);
    response.on('end', () => resolve({ status: response.statusCode ?? 0, headers: response.headers, bytes: Buffer.concat(parts) }));
  });
  req.setTimeout(30_000, () => req.destroy(new Error('Сервер не ответил за 30 секунд. Проверьте состояние передачи.')));
  req.on('error', reject);
  if (body) req.write(body);
  req.end();
});
