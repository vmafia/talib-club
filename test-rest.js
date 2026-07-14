async function testREST() {
  const res = await fetch('https://firestore.googleapis.com/v1/projects/talib-club-web/databases/(default)/documents/content_articles?pageSize=1');
  const json = await res.json();
  console.log(JSON.stringify(json.documents[0].fields).substring(0, 200));
}
testREST();
