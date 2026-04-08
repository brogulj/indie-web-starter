/**
 * Posts Collection
 *
 * Social-style posts inspired by Instagram/Twitter.
 */

import type { CollectionConfig } from "@sonicjs-cms/core";

export default {
  name: "posts",
  displayName: "Posts",
  description: "Manage short-form social posts with media and engagement",
  icon: "📱",

  schema: {
    type: "object",
    properties: {
      caption: {
        type: "textarea",
        title: "Caption / Text",
        required: true,
        maxLength: 2200,
        helpText: "Post copy with hashtags and mentions if needed",
      },
      media: {
        type: "media",
        title: "Media",
        multiple: true,
      } as any,
    },
    required: ["title", "slug", "caption"],
  },

  listFields: ["title", "status", "publishedAt"],
  searchFields: ["title", "caption", "hashtags", "mentions", "location"],
  defaultSort: "createdAt",
  defaultSortOrder: "desc",
} satisfies CollectionConfig;
