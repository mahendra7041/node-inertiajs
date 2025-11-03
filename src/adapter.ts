/**
 * Abstract adapter class that defines the interface for framework-specific implementations.
 * This allows node-inertiajs to remain framework-agnostic while supporting any
 * Node.js framework like Express, Fastify, and Hono.
 */
export abstract class Adapter {
  /**
   * Get the underlying request object.
   * This is provided for backward compatibility with callback functions
   * that expect request/response objects.
   */
  abstract getRequest(): any;

  /**
   * Get the underlying response object.
   * This is provided for backward compatibility with callback functions
   * that expect request/response objects.
   */
  abstract getResponse(): any;

  /**
   * Get a request header value
   */
  abstract getHeader(name: string): string | string[] | undefined;

  /**
   * Set a response header
   */
  abstract setHeader(name: string, value: any): void;

  /**
   * Get the HTTP method of the request
   */
  abstract getMethod(): string;

  /**
   * Get the URL of the request
   */
  abstract getUrl(): string;

  /**
   * Send a JSON response
   */
  abstract json(data: Record<string, any>): void;

  /**
   * Send an HTML response
   */
  abstract html(content: string): void;

  /**
   * Redirect to a URL
   */
  abstract redirect(statusOrUrl: number | string, url?: string): void;

  /**
   * Set the response status code
   */
  abstract setStatus(code: number): void;

  /**
   * End the response with optional data
   */
  abstract end(data?: any): void;
}
