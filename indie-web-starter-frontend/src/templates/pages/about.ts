export const aboutTemplate = /* html */ `
<article class="">
  <h1>About</h1>
  <p>This is the about page.</p>
	{{#collections.blog-posts}}
	<h2>{{title}}</h2>
	<p>{{data.excerpt}}</p>
	{{/collections.blog-posts}}
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
