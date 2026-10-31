import { useRef, useState, useSyncExternalStore } from 'react'
import { motion, useInView } from 'motion/react'
import { AudioLines, BookOpen, ClipboardList, FlaskConical, ArrowRightLeft, Pause, Play, ShieldCheck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import './workflow-transformation.css'

const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
function subscribeMotionPreference(onChange: () => void) {
  motionPreference.addEventListener('change', onChange)
  return () => motionPreference.removeEventListener('change', onChange)
}
function useSectionReducedMotion() {
  return useSyncExternalStore(subscribeMotionPreference, () => motionPreference.matches, () => true)
}

const fragmentedSteps = [
  { icon: FlaskConical, title: 'Do the work', turn: -8 },
  { icon: BookOpen, title: 'Find the SOP', turn: 6 },
  { icon: ArrowRightLeft, title: 'Switch context', turn: -4 },
  { icon: ClipboardList, title: 'Record data', turn: 5 },
]
const outputs = [
  { icon: BookOpen, title: 'Guide', description: 'Answers from approved SOPs and procedures' },
  { icon: AudioLines, title: 'Capture', description: 'Structured measurements and observations' },
  { icon: ShieldCheck, title: 'Verify', description: 'Validation and traceable records' },
]

function InstrumentIcon({ icon: Icon, turn = 0, delay = 0 }: { icon: LucideIcon; turn?: number; delay?: number }) {
  const reduced = useSectionReducedMotion()
  return <motion.span className="wt-instrument-icon" initial={reduced ? false : { opacity: .3, rotate: turn, y: 5 }} whileInView={{ opacity: 1, rotate: 0, y: 0 }} viewport={{ once: true, amount: .7 }} transition={{ duration: .25, delay }} aria-hidden="true"><Icon size={27} strokeWidth={1.35} /></motion.span>
}

function WorkflowStep({ step, index }: { step: typeof fragmentedSteps[number]; index: number }) {
  const reduced = useSectionReducedMotion()
  return <motion.li className="wt-fragment" initial={reduced ? false : { opacity: .35, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .8 }} transition={{ duration: .25, delay: index * .065 }}>
    <InstrumentIcon icon={step.icon} turn={step.turn} delay={index * .065} />
    <div><h4>{step.title}</h4></div>
    {index < fragmentedSteps.length - 1 && <svg className="wt-step-link" viewBox="0 0 24 16" fill="none" aria-hidden="true"><path d="M2 8H21M16 3l5 5-5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>}
  </motion.li>
}

function ConnectedOutput({ output }: { output: typeof outputs[number] }) {
  return <li className="wt-output"><span className="wt-output-node" aria-hidden="true" /><span className="wt-output-icon" aria-hidden="true"><output.icon size={21} strokeWidth={1.5} /></span><div><h4>{output.title}</h4><p>{output.description}</p></div></li>
}

function VoiceInstrument() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { amount: .25 })
  const reduced = useSectionReducedMotion()
  const [paused, setPaused] = useState(false)
  const playing = inView && !reduced && !paused
  return <div className="wt-voice" ref={ref}>
    <div className="wt-orb" aria-hidden="true">
      <span className="wt-ring wt-ring-outer" /><span className="wt-ring wt-ring-middle" /><span className="wt-ring wt-ring-inner" />
      <div className="wt-wave">{Array.from({ length: 31 }, (_, i) => {
        const height = 10 + Math.pow(Math.sin(i * .69), 2) * (1 - Math.abs(i - 15) / 18) * 53
        return <motion.span key={i} style={{ height }} animate={{ scaleY: playing ? [.5, 1, .65, .5] : .65 }} transition={{ duration: 1.6 + i % 4 * .13, repeat: playing ? Infinity : 0, delay: playing ? i * .025 : 0 }} />
      })}</div><span className="wt-orb-tick wt-orb-tick-top" /><span className="wt-orb-tick wt-orb-tick-bottom" />
    </div>
    <h3>Just speak.<br /><span>Lattice follows your work.</span></h3>
    <div className="wt-voice-meta">
      {!reduced && <motion.button type="button" className="wt-play-control" aria-label={paused ? 'Play workflow voice animation' : 'Pause workflow voice animation'} aria-pressed={paused} onClick={() => setPaused(value => !value)} whileHover={{ scale: 1.06 }} whileTap={{ scale: .96 }} transition={{ type: 'spring', stiffness: 400, damping: 28 }}>{paused ? <Play size={13} aria-hidden="true" /> : <Pause size={13} aria-hidden="true" />}</motion.button>}
    </div>
  </div>
}

export function WorkflowTransformation() {
  const reduced = useSectionReducedMotion()
  return <section className="problem section-shell wt-section" id="problem" aria-labelledby="wt-title">
    <header className="wt-heading"><h2 id="wt-title">Great work deserves<br /><span>an uninterrupted workflow.</span></h2></header>
    <div className="wt-transformation">
      <div className="wt-without" role="group" aria-labelledby="wt-without-title"><div className="wt-panel-label"><h3 id="wt-without-title">Without Lattice</h3></div><ol className="wt-fragments">{fragmentedSteps.map((step, i) => <WorkflowStep key={step.title} step={step} index={i} />)}</ol></div>
      <div className="wt-transition"><svg viewBox="0 0 1000 86" preserveAspectRatio="none" fill="none" aria-hidden="true"><path d="M210 0V24Q210 42 230 42H410Q430 42 430 62V86" stroke="#29272f" /><motion.path d="M210 0V24Q210 42 230 42H410Q430 42 430 62V86" stroke="#8076ff" initial={reduced ? false : { pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: .3, ease: 'easeOut' }} /></svg></div>
      <div className="wt-with" role="group" aria-labelledby="wt-with-title"><div className="wt-panel-label"><h3 id="wt-with-title"><span className="wt-with-mark" aria-hidden="true"><AudioLines size={15} /></span>With Lattice</h3></div><div className="wt-solution-body"><VoiceInstrument /><div className="wt-intelligence"><svg className="wt-system-link" viewBox="0 0 70 200" preserveAspectRatio="none" fill="none" aria-hidden="true"><path d="M0 100H25Q35 100 35 90V30Q35 20 45 20H70M35 100H70M35 100V170Q35 180 45 180H70" stroke="currentColor" /></svg><ul className="wt-outputs">{outputs.map(output => <ConnectedOutput key={output.title} output={output} />)}</ul></div></div></div>
    </div>
  </section>
}


