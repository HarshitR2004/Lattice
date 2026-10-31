export const scenarios = [
  { id: 'guide', label: 'Guide', reference: 'SOP-024 · Sample preparation', question: 'What comes after weighing the sample?', answer: 'Add 20 mL of the specified solvent, then mix for 60 seconds.', record: 'Step 03 · Solvent addition', detail: 'Referenced from example SOP · §4.3', status: 'Guidance provided' },
  { id: 'capture', label: 'Capture', reference: 'SOP-024 · Sample preparation', question: 'Record the sample mass as 2.04 grams.', answer: 'Recorded: sample mass, 2.04 g. Your observation is ready for review.', record: 'Sample mass', detail: '2.04 g · Spoken observation', status: 'Measurement recorded' },
  { id: 'verify', label: 'Verify', reference: 'WI-012 · Dimensional inspection', question: 'The measured diameter is 10.08 millimeters.', answer: 'That is above the example configured limit of 10.05 mm. I’ve flagged it for your review.', record: 'Potential deviation', detail: '10.08 mm · Example range: 9.95–10.05 mm', status: 'Deviation flagged for review' },
] as const
export const useCases = [
  { title: 'Research', subtitle: 'Stay with the discovery.', description: 'Consult the next preparation step and capture observations without leaving the bench.', icon: 'flask' },
  { title: 'Testing', subtitle: 'Every measurement matters.', description: 'Capture specimen measurements and connect them to the procedure as you test.', icon: 'layers' },
  { title: 'Manufacturing', subtitle: 'Keep your hands on the work.', description: 'Follow work instructions and document progress, one spoken step at a time.', icon: 'box' },
  { title: 'Inspection', subtitle: 'A second check. In the moment.', description: 'Compare spoken measurements against configured limits and flag potential deviations.', icon: 'scan' },
  { title: 'Maintainence', subtitle: 'Less back and forth.', description: 'Ask about the maintenance sequence and record findings right beside the equipment.', icon: 'wrench' },
] as const
export const steps = [
  ['Bring your procedure', 'Add an approved SOP or work instruction as the reference for your session.'],
  ['Start a conversation', 'Begin a voice-guided work session, with the procedure in context.'],
  ['Work. Speak. Continue.', 'Ask questions and record observations naturally as you go.'],
  ['Review the record', 'Review structured observations, progress and potential deviations.'],
] as const



