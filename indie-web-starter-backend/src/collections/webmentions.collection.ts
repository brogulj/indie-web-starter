import type { CollectionConfig } from "@sonicjs-cms/core";

export default {
  name: "webmentions",
  displayName: "Webmentions",
  description: "Inbound webmentions for likes, replies, reposts, and mentions",
  icon: "💬",
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
      targetCollection: {
        type: "string",
        title: "Target Collection",
        required: true,
      },
      targetSlug: {
        type: "string",
        title: "Target Slug",
        required: true,
      },
      sourceDomain: {
        type: "string",
        title: "Source Domain",
        required: true,
      },
      mentionType: {
        type: "select",
        title: "Mention Type",
        enum: ["like", "reply", "repost", "mention"],
        enumLabels: ["Like", "Reply", "Repost", "Mention"],
        default: "mention",
      },
      authorName: {
        type: "string",
        title: "Author Name",
      },
      authorUrl: {
        type: "string",
        title: "Author URL",
      },
      authorPhoto: {
        type: "string",
        title: "Author Photo",
      },
      contentHtml: {
        type: "richtext",
        title: "Content HTML",
      },
      contentText: {
        type: "textarea",
        title: "Content Text",
      },
      publishedAt: {
        type: "datetime",
        title: "Published At",
      },
      status: {
        type: "select",
        title: "Status",
        enum: ["pending", "approved", "rejected", "spam"],
        enumLabels: ["Pending", "Approved", "Rejected", "Spam"],
        default: "pending",
      },
      isVerified: {
        type: "boolean",
        title: "Verified",
        default: false,
      },
      verificationCheckedAt: {
        type: "datetime",
        title: "Verification Checked At",
      },
      rawMf2: {
        type: "textarea",
        title: "Raw Microformats Data",
      },
      dedupeKey: {
        type: "string",
        title: "Dedupe Key",
        required: true,
      },
    },
    required: [
      "title",
      "slug",
      "sourceUrl",
      "targetUrl",
      "targetCollection",
      "targetSlug",
      "sourceDomain",
      "mentionType",
      "status",
      "isVerified",
      "dedupeKey",
    ],
  },
  listFields: ["title", "mentionType", "status", "sourceDomain", "updatedAt"],
  searchFields: ["sourceUrl", "targetUrl", "sourceDomain", "authorName", "contentText", "dedupeKey"],
  defaultSort: "updatedAt",
  defaultSortOrder: "desc",
} satisfies CollectionConfig;
