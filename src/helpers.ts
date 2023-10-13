interface IRequestOptions {
    readonly method: 'GET' | 'PUT' | 'POST' | 'DELETE' | 'OPTIONS' | 'HEAD' | 'PATCH';
    readonly url: string;
    readonly path?: Record<string, any>;
    readonly cookies?: Record<string, any>;
    readonly headers?: Record<string, any>;
    readonly query?: Record<string, any>;
    readonly formData?: Record<string, any>;
    readonly body?: any;
    readonly mediaType?: string;
    readonly responseHeader?: string;
    readonly errors?: Record<number, string>;
}

interface IBaseHttpRequest {
    request<T>(options: IRequestOptions): ICancelablePromise<T>;
}

export interface IOpenApiClient {
    request: IBaseHttpRequest;
}

export interface IOpenApiError extends Error {
    status: number;
    statusText: string;
    body: any;
}

export declare class ICancelablePromise<T = any> {
    constructor(executor: (resolve: (value: any) => void, reject: (reason: any) => void, onCancel: (cancel: () => void) => void) => void);
    then<TResult1 = any, TResult2 = never>(
        onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null,
        onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
    ): Promise<TResult1 | TResult2>;
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): Promise<T | TResult>;
    finally(onfinally?: (() => void) | undefined | null): Promise<T>;
    cancel(): void;
}

interface IWrappedOpenApiClientOptions<P extends ICancelablePromise = ICancelablePromise, Arguments extends unknown[] = any[]> {
    apiClient: IOpenApiClient;
    wrapper?: (options: IRequestOptions, fn: (options: IRequestOptions) => P) => P;
    onRequest?: (options: IRequestOptions) => IRequestOptions;
    onError?: (err: Error, options: IRequestOptions) => Error | null | void;
    afterRequest?: (options: IRequestOptions) => void;
    CancelablePromise: new (...arguments_: Arguments) => P;
}

export function isOpenApiError(err: any): err is IOpenApiError {
    return err instanceof Error && 'status' in err && 'body' in err;
}

export function installOpenApiClientInterceptors({
    apiClient,
    wrapper,
    onRequest,
    onError,
    afterRequest,
    CancelablePromise
}: IWrappedOpenApiClientOptions) {
    const originalRequest = apiClient.request.request.bind(apiClient.request);
    const resolvedWrapper = wrapper ?? ((options, fn) => fn(options));
    apiClient.request.request = (options: IRequestOptions) => {
        return resolvedWrapper(options, options => {
            options = rewriteOptionsForFileUpload(options);

            if (onRequest) {
                options = onRequest(options);
            }

            return new CancelablePromise((resolve: (value: any) => void, reject: (err: any) => void, onCancel: (handler: () => void) => void) => {
                const promise = originalRequest(options);
                onCancel(promise.cancel);
                promise
                    .then(resolve)
                    .catch(err => {
                        if (isOpenApiError(err) && typeof err.body === 'object' && 'error' in err.body) {
                            err.message = `${err.body.error} (${err.status})`;
                        }
                        if (onError) {
                            const handlerResult = onError(err, options);
                            if (handlerResult === null) {
                                return;
                            }
                            if (handlerResult instanceof Error) {
                                return reject(handlerResult);
                            }
                        }
                        reject(err);
                    })
                    .finally(() => afterRequest?.(options));
            });
        });
    };
}

export class FileUploadRequest {
    constructor(blob: Blob) {
        this.blob = blob;
    }

    validator = null;
    lastModifiedDate = null;
    size = 0;
    path = '';
    name = '';
    type = '';
    blob!: Blob;
}

function rewriteOptionsForFileUpload(options: IRequestOptions): IRequestOptions {
    const hasFileUpload = typeof options.body === 'object' && Object.values(options.body).some(v => v instanceof FileUploadRequest);
    if (!hasFileUpload) return options;

    const formData: Record<string, any> = {};
    const jsonBody: Record<string, any> = {};
    for (const [key, value] of Object.entries(options.body)) {
        if (value instanceof FileUploadRequest) {
            formData[key] = value.blob;
        } else {
            jsonBody[key] = value;
        }
    }
    formData._payload = new Blob([JSON.stringify(jsonBody)], { type: 'application/json' });

    return {
        ...options,
        body: undefined,
        formData
    };
}
