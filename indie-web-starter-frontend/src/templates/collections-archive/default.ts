export const defaultCollectionArchiveTemplate = /* html */ `
<section class="space-y-4">
  <header class="border border-gray-300 p-4">
    <h1 class="text-2xl font-semibold">{{collection}}</h1>
    <p class="mt-1 text-sm text-gray-700">Archive</p>
  </header>

  <ul class="space-y-2">
    {{#items}}
    <li class="border border-gray-200 p-3">
      <a class="underline" href="/{{collection}}/{{slug}}">{{title}}</a>
      <p class="mt-1 text-sm text-gray-600">{{status}}</p>
    </li>
    {{/items}}
    {{^items}}
    <li class="border border-gray-200 p-3 text-sm text-gray-700">No entries found.</li>
    {{/items}}
  </ul>
</section>
`;
