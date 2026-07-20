export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  try {
    const url = new URL(req.url);
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) {
      return new Response('Missing url parameter', { status: 400 });
    }

    // Handle OPTIONS request for CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }

    // Attempt to download the PDF from the target URL
    const response = await fetch(targetUrl);

    if (!response.ok) {
      return new Response(`Failed to fetch PDF: ${response.status} ${response.statusText}`, {
        status: response.status,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Set CORS headers
    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    headers.set('Access-Control-Allow-Headers', '*');
    headers.set('Content-Disposition', 'inline; filename="document.pdf"');

    // Remove headers that might cause issues with proxying
    headers.delete('Content-Encoding');
    headers.delete('Transfer-Encoding');

    // Return the response as a stream
    return new Response(response.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return new Response(`Error proxying PDF: ${error.message}`, { 
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
}
