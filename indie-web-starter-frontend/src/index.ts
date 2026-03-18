import { Hono } from 'hono';
import MarkdownIt from 'markdown-it';
import { registerCollectionRoutes } from './routes/collections';
import { registerInstructionRoutes } from './routes/instructions';
import { registerPageRoutes } from './routes/pages';

const app = new Hono();
const markdown = new MarkdownIt({
	html: false,
	linkify: true,
	breaks: true,
});

registerCollectionRoutes(app, {
	renderMarkdown: (value) => markdown.render(value),
});
registerInstructionRoutes(app);
registerPageRoutes(app);

export default app;
