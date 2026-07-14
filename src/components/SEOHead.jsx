import { useEffect } from 'react'

export const BASE_URL = 'https://talibclub.org'
const SITE_NAME = 'Talib Club'

export function stripHtml(html) {
  if (!html) return ''
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;|&amp;|&lt;|&gt;|&#\d+;/g, ' ').replace(/\s+/g, ' ').trim()
}

export function truncate(text, maxLen = 160) {
  if (!text) return ''
  const clean = text.trim()
  if (clean.length <= maxLen) return clean
  return clean.substring(0, maxLen - 3).trim() + '...'
}

function setMetaTag(attr, attrValue, content) {
  let el = document.querySelector(`meta[${attr}="${attrValue}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, attrValue)
    el.setAttribute('data-seo', 'true')
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function setLinkTag(rel, href) {
  let el = document.querySelector(`link[rel="${rel}"][data-seo="true"]`)
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    el.setAttribute('data-seo', 'true')
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

export default function SEOHead({ title, description, canonical, ogImage, ogType = 'website', jsonLd, noIndex = false }) {
  useEffect(() => {
    // Title
    if (title) document.title = title
    
    // Description
    if (description) {
      setMetaTag('name', 'description', truncate(description, 160))
    }
    
    // Canonical
    if (canonical) {
      setLinkTag('canonical', canonical)
    }
    
    // Robots
    if (noIndex) {
      setMetaTag('name', 'robots', 'noindex, nofollow')
    }
    
    // Open Graph
    if (title) setMetaTag('property', 'og:title', title)
    if (description) setMetaTag('property', 'og:description', truncate(description, 200))
    if (canonical) setMetaTag('property', 'og:url', canonical)
    setMetaTag('property', 'og:type', ogType)
    setMetaTag('property', 'og:site_name', SITE_NAME)
    setMetaTag('property', 'og:locale', 'th_TH')
    if (ogImage) {
      setMetaTag('property', 'og:image', ogImage)
      setMetaTag('property', 'og:image:width', '1200')
      setMetaTag('property', 'og:image:height', '630')
    }
    
    // Twitter Card
    setMetaTag('name', 'twitter:card', ogImage ? 'summary_large_image' : 'summary')
    if (title) setMetaTag('name', 'twitter:title', title)
    if (description) setMetaTag('name', 'twitter:description', truncate(description, 200))
    if (ogImage) setMetaTag('name', 'twitter:image', ogImage)
    
    // JSON-LD
    let scriptEl = document.querySelector('script[data-seo-jsonld="true"]')
    if (jsonLd) {
      if (!scriptEl) {
        scriptEl = document.createElement('script')
        scriptEl.setAttribute('type', 'application/ld+json')
        scriptEl.setAttribute('data-seo-jsonld', 'true')
        document.head.appendChild(scriptEl)
      }
      scriptEl.textContent = JSON.stringify(jsonLd)
    } else if (scriptEl) {
      scriptEl.remove()
    }
    
    // Cleanup
    return () => {
      // Remove JSON-LD on unmount
      const script = document.querySelector('script[data-seo-jsonld="true"]')
      if (script) script.remove()
    }
  }, [title, description, canonical, ogImage, ogType, jsonLd, noIndex])
  
  return null // This component doesn't render anything
}
