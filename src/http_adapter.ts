import type { IncomingMessage, ServerResponse } from "node:http";
import { Adapter } from "./index.js";

export class HttpAdapter extends Adapter {
  constructor(protected req: IncomingMessage, protected res: ServerResponse) {
    super();
  }

  get url(): string {
    return this.req.url || "/";
  }

  get method(): string {
    return this.req.method || "GET";
  }

  get statusCode(): number {
    return this.res.statusCode || 200;
  }

  set statusCode(code: number) {
    this.res.statusCode = code;
  }

  get request(): IncomingMessage {
    return this.req;
  }

  get response(): ServerResponse {
    return this.res;
  }

  getHeader(name: string): string | string[] | undefined {
    return this.req.headers[name.toLowerCase()];
  }

  setHeader(name: string, value: string): void {
    this.res.setHeader(name.toLowerCase(), value);
  }

  send(content: string): void {
    this.res.setHeader("Content-Type", "text/html");
    this.res.end(content);
  }

  json(data: unknown): void {
    try {
      this.res.setHeader("Content-Type", "application/json");
      this.res.end(JSON.stringify(data));
    } catch {
      this.res.statusCode = 500;
      this.res.end(JSON.stringify({ error: "Failed to serialize JSON" }));
    }
  }

  redirect(statusOrUrl: number | string, url?: string): void {
    let status = 302;
    let location = "";

    if (typeof statusOrUrl === "number" && typeof url === "string") {
      status = statusOrUrl;
      location = url;
    } else if (typeof statusOrUrl === "string") {
      location = statusOrUrl;
    }

    const encodedLocation = encodeURI(location);
    this.statusCode = status;
    this.setHeader("Location", encodedLocation);

    const body = this.req?.headers["accept"]?.includes("html")
      ? `<p>${status}. Redirecting to <a href="${encodedLocation}">${encodedLocation}</a></p>`
      : `${status}. Redirecting to ${encodedLocation}`;

    this.setHeader("Content-Length", Buffer.byteLength(body).toString());

    if (this.method === "HEAD") {
      this.res.end();
    } else {
      this.res.end(body);
    }
  }
}
