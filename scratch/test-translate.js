async function test() {
  const url = "https://abuiyaad.com/a/imam-tabari-contagion";
  console.log("Fetching url:", url);
  try {
    const pageResponse = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
    })
    console.log("Page response status:", pageResponse.status);
    const html = await pageResponse.text();
    
    // Find all div class names
    const regex = /<div\s+class=["']([^"']+)["']/gi;
    let match;
    const classes = new Set();
    while ((match = regex.exec(html))) {
      classes.add(match[1]);
    }
    console.log("All div classes in page:", Array.from(classes));
    
    // Search for keywords
    console.log("Is articleContent string in HTML?", html.includes("articleContent"));
    console.log("Is article-content string in HTML?", html.includes("article-content"));
    console.log("Is content string in HTML?", html.includes("content"));
    
  } catch (err) {
    console.error("Test failed:", err);
  }
}

test();
