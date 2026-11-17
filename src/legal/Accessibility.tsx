import { ContactBlock, List, Section, Strong } from './blocks';

/** Date of the accessibility evaluation described below. Update it after each re-test. */
const EVALUATED = 'November 17, 2026';

/** Accessibility conformance statement: status, how it was evaluated, features, known gaps and feedback. */
export function Accessibility() {
  return (
    <>
      <Section id="status" title="Conformance status">
        <p>
          The Web Content Accessibility Guidelines (WCAG) are the international standard for making websites usable by people with disabilities. They have three
          levels: A, AA and AAA. Level AA is the one most laws and organizations ask for.
        </p>
        <p>
          <Strong>Studiolo partially conforms with WCAG 2.2 level AA.</Strong> “Partially conforms” means most of the site meets the standard, but some parts don’t yet.
          They are listed under “Known limitations” below.
        </p>
        <p>This is our own assessment. Studiolo has not been audited by an independent accessibility organization, and no official WCAG certification exists.</p>
      </Section>

      <Section id="evaluation" title="How we evaluated it">
        <p>Last evaluated {EVALUATED}, in Chromium, on every page and tool, in both the dark and light themes:</p>
        <List>
          <li>Automated testing with axe-core against the WCAG 2.0, 2.1 and 2.2 level A and AA rules. Every issue it found was fixed.</li>
          <li>Keyboard-only testing of navigation, menus, dialogs and the Edit and Canvas editors, including a visible focus indicator on every control.</li>
          <li>Layout at 320 pixels wide (equivalent to 400% zoom), with no sideways scrolling on any page.</li>
          <li>Color contrast of text and controls checked against the 4.5:1 and 3:1 minimums.</li>
        </List>
        <p>We have not yet tested with screen readers such as VoiceOver, NVDA or JAWS, or with speech-recognition software.</p>
      </Section>

      <Section id="features" title="Accessibility features">
        <p>From the settings menu (the gear icon at the top right) you can:</p>
        <List>
          <li>Make interface text larger (Large or Larger).</li>
          <li>Increase contrast.</li>
          <li>Reduce motion. Animations are also reduced automatically when your device asks for reduced motion.</li>
          <li>Underline all links.</li>
          <li>Choose a dark, light or system color theme.</li>
        </List>
        <p>Throughout Studiolo:</p>
        <List>
          <li>A “Skip to main content” link is the first thing you reach with the Tab key.</li>
          <li>Every page has its own title, and every control has a visible focus outline.</li>
          <li>⌘K (Ctrl+K on Windows and Linux) opens a searchable menu of every section, tool and setting.</li>
          <li>Files can be opened by browsing, pasting or dragging and dropping.</li>
        </List>
        <p>In Edit, without a mouse:</p>
        <List>
          <li>Choose a tool with its letter key (for example R for rectangle or B for blur), then press Enter to add it in the middle of the image.</li>
          <li>Arrow keys move the selection; hold Shift to move 10 times further.</li>
          <li>Alt (Option on a Mac) plus the arrow keys resizes the selection.</li>
          <li>Press ? to see every keyboard shortcut.</li>
        </List>
        <p>In Canvas, elements are added with buttons, moved with the arrow keys, and positioned, sized and rotated precisely with the number fields in the side panel.</p>
      </Section>

      <Section id="limitations" title="Known limitations">
        <List>
          <li>
            <Strong>Canvas content isn’t described to screen readers.</Strong> The image and design you are editing are drawn on a canvas, so a screen reader can read the
            controls around it but not what is in the picture. Canvas’s Layers panel lists the elements by name.
          </li>
          <li>
            <Strong>Some edits still need a pointer.</Strong> Cropping an image inside a Canvas frame and the Background Remover’s Erase and Restore brushes are done by
            dragging. Freehand drawing and drawn signatures are exempt because the path itself is the content, and Sign PDF also lets you type a signature instead.
          </li>
          <li>
            <Strong>Before-and-after comparison sliders</Strong> can be moved with the arrow keys, but what they compare is visual. The file sizes and results are also
            shown as text.
          </li>
          <li>
            <Strong>Images you create don’t get alternative text automatically.</Strong> Add a description wherever you publish them.
          </li>
        </List>
        <p>We’re working on these. If one of them blocks you, contact us and we’ll help you find another way.</p>
      </Section>

      <Section id="feedback" title="Feedback and help">
        <p>
          If something in Studiolo is hard or impossible for you to use, please tell us. Include what you were trying to do, your browser and any assistive technology you
          use.
        </p>
        <ContactBlock />
      </Section>
    </>
  );
}
