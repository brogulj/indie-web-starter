/**
 * Music Reviews Collection
 *
 * Store album and single reviews with structured metadata and scoring.
 */

import type { CollectionConfig } from "@sonicjs-cms/core";

export default {
  name: "music-reviews",
  displayName: "Music Reviews",
  description: "Manage album and single reviews",
  icon: "🎵",

  schema: {
    type: "object",
    properties: {
      releaseType: {
        type: "select",
        title: "Release Type",
        enum: ["album", "single"],
        enumLabels: ["Album", "Single"],
        required: true,
      },
      artistName: {
        type: "string",
        title: "Artist Name",
        required: true,
      },
      releaseTitle: {
        type: "string",
        title: "Release Title",
        required: true,
      },
      content: {
        type: "richtext",
        title: "Review",
        required: false,
      },
      rating: {
        type: "number",
        title: "Rating (out of 10)",
        required: true,
        min: 0,
        max: 10,
      },
      label: {
        type: "string",
        title: "Label",
      },
      genres: {
        type: "string",
        title: "Genres",
        helpText: "Comma-separated genres",
      },
      releaseDate: {
        type: "datetime",
        title: "Release Date",
      },
      featuredImage: {
        type: "media",
        title: "Featured Image",
      },
      publishedAt: {
        type: "datetime",
        title: "Published Date",
      },
      status: {
        type: "select",
        title: "Status",
        enum: ["draft", "published", "archived"],
        enumLabels: ["Draft", "Published", "Archived"],
        default: "draft",
      },
    },
    required: [
      "title",
      "slug",
      "releaseType",
      "artistName",
      "releaseTitle",
      "rating",
    ],
  },

  listFields: [
    "title",
    "releaseType",
    "artistName",
    "rating",
    "status",
    "publishedAt",
  ],
  searchFields: [
    "title",
    "artistName",
    "releaseTitle",
    "label",
    "genres",
    "content",
  ],
  defaultSort: "createdAt",
  defaultSortOrder: "desc",
} satisfies CollectionConfig;
