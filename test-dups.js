
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const admin = require('firebase-admin');

// We need credentials
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
} else {
  // If no env var, we can't run it locally easily unless we use application default credentials
  console.log('No credentials');
  process.exit(1);
}

async function checkDups() {
  const db = getFirestore();
  const snapshot = await db.collection('content_articles').get();
  console.log('Total articles:', snapshot.docs.length);
  const titles = {};
  let dups = 0;
  snapshot.docs.forEach(doc => {
    const t = doc.data().title;
    if (titles[t]) {
      dups++;
    } else {
      titles[t] = doc.id;
    }
  });
  console.log('Duplicates:', dups);
}
checkDups();

