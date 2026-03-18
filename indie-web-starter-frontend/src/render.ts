import Mustache from 'mustache';
import { base } from './templates/base';

export function render(template: string, data: Record<string, unknown>): string {
	const content = Mustache.render(template, data);
	return Mustache.render(base(content), data);
}
