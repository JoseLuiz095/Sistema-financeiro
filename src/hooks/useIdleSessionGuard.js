import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { supabase } from '../lib/supabase'
import {
  checkSessionGuard,
  revokeCurrentSessionGuard,
} from '../services/sessionGuardService'

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000
const CHECK_INTERVAL_MS = 15 * 1000
const HEARTBEAT_INTERVAL_MS = 60 * 1000
const ACTIVITY_THROTTLE_MS = 5 * 1000

function decodeJwtPayload(token) {
  try {
    const payload = token?.split('.')?.[1]

    if (!payload) return null

    const normalized = payload
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(
        payload.length + (4 - (payload.length % 4 || 4)),
        '=',
      )

    return JSON.parse(
      decodeURIComponent(
        atob(normalized)
          .split('')
          .map(
            (character) =>
              `%${character
                .charCodeAt(0)
                .toString(16)
                .padStart(2, '0')}`,
          )
          .join(''),
      ),
    )
  } catch {
    return null
  }
}

export default function useIdleSessionGuard({
  session,
  setFeedback,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const [ready, setReady] = useState(!session)
  const [authorized, setAuthorized] =
    useState(false)
  const [
    authorizedSessionId,
    setAuthorizedSessionId,
  ] = useState(null)

  const expiringRef = useRef(false)
  const initializedRef = useRef(false)
  const lastServerCheckRef = useRef(0)
  const lastActivityEventRef = useRef(0)
  const activityDirtyRef = useRef(false)
  const guardTokenRef = useRef(null)
  const channelRef = useRef(null)

  const hasSession = Boolean(session)

  const sessionId = useMemo(() => {
    const payload = decodeJwtPayload(
      session?.access_token,
    )

    return payload?.session_id ?? null
  }, [session?.access_token])

  const userId = session?.user?.id ?? null

  const storageKeys = useMemo(() => {
    if (!userId || !sessionId) return null

    return {
      activity:
        `financeiro:last-activity:${userId}:${sessionId}`,
      guard:
        `financeiro:guard-token:${userId}:${sessionId}`,
    }
  }, [userId, sessionId])

  useEffect(() => {
    if (
      !hasSession ||
      !userId ||
      !sessionId ||
      !storageKeys
    ) {
      setReady(true)
      setAuthorized(false)
      setAuthorizedSessionId(null)
      return undefined
    }

    let active = true
    let checking = false

    setReady(false)
    setAuthorized(false)
    setAuthorizedSessionId(null)
    expiringRef.current = false
    initializedRef.current = false
    guardTokenRef.current =
      localStorage.getItem(storageKeys.guard)

    const channelName =
      `financeiro-session:${userId}:${sessionId}`

    const channel =
      typeof BroadcastChannel !== 'undefined'
        ? new BroadcastChannel(channelName)
        : null

    channelRef.current = channel

    function getLastActivity() {
      const stored = Number(
        localStorage.getItem(storageKeys.activity),
      )

      return Number.isFinite(stored) && stored > 0
        ? stored
        : Date.now()
    }

    function saveLastActivity(timestamp) {
      localStorage.setItem(
        storageKeys.activity,
        String(timestamp),
      )
    }

    async function expireSession(reason) {
      if (expiringRef.current) return

      expiringRef.current = true
      setAuthorized(false)
      setAuthorizedSessionId(null)

      const message =
        reason === 'idle_timeout'
          ? 'Sua sessão foi encerrada após 15 minutos sem atividade.'
          : 'Sua sessão de segurança foi alterada ou revogada. Entre novamente.'

      sessionStorage.setItem(
        'financeiro:logout-message',
        message,
      )

      setFeedback?.({
        type: 'info',
        message,
      })

      channel?.postMessage({
        type: 'logout',
        reason,
      })

      try {
        await revokeCurrentSessionGuard()
      } catch {
        // A sessão será encerrada localmente mesmo
        // se o servidor já tiver revogado o guard token.
      }

      await supabase.auth.signOut({
        scope: 'local',
      })
    }

    async function serverCheck({
      isActivity = false,
      force = false,
    } = {}) {
      if (
        checking ||
        expiringRef.current ||
        !active
      ) {
        return
      }

      const now = Date.now()

      if (
        !force &&
        now - lastServerCheckRef.current <
          CHECK_INTERVAL_MS
      ) {
        return
      }

      checking = true

      try {
        const result =
          await checkSessionGuard({
            guardToken:
              guardTokenRef.current,
            isActivity,
          })

        lastServerCheckRef.current = now

        if (!result.authorized) {
          await expireSession(
            result.reason ??
              'token_mismatch',
          )
          return
        }

        const nextToken =
          result.guard_token ?? null

        if (
          guardTokenRef.current &&
          nextToken &&
          guardTokenRef.current !==
            nextToken
        ) {
          await expireSession(
            'token_mismatch',
          )
          return
        }

        if (nextToken) {
          guardTokenRef.current =
            nextToken
          localStorage.setItem(
            storageKeys.guard,
            nextToken,
          )
        }

        initializedRef.current = true
        setAuthorized(true)
        setAuthorizedSessionId(sessionId)
        setReady(true)
      } catch (error) {
        if (!initializedRef.current) {
          setReady(true)
          setAuthorized(false)
          setFeedback?.({
            type: 'error',
            message:
              'Não foi possível validar a sessão segura: ' +
              error.message,
          })
          await expireSession(
            'validation_failed',
          )
        }
      } finally {
        checking = false
      }
    }

    function recordActivity() {
      const now = Date.now()

      if (
        now - lastActivityEventRef.current <
        ACTIVITY_THROTTLE_MS
      ) {
        return
      }

      lastActivityEventRef.current = now
      activityDirtyRef.current = true
      saveLastActivity(now)

      channel?.postMessage({
        type: 'activity',
        timestamp: now,
      })
    }

    async function evaluateSession({
      forceServerCheck = false,
    } = {}) {
      if (expiringRef.current) return

      const now = Date.now()
      const lastActivity =
        getLastActivity()
      const idleFor =
        now - lastActivity

      if (idleFor >= timeoutMs) {
        try {
          await serverCheck({
            isActivity: false,
            force: true,
          })
        } finally {
          if (!expiringRef.current) {
            await expireSession(
              'idle_timeout',
            )
          }
        }
        return
      }

      const shouldHeartbeat =
        activityDirtyRef.current &&
        now -
          lastServerCheckRef.current >=
          HEARTBEAT_INTERVAL_MS

      if (
        forceServerCheck ||
        shouldHeartbeat
      ) {
        await serverCheck({
          isActivity:
            activityDirtyRef.current,
          force: forceServerCheck,
        })

        if (activityDirtyRef.current) {
          activityDirtyRef.current = false
        }
      }
    }

    function onStorage(event) {
      if (
        event.key ===
          storageKeys.activity &&
        event.newValue
      ) {
        activityDirtyRef.current = true
      }

      if (
        event.key === storageKeys.guard &&
        event.newValue &&
        guardTokenRef.current &&
        event.newValue !==
          guardTokenRef.current
      ) {
        expireSession(
          'token_mismatch',
        )
      }
    }

    function onVisibilityChange() {
      if (
        document.visibilityState ===
        'visible'
      ) {
        evaluateSession({
          forceServerCheck: true,
        })
      }
    }

    channel?.addEventListener(
      'message',
      (event) => {
        if (
          event.data?.type ===
            'activity' &&
          Number.isFinite(
            event.data.timestamp,
          )
        ) {
          saveLastActivity(
            event.data.timestamp,
          )
          activityDirtyRef.current = true
        }

        if (
          event.data?.type === 'logout'
        ) {
          expireSession(
            event.data.reason ??
              'token_mismatch',
          )
        }
      },
    )

    const activityEvents = [
      'pointerdown',
      'keydown',
      'touchstart',
      'scroll',
    ]

    activityEvents.forEach((eventName) => {
      window.addEventListener(
        eventName,
        recordActivity,
        {
          passive: true,
        },
      )
    })

    window.addEventListener(
      'focus',
      onVisibilityChange,
    )
    window.addEventListener(
      'storage',
      onStorage,
    )
    document.addEventListener(
      'visibilitychange',
      onVisibilityChange,
    )

    if (
      !localStorage.getItem(
        storageKeys.activity,
      )
    ) {
      saveLastActivity(Date.now())
    }

    activityDirtyRef.current = true

    serverCheck({
      isActivity: true,
      force: true,
    })

    const intervalId = window.setInterval(
      () => {
        evaluateSession()
      },
      CHECK_INTERVAL_MS,
    )

    return () => {
      active = false
      window.clearInterval(intervalId)

      activityEvents.forEach(
        (eventName) => {
          window.removeEventListener(
            eventName,
            recordActivity,
          )
        },
      )

      window.removeEventListener(
        'focus',
        onVisibilityChange,
      )
      window.removeEventListener(
        'storage',
        onStorage,
      )
      document.removeEventListener(
        'visibilitychange',
        onVisibilityChange,
      )

      channel?.close()
      channelRef.current = null
    }
  }, [
    hasSession,
    userId,
    sessionId,
    storageKeys,
    timeoutMs,
    setFeedback,
  ])

  return {
    ready,
    authorized,
    sessionId,
    authorizedSessionId,
  }
}
