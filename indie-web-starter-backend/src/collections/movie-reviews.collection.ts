/**
 * Movie Reviews Collection
 *
 * Store movie reviews with film metadata and scoring.
 */

import type { CollectionConfig } from "@sonicjs-cms/core";

export default {
  name: "movie-reviews",
  displayName: "Movie Reviews",
  description: "Manage movie reviews and ratings",
  icon: "🎬",

  schema: {
    type: "object",
    properties: {
      director: {
        type: "string",
        title: "Director",
      },
      releaseYear: {
        type: "number",
        title: "Release Year",
        min: 1888,
      },
      genres: {
        type: "string",
        title: "Genres",
        helpText: "Comma-separated genres",
      },
      runtimeMinutes: {
        type: "number",
        title: "Runtime (minutes)",
        min: 1,
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
    required: ["title", "slug", "rating"],
  },

  listFields: [
    "title",
    "director",
    "releaseYear",
    "rating",
    "status",
    "publishedAt",
  ],
  searchFields: ["title", "director", "genres", "content"],
  defaultSort: "createdAt",
  defaultSortOrder: "desc",
} satisfies CollectionConfig;
