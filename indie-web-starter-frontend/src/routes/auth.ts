import type { Context, Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { render } from '../render';
import { resolveBaseCollections } from '../services/required-collections';
import type { AuthUser } from '../utils/auth';
import { AuthApiError, authGetCurrentUser, authLogin } from '../utils/auth';

const AUTH_COOKIE_NAME = 'auth_token';

const loginTemplate = /* html */ `
<main class="mx-auto grid w-full max-w-xl gap-4">
  <section class="border-4 border-stone-900 bg-amber-50 p-5 shadow-[8px_8px_0_0_#1c1917]">
    <p class="inline-block border-2 border-stone-900 bg-rose-200 px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.16em]">
      Protected Access
    </p>
    <h1 class="mt-3 font-['Courier_New',ui-monospace,monospace] text-3xl font-black uppercase text-stone-900">
      Sign In
    </h1>
    <p class="mt-2 font-serif text-stone-700">Use your backend account to access protected frontend routes.</p>

    {{#authError}}
    <p class="mt-4 border-2 border-red-900 bg-red-100 px-3 py-2 font-mono text-xs font-bold uppercase tracking-[0.12em] text-red-900">{{authError}}</p>
    {{/authError}}

    <form method="post" action="/login{{#redirectTarget}}?redirect={{redirectTarget}}{{/redirectTarget}}" class="mt-5 space-y-3">
      <label class="block">
        <span class="mb-1 block font-mono text-xs font-bold uppercase tracking-[0.12em] text-stone-800">Email</span>
        <input name="email" type="email" required value="{{email}}" class="w-full border-2 border-stone-900 bg-white px-3 py-2 font-mono text-sm text-stone-900" />
      </label>

      <label class="block">
        <span class="mb-1 block font-mono text-xs font-bold uppercase tracking-[0.12em] text-stone-800">Password</span>
        <input name="password" type="password" required class="w-full border-2 border-stone-900 bg-white px-3 py-2 font-mono text-sm text-stone-900" />
      </label>

      <button type="submit" class="inline-block border-2 border-stone-900 bg-amber-200 px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.14em] text-stone-900 hover:bg-amber-300">
        Login
      </button>
    </form>
  </section>
</main>
`;

const dashboardTemplate = /* html */ `
<main class="mx-auto grid w-full max-w-4xl gap-4">
  <section class="border-4 border-stone-900 bg-amber-50 p-5 shadow-[8px_8px_0_0_#1c1917]">
    <p class="inline-block border-2 border-stone-900 bg-cyan-200 px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.16em]">
      Protected Route
    </p>
    <h1 class="mt-3 font-['Courier_New',ui-monospace,monospace] text-3xl font-black uppercase text-stone-900">
      Dashboard
    </h1>
    <p class="mt-2 font-serif text-stone-700">This route is only available when JWT auth succeeds against the backend.</p>

    <dl class="mt-4 grid gap-2 sm:grid-cols-2">
      <div class="border-2 border-stone-900 bg-white px-3 py-2"><dt class="font-mono text-xs font-bold uppercase">Email</dt><dd class="font-mono text-sm">{{user.email}}</dd></div>
      <div class="border-2 border-stone-900 bg-white px-3 py-2"><dt class="font-mono text-xs font-bold uppercase">Role</dt><dd class="font-mono text-sm">{{user.role}}</dd></div>
      <div class="border-2 border-stone-900 bg-white px-3 py-2"><dt class="font-mono text-xs font-bold uppercase">Username</dt><dd class="font-mono text-sm">{{user.username}}</dd></div>
      <div class="border-2 border-stone-900 bg-white px-3 py-2"><dt class="font-mono text-xs font-bold uppercase">Name</dt><dd class="font-mono text-sm">{{user.firstName}} {{user.lastName}}</dd></div>
    </dl>
  </section>
</main>
`;

const isSafeRedirectPath = (value: string | undefined): value is string => {
	if (!value) return false;
	if (!value.startsWith('/')) return false;
	return !value.startsWith('//');
};

const getRedirectTarget = (c: Context): string | undefined => {
	const redirectTarget = c.req.query('redirect');
	return isSafeRedirectPath(redirectTarget) ? redirectTarget : undefined;
};

const getToken = (c: Context): string | undefined => {
	return getCookie(c, AUTH_COOKIE_NAME);
};

const shouldUseSecureCookie = (url: string): boolean => {
	try {
		const parsed = new URL(url);
		if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
			return false;
		}
		return parsed.protocol === 'https:';
	} catch {
		return false;
	}
};

const setTokenCookie = (c: Context, token: string): void => {
	setCookie(c, AUTH_COOKIE_NAME, token, {
		httpOnly: true,
		secure: shouldUseSecureCookie(c.req.url),
		sameSite: 'Lax',
		path: '/',
		maxAge: 60 * 60 * 24,
	});
};

const clearTokenCookie = (c: Context): void => {
	deleteCookie(c, AUTH_COOKIE_NAME, {
		path: '/',
	});
};

export type AuthViewData = {
	isAuthenticated: boolean;
	authUser?: AuthUser;
};

export const resolveAuthState = async (c: Context): Promise<AuthViewData> => {
	const cachedState = c.get('isAuthenticated');
	const cachedUser = c.get('authUser');
	if (cachedState && cachedUser) {
		return { isAuthenticated: true, authUser: cachedUser };
	}

	const token = getToken(c);
	if (!token) {
		c.set('isAuthenticated', false);
		return { isAuthenticated: false };
	}

	try {
		const user = await authGetCurrentUser(token);
		c.set('authUser', user);
		c.set('isAuthenticated', true);
		return { isAuthenticated: true, authUser: user };
	} catch (error) {
		if (error instanceof AuthApiError && (error.status === 401 || error.status === 403)) {
			clearTokenCookie(c);
		}
		c.set('isAuthenticated', false);
		return { isAuthenticated: false };
	}
};

export const requireAuth = async (c: Context, next: () => Promise<void>): Promise<Response | void> => {
	const authState = await resolveAuthState(c);
	if (!authState.isAuthenticated) {
		const currentPath = c.req.path;
		return c.redirect(`/login?redirect=${encodeURIComponent(currentPath)}`);
	}
	await next();
};

export const registerAuthRoutes = (app: Hono): void => {
	app.get('/login', async (c) => {
		const authState = await resolveAuthState(c);
		if (authState.isAuthenticated) {
			const redirectTarget = getRedirectTarget(c) ?? '/dashboard';
			return c.redirect(redirectTarget);
		}

		const errorFromQuery = c.req.query('error');
		const redirectTarget = getRedirectTarget(c);
		const baseCollections = await resolveBaseCollections();
		return c.html(
			render(loginTemplate, {
				title: 'Login',
				authError: errorFromQuery,
				redirectTarget,
				email: '',
				collections: baseCollections,
			}),
		);
	});

	app.post('/login', async (c) => {
		const redirectTarget = getRedirectTarget(c) ?? '/dashboard';
		const formData = await c.req.formData();
		const email = String(formData.get('email') ?? '').trim();
		const password = String(formData.get('password') ?? '');

		if (!email || !password) {
			const baseCollections = await resolveBaseCollections();
			return c.html(
				render(loginTemplate, {
					title: 'Login',
					authError: 'Email and password are required.',
					redirectTarget,
					email,
					collections: baseCollections,
				}),
				400,
			);
		}

		try {
			const { token } = await authLogin(email, password);
			setTokenCookie(c, token);
			return c.redirect(redirectTarget);
		} catch (error) {
			const authError = error instanceof AuthApiError ? error.message : 'Login failed';
			const baseCollections = await resolveBaseCollections();
			return c.html(
				render(loginTemplate, {
					title: 'Login',
					authError,
					redirectTarget,
					email,
					collections: baseCollections,
				}),
				401,
			);
		}
	});

	app.get('/logout', (c) => {
		clearTokenCookie(c);
		return c.redirect('/login');
	});

	app.post('/logout', (c) => {
		clearTokenCookie(c);
		return c.redirect('/login');
	});

	app.get('/dashboard', requireAuth, (c) => {
		const user = c.get('authUser') as { email: string; role: string; username: string; firstName?: string; lastName?: string };
		return resolveBaseCollections().then((baseCollections) =>
			c.html(
				render(dashboardTemplate, {
					title: 'Dashboard',
					isAuthenticated: true,
					authUser: user,
					user,
					collections: baseCollections,
				}),
			),
		);
	});
};
