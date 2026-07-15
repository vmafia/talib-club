import React, { useState } from "react"
import { collection, getDocs, updateDoc } from "firebase/firestore"
import { ref, uploadBytes, getDownloadURL } from "firebase/storage"
import { db, storage } from "../../lib/firebase.js"

export default function AdminMigration() {
  const [status, setStatus] = useState("idle") // idle, scanning, migrating, done, error
  const [logs, setLogs] = useState([])
  const [progress, setProgress] = useState(0)
  const [total, setTotal] = useState(0)

  const addLog = (msg) => setLogs((prev) => [...prev, msg])

  const COLLECTIONS_TO_SCAN = ["content_articles", "content_books", "content_media", "content_scholars"]
  const TARGET_STRING = "this_profile's_activity_across_facebook"

  const startMigration = async () => {
    setStatus("scanning")
    setLogs([])
    setProgress(0)
    setTotal(0)
    
    try {
      addLog("Starting scan...")
      const docsToMigrate = []

      // 1. Scan phase
      for (const colName of COLLECTIONS_TO_SCAN) {
        addLog(`Scanning collection: ${colName}...`)
        const snapshot = await getDocs(collection(db, colName))
        snapshot.forEach(docSnap => {
          const data = docSnap.data()
          // Find any string field containing the target string
          const fieldsToUpdate = {}
          for (const [key, value] of Object.entries(data)) {
            if (typeof value === "string" && value.includes(TARGET_STRING)) {
              fieldsToUpdate[key] = value
            }
          }
          if (Object.keys(fieldsToUpdate).length > 0) {
            docsToMigrate.push({
              colName,
              id: docSnap.id,
              ref: docSnap.ref,
              fields: fieldsToUpdate
            })
          }
        })
      }

      setTotal(docsToMigrate.length)
      addLog(`Found ${docsToMigrate.length} documents requiring image migration.`)

      if (docsToMigrate.length === 0) {
        setStatus("done")
        addLog("No documents need migration!")
        return
      }

      setStatus("migrating")
      
      // 2. Migration phase
      let completed = 0
      for (const item of docsToMigrate) {
        const updates = {}
        for (const [fieldName, localUrl] of Object.entries(item.fields)) {
          addLog(`Migrating [${item.colName}/${item.id}] field '${fieldName}'...`)
          
          try {
            // Fetch local image
            // Since public/ is hosted at the root, the URL starts with /this_profile's...
            // If localUrl doesn't start with '/', we ensure it does for relative fetching
            let fetchUrl = localUrl
            if (!fetchUrl.startsWith('/')) {
              fetchUrl = `/${fetchUrl}`
            }
            // Some URLs might be hardcoded as http://localhost:5173/this_profile... we can just use URL object to get pathname
            try {
               const parsedUrl = new URL(fetchUrl, window.location.origin)
               fetchUrl = parsedUrl.pathname
            } catch (e) {}
            
            const response = await fetch(fetchUrl)
            if (!response.ok) throw new Error(`Failed to fetch local image: ${response.statusText}`)
            const blob = await response.blob()

            // Upload to Firebase Storage
            const ext = fetchUrl.split('.').pop() || 'jpg'
            const storagePath = `migrated_covers/${item.colName}/${item.id}_${fieldName}.${ext}`
            const storageRef = ref(storage, storagePath)
            
            await uploadBytes(storageRef, blob)
            const downloadUrl = await getDownloadURL(storageRef)
            
            updates[fieldName] = downloadUrl
            addLog(` -> Uploaded successfully. New URL generated.`)
          } catch (err) {
            addLog(` -> ERROR: ${err.message}`)
            console.error("Migration error:", err)
          }
        }

        if (Object.keys(updates).length > 0) {
          await updateDoc(item.ref, updates)
          addLog(` -> Updated document ${item.id} in Firestore.`)
        }

        completed++
        setProgress(completed)
      }

      setStatus("done")
      addLog("Migration completed successfully!")
      
    } catch (err) {
      console.error(err)
      setStatus("error")
      addLog(`CRITICAL ERROR: ${err.message}`)
    }
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: 20 }}>
      <h2 style={{ fontSize: 24, marginBottom: 16 }}>Image Migration Tool</h2>
      <p style={{ color: "var(--t2)", marginBottom: 24 }}>
        This tool will scan your database for local images pointing to the Facebook export folder, 
        upload them to your secure Firebase Storage, and update the database automatically.
      </p>
      
      <div style={{ background: "var(--card-bg)", border: "1px solid var(--br)", borderRadius: 12, padding: 24 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 20 }}>
          <button 
            className="btn btn-teal" 
            onClick={startMigration} 
            disabled={status === "scanning" || status === "migrating"}
            style={{ padding: "12px 24px", fontSize: 16 }}
          >
            {status === "idle" && "Start Migration"}
            {status === "scanning" && "Scanning..."}
            {status === "migrating" && "Migrating Images..."}
            {status === "done" && "Migration Finished (Run Again?)"}
            {status === "error" && "Retry Migration"}
          </button>
          
          {(status === "migrating" || status === "done") && (
            <div style={{ fontSize: 16, fontWeight: "bold", color: "var(--teal)" }}>
              Progress: {progress} / {total}
            </div>
          )}
        </div>
        
        <div style={{ 
          background: "var(--bg2)", 
          border: "1px solid var(--br)", 
          borderRadius: 8, 
          padding: 16, 
          height: 400, 
          overflowY: "auto",
          fontFamily: "monospace",
          fontSize: 13,
          lineHeight: 1.6,
          color: "var(--t2)"
        }}>
          {logs.length === 0 ? (
            <div style={{ color: "var(--t3)", fontStyle: "italic" }}>Logs will appear here...</div>
          ) : (
            logs.map((log, idx) => (
              <div key={idx} style={{ 
                color: log.includes("ERROR") ? "var(--red)" : log.includes("successfully") ? "var(--teal)" : "inherit" 
              }}>
                {log}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
