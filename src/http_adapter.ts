import type { IncomingMessage, ServerResponse } from "node:http";
import { Adapter } from "./index.js";

export class HttpAdapter extends Adapter {
  constructor(
    protected request: IncomingMessage,
    protected response: ServerResponse
  ) {
    super();
  }

  get url(): string {
    return this.request.url || "/";
  }

  get method(): string {
    return this.request.method || "GET";
  }

  get statusCode(): number {
    return this.response.statusCode || 200;
  }

  set statusCode(code: number) {
    this.response.statusCode = code;
  }

  getHeader(name: string): string | string[] | undefined {
    return this.request.headers[name.toLowerCase()];
  }

  setHeader(name: string, value: string): void {
    this.response.setHeader(name.toLowerCase(), value);
  }

  send(content: string): void {
    this.response.setHeader("Content-Type", "text/html");
    this.response.end(content);
  }

  json(data: unknown): void {
    try {
      this.response.setHeader("Content-Type", "application/json");
      this.response.end(JSON.stringify(data));
    } catch {
      this.response.statusCode = 500;
      this.response.end(JSON.stringify({ error: "Failed to serialize JSON" }));
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

    const body = this.request?.headers["accept"]?.includes("html")
      ? `<p>${status}. Redirecting to <a href="${encodedLocation}">${encodedLocation}</a></p>`
      : `${status}. Redirecting to ${encodedLocation}`;

    this.setHeader("Content-Length", Buffer.byteLength(body).toString());

    if (this.method === "HEAD") {
      this.response.end();
    } else {
      this.response.end(body);
    }
  }
}
