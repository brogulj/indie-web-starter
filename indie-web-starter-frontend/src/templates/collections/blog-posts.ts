export const blogPostsTemplate = /* html */ `
<article class="space-y-4 border border-gray-300 p-4">
  <header>
    <h1 class="text-2xl font-semibold">{{{data.titleHtml}}}{{^data.titleHtml}}{{{titleHtml}}}{{^titleHtml}}{{data.title}}{{^data.title}}{{title}}{{/data.title}}{{/titleHtml}}{{/data.titleHtml}}</h1>
    <p class="mt-1 text-sm text-gray-600">/{{collection}}/{{slug}}</p>
  </header>

  <p class="text-sm text-gray-700">{{data.excerpt}}</p>

  <section class="prose max-w-none">
    {{{data.contentHtml}}}
  </section>

  <section class="border-t border-gray-200 pt-3">
    <h2 class="text-lg font-semibold">More Stories</h2>
    <ul class="mt-2 space-y-1">
      {{#collections.blog-posts}}
      <li><a class="underline" href="/blog-posts/{{slug}}">{{title}}</a></li>
      {{/collections.blog-posts}}
    </ul>
  </section>
</article>
`;

export const requiredData = {
	collections: [
		{
			name: 'blog-posts',
			limit: 10,
			sort: '-created_at',
		},
	],
};
