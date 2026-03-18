import { Hono } from 'hono';
import MarkdownIt from 'markdown-it';
import { registerAuthRoutes } from './routes/auth';
import { registerCollectionRoutes } from './routes/collections';
import { registerInstructionRoutes } from './routes/instructions';
import { registerPageRoutes } from './routes/pages';

const app = new Hono();
const markdown = new MarkdownIt({
	html: false,
	linkify: true,
	breaks: true,
});

registerAuthRoutes(app);
registerInstructionRoutes(app);
registerCollectionRoutes(app, {
	renderMarkdown: (value) => markdown.render(value),
	renderInlineMarkdown: (value) => markdown.renderInline(value),
});
registerPageRoutes(app);

export default app;
