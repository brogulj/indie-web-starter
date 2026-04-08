import type { Context } from 'hono';

const DEFAULT_API_BASE_URL = process.env.API_URL ?? 'http://localhost:8788';

export type BackendService = {
	fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

export type BackendRequestOptions = {
	apiBaseUrl?: string;
	backendService?: BackendService;
};

export const resolveBackendRequestOptions = (c: Context): BackendRequestOptions => {
	const env = c.env as
		| {
				API_URL?: string;
				API_BACKEND?: BackendService;
		  }
		| undefined;
	return {
		apiBaseUrl: env?.API_URL ?? process.env.API_URL,
		backendService: env?.API_BACKEND,
	};
};

export const buildBackendUrl = (path: string, options?: BackendRequestOptions): string => {
	return new URL(path, options?.apiBaseUrl ?? DEFAULT_API_BASE_URL).toString();
};

const toServiceBindingUrl = (input: string): string => {
	const parsed = new URL(input);
	return new URL(`${parsed.pathname}${parsed.search}`, 'https://backend.internal').toString();
};

const getOrigin = (input: string): string | null => {
	try {
		return new URL(input).origin;
	} catch {
		return null;
	}
};

export const isBackendUrl = (absoluteUrl: string, options?: BackendRequestOptions): boolean => {
	const backendOrigin = getOrigin(options?.apiBaseUrl ?? DEFAULT_API_BASE_URL);
	const targetOrigin = getOrigin(absoluteUrl);
	return Boolean(backendOrigin && targetOrigin && backendOrigin === targetOrigin);
};

export const fetchBackend = async (
	pathOrUrl: string,
	init: RequestInit | undefined,
	options?: BackendRequestOptions
): Promise<Response> => {
	const absoluteUrl = pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://') ? pathOrUrl : buildBackendUrl(pathOrUrl, options);
	if (options?.backendService && isBackendUrl(absoluteUrl, options)) {
		return options.backendService.fetch(toServiceBindingUrl(absoluteUrl), init);
	}
	return fetch(absoluteUrl, init);
};
