import type { CollectionConfig } from "@sonicjs-cms/core";

export default {
  name: "outbound-webmentions",
  displayName: "Outbound Webmentions",
  description: "Outgoing webmentions sent from followed feed actions",
  icon: "📤",
  schema: {
    type: "object",
    properties: {
      sourceUrl: {
        type: "string",
        title: "Source URL",
        required: true,
      },
      targetUrl: {
        type: "string",
        title: "Target URL",
        required: true,
      },
      targetDomain: {
        type: "string",
        title: "Target Domain",
        required: true,
      },
      targetTitle: {
        type: "string",
        title: "Target Title",
      },
      mentionType: {
        type: "select",
        title: "Mention Type",
        enum: ["like", "reply", "repost", "mention"],
        enumLabels: ["Like", "Reply", "Repost", "Mention"],
        default: "mention",
      },
      endpointUrl: {
        type: "string",
        title: "Endpoint URL",
      },
      deliveryStatus: {
        type: "select",
        title: "Delivery Status",
        enum: ["sent", "failed", "pending"],
        enumLabels: ["Sent", "Failed", "Pending"],
        default: "pending",
      },
      responseStatusCode: {
        type: "number",
        title: "Response Status Code",
      },
      sourceCollection: {
        type: "string",
        title: "Source Collection",
      },
      sourceSlug: {
        type: "string",
        title: "Source Slug",
      },
      attemptedAt: {
        type: "datetime",
        title: "Attempted At",
      },
      errorMessage: {
        type: "textarea",
        title: "Error Message",
      },
      commentText: {
        type: "textarea",
        title: "Comment Text",
      },
      mf2PropertyClass: {
        type: "string",
        title: "MF2 Property Class",
      },
    },
    required: ["title", "slug", "sourceUrl", "targetUrl", "targetDomain", "mentionType", "deliveryStatus"],
  },
  listFields: ["title", "deliveryStatus", "targetDomain", "updatedAt"],
  searchFields: ["sourceUrl", "targetUrl", "targetTitle", "targetDomain", "errorMessage"],
  defaultSort: "updatedAt",
  defaultSortOrder: "desc",
} satisfies CollectionConfig;
