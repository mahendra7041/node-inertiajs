/*
 * This file is originally developed as part of @adonisjs/inertia
 * (c) AdonisJS
 *
 * This file has been modified by Mahendra Chavda
 * to work with express-inertia
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { ServerRenderer } from "./server_renderer.js";
import type {
  Data,
  MaybePromise,
  PageObject,
  PageProps,
  ResolvedConfig,
  SharedData,
} from "./types.js";
import {
  AlwaysProp,
  DeferProp,
  ignoreFirstLoadSymbol,
  MergeableProp,
  MergeProp,
  OptionalProp,
} from "./props.js";
import { InertiaHeaders } from "./headers.js";
import { Adapter } from "./adapter.js";
import type { ViteDevServer } from "vite";
import { readFile } from "node:fs/promises";
import { encode } from "html-entities";

/**
 * Main class used to interact with Inertia
 */
export class Inertia {
  #sharedData: SharedData = {};
  #serverRenderer: ServerRenderer;

  #shouldClearHistory = false;
  #shouldEncryptHistory = false;
  #inertiaHeadTag: string;
  #inertiaBodyTag: string;

  constructor(
    protected adapter: Adapter,
    protected config: ResolvedConfig,
    protected vite?: ViteDevServer
  ) {
    this.#sharedData = config.sharedData || {};
    this.#serverRenderer = new ServerRenderer(config, vite);
    this.#shouldClearHistory = false;
    this.#shouldEncryptHistory = config.encryptHistory;
    this.#inertiaHeadTag = "<!-- @inertiaHead -->";
    this.#inertiaBodyTag = "<!-- @inertia -->";
  }

  /**
   * Check if the current request is a partial request
   */
  #isPartial(component: string) {
    return (
      this.adapter.getHeader(InertiaHeaders.PartialComponent) === component
    );
  }

  /**
   * Resolve the `only` partial request props.
   * Only the props listed in the `x-inertia-partial-data` header
   * will be returned
   */
  #resolveOnly(props: PageProps) {
    const partialOnlyHeader = this.adapter.getHeader(
      InertiaHeaders.PartialOnly
    ) as string | undefined;
    const only = partialOnlyHeader!.split(",").filter(Boolean);
    let newProps: PageProps = {};

    for (const key of only) newProps[key] = props[key];

    return newProps;
  }

  /**
   * Resolve the `except` partial request props.
   * Remove the props listed in the `x-inertia-partial-except` header
   */
  #resolveExcept(props: PageProps) {
    const partialExceptHeader = this.adapter.getHeader(
      InertiaHeaders.PartialExcept
    ) as string | undefined;
    const except = partialExceptHeader!.split(",").filter(Boolean);

    for (const key of except) delete props[key];

    return props;
  }

  /**
   * Resolve the props for the current request
   * by filtering out the props that are not needed
   * based on the request headers
   */
  #pickPropsToResolve(component: string, props: PageProps = {}) {
    const isPartial = this.#isPartial(component);
    let newProps = props;

    /**
     * If it's not a partial request, keep everything as it is
     * except the props that are marked as `ignoreFirstLoad`
     */
    if (!isPartial) {
      newProps = Object.fromEntries(
        Object.entries(props).filter(([_, value]) => {
          if (value && (value as any)[ignoreFirstLoadSymbol]) return false;

          return true;
        })
      );
    }

    /**
     * Keep only the props that are listed in the `x-inertia-partial-data` header
     */
    const partialOnlyHeader = this.adapter.getHeader(
      InertiaHeaders.PartialOnly
    );
    if (isPartial && partialOnlyHeader) newProps = this.#resolveOnly(props);

    /**
     * Remove the props that are listed in the `x-inertia-partial-except` header
     */
    const partialExceptHeader = this.adapter.getHeader(
      InertiaHeaders.PartialExcept
    );
    if (isPartial && partialExceptHeader)
      newProps = this.#resolveExcept(newProps);

    /**
     * Resolve all the props that are marked as `AlwaysProp` since they
     * should be resolved on every request, no matter if it's a partial
     * request or not.
     */
    for (const [key, value] of Object.entries(props)) {
      if (value instanceof AlwaysProp) newProps[key] = props[key];
    }

    return newProps;
  }

  /**
   * Resolve a single prop
   */
  async #resolveProp(key: string, value: any) {
    if (
      value instanceof OptionalProp ||
      value instanceof MergeProp ||
      value instanceof DeferProp ||
      value instanceof AlwaysProp
    ) {
      return [key, await value.callback()];
    }

    return [key, value];
  }

  /**
   * Resolve a single prop by calling the callback or resolving the promise
   */
  async #resolvePageProps(props: PageProps = {}) {
    return Object.fromEntries(
      await Promise.all(
        Object.entries(props).map(async ([key, value]) => {
          if (typeof value === "function") {
            const result = await value(
              this.adapter.getRequest(),
              this.adapter.getResponse()
            );
            return this.#resolveProp(key, result);
          }

          return this.#resolveProp(key, value);
        })
      )
    );
  }

  /**
   * Resolve the deferred props listing. Will be returned only
   * on the first visit to the page and will be used to make
   * subsequent partial requests
   */
  #resolveDeferredProps(component: string, pageProps?: PageProps) {
    if (this.#isPartial(component)) return {};

    const deferredProps = Object.entries(pageProps || {})
      .filter(([_, value]) => value instanceof DeferProp)
      .map(([key, value]) => ({
        key,
        group: (value as DeferProp<any>).getGroup(),
      }))
      .reduce((groups, { key, group }) => {
        if (!groups[group]) groups[group] = [];

        groups[group].push(key);
        return groups;
      }, {} as Record<string, string[]>);

    return Object.keys(deferredProps).length ? { deferredProps } : {};
  }

  /**
   * Resolve the props that should be merged
   */
  #resolveMergeProps(pageProps?: PageProps) {
    const inertiaResetHeader =
      (this.adapter.getHeader(InertiaHeaders.Reset) as string | undefined) ||
      "";
    const resetProps = new Set(inertiaResetHeader.split(",").filter(Boolean));

    const mergeProps = Object.entries(pageProps || {})
      .filter(
        ([_, value]) => value instanceof MergeableProp && value.shouldMerge
      )
      .map(([key]) => key)
      .filter((key) => !resetProps.has(key));

    return mergeProps.length ? { mergeProps } : {};
  }

  /**
   * Build the page object that will be returned to the client
   *
   * See https://inertiajs.com/the-protocol#the-page-object
   */
  async #buildPageObject<TPageProps extends PageProps>(
    component: string,
    pageProps?: TPageProps
  ): Promise<PageObject<TPageProps>> {
    const propsToResolve = this.#pickPropsToResolve(component, {
      ...this.#sharedData,
      ...pageProps,
    });

    return {
      component,
      url: this.adapter.getUrl() || "/",
      version: this.config.assetsVersion,
      props: await this.#resolvePageProps(propsToResolve),
      clearHistory: this.#shouldClearHistory,
      encryptHistory: this.#shouldEncryptHistory,
      ...this.#resolveMergeProps(pageProps),
      ...this.#resolveDeferredProps(component, pageProps),
    };
  }

  /**
   * If the page should be rendered on the server or not
   *
   * The ssr.pages config can be a list of pages or a function that returns a boolean
   */
  async #shouldRenderOnServer(_component: string) {
    return this.config.ssrEnabled;
  }

  /**
   * Resolve the root view
   */
  async #resolveRootView() {
    const entrypoint =
      process.env.NODE_ENV !== "production"
        ? this.config.indexEntrypoint
        : this.config.indexBuildEntrypoint;

    if (typeof entrypoint === "function") {
      return await entrypoint(
        this.adapter.getRequest(),
        this.adapter.getResponse()
      );
    }

    return await readFile(entrypoint, "utf8");
  }

  /**
   * Render the page on the server
   */
  async #renderOnServer(pageObject: PageObject) {
    const { head, body } = await this.#serverRenderer.render(pageObject);

    return this.#renderView({ ssrHead: head, ssrBody: body, ...pageObject });
  }

  /**
   * Share data for the current request.
   * This data will override any shared data defined in the config.
   */
  share(data: Record<string, Data>) {
    this.#sharedData = { ...this.#sharedData, ...data };
  }

  /**
   * resolve index page
   */
  async #resolveLayout() {
    let template = await this.#resolveRootView();
    if (this.vite) {
      template = await this.vite.transformIndexHtml(
        this.adapter.getUrl() || "/",
        template
      );
    }
    return template;
  }

  /**
   * Render html response
   */
  async #renderView<TPageProps extends Record<string, any> = {}>(
    pageObject: PageObject<TPageProps>
  ) {
    const template = await this.#resolveLayout();
    if (pageObject.ssrBody) {
      const html = template
        .replace(
          this.#inertiaHeadTag,
          () => pageObject.ssrHead?.join("\n") || ""
        )
        .replace(this.#inertiaBodyTag, () => pageObject.ssrBody || "");
      return this.adapter.html(html);
    }

    const id = this.config?.rootElementId || "app";
    const dataPage = encode(JSON.stringify(pageObject));

    const html = template
      .replace(this.#inertiaHeadTag, () => "")
      .replace(
        this.#inertiaBodyTag,
        () => `<div id="${id}" data-page="${dataPage}"></div>` || ""
      );
    return this.adapter.html(html);
  }

  /**
   * Render a page using Inertia
   */
  async render<TPageProps extends Record<string, any> = {}>(
    component: string,
    pageProps?: TPageProps
  ) {
    const pageObject = await this.#buildPageObject(component, pageProps);
    const isInertiaRequest = !!this.adapter.getHeader(InertiaHeaders.Inertia);

    if (!isInertiaRequest) {
      const shouldRenderOnServer = await this.#shouldRenderOnServer(component);
      if (shouldRenderOnServer) {
        return this.#renderOnServer(pageObject);
      }

      return this.#renderView(pageObject);
    }

    this.adapter.setHeader(InertiaHeaders.Inertia, "true");
    this.adapter.json(pageObject);
  }

  /**
   * Clear history state.
   *
   * See https://v2.inertiajs.com/history-encryption#clearing-history
   */
  clearHistory() {
    this.#shouldClearHistory = true;
  }

  /**
   * Encrypt history
   *
   * See https://v2.inertiajs.com/history-encryption
   */
  encryptHistory(encrypt = true) {
    this.#shouldEncryptHistory = encrypt;
  }

  /**
   * Create a lazy prop
   *
   * Lazy props are never resolved on first visit, but only when the client
   * request a partial reload explicitely with this value.
   *
   * See https://inertiajs.com/partial-reloads#lazy-data-evaluation
   *
   * @deprecated use `optional` instead
   */
  lazy<T>(callback: () => MaybePromise<T>) {
    return new OptionalProp(callback);
  }

  /**
   * Create an optional prop
   *
   * See https://inertiajs.com/partial-reloads#lazy-data-evaluation
   */
  optional<T>(callback: () => MaybePromise<T>) {
    return new OptionalProp(callback);
  }

  /**
   * Create a mergeable prop
   *
   * See https://v2.inertiajs.com/merging-props
   */
  merge<T>(callback: () => MaybePromise<T>) {
    return new MergeProp(callback);
  }

  /**
   * Create an always prop
   *
   * Always props are resolved on every request, no matter if it's a partial
   * request or not.
   *
   * See https://inertiajs.com/partial-reloads#lazy-data-evaluation
   */
  always<T>(callback: () => MaybePromise<T>) {
    return new AlwaysProp(callback);
  }

  /**
   * Create a deferred prop
   *
   * Deferred props feature allows you to defer the loading of certain
   * page data until after the initial page render.
   *
   * See https://v2.inertiajs.com/deferred-props
   */
  defer<T>(callback: () => MaybePromise<T>, group = "default") {
    return new DeferProp(callback, group);
  }

  /**
   * This method can be used to redirect the user to an external website
   * or even a non-inertia route of your application.
   *
   * See https://inertiajs.com/redirects#external-redirects
   */
  location(url: string) {
    url = encodeURI(url);
    this.adapter.setHeader(InertiaHeaders.Location, url);
    this.adapter.setStatus(409);
  }

  redirect(statusOrUrl: number | string, url?: string) {
    let status = 302;
    let location = "";

    if (typeof statusOrUrl === "number") {
      status = statusOrUrl;
      location = url ?? "";
    } else {
      location = statusOrUrl;
    }

    if (!location) {
      throw new Error("Redirect URL is required");
    }

    const method = this.adapter.getMethod() || "HEAD";
    if (status === 302 && ["PUT", "PATCH", "DELETE"].includes(method)) {
      status = 303;
    }

    this.adapter.setHeader("Vary", InertiaHeaders.Inertia);
    this.adapter.redirect(status, location);
  }
}
