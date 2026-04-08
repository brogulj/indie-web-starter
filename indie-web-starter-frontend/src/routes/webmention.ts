import type { Hono } from 'hono';
import { fetchBackend, resolveBackendRequestOptions, type BackendRequestOptions } from '../utils/backend';

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_SOURCE = 10;

const sourceRateLimits = new Map<string, { count: number; resetAt: number }>();

const normalizeUrl = (value: string): string => {
	const parsed = new URL(value);
	parsed.hash = '';
	parsed.hostname = parsed.hostname.toLowerCase();
	if ((parsed.protocol === 'http:' && parsed.port === '80') || (parsed.protocol === 'https:' && parsed.port === '443')) {
		parsed.port = '';
	}
	if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
		parsed.pathname = parsed.pathname.slice(0, -1);
	}
	return parsed.toString();
};

const logWebmention = (event: string, details: Record<string, unknown>): void => {
	console.log(`[webmention] ${event}`, JSON.stringify(details));
};

const allowSource = (sourceHost: string): boolean => {
	const now = Date.now();
	const current = sourceRateLimits.get(sourceHost);
	if (!current || current.resetAt <= now) {
		sourceRateLimits.set(sourceHost, { count: 1, resetAt: now + WINDOW_MS });
		return true;
	}
	if (current.count >= MAX_REQUESTS_PER_SOURCE) {
		return false;
	}
	current.count += 1;
	return true;
};

const parseTargetPath = (targetUrl: string): { collection: string; slug: string } | null => {
	const parsed = new URL(targetUrl);
	const segments = parsed.pathname.split('/').filter(Boolean);
	if (segments.length !== 2) return null;
	return { collection: decodeURIComponent(segments[0]), slug: decodeURIComponent(segments[1]) };
};

const toHostname = (value: string): string => {
	const trimmed = value.trim();
	if (!trimmed) return '';
	try {
		return new URL(trimmed).hostname.toLowerCase();
	} catch {
		const hostCandidate = trimmed
			.replace(/^[a-z]+:\/\//i, '')
			.split('/')[0]
			.split(':')[0]
			.trim()
			.toLowerCase();
		return hostCandidate;
	}
};

const getAllowedTargetHosts = (raw: string | undefined): Set<string> => {
	const hosts = (raw ?? '')
		.split(',')
		.map((entry) => toHostname(entry))
		.filter(Boolean);
	return new Set(hosts);
};

const getDefaultSiteHosts = (requestUrl: string, env: Record<string, string | undefined>): Set<string> => {
	const hosts = new Set<string>();
	const requestHost = toHostname(requestUrl);
	if (requestHost) hosts.add(requestHost);

	const siteHostCandidates = [
		env.SITE_URL,
		process.env.SITE_URL,
		env.SITE_AUTHOR_URL,
		process.env.SITE_AUTHOR_URL,
		env.PUBLIC_SITE_URL,
		process.env.PUBLIC_SITE_URL,
	];
	for (const candidate of siteHostCandidates) {
		const host = candidate ? toHostname(candidate) : '';
		if (host) hosts.add(host);
	}
	return hosts;
};

const isPrivateIpv4 = (value: string): boolean => {
	const octets = value.split('.').map((segment) => Number.parseInt(segment, 10));
	if (octets.length !== 4 || octets.some((part) => Number.isNaN(part) || part < 0 || part > 255)) return false;
	if (octets[0] === 10) return true;
	if (octets[0] === 127) return true;
	if (octets[0] === 169 && octets[1] === 254) return true;
	if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true;
	if (octets[0] === 192 && octets[1] === 168) return true;
	if (octets[0] === 0) return true;
	return false;
};

const toIpv6Literal = (host: string): string | null => {
	const unwrapped = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
	if (!unwrapped.includes(':')) return null;
	if (!/^[0-9a-f:.]+$/i.test(unwrapped)) return null;
	return unwrapped.toLowerCase();
};

const isDisallowedSourceHost = (host: string): boolean => {
	const normalized = host.trim().toLowerCase();
	if (!normalized) return true;
	if (normalized === 'localhost' || normalized === '::1' || normalized === '[::1]') return true;
	if (normalized.endsWith('.localhost') || normalized.endsWith('.local')) return true;
	if (normalized.endsWith('.internal') || normalized.endsWith('.home.arpa')) return true;
	if (isPrivateIpv4(normalized)) return true;
	const ipv6 = toIpv6Literal(normalized);
	if (ipv6?.startsWith('fc') || ipv6?.startsWith('fd')) return true;
	if (ipv6?.startsWith('fe8') || ipv6?.startsWith('fe9') || ipv6?.startsWith('fea') || ipv6?.startsWith('feb')) {
		return true;
	}
	return false;
};

const resolveBackendIngestEndpoint = (env: Record<string, string | undefined>, options?: BackendRequestOptions): string => {
	const explicit = env.WEBMENTION_ENDPOINT_URL ?? process.env.WEBMENTION_ENDPOINT_URL;
	if (explicit) return explicit;
	const apiBase = options?.apiBaseUrl ?? process.env.API_URL ?? 'http://localhost:8788';
	return new URL('/api/webmentions/ingest', apiBase).toString();
};

const forwardToBackendIngest = async (
	sourceUrl: string,
	targetUrl: string,
	env: Record<string, string | undefined>,
	options?: BackendRequestOptions
): Promise<{ status: number; error?: string }> => {
	const sharedSecret = env.WEBMENTION_SHARED_SECRET ?? process.env.WEBMENTION_SHARED_SECRET;
	if (!sharedSecret) {
		return { status: 500, error: 'Webmention receiver is missing a valid API token for content writes.' };
	}

	const endpoint = resolveBackendIngestEndpoint(env, options);
	const response = await fetchBackend(endpoint, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			authorization: `Bearer ${sharedSecret}`,
		},
		body: JSON.stringify({ source: sourceUrl, target: targetUrl }),
	}, options);

	if (response.status === 202) return { status: 202 };
	if (response.status === 400 || response.status === 401 || response.status === 403 || response.status === 422 || response.status === 429 || response.status === 500) {
		const payload = await response.json().catch(() => null);
		const error = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string' ? payload.error : 'Webmention rejected.';
		return { status: response.status, error };
	}
	return { status: 502, error: 'Webmention could not be processed.' };
};

export const registerWebmentionRoutes = (app: Hono): void => {
	app.get('/webmention', async (c) => {
		const endpoint = new URL('/webmention', c.req.url).toString();
		return c.html(`<!doctype html>
	<html lang="en">
	<head><meta charset="utf-8"><title>Webmention Endpoint</title></head>
	<body>
	<h1>Webmention endpoint</h1>
	<p>Send webmentions via HTTP POST with form fields <code>source</code> and <code>target</code>.</p>
	<p>Endpoint: <code>${endpoint}</code></p>
	</body>
	</html>`);
	});

	app.post('/webmention', async (c) => {
		const env = c.env as Record<string, string | undefined>;
		const backendOptions = resolveBackendRequestOptions(c);
		const formData = await c.req.formData();
		const sourceValue = String(formData.get('source') ?? '').trim();
		const targetValue = String(formData.get('target') ?? '').trim();
		logWebmention('request_received', {
			source: sourceValue || null,
			target: targetValue || null,
			requestUrl: c.req.url,
		});

		if (!sourceValue || !targetValue) {
			logWebmention('reject_missing_source_or_target', { source: sourceValue || null, target: targetValue || null });
			return c.text('Both source and target are required.', 400);
		}

		let sourceUrl: string;
		let targetUrl: string;
		try {
			sourceUrl = normalizeUrl(sourceValue);
			targetUrl = normalizeUrl(targetValue);
		} catch {
			logWebmention('reject_invalid_url', { source: sourceValue, target: targetValue });
			return c.text('Invalid source or target URL.', 422);
		}

		if (!sourceUrl.startsWith('http://') && !sourceUrl.startsWith('https://')) {
			logWebmention('reject_source_protocol', { sourceUrl });
			return c.text('Source must use http(s).', 422);
		}
		if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
			logWebmention('reject_target_protocol', { targetUrl });
			return c.text('Target must use http(s).', 422);
		}

		const configuredAllowedHosts = getAllowedTargetHosts(env.WEBMENTION_ALLOWED_HOSTS ?? process.env.WEBMENTION_ALLOWED_HOSTS);
		const allowedHosts = configuredAllowedHosts.size > 0 ? configuredAllowedHosts : getDefaultSiteHosts(c.req.url, env);
		const sourceHost = new URL(sourceUrl).hostname.toLowerCase();
		const targetHost = new URL(targetUrl).hostname.toLowerCase();
		if (isDisallowedSourceHost(sourceHost) && sourceHost !== targetHost) {
			logWebmention('reject_source_host_not_allowed', { sourceHost, targetHost });
			return c.text('Source host is not allowed.', 403);
		}
		if (!allowSource(sourceHost)) {
			logWebmention('reject_rate_limit', { sourceHost });
			return c.text('Too many requests from this source.', 429);
		}
		if (!allowedHosts.has(targetHost)) {
			logWebmention('reject_target_host_not_allowed', {
				targetHost,
				allowedHosts: Array.from(allowedHosts),
			});
			return c.text('Target host is not allowed.', 403);
		}

		const targetPath = parseTargetPath(targetUrl);
		if (!targetPath) {
			logWebmention('reject_target_path_shape', { targetUrl });
			return c.text('Target must match /:collection/:slug.', 422);
		}

		try {
			const forwarded = await forwardToBackendIngest(sourceUrl, targetUrl, env, backendOptions);
			if (forwarded.status === 202) {
				logWebmention('accepted_via_backend_ingest', {
					sourceUrl,
					targetUrl,
					targetCollection: targetPath.collection,
					targetSlug: targetPath.slug,
				});
				return c.body(null, 202);
			}
			logWebmention('reject_forward_to_backend_ingest_failed', {
				sourceUrl,
				targetUrl,
				status: forwarded.status,
				error: forwarded.error || null,
			});
			return c.text(forwarded.error || 'Webmention could not be processed.', forwarded.status as 400 | 401 | 403 | 422 | 429 | 500 | 502);
		} catch (error) {
			console.error('webmention ingest failed in frontend', error);
			logWebmention('reject_internal_error', {
				sourceUrl,
				targetUrl,
				error: error instanceof Error ? error.message : String(error),
			});
			return c.text('Webmention could not be processed.', 502);
		}
	});
};
