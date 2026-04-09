import type { CollectionConfig } from "@sonicjs-cms/core";

export default {
  name: "spotify-playlists",
  displayName: "Spotify Playlists",
  description: "Share curated Spotify playlists with embedded playback",
  icon: "🎧",

  schema: {
    type: "object",
    properties: {
      spotifyPlaylistId: {
        type: "string",
        title: "Spotify Playlist ID",
        required: true,
        helpText:
          "Use the value after /playlist/ in the Spotify URL (without query params).",
      },
      description: {
        type: "textarea",
        title: "Description",
        maxLength: 1200,
      },
      tags: {
        type: "string",
        title: "Tags",
        helpText: "Comma-separated tags (genre, mood, activity, etc.)",
      },
      featuredImage: {
        type: "media",
        title: "Cover Image",
      },
    },
    required: ["title", "slug", "spotifyPlaylistId"],
  },

  listFields: ["title", "spotifyPlaylistId", "status", "updatedAt"],
  searchFields: ["title", "description", "tags", "spotifyPlaylistId"],
  defaultSort: "updatedAt",
  defaultSortOrder: "desc",
} satisfies CollectionConfig;
