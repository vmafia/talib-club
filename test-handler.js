import handler from './api/seo-prerender.js';

async function run() {
  const req = { headers: { host: 'localhost' }, url: '/article?id=4828ca67-3322-4d21-88bd-0acc80c6eb34' };
  const res = {
    setHeader: (k, v) => console.log('SetHeader:', k, v),
    status: (code) => {
      console.log('Status:', code);
      return { send: (html) => console.log('Sent HTML length:', html.length) };
    }
  };
  await handler(req, res);
}

run().catch(console.error);
