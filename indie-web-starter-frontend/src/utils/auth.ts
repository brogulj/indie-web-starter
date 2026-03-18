const API_BASE_URL = process.env.API_URL ?? 'http://localhost:8788';
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

const buildAuthUrl = (path: string): string => {
	return new URL(path, API_BASE_URL).toString();
};

const fetchJson = async <T>(url: string, init: RequestInit): Promise<T> => {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

	try {
		const response = await fetch(url, {
			...init,
			signal: controller.signal,
		});

		if (!response.ok) {
			let message = 'Authentication request failed';
			try {
				const data = (await response.json()) as { error?: string };
				if (typeof data.error === 'string' && data.error.length > 0) {
					message = data.error;
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

export const authLogin = async (email: string, password: string): Promise<LoginResponse> => {
	const url = buildAuthUrl('/auth/login');
	return fetchJson<LoginResponse>(url, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
		},
		body: JSON.stringify({ email, password }),
	});
};

export const authGetCurrentUser = async (token: string): Promise<AuthUser> => {
	const url = buildAuthUrl('/auth/me');
	const response = await fetchJson<MeResponse>(url, {
		method: 'GET',
		headers: {
			authorization: `Bearer ${token}`,
		},
	});
	return response.user;
};
