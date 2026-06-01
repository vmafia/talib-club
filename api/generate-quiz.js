const OPENAI_URL = "https://api.openai.com/v1/responses"
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"

function send(res, status, data) {
  if (typeof res.setHeader === "function") {
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type")
  }
  if (typeof res.status === "function") return res.status(status).json(data)
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
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

function fallbackQuiz(book = {}) {
  const title = book.title || "หนังสือที่อ่าน"
  const author = book.author || "ผู้เขียน"
  const category = book.category || "หมวดความรู้"
  const type = book.type || "หนังสือ"
  const desc = book.desc || "เนื้อหาสำคัญของเล่มนี้"

  return [
    {
      question: `หนังสือ "${title}" อยู่ในหมวดใด?`,
      options: [category, "ประวัติศาสตร์", "ภาษาอาหรับ", "สื่อการสอน"],
      answerIndex: 0,
      explanation: `ข้อมูลหนังสือระบุหมวดไว้ว่า ${category}`,
    },
    {
      question: `ผู้จัดทำหรือผู้เขียนของ "${title}" คือใคร?`,
      options: [author, "Abu Iyaad", "คณะนักแปลนิรนาม", "ไม่ระบุ"],
      answerIndex: 0,
      explanation: `ข้อมูลในคลังหนังสือระบุผู้เขียน/ผู้จัดทำเป็น ${author}`,
    },
    {
      question: "หลังอ่านจบ ผู้อ่านควรทำสิ่งใดเพื่อทบทวนความเข้าใจ?",
      options: ["สรุปประเด็นหลักและจดข้อคิด", "ลบหนังสือออกทันที", "ข้ามการทบทวน", "จำเฉพาะชื่อเรื่อง"],
      answerIndex: 0,
      explanation: "การสรุปและจดข้อคิดช่วยย้ำความเข้าใจและทำให้กลับมาทบทวนได้ง่าย",
    },
    {
      question: `ประเภทของรายการนี้คืออะไร?`,
      options: [type, "บทความ", "คลิปเสียง", "ข่าวประกาศ"],
      answerIndex: 0,
      explanation: `รายการนี้ถูกจัดเป็นประเภท ${type}`,
    },
    {
      question: `คำอธิบายใดใกล้เคียงกับเนื้อหาของ "${title}" มากที่สุด?`,
      options: [desc, "รายงานการเงินประจำปี", "คู่มือใช้งานระบบหลังบ้าน", "ตารางจัดส่งพัสดุ"],
      answerIndex: 0,
      explanation: "ตัวเลือกนี้มาจากคำอธิบายหนังสือในคลังข้อมูล",
    },
  ]
}

function normalizeQuiz(raw, book) {
  const source = Array.isArray(raw) ? raw : raw?.quiz
  if (!Array.isArray(source)) return fallbackQuiz(book)
  return source
    .slice(0, 10)
    .map(item => ({
      question: String(item.question || "").trim(),
      options: Array.isArray(item.options) ? item.options.slice(0, 4).map(option => String(option)) : [],
      answerIndex: Number.isInteger(item.answerIndex) ? item.answerIndex : 0,
      explanation: String(item.explanation || "").trim(),
    }))
    .filter(item => item.question && item.options.length === 4 && item.answerIndex >= 0 && item.answerIndex < 4)
}

function quizPrompt(book) {
  return `Create a Thai Islamic-studies reading quiz for this book.
The quiz must help a Thai-speaking reader review what they read.
Avoid sectarian polemics and avoid inventing claims not supported by the book metadata.

Book:
${JSON.stringify(book, null, 2)}`
}

function extractOpenAIText(data) {
  if (data.output_text) return data.output_text
  return (data.output || [])
    .flatMap(item => item.content || [])
    .map(part => part.text || "")
    .join("\n")
    .trim()
}

async function generateWithOpenAI(book, apiKey) {
  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      input: [
        { role: "system", content: "You generate concise Thai multiple-choice quizzes as strict JSON." },
        { role: "user", content: quizPrompt(book) },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "reading_quiz",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["quiz"],
            properties: {
              quiz: {
                type: "array",
                minItems: 5,
                maxItems: 8,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["question", "options", "answerIndex", "explanation"],
                  properties: {
                    question: { type: "string" },
                    options: {
                      type: "array",
                      minItems: 4,
                      maxItems: 4,
                      items: { type: "string" },
                    },
                    answerIndex: { type: "integer", minimum: 0, maximum: 3 },
                    explanation: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    }),
  })

  if (!response.ok) {
    console.error("OpenAI quiz error", response.status, await response.text())
    return null
  }

  const data = await response.json()
  const quiz = normalizeQuiz(JSON.parse(extractOpenAIText(data) || "{}"), book)
  return quiz.length ? quiz : null
}

async function generateWithAnthropic(book, apiKey) {
  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
      max_tokens: 1800,
      temperature: 0.2,
      messages: [{
        role: "user",
        content: `${quizPrompt(book)}

Return ONLY JSON array with 5-8 objects. Each object must have:
question: Thai string
options: four Thai strings
answerIndex: number 0-3
explanation: Thai string`,
      }],
    }),
  })

  if (!response.ok) {
    console.error("Anthropic quiz error", response.status, await response.text())
    return null
  }

  const data = await response.json()
  const text = data.content?.map(part => part.text || "").join("\n").trim() || "[]"
  const jsonText = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim()
  const quiz = normalizeQuiz(JSON.parse(jsonText), book)
  return quiz.length ? quiz : null
}

export default async function handler(req, res) {
  const method = req.method || req.httpMethod
  if (method === "OPTIONS") return send(res, 200, { ok: true })
  if (method !== "POST") return send(res, 405, { error: "Method Not Allowed" })

  const { book = {} } = parseBody(req)

  try {
    if (process.env.OPENAI_API_KEY) {
      const quiz = await generateWithOpenAI(book, process.env.OPENAI_API_KEY)
      if (quiz) return send(res, 200, { source: "openai", quiz })
    }

    if (process.env.ANTHROPIC_API_KEY) {
      const quiz = await generateWithAnthropic(book, process.env.ANTHROPIC_API_KEY)
      if (quiz) return send(res, 200, { source: "anthropic", quiz })
    }

    return send(res, 200, { source: "fallback", quiz: fallbackQuiz(book) })
  } catch (error) {
    console.error("Cannot generate quiz", error)
    return send(res, 200, { source: "fallback", quiz: fallbackQuiz(book) })
  }
}
