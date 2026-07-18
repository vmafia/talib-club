// src/utils/url.js

export function slugifyUrlPart(str) {
  if (!str) return 'general';
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\w\-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function getPagePath(id, data = null) {
  if (id === "home" || id === "") return "/";
  if (id === "tracking") return "/tracking-system";
  
  let p = "/" + id;
  if (data) {
    // If we have a category, add it to the path for these detail pages
    if (["article", "library-detail", "media-detail"].includes(id) && data.category) {
       p += "/" + slugifyUrlPart(data.category);
    }

    const qParams = new URLSearchParams()
    if (["article", "library-detail", "media-detail"].includes(id) && data.id) {
      qParams.set("id", String(data.id))
    } else {
      Object.entries(data).forEach(([key, val]) => {
        if (val !== null && val !== undefined && typeof val !== "object") {
          qParams.set(key, String(val))
        }
      })
    }
    const queryString = qParams.toString()
    if (queryString) {
      p += `?${queryString}`
    }
  }
  return p;
}
