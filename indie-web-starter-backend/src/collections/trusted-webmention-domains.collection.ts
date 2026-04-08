import type { CollectionConfig } from "@sonicjs-cms/core";

export default {
  name: "trusted-webmention-domains",
  displayName: "Trusted Webmention Domains",
  description: "Domains that are auto-approved for future webmentions",
  icon: "✅",
  schema: {
    type: "object",
    properties: {
      domain: {
        type: "string",
        title: "Domain",
        required: true,
      },
      active: {
        type: "boolean",
        title: "Active",
        default: true,
      },
      firstApprovedAt: {
        type: "datetime",
        title: "First Approved At",
      },
      lastSeenAt: {
        type: "datetime",
        title: "Last Seen At",
      },
      notes: {
        type: "textarea",
        title: "Notes",
      },
    },
    required: ["title", "slug", "domain", "active"],
  },
  listFields: ["domain", "active", "updatedAt"],
  searchFields: ["domain", "notes"],
  defaultSort: "updatedAt",
  defaultSortOrder: "desc",
} satisfies CollectionConfig;
