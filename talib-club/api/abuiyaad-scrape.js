export default async function handler(req, res) {
  try {
    let allPosts = []
    let page = 1

    while (true) {
      const response = await fetch(
        `https://abuiyaad.com/wp-json/wp/v2/posts?per_page=100&page=${page}`,
        { headers: { "user-agent": "TalibClubTranslationTracker/1.0" } }
      )

      // ถ้าหมด page แล้วจะได้ 400 กลับมา
      if (!response.ok) break

      const data = await response.json()
      if (!data.length) break

      allPosts = [...allPosts, ...data]

      // ถ้าได้น้อยกว่า 100 แสดงว่า page สุดท้ายแล้ว
      if (data.length < 100) break
      page++
    }

    const articles = allPosts.map(post => ({
      title: post.title.rendered
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'"),
      url: post.link,
      source: "abuiyaad.com",
    }))

    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400")
    res.status(200).json({
      source: "https://abuiyaad.com/",
      count: articles.length,
      articles: articles.sort((a, b) => a.title.localeCompare(b.title)),
    })

  } catch (error) {
    res.status(500).json({ error: error.message || "Cannot scrape abuiyaad.com" })
  }
}