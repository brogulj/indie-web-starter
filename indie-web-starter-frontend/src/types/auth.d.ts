import type { AuthUser } from '../utils/auth';

declare module 'hono' {
	interface ContextVariableMap {
		authUser: AuthUser;
		isAuthenticated: boolean;
	}
}
