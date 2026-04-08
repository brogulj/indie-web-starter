import { CollectionConfig } from "@sonicjs-cms/core";

export default {
  name: "outfits",
  displayName: "Outfits",
  description: "Manage your outfits",
  icon: "👔",
  schema: {
    type: "object",
    properties: {
      mainImage: {
        type: "media",
        title: "Main Image",
        required: true,
      },
      pieces: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              title: "Name",
            },
            image: {
              type: "media",
              title: "Image",
            },
            order: {
              type: "number",
              title: "Order (top to bottom ascending numbers)",
            },
          },
        },
      },
    },
    required: ["mainImage"],
  },
  listFields: ["title"],
  searchFields: ["title"],
  defaultSort: "createdAt",
  defaultSortOrder: "desc",
} satisfies CollectionConfig;
