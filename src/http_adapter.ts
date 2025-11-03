import type { IncomingMessage, ServerResponse } from "node:http";
import { Adapter } from "./adapter.js";

/**
 * HTTP Adapter for Node.js IncomingMessage and ServerResponse
 * This is the default adapter that works with raw Node.js HTTP objects
 */
export class HttpAdapter extends Adapter {
  constructor(
    protected request: IncomingMessage,
    protected response: ServerResponse
  ) {
    super();
  }

  getRequest(): IncomingMessage {
    return this.request;
  }

  getResponse(): ServerResponse {
    return this.response;
  }

  getHeader(name: string): string | string[] | undefined {
    return this.request.headers[name.toLowerCase()] as
      | string
      | string[]
      | undefined;
  }

  setHeader(name: string, value: any): void {
    this.response.setHeader(name, value);
  }

  getMethod(): string {
    return this.request.method || "GET";
  }

  getUrl(): string {
    return this.request.url || "/";
  }

  json(data: Record<string, any>): void {
    this.response.setHeader("Content-Type", "application/json");
    this.response.end(JSON.stringify(data));
  }

  html(content: string): void {
    this.response.setHeader("Content-Type", "text/html");
    this.response.end(content);
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
    this.response.statusCode = status;
    this.response.setHeader("Location", encodedLocation);

    const method = this.getMethod();
    const body = this.request?.headers["accept"]?.includes("html")
      ? `<p>${status}. Redirecting to <a href="${encodedLocation}">${encodedLocation}</a></p>`
      : `${status}. Redirecting to ${encodedLocation}`;

    this.response.setHeader("Content-Length", Buffer.byteLength(body));

    if (method === "HEAD") {
      this.response.end();
    } else {
      this.response.end(body);
    }
  }

  setStatus(code: number): void {
    this.response.statusCode = code;
  }

  end(data?: any): void {
    this.response.end(data);
  }
}
