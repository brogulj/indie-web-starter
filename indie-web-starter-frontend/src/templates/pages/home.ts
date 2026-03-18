export const homeTemplate = /* html */ `
<section class="space-y-6">
  <header class="border border-gray-300 bg-gray-50 p-4">
    <h1 class="text-2xl font-semibold">Welcome</h1>
    <p class="mt-2 text-sm text-gray-700">This is a clean starter homepage.</p>
  </header>

  <section class="border border-gray-300 p-4">
    <h2 class="text-xl font-semibold">Recent Stories</h2>
    <ul class="mt-3 space-y-2">
      {{#collections.blog-posts}}
      <li class="border border-gray-200 p-3">
        <a href="/blog-posts/{{slug}}" class="font-medium underline">{{title}}</a>
        <p class="mt-1 text-sm text-gray-700">{{data.excerpt}}</p>
      </li>
      {{/collections.blog-posts}}
      {{^collections.blog-posts}}
      <li class="border border-gray-200 p-3 text-sm text-gray-700">No stories available.</li>
      {{/collections.blog-posts}}
    </ul>
  </section>
</section>
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
