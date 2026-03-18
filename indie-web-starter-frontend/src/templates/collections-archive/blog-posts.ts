export const blogPostsArchiveTemplate = /* html */ `
<section class="space-y-4">
  <header class="border border-gray-300 p-4">
    <h1 class="text-2xl font-semibold">Blog Posts</h1>
  </header>

  <ul class="space-y-2">
    {{#items}}
    <li class="border border-gray-200 p-3">
      <a class="underline" href="/blog-posts/{{slug}}">{{title}}</a>
      <p class="mt-1 text-sm text-gray-600">{{excerpt}}</p>
    </li>
    {{/items}}
    {{^items}}
    <li class="border border-gray-200 p-3 text-sm text-gray-700">No posts available.</li>
    {{/items}}
  </ul>
</section>
`;
