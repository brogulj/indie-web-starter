/* eslint-disable */
// AUTO-GENERATED FILE. DO NOT EDIT.
// Generated from http://localhost:8788/api/collections

export const collectionFieldKindsMap = {
  "blog-posts": {
    "excerpt": "textarea",
    "content": "richtext",
    "featuredImage": "media",
    "author": "string",
    "tags": "string"
  },
  "events": {
    "content": "richtext",
    "rating": "number",
    "featuredImage": "media",
    "galleryImages": "media-array",
    "eventDate": "datetime",
    "location": "string",
    "outfit": "reference"
  },
  "movie-reviews": {
    "director": "string",
    "releaseYear": "number",
    "genres": "string",
    "runtimeMinutes": "number",
    "content": "richtext",
    "rating": "number",
    "featuredImage": "media"
  },
  "music-reviews": {
    "releaseType": "select",
    "artistName": "string",
    "releaseTitle": "string",
    "content": "richtext",
    "rating": "number",
    "label": "string",
    "genres": "string",
    "releaseDate": "datetime",
    "featuredImage": "media"
  },
  "news": {
    "title": "string",
    "content": "richtext",
    "publish_date": "date",
    "author": "string",
    "category": "string"
  },
  "outfits": {
    "mainImage": "media",
    "pieces": "object-array"
  },
  "pages": {
    "title": "string",
    "content": "richtext",
    "slug": "slug",
    "meta_description": "string",
    "featured_image": "media"
  },
  "posts": {
    "caption": "textarea",
    "media": "media-array"
  },
  "spotify-playlists": {
    "spotifyPlaylistId": "string",
    "description": "textarea",
    "tags": "string",
    "featuredImage": "media"
  }
} as const;

export const collectionRequiredFieldsMap = {
  "blog-posts": [
    "title",
    "slug",
    "content",
    "author"
  ],
  "events": [
    "title",
    "slug",
    "content",
    "rating"
  ],
  "movie-reviews": [
    "title",
    "slug",
    "rating"
  ],
  "music-reviews": [
    "title",
    "slug",
    "releaseType",
    "artistName",
    "releaseTitle",
    "rating"
  ],
  "news": [
    "title"
  ],
  "outfits": [
    "mainImage"
  ],
  "pages": [
    "title"
  ],
  "posts": [
    "title",
    "slug",
    "caption"
  ],
  "spotify-playlists": [
    "title",
    "slug",
    "spotifyPlaylistId"
  ]
} as const;

export const collectionSchemaPropertiesMap = {
  "blog-posts": {
    "excerpt": {
      "type": "textarea",
      "title": "Excerpt",
      "maxLength": 500,
      "helpText": "A short summary of the post"
    },
    "content": {
      "type": "richtext",
      "title": "Content",
      "required": true
    },
    "featuredImage": {
      "type": "media",
      "title": "Featured Image"
    },
    "author": {
      "type": "string",
      "title": "Author"
    },
    "tags": {
      "type": "string",
      "title": "Tags",
      "helpText": "Comma-separated tags"
    }
  },
  "events": {
    "content": {
      "type": "richtext",
      "title": "Write-up",
      "required": true
    },
    "rating": {
      "type": "number",
      "title": "Rating (out of 10)",
      "required": true,
      "min": 1,
      "max": 10
    },
    "featuredImage": {
      "type": "media",
      "title": "Featured Image"
    },
    "galleryImages": {
      "type": "media",
      "title": "Gallery Images",
      "multiple": true
    },
    "eventDate": {
      "type": "datetime",
      "title": "Event Date"
    },
    "location": {
      "type": "string",
      "title": "Location",
      "maxLength": 200
    },
    "outfit": {
      "type": "reference",
      "title": "Outfit",
      "collection": "outfits",
      "helpText": "Link this event to an outfit."
    }
  },
  "movie-reviews": {
    "director": {
      "type": "string",
      "title": "Director"
    },
    "releaseYear": {
      "type": "number",
      "title": "Release Year",
      "min": 1888
    },
    "genres": {
      "type": "string",
      "title": "Genres",
      "helpText": "Comma-separated genres"
    },
    "runtimeMinutes": {
      "type": "number",
      "title": "Runtime (minutes)",
      "min": 1
    },
    "content": {
      "type": "richtext",
      "title": "Review",
      "required": false
    },
    "rating": {
      "type": "number",
      "title": "Rating (out of 10)",
      "required": true,
      "min": 0,
      "max": 10
    },
    "featuredImage": {
      "type": "media",
      "title": "Featured Image"
    }
  },
  "music-reviews": {
    "releaseType": {
      "type": "select",
      "title": "Release Type",
      "enum": [
        "album",
        "single"
      ],
      "enumLabels": [
        "Album",
        "Single"
      ],
      "required": true
    },
    "artistName": {
      "type": "string",
      "title": "Artist Name",
      "required": true
    },
    "releaseTitle": {
      "type": "string",
      "title": "Release Title",
      "required": true
    },
    "content": {
      "type": "richtext",
      "title": "Review",
      "required": false
    },
    "rating": {
      "type": "number",
      "title": "Rating (out of 10)",
      "required": true,
      "min": 0,
      "max": 10
    },
    "label": {
      "type": "string",
      "title": "Label"
    },
    "genres": {
      "type": "string",
      "title": "Genres",
      "helpText": "Comma-separated genres"
    },
    "releaseDate": {
      "type": "datetime",
      "title": "Release Date"
    },
    "featuredImage": {
      "type": "media",
      "title": "Featured Image"
    }
  },
  "news": {
    "title": {
      "type": "string",
      "title": "Title",
      "required": true
    },
    "content": {
      "type": "string",
      "title": "Content",
      "format": "richtext"
    },
    "publish_date": {
      "type": "string",
      "title": "Publish Date",
      "format": "date"
    },
    "author": {
      "type": "string",
      "title": "Author"
    },
    "category": {
      "type": "string",
      "title": "Category",
      "enum": [
        "technology",
        "business",
        "general"
      ]
    }
  },
  "outfits": {
    "mainImage": {
      "type": "media",
      "title": "Main Image",
      "required": true
    },
    "pieces": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "title": "Name"
          },
          "image": {
            "type": "media",
            "title": "Image"
          },
          "order": {
            "type": "number",
            "title": "Order (top to bottom ascending numbers)"
          }
        }
      }
    }
  },
  "pages": {
    "title": {
      "type": "string",
      "title": "Title",
      "required": true
    },
    "content": {
      "type": "string",
      "title": "Content",
      "format": "richtext"
    },
    "slug": {
      "type": "slug",
      "title": "Slug"
    },
    "meta_description": {
      "type": "string",
      "title": "Meta Description"
    },
    "featured_image": {
      "type": "string",
      "title": "Featured Image",
      "format": "media"
    }
  },
  "posts": {
    "caption": {
      "type": "textarea",
      "title": "Caption / Text",
      "required": true,
      "maxLength": 2200,
      "helpText": "Post copy with hashtags and mentions if needed"
    },
    "media": {
      "type": "media",
      "title": "Media",
      "multiple": true
    }
  },
  "spotify-playlists": {
    "spotifyPlaylistId": {
      "type": "string",
      "title": "Spotify Playlist ID",
      "required": true,
      "helpText": "Use the value after /playlist/ in the Spotify URL (without query params)."
    },
    "description": {
      "type": "textarea",
      "title": "Description",
      "maxLength": 1200
    },
    "tags": {
      "type": "string",
      "title": "Tags",
      "helpText": "Comma-separated tags (genre, mood, activity, etc.)"
    },
    "featuredImage": {
      "type": "media",
      "title": "Cover Image"
    }
  }
} as const;

