import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, motion, MotionConfig, useInView, useReducedMotion } from 'motion/react'
import * as Tabs from '@radix-ui/react-tabs'
import { ArrowDown, ArrowDownRight, ArrowRight, AudioLines, BookOpen, Box, Check, CheckCheck, ChevronRight, ClipboardList, FileText, FlaskConical, Layers, Menu, MessageCircle, Pause, Play, RotateCcw, ScanLine, ShieldCheck, Sparkles, TriangleAlert, Wrench, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ContinuousTabs } from '@/components/watermelon/continuous-tabs'
import { scenarios, steps, useCases } from '@/data/site'
import { WorkflowTransformation } from '@/components/WorkflowTransformation'

function Logo({ small = false }: { small?: boolean }) {
  return <span className={`brand ${small ? 'brand-small' : ''}`}><svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="m20 4 14 8v16l-14 8-14-8V12ZM6 12l14 8 14-8M20 20v16M20 4v16M6 28l14-8 14 8" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>Lattice<span className="brand-dot">.</span></span>
}
function LatticeArt({ compact = false }: { compact?: boolean }) {
  const points = Array.from({ length: 56 }, (_, i) => ({ x: 40 + i % 8 * 83 + (Math.floor(i / 8) % 2) * 41, y: 30 + Math.floor(i / 8) * 71 }))
  return <svg className={`lattice-art ${compact ? 'compact' : ''}`} viewBox="0 0 720 500" fill="none" aria-hidden="true">
    <defs><radialGradient id={compact ? 'glow-small' : 'glow'}><stop stopColor="#5245f8" stopOpacity=".3" /><stop offset="1" stopColor="#5245f8" stopOpacity="0" /></radialGradient></defs>
    <ellipse cx="380" cy="240" rx="300" ry="230" fill={`url(#${compact ? 'glow-small' : 'glow'})`} />
    {points.map((p, i) => <g key={i}>{[i + 1, i + 8, i + (Math.floor(i / 8) % 2 ? 9 : 7)].map(n => points[n] && Math.abs(points[n].x - p.x) < 110 ? <path key={n} d={`M${p.x} ${p.y}L${points[n].x} ${points[n].y}`} stroke="currentColor" strokeOpacity={0.12 + ((i * 7) % 5) * .025} /> : null)}<circle cx={p.x} cy={p.y} r={i % 9 === 0 ? 3 : 1.6} fill="currentColor" opacity={i % 9 === 0 ? .8 : .3} /></g>)}
  </svg>
}
function SectionIntro({ label, title, children }: { label: string; title: ReactNode; children?: ReactNode }) {
  return <div className="section-intro"><div className="eyebrow">{label}</div><h2>{title}</h2>{children && <p>{children}</p>}</div>
}
function VoicePreview() {
  const [active, setActive] = useState('guide')
  const [paused, setPaused] = useState(false)
  const [replay, setReplay] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const visible = useInView(ref)
  const reduced = useReducedMotion()
  const playing = !paused && visible && !reduced
  const current = scenarios.find(s => s.id === active)!
  return <div className="voice-wrap" ref={ref}>
    <div className="preview-orbit orbit-one" /><div className="preview-orbit orbit-two" />
    <div className="voice-card">
      <div className="preview-top"><span className="preview-brand"><AudioLines size={17} /> LATTICE VOICE</span></div>
      <Tabs.Root value={active} onValueChange={setActive}>
        <ContinuousTabs value={active} items={scenarios} />
        {scenarios.map(s => <Tabs.Content value={s.id} key={s.id} className="conversation-panel">
          <div className="procedure-ref"><FileText size={13} /> {s.reference}<ChevronRight size={13} /></div>
          <div className="wave-stage"><span className="wave-halo" /><div className="waveform" aria-hidden="true">
            {Array.from({ length: 49 }, (_, i) => {
              const height = 8 + Math.pow(Math.sin(i * .71), 2) * (1 - Math.abs(i - 24) / 28) * 79
              return <motion.span key={`${i}-${replay}`} style={{ height }} animate={{ scaleY: playing ? [0.4, 1, .55, .85, .4] : .5, opacity: playing ? [.45, 1, .65] : .65 }} transition={{ duration: 1.7 + i % 5 * .15, repeat: playing ? Infinity : 0, delay: i * .025 }} />
            })}
          </div><span className="wave-caption">{playing ? 'A conversation that keeps work moving' : reduced ? 'Voice preview · motion reduced' : 'Voice preview paused'}</span></div>
          <AnimatePresence mode="wait"><motion.div key={`${active}-${replay}`} initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="messages">
            <div className="message user-message"><span className="speaker">YOU</span><p>“{s.question}”</p></div>
            <div className="message ai-message"><span className="assistant-icon"><Sparkles size={15} /></span><div><span className="speaker">Voice response</span><p>{s.answer}</p></div></div>
            <div className={`record ${active === 'verify' ? 'warning' : ''}`}>{active === 'verify' ? <TriangleAlert size={16} /> : <CheckCheck size={16} />}<div><strong>{s.record}</strong><span>{s.detail}</span></div></div>
          </motion.div></AnimatePresence>
        </Tabs.Content>)}
      </Tabs.Root>
      <div className="preview-bottom"><span><span className={`status-dot ${active === 'verify' ? 'amber' : ''}`} />{current.id === 'verify' ? <TriangleAlert size={12} aria-hidden="true" /> : <Check size={12} aria-hidden="true" />}{current.status}</span><div><Button aria-label={paused ? 'Play preview animation' : 'Pause preview animation'} onClick={() => setPaused(!paused)}>{paused ? <Play size={14} /> : <Pause size={14} />}</Button><Button aria-label="Replay preview" onClick={() => { setReplay(v => v + 1); setPaused(false) }}><RotateCcw size={14} /></Button></div></div>
    </div>
    
  </div>
}

function App() {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    function close(event: KeyboardEvent) { if (event.key === 'Escape' && menuOpen) { setMenuOpen(false); menuButton.current?.focus() } }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [menuOpen])
  const nav = <><a href="#product" onClick={() => setMenuOpen(false)}>Product</a><a href="#use-cases" onClick={() => setMenuOpen(false)}>Use Cases</a><a href="#how-it-works" onClick={() => setMenuOpen(false)}>How It Works</a></>
  const icons = { flask: FlaskConical, layers: Layers, scan: ScanLine, box: Box, wrench: Wrench }
  return <MotionConfig reducedMotion="user" transition={{ duration: .45, ease: [.22, 1, .36, 1] }}>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header"><div className="nav-shell"><a href="#" className="logo-link" aria-label="Lattice home"><Logo /></a><nav className="desktop-nav" aria-label="Main navigation">{nav}</nav><Button className="mobile-toggle" ref={menuButton} aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} aria-controls="mobile-nav" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</Button></div>{menuOpen && <nav id="mobile-nav" className="mobile-nav" aria-label="Mobile navigation">{nav}</nav>}</header>
    <main id="main">
      <section className="hero section-shell">
        <LatticeArt />
        <div className="hero-copy"><div className="eyebrow hero-eyebrow"><span className="eyebrow-line" /> THE VOICE COPILOT FOR THE PHYSICAL WORLD</div>
          <h1>Your hands<br />are busy.<br /><span>Your workflow<br />shouldn’t stop.</span></h1>
          <div className="hero-footnote"><AudioLines size={30} aria-hidden="true" /><span>Less switching context.<br /><strong>More staying in flow.</strong></span></div>
          <a className="hero-build-link" href="/workflows">Build Your Workflow<ArrowRight size={16} aria-hidden="true" /></a>
        </div>
        <VoicePreview />
        <div className="hero-baseline"><span>MADE FOR THE WORK THAT HAPPENS AWAY FROM A SCREEN.</span><a href="#problem" aria-label="Explore the problem"><ArrowDown size={17} /></a></div>
      </section>
      <WorkflowTransformation />
      <section className="capabilities section-shell" id="product">
        <div className="split-intro"><SectionIntro label="YOUR WORK, UNINTERRUPTED" title={<>A little guidance.<br /><span>A lot more flow.</span></>} /><p>From the first question to the final record,<br />a copilot that meets you where you work.</p></div>
        <div className="capability-grid">
          <article className="capability"><div className="capability-top"><BookOpen size={22} /><span>01 / GUIDE</span></div><div className="capability-visual guide-visual"><div className="mini-document"><span /><span /><span /><div><span /><Check size={13} /></div><span /></div><div className="mini-question"><MessageCircle size={13} /> “What’s the next step?”</div></div><h3>The right instruction.<br />Right when you need it.</h3><p>Ask contextual questions about approved SOPs and technical manuals. Keep the procedure close and your hands free.</p><span className="card-bottom">KNOW WHAT COMES NEXT <ArrowDownRight size={18} /></span></article>
          <article className="capability"><div className="capability-top"><AudioLines size={22} /><span>02 / CAPTURE</span></div><div className="capability-visual capture-visual"><div className="mini-wave">{Array.from({ length: 27 }, (_, i) => <span key={i} style={{ height: 7 + Math.abs(Math.sin(i * .87)) * (i > 4 && i < 22 ? 45 : 13) }} />)}</div><div className="mini-measure"><span>SAMPLE MASS</span><strong>2.04 <small>g</small></strong><Check size={15} /></div></div><h3>Say it naturally.<br />Capture it clearly.</h3><p>Record observations, measurements and work progress through speech. Get spoken confirmation when progress is recorded.</p><span className="card-bottom">LET YOUR VOICE DO THE PAPERWORK <ArrowDownRight size={18} /></span></article>
          <article className="capability"><div className="capability-top"><ShieldCheck size={22} /><span>03 / VERIFY</span></div><div className="capability-visual verify-visual"><div className="tolerance-label"><span>EXAMPLE CONFIGURED RANGE</span><span>mm</span></div><div className="tolerance-track"><span className="tolerance-range" /><span className="tolerance-marker" /></div><div className="tolerance-values"><span>9.95</span><span>10.05</span></div><div className="deviation-note"><TriangleAlert size={13} /> 10.08 mm · Flagged for review</div></div><h3>Notice the detail.<br />Keep the full picture.</h3><p>Identify potential deviations from configured specifications and prepare structured records for human review.</p><span className="card-bottom">MAKE REVIEW MORE INFORMED <ArrowDownRight size={18} /></span></article>
        </div>
      </section>
      <section className="use-cases section-shell" id="use-cases">
        <SectionIntro label="OUT IN THE PHYSICAL WORLD" title={<>Different workspaces.<br /><span>The same solution.</span></>} />
        <div className="bento-grid">{useCases.map((item) => { const Icon = icons[item.icon]; return <article key={item.title} className="use-card"><div className="use-art" aria-hidden="true"><Icon strokeWidth={.65} /></div><div className="use-content"><Icon size={20} /><h3>{item.title}</h3><strong>{item.subtitle}</strong><p>{item.description}</p></div></article> })}</div>
      </section>
      <section className="how section-shell" id="how-it-works"><div className="split-intro"><SectionIntro label="FROM PROCEDURE TO RECORD" title={<>Your procedure.<br /><span>Now part of the conversation.</span></>} /><span className="how-note" aria-hidden="true"><FileText size={18} /><ArrowRight size={17} /><AudioLines size={22} /><ArrowRight size={17} /><ClipboardList size={18} /></span></div><div className="steps">{steps.map(([title, description], i) => <motion.article key={title} initial={{ opacity: .45 }} whileInView={{ opacity: 1 }} viewport={{ once: true, amount: .5 }}><div className="step-number"><span>0{i + 1}</span><ArrowRight size={16} /></div><h3>{title}</h3><p>{description}</p></motion.article>)}</div></section>
    </main>
    <footer className="site-footer section-shell"><Logo small /><span>Built around the way you work.</span><nav aria-label="Footer navigation">{nav}</nav></footer>
  </MotionConfig>
}
export default App














