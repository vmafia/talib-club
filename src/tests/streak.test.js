// src/tests/streak.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { calculateReadingStreak, getLocalDayKey } from "../utils/streak.js"

describe("calculateReadingStreak", () => {
  // Set system time to a fixed date: 2026-06-05 (Friday)
  const fakeSystemTime = new Date("2026-06-05T12:00:00").getTime()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(fakeSystemTime)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("should return day key correctly formatted as YYYY-MM-DD", () => {
    const key = getLocalDayKey(fakeSystemTime)
    expect(key).toBe("2026-06-05")
  })

  it("should calculate streak correctly with consecutive daily reads", () => {
    // Read on 2026-06-03, 2026-06-04, 2026-06-05 (3 consecutive days)
    const reads = [
      new Date("2026-06-03T10:00:00").getTime(),
      new Date("2026-06-04T15:00:00").getTime(),
      new Date("2026-06-05T09:00:00").getTime(),
    ]

    const result = calculateReadingStreak(reads, [])

    expect(result.current).toBe(3)
    expect(result.best).toBe(3)
    expect(result.totalDays).toBe(3)
    expect(result.todayVerified).toBe(true)
  })

  it("should calculate streak correctly when yesterday was read but today is not yet read", () => {
    // Read on 2026-06-03, 2026-06-04 (no read yet today on 2026-06-05)
    const reads = [
      new Date("2026-06-03T10:00:00").getTime(),
      new Date("2026-06-04T15:00:00").getTime(),
    ]

    const result = calculateReadingStreak(reads, [])

    // The streak should still be active (current streak = 2) since today is not yet over
    expect(result.current).toBe(2)
    expect(result.best).toBe(2)
    expect(result.todayVerified).toBe(false)
  })

  it("should break streak and return 0 current streak if last read was more than 1 day ago", () => {
    // Read on 2026-06-01, 2026-06-02 (today is 2026-06-05, gap on June 3rd and 4th)
    const reads = [
      new Date("2026-06-01T10:00:00").getTime(),
      new Date("2026-06-02T15:00:00").getTime(),
    ]

    const result = calculateReadingStreak(reads, [])

    expect(result.current).toBe(0)
    expect(result.best).toBe(2) // Best streak is still preserved
  })

  it("should protect streak using freeze protection", () => {
    // Reads on June 3rd and June 5th (no read on June 4th)
    const reads = [
      new Date("2026-06-03T10:00:00").getTime(),
      new Date("2026-06-05T09:00:00").getTime(),
    ]
    // Freeze protection applied on June 4th
    const protections = [
      { date: "2026-06-04", type: "freeze" }
    ]

    const result = calculateReadingStreak(reads, protections)

    // The gap on June 4th is covered, so streak remains 3
    expect(result.current).toBe(3)
    expect(result.best).toBe(3)
    expect(result.protectedTotal).toBe(1)
  })

  it("should protect streak using leave credits", () => {
    // Reads on June 2nd, June 3rd, and June 5th (no read on June 4th)
    const reads = [
      new Date("2026-06-02T10:00:00").getTime(),
      new Date("2026-06-03T10:00:00").getTime(),
      new Date("2026-06-05T09:00:00").getTime(),
    ]
    // Leave protection applied on June 4th
    const protections = [
      { date: "2026-06-04", type: "leave" }
    ]

    const result = calculateReadingStreak(reads, protections)

    // Gap covered, streak = 4
    expect(result.current).toBe(4)
    expect(result.best).toBe(4)
  })
})
