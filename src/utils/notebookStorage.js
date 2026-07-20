import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../lib/firebase.js";

// Helper to compress JSON string to gzip Blob
async function compressString(str) {
  const stream = new Blob([str], { type: 'application/json' }).stream();
  const compressedStream = stream.pipeThrough(new CompressionStream("gzip"));
  return new Response(compressedStream).blob();
}

// Helper to decompress gzip Blob to JSON string
async function decompressBlob(blob) {
  const ds = new DecompressionStream("gzip");
  const decompressedStream = blob.stream().pipeThrough(ds);
  return new Response(decompressedStream).text();
}

/**
 * Uploads notebook data to Firebase Storage with Gzip compression
 */
export async function uploadNotebookData(uid, notebookId, dataObj) {
  try {
    const jsonStr = JSON.stringify(dataObj);
    const compressedBlob = await compressString(jsonStr);
    const storageRef = ref(storage, `notebooks/${uid}/${notebookId}.json.gz`);
    
    // Upload compressed file
    await uploadBytes(storageRef, compressedBlob, { contentType: 'application/gzip' });
    
    // Return the download URL
    return await getDownloadURL(storageRef);
  } catch (err) {
    console.error("Failed to upload notebook", err);
    throw err;
  }
}

/**
 * Downloads and decompresses notebook data from Firebase Storage
 */
export async function downloadNotebookData(uid, notebookId) {
  try {
    const storageRef = ref(storage, `notebooks/${uid}/${notebookId}.json.gz`);
    const url = await getDownloadURL(storageRef);
    const response = await fetch(url);
    if (!response.ok) throw new Error("Network response was not ok");
    
    const blob = await response.blob();
    const jsonStr = await decompressBlob(blob);
    return JSON.parse(jsonStr);
  } catch (err) {
    // Return null if not found (e.g. new notebook)
    return null;
  }
}
