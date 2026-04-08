/**
 * Events Collection
 *
 * Store event write-ups with numeric ratings and image attachments.
 */

import type { CollectionConfig } from "@sonicjs-cms/core";

export default {
  name: "events",
  displayName: "Events",
  description: "Manage event reviews, ratings, and image galleries",
  icon: "🎟️",

  schema: {
    type: "object",
    properties: {
      content: {
        type: "richtext",
        title: "Write-up",
        required: true,
      },
      rating: {
        type: "number",
        title: "Rating (out of 10)",
        required: true,
        min: 1,
        max: 10,
      },
      featuredImage: {
        type: "media",
        title: "Featured Image",
      },
      galleryImages: {
        type: "media",
        title: "Gallery Images",
        multiple: true,
      } as any,
      eventDate: {
        type: "datetime",
        title: "Event Date",
      },
      location: {
        type: "string",
        title: "Location",
        maxLength: 200,
      },
      outfit: {
        type: "reference",
        title: "Outfit",
        collection: "outfits",
        helpText: "Link this event to an outfit.",
      },
    },
    required: ["title", "slug", "content", "rating"],
  },

  listFields: ["title", "rating", "status", "eventDate"],
  searchFields: ["title", "content", "location"],
  defaultSort: "createdAt",
  defaultSortOrder: "desc",
} satisfies CollectionConfig;
