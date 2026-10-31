import * as Tabs from '@radix-ui/react-tabs'
import { LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { useId } from 'react'
// Adapted from Watermelon UI Continuous Tabs (MIT).
// https://ui.watermelon.sh/animated-components/continuous-tabs
// Controlled Radix tabs add keyboard navigation and panel relationships.
export function ContinuousTabs({ value, items }: { value: string; items: readonly { id: string; label: string }[] }) {
  const id = useId()
  const reduced = useReducedMotion()
  return <LayoutGroup id={id}><Tabs.List className="scenario-tabs" aria-label="Preview capability">
    {items.map(item => <Tabs.Trigger key={item.id} value={item.id} className="scenario-tab">
      {value === item.id && <motion.span className="tab-indicator" layoutId="active-pill" transition={{ duration: reduced ? 0 : 0.25, ease: 'easeOut' }} />}
      <span>{item.label}</span>
    </Tabs.Trigger>)}
  </Tabs.List></LayoutGroup>
}
