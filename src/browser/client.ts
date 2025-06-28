import type { Client, Options, RequestResult } from '@hey-api/client-fetch';

import { patchRequestOptionsForFileUpload } from './uploads.js';

type OpenApiRequest = Client['request'];
type OpenApiWrapperFn = <T extends OpenApiRequest>(options: Parameters<T>[0], fn: T) => RequestResult;

type IHeaders = Record<string, string | null | undefined>;
export interface OpenApiClientOptions {
    wrapper?: OpenApiWrapperFn;
    headers?: IHeaders | (() => IHeaders) | (() => Promise<IHeaders>);
    onError?: (err: Error, options: Options) => Error | null | void;
}

export type OpenApiResponse<T> = {
    data: T | undefined;
};
export type OpenApiDataType<T> = T extends OpenApiResponse<infer U> ? NonNullable<U> : never;

export function dataFrom<T>(response: OpenApiResponse<T>): T {
    return response.data!;
}

export async function dataFromAsync<T>(promise: Promise<OpenApiResponse<T>>): Promise<T> {
    return (await promise).data!;
}

export class OpenApiError extends Error {
    constructor(
        message: string,
        public readonly request: Request,
        public readonly response: Response,
        public readonly body: unknown
    ) {
        super(message);
    }
}

export function configureOpenApiClient(client: Client, options: OpenApiClientOptions) {
    client.setConfig({
        throwOnError: true
    });

    client.interceptors.error.use((body, response, request, opts) => {
        const message = getMessageFromBody(body, response);
        const err = new OpenApiError(message, request, response, body);

        if (options.onError) {
            const handlerResult = options.onError(err, opts);
            if (handlerResult instanceof Error) {
                throw handlerResult;
            }
            if (handlerResult === null) {
                return new Promise(() => {}); // hang indefinitely
            }
        }

        throw err;
    });

    if (options.headers) {
        client.interceptors.request.use(async request => {
            const headers = typeof options.headers === 'function' ? await options.headers() : options.headers;
            if (headers) {
                for (const [key, value] of Object.entries(headers)) {
                    if (value === null) {
                        request.headers.delete(key);
                    } else if (value !== undefined) {
                        request.headers.set(key, value as string);
                    }
                }
            }
            return request;
        });
    }

    const wrapper = options.wrapper ?? ((options, fn) => fn(options));

    const originalRequest = client.request;
    type IRequest = typeof originalRequest;
    type IRequestOptions = Parameters<IRequest>[0];
    const request = ((options: IRequestOptions) => {
        options = patchRequestOptionsForFileUpload(options);
        return wrapper(options, originalRequest);
    }) as IRequest;
    client.request = request;

    client.connect = options => request({ ...options, method: 'CONNECT' });
    client.delete = options => request({ ...options, method: 'DELETE' });
    client.get = options => request({ ...options, method: 'GET' });
    client.head = options => request({ ...options, method: 'HEAD' });
    client.options = options => request({ ...options, method: 'OPTIONS' });
    client.patch = options => request({ ...options, method: 'PATCH' });
    client.post = options => request({ ...options, method: 'POST' });
    client.put = options => request({ ...options, method: 'PUT' });
    client.trace = options => request({ ...options, method: 'TRACE' });
}

function getMessageFromBody(body: unknown, response: Response): string {
    if (body && typeof body === 'object') {
        if ('error' in body && typeof body.error === 'string') {
            return `${body.error} (${response.status})`;
        }
        return JSON.stringify(body);
    }
    return String(body);
}
