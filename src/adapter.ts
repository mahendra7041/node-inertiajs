export abstract class Adapter {
  abstract get url(): string;
  abstract get method(): string;
  abstract set statusCode(code: number);
  abstract get statusCode(): number;
  abstract get request(): unknown;
  abstract get response(): unknown;
  abstract getHeader(name: string): string | string[] | undefined;
  abstract setHeader(name: string, value: string): void;
  abstract send(body: string): void;
  abstract json(data: unknown): void;
  abstract redirect(statusOrUrl: number | string, url?: string): void;
}
