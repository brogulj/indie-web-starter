import { Hono } from "hono";
import type { D1Database } from "@cloudflare/workers-types";

type MentionType = "like" | "reply" | "repost" | "mention";
type MentionStatus = "pending" | "approved" | "rejected" | "spam";

type WebmentionRecordData = {
  sourceUrl: string;
  targetUrl: string;
  targetCollection: string;
  targetSlug: string;
  sourceDomain: string;
  mentionType: MentionType;
  authorName?: string | undefined;
  authorUrl?: string | undefined;
  authorPhoto?: string | undefined;
  contentHtml?: string | undefined;
  contentText?: string | undefined;
  publishedAt?: string | undefined;
  status: MentionStatus;
  isVerified: boolean;
  verificationCheckedAt: string;
  rawMf2: string;
  dedupeKey: string;
};

type TrustedDomainData = {
  domain: string;
  active: boolean;
  firstApprovedAt?: string | undefined;
  lastSeenAt?: string | undefined;
  notes?: string | undefined;
};

type ParsedSource = {
  mentionType: MentionType;
  authorName?: string | undefined;
  authorUrl?: string | undefined;
  authorPhoto?: string | undefined;
  contentHtml?: string | undefined;
  contentText?: string | undefined;
  publishedAt?: string | undefined;
  rawMf2: string;
};

const SOURCE_FETCH_TIMEOUT_MS = 6000;
const SOURCE_FETCH_RETRIES = 2;
const MAX_SOURCE_LENGTH = 500_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_PER_DOMAIN = 12;

const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

const webmentionApiRoutes = new Hono();

const normalizeUrl = (value: string): string => {
  const parsed = new URL(value);
  parsed.hash = "";
  parsed.hostname = parsed.hostname.toLowerCase();
  if ((parsed.protocol === "http:" && parsed.port === "80") || (parsed.protocol === "https:" && parsed.port === "443")) {
    parsed.port = "";
  }
  if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }
  return parsed.toString();
};

const nowIso = (): string => new Date().toISOString();

const buildDedupeKey = (sourceUrl: string, targetUrl: string): string => `${sourceUrl}::${targetUrl}`;

const safeJsonParse = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const coerceMentionStatus = (value: unknown): MentionStatus => {
  if (value === "approved" || value === "rejected" || value === "spam") return value;
  return "pending";
};

const getAllowedTargetHosts = (raw: string | undefined): Set<string> => {
  const hosts = (raw ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  return new Set(hosts);
};

const isPrivateIpv4 = (value: string): boolean => {
  const octets = value.split(".").map((segment) => Number.parseInt(segment, 10));
  if (octets.length !== 4 || octets.some((part) => Number.isNaN(part) || part < 0 || part > 255)) return false;
  if (octets[0] === 10) return true;
  if (octets[0] === 127) return true;
  if (octets[0] === 169 && octets[1] === 254) return true;
  if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true;
  if (octets[0] === 192 && octets[1] === 168) return true;
  if (octets[0] === 0) return true;
  return false;
};

const toIpv6Literal = (host: string): string | null => {
  const unwrapped = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  if (!unwrapped.includes(":")) return null;
  if (!/^[0-9a-f:.]+$/i.test(unwrapped)) return null;
  return unwrapped.toLowerCase();
};

const isDisallowedSourceHost = (host: string): boolean => {
  const normalized = host.trim().toLowerCase();
  if (!normalized) return true;
  if (normalized === "localhost" || normalized === "::1" || normalized === "[::1]") return true;
  if (normalized.endsWith(".localhost") || normalized.endsWith(".local")) return true;
  if (normalized.endsWith(".internal") || normalized.endsWith(".home.arpa")) return true;
  if (isPrivateIpv4(normalized)) return true;
  const ipv6 = toIpv6Literal(normalized);
  if (ipv6?.startsWith("fc") || ipv6?.startsWith("fd")) return true;
  if (ipv6?.startsWith("fe8") || ipv6?.startsWith("fe9") || ipv6?.startsWith("fea") || ipv6?.startsWith("feb")) {
    return true;
  }
  return false;
};

const parseTargetPath = (targetUrl: string): { collection: string; slug: string } | null => {
  const parsed = new URL(targetUrl);
  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length !== 2) return null;
  return { collection: decodeURIComponent(segments[0]), slug: decodeURIComponent(segments[1]) };
};

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, " ").trim();

const safeCodePoint = (value: number, fallback: string): string => {
  if (!Number.isInteger(value) || value < 0 || value > 0x10ffff) return fallback;
  try {
    return String.fromCodePoint(value);
  } catch {
    return fallback;
  }
};

const decodeHtmlEntities = (value: string): string =>
  value
    .replace(/&#x([0-9a-f]+);/gi, (match, hex) => safeCodePoint(Number.parseInt(hex, 16), match))
    .replace(/&#([0-9]+);/g, (match, dec) => safeCodePoint(Number.parseInt(dec, 10), match))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

const stripTags = (value: string): string => normalizeWhitespace(decodeHtmlEntities(value.replace(/<[^>]*>/g, " ")));

const extractFirstMatch = (html: string, pattern: RegExp): string | undefined => {
  const match = html.match(pattern);
  if (!match?.[1]) return undefined;
  return normalizeWhitespace(decodeHtmlEntities(match[1]));
};

const extractClassAttr = (tag: string): string => {
  const match = tag.match(/class\s*=\s*["']([^"']+)["']/i);
  return match?.[1] ?? "";
};

const hasClassToken = (tag: string, token: string): boolean => {
  const classAttr = extractClassAttr(tag);
  return classAttr.split(/\s+/).includes(token);
};

const extractAttr = (tag: string, attr: string): string | undefined => {
  const pattern = new RegExp(`${attr}\\s*=\\s*["']([^"']+)["']`, "i");
  const match = tag.match(pattern);
  return match?.[1] ? decodeHtmlEntities(match[1]) : undefined;
};

const extractLinks = (html: string, sourceUrl: string): string[] => {
  const matches = html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi);
  const links: string[] = [];
  for (const match of matches) {
    if (!match[1]) continue;
    try {
      links.push(normalizeUrl(new URL(decodeHtmlEntities(match[1]), sourceUrl).toString()));
    } catch {
      continue;
    }
  }
  return links;
};

const hasPropertyLinkToTarget = (html: string, propertyClass: string, targetUrl: string, sourceUrl: string): boolean => {
  const tags = html.matchAll(/<(a|link)\b[^>]*>/gi);
  for (const tagMatch of tags) {
    const tag = tagMatch[0];
    if (!hasClassToken(tag, propertyClass)) continue;
    const href = extractAttr(tag, "href");
    if (!href) continue;
    try {
      const normalizedHref = normalizeUrl(new URL(href, sourceUrl).toString());
      if (normalizedHref === targetUrl) return true;
    } catch {
      continue;
    }
  }
  return false;
};

const hasContainerPropertyToTarget = (html: string, propertyClass: string, targetUrl: string, sourceUrl: string): boolean => {
  const escapedClass = propertyClass.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const containerPattern = new RegExp(
    `<([a-z0-9]+)\\b[^>]*class\\s*=\\s*["'][^"']*\\b${escapedClass}\\b[^"']*["'][^>]*>([\\s\\S]{0,4000}?)<\\/\\1>`,
    "gi"
  );
  for (const match of html.matchAll(containerPattern)) {
    const block = match[2] ?? "";
    for (const linkMatch of block.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
      if (!linkMatch[1]) continue;
      try {
        const normalizedHref = normalizeUrl(new URL(decodeHtmlEntities(linkMatch[1]), sourceUrl).toString());
        if (normalizedHref === targetUrl) return true;
      } catch {
        continue;
      }
    }
    const rawText = decodeHtmlEntities(block);
    if (rawText.includes(targetUrl)) return true;
  }
  return false;
};

const extractMentionTypeHint = (html: string): MentionType | null => {
  const explicitType = extractFirstMatch(html, /<strong>\s*Type:\s*<\/strong>\s*(like|reply|repost|mention)\b/i);
  if (explicitType === "like" || explicitType === "reply" || explicitType === "repost" || explicitType === "mention") {
    return explicitType;
  }
  const hintedClass = extractFirstMatch(html, /\bmf2PropertyClass\b[^a-z0-9]*(u-(?:like-of|in-reply-to|repost-of|mention-of))/i);
  if (hintedClass === "u-like-of") return "like";
  if (hintedClass === "u-in-reply-to") return "reply";
  if (hintedClass === "u-repost-of") return "repost";
  if (hintedClass === "u-mention-of") return "mention";
  return null;
};

const extractPublishedAt = (html: string): string | undefined => {
  const timeWithClass = html.match(
    /<time\b[^>]*class\s*=\s*["'][^"']*dt-published[^"']*["'][^>]*datetime\s*=\s*["']([^"']+)["'][^>]*>/i
  );
  if (timeWithClass?.[1]) return timeWithClass[1];
  const generic = html.match(/\bdatetime\s*=\s*["']([^"']+)["']/i);
  return generic?.[1];
};

const parseSourceDocument = (html: string, sourceUrl: string, targetUrl: string): ParsedSource => {
  const authorName =
    extractFirstMatch(html, /<[^>]*class\s*=\s*["'][^"']*p-name[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i) ??
    extractFirstMatch(html, /<meta\s+property\s*=\s*["']og:title["']\s+content\s*=\s*["']([^"']+)["'][^>]*>/i);

  const authorUrl = (() => {
    const candidate = extractFirstMatch(
      html,
      /<[^>]*class\s*=\s*["'][^"']*u-url[^"']*["'][^>]*href\s*=\s*["']([^"']+)["'][^>]*>/i
    );
    if (!candidate) return undefined;
    try {
      return new URL(candidate, sourceUrl).toString();
    } catch {
      return undefined;
    }
  })();

  const authorPhoto = (() => {
    const srcMatch = html.match(
      /<img\b[^>]*class\s*=\s*["'][^"']*u-photo[^"']*["'][^>]*src\s*=\s*["']([^"']+)["'][^>]*>/i
    );
    const hrefMatch = html.match(
      /<[^>]*class\s*=\s*["'][^"']*u-photo[^"']*["'][^>]*href\s*=\s*["']([^"']+)["'][^>]*>/i
    );
    const candidate = srcMatch?.[1] ?? hrefMatch?.[1];
    if (!candidate) return undefined;
    try {
      return new URL(candidate, sourceUrl).toString();
    } catch {
      return undefined;
    }
  })();

  const contentHtmlRaw =
    extractFirstMatch(html, /<[^>]*class\s*=\s*["'][^"']*e-content[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i) ??
    extractFirstMatch(html, /<[^>]*class\s*=\s*["'][^"']*p-content[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i);
  const contentHtml = contentHtmlRaw ? contentHtmlRaw : undefined;
  const contentText = contentHtmlRaw ? stripTags(contentHtmlRaw) : undefined;

  const like =
    hasPropertyLinkToTarget(html, "u-like-of", targetUrl, sourceUrl) ||
    hasContainerPropertyToTarget(html, "u-like-of", targetUrl, sourceUrl);
  const reply =
    hasPropertyLinkToTarget(html, "u-in-reply-to", targetUrl, sourceUrl) ||
    hasContainerPropertyToTarget(html, "u-in-reply-to", targetUrl, sourceUrl);
  const repost =
    hasPropertyLinkToTarget(html, "u-repost-of", targetUrl, sourceUrl) ||
    hasContainerPropertyToTarget(html, "u-repost-of", targetUrl, sourceUrl);
  const hintedType = extractMentionTypeHint(html);

  const mentionType: MentionType = like ? "like" : reply ? "reply" : repost ? "repost" : hintedType ?? "mention";
  const publishedAt = extractPublishedAt(html);

  const rawMf2 = JSON.stringify({
    classifiedAs: mentionType,
    propertiesFound: {
      like,
      reply,
      repost,
    },
    hintedType,
    extracted: {
      authorName,
      authorUrl,
      authorPhoto,
      contentText,
      publishedAt,
    },
  });

  return {
    mentionType,
    authorName,
    authorUrl,
    authorPhoto,
    contentHtml,
    contentText,
    publishedAt,
    rawMf2,
  };
};

const fetchSourceWithRetry = async (url: string): Promise<string> => {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= SOURCE_FETCH_RETRIES; attempt += 1) {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), SOURCE_FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "GET",
        signal: abortController.signal,
        redirect: "follow",
        headers: {
          "user-agent": "indie-web-starter-webmention/1.0",
          accept: "text/html,application/xhtml+xml",
        },
      });

      if (!response.ok) {
        if (response.status >= 500 && attempt < SOURCE_FETCH_RETRIES) continue;
        throw new Error(`Source fetch failed with status ${response.status}`);
      }

      const body = await response.text();
      return body.slice(0, MAX_SOURCE_LENGTH);
    } catch (error) {
      lastError = error;
      if (attempt >= SOURCE_FETCH_RETRIES) break;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Failed to fetch source URL");
};

const queryFirst = async <T>(db: D1Database, sql: string, ...params: unknown[]): Promise<T | null> => {
  const result = await db.prepare(sql).bind(...params).first<T>();
  return result ?? null;
};

const queryAll = async <T>(db: D1Database, sql: string, ...params: unknown[]): Promise<T[]> => {
  const result = await db.prepare(sql).bind(...params).all<T>();
  return Array.isArray(result.results) ? result.results : [];
};

const getAuthorId = async (db: D1Database): Promise<string | null> => {
  const admin = await queryFirst<{ id: string }>(
    db,
    "SELECT id FROM users WHERE is_active = 1 AND role = 'admin' ORDER BY created_at ASC LIMIT 1"
  );
  if (admin?.id) return admin.id;
  const anyUser = await queryFirst<{ id: string }>(db, "SELECT id FROM users WHERE is_active = 1 ORDER BY created_at ASC LIMIT 1");
  return anyUser?.id ?? null;
};

const buildSlug = (prefix: string): string => {
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `${prefix}-${Date.now()}-${random}`;
};

const validateSecret = (headerValue: string | undefined, expected: string | undefined): boolean => {
  if (!headerValue || !expected) return false;
  const token = headerValue.startsWith("Bearer ") ? headerValue.slice("Bearer ".length) : headerValue;
  return token === expected;
};

const canProcessDomain = (domain: string): boolean => {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(domain);
  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(domain, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (bucket.count >= RATE_LIMIT_MAX_PER_DOMAIN) {
    return false;
  }

  bucket.count += 1;
  return true;
};

const upsertTrustedDomain = async (db: D1Database, params: { collectionId: string; authorId: string; domain: string; nowMs: number }): Promise<void> => {
  const { collectionId, authorId, domain, nowMs } = params;
  const nowIsoValue = new Date(nowMs).toISOString();
  const existing = await queryFirst<{ id: string; data: string }>(
    db,
    `SELECT id, data FROM content
     WHERE collection_id = ?
       AND status != 'draft'
       AND json_extract(data, '$.domain') = ?
     ORDER BY updated_at DESC
     LIMIT 1`,
    collectionId,
    domain
  );

  if (existing?.id) {
    const existingData = safeJsonParse<TrustedDomainData>(existing.data, { domain, active: true });
    const updatedData: TrustedDomainData = {
      domain,
      active: true,
      firstApprovedAt: existingData.firstApprovedAt ?? nowIsoValue,
      lastSeenAt: nowIsoValue,
      notes: existingData.notes,
    };

    await db
      .prepare("UPDATE content SET title = ?, data = ?, status = ?, updated_at = ?, published_at = ? WHERE id = ?")
      .bind(`Trusted domain: ${domain}`, JSON.stringify(updatedData), "published", nowMs, nowMs, existing.id)
      .run();
    return;
  }

  const trustedData: TrustedDomainData = {
    domain,
    active: true,
    firstApprovedAt: nowIsoValue,
    lastSeenAt: nowIsoValue,
    notes: "Auto-added when a moderator approved a webmention from this domain.",
  };

  await db
    .prepare(
      "INSERT INTO content (id, collection_id, slug, title, data, status, published_at, author_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(
      crypto.randomUUID(),
      collectionId,
      buildSlug("trusted-domain"),
      `Trusted domain: ${domain}`,
      JSON.stringify(trustedData),
      "published",
      nowMs,
      authorId,
      nowMs,
      nowMs
    )
    .run();
};

const isDomainTrusted = async (
  db: D1Database,
  params: { trustedCollectionId: string; webmentionsCollectionId: string; sourceDomain: string; authorId: string; nowMs: number }
): Promise<boolean> => {
  const { trustedCollectionId, webmentionsCollectionId, sourceDomain, authorId, nowMs } = params;

  const trustedRecord = await queryFirst<{ data: string }>(
    db,
    `SELECT data FROM content
     WHERE collection_id = ?
       AND status != 'draft'
       AND json_extract(data, '$.domain') = ?
     ORDER BY updated_at DESC
     LIMIT 1`,
    trustedCollectionId,
    sourceDomain
  );

  if (trustedRecord?.data) {
    const trustedData = safeJsonParse<TrustedDomainData>(trustedRecord.data, { domain: sourceDomain, active: false });
    if (trustedData.active) return true;
  }

  const approvedMention = await queryFirst<{ id: string }>(
    db,
    `SELECT id FROM content
     WHERE collection_id = ?
       AND status != 'draft'
       AND json_extract(data, '$.sourceDomain') = ?
       AND json_extract(data, '$.status') = 'approved'
     LIMIT 1`,
    webmentionsCollectionId,
    sourceDomain
  );

  if (!approvedMention) return false;

  await upsertTrustedDomain(db, {
    collectionId: trustedCollectionId,
    authorId,
    domain: sourceDomain,
    nowMs,
  });

  return true;
};

webmentionApiRoutes.post("/ingest", async (c) => {
  try {
    const env = c.env as { DB: D1Database; WEBMENTION_SHARED_SECRET?: string; WEBMENTION_ALLOWED_HOSTS?: string };
    const sharedSecret = env.WEBMENTION_SHARED_SECRET;
    const authHeader = c.req.header("authorization");
    if (!validateSecret(authHeader, sharedSecret)) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = await c.req.json<{ source?: string; target?: string }>();
    const source = String(body.source ?? "").trim();
    const target = String(body.target ?? "").trim();

    if (!source || !target) {
      return c.json({ error: "Both source and target are required." }, 400);
    }

    let sourceUrl: string;
    let targetUrl: string;
    try {
      sourceUrl = normalizeUrl(source);
      targetUrl = normalizeUrl(target);
    } catch {
      return c.json({ error: "Invalid source or target URL." }, 422);
    }

    if (!sourceUrl.startsWith("http://") && !sourceUrl.startsWith("https://")) {
      return c.json({ error: "Source must use http(s)." }, 422);
    }

    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
      return c.json({ error: "Target must use http(s)." }, 422);
    }

    const sourceDomain = new URL(sourceUrl).hostname.toLowerCase();
    const targetHost = new URL(targetUrl).hostname.toLowerCase();
    if (isDisallowedSourceHost(sourceDomain) && sourceDomain !== targetHost) {
      return c.json({ error: "Source host is not allowed." }, 403);
    }
    if (!canProcessDomain(sourceDomain)) {
      return c.json({ error: "Rate limit exceeded for source domain." }, 429);
    }

    const allowedHosts = getAllowedTargetHosts(env.WEBMENTION_ALLOWED_HOSTS);
    if (allowedHosts.size > 0 && !allowedHosts.has(targetHost)) {
      return c.json({ error: "Target host is not allowed." }, 403);
    }

    const targetPath = parseTargetPath(targetUrl);
    if (!targetPath) {
      return c.json({ error: "Target must match /:collection/:slug." }, 422);
    }

    const db = env.DB;
    const [webmentionCollection, trustedCollection, targetCollection] = await Promise.all([
      queryFirst<{ id: string }>(db, "SELECT id FROM collections WHERE name = ? AND is_active = 1 LIMIT 1", "webmentions"),
      queryFirst<{ id: string }>(db, "SELECT id FROM collections WHERE name = ? AND is_active = 1 LIMIT 1", "trusted-webmention-domains"),
      queryFirst<{ id: string }>(db, "SELECT id FROM collections WHERE name = ? AND is_active = 1 LIMIT 1", targetPath.collection),
    ]);

    if (!webmentionCollection?.id || !trustedCollection?.id) {
      return c.json({ error: "Webmention collections are not configured on backend." }, 500);
    }

    if (!targetCollection?.id) {
      return c.json({ error: "Target collection does not exist." }, 422);
    }

    const targetContent = await queryFirst<{ id: string }>(
      db,
      "SELECT id FROM content WHERE collection_id = ? AND slug = ? AND status != 'draft' LIMIT 1",
      targetCollection.id,
      targetPath.slug
    );

    if (!targetContent?.id) {
      return c.json({ error: "Target content does not exist or is not published." }, 422);
    }

    let sourceHtml: string;
    try {
      sourceHtml = await fetchSourceWithRetry(sourceUrl);
    } catch (error) {
      console.error("webmention source fetch failed", error);
      return c.json({ error: "Could not fetch source URL." }, 422);
    }

    const links = extractLinks(sourceHtml, sourceUrl);
    const hasGenericTargetLink = links.includes(targetUrl);
    const hasMf2TargetLink =
      hasPropertyLinkToTarget(sourceHtml, "u-like-of", targetUrl, sourceUrl) ||
      hasPropertyLinkToTarget(sourceHtml, "u-in-reply-to", targetUrl, sourceUrl) ||
      hasPropertyLinkToTarget(sourceHtml, "u-repost-of", targetUrl, sourceUrl) ||
      hasContainerPropertyToTarget(sourceHtml, "u-like-of", targetUrl, sourceUrl) ||
      hasContainerPropertyToTarget(sourceHtml, "u-in-reply-to", targetUrl, sourceUrl) ||
      hasContainerPropertyToTarget(sourceHtml, "u-repost-of", targetUrl, sourceUrl);

    console.log("[webmention] link_detection", {
      sourceUrl,
      targetUrl,
      hasGenericTargetLink,
      hasMf2TargetLink,
      extractedLinksCount: links.length,
      extractedLinksSample: links.slice(0, 20),
      sourceHtmlSnippet: sourceHtml.slice(0, 1200),
    });

    if (!hasGenericTargetLink && !hasMf2TargetLink) {
      console.log("[webmention] reject_source_does_not_link_target", {
        sourceUrl,
        targetUrl,
        extractedLinksCount: links.length,
        extractedLinksSample: links.slice(0, 20),
      });
      return c.json({ error: "Source does not link to target." }, 422);
    }

    const parsed = parseSourceDocument(sourceHtml, sourceUrl, targetUrl);
    const nowMs = Date.now();
    const authorId = await getAuthorId(db);
    if (!authorId) {
      return c.json({ error: "No active backend user available for storing webmention." }, 500);
    }

    const trusted = await isDomainTrusted(db, {
      trustedCollectionId: trustedCollection.id,
      webmentionsCollectionId: webmentionCollection.id,
      sourceDomain,
      authorId,
      nowMs,
    });

    const dedupeKey = buildDedupeKey(sourceUrl, targetUrl);
    const existing = await queryFirst<{ id: string; data: string }>(
      db,
      `SELECT id, data FROM content
       WHERE collection_id = ?
         AND status != 'draft'
         AND json_extract(data, '$.dedupeKey') = ?
       LIMIT 1`,
      webmentionCollection.id,
      dedupeKey
    );

    const existingData = safeJsonParse<WebmentionRecordData | null>(existing?.data, null);
    const resolvedStatus: MentionStatus = trusted
      ? "approved"
      : existingData
      ? coerceMentionStatus(existingData.status)
      : "pending";

    const recordData: WebmentionRecordData = {
      sourceUrl,
      targetUrl,
      targetCollection: targetPath.collection,
      targetSlug: targetPath.slug,
      sourceDomain,
      mentionType: parsed.mentionType,
      authorName: parsed.authorName,
      authorUrl: parsed.authorUrl,
      authorPhoto: parsed.authorPhoto,
      contentHtml: parsed.contentHtml,
      contentText: parsed.contentText,
      publishedAt: parsed.publishedAt,
      status: resolvedStatus,
      isVerified: true,
      verificationCheckedAt: nowIso(),
      rawMf2: parsed.rawMf2,
      dedupeKey,
    };

    const title = `${recordData.mentionType.toUpperCase()} from ${recordData.sourceDomain}`;

    if (existing?.id) {
      await db
        .prepare("UPDATE content SET title = ?, data = ?, status = ?, updated_at = ?, published_at = ? WHERE id = ?")
        .bind(title, JSON.stringify(recordData), "published", nowMs, nowMs, existing.id)
        .run();
    } else {
      await db
        .prepare(
          "INSERT INTO content (id, collection_id, slug, title, data, status, published_at, author_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(
          crypto.randomUUID(),
          webmentionCollection.id,
          buildSlug("wm"),
          title,
          JSON.stringify(recordData),
          "published",
          nowMs,
          authorId,
          nowMs,
          nowMs
        )
        .run();
    }

    if (resolvedStatus === "approved") {
      await upsertTrustedDomain(db, {
        collectionId: trustedCollection.id,
        authorId,
        domain: sourceDomain,
        nowMs,
      });
    }

    return c.json({ accepted: true, status: resolvedStatus }, 202);
  } catch (error) {
    console.error("webmention ingest failed", error);
    return c.json({ error: "Internal Server Error" }, 500);
  }
});

webmentionApiRoutes.get("/mentions", async (c) => {
  try {
    const target = String(c.req.query("target") ?? "").trim();
    if (!target) {
      return c.json({ error: "target query parameter is required" }, 400);
    }

    let normalizedTarget: string;
    try {
      normalizedTarget = normalizeUrl(target);
    } catch {
      return c.json({ error: "target is not a valid URL" }, 422);
    }

    const env = c.env as { DB: D1Database };
    const db = env.DB;
    const webmentionCollection = await queryFirst<{ id: string }>(
      db,
      "SELECT id FROM collections WHERE name = ? AND is_active = 1 LIMIT 1",
      "webmentions"
    );

    if (!webmentionCollection?.id) {
      return c.json({ mentions: [], counts: { likes: 0, reposts: 0, replies: 0, mentions: 0 } });
    }

    const rows = await queryAll<{ id: string; updated_at: number; data: string }>(
      db,
      `SELECT id, data, updated_at
       FROM content
       WHERE collection_id = ?
         AND status = 'published'
         AND json_extract(data, '$.targetUrl') = ?
         AND json_extract(data, '$.status') = 'approved'
       ORDER BY COALESCE(json_extract(data, '$.publishedAt'), '') DESC, updated_at DESC`,
      webmentionCollection.id,
      normalizedTarget
    );

    const mentions = rows.map((row) => {
      const data = safeJsonParse<WebmentionRecordData>(row.data, {
        sourceUrl: "",
        targetUrl: normalizedTarget,
        targetCollection: "",
        targetSlug: "",
        sourceDomain: "",
        mentionType: "mention",
        status: "approved",
        isVerified: true,
        verificationCheckedAt: nowIso(),
        rawMf2: "{}",
        dedupeKey: "",
      });

      return {
        id: row.id,
        sourceUrl: data.sourceUrl,
        sourceDomain: data.sourceDomain,
        mentionType: data.mentionType,
        authorName: data.authorName,
        authorUrl: data.authorUrl,
        authorPhoto: data.authorPhoto,
        contentHtml: data.contentHtml,
        contentText: data.contentText,
        publishedAt: data.publishedAt,
      };
    });

    const counts = {
      likes: mentions.filter((item) => item.mentionType === "like").length,
      reposts: mentions.filter((item) => item.mentionType === "repost").length,
      replies: mentions.filter((item) => item.mentionType === "reply").length,
      mentions: mentions.filter((item) => item.mentionType === "mention").length,
    };

    return c.json({ mentions, counts });
  } catch (error) {
    console.error("webmention query failed", error);
    return c.json({ error: "Internal Server Error" }, 500);
  }
});

export default webmentionApiRoutes;
