export const NewsArchiveTemplate = /* html */ `
<section class="space-y-4">
  <header class="border border-gray-300 p-4">
    <h1 class="text-2xl font-semibold">News</h1>
  </header>

  <ul class="space-y-2">
    {{#items}}
    <li class="border border-gray-200 p-3">
      <a class="underline" href="/{{collection}}/{{slug}}">{{title}}</a>
    </li>
    {{/items}}
  </ul>
</section>
`;
