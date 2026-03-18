export const aboutTemplate = /* html */ `
<article class="space-y-4 border border-gray-300 p-4">
  <h1>About</h1>
  <p class="text-sm text-gray-700">Basic informational page.</p>

  <section>
    <h2 class="text-lg font-semibold">Recent Stories</h2>
    <ul class="mt-2 space-y-2">
      {{#collections.blog-posts}}
      <li class="border border-gray-200 p-3">
        <a href="/blog-posts/{{slug}}" class="underline">{{title}}</a>
      </li>
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
