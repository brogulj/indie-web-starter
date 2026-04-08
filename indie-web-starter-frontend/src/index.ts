import { Hono } from 'hono';
import MarkdownIt from 'markdown-it';
import { registerAuthRoutes } from './routes/auth';
import { registerCollectionRoutes } from './routes/collections';
import { registerContentEditorRoutes } from './routes/content-editor';
import { registerFeedRoutes } from './routes/feed';
import { registerInstructionRoutes } from './routes/instructions';
import { registerPageRoutes } from './routes/pages';
import { registerWebmentionRoutes } from './routes/webmention';

const app = new Hono();
const markdown = new MarkdownIt({
	html: false,
	linkify: true,
	breaks: true,
});

app.use('*', async (c, next) => {
	await next();
	const contentType = c.res.headers.get('content-type') ?? '';
	if (!contentType.includes('text/html')) return;

	const endpoint = new URL('/webmention', c.req.url).toString();
	c.res.headers.append('Link', `<${endpoint}>; rel="webmention"`);
});

registerWebmentionRoutes(app);
registerAuthRoutes(app);
registerContentEditorRoutes(app);
registerInstructionRoutes(app);
registerFeedRoutes(app);
registerCollectionRoutes(app, {
	renderMarkdown: (value) => markdown.render(value),
	renderInlineMarkdown: (value) => markdown.renderInline(value),
});
registerPageRoutes(app);

export default app;
