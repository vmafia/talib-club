import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { useAudio } from "../context/AudioContext.jsx"
import { SURA_LIST } from "../data/surahs.js"
import { getSurahTheme } from "../data/quranThemes.js"
import { useUserCollection, useUserDoc } from "../lib/contentStore.js"
import toast from "react-hot-toast"
import { confirmAction } from "../utils/feedback.jsx"
import DOMPurify from "dompurify"
import { getOfflineItem, setOfflineItem } from "../lib/offlineStore.js"

import "./quran/Quran.css"
import {
  JUZ_STARTS,
  normalizeSuraNumber,
  normalizeAyahNumber,
  stripTajweedTags,
  stripAllTags,
  cleanTajweedTags
} from "./quran/utils/quranUtils.js"
import { useQuranSettings } from "./quran/hooks/useQuranSettings.js"

import QuranHeader from "./quran/components/QuranHeader.jsx"
import QuranSidebar from "./quran/components/QuranSidebar.jsx"
import VerseList from "./quran/components/VerseList.jsx"
import MushafView from "./quran/components/MushafView.jsx"
import AyahMenuModal from "./quran/components/AyahMenuModal.jsx"
import BookmarkModal from "./quran/components/BookmarkModal.jsx"

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
  const [showMobileSettings, setShowMobileSettings] = useState(false)
  const [benefitsExpanded, setBenefitsExpanded] = useState(false)
  const [showObjective, setShowObjective] = useState(false)
  const [scrollPercent, setScrollPercent] = useState(0)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [searchHasRun, setSearchHasRun] = useState(false)
  const [targetScrollAyah, setTargetScrollAyah] = useState(() => normalizeAyahNumber(initialAyah))
  const [reloadKey, setReloadKey] = useState(0)
  const [quranBenefits, setQuranBenefits] = useState(null)

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

  useEffect(() => {
    let active = true

    if (!quranBenefits) {
      fetch("/quranBenefits.json")
        .then(res => {
          if (!res.ok) {
            throw new Error(`Failed to load Quran benefits: ${res.status}`)
          }
          return res.json()
        })
        .then(data => {
          if (active) setQuranBenefits(data)
        })
        .catch(err => {
          console.error("Failed to load Quran benefits data", err)
        })
    }

    return () => {
      active = false
    }
  }, [quranBenefits])

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

    const loadPageOffline = async () => {
      try {
        const cached = await getOfflineItem('quran_pages', selectedPage)
        if (cached && cached.length > 0 && active) {
          setPageVerses(cached)
          setSelectedSura(cached[0].sura)
          setPageLoading(false)
          return true
        }
      } catch (err) {
        console.warn("Offline page fetch failed", err)
      }
      return false
    }

    const fetchPageOnline = () => {
      const quranComUrl = `https://api.quran.com/api/v4/quran/verses/uthmani_tajweed?page_number=${selectedPage}`

      fetch(quranComUrl)
        .then(res => {
          if (!res.ok) throw new Error("Quran.com API error")
          return res.json()
        })
        .then(data => {
          if (!active) return
          if (data.verses && data.verses.length > 0) {
            const versesMapped = data.verses.map(v => {
              const parts = v.verse_key.split(":")
              const suraNum = parseInt(parts[0])
              const ayaNum = parseInt(parts[1])
              const suraInfo = SURA_LIST.find(s => s.number === suraNum)
              const cleanText = cleanTajweedTags(v.text_uthmani_tajweed || "")
              return {
                id: v.id,
                sura: suraNum,
                aya: ayaNum,
                arabic_text: cleanText,
                arabic_text_tajweed: cleanText,
                suraName: suraInfo ? suraInfo.englishName : ""
              }
            })
            setPageVerses(versesMapped)
            setSelectedSura(versesMapped[0].sura)
            setPageLoading(false)
            setOfflineItem('quran_pages', selectedPage, versesMapped).catch(() => {})
          } else {
            throw new Error("No verses returned")
          }
        })
        .catch(err => {
          console.warn("Failed to load page from Quran.com API, falling back to AlQuran.cloud", err)
          fetch(`https://api.alquran.cloud/v1/page/${selectedPage}/quran-simple`)
            .then(res => res.json())
            .then(data => {
              if (!active) return
              if (data.code === 200 && data.data?.ayahs) {
                const ayahs = data.data.ayahs
                const versesMapped = ayahs.map(aya => {
                  const cleanText = cleanTajweedTags(aya.text || "")
                  return {
                    id: aya.number,
                    sura: aya.surah.number,
                    aya: aya.numberInSurah,
                    arabic_text: cleanText,
                    arabic_text_tajweed: cleanText,
                    suraName: aya.surah.englishName
                  }
                })
                setPageVerses(versesMapped)
                if (ayahs.length > 0) {
                  setSelectedSura(ayahs[0].surah.number)
                }
                setPageLoading(false)
                setOfflineItem('quran_pages', selectedPage, versesMapped).catch(() => {})
              } else {
                setPageLoading(false)
              }
            })
            .catch(fallbackErr => {
              if (!active) return
              console.error("Both APIs failed", fallbackErr)
              setPageLoading(false)
              toast.error("ไม่สามารถโหลดข้อมูลหน้าได้")
            })
        })
    }

    loadPageOffline().then(found => {
      if (!found) fetchPageOnline()
    })

    return () => {
      active = false
    }
  }, [selectedPage])

  const [search, setSearch] = useState("")
  const {
    mode, setMode,
    translationKey, setTranslationKey,
    arabicSize, setArabicSize,
    thaiSize, setThaiSize,
    quranFont,
    tajweedEnabled, setTajweedEnabled,
    showTajweedLegend, setShowTajweedLegend
  } = useQuranSettings()

  // Reset selectedPage if mode leaves mushaf
  useEffect(() => {
    if (mode !== "mushaf") {
      setSelectedPage(null)
    }
  }, [mode])

  const [verses, setVerses] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const cache = useRef({}) // Cache fetches
  const inFlightModalRequests = useRef(new Map()) // Deduplication for modal fetches

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

  // Search & Navigation States
  const [sidebarTab, setSidebarTab] = useState("surah") // "surah" | "search"
  const [keywordQuery, setKeywordQuery] = useState("")
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState(null)
  const uid = authState?.user?.uid
  const lastReadDocId = uid ? `${uid}_last_read` : null

  const { items: savedVerses, saveItem, deleteItem } = useUserCollection("quran_bookmarks", uid)
  const { item: remoteLastRead, saveItem: saveLastRead, deleteItem: deleteLastRead } = useUserDoc(
    "quran_last_read",
    uid,
    lastReadDocId
  )

  const [lastRead, setLastRead] = useState(() => {
    try {
      const local = localStorage.getItem("quran-last-read")
      return local ? JSON.parse(local) : null
    } catch {
      return null
    }
  })

  useEffect(() => {
    if (uid && remoteLastRead) {
      setLastRead(remoteLastRead)
      localStorage.setItem("quran-last-read", JSON.stringify(remoteLastRead))
    }
  }, [remoteLastRead, uid])

  const updateLastRead = async (suraNum, ayahNum) => {
    const isAlreadyBookmarked = lastRead?.sura === suraNum && lastRead?.aya === ayahNum

    if (isAlreadyBookmarked) {
      // Rollback state first before async delete
      const prevLastRead = lastRead
      setLastRead(null)
      localStorage.removeItem("quran-last-read")
      if (uid) {
        try {
          await deleteLastRead(`${uid}_last_read`)
          toast.success("ยกเลิกการคั่นหน้าแล้ว")
        } catch (err) {
          // Restore state on failure
          console.error("Failed to delete last read", err)
          setLastRead(prevLastRead)
          localStorage.setItem("quran-last-read", JSON.stringify(prevLastRead))
          toast.error("ยกเลิกคั่นหน้าไม่สำเร็จ")
        }
      } else {
        toast.success("ยกเลิกการคั่นหน้าแล้ว")
      }
      return
    }

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

    // For non-logged-in users, save locally only
    if (!uid) {
      setLastRead(newItem)
      localStorage.setItem("quran-last-read", JSON.stringify(newItem))
      toast.success(`คั่นหน้าการอ่านที่ อายะฮ์ [${suraNum}:${ayahNum}] เรียบร้อย 📖`)
      return
    }

    // For logged-in users, save to Firebase first before updating state
    try {
      await saveLastRead(newItem)
      // Only update state after Firebase save succeeds
      setLastRead(newItem)
      localStorage.setItem("quran-last-read", JSON.stringify(newItem))
      toast.success(`คั่นหน้าการอ่านที่ อายะฮ์ [${suraNum}:${ayahNum}] เรียบร้อย 📖`)
    } catch (err) {
      console.error("Failed to save last read to Firestore", err)
      toast.error("บันทึกการคั่นหน้าไม่สำเร็จ")
      // State not updated on failure, user sees old value
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
  const [activeAyahMenu, setActiveAyahMenu] = useState(null)

  // --- Global Audio Recitation Context ---
  const { playingAudio, audioState, autoplayNext, setAutoplayNext, play, pause, resume, stop } = useAudio()
  const [modalDetails, setModalDetails] = useState({ loading: false, translation: "", tafsir: "", error: null })

  // Fetch translation & tafsir dynamically for activeAyahMenu in Mushaf mode
  // Deduplicate simultaneous requests for the same ayah
  useEffect(() => {
    let active = true

    if (!activeAyahMenu) {
      setModalDetails({ loading: false, translation: "", tafsir: "", error: null })
      return
    }

    const { sura, aya } = activeAyahMenu
    const match = verses.find(item => item.sura === sura && item.aya === aya)
    if (match && match.translation && match.tafsir) {
      if (active) {
        setModalDetails({
          loading: false,
          translation: match.translation,
          tafsir: match.tafsir,
          error: null
        })
      }
      return
    }

    if (active) {
      setModalDetails({ loading: true, translation: "", tafsir: "", error: null })
    }

    // Deduplication key for modal requests
    const dedupeKey = `modal_${translationKey}_${sura}_${aya}`

    // Check if this request is already in flight
    const inFlightRequest = inFlightModalRequests.current.get(dedupeKey)
    if (inFlightRequest) {
      // Return the existing promise instead of creating a new one
      inFlightRequest
        .then(([transData, tafsirData]) => {
          if (!active) return
          setModalDetails({
            loading: false,
            translation: transData.result?.translation || "",
            tafsir: tafsirData.result?.translation || "",
            error: null
          })
        })
        .catch(err => {
          if (!active) return
          console.error("Failed to fetch modal details (deduped)", err)
          setModalDetails({
            loading: false,
            translation: "",
            tafsir: "",
            error: "ไม่สามารถโหลดข้อมูลคำแปลและตัฟซีรได้"
          })
        })
        .finally(() => {
          // Clean up from dedup map when complete
          inFlightModalRequests.current.delete(dedupeKey)
        })
      return
    }

    // Create new request
    const fetchPromise = Promise.all([
      fetch(`https://quranenc.com/api/v1/translation/aya/${translationKey}/${sura}/${aya}`).then(res => {
        if (!res.ok) throw new Error("Failed to load translation")
        return res.json()
      }),
      fetch(`https://quranenc.com/api/v1/translation/aya/thai_mokhtasar/${sura}/${aya}`).then(res => {
        if (!res.ok) throw new Error("Failed to load tafsir")
        return res.json()
      })
    ])

    // Store in flight request
    inFlightModalRequests.current.set(dedupeKey, fetchPromise)

    fetchPromise
      .then(([transData, tafsirData]) => {
        if (!active) return
        setModalDetails({
          loading: false,
          translation: transData.result?.translation || "",
          tafsir: tafsirData.result?.translation || "",
          error: null
        })
      })
      .catch(err => {
        if (!active) return
        console.error("Failed to fetch modal details", err)
        setModalDetails({
          loading: false,
          translation: "",
          tafsir: "",
          error: "ไม่สามารถโหลดข้อมูลคำแปลและตัฟซีรได้"
        })
      })
      .finally(() => {
        // Clean up from dedup map when complete
        inFlightModalRequests.current.delete(dedupeKey)
      })

    return () => { active = false }
  }, [activeAyahMenu, translationKey, verses])

  const getVerseTranslation = (suraNum, ayaNum) => {
    const list = selectedPage ? pageVerses : verses
    const match = list.find(item => item.sura === suraNum && item.aya === ayaNum)
    return match ? match.translation : ""
  }

  const getVerseTafsir = (suraNum, ayaNum) => {
    const list = selectedPage ? pageVerses : verses
    const match = list.find(item => item.sura === suraNum && item.aya === ayaNum)
    return match ? match.tafsir : ""
  }



  // Auto scroll to active reciting verse
  useEffect(() => {
    if (playingAudio && audioState === "playing") {
      const elementId = mode === "mushaf"
        ? `mushaf-ayah-${playingAudio.sura}-${playingAudio.aya}`
        : `ayah-${playingAudio.aya}`
      const element = document.getElementById(elementId)
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" })
      }
    }
  }, [playingAudio, audioState, mode])

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
      arabicText: v.arabic_text_tajweed || v.arabic_text || "",
      translation: v.translation,
      tafsir: v.tafsir,
      bookmarkId: existingBookmark?.id || null
    })
    setModalNotes(existingBookmark?.notes || "")
  }

  const handleSaveBookmark = async () => {
    if (!activeBookmarkModal || activeBookmarkModal.isSaving) return
    setActiveBookmarkModal(prev => ({ ...prev, isSaving: true }))
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
        arabicText: activeBookmarkModal.arabicText || "",
        translation: activeBookmarkModal.translation || "",
        tafsir: activeBookmarkModal.tafsir || "",
        notes: modalNotes,
      })

      toast.success(isNew ? "บันทึกอายะฮ์สำเร็จ" : "อัปเดตข้อคิดแล้ว", { id: toastId })
      setActiveBookmarkModal(null)
    } catch (err) {
      setActiveBookmarkModal(prev => prev ? { ...prev, isSaving: false } : null)
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

    const loadSuraOffline = async () => {
      try {
        const cached = await getOfflineItem('quran_translations', cacheKey)
        if (cached && cached.length > 0 && active) {
          cache.current[cacheKey] = cached
          setVerses(cached)
          setLoading(false)
          return true
        }
      } catch (err) {
        console.warn("Offline sura fetch failed", err)
      }
      return false
    }

    const fetchSuraOnline = () => {
      const transUrl = `https://quranenc.com/api/v1/translation/sura/${translationKey}/${selectedSura}`
      const tafsirUrl = `https://quranenc.com/api/v1/translation/sura/thai_mokhtasar/${selectedSura}`
      const quranComUrl = `https://api.quran.com/api/v4/quran/verses/uthmani_tajweed?chapter_number=${selectedSura}`

      Promise.all([
        fetch(transUrl).then(res => {
          if (!res.ok) throw new Error("ไม่สามารถเชื่อมต่อคำแปลความหมายจากระบบ QuranEnc ได้")
          return res.json()
        }),
        fetch(tafsirUrl).then(res => {
          if (!res.ok) throw new Error("ไม่สามารถเชื่อมต่อบทอธิบายความหมายย่อ (Tafsir) ได้")
          return res.json()
        }),
        fetch(quranComUrl)
          .then(res => {
            if (!res.ok) throw new Error("Failed to fetch Tajweed from Quran.com")
            return res.json()
          })
          .catch(err => {
            console.warn("Quran.com Tajweed API failed, falling back to QuranEnc Arabic text", err)
            return null
          })
      ])
        .then(([transData, tafsirData, tajweedData]) => {
          if (!active) return

          const merged = transData.result.map((aya, idx) => {
            const tafsirAya = tafsirData.result[idx] || {}

            let tajweedText = null
            if (tajweedData && tajweedData.verses) {
              const matchingTajweed = tajweedData.verses.find(v => {
                const parts = v.verse_key.split(":")
                return parseInt(parts[1]) === parseInt(aya.aya)
              })
              if (matchingTajweed) {
                tajweedText = matchingTajweed.text_uthmani_tajweed
              }
            }

            return {
              id: aya.id,
              sura: aya.sura,
              aya: aya.aya,
              arabic_text: cleanTajweedTags(aya.arabic_text || ""),
              arabic_text_tajweed: cleanTajweedTags(tajweedText || aya.arabic_text || ""),
              translation: aya.translation,
              tafsir: tafsirAya.translation || ""
            }
          })

          cache.current[cacheKey] = merged
          setVerses(merged)
          setLoading(false)
          setOfflineItem('quran_translations', cacheKey, merged).catch(() => {})
        })
        .catch(err => {
          if (!active) return
          console.error(err)
          setError(err.message || "เกิดข้อผิดพลาดในการโหลดข้อมูลกรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต")
          setLoading(false)
        })
    }

    loadSuraOffline().then(found => {
      if (!found) fetchSuraOnline()
    })

    return () => {
      active = false
    }
  }, [selectedSura, translationKey, reloadKey])

  useEffect(() => {
    if (targetScrollAyah && !loading && verses.length > 0) {
      const element = document.getElementById(`ayah-${targetScrollAyah}`)
      if (element) {
        let timer2
        const timer1 = setTimeout(() => {
          element.scrollIntoView({ behavior: "smooth", block: "center" })
          element.classList.add("pulse-highlight")
          timer2 = setTimeout(() => {
            element.classList.remove("pulse-highlight")
            setTargetScrollAyah(null)
          }, 3000)
        }, 350)
        return () => {
          clearTimeout(timer1)
          if (timer2) clearTimeout(timer2)
        }
      }
    }
  }, [targetScrollAyah, loading, verses])

  const getArabicNumber = (num) => {
    const arabicDigits = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"]
    return String(num).split("").map(digit => arabicDigits[Number(digit)] || digit).join("")
  }

  const hasBismillah = selectedSura !== 1 && selectedSura !== 9

  return (
    <div className="quran-container">
      

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
        <QuranSidebar 
          isMobile={isMobile}
          sidebarCollapsed={sidebarCollapsed}
          setSidebarCollapsed={setSidebarCollapsed}
          sidebarTab={sidebarTab}
          setSidebarTab={setSidebarTab}
          navMode={navMode}
          setNavMode={setNavMode}
          search={search}
          setSearch={setSearch}
          filteredSurahs={filteredSurahs}
          selectedSura={selectedSura}
          setSelectedSura={setSelectedSura}
          setSelectedPage={setSelectedPage}
          setTargetScrollAyah={setTargetScrollAyah}
          targetScrollAyah={targetScrollAyah}
          JUZ_STARTS={JUZ_STARTS}
          handleSelectPage={handleSelectPage}
          pageInput={pageInput}
          setPageInput={setPageInput}
          handleKeywordSearch={handleKeywordSearch}
          keywordQuery={keywordQuery}
          setKeywordQuery={setKeywordQuery}
          searchLoading={searchLoading}
          searchError={searchError}
          searchResults={searchResults}
          searchHasRun={searchHasRun}
          handleSelectSearchResult={handleSelectSearchResult}
          setIsMobileNavOpen={setIsMobileNavOpen}
          mode={mode}
          currentSuraInfo={currentSuraInfo}
          showMobileSettings={showMobileSettings}
          setShowMobileSettings={setShowMobileSettings}
        />
        {/* MAIN PANEL */}
        <div style={{ flex: 1, minWidth: 0 }}>

          <QuranHeader
            currentSuraInfo={currentSuraInfo}
            selectedPage={selectedPage}
            audioState={audioState}
            autoplayNext={autoplayNext}
            pause={pause}
            resume={resume}
            pageVerses={pageVerses}
            verses={verses}
            setAutoplayNext={setAutoplayNext}
            play={play}
            selectedSura={selectedSura}
            showObjective={showObjective}
            setShowObjective={setShowObjective}
            isMobile={isMobile}
            showMobileSettings={showMobileSettings}
            mode={mode}
            setMode={setMode}
            arabicSize={arabicSize}
            setArabicSize={setArabicSize}
            thaiSize={thaiSize}
            setThaiSize={setThaiSize}
            quranFont={quranFont}
            tajweedEnabled={tajweedEnabled}
            setTajweedEnabled={setTajweedEnabled}
            translationKey={translationKey}
            setTranslationKey={setTranslationKey}
            scrollToReadingArea={scrollToReadingArea}
          />

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
              padding: isMobile ? "16px" : "24px 28px",
              border: "0.5px solid var(--br)",
              borderRadius: "16px",
              boxShadow: isMobile ? "0 2px 8px rgba(0,0,0,0.05)" : "var(--shadow)",
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
                    بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
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
                          <MushafView 
                            verses={pageVerses}
                            arabicSize={arabicSize}
                            quranFont={quranFont}
                            isMobile={isMobile}
                            lastRead={lastRead}
                            tajweedEnabled={tajweedEnabled}
                            setActiveAyahMenu={setActiveAyahMenu}
                            emptyMessage="ไม่พบข้อมูลหน้านี้ กรุณาลองเลือกหน้าใหม่อีกครั้ง"
                          />
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
                    <>
                    {/* STANDARD SURAH-BASED MUSHAF VIEW */}
                    <MushafView 
                      verses={verses}
                      arabicSize={arabicSize}
                      quranFont={quranFont}
                      isMobile={isMobile}
                      lastRead={lastRead}
                      tajweedEnabled={tajweedEnabled}
                      setActiveAyahMenu={setActiveAyahMenu}
                    />
                    </>
                  )
                ) : (

                  <>
                    {/* TRANSLATION & TAFSIR MODES (VERSE LIST) */}
                    <VerseList
                    verses={verses}
                    selectedPage={selectedPage}
                    pageVerses={pageVerses}
                    updateLastRead={updateLastRead}
                    lastRead={lastRead}
                    handleOpenBookmarkModal={handleOpenBookmarkModal}
                    getBookmarkForVerse={getBookmarkForVerse}
                    arabicSize={arabicSize}
                    quranFont={quranFont}
                    tajweedEnabled={tajweedEnabled}
                    thaiSize={thaiSize}
                    mode={mode}
                    isMobile={isMobile}
                  />
                  </>
                )}
              </div>
            </div>
          )}

          {/* VERSE BENEFITS (فوائد الآيات) */}
          {!loading && !error && verses.length > 0 && (() => {
            const suraBenefits = quranBenefits?.[selectedSura] || [];
            if (suraBenefits.length === 0) return null;
            return (
              <div
                className="card"
                style={{
                  marginTop: 20,
                  padding: "20px 24px",
                  borderTop: "3px solid var(--quran-teal)",
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

      <BookmarkModal
        activeBookmarkModal={activeBookmarkModal}
        setActiveBookmarkModal={setActiveBookmarkModal}
        modalNotes={modalNotes}
        setModalNotes={setModalNotes}
        tajweedEnabled={tajweedEnabled}
        handleDeleteBookmark={handleDeleteBookmark}
        handleSaveBookmark={handleSaveBookmark}
      />

      <AyahMenuModal
        activeAyahMenu={activeAyahMenu}
        setActiveAyahMenu={setActiveAyahMenu}
        quranFont={quranFont}
        tajweedEnabled={tajweedEnabled}
        selectedPage={selectedPage}
        pageVerses={pageVerses}
        verses={verses}
        modalDetails={modalDetails}
        updateLastRead={updateLastRead}
        lastRead={lastRead}
        getBookmarkForVerse={getBookmarkForVerse}
        getVerseTranslation={getVerseTranslation}
        handleOpenBookmarkModal={handleOpenBookmarkModal}
      />

            {/* MOBILE BOTTOM SHEET NAVIGATION DRAWER */}
      {isMobile && isMobileNavOpen && createPortal(
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.4)",
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
              background: "var(--quran-card-bg)",
              borderRadius: "20px 20px 0 0",
              display: "flex",
              flexDirection: "column",
              padding: "16px 20px 24px",
              gap: 12,
              animation: "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
              boxShadow: "0 -10px 40px rgba(0,0,0,0.15)",
              border: "1px solid var(--quran-br)",
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
                            <div key={s.number} style={{ display: "flex", flexDirection: "column", marginBottom: "2px" }}>
                              <div
                                className={`surah-item`}
                                onClick={() => {
                                  setSelectedSura(s.number);
                                  setTargetScrollAyah(null);
                                  // Nav remains open so user can pick ayah
                                }}
                                style={{
                                  padding: "14px 16px",
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  borderBottom: selectedSura === s.number ? "none" : "0.5px solid var(--quran-br2)",
                                  background: selectedSura === s.number ? "var(--quran-teal-bg)" : "transparent",
                                  borderRadius: selectedSura === s.number ? (targetScrollAyah ? "10px" : "10px 10px 0 0") : "0",
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
                              {selectedSura === s.number && (
                                <div style={{ padding: "12px 16px", background: "var(--quran-teal-bg)", borderRadius: "0 0 10px 10px", display: "flex", flexDirection: "column", gap: 8, borderTop: "0.5px dashed rgba(45, 190, 160, 0.3)" }}>
                                  <div style={{ position: "relative", width: "100%" }}>
                                    <select
                                      value={targetScrollAyah || ""}
                                      onChange={e => {
                                        if (e.target.value) {
                                          setTargetScrollAyah(parseInt(e.target.value));
                                          setIsMobileNavOpen(false); // Close nav when Ayah is selected
                                        }
                                      }}
                                      style={{ width: "100%", padding: "10px 28px 10px 12px", fontSize: "13px", fontWeight: 500, borderRadius: "8px", border: "1px solid var(--quran-teal)", background: "var(--quran-bg)", color: "var(--quran-text)", cursor: "pointer", appearance: "none", WebkitAppearance: "none", MozAppearance: "none", outline: "none" }}
                                    >
                                      <option value="">🎯 เลือกอายะฮ์...</option>
                                      {Array.from({ length: s.numberOfAyahs }, (_, i) => i + 1).map(a => (
                                        <option key={a} value={a}>อายะฮ์ที่ {a}</option>
                                      ))}
                                    </select>
                                    <i className="ti ti-chevron-down" style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 11, pointerEvents: "none", color: "var(--quran-teal)" }}></i>
                                  </div>
                                  <button
                                    onClick={() => setIsMobileNavOpen(false)}
                                    style={{ width: "100%", padding: "10px", fontSize: 13, borderRadius: 8, background: "var(--quran-teal)", color: "#fff", border: "none", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                                  >
                                    <i className="ti ti-book" style={{ fontSize: 15 }}></i> ไปที่ซูเราะฮ์นี้ (ตั้งแต่หน้าแรก)
                                  </button>
                                </div>
                              )}
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
                          style={{ width: "100%", height: 38, padding: "0 10px", fontSize: 12, borderRadius: 8, border: "0.5px solid var(--br)", background: "var(--inp)", color: "var(--text)" }}
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
        document.querySelector(".app") || document.body
      )}

      {/* Scroll to Top Button (Mobile) */}
      {isMobile && showScrollTop && createPortal(
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          style={{
            position: "fixed",
            bottom: "80px", // Above mobile navigation if any
            right: "20px",
            width: "44px",
            height: "44px",
            borderRadius: "50%",
            background: "var(--teal, #2DBEA0)",
            color: "#fff",
            border: "none",
            boxShadow: "0 4px 12px rgba(45,190,160,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            zIndex: 9999,
            transition: "all 0.3s ease"
          }}
          aria-label="Scroll to top"
        >
          <i className="ti ti-arrow-up" style={{ fontSize: 22 }}></i>
        </button>,
        document.body
      )}

    </div>
  )
}

