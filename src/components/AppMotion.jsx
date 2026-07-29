import { AnimatePresence, LazyMotion, MotionConfig } from 'motion/react'
import * as m from 'motion/react-m'

const loadMotionFeatures = () =>
  import('./motionFeatures').then((module) => module.default)

const PAGE_TRANSITION = {
  duration: 0.22,
  ease: [0.22, 1, 0.36, 1],
}

export function AppMotionProvider({ children }) {
  return (
    <LazyMotion features={loadMotionFeatures} strict>
      <MotionConfig reducedMotion="user" transition={PAGE_TRANSITION}>
        {children}
      </MotionConfig>
    </LazyMotion>
  )
}

export function AnimatedPage({ children, pageKey }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <m.div
        key={pageKey}
        className="animated-page-shell"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -5 }}
        transition={PAGE_TRANSITION}
      >
        {children}
      </m.div>
    </AnimatePresence>
  )
}

export function MotionReveal({ children, className = '', delay = 0 }) {
  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...PAGE_TRANSITION, delay }}
    >
      {children}
    </m.div>
  )
}

export { AnimatePresence, m }
