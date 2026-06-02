import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { SURA_LIST } from "../data/surahs.js"
import { getSurahTheme } from "../data/quranThemes.js"
import { useContentCollection } from "../lib/contentStore.js"
import toast from "react-hot-toast"
import { confirmAction } from "../utils/feedback.jsx"
import QURAN_BENEFITS from "../data/quranBenefits.json"

const JUZ_STARTS = [
  { juz: 1, sura: 1, ayah: 1, label: "ยุซอ์ที่ 1 (ซูเราะฮ์ 1:1)" },
  { juz: 2, sura: 2, ayah: 142, label: "ยุซอ์ที่ 2 (ซูเราะฮ์ 2:142)" },
  { juz: 3, sura: 2, ayah: 253, label: "ยุซอ์ที่ 3 (ซูเราะฮ์ 2:253)" },
  { juz: 4, sura: 3, ayah: 93, label: "ยุซอ์ที่ 4 (ซูเราะฮ์ 3:93)" },
  { juz: 5, sura: 4, ayah: 24, label: "ยุซอ์ที่ 5 (ซูเราะฮ์ 4:24)" },
  { juz: 6, sura: 4, ayah: 148, label: "ยุซอ์ที่ 6 (ซูเราะฮ์ 4:148)" },
  { juz: 7, sura: 5, ayah: 82, label: "ยุซอ์ที่ 7 (ซูเราะฮ์ 5:82)" },
  { juz: 8, sura: 6, ayah: 111, label: "ยุซอ์ที่ 8 (ซูเราะฮ์ 6:111)" },
  { juz: 9, sura: 7, ayah: 88, label: "ยุซอ์ที่ 9 (ซูเราะฮ์ 7:88)" },
  { juz: 10, sura: 8, ayah: 41, label: "ยุซอ์ที่ 10 (ซูเราะฮ์ 8:41)" },
  { juz: 11, sura: 9, ayah: 93, label: "ยุซอ์ที่ 11 (ซูเราะฮ์ 9:93)" },
  { juz: 12, sura: 11, ayah: 6, label: "ยุซอ์ที่ 12 (ซูเราะฮ์ 11:6)" },
  { juz: 13, sura: 12, ayah: 53, label: "ยุซอ์ที่ 13 (ซูเราะฮ์ 12:53)" },
  { juz: 14, sura: 15, ayah: 1, label: "ยุซอ์ที่ 14 (ซูเราะฮ์ 15:1)" },
  { juz: 15, sura: 17, ayah: 1, label: "ยุซอ์ที่ 15 (ซูเราะฮ์ 17:1)" },
  { juz: 16, sura: 18, ayah: 75, label: "ยุซอ์ที่ 16 (ซูเราะฮ์ 18:75)" },
  { juz: 17, sura: 21, ayah: 1, label: "ยุซอ์ที่ 17 (ซูเราะฮ์ 21:1)" },
  { juz: 18, sura: 23, ayah: 1, label: "ยุซอ์ที่ 18 (ซูเราะฮ์ 23:1)" },
  { juz: 19, sura: 25, ayah: 21, label: "ยุซอ์ที่ 19 (ซูเราะฮ์ 25:21)" },
  { juz: 20, sura: 27, ayah: 56, label: "ยุซอ์ที่ 20 (ซูเราะฮ์ 27:56)" },
  { juz: 21, sura: 29, ayah: 46, label: "ยุซอ์ที่ 21 (ซูเราะฮ์ 29:46)" },
  { juz: 22, sura: 33, ayah: 31, label: "ยุซอ์ที่ 22 (ซูเราะฮ์ 33:31)" },
  { juz: 23, sura: 36, ayah: 28, label: "ยุซอ์ที่ 23 (ซูเราะฮ์ 36:28)" },
  { juz: 24, sura: 39, ayah: 32, label: "ยุซอ์ที่ 24 (ซูเราะฮ์ 39:32)" },
  { juz: 25, sura: 41, ayah: 47, label: "ยุซอ์ที่ 25 (ซูเราะฮ์ 41:47)" },
  { juz: 26, sura: 46, ayah: 1, label: "ยุซอ์ที่ 26 (ซูเราะฮ์ 46:1)" },
  { juz: 27, sura: 51, ayah: 31, label: "ยุซอ์ที่ 27 (ซูเราะฮ์ 51:31)" },
  { juz: 28, sura: 58, ayah: 1, label: "ยุซอ์ที่ 28 (ซูเราะฮ์ 58:1)" },
  { juz: 29, sura: 67, ayah: 1, label: "ยุซอ์ที่ 29 (ซูเราะฮ์ 67:1)" },
  { juz: 30, sura: 78, ayah: 1, label: "ยุซอ์ที่ 30 (ซูเราะฮ์ 78:1)" }
]

const normalizeSuraNumber = (value) => {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 114 ? parsed : 1
}

const normalizeAyahNumber = (value) => {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export default function Quran({ initialSura, initialAyah, authState }) {
  const [selectedSura, setSelectedSura] = useState(() => normalizeSuraNumber(initialSura))
  const readingAreaRef = useRef(null)
  
  const scrollToReadingArea = () => {
    if (readingAreaRef.current) {
      readingAreaRef.current.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem("quran-sidebar-collapsed") === "true"
  })
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const [benefitsExpanded, setBenefitsExpanded] = useState(false)
  const [showObjective, setShowObjective] = useState(false)
  const [scrollPercent, setScrollPercent] = useState(0)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [searchHasRun, setSearchHasRun] = useState(false)
  const [targetScrollAyah, setTargetScrollAyah] = useState(() => normalizeAyahNumber(initialAyah))
  const [reloadKey, setReloadKey] = useState(0)
  
  // Navigation Mode: "surah" | "juz" | "page"
  const [navMode, setNavMode] = useState("surah")
  const [pageInput, setPageInput] = useState("")

  // Page-based reading states
  const [selectedPage, setSelectedPage] = useState(null)
  const [pageVerses, setPageVerses] = useState([])
  const [pageLoading, setPageLoading] = useState(false)

  useEffect(() => {
    localStorage.setItem("quran-sidebar-collapsed", sidebarCollapsed)
  }, [sidebarCollapsed])

  useEffect(() => {
    setBenefitsExpanded(false)
    setShowObjective(false)
  }, [selectedSura])

  // Synchronize Quran selection (selectedSura and targetScrollAyah) with the browser URL query parameters
  useEffect(() => {
    const url = new URL(window.location.href)
    const isQuranPage = url.pathname === "/quran"
    const isMemberQuran = url.pathname === "/member" && url.searchParams.get("view") === "quran"
    
    if (isQuranPage || isMemberQuran) {
      const prevSura = url.searchParams.get("sura")
      const prevAyah = url.searchParams.get("ayah")
      
      let changed = false
      if (prevSura !== String(selectedSura)) {
        url.searchParams.set("sura", String(selectedSura))
        url.searchParams.delete("ayah") // Clear ayah on surah change
        changed = true
      }
      
      if (targetScrollAyah && prevAyah !== String(targetScrollAyah)) {
        url.searchParams.set("ayah", targetScrollAyah)
        changed = true
      }
      if (!targetScrollAyah && prevAyah) {
        url.searchParams.delete("ayah")
        changed = true
      }
      
      if (changed) {
        window.history.replaceState(window.history.state, "", url.pathname + url.search)
      }
    }
  }, [selectedSura, targetScrollAyah])

  // Track window scroll for progress bar and scroll-to-top button
  useEffect(() => {
    const handleScroll = () => {
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight
      if (totalHeight > 0) {
        setScrollPercent((window.scrollY / totalHeight) * 100)
      }
      setShowScrollTop(window.scrollY > 300)
    }
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  // Fetch verses for page-based reading
  useEffect(() => {
    if (!selectedPage) return
    let active = true
    setPageLoading(true)
    setPageVerses([])
    
    // Fetch Arabic text for Mushaf page display
    fetch(`https://api.alquran.cloud/v1/page/${selectedPage}/quran-simple`)
      .then(res => res.json())
      .then(data => {
        if (!active) return
        if (data.code === 200 && data.data?.ayahs) {
          const ayahs = data.data.ayahs
          setPageVerses(ayahs.map(aya => ({
            id: aya.number,
            sura: aya.surah.number,
            aya: aya.numberInSurah,
            arabic_text: aya.text,
            suraName: aya.surah.englishName
          })))
          if (ayahs.length > 0) {
            setSelectedSura(ayahs[0].surah.number)
          }
        }
        setPageLoading(false)
      })
      .catch(err => {
        if (!active) return
        console.error(err)
        setPageLoading(false)
        toast.error("ไม่สามารถโหลดข้อมูลหน้าได้")
      })
      
    return () => {
      active = false
    }
  }, [selectedPage])

  const [search, setSearch] = useState("")
  const [mode, setMode] = useState("translation") // "mushaf" | "translation" | "tafsir"
  const [translationKey, setTranslationKey] = useState("thai_complex") // "thai_complex" | "thai_rwwad"

  // Reset selectedPage if mode leaves mushaf
  useEffect(() => {
    if (mode !== "mushaf") {
      setSelectedPage(null)
    }
  }, [mode])
  
  const [arabicSize, setArabicSize] = useState(32) // px
  const [thaiSize, setThaiSize] = useState(15) // px
  
  const [verses, setVerses] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const cache = useRef({}) // Cache fetches
  
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  
  // Search & Navigation States
  const [sidebarTab, setSidebarTab] = useState("surah") // "surah" | "search"
  const [keywordQuery, setKeywordQuery] = useState("")
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState(null)
  // Bookmarks (Reflection notes) from Firestore
  const { items: savedVerses, saveItem, deleteItem } = useContentCollection("quran_bookmarks", [])
  const uid = authState?.user?.uid

  // Last Read Position from Firestore & local storage
  const { items: lastReadPos, saveItem: saveLastRead } = useContentCollection("quran_last_read", [])
  const [lastRead, setLastRead] = useState(() => {
    try {
      const local = localStorage.getItem("quran-last-read")
      return local ? JSON.parse(local) : null
    } catch {
      return null
    }
  })

  useEffect(() => {
    if (uid && lastReadPos && lastReadPos.length > 0) {
      const userLastRead = lastReadPos.find(item => item.uid === uid)
      if (userLastRead) {
        setLastRead(userLastRead)
        localStorage.setItem("quran-last-read", JSON.stringify(userLastRead))
      }
    }
  }, [lastReadPos, uid])

  const updateLastRead = async (suraNum, ayahNum) => {
    const suraInfo = SURA_LIST.find(s => s.number === suraNum)
    const newItem = {
      id: uid ? `${uid}_last_read` : "local_last_read",
      uid: uid || "guest",
      sura: suraNum,
      aya: ayahNum,
      suraName: suraInfo ? suraInfo.englishName : "",
      suraThaiName: suraInfo ? suraInfo.englishNameTranslation : "",
      updatedAt: new Date().toISOString()
    }
    
    setLastRead(newItem)
    localStorage.setItem("quran-last-read", JSON.stringify(newItem))
    
    if (uid) {
      try {
        await saveLastRead(newItem)
      } catch (err) {
        console.error("Failed to save last read to Firestore", err)
      }
    }
  }

  const handleSelectPage = (pageNumber) => {
    const pNum = Number(pageNumber)
    if (isNaN(pNum) || pNum < 1 || pNum > 604) {
      toast.error("กรุณาระบุเลขหน้าตั้งแต่ 1 ถึง 604")
      return
    }
    setMode("mushaf")
    setSelectedPage(pNum)
    setPageInput("")
    setTargetScrollAyah(null)
    if (isMobile) setIsMobileNavOpen(false)
    window.setTimeout(scrollToReadingArea, 80)
  }

  const performSearch = async (query) => {
    if (!query.trim()) return
    setSearchLoading(true)
    setSearchError(null)
    try {
      const res = await fetch(`https://api.alquran.cloud/v1/search/${encodeURIComponent(query)}/all/th.thai`)
      const data = await res.json()
      if (data.code === 200 && data.status === "OK" && data.data?.matches) {
        setSearchResults(data.data.matches)
      } else {
        setSearchResults([])
      }
      setSearchHasRun(true)
    } catch (err) {
      console.error(err)
      setSearchError("ไม่พบข้อมูล หรือการเชื่อมต่อเครือข่ายขัดข้อง")
    } finally {
      setSearchLoading(false)
    }
  }

  // Debounced Live Search Effect
  useEffect(() => {
    if (!keywordQuery.trim()) {
      setSearchResults([])
      setSearchHasRun(false)
      setSearchError(null)
      return
    }

    setSearchHasRun(false) // Reset immediately when typing starts

    const delayDebounceFn = setTimeout(() => {
      performSearch(keywordQuery)
    }, 600) // 600ms debounce

    return () => clearTimeout(delayDebounceFn)
  }, [keywordQuery])

  const handleKeywordSearch = (e) => {
    if (e) e.preventDefault()
    performSearch(keywordQuery)
  }  
  
  const [activeBookmarkModal, setActiveBookmarkModal] = useState(null)
  const [modalNotes, setModalNotes] = useState("")
  
  // Track mobile resize
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  // Sync with dashboard triggers
  useEffect(() => {
    if (initialSura) {
      setSelectedPage(null)
      setSelectedSura(normalizeSuraNumber(initialSura))
    }
  }, [initialSura])

  useEffect(() => {
    if (initialAyah) {
      setTargetScrollAyah(normalizeAyahNumber(initialAyah))
    }
  }, [initialAyah])


  const handleSelectSearchResult = (match) => {
    setSelectedPage(null)
    setSelectedSura(match.surah.number)
    setTargetScrollAyah(match.numberInSurah)
  }

  const handleOpenBookmarkModal = (v, existingBookmark) => {
    if (!uid) {
      toast.error("กรุณาเข้าสู่ระบบก่อนเพื่อทำบันทึกข้อคิด")
      return
    }
    
    setActiveBookmarkModal({
      verseId: v.id,
      sura: selectedSura,
      aya: v.aya,
      suraName: currentSuraInfo.englishName,
      arabicText: v.arabic_text,
      translation: v.translation,
      bookmarkId: existingBookmark?.id || null
    })
    setModalNotes(existingBookmark?.notes || "")
  }

  const handleSaveBookmark = async () => {
    if (!activeBookmarkModal) return
    const toastId = toast.loading("กำลังบันทึก...")
    
    try {
      const isNew = !activeBookmarkModal.bookmarkId
      const id = activeBookmarkModal.bookmarkId || `${uid}_sura_${activeBookmarkModal.sura}_aya_${activeBookmarkModal.aya}`
      
      await saveItem({
        id,
        uid,
        sura: activeBookmarkModal.sura,
        aya: activeBookmarkModal.aya,
        suraName: activeBookmarkModal.suraName,
        arabicText: activeBookmarkModal.arabicText,
        translation: activeBookmarkModal.translation,
        notes: modalNotes,
        updatedAt: new Date()
      })
      
      toast.success(isNew ? "บันทึกอายะฮ์สำเร็จ" : "อัปเดตข้อคิดแล้ว", { id: toastId })
      setActiveBookmarkModal(null)
    } catch (err) {
      toast.error("บันทึกผิดพลาดกรุณาลองใหม่", { id: toastId })
    }
  }

  const handleDeleteBookmark = async () => {
    if (!activeBookmarkModal?.bookmarkId) return
    const ok = await confirmAction({
      title: "ลบอายะฮ์ที่บันทึก?",
      message: "คุณต้องการลบข้อบันทึกสำหรับอายะฮ์นี้ใช่หรือไม่?",
      confirmText: "ลบออก",
      danger: true
    })
    
    if (ok) {
      const toastId = toast.loading("กำลังลบ...")
      try {
        await deleteItem(activeBookmarkModal.bookmarkId)
        toast.success("ลบรายการบันทึกแล้ว", { id: toastId })
        setActiveBookmarkModal(null)
      } catch (err) {
        toast.error("ลบไม่สำเร็จ", { id: toastId })
      }
    }
  }

  const getBookmarkForVerse = (ayaNumber) => {
    if (!uid) return null
    return savedVerses.find(v => v.uid === uid && v.sura === selectedSura && v.aya === ayaNumber)
  }

  // Filter Surahs
  const filteredSurahs = SURA_LIST.filter(s => {
    const query = search.toLowerCase().trim()
    return !query || 
      s.englishName.toLowerCase().includes(query) ||
      s.englishNameTranslation.toLowerCase().includes(query) ||
      s.name.includes(query) ||
      String(s.number) === query
  })

  const currentSuraInfo = SURA_LIST.find(s => s.number === selectedSura) || SURA_LIST[0]

  // Fetch Sura verses
  useEffect(() => {
    let active = true
    const cacheKey = `${translationKey}-${selectedSura}`
    
    if (cache.current[cacheKey]) {
      setVerses(cache.current[cacheKey])
      setError(null)
      return
    }
    
    setLoading(true)
    setError(null)
    
    const transUrl = `https://quranenc.com/api/v1/translation/sura/${translationKey}/${selectedSura}`
    const tafsirUrl = `https://quranenc.com/api/v1/translation/sura/thai_mokhtasar/${selectedSura}`
    
    Promise.all([
      fetch(transUrl).then(res => {
        if (!res.ok) throw new Error("ไม่สามารถเชื่อมต่อคำแปลความหมายจากระบบ QuranEnc ได้")
        return res.json()
      }),
      fetch(tafsirUrl).then(res => {
        if (!res.ok) throw new Error("ไม่สามารถเชื่อมต่อบทอธิบายความหมายย่อ (Tafsir) ได้")
        return res.json()
      })
    ])
    .then(([transData, tafsirData]) => {
      if (!active) return
      
      const merged = transData.result.map((aya, idx) => {
        const tafsirAya = tafsirData.result[idx] || {}
        return {
          id: aya.id,
          sura: aya.sura,
          aya: aya.aya,
          arabic_text: aya.arabic_text,
          translation: aya.translation,
          tafsir: tafsirAya.translation || ""
        }
      })
      
      cache.current[cacheKey] = merged
      setVerses(merged)
      setLoading(false)
    })
    .catch(err => {
      if (!active) return
      console.error(err)
      setError(err.message || "เกิดข้อผิดพลาดในการโหลดข้อมูลกรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต")
      setLoading(false)
    })
    
    return () => {
      active = false
    }
  }, [selectedSura, translationKey, reloadKey])

  useEffect(() => {
    if (targetScrollAyah && !loading && verses.length > 0) {
      const element = document.getElementById(`ayah-${targetScrollAyah}`)
      if (element) {
        const timer1 = setTimeout(() => {
          element.scrollIntoView({ behavior: "smooth", block: "center" })
          element.classList.add("pulse-highlight")
          const timer2 = setTimeout(() => {
            element.classList.remove("pulse-highlight")
            setTargetScrollAyah(null)
          }, 3000)
          return () => clearTimeout(timer2)
        }, 350)
        return () => clearTimeout(timer1)
      }
    }
  }, [targetScrollAyah, loading, verses])

  // Helper to draw Arabic numbers inside verse markers (for Mushaf Mode)
  const getArabicNumber = (num) => {
    const arabicDigits = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"]
    return String(num).split("").map(digit => arabicDigits[Number(digit)] || digit).join("")
  }

  const hasBismillah = selectedSura !== 1 && selectedSura !== 9

  return (
    <div className="quran-container">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap');
        
        .quran-container {
          --quran-bg: var(--bg);
          --quran-card-bg: var(--card);
          --quran-text: var(--text);
          --quran-t2: var(--t2);
          --quran-t3: var(--t3);
          --quran-br: var(--br);
          --quran-br2: var(--br2);
          --quran-acc2: var(--acc2);
          --quran-teal: var(--teal);
          --quran-teal-bg: var(--teal-bg);

          padding: 24px;
          border-radius: 20px;
          background: var(--quran-bg);
          color: var(--quran-text);
          transition: background 0.3s, color 0.3s;
        }
        @media (max-width: 767px) {
          .quran-container {
            padding: 16px 0 0 0;
            border-radius: 0;
          }
        }

        .quran-container .card {
          background: var(--quran-card-bg) !important;
          border-color: var(--quran-br) !important;
          color: var(--quran-text) !important;
          box-shadow: 0 4px 20px rgba(0,0,0,0.02) !important;
        }

        .quran-container h1, 
        .quran-container h2, 
        .quran-container h3 {
          color: var(--quran-text) !important;
        }

        .quran-container p,
        .quran-container span {
          color: var(--quran-t2);
        }

        .quran-container input,
        .quran-container select {
          background: var(--quran-card-bg) !important;
          color: var(--quran-text) !important;
          border-color: var(--quran-br) !important;
        }
        
        .quran-container input::placeholder {
          color: var(--quran-t3) !important;
        }

        .surah-item {
          transition: all 0.2s ease;
          cursor: pointer;
          color: var(--quran-text) !important;
          border-bottom: 0.5px solid var(--quran-br) !important;
        }
        
        .surah-item span,
        .surah-item div {
          color: inherit;
        }
        
        .surah-item:hover {
          background: var(--quran-bg) !important;
        }
        
        .surah-item.active {
          background: var(--quran-teal-bg) !important;
          border-left: 3.5px solid var(--quran-teal) !important;
          color: var(--quran-teal) !important;
          font-weight: 500;
        }
        
        .quran-sidebar {
          overflow-y: auto;
          flex: 1;
        }
        .quran-sidebar::-webkit-scrollbar {
          width: 5px;
        }
        .quran-sidebar::-webkit-scrollbar-track {
          background: transparent;
        }
        .quran-sidebar::-webkit-scrollbar-thumb {
          background: var(--quran-br);
          border-radius: 4px;
        }
        .arabic-font {
          font-family: 'Amiri', 'Noto Naskh Arabic', 'Traditional Arabic', serif;
          direction: rtl;
          text-align: right;
          line-height: 2.6;
          color: var(--quran-text);
        }
        .mushaf-flow {
          text-align: justify;
          direction: rtl;
          line-height: 2.6;
          color: var(--quran-text);
        }
        .mode-btn {
          font-family: 'Prompt', sans-serif;
          font-size: 11px;
          font-weight: 400;
          padding: 5px 12px;
          border-radius: 20px;
          border: 0.5px solid var(--quran-br);
          background: var(--quran-card-bg);
          color: var(--quran-t2);
          cursor: pointer;
          transition: all 0.15s;
        }
        .mode-btn.active {
          background: var(--quran-teal);
          color: #fff;
          border-color: var(--quran-teal);
        }
        .size-btn {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          border: 0.5px solid var(--quran-br);
          background: var(--quran-card-bg);
          color: var(--quran-text);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          transition: all 0.15s;
        }
        .size-btn:hover {
          background: var(--quran-bg);
        }
        .tafsir-box {
          background: var(--quran-acc2);
          border-left: 3px solid var(--quran-teal);
          padding: 14px 18px;
          border-radius: 0 10px 10px 0;
          margin-top: 8px;
        }
        .tafsir-box div {
          color: var(--quran-text);
        }
        @keyframes pulse-highlight {
          0% { background-color: var(--quran-teal-bg); box-shadow: 0 0 12px rgba(45, 190, 160, 0.4); }
          50% { background-color: rgba(45, 190, 160, 0.25); box-shadow: 0 0 15px rgba(45, 190, 160, 0.5); }
          100% { background-color: transparent; box-shadow: none; }
        }
        .pulse-highlight {
          animation: pulse-highlight 3.2s ease-in-out;
          border-radius: 8px;
        }
        .sidebar-tab-btn {
          flex: 1;
          padding: 8px;
          font-family: 'Prompt', sans-serif;
          font-size: 12px;
          font-weight: 500;
          border: none;
          background: transparent;
          cursor: pointer;
          color: var(--quran-t3);
          border-bottom: 2px solid transparent;
          transition: all 0.2s;
        }
        .sidebar-tab-btn.active {
          color: var(--quran-teal);
          border-bottom-color: var(--quran-teal);
        }
        .search-result-item {
          padding: 12px;
          border-bottom: 0.5px solid var(--quran-br);
          cursor: pointer;
          transition: all 0.2s;
          color: var(--quran-text);
        }
        .search-result-item:hover {
          background: var(--quran-bg);
        }
        .search-highlight {
          background-color: rgba(255, 179, 0, 0.25);
          padding: 0 2px;
          border-radius: 2px;
          font-weight: 500;
        }
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes loadingBar {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      {/* HEADER TITLE */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ marginBottom: 8 }}>พระมหาคัมภีร์อัลกุรอาน</h1>
        <p style={{ color: "var(--t2)" }}>
          ระบบอ่านอัลกุรอานภาษาไทย พร้อมคำแปลความหมายต่ออายะฮ์ และบทอธิบายความหมายย่อ (ตัฟซีรย่อ)
        </p>
      </div>

      {/* LAST READ BANNER */}
      {lastRead && (
        <div className="card" style={{ 
          padding: "12px 18px", 
          marginBottom: 20, 
          background: "var(--teal-bg)", 
          borderColor: "rgba(45, 190, 160, 0.2)",
          display: "flex", 
          justifyContent: "space-between", 
          alignItems: "center",
          flexWrap: "wrap",
          gap: 10,
          textAlign: "left"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <i className="ti ti-flag-2" style={{ color: "var(--teal)", fontSize: 16 }}></i>
            <span style={{ fontSize: 12, fontWeight: 500 }}>
              อ่านค้างไว้ล่าสุด: <strong>ซูเราะฮ์ {lastRead.suraName} ({lastRead.suraThaiName}) อายะฮ์ที่ {lastRead.aya}</strong>
            </span>
          </div>
          <button 
            className="btn btn-teal" 
            style={{ padding: "5px 14px", fontSize: 11 }}
            onClick={() => {
              setSelectedPage(null)
              setSelectedSura(lastRead.sura)
              setTargetScrollAyah(lastRead.aya)
            }}
          >
            ย้อนกลับไปอ่านจุดเดิม
          </button>
        </div>
      )}

      {/* CONTENT LAYOUT */}
      <div style={{ display: "flex", gap: sidebarCollapsed && !isMobile ? 0 : 24, flexDirection: isMobile ? "column" : "row", position: "relative" }}>
        {!isMobile ? (
          <div style={{ 
            width: sidebarCollapsed ? 0 : 280, 
            transition: "width 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
            flexShrink: 0,
            height: "calc(100vh - 120px)",
            position: "sticky",
            top: 20,
            zIndex: 10
          }}>
            {/* Floating Toggle Button */}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              style={{
                position: "absolute",
                right: sidebarCollapsed ? "-16px" : "-16px",
                top: "40px",
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                background: "var(--quran-teal)",
                color: "#fff",
                border: "2.5px solid var(--quran-card-bg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                zIndex: 20,
                boxShadow: "0 2px 10px rgba(0,0,0,0.12)",
                transition: "transform 0.2s ease"
              }}
              title={sidebarCollapsed ? "เปิดแถบรายชื่อซูเราะฮ์" : "ปิดแถบรายชื่อซูเราะฮ์"}
            >
              <i className={`ti ${sidebarCollapsed ? "ti-chevron-right" : "ti-chevron-left"}`} style={{ fontSize: 12, fontWeight: "bold" }}></i>
            </button>

            {/* Inner Wrapper (to hide content during collapse) */}
            <div style={{
              width: 280,
              paddingRight: sidebarCollapsed ? 0 : 16, // Prevents toggle button overlap
              height: "100%",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              opacity: sidebarCollapsed ? 0 : 1,
              transition: "opacity 0.25s ease, padding-right 0.3s ease",
              pointerEvents: sidebarCollapsed ? "none" : "auto",
              overflow: "hidden"
            }}>
              {/* Sidebar Tabs */}
              <div style={{ display: "flex", borderBottom: "0.5px solid var(--quran-br)" }}>
                <button 
                  className={`sidebar-tab-btn ${sidebarTab === "surah" ? "active" : ""}`}
                  onClick={() => setSidebarTab("surah")}
                >
                  รายชื่อซูเราะฮ์
                </button>
                <button 
                  className={`sidebar-tab-btn ${sidebarTab === "search" ? "active" : ""}`}
                  onClick={() => setSidebarTab("search")}
                >
                  ค้นหาในอายะฮ์
                </button>
              </div>

              {/* Sidebar Tab Content */}
              {sidebarTab === "surah" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minHeight: 0 }}>
                  {/* Sub-Navigation Switcher (Surah | Juz | Page) */}
                  <div style={{ display: "flex", gap: 4, background: "var(--quran-br2)", padding: 3, borderRadius: 8 }}>
                    <button 
                      onClick={() => setNavMode("surah")}
                      style={{ 
                        flex: 1, 
                        padding: "5px 8px", 
                        borderRadius: 6, 
                        border: "none", 
                        background: navMode === "surah" ? "var(--quran-teal)" : "transparent",
                        color: navMode === "surah" ? "#fff" : "var(--quran-t2)",
                        fontSize: 11,
                        cursor: "pointer",
                        fontWeight: navMode === "surah" ? 500 : 300,
                        transition: "all 0.15s"
                      }}
                    >
                      ซูเราะฮ์
                    </button>
                    <button 
                      onClick={() => setNavMode("juz")}
                      style={{ 
                        flex: 1, 
                        padding: "5px 8px", 
                        borderRadius: 6, 
                        border: "none", 
                        background: navMode === "juz" ? "var(--quran-teal)" : "transparent",
                        color: navMode === "juz" ? "#fff" : "var(--quran-t2)",
                        fontSize: 11,
                        cursor: "pointer",
                        fontWeight: navMode === "juz" ? 500 : 300,
                        transition: "all 0.15s"
                      }}
                    >
                      ยุซอ์
                    </button>
                    <button 
                      onClick={() => setNavMode("page")}
                      style={{ 
                        flex: 1, 
                        padding: "5px 8px", 
                        borderRadius: 6, 
                        border: "none", 
                        background: navMode === "page" ? "var(--quran-teal)" : "transparent",
                        color: navMode === "page" ? "#fff" : "var(--quran-t2)",
                        fontSize: 11,
                        cursor: "pointer",
                        fontWeight: navMode === "page" ? 500 : 300,
                        transition: "all 0.15s"
                      }}
                    >
                      หน้า
                    </button>
                  </div>

                  {navMode === "surah" && (
                    <>
                      <div style={{ position: "relative" }}>
                        <i className="ti ti-search" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--quran-t3)", fontSize: 13 }}></i>
                        <input 
                          placeholder="ค้นหาชื่อซูเราะห์..."
                          value={search}
                          onChange={e => setSearch(e.target.value)}
                          style={{ width: "100%", paddingLeft: 30, paddingRight: 10, height: 36, fontSize: 12, borderRadius: 8, border: "0.5px solid var(--quran-br)" }}
                        />
                      </div>
                      
                      <div className="quran-sidebar card" style={{ padding: 0, display: "flex", flexDirection: "column", overflowY: "auto", minHeight: 0 }}>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          {filteredSurahs.map(s => (
                            <div 
                              key={s.number} 
                              className={`surah-item ${selectedSura === s.number ? "active" : ""}`}
                              onClick={() => {
                                setSelectedPage(null)
                                setSelectedSura(s.number)
                              }}
                              style={{ 
                                padding: "10px 14px", 
                                display: "flex", 
                                justifyContent: "space-between", 
                                alignItems: "center", 
                                borderBottom: "0.5px solid var(--quran-br)"
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: "10px", color: "var(--quran-t3)", width: 18, textAlign: "center" }}>{s.number}</span>
                                <div style={{ textAlign: "left" }}>
                                  <div style={{ fontSize: "12px", fontWeight: 500 }}>{s.englishName}</div>
                                  <div style={{ fontSize: "9px", color: "var(--quran-t2)" }}>{s.englishNameTranslation}</div>
                                </div>
                              </div>
                              <div style={{ textAlign: "right" }}>
                                <div style={{ fontSize: "14px", fontFamily: "'Amiri', serif" }}>{s.name}</div>
                                <div style={{ fontSize: "9px", color: "var(--quran-t3)" }}>{s.numberOfAyahs} อายะฮ์</div>
                              </div>
                            </div>
                          ))}
                          {filteredSurahs.length === 0 && (
                            <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: "var(--quran-t3)" }}>ไม่พบผลลัพธ์</div>
                          )}
                        </div>
                      </div>
                    </>
                  )}

                  {navMode === "juz" && (
                    <div className="quran-sidebar card" style={{ padding: 0, display: "flex", flexDirection: "column", overflowY: "auto", minHeight: 0 }}>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        {JUZ_STARTS.map(j => (
                          <div 
                            key={j.juz} 
                            className={`surah-item`}
                            onClick={() => {
                              setSelectedPage(null)
                              setSelectedSura(j.sura)
                              setTargetScrollAyah(j.ayah)
                            }}
                            style={{ 
                              padding: "12px 14px", 
                              display: "flex", 
                              justifyContent: "space-between", 
                              alignItems: "center", 
                              borderBottom: "0.5px solid var(--quran-br)"
                            }}
                          >
                            <div style={{ textAlign: "left" }}>
                              <div style={{ fontSize: "12px", fontWeight: 500 }}>ยุซอ์ที่ {j.juz}</div>
                              <div style={{ fontSize: "10px", color: "var(--quran-teal)" }}>เริ่มต้น ซูเราะฮ์ที่ {j.sura} อายะฮ์ {j.ayah}</div>
                            </div>
                            <i className="ti ti-chevron-right" style={{ fontSize: 12, color: "var(--quran-t3)" }}></i>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {navMode === "page" && (
                    <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                      <div style={{ textAlign: "left" }}>
                        <span style={{ fontSize: 11, color: "var(--quran-t2)", display: "block", marginBottom: 6 }}>เลือกหน้า (1 - 604)</span>
                        <select 
                          value=""
                          onChange={e => {
                            if (e.target.value) handleSelectPage(e.target.value)
                          }}
                          style={{ width: "100%", height: 36, padding: "0 10px", fontSize: 12, borderRadius: 8, border: "0.5px solid var(--quran-br)" }}
                        >
                          <option value="">-- เลือกจากรายการ --</option>
                          {Array.from({ length: 604 }, (_, i) => i + 1).map(p => (
                            <option key={p} value={p}>หน้า {p}</option>
                          ))}
                        </select>
                      </div>

                      <div style={{ borderTop: "0.5px solid var(--quran-br2)", paddingTop: 10, textAlign: "left" }}>
                        <span style={{ fontSize: 11, color: "var(--quran-t2)", display: "block", marginBottom: 6 }}>หรือ พิมพ์เลขหน้าโดยตรง</span>
                        <form 
                          onSubmit={e => {
                            e.preventDefault()
                            if (pageInput) handleSelectPage(pageInput)
                          }}
                          style={{ display: "flex", gap: 6 }}
                        >
                          <input 
                            placeholder="1 - 604"
                            type="number"
                            min="1"
                            max="604"
                            value={pageInput}
                            onChange={e => setPageInput(e.target.value)}
                            style={{ flex: 1, height: 36, fontSize: 12, borderRadius: 8, border: "0.5px solid var(--quran-br)" }}
                          />
                          <button className="btn btn-teal" style={{ height: 36, fontSize: 11, padding: "0 14px" }} type="submit">ไป</button>
                        </form>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                // KEYWORD SEARCH TAB
                <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minHeight: 0 }}>
                  <form onSubmit={handleKeywordSearch} style={{ display: "flex", gap: 6 }}>
                    <div style={{ position: "relative", flex: 1 }}>
                      <i className="ti ti-search" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--quran-t3)", fontSize: 13 }}></i>
                      <input 
                        placeholder="เช่น สวรรค์, ความเมตตา, นบี..."
                        value={keywordQuery}
                        onChange={e => setKeywordQuery(e.target.value)}
                        style={{ width: "100%", paddingLeft: 30, paddingRight: 10, height: 36, fontSize: 12, borderRadius: 8, border: "0.5px solid var(--quran-br)" }}
                      />
                    </div>
                    <button className="btn btn-teal" style={{ height: 36, padding: "0 12px", fontSize: 12 }} type="submit">ค้นหา</button>
                  </form>

                  {searchLoading && (
                    <div style={{ textAlign: "center", padding: 24 }}>
                      <i className="ti ti-loader-2 spin" style={{ fontSize: 20, color: "var(--quran-teal)" }}></i>
                      <div style={{ fontSize: 11, color: "var(--quran-t3)", marginTop: 6 }}>กำลังค้นหา...</div>
                    </div>
                  )}

                  {searchError && (
                    <div style={{ color: "var(--red)", fontSize: 11, padding: 8, textAlign: "center" }}>
                      {searchError}
                    </div>
                  )}

                  {!searchLoading && !searchError && (
                    <div className="quran-sidebar card" style={{ padding: 0, display: "flex", flexDirection: "column", overflowY: "auto", minHeight: 0 }}>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        {searchResults.length > 0 && (
                          <div style={{ padding: "10px 12px", fontSize: 11, fontWeight: 500, borderBottom: "0.5px solid var(--quran-br)", background: "var(--quran-teal-bg)", color: "var(--quran-teal)", textAlign: "left" }}>
                            พบคำสำคัญนี้ {searchResults.length} ครั้งในคัมภีร์
                          </div>
                        )}
                        {searchResults.length > 0 ? (
                          searchResults.map((match, i) => {
                            const highlightText = (text, query) => {
                               if (!query) return text
                               const parts = text.split(new RegExp(`(${query})`, "gi"))
                               return parts.map((part, idx) => 
                                 part.toLowerCase() === query.toLowerCase() 
                                   ? <span key={idx} className="search-highlight">{part}</span> 
                                   : part
                               )
                            }

                            return (
                              <div 
                                key={`${match.surah.number}_${match.numberInSurah}_${i}`} 
                                className="search-result-item"
                                onClick={() => handleSelectSearchResult(match)}
                                style={{ padding: "12px", borderBottom: "0.5px solid var(--quran-br)" }}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                  <span style={{ fontSize: 10, fontWeight: 600, color: "var(--quran-teal)" }}>
                                    ซูเราะฮ์ {match.surah.englishName} ({match.numberInSurah})
                                  </span>
                                  <span style={{ fontSize: 9, color: "var(--quran-t3)" }}>
                                    [{match.surah.number}:{match.numberInSurah}]
                                  </span>
                                </div>
                                <div style={{ fontSize: 11, color: "var(--quran-text)", lineHeight: 1.45 }}>
                                  {highlightText(match.text, keywordQuery)}
                                </div>
                              </div>
                            )
                          })
                        ) : (
                          <div style={{ padding: 24, textAlign: "center", fontSize: 11, color: "var(--quran-t3)" }}>
                            {searchHasRun ? "ไม่พบคำสำคัญนี้ในพระคัมภีร์" : "พิมพ์คำค้นหาเพื่อเริ่มค้นหาความหมาย"}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* MOBILE SELECT TRIGGER BAR */
          <div 
            onClick={() => setIsMobileNavOpen(true)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 16px",
              background: "var(--quran-card-bg)",
              border: "1px solid var(--quran-br)",
              borderRadius: "12px",
              cursor: "pointer",
              marginBottom: "4px",
              boxShadow: "0 2px 6px rgba(0,0,0,0.02)"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <i className="ti ti-book" style={{ color: "var(--quran-teal)", fontSize: 16 }}></i>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--quran-text)" }}>
                  ซูเราะฮ์ {currentSuraInfo.number}: {currentSuraInfo.englishName}
                </div>
                <div style={{ fontSize: "10px", color: "var(--quran-t2)" }}>
                  {currentSuraInfo.englishNameTranslation} • {currentSuraInfo.numberOfAyahs} อายะฮ์ (แตะเพื่อเลือก/ค้นหา)
                </div>
              </div>
            </div>
            <i className="ti ti-chevron-down" style={{ color: "var(--quran-t3)", fontSize: 14 }}></i>
          </div>
        )}

        {/* MAIN PANEL */}
        <div style={{ flex: 1, minWidth: 0 }}>
          
          {/* SURAH SUMMARY CARD */}
          <div className="card" style={{ padding: "16px 20px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="badge badge-teal" style={{ fontSize: 9 }}>ซูเราะห์ที่ {currentSuraInfo.number}</span>
                <span className="badge badge-acc" style={{ fontSize: 9 }}>
                  {currentSuraInfo.revelationType === "Meccan" ? "มักกียะฮ์ (ประทานที่มักกะฮ์)" : "มะดะนียะฮ์ (ประทานที่มะดีนะฮ์)"}
                </span>
              </div>
              <h2 style={{ marginTop: 6, fontSize: 18, fontWeight: 600 }}>
                {currentSuraInfo.englishName} <span style={{ fontWeight: 300, fontSize: 13, color: "var(--t2)" }}>({currentSuraInfo.englishNameTranslation})</span>
              </h2>
              <div style={{ fontSize: 11, color: "var(--t2)", marginTop: 2 }}>
                จำนวน {currentSuraInfo.numberOfAyahs} อายะฮ์
              </div>
            </div>
            
            {/* Arabic Big Calligraphy Name */}
            <div style={{ fontSize: 32, fontFamily: "'Amiri', serif", color: "var(--teal)", textShadow: "0 0 1px rgba(45,190,160,0.1)" }}>
              {currentSuraInfo.name}
            </div>
          </div>

          {/* SURAH OBJECTIVE CARD */}
          {getSurahTheme(selectedSura) && (
            <div className="card" style={{ padding: "14px 18px", marginBottom: 16, borderLeft: "4px solid var(--teal)", background: "var(--bg3)" }}>
              <div 
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                onClick={() => setShowObjective(!showObjective)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 500, fontSize: 13, color: "var(--teal)" }}>
                  <i className="ti ti-bulb" style={{ fontSize: 16 }}></i>
                  เป้าหมายและวัตถุประสงค์หลักของซูเราะฮ์
                </div>
                <i className={`ti ${showObjective ? "ti-chevron-up" : "ti-chevron-down"}`} style={{ fontSize: 14, color: "var(--t2)" }}></i>
              </div>
              
              {showObjective && (
                <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.6 }}>
                  <p style={{ fontWeight: 500, color: "var(--text)", margin: "0 0 8px 0" }}>
                    {getSurahTheme(selectedSura).objective}
                  </p>
                  {getSurahTheme(selectedSura).keyThemes && getSurahTheme(selectedSura).keyThemes.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <span style={{ fontSize: 11, color: "var(--t2)", fontWeight: 600, display: "block", marginBottom: 4 }}>ประเด็นสำคัญประจำบท:</span>
                      <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 3, fontSize: 12, color: "var(--t3)" }}>
                        {getSurahTheme(selectedSura).keyThemes.map((topic, idx) => (
                          <li key={idx}>{topic}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* CONTROLS CARD */}
          <div className="card" style={{ padding: isMobile ? "14px" : "16px 20px", marginBottom: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            {isMobile ? (
              // MOBILE LAYOUT
              <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
                {/* Mode Segmented Control */}
                <div style={{ display: "flex", background: "var(--quran-br2)", padding: 3, borderRadius: 10, width: "100%", border: "0.5px solid var(--quran-br2)", overflow: "hidden" }}>
                  <button 
                    className={`mode-btn ${mode === "translation" ? "active" : ""}`}
                    onClick={() => setMode("translation")}
                    style={{
                      flex: 1,
                      padding: "8px 2px",
                      borderRadius: 8,
                      border: "none",
                      background: mode === "translation" ? "var(--quran-teal)" : "transparent",
                      color: mode === "translation" ? "#fff" : "var(--quran-t2)",
                      fontSize: "10px",
                      fontWeight: mode === "translation" ? 500 : 400,
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                      textAlign: "center",
                      overflow: "hidden",
                      minWidth: 0
                    }}
                  >
                    แปลอายะฮ์
                  </button>
                  <button 
                    className={`mode-btn ${mode === "tafsir" ? "active" : ""}`}
                    onClick={() => setMode("tafsir")}
                    style={{
                      flex: 1,
                      padding: "8px 2px",
                      borderRadius: 8,
                      border: "none",
                      background: mode === "tafsir" ? "var(--quran-teal)" : "transparent",
                      color: mode === "tafsir" ? "#fff" : "var(--quran-t2)",
                      fontSize: "10px",
                      fontWeight: mode === "tafsir" ? 500 : 400,
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                      textAlign: "center",
                      overflow: "hidden",
                      minWidth: 0
                    }}
                  >
                    แปล + ตัฟซีร
                  </button>
                  <button 
                    className={`mode-btn ${mode === "mushaf" ? "active" : ""}`}
                    onClick={() => setMode("mushaf")}
                    style={{
                      flex: 1,
                      padding: "8px 2px",
                      borderRadius: 8,
                      border: "none",
                      background: mode === "mushaf" ? "var(--quran-teal)" : "transparent",
                      color: mode === "mushaf" ? "#fff" : "var(--quran-t2)",
                      fontSize: "10px",
                      fontWeight: mode === "mushaf" ? 500 : 400,
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                      textAlign: "center",
                      overflow: "hidden",
                      minWidth: 0
                    }}
                  >
                    มุศฮัฟล้วน
                  </button>
                </div>

                {/* Sizer Stepper Grid */}
                <div style={{ display: "grid", gridTemplateColumns: mode === "mushaf" ? "1fr" : "1fr 1fr", gap: 10, width: "100%" }}>
                  <div style={{ 
                    display: "flex", 
                    alignItems: "center", 
                    justifyContent: "space-between", 
                    background: "var(--quran-br2)", 
                    padding: "6px 12px", 
                    borderRadius: 10,
                    border: "0.5px solid var(--quran-br)",
                    flex: 1
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 500, color: "var(--quran-t2)" }}>อาหรับ</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button 
                        className="size-btn" 
                        onClick={() => setArabicSize(prev => Math.max(prev - 2, 20))} 
                        title="ย่อขนาดอักษรอาหรับ"
                        style={{
                          width: 24, height: 24, borderRadius: "50%", border: "none",
                          background: "var(--quran-card-bg)", color: "var(--quran-text)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
                        }}
                      >
                        <i className="ti ti-minus" style={{ fontSize: 10 }}></i>
                      </button>
                      <span style={{ fontSize: 12, width: 20, textAlign: "center", fontWeight: 600 }}>{arabicSize}</span>
                      <button 
                        className="size-btn" 
                        onClick={() => setArabicSize(prev => Math.min(prev + 2, 52))} 
                        title="ขยายขนาดอักษรอาหรับ"
                        style={{
                          width: 24, height: 24, borderRadius: "50%", border: "none",
                          background: "var(--quran-card-bg)", color: "var(--quran-text)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
                        }}
                      >
                        <i className="ti ti-plus" style={{ fontSize: 10 }}></i>
                      </button>
                    </div>
                  </div>

                  {mode !== "mushaf" && (
                    <div style={{ 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "space-between", 
                      background: "var(--quran-br2)", 
                      padding: "6px 12px", 
                      borderRadius: 10,
                      border: "0.5px solid var(--quran-br)",
                      flex: 1
                    }}>
                      <span style={{ fontSize: 11, fontWeight: 500, color: "var(--quran-t2)" }}>ภาษาไทย</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <button 
                          className="size-btn" 
                          onClick={() => setThaiSize(prev => Math.max(prev - 1, 12))} 
                          title="ย่อขนาดอักษรไทย"
                          style={{
                            width: 24, height: 24, borderRadius: "50%", border: "none",
                            background: "var(--quran-card-bg)", color: "var(--quran-text)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
                          }}
                        >
                          <i className="ti ti-minus" style={{ fontSize: 10 }}></i>
                        </button>
                        <span style={{ fontSize: 12, width: 20, textAlign: "center", fontWeight: 600 }}>{thaiSize}</span>
                        <button 
                          className="size-btn" 
                          onClick={() => setThaiSize(prev => Math.min(prev + 1, 26))} 
                          title="ขยายขนาดอักษรไทย"
                          style={{
                            width: 24, height: 24, borderRadius: "50%", border: "none",
                            background: "var(--quran-card-bg)", color: "var(--quran-text)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
                          }}
                        >
                          <i className="ti ti-plus" style={{ fontSize: 10 }}></i>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              // DESKTOP/TABLET LAYOUT
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                {/* Mode Select Buttons */}
                <div style={{ display: "flex", gap: 6 }}>
                  <button 
                    className={`mode-btn ${mode === "translation" ? "active" : ""}`}
                    onClick={() => setMode("translation")}
                  >
                    แปลทีละอายะฮ์
                  </button>
                  <button 
                    className={`mode-btn ${mode === "tafsir" ? "active" : ""}`}
                    onClick={() => setMode("tafsir")}
                  >
                    คำแปล + ตัฟซีรย่อ
                  </button>
                  <button 
                    className={`mode-btn ${mode === "mushaf" ? "active" : ""}`}
                    onClick={() => setMode("mushaf")}
                  >
                    มุศฮัฟ (ภาษาอาหรับล้วน)
                  </button>
                </div>

                {/* Font Resizing Controls */}
                <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 11, color: "var(--quran-t2)" }}>อาหรับ:</span>
                    <button className="size-btn" onClick={() => setArabicSize(prev => Math.max(prev - 2, 20))} title="ย่อขนาดอักษรอาหรับ"><i className="ti ti-minus"></i></button>
                    <span style={{ fontSize: 11, width: 22, textAlign: "center", fontWeight: 500 }}>{arabicSize}</span>
                    <button className="size-btn" onClick={() => setArabicSize(prev => Math.min(prev + 2, 52))} title="ขยายขนาดอักษรอาหรับ"><i className="ti ti-plus"></i></button>
                  </div>
                  {mode !== "mushaf" && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 11, color: "var(--quran-t2)" }}>ภาษาไทย:</span>
                      <button className="size-btn" onClick={() => setThaiSize(prev => Math.max(prev - 1, 12))} title="ย่อขนาดอักษรไทย"><i className="ti ti-minus"></i></button>
                      <span style={{ fontSize: 11, width: 22, textAlign: "center", fontWeight: 500 }}>{thaiSize}</span>
                      <button className="size-btn" onClick={() => setThaiSize(prev => Math.min(prev + 1, 26))} title="ขยายขนาดอักษรไทย"><i className="ti ti-plus"></i></button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Mushaf Page-by-page Toggle */}
            {mode === "mushaf" && (
              <div style={{ borderTop: "0.5px solid var(--br2)", paddingTop: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", textAlign: "left" }}>
                <span style={{ fontSize: 11, color: "var(--t2)", fontWeight: 500 }}>รูปแบบการจัดหน้ามุศฮัฟ:</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button 
                    className={`mode-btn ${!selectedPage ? "active" : ""}`}
                    onClick={() => setSelectedPage(null)}
                    style={{ fontSize: 10, padding: "4px 10px", borderRadius: 12 }}
                  >
                    อ่านทีละซูเราะฮ์
                  </button>
                  <button 
                    className={`mode-btn ${selectedPage ? "active" : ""}`}
                    onClick={() => setSelectedPage(1)}
                    style={{ fontSize: 10, padding: "4px 10px", borderRadius: 12 }}
                  >
                    อ่านทีละหน้า (1 - 604)
                  </button>
                </div>
              </div>
            )}

            {/* Translation Selection (Hidden in Mushaf mode) */}
            {mode !== "mushaf" && (
              <div style={{ 
                borderTop: "0.5px solid var(--br2)", 
                paddingTop: 12, 
                display: "flex", 
                flexDirection: isMobile ? "column" : "row",
                alignItems: isMobile ? "flex-start" : "center", 
                gap: isMobile ? 6 : 10 
              }}>
                <span style={{ fontSize: 11, color: "var(--t2)", fontWeight: 500, flexShrink: 0 }}>สำนวนแปลความหมายไทย:</span>
                <div style={{ position: "relative", width: "100%", maxWidth: isMobile ? "100%" : "360px" }}>
                  <select 
                    value={translationKey}
                    onChange={e => setTranslationKey(e.target.value)}
                    style={{ 
                      width: "100%", 
                      padding: "8px 36px 8px 12px", 
                      borderRadius: 8, 
                      border: "0.5px solid var(--quran-br)", 
                      fontSize: 12, 
                      fontFamily: "'Prompt', sans-serif", 
                      background: "var(--quran-card-bg)", 
                      color: "var(--quran-text)",
                      appearance: "none",
                      WebkitAppearance: "none",
                      cursor: "pointer",
                      outline: "none",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap"
                    }}
                  >
                    <option value="thai_complex">สำนวนแปลความหมาย คิงฟะฮัด (King Fahd Complex)</option>
                    <option value="thai_rwwad">สำนวนแปลความหมาย ศูนย์ Rowwad Translation Center</option>
                  </select>
                  <i className="ti ti-chevron-down" style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "var(--quran-teal)", fontSize: 13, pointerEvents: "none" }}></i>
                </div>
              </div>
            )}
          </div>

          {/* LOADING & ERROR STATES */}
          {loading && verses.length === 0 && (
            <div className="card" style={{ padding: 40, textAlign: "center" }}>
              <i className="ti ti-loader-2 spin" style={{ fontSize: 24, color: "var(--teal)", marginBottom: 8 }}></i>
              <div style={{ fontSize: 13, color: "var(--t2)" }}>กำลังโหลดพระดำรัสและไฟล์ข้อมูลอายะฮ์...</div>
            </div>
          )}

          {error && (
            <div className="card" style={{ padding: 24, borderColor: "rgba(220, 38, 38, 0.3)", background: "rgba(220, 38, 38, 0.03)", textAlign: "center" }}>
              <i className="ti ti-alert-triangle" style={{ fontSize: 24, color: "var(--red)", marginBottom: 8 }}></i>
              <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 500, marginBottom: 4 }}>เกิดข้อผิดพลาด</div>
              <p style={{ fontSize: 12, color: "var(--t2)", marginBottom: 12 }}>{error}</p>
              <button className="btn btn-teal" style={{ fontSize: 11, padding: "5px 14px" }} onClick={() => setReloadKey(key => key + 1)}>ลองอีกครั้ง</button>
            </div>
          )}

          {/* READING AREA */}
          {!error && (verses.length > 0 || (mode === "mushaf" && selectedPage)) && (
            <div ref={readingAreaRef} className="card" style={{ 
              padding: isMobile ? "20px 16px" : "24px 28px", 
              border: isMobile ? "none" : "0.5px solid var(--br)", 
              borderRadius: isMobile ? "0" : "16px",
              boxShadow: isMobile ? "none" : "var(--shadow)",
              display: "flex", 
              flexDirection: "column", 
              gap: 16,
              position: "relative",
              overflow: "hidden"
            }}>
              {/* Sleek Top Loading Bar */}
              {loading && (
                <div style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: "3px",
                  background: "linear-gradient(90deg, transparent, var(--teal), transparent)",
                  backgroundSize: "200% 100%",
                  animation: "loadingBar 1.5s infinite linear",
                  zIndex: 5
                }} />
              )}
              
              <div style={{ 
                opacity: loading ? 0.55 : 1, 
                transition: "opacity 0.25s ease", 
                pointerEvents: loading ? "none" : "auto",
                display: "flex",
                flexDirection: "column",
                gap: 16
              }}>
              
              {/* BISMILLAH PREPEND */}
              {hasBismillah && !selectedPage && (
                <div style={{ 
                  textAlign: "center", 
                  margin: "12px 0 24px", 
                  fontSize: `${arabicSize + 2}px`, 
                  fontFamily: "'Amiri', serif", 
                  color: "var(--text)", 
                  lineHeight: 1.5,
                  direction: "rtl"
                }}>
                  بِسْمِ اللَّهِ الرَّحْمัٰنِ الرَّحِيمِ
                </div>
              )}

              {/* MUSHAF MODE (FLOW TEXT) */}
              {mode === "mushaf" ? (
                selectedPage ? (
                  /* PAGE-BASED MUSHAF VIEW */
                  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    {/* Page Navigation Header */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "0.5px solid var(--br2)", paddingBottom: 10 }}>
                      <button 
                        className="btn btn-outline" 
                        disabled={selectedPage <= 1}
                        onClick={() => setSelectedPage(prev => Math.max(1, prev - 1))}
                        style={{ padding: "4px 12px", fontSize: 11 }}
                      >
                        <i className="ti ti-chevron-left" style={{ marginRight: 4 }}></i> หน้าก่อนหน้า
                      </button>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--quran-teal)" }}>
                        หน้า {selectedPage}
                      </span>
                      <button 
                        className="btn btn-outline" 
                        disabled={selectedPage >= 604}
                        onClick={() => setSelectedPage(prev => Math.min(604, prev + 1))}
                        style={{ padding: "4px 12px", fontSize: 11 }}
                      >
                        หน้าถัดไป <i className="ti ti-chevron-right" style={{ marginLeft: 4 }}></i>
                      </button>
                    </div>

                    {pageLoading && pageVerses.length === 0 ? (
                      <div style={{ padding: 40, textAlign: "center" }}>
                        <i className="ti ti-loader-2 spin" style={{ fontSize: 24, color: "var(--teal)", marginBottom: 8 }}></i>
                        <div style={{ fontSize: 12, color: "var(--t2)" }}>กำลังโหลดหน้า {selectedPage}...</div>
                      </div>
                    ) : (
                      <div style={{ 
                        position: "relative",
                        opacity: pageLoading ? 0.55 : 1, 
                        transition: "opacity 0.25s ease",
                        pointerEvents: pageLoading ? "none" : "auto" 
                      }}>
                        {pageLoading && (
                          <div style={{
                            position: "absolute",
                            top: -10,
                            left: 0,
                            right: 0,
                            height: "3px",
                            background: "linear-gradient(90deg, transparent, var(--teal), transparent)",
                            backgroundSize: "200% 100%",
                            animation: "loadingBar 1.5s infinite linear",
                            zIndex: 5
                          }} />
                        )}
                        <div 
                          className="mushaf-flow" 
                          style={{ 
                            fontSize: `${arabicSize}px`, 
                            fontFamily: "'Amiri', serif", 
                            color: "var(--text)", 
                            direction: "rtl",
                            textAlign: "justify",
                            lineHeight: 2.3
                          }}
                        >
                          {pageVerses.length > 0 ? (
                            pageVerses.map(v => (
                              <span key={v.id}>
                                {v.text || v.arabic_text}{" "}
                                <span 
                                  style={{ 
                                    fontFamily: "sans-serif", 
                                    fontSize: `${Math.round(arabicSize * 0.5)}px`, 
                                    color: "var(--teal)", 
                                    fontWeight: "bold",
                                    margin: "0 4px",
                                    display: "inline-flex",
                                    width: `${Math.round(arabicSize * 0.95)}px`,
                                    height: `${Math.round(arabicSize * 0.95)}px`,
                                    border: "1.5px solid var(--teal)",
                                    borderRadius: "50%",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    direction: "ltr"
                                  }}
                                  title={`ซูเราะฮ์ ${v.suraName || ""} [${v.sura}:${v.aya}]`}
                                >
                                  {getArabicNumber(v.aya)}
                                </span>{" "}
                              </span>
                            ))
                          ) : (
                            <div style={{ direction: "ltr", textAlign: "center", fontFamily: "'Prompt', sans-serif", fontSize: 13, color: "var(--t2)", padding: "36px 12px" }}>
                              ไม่พบข้อมูลหน้านี้ กรุณาลองเลือกหน้าใหม่อีกครั้ง
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Page Navigation Footer */}
                    {!pageLoading && (
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "0.5px solid var(--br2)", paddingTop: 16 }}>
                        <button 
                          className="btn btn-outline" 
                          disabled={selectedPage <= 1}
                          onClick={() => {
                            setSelectedPage(prev => Math.max(1, prev - 1))
                            scrollToReadingArea()
                          }}
                          style={{ padding: "6px 14px", fontSize: 12 }}
                        >
                          <i className="ti ti-chevron-left" style={{ marginRight: 4 }}></i> หน้า {selectedPage - 1}
                        </button>
                        <span style={{ fontSize: 12, color: "var(--t2)" }}>
                          หน้า {selectedPage} จาก 604
                        </span>
                        <button 
                          className="btn btn-outline" 
                          disabled={selectedPage >= 604}
                          onClick={() => {
                            setSelectedPage(prev => Math.min(604, prev + 1))
                            scrollToReadingArea()
                          }}
                          style={{ padding: "6px 14px", fontSize: 12 }}
                        >
                          หน้า {selectedPage + 1} <i className="ti ti-chevron-right" style={{ marginLeft: 4 }}></i>
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  /* STANDARD SURAH-BASED MUSHAF VIEW */
                  <div 
                    className="mushaf-flow" 
                    style={{ 
                      fontSize: `${arabicSize}px`, 
                      fontFamily: "'Amiri', serif", 
                      color: "var(--text)", 
                      direction: "rtl",
                      textAlign: "justify",
                      lineHeight: 2.3
                    }}
                  >
                    {verses.map(v => (
                      <span key={v.id}>
                        {v.arabic_text}{" "}
                        <span 
                          style={{ 
                            fontFamily: "sans-serif", 
                            fontSize: `${Math.round(arabicSize * 0.5)}px`, 
                            color: "var(--teal)", 
                            fontWeight: "bold",
                            margin: "0 4px",
                            display: "inline-flex",
                            width: `${Math.round(arabicSize * 0.95)}px`,
                            height: `${Math.round(arabicSize * 0.95)}px`,
                            border: "1.5px solid var(--teal)",
                            borderRadius: "50%",
                            alignItems: "center",
                            justifyContent: "center",
                            direction: "ltr"
                          }}
                        >
                          {getArabicNumber(v.aya)}
                        </span>{" "}
                      </span>
                    ))}
                  </div>
                )
              ) : (
                
                /* TRANSLATION & TAFSIR MODES (VERSE LIST) */
                <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
                  {verses.map(v => {
                    const bookmark = getBookmarkForVerse(v.aya)
                    return (
                      <div 
                        key={v.id} 
                        id={`ayah-${v.aya}`}
                        style={{ 
                          borderBottom: "0.5px solid var(--br2)", 
                          display: "flex", 
                          flexDirection: "column", 
                          gap: 16,
                          padding: isMobile ? "24px 0" : "20px 10px",
                          transition: "background-color 0.3s"
                        }}
                      >
                        {/* Verse marker and Bookmark button */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 11, color: "var(--t3)", fontFamily: "'IBM Plex Mono', monospace" }}>
                            [{v.sura}:{v.aya}]
                          </span>
                          
                          <div style={{ display: "flex", gap: 12 }}>
                            {/* Bookmark reading position */}
                            <button 
                              onClick={() => {
                                updateLastRead(v.sura, v.aya)
                                toast.success(`คั่นหน้าการอ่านที่ อายะฮ์ [${v.sura}:${v.aya}] เรียบร้อย`)
                              }}
                              style={{ 
                                background: "transparent", 
                                border: "none", 
                                cursor: "pointer", 
                                color: (lastRead?.sura === v.sura && lastRead?.aya === v.aya) ? "var(--teal)" : "var(--t3)",
                                padding: "4px 8px",
                                fontSize: 14,
                                display: "flex",
                                alignItems: "center",
                                gap: 4
                              }}
                              title="คั่นจุดนี้เป็นจุดอ่านล่าสุด"
                            >
                              <i className={(lastRead?.sura === v.sura && lastRead?.aya === v.aya) ? "ti ti-flag-2-filled" : "ti ti-flag-2"}></i>
                              <span style={{ fontSize: 10, fontFamily: "'Prompt', sans-serif" }}>
                                {(lastRead?.sura === v.sura && lastRead?.aya === v.aya) ? "คั่นแล้ว" : "คั่นจุดนี้"}
                              </span>
                            </button>

                            {/* Bookmark reflection note */}
                            <button 
                              onClick={() => handleOpenBookmarkModal(v, bookmark)}
                              style={{ 
                                background: "transparent", 
                                border: "none", 
                                cursor: "pointer", 
                                color: bookmark ? "var(--teal)" : "var(--t3)",
                                padding: "4px 8px",
                                fontSize: 14,
                                display: "flex",
                                alignItems: "center",
                                gap: 4
                              }}
                              title={bookmark ? "แก้ไขข้อคิด/ยกเลิกการบันทึก" : "บันทึกอายะฮ์นี้และจดข้อคิด"}
                            >
                              <i className={bookmark ? "ti ti-bookmark-filled" : "ti ti-bookmark"}></i>
                              <span style={{ fontSize: 10, fontFamily: "'Prompt', sans-serif" }}>
                                {bookmark ? "บันทึกแล้ว" : "บันทึก"}
                              </span>
                            </button>
                          </div>
                        </div>

                        {/* Arabic text */}
                        <div 
                          className="arabic-font" 
                          style={{ 
                            fontSize: `${arabicSize}px`, 
                            color: "var(--text)",
                            paddingRight: 6
                          }}
                        >
                          {v.arabic_text}
                        </div>

                        {/* Thai Translation */}
                        <div 
                          style={{ 
                            fontSize: `${thaiSize}px`, 
                            lineHeight: 1.6, 
                            color: mode === "tafsir" ? "var(--t2)" : "var(--text)", 
                            fontWeight: mode === "tafsir" ? 300 : 400 
                          }}
                        >
                          {v.translation}
                        </div>

                        {/* Thai Exegesis / Tafsir Block */}
                        {mode === "tafsir" && v.tafsir && (
                          <div className="tafsir-box">
                            <div style={{ fontSize: 11, fontWeight: 500, color: "var(--teal)", marginBottom: 4 }}>
                              คำอธิบายความหมายย่อ (ตัฟซีร):
                            </div>
                            <div style={{ fontSize: `${thaiSize - 0.5}px`, lineHeight: 1.6, color: "var(--text)", fontWeight: 300 }}>
                              {v.tafsir}
                            </div>
                          </div>
                        )}

                        {/* User saved notes / reflections (ประโยชน์ที่ได้รับ) */}
                        {bookmark && (
                          <div style={{ 
                            background: "rgba(45, 190, 160, 0.04)", 
                            borderLeft: "3px solid var(--teal)", 
                            padding: "8px 12px", 
                            borderRadius: "0 8px 8px 0", 
                            marginTop: 8,
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            gap: 10
                          }}>
                            <div style={{ flex: 1 }}>
                              <span style={{ fontSize: 10, color: "var(--teal)", fontWeight: 600, display: "block", marginBottom: 2 }}>
                                ข้อคิดและประโยชน์ที่คุณจดบันทึกไว้:
                              </span>
                              <p style={{ fontSize: 12, margin: 0, color: "var(--text)", fontStyle: bookmark.notes ? "normal" : "italic" }}>
                                {bookmark.notes || "ไม่มีข้อความบันทึก (กดที่ปุ่มบันทึกเพื่อเพิ่มข้อคิด)"}
                              </p>
                            </div>
                            <button 
                              onClick={() => handleOpenBookmarkModal(v, bookmark)}
                              style={{ background: "none", border: "none", color: "var(--teal)", cursor: "pointer", fontSize: 12, padding: 4 }}
                              title="แก้ไขบันทึก"
                            >
                              <i className="ti ti-edit"></i>
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
              </div>
            </div>
          )}

          {/* VERSE BENEFITS (فوائد الآيات) */}
          {!loading && !error && verses.length > 0 && (() => {
            const suraBenefits = QURAN_BENEFITS[selectedSura] || [];
            if (suraBenefits.length === 0) return null;
            return (
              <div 
                className="card" 
                style={{ 
                  marginTop: 20, 
                  padding: "20px 24px", 
                  borderLeft: "4px solid var(--quran-teal)", 
                  background: "var(--quran-teal-bg)" 
                }}
              >
                <div 
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                  onClick={() => setBenefitsExpanded(!benefitsExpanded)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <i className="ti ti-bulb" style={{ color: "var(--quran-teal)", fontSize: 18 }}></i>
                    <div style={{ textAlign: "left" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--quran-text)", display: "block" }}>
                        ประโยชน์และข้อคิดที่ได้รับจากโองการต่างๆ ในซูเราะฮ์นี้
                      </span>
                      <span style={{ fontSize: 10, color: "var(--quran-t2)" }}>
                        فوائد الآيات وهداياتها (ตัฟซีรอัลมุคตะศ็อร)
                      </span>
                    </div>
                  </div>
                  <i className={`ti ${benefitsExpanded ? "ti-chevron-up" : "ti-chevron-down"}`} style={{ color: "var(--quran-t2)", fontSize: 16 }}></i>
                </div>

                {benefitsExpanded && (
                  <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
                    {suraBenefits.map((b, idx) => (
                      <div 
                        key={idx} 
                        style={{ 
                          borderBottom: idx === suraBenefits.length - 1 ? "none" : "0.5px solid var(--quran-br)", 
                          paddingBottom: idx === suraBenefits.length - 1 ? 0 : 12,
                          display: "flex",
                          flexDirection: "column",
                          gap: 6
                        }}
                      >
                        {/* Arabic Benefit */}
                        <div 
                          style={{ 
                            fontFamily: "'Amiri', serif", 
                            fontSize: 20, 
                            direction: "rtl", 
                            textAlign: "right",
                            lineHeight: 1.5,
                            color: "var(--quran-teal)" 
                          }}
                        >
                          {b.arabic}
                        </div>
                        
                        {/* Thai Benefit */}
                        <div style={{ fontSize: "12.5px", lineHeight: 1.6, color: "var(--quran-text)", fontWeight: 400, textAlign: "left" }}>
                          • {b.thai}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* LICENCE AND CREDIT BANNER */}
          <div 
            style={{ 
              marginTop: 24, 
              padding: "16px 20px", 
              borderRadius: 12, 
              border: "0.5px solid var(--quran-br)", 
              background: "var(--quran-card-bg)", 
              fontSize: "11px", 
              color: "var(--quran-t2)", 
              lineHeight: "1.6" 
            }}
          >
            <div style={{ fontWeight: 600, color: "var(--quran-text)", marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
              <i className="ti ti-license" style={{ fontSize: 14, color: "var(--quran-teal)" }}></i>
              แหล่งข้อมูลและลิขสิทธิ์ข้อมูลเผยแพร่
            </div>
            ข้อมูลแปลความหมายพระมหาคัมภีร์อัลกุรอานและตัฟซีรย่อภาษาไทยได้รับการสนับสนุนจาก <strong>โครงการสารานุกรมอัลกุรอาน (QuranEnc.com)</strong>
            <ul style={{ paddingLeft: 16, marginTop: 4, display: "flex", flexDirection: "column", gap: 2, listStyleType: "none", textAlign: "left" }}>
              <li>• สำนวนคำแปลภาษาไทย: ศูนย์แปล Rowwad Translation Center และ คณะผู้ทรงคุณวุฒิ (สมาคมศิษย์เก่ามหาวิทยาลัยในต่างประเทศ)</li>
              <li>• บทอธิบายคำแปลย่อ (ตัฟซีรย่อ): หนังสือตัฟซีรอัลมุคตะศ็อร (Al-Mukhtasar fi Tafsir al-Qur'an) แปลภาษาไทย</li>
              <li>• พัฒนาโดยอ้างอิงข้อมูลเวอร์ชันล่าสุดของโครงการ ซึ่งไม่อนุญาตให้ดัดแปลงหรือตัดต่อเนื้อหาคัดลอกใดๆ เพื่อความถูกต้องของพระดำรัส</li>
            </ul>
          </div>

        </div>
      </div>

      {/* BOOKMARK REFLECTION MODAL */}
      {activeBookmarkModal && createPortal(
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.6)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 100000,
          padding: 16
        }}>
          <div className="card" style={{
            maxWidth: 540,
            width: "100%",
            padding: 24,
            display: "flex",
            flexDirection: "column",
            gap: 16,
            background: "var(--quran-card-bg)",
            border: "0.5px solid var(--quran-br)",
            boxShadow: "0 20px 50px rgba(0, 0, 0, 0.3)"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--quran-text)", margin: 0 }}>
                {activeBookmarkModal.bookmarkId ? "แก้ไขบันทึกข้อคิดอายะฮ์" : "บันทึกข้อคิดและประโยชน์จากอายะฮ์"}
              </h3>
              <button 
                onClick={() => setActiveBookmarkModal(null)} 
                style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "var(--quran-t3)" }}
              >
                <i className="ti ti-x"></i>
              </button>
            </div>

            <div style={{ padding: 12, background: "var(--quran-bg)", borderRadius: 8, border: "0.5px solid var(--quran-br2)" }}>
              <span style={{ fontSize: 10, color: "var(--quran-t3)", fontWeight: 500 }}>
                ซูเราะฮ์ {activeBookmarkModal.suraName} อายะฮ์ที่ {activeBookmarkModal.aya}
              </span>
              <div style={{ 
                fontFamily: "'Amiri', serif", 
                fontSize: 22, 
                direction: "rtl", 
                textAlign: "right", 
                margin: "8px 0",
                lineHeight: 1.6,
                color: "var(--quran-text)"
              }}>
                {activeBookmarkModal.arabicText}
              </div>
              <div style={{ fontSize: 12, color: "var(--quran-t2)", lineHeight: 1.45, textAlign: "left" }}>
                {activeBookmarkModal.translation}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6, textAlign: "left" }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: "var(--quran-teal)" }}>
                บันทึกข้อคิด/ประโยชน์ที่ได้รับ (จดบันทึกส่วนตัวเพื่อเตือนตนเอง):
              </label>
              <textarea 
                value={modalNotes}
                onChange={e => setModalNotes(e.target.value)}
                placeholder="พิมพ์สิ่งที่ได้รับจากโองการนี้ เช่น ข้อเตือนใจ, ข้อปฏิบัติในชีวิตประจำวัน..."
                style={{
                  width: "100%",
                  minHeight: 100,
                  padding: 12,
                  borderRadius: 8,
                  border: "0.5px solid var(--quran-br)",
                  background: "var(--quran-card-bg)",
                  color: "var(--quran-text)",
                  fontSize: 13,
                  fontFamily: "'Prompt', sans-serif"
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <div>
                {activeBookmarkModal.bookmarkId && (
                  <button 
                    className="btn btn-outline" 
                    style={{ color: "var(--red)", borderColor: "rgba(220, 38, 38, 0.2)", fontSize: 12, padding: "6px 14px" }}
                    onClick={handleDeleteBookmark}
                  >
                    <i className="ti ti-trash" style={{ marginRight: 4 }}></i> ลบบันทึก
                  </button>
                )}
              </div>
              
              <div style={{ display: "flex", gap: 8 }}>
                <button 
                  className="btn btn-outline" 
                  style={{ fontSize: 12, padding: "6px 16px" }}
                  onClick={() => setActiveBookmarkModal(null)}
                >
                  ยกเลิก
                </button>
                <button 
                  className="btn btn-teal" 
                  style={{ fontSize: 12, padding: "6px 16px" }}
                  onClick={handleSaveBookmark}
                >
                  บันทึก
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MOBILE BOTTOM SHEET NAVIGATION DRAWER */}
      {isMobile && isMobileNavOpen && createPortal(
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.55)",
          backdropFilter: "blur(4px)",
          zIndex: 100000,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center"
        }}
        onClick={() => setIsMobileNavOpen(false)}
        >
          <div 
            style={{
              width: "100%",
              maxHeight: "85vh",
              background: "var(--card, #ffffff)",
              backgroundColor: "var(--card, #ffffff)",
              borderRadius: "20px 20px 0 0",
              display: "flex",
              flexDirection: "column",
              padding: "16px 20px 24px",
              gap: 12,
              animation: "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
              boxShadow: "0 -10px 40px rgba(0,0,0,0.25)",
              border: "1px solid rgba(0,0,0,0.08)",
              borderBottom: "none"
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Drawer Drag bar & Close */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--quran-br)" }}></div>
            </div>
            
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--quran-text)", margin: 0 }}>เลือกซูเราะฮ์ / ค้นหา</h3>
              <button 
                onClick={() => setIsMobileNavOpen(false)}
                style={{ background: "none", border: "none", fontSize: "16px", cursor: "pointer", color: "var(--quran-t2)" }}
              >
                <i className="ti ti-x"></i>
              </button>
            </div>

            {/* Sidebar Tabs inside Mobile Drawer */}
            <div style={{ display: "flex", borderBottom: "0.5px solid var(--quran-br)" }}>
              <button 
                className={`sidebar-tab-btn ${sidebarTab === "surah" ? "active" : ""}`}
                onClick={() => setSidebarTab("surah")}
              >
                รายชื่อซูเราะฮ์
              </button>
              <button 
                className={`sidebar-tab-btn ${sidebarTab === "search" ? "active" : ""}`}
                onClick={() => setSidebarTab("search")}
              >
                ค้นหาในอายะฮ์
              </button>
            </div>

            {/* Content inside drawer */}
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflowY: "hidden" }}>
              {sidebarTab === "surah" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minHeight: 0 }}>
                  {/* Sub-Navigation Switcher (Surah | Juz | Page) */}
                  <div style={{ display: "flex", gap: 4, background: "var(--quran-br2)", padding: 3, borderRadius: 8 }}>
                    <button 
                      onClick={() => setNavMode("surah")}
                      style={{ 
                        flex: 1, 
                        padding: "5px 8px", 
                        borderRadius: 6, 
                        border: "none", 
                        background: navMode === "surah" ? "var(--quran-teal)" : "transparent",
                        color: navMode === "surah" ? "#fff" : "var(--quran-t2)",
                        fontSize: 11,
                        cursor: "pointer",
                        fontWeight: navMode === "surah" ? 500 : 300,
                        transition: "all 0.15s"
                      }}
                    >
                      ซูเราะฮ์
                    </button>
                    <button 
                      onClick={() => setNavMode("juz")}
                      style={{ 
                        flex: 1, 
                        padding: "5px 8px", 
                        borderRadius: 6, 
                        border: "none", 
                        background: navMode === "juz" ? "var(--quran-teal)" : "transparent",
                        color: navMode === "juz" ? "#fff" : "var(--quran-t2)",
                        fontSize: 11,
                        cursor: "pointer",
                        fontWeight: navMode === "juz" ? 500 : 300,
                        transition: "all 0.15s"
                      }}
                    >
                      ยุซอ์
                    </button>
                    <button 
                      onClick={() => setNavMode("page")}
                      style={{ 
                        flex: 1, 
                        padding: "5px 8px", 
                        borderRadius: 6, 
                        border: "none", 
                        background: navMode === "page" ? "var(--quran-teal)" : "transparent",
                        color: navMode === "page" ? "#fff" : "var(--quran-t2)",
                        fontSize: 11,
                        cursor: "pointer",
                        fontWeight: navMode === "page" ? 500 : 300,
                        transition: "all 0.15s"
                      }}
                    >
                      หน้า
                    </button>
                  </div>

                  {navMode === "surah" && (
                    <>
                      <div style={{ position: "relative" }}>
                        <i className="ti ti-search" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--quran-t3)", fontSize: 13 }}></i>
                        <input 
                          placeholder="ค้นหาชื่อซูเราะห์..."
                          value={search}
                          onChange={e => setSearch(e.target.value)}
                          style={{ width: "100%", paddingLeft: 30, paddingRight: 10, height: 36, fontSize: 12, borderRadius: 8, border: "0.5px solid var(--quran-br)" }}
                        />
                      </div>
                      
                      <div className="quran-sidebar" style={{ overflowY: "auto", flex: 1 }}>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          {filteredSurahs.map(s => (
                            <div 
                              key={s.number} 
                              className={`surah-item`}
                              onClick={() => {
                                setSelectedSura(s.number);
                                setIsMobileNavOpen(false);
                              }}
                              style={{ 
                                padding: "14px 16px", 
                                display: "flex", 
                                justifyContent: "space-between", 
                                alignItems: "center", 
                                borderBottom: selectedSura === s.number ? "none" : "0.5px solid var(--quran-br2)",
                                background: selectedSura === s.number ? "var(--quran-teal-bg)" : "transparent",
                                borderRadius: selectedSura === s.number ? "10px" : "0",
                                marginBottom: "2px",
                                transition: "all 0.2s ease"
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: "10px", color: "var(--quran-t3)", width: 18, textAlign: "center" }}>{s.number}</span>
                                <div style={{ textAlign: "left" }}>
                                  <div style={{ fontSize: "12px", fontWeight: 500 }}>{s.englishName}</div>
                                  <div style={{ fontSize: "9px", color: "var(--quran-t2)" }}>{s.englishNameTranslation}</div>
                                </div>
                              </div>
                              <div style={{ textAlign: "right" }}>
                                <div style={{ fontSize: "14px", fontFamily: "'Amiri', serif" }}>{s.name}</div>
                                <div style={{ fontSize: "9px", color: "var(--quran-t3)" }}>{s.numberOfAyahs} อายะฮ์</div>
                              </div>
                            </div>
                          ))}
                          {filteredSurahs.length === 0 && (
                            <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: "var(--quran-t3)" }}>ไม่พบผลลัพธ์</div>
                          )}
                        </div>
                      </div>
                    </>
                  )}

                  {navMode === "juz" && (
                    <div className="quran-sidebar" style={{ overflowY: "auto", flex: 1 }}>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        {JUZ_STARTS.map(j => (
                          <div 
                            key={j.juz} 
                            className={`surah-item`}
                            onClick={() => {
                              setSelectedSura(j.sura)
                              setTargetScrollAyah(j.ayah)
                              setIsMobileNavOpen(false)
                            }}
                            style={{ 
                              padding: "12px 14px", 
                              display: "flex", 
                              justifyContent: "space-between", 
                              alignItems: "center", 
                              borderBottom: "0.5px solid var(--quran-br)",
                              borderRadius: 6
                            }}
                          >
                            <div style={{ textAlign: "left" }}>
                              <div style={{ fontSize: "12px", fontWeight: 500 }}>ยุซอ์ที่ {j.juz}</div>
                              <div style={{ fontSize: "10px", color: "var(--quran-teal)" }}>เริ่มต้น ซูเราะฮ์ที่ {j.sura} อายะฮ์ {j.ayah}</div>
                            </div>
                            <i className="ti ti-chevron-right" style={{ fontSize: 12, color: "var(--quran-t3)" }}></i>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {navMode === "page" && (
                    <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                      <div style={{ textAlign: "left" }}>
                        <span style={{ fontSize: 11, color: "var(--quran-t2)", display: "block", marginBottom: 6 }}>เลือกหน้า (1 - 604)</span>
                        <select 
                          value=""
                          onChange={e => {
                            if (e.target.value) handleSelectPage(e.target.value)
                          }}
                          style={{ width: "100%", height: 36, padding: "0 10px", fontSize: 12, borderRadius: 8, border: "0.5px solid var(--quran-br)" }}
                        >
                          <option value="">-- เลือกจากรายการ --</option>
                          {Array.from({ length: 604 }, (_, i) => i + 1).map(p => (
                            <option key={p} value={p}>หน้า {p}</option>
                          ))}
                        </select>
                      </div>

                      <div style={{ borderTop: "0.5px solid var(--quran-br2)", paddingTop: 10, textAlign: "left" }}>
                        <span style={{ fontSize: 11, color: "var(--quran-t2)", display: "block", marginBottom: 6 }}>หรือ พิมพ์เลขหน้าโดยตรง</span>
                        <form 
                          onSubmit={e => {
                            e.preventDefault()
                            if (pageInput) handleSelectPage(pageInput)
                          }}
                          style={{ display: "flex", gap: 6 }}
                        >
                          <input 
                            placeholder="1 - 604"
                            type="number"
                            min="1"
                            max="604"
                            value={pageInput}
                            onChange={e => setPageInput(e.target.value)}
                            style={{ flex: 1, height: 36, fontSize: 12, borderRadius: 8, border: "0.5px solid var(--quran-br)" }}
                          />
                          <button className="btn btn-teal" style={{ height: 36, fontSize: 11, padding: "0 14px" }} type="submit">ไป</button>
                        </form>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                // KEYWORD SEARCH TAB
                <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minHeight: 0 }}>
                  <form onSubmit={handleKeywordSearch} style={{ display: "flex", gap: 6 }}>
                    <div style={{ position: "relative", flex: 1 }}>
                      <i className="ti ti-search" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--quran-t3)", fontSize: 13 }}></i>
                      <input 
                        placeholder="เช่น สวรรค์, ความเมตตา, นบี..."
                        value={keywordQuery}
                        onChange={e => setKeywordQuery(e.target.value)}
                        style={{ width: "100%", paddingLeft: 30, paddingRight: 10, height: 36, fontSize: 12, borderRadius: 8, border: "0.5px solid var(--quran-br)" }}
                      />
                    </div>
                    <button className="btn btn-teal" style={{ height: 36, padding: "0 12px", fontSize: 12 }} type="submit">ค้นหา</button>
                  </form>

                  {searchLoading && (
                    <div style={{ textAlign: "center", padding: 24 }}>
                      <i className="ti ti-loader-2 spin" style={{ fontSize: 20, color: "var(--quran-teal)" }}></i>
                      <div style={{ fontSize: 11, color: "var(--quran-t3)", marginTop: 6 }}>กำลังค้นหา...</div>
                    </div>
                  )}

                  {searchError && (
                    <div style={{ color: "var(--red)", fontSize: 11, padding: 8, textAlign: "center" }}>
                      {searchError}
                    </div>
                  )}

                  {!searchLoading && !searchError && (
                    <div className="quran-sidebar" style={{ overflowY: "auto", flex: 1 }}>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        {searchResults.length > 0 && (
                          <div style={{ padding: "10px 14px", fontSize: 11, fontWeight: 500, borderBottom: "0.5px solid var(--quran-br)", background: "var(--quran-teal-bg)", color: "var(--quran-teal)", textAlign: "left", borderRadius: "6px 6px 0 0" }}>
                            พบคำสำคัญนี้ {searchResults.length} ครั้งในคัมภีร์
                          </div>
                        )}
                        {searchResults.length > 0 ? (
                          searchResults.map((match, i) => {
                            const highlightText = (text, query) => {
                              if (!query) return text
                              const parts = text.split(new RegExp(`(${query})`, "gi"))
                              return parts.map((part, idx) => 
                                part.toLowerCase() === query.toLowerCase() 
                                  ? <span key={idx} className="search-highlight">{part}</span> 
                                  : part
                              )
                            }

                            return (
                              <div 
                                key={`${match.surah.number}_${match.numberInSurah}_${i}`} 
                                className="search-result-item"
                                onClick={() => {
                                  handleSelectSearchResult(match);
                                  setIsMobileNavOpen(false);
                                }}
                                style={{ padding: "12px", borderBottom: "0.5px solid var(--quran-br)" }}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                  <span style={{ fontSize: 10, fontWeight: 600, color: "var(--quran-teal)" }}>
                                    ซูเราะฮ์ {match.surah.englishName} ({match.numberInSurah})
                                  </span>
                                  <span style={{ fontSize: 9, color: "var(--quran-t3)" }}>
                                    [{match.surah.number}:{match.numberInSurah}]
                                  </span>
                                </div>
                                <div style={{ fontSize: 11, color: "var(--quran-text)", lineHeight: 1.45, textAlign: "left" }}>
                                  {highlightText(match.text, keywordQuery)}
                                </div>
                              </div>
                            )
                          })
                        ) : (
                          <div style={{ padding: 24, textAlign: "center", fontSize: 11, color: "var(--quran-t3)" }}>
                            {searchHasRun ? "ไม่พบคำสำคัญนี้" : "พิมพ์คำค้นหาเพื่อเริ่มค้นหาอายะฮ์"}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
} 