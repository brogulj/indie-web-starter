import { buildBackendUrl, fetchBackend, type BackendRequestOptions } from './backend';

const REQUEST_TIMEOUT_MS = Number(process.env.SONIC_TIMEOUT_MS ?? '8000');

export type AuthUser = {
	id: string;
	email: string;
	username: string;
	firstName?: string;
	lastName?: string;
	role: string;
};

type LoginResponse = {
	user: AuthUser;
	token: string;
};

type MeResponse = {
	user: AuthUser;
};

export class AuthApiError extends Error {
	readonly status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = 'AuthApiError';
		this.status = status;
	}
}

const buildAuthUrl = (path: string, apiBaseUrl?: string): string => {
	return buildBackendUrl(path, { apiBaseUrl });
};

const fetchJson = async <T>(url: string, init: RequestInit, options?: BackendRequestOptions): Promise<T> => {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

	try {
		const requestInit = {
			...init,
			signal: controller.signal,
		};
		const response = await fetchBackend(url, requestInit, options);

		if (!response.ok) {
			let message = 'Authentication request failed';
			try {
				const raw = await response.text();
				const data = (raw ? JSON.parse(raw) : {}) as { error?: string; message?: string; [key: string]: unknown };

				if (typeof data.error === 'string' && data.error.length > 0) {
					message = data.error;
				} else if (typeof data.message === 'string' && data.message.length > 0) {
					message = data.message;
				}
			} catch {
				// Ignore parsing errors and keep generic message.
			}
			throw new AuthApiError(message, response.status);
		}

		return (await response.json()) as T;
	} catch (error) {
		if (error instanceof AuthApiError) throw error;
		if (error instanceof Error && error.name === 'AbortError') {
			throw new AuthApiError(`Authentication request timed out after ${REQUEST_TIMEOUT_MS}ms`, 504);
		}
		throw new AuthApiError('Authentication request failed due to a network error', 502);
	} finally {
		clearTimeout(timeoutId);
	}
};

type AuthRequestOptions = BackendRequestOptions;

export const authLogin = async (email: string, password: string, options?: AuthRequestOptions): Promise<LoginResponse> => {
	const apiBaseUrl = options?.apiBaseUrl;
	const url = buildAuthUrl('/auth/login', apiBaseUrl);
	return fetchJson<LoginResponse>(url, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
		},
		body: JSON.stringify({ email, password }),
	}, options);
};

export const authGetCurrentUser = async (token: string, options?: AuthRequestOptions): Promise<AuthUser> => {
	const apiBaseUrl = options?.apiBaseUrl;
	const url = buildAuthUrl('/auth/me', apiBaseUrl);
	const response = await fetchJson<MeResponse>(url, {
		method: 'GET',
		headers: {
			authorization: `Bearer ${token}`,
		},
	}, options);
	return response.user;
};
