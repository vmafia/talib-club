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

  const makeQuestion = (seed, difficulty, question, correct, distractors, explanation) => {
    const options = [correct, ...distractors].slice(0, 4).map(item => String(item || "ไม่ระบุ"))
    const answerIndex = seed % 4
    const [answer] = options.splice(0, 1)
    options.splice(answerIndex, 0, answer)
    return { difficulty, question, options, answerIndex, explanation }
  }

  const summary = desc.length > 120 ? `${desc.slice(0, 117)}...` : desc
  const templates = [
    ["easy", `หนังสือ "${title}" ถูกจัดอยู่ในหมวดใด?`, category, ["ประวัติศาสตร์ทั่วไป", "ภาษาอาหรับขั้นต้น", "ข่าวประกาศ"], `ข้อมูลหนังสือระบุหมวดไว้ว่า ${category}`],
    ["easy", `ผู้เขียนหรือผู้จัดทำของ "${title}" คือใคร?`, author, ["คณะผู้แปลนิรนาม", "ฝ่ายจัดส่ง", "ไม่ระบุ"], `ข้อมูลที่บันทึกไว้ระบุผู้เขียน/ผู้จัดทำเป็น ${author}`],
    ["easy", "ประเภทของรายการนี้คืออะไร?", type, ["บทความ", "คลิปเสียง", "ประกาศกิจกรรม"], `รายการนี้ถูกจัดเป็นประเภท ${type}`],
    ["easy", `ข้อใดอธิบายเนื้อหาของ "${title}" ได้ใกล้เคียงที่สุด?`, summary, ["คู่มือใช้งานระบบหลังบ้าน", "ตารางจัดส่งพัสดุ", "รายงานการเงิน"], "คำตอบอ้างอิงจากคำอธิบายหนังสือที่บันทึกไว้"],
    ["easy", "หลังอ่านจบควรทำสิ่งใดเพื่อทบทวนความเข้าใจ?", "สรุปประเด็นหลักและจดข้อคิด", ["ลบไฟล์ออกทันที", "ข้ามการทบทวน", "จำเฉพาะชื่อเรื่อง"], "การสรุปช่วยย้ำความเข้าใจและทำให้กลับมาทบทวนได้ง่าย"],
    ["easy", "การอ่านแบบรักษา streak ควรเน้นสิ่งใดมากที่สุด?", "อ่านจริงอย่างสม่ำเสมอพร้อมบันทึกข้อคิด", ["เลื่อนเปอร์เซ็นต์ให้เต็มเร็วที่สุด", "เปิดไฟล์ทิ้งไว้โดยไม่อ่าน", "ตอบแบบทดสอบแบบเดา"], "ระบบอ่านจริงให้ความสำคัญกับเวลาอ่านและหลักฐานความเข้าใจ"],
    ["easy", "ถ้าต้องการจำเนื้อหาให้ดีขึ้น ควรทำอะไรระหว่างอ่าน?", "หยุดเป็นช่วง ๆ เพื่อสรุปความหมาย", ["อ่านข้ามทุกหัวข้อ", "ดูเฉพาะปกหนังสือ", "เก็บไว้โดยไม่เปิดอ่าน"], "การสรุปเป็นระยะช่วยตรวจความเข้าใจของตนเอง"],
    ["medium", `จากข้อมูลที่มี "${title}" เหมาะกับการทบทวนด้านใดมากที่สุด?`, category, ["การเงินส่วนบุคคล", "การเขียนโปรแกรม", "การออกแบบบรรจุภัณฑ์"], `หมวด ${category} เป็นเบาะแสหลักของเนื้อหาที่ควรทบทวน`],
    ["medium", "ข้อใดเป็นหลักฐานการอ่านที่น่าเชื่อถือที่สุด?", "เวลาอ่านจริง หน้าอ่าน และข้อคิดจากเนื้อหา", ["จำนวนครั้งที่กดเปิดหน้าเว็บ", "เปอร์เซ็นต์ที่เลื่อนเอง", "ชื่อไฟล์ที่ยาว"], "หลักฐานหลายส่วนช่วยลดการบันทึกแบบผิวเผิน"],
    ["medium", "เมื่อเจอประเด็นสำคัญในหนังสือ ควรบันทึกอย่างไร?", "เขียนด้วยภาษาของตนเองและระบุบริบท", ["คัดลอกชื่อหนังสืออย่างเดียว", "ใส่เครื่องหมายถูกโดยไม่อธิบาย", "ปล่อยช่องบันทึกว่าง"], "การเรียบเรียงเองช่วยพิสูจน์ว่าเข้าใจเนื้อหา"],
    ["medium", "ถ้าอ่านไม่ถึงเป้าหมายประจำวัน ควรใช้ฟีเจอร์ใดเพื่อรักษา streak แบบตรงไปตรงมา?", "น้ำแข็งหรือวันลากิจ", ["เพิ่มคะแนน Quiz เอง", "แก้วันที่ย้อนหลัง", "ลบประวัติการอ่าน"], "น้ำแข็งและวันลากิจถูกออกแบบมาเพื่อคุ้มครอง streak โดยไม่บิดเบือนข้อมูลอ่านจริง"],
    ["medium", "ก่อนทำ Quiz หลังอ่านจบ ควรตรวจสอบสิ่งใด?", "อ่านครบตามเป้าหมายและมีบันทึกข้อคิด", ["มีรูปปกสวยพอ", "ไฟล์มีขนาดใหญ่", "ชื่อผู้ใช้ถูกต้อง"], "Quiz ควรตามหลังการอ่านและการทบทวน ไม่ใช่แทนที่การอ่าน"],
    ["medium", `หาก "${title}" เป็นไฟล์นอกที่สมาชิกเพิ่มเอง สิ่งใดควรกรอกเพิ่มเพื่อให้ติดตามดีขึ้น?`, "จำนวนหน้าและแหล่งที่มา", ["สีปุ่มในหน้าเว็บ", "รหัสผ่านบัญชี", "ยอดวิวของคนอื่น"], "จำนวนหน้าและแหล่งที่มาช่วยคำนวณความคืบหน้าและทำให้ข้อมูลน่าเชื่อถือ"],
    ["medium", "ข้อใดเป็นพฤติกรรมที่ระบบอ่านจริงพยายามลดลง?", "เลื่อนเปอร์เซ็นต์โดยไม่ได้อ่าน", ["อ่านสั้น ๆ ทุกวัน", "จดสิ่งที่เข้าใจ", "ทำแบบทดสอบหลังอ่าน"], "ระบบให้เครดิตจากเซสชันอ่านที่มีหลักฐาน ไม่ใช่การปรับเปอร์เซ็นต์เอง"],
    ["medium", "เมื่ออ่านหลายวันต่อเนื่อง สิ่งใดสะท้อนวินัยได้ดีที่สุด?", "จำนวนวันอ่านจริงที่ผ่านการยืนยัน", ["จำนวนหนังสือที่กดเพิ่ม", "จำนวนไฟล์ที่อัปโหลด", "จำนวนปุ่มที่คลิก"], "streak ที่ดีควรมาจากกิจกรรมอ่านที่ตรวจสอบได้"],
    ["hard", `หากต้องอธิบายแก่นของ "${title}" จากข้อมูลที่มี ควรเริ่มจากอะไร?`, "ชื่อเรื่อง หมวด ผู้เขียน และคำอธิบาย", ["ยอดดาวน์โหลดเท่านั้น", "ตำแหน่งปุ่มในเว็บ", "วันที่เข้าสู่ระบบ"], "เมื่อยังไม่มีเนื้อหาเต็ม metadata คือฐานข้อมูลที่เชื่อถือได้ที่สุด"],
    ["hard", "ข้อใดเป็นข้อจำกัดของ Quiz ที่สร้างจาก metadata เท่านั้น?", "ไม่ควรถามรายละเอียดที่ไม่มีในข้อมูลหนังสือ", ["ควรถามอะไรก็ได้เพื่อให้ยาก", "ควรเดาคำพูดผู้เขียน", "ควรสร้างข้ออ้างใหม่"], "ระบบที่ดีต้องหลีกเลี่ยงการแต่งข้อมูลที่ไม่มีหลักฐาน"],
    ["hard", "ทำไมระบบจึงควรบันทึกทั้งเวลาอ่านและ reflection?", "สองอย่างร่วมกันช่วยแยกการเปิดไฟล์เฉย ๆ ออกจากการอ่านเข้าใจ", ["ทำให้ไฟล์มีขนาดเล็กลง", "ทำให้ชื่อหนังสือสั้นลง", "แทนการอ่านทั้งหมดได้"], "เวลาเพียงอย่างเดียวไม่พิสูจน์ความเข้าใจ ส่วน reflection ช่วยเติมบริบท"],
    ["hard", "ถ้าคะแนนยืนยันการอ่านไม่ผ่าน ควรแก้โดยวิธีใด?", "อ่านต่อให้ครบเวลาและเขียนข้อคิดให้ชัดขึ้น", ["เพิ่มเปอร์เซ็นต์เอง", "ปิดหน้าแล้วเปิดใหม่หลายครั้ง", "ตอบ Quiz แบบสุ่ม"], "การแก้ควรเพิ่มหลักฐานการอ่านจริง ไม่ใช่เพิ่มตัวเลข"],
    ["hard", "ข้อใดทำให้ระบบชั้นหนังสือเหมาะกับการเรียนระยะยาวที่สุด?", "ติดตามความก้าวหน้าจากเซสชันอ่านจริงและทบทวนด้วย Quiz", ["เน้นกดดาวน์โหลดให้มากที่สุด", "ซ่อนข้อมูลการอ่านทั้งหมด", "ใช้เปอร์เซ็นต์โดยไม่มีหลักฐาน"], "การเรียนระยะยาวต้องมีวงจรอ่านจริง บันทึก ทบทวน และรักษาความต่อเนื่อง"],
  ]

  return templates.map((item, index) => makeQuestion(index + title.length, item[0], item[1], item[2], item[3], item[4]))
}

function normalizeQuiz(raw, book) {
  const source = Array.isArray(raw) ? raw : raw?.quiz
  if (!Array.isArray(source)) return fallbackQuiz(book)
  const normalized = source
    .map(item => ({
      question: String(item.question || "").trim(),
      options: Array.isArray(item.options) ? item.options.slice(0, 4).map(option => String(option)) : [],
      answerIndex: Number.isInteger(item.answerIndex) ? item.answerIndex : 0,
      explanation: String(item.explanation || "").trim(),
      difficulty: ["easy", "medium", "hard"].includes(item.difficulty) ? item.difficulty : "medium",
    }))
    .filter(item => item.question && item.options.length === 4 && item.answerIndex >= 0 && item.answerIndex < 4)
  const seen = new Set(normalized.map(item => item.question))
  const fillers = fallbackQuiz(book).filter(item => !seen.has(item.question))
  return [...normalized, ...fillers].slice(0, 20)
}

function quizPrompt(book) {
  return `Create a Thai Islamic-studies reading quiz for this book.
The quiz must help a Thai-speaking reader review what they read.
Avoid sectarian polemics and avoid inventing claims not supported by the book metadata.
Return exactly 20 multiple-choice questions.
Mix difficulty: 7 easy, 8 medium, 5 hard.
Use the field "difficulty" with one of: easy, medium, hard.
If the metadata is limited, ask professional reading-comprehension and study-process questions grounded in the metadata and reading evidence.

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
                minItems: 20,
                maxItems: 20,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["question", "options", "answerIndex", "explanation", "difficulty"],
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
                    difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
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
      max_tokens: 5000,
      temperature: 0.2,
      messages: [{
        role: "user",
        content: `${quizPrompt(book)}

Return ONLY JSON array with exactly 20 objects. Each object must have:
question: Thai string
options: four Thai strings
answerIndex: number 0-3
explanation: Thai string
difficulty: "easy", "medium", or "hard"

The array must contain exactly 20 objects: 7 easy, 8 medium, and 5 hard.`,
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
