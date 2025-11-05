type FlashStore = Record<string, any>;

interface FlashSession {
  flash?: FlashStore;
  [key: string]: any;
}

interface FlashCompatibleRequest {
  session?: FlashSession;
  [key: string]: any;
}

interface FlashCompatibleResponse {
  [key: string]: any;
}

type NextFunction = () => void;

export default class Flash<
  TReq extends FlashCompatibleRequest = FlashCompatibleRequest
> {
  constructor(protected req: TReq) {
    if (!this.req.session) {
      throw new Error("Flash requires a session object on the request.");
    }

    if (!this.req.session.flash) {
      this.req.session.flash = {};
    }
  }

  static middleware<
    TReq extends FlashCompatibleRequest,
    TRes extends FlashCompatibleResponse
  >(req: TReq, res: TRes, next: NextFunction): void {
    if (!req.session) {
      throw new Error(
        "Flash middleware requires a session object on the request."
      );
    }

    if (!req.session.flash) {
      req.session.flash = {};
    }

    (req as any).flash = new Flash(req);
    next();
  }

  get(key: string): any {
    const store = this.req.session?.flash;
    if (!store) return undefined;

    const value = store[key];
    delete store[key];
    return value;
  }

  /** ✅ Fixed version — ensures store exists and returns `this` for chaining */
  set(key: string, value: any): this {
    if (!this.req.session) {
      throw new Error("Session not initialized.");
    }

    if (!this.req.session.flash) {
      this.req.session.flash = {};
    }

    this.req.session.flash[key] = value;
    return this;
  }

  has(key: string): boolean {
    return (
      !!this.req.session?.flash &&
      Object.prototype.hasOwnProperty.call(this.req.session.flash, key)
    );
  }

  all(): FlashStore {
    const messages = { ...(this.req.session?.flash || {}) };
    if (this.req.session) this.req.session.flash = {};
    return messages;
  }

  clear(): void {
    if (this.req.session) this.req.session.flash = {};
  }

  peek(key: string): any {
    return this.req.session?.flash?.[key];
  }
}
