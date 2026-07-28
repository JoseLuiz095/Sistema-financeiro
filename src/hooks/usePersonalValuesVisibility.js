import { useEffect, useState } from 'react'

export const PERSONAL_VALUES_STORAGE_KEY =
  'financeiro:personal-values-visible'

const PERSONAL_VALUES_EVENT =
  'financeiro:personal-values-visibility'

export function getPersonalValuesVisible() {
  try {
    return (
      localStorage.getItem(
        PERSONAL_VALUES_STORAGE_KEY,
      ) !== 'hidden'
    )
  } catch {
    return true
  }
}

export function setPersonalValuesVisibility(
  visible,
) {
  const next = Boolean(visible)

  try {
    localStorage.setItem(
      PERSONAL_VALUES_STORAGE_KEY,
      next ? 'visible' : 'hidden',
    )
  } catch {
    // O estado da tela continua funcionando sem persistência.
  }

  window.dispatchEvent(
    new CustomEvent(PERSONAL_VALUES_EVENT, {
      detail: {
        visible: next,
      },
    }),
  )
}

export default function usePersonalValuesVisibility() {
  const [visible, setVisible] = useState(
    getPersonalValuesVisible,
  )

  useEffect(() => {
    function updateFromPreference(event) {
      const eventValue =
        event?.detail?.visible

      setVisible(
        typeof eventValue === 'boolean'
          ? eventValue
          : getPersonalValuesVisible(),
      )
    }

    function updateFromStorage(event) {
      if (
        event.key ===
        PERSONAL_VALUES_STORAGE_KEY
      ) {
        setVisible(
          getPersonalValuesVisible(),
        )
      }
    }

    window.addEventListener(
      PERSONAL_VALUES_EVENT,
      updateFromPreference,
    )
    window.addEventListener(
      'storage',
      updateFromStorage,
    )

    return () => {
      window.removeEventListener(
        PERSONAL_VALUES_EVENT,
        updateFromPreference,
      )
      window.removeEventListener(
        'storage',
        updateFromStorage,
      )
    }
  }, [])

  return visible
}
