import type { CollectionConfig } from "@sonicjs-cms/core";

export default {
  name: "following-sources",
  displayName: "Following Sources",
  description: "Sites or feeds followed for dashboard aggregation",
  icon: "📰",
  schema: {
    type: "object",
    properties: {
      siteUrl: {
        type: "string",
        title: "Site URL",
        required: true,
      },
      feedUrl: {
        type: "string",
        title: "Feed URL",
      },
      active: {
        type: "boolean",
        title: "Active",
        default: true,
      },
      notes: {
        type: "textarea",
        title: "Notes",
      },
      lastCheckedAt: {
        type: "datetime",
        title: "Last Checked At",
      },
      lastError: {
        type: "textarea",
        title: "Last Error",
      },
    },
    required: ["title", "slug", "siteUrl", "active"],
  },
  listFields: ["title", "active", "updatedAt"],
  searchFields: ["title", "siteUrl", "feedUrl", "notes"],
  defaultSort: "updatedAt",
  defaultSortOrder: "desc",
} satisfies CollectionConfig;
