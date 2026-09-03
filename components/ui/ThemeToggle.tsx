'use client'

import { useSyncExternalStore } from 'react'

const THEME_CHANGE_EVENT = 'themechange'

function subscribe(callback: () => void) {
  window.addEventListener(THEME_CHANGE_EVENT, callback)
  return () => window.removeEventListener(THEME_CHANGE_EVENT, callback)
}

function getSnapshot() {
  return document.documentElement.classList.contains('dark')
}

function getServerSnapshot() {
  return false
}

export function ThemeToggle() {
  const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  function toggle() {
    const next = !isDark
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT))
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      title={isDark ? 'Modo claro' : 'Modo oscuro'}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-primary hover:text-primary-foreground hover:border-primary"
    >
      {isDark ? (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
          <path d="M12 3a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V4a1 1 0 0 1 1-1Zm0 15a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1Zm9-6a1 1 0 0 1-1 1h-1a1 1 0 1 1 0-2h1a1 1 0 0 1 1 1ZM5 12a1 1 0 0 1-1 1H3a1 1 0 1 1 0-2h1a1 1 0 0 1 1 1Zm12.657 6.657a1 1 0 0 1-1.414 0l-.708-.707a1 1 0 1 1 1.415-1.415l.707.708a1 1 0 0 1 0 1.414ZM7.464 8.464a1 1 0 0 1-1.414 0l-.707-.707A1 1 0 1 1 6.757 6.34l.707.708a1 1 0 0 1 0 1.415Zm11.193-2.121a1 1 0 0 1 0 1.414l-.707.708a1 1 0 1 1-1.415-1.415l.708-.707a1 1 0 0 1 1.414 0ZM8.464 17.657a1 1 0 0 1 0 1.414l-.707.707a1 1 0 0 1-1.415-1.414l.708-.708a1 1 0 0 1 1.414 0ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
          <path d="M21.64 13.35A9 9 0 1 1 10.65 2.36a1 1 0 0 1 1.11 1.44 7 7 0 0 0 8.44 9.55 1 1 0 0 1 1.44 1.1Z" />
        </svg>
      )}
    </button>
  )
}
