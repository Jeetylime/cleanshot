import { ContactBlock, Section, List } from './blocks';

/** What Studiolo does for accessibility, its known limits, and how to report problems. Makes no conformance claim. */
export function Accessibility() {
  return (
    <>
      <Section id="commitment" title="Our approach">
        <p>We want Studiolo to be usable by as many people as possible, including people who use assistive technology, a keyboard instead of a mouse, or larger text.</p>
        <p>
          Studiolo has not been formally audited against an accessibility standard such as the Web Content Accessibility Guidelines (WCAG), so we don’t claim
          conformance with any level. This page describes what we have built, where we know it falls short, and how to tell us about problems.
        </p>
      </Section>

      <Section id="features" title="Accessibility features">
        <p>From the settings menu (the gear icon at the top right) you can:</p>
        <List>
          <li>Make interface text larger (Large or Larger).</li>
          <li>Increase contrast.</li>
          <li>Reduce motion. Animations are also reduced automatically when your device asks for reduced motion.</li>
          <li>Underline links.</li>
          <li>Choose a dark, light or system color theme.</li>
        </List>
        <p>Studiolo also:</p>
        <List>
          <li>Shows a visible focus outline when you move through controls with the keyboard.</li>
          <li>Has keyboard shortcuts for the editors (press ? in Edit or Canvas to see them) and a searchable command menu (⌘K or Ctrl+K) for every section and tool.</li>
          <li>Lets you open files by browsing, pasting or dragging and dropping.</li>
        </List>
      </Section>

      <Section id="limitations" title="Known limitations">
        <List>
          <li>
            Edit and Canvas are visual editors. Placing, moving and resizing annotations and design elements is mainly done with a mouse, trackpad or touch, and their
            contents are drawn on a canvas that screen readers can’t fully describe.
          </li>
          <li>Some tool previews, such as the before-and-after comparison sliders, are visual and have limited descriptions for screen readers.</li>
          <li>Images you create don’t get alternative text automatically. Add a description wherever you publish them.</li>
        </List>
      </Section>

      <Section id="feedback" title="Feedback and help">
        <p>
          If something in Studiolo is hard or impossible for you to use, please tell us. Include what you were trying to do, the browser and any assistive technology
          you use, and we will try to fix it or help you find another way.
        </p>
        <ContactBlock />
      </Section>
    </>
  );
}
