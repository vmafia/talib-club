const OPENAI_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1/chat/completions"
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"

function send(res, status, data) {
  if (typeof res.setHeader === "function") {
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type")
  }
  if (typeof res.status === "function") return res.status(status).json(data)
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
      "Access-Control-Allow-Headers": "Content-Type",
    },
    body: JSON.stringify(data),
  }
}

function parseBody(req) {
  if (!req.body) return {}
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body)
    } catch {
      return {}
    }
  }
  return req.body
}

function decodeEntities(value = "") {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&ldquo;/g, "\u201c")
    .replace(/&rdquo;/g, "\u201d")
    .replace(/&nbsp;/g, " ")
}

function cleanText(text = "") {
  return decodeEntities(text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
}

function extractArticleContent(html) {
  const contentStart = html.indexOf('<div class="articleContent">')
  if (contentStart === -1) return ""
  const sub = html.slice(contentStart)
  let depth = 1
  const regex = /<\/?div\b/gi
  let match
  regex.lastIndex = 28 // length of '<div class="articleContent">'
  let closingIndex = -1
  while ((match = regex.exec(sub))) {
    if (match[0].toLowerCase() === "<div") {
      depth++
    } else {
      depth--
    }
    if (depth === 0) {
      closingIndex = match.index
      break
    }
  }
  if (closingIndex === -1) return sub
  return sub.slice(0, closingIndex + 6)
}

function translationPrompt(elements) {
  return `You are an expert English-to-Thai translator specializing in Islamic studies (Aqeedah, Manhaj, Tawhid) and the understanding of the Salaf.
Translate the following English article blocks into Thai.
Requirements:
1. Translate line-by-line and retain the exact array length and element mapping.
2. Translate accurately and naturally into Thai, ensuring correct Islamic terminology transliterations (e.g., Aqeedah -> เธญเธฐเธเธตเธ”เธฐเธฎเน, Manhaj -> เธกเธฑเธเธฎเธฑเธเธเน, Tawhid -> เน€เธ•เธฒเธฎเธตเธ”, Salaf -> เธชเธฅเธฑเธ, Sunnah -> เธเธธเธเธเธฐเธฎเน, Bid'ah -> เธเธดเธ”เธญเธฐเธฎเน, Jahiliyyah -> เธเธฒเธฎเธดเธฅเธตเธขเธฐเธฎเน, Shirk -> เธเธดเธฃเธดเธ).
3. Do not add any commentary or extra text outside the translation.
4. Return the result strictly as a JSON object containing a "translations" field, which is an array of the translated objects: { id: number, tag: string, english: string, thai: string }.

Article blocks:
${JSON.stringify(elements, null, 2)}`
}

async function translateWithOpenAI(elements, apiKey) {
  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You translate article blocks into Thai. You return strictly a JSON object with a translations array." },
        { role: "user", content: translationPrompt(elements) },
      ],
      temperature: 0.1,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error("OpenAI translate error:", response.status, errorText)
    throw new Error(`OpenAI error: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  const resultText = data.choices?.[0]?.message?.content?.trim() || "{}"
  return JSON.parse(resultText)
}

async function translateWithAnthropic(elements, apiKey) {
  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-20241022",
      max_tokens: 4000,
      temperature: 0.1,
      messages: [{
        role: "user",
        content: `${translationPrompt(elements)}

Return ONLY a valid JSON object with the "translations" array, no markdown blocks.`,
      }],
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error("Anthropic translate error:", response.status, errorText)
    throw new Error(`Anthropic error: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  const text = data.content?.map(part => part.text || "").join("\n").trim() || "{}"
  const jsonText = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim()
  return JSON.parse(jsonText)
}

async function translateWithGemini(elements, apiKey, modelName = "gemini-2.5-flash") {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: `${translationPrompt(elements)}\n\nReturn the output as a valid JSON object containing the translations array. Do not wrap in markdown code blocks.`
        }]
      }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1
      }
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error("Gemini translate error:", response.status, errorText)
    throw new Error(`Gemini error: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "{}"
  const jsonText = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim()
  return JSON.parse(jsonText)
}function repairParagraphs(html) {
  const tokens = html.split(/(<\/?[a-zA-Z0-9]+(?:\s+[^>]*)?>)/g)
  let result = []
  let pOpen = false

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (i % 2 === 1) { // It is a tag
      const isStartTag = token.startsWith("<") && !token.startsWith("</") && !token.endsWith("/>")
      const isEndTag = token.startsWith("</")
      const tagName = token.replace(/[<>\/]/g, "").split(/\s+/)[0].toLowerCase()

      if (isStartTag) {
        if (tagName === "p") {
          if (pOpen) {
            result.push("</p>")
          }
          pOpen = true
          result.push("<p>")
        } else if (["div", "blockquote", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "hr", "br"].includes(tagName)) {
          if (pOpen) {
            result.push("</p>")
            pOpen = false
          }
          result.push(token)
        } else {
          result.push(token)
        }
      } else if (isEndTag) {
        if (tagName === "p") {
          if (pOpen) {
            result.push("</p>")
            pOpen = false
          }
        } else if (["div", "blockquote", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li"].includes(tagName)) {
          if (pOpen) {
            result.push("</p>")
            pOpen = false
          }
          result.push(token)
        } else {
          result.push(token)
        }
      } else {
        result.push(token)
      }
    } else { // It is text
      result.push(token)
    }
  }

  if (pOpen) {
    result.push("</p>")
  }

  return result.join("")
}

async function verifyFirebaseIdToken(idToken) {
  const apiKey = process.env.VITE_WEB_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || "AIzaSyC8HoWaAu0XWy3he_pMxqUIWwREDPdeUpg"
  try {
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`
    const response = await fetch(url, {
      method: "POST",
      headers: { 
        "content-type": "application/json",
        "referer": "https://talib.club/",
        "origin": "https://talib.club"
      },
      body: JSON.stringify({ idToken })
    })
    if (!response.ok) {
      const errText = await response.text();
      console.error("Token verification failed with status:", response.status, errText);
      throw new Error(`Token API Error ${response.status}: ${errText}`);
    }
    const data = await response.json()
    return data.users?.[0]?.localId || null
  } catch (err) {
    console.error("Token verification failed", err)
    throw err
  }
}

export default async function handler(req, res) {
  const method = req.method || req.httpMethod
  if (method === "OPTIONS") return send(res, 200, { ok: true })
  if (method !== "POST" && method !== "GET") return send(res, 405, { error: "Method Not Allowed" })

  const params = method === "GET" ? req.query : parseBody(req)
  const { url } = params
  if (!url) {
    return send(res, 400, { error: "Missing article URL" })
  }

  const authHeader = req.headers?.authorization || req.headers?.Authorization
  let idToken = null
  if (authHeader && authHeader.startsWith("Bearer ")) {
    idToken = authHeader.substring(7)
  }

  if (!idToken) {
    return send(res, 401, { error: "Unauthorized: Missing authentication token" })
  }

  let uid;
  try {
    uid = await verifyFirebaseIdToken(idToken);
  } catch (err) {
    return send(res, 401, { error: `Unauthorized: Token error. ${err.message}` });
  }

  if (!uid) {
    return send(res, 401, { error: "Unauthorized: Invalid authentication token" })
  }

  let parsedUrl
  try {
    parsedUrl = new URL(url)
  } catch (err) {
    return send(res, 400, { error: "Invalid URL format" })
  }

  const isAbuiyaad = parsedUrl.hostname === "abuiyaad.com" || parsedUrl.hostname.endsWith(".abuiyaad.com")
  if (!isAbuiyaad) {
    return send(res, 400, { error: "Only abuiyaad.com domain is permitted" })
  }

  try {
    // 1. Fetch HTML
    const pageResponse = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
    })

    if (!pageResponse.ok) {
      return send(res, 500, { error: `Failed to fetch article from abuiyaad.com: Status ${pageResponse.status}` })
    }

    const html = await pageResponse.text()

    // 2. Extract content
    const contentHtml = extractArticleContent(html)
    if (!contentHtml) {
      return send(res, 404, { error: "Article content wrapper (.articleContent) not found on the page." })
    }

    const repairedHtml = repairParagraphs(contentHtml)

    // 3. Extract text elements
    const elements = []
    const regex = /<(p|h1|h2|h3|h4|h5|li|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/gi
    let match
    let index = 0
    while ((match = regex.exec(repairedHtml))) {
      const tag = match[1].toLowerCase()
      const text = cleanText(match[2])
      
      // Filter out footer links, empty rows, PDF download boxes
      if (!text || text.length < 3) continue
      if (text.includes("View PDF File") || text.includes("View File") || text.includes("Read the full article")) continue
      if (text.startsWith("Filed under") || text.startsWith("Posted by")) continue

      elements.push({ id: index++, tag, english: text })
    }

    if (elements.length === 0) {
      return send(res, 404, { error: "No translateable text blocks found inside the article content." })
    }

    // 4. Translate using LLM (Try OpenAI, then Anthropic, else fail)
    let translationResult = null
    let source = ""
    const openaiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY
    const anthropicKey = process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY
    const geminiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY
    let lastError = null;

    if (openaiKey) {
      try {
        translationResult = await translateWithOpenAI(elements, openaiKey)
        source = "openai"
      } catch (err) {
        lastError = err.message;
        console.error("OpenAI translation failed:", err)
      }
    }

    if (!translationResult && anthropicKey) {
      try {
        translationResult = await translateWithAnthropic(elements, anthropicKey)
        source = "anthropic"
      } catch (err) {
        lastError = err.message;
        console.error("Anthropic translation failed:", err)
      }
    }

    if (!translationResult && geminiKey) {
      const geminiModels = [
        process.env.GEMINI_MODEL || "gemini-2.5-flash",
        "gemini-3.5-flash",
        "gemini-2.5-pro",
        "gemini-2.0-flash"
      ];

      for (const model of geminiModels) {
        try {
          translationResult = await translateWithGemini(elements, geminiKey, model)
          source = "gemini"
          lastError = null; // Clear error on success
          console.log(`Successfully translated using ${model}`);
          break; // Stop looping when successful
        } catch (err) {
          lastError = err.message;
          console.warn(`Gemini (${model}) translation failed:`, err.message)
        }
      }
    }

    if (!translationResult) {
      if (lastError) {
        return send(res, 500, { error: `AI translation failed: ${lastError}` })
      }
      return send(res, 500, { error: "AI translation service is currently unavailable. Set up API keys." })
    }

    return send(res, 200, {
      source,
      url,
      translations: translationResult.translations || []
    })
  } catch (error) {
    console.error("Translation API handler error:", error)
    return send(res, 500, { error: error.message || "An error occurred during translation processing." })
  }
}
