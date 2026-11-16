import { ContactBlock, DocLink, GoverningLaw, List, MinimumAge, Section, Strong } from './blocks';

export function TermsOfService() {
  return (
    <>
      <Section id="acceptance" title="1. Accepting these terms">
        <p>
          These Terms of Service are an agreement between you and the operator of CleanShot (cleanshot.space), referred to as “CleanShot”, “we” or “us”. By using CleanShot you agree to these
          terms, the <DocLink doc="acceptable-use">Acceptable Use Policy</DocLink> and the <DocLink doc="privacy-policy">Privacy Policy</DocLink>. If you don’t agree,
          please don’t use CleanShot.
        </p>
        <p>
          You must be at least <MinimumAge /> years old to use CleanShot. If you use it on behalf of an organization, you confirm that you are allowed to accept these
          terms for that organization.
        </p>
      </Section>

      <Section id="service" title="2. What CleanShot is">
        <p>CleanShot is a free, browser-based set of tools for working with images and PDFs. It currently includes:</p>
        <List>
          <li>
            <Strong>Screenshot Editor</Strong>: annotate, redact, crop, frame and export screenshots.
          </li>
          <li>
            <Strong>Image Tools</Strong>: background removal, upscaling, resizing, cropping, compression, format conversion, metadata viewing and removal, and color
            picking.
          </li>
          <li>
            <Strong>PDF Tools</Strong>: merge, split, organize, sign, compress, convert images to PDF and PDFs to images.
          </li>
        </List>
        <p>
          The tools are designed to process files on your device, in your browser. The Background Remover and Image Upscaler use machine-learning models that are
          downloaded to your browser when you first use them. CleanShot doesn’t require an account.
        </p>
      </Section>

      <Section id="your-content" title="3. Your content and your responsibility">
        <p>
          You are responsible for the files you open, import, edit, create and download with CleanShot (“your content”), and for how you use and share them. Make sure
          you have the rights and any permissions needed for your content, and that your use follows the law and the{' '}
          <DocLink doc="acceptable-use">Acceptable Use Policy</DocLink>.
        </p>
        <p>
          Check your results before relying on them. Automated tools can make mistakes: the Background Remover can miss or cut parts of a subject, the Image Upscaler
          estimates detail that wasn’t in the original, and compression can reduce quality. Check that redactions cover everything you meant to hide, and keep your own
          copies of important files, since CleanShot is not a backup service and data stored in your browser can be lost.
        </p>
      </Section>

      <Section id="ownership" title="4. Ownership">
        <p>
          <Strong>You keep ownership of your content.</Strong> We don’t claim any rights to the files you work on or the results you create.
        </p>
        <p>
          Because CleanShot processes files on your device, it doesn’t normally need any rights to your content. To the extent the service has to technically handle
          your content to work, for example holding it in browser memory or saving a recent session in your browser’s storage, you allow it to do so only for the
          purpose of providing the features you use. This permission ends when you delete the content or stop using CleanShot.
        </p>
        <p>
          CleanShot itself, including its software, design, name and logo, belongs to its operator or its licensors. These terms don’t give you any rights to them
          beyond using the service as intended. Open-source components and third-party models remain under their own licenses.
        </p>
      </Section>

      <Section id="third-party" title="5. Third-party services and models">
        <p>CleanShot relies on third parties, including:</p>
        <List>
          <li>
            <Strong>Cloudflare</Strong>, which hosts and delivers the website
          </li>
          <li>
            <Strong>Hugging Face</Strong>, which hosts the model files downloaded by the Background Remover and Image Upscaler
          </li>
          <li>
            <Strong>Model authors</Strong>, including BRIA AI (RMBG-1.4, used by the Background Remover) and the authors of Swin2SR (used by the Image Upscaler)
          </li>
          <li>
            <Strong>Open-source libraries</Strong> that the app is built with
          </li>
        </List>
        <p>
          These services and models are provided under their own terms and licenses, which we don’t control. Some models carry restrictions. In particular, the
          Background Remover’s model is licensed for non-commercial use only, and commercial use requires a separate agreement with its author. See the AI models section of the{' '}
          <DocLink doc="privacy-policy">Privacy Policy</DocLink> for details. We aren’t responsible for third-party services, and their availability may affect
          CleanShot.
        </p>
      </Section>

      <Section id="availability" title="6. Availability and changes">
        <p>
          CleanShot is provided free of charge. We may update, change, add or remove features, change system requirements, or perform maintenance at any time, and we
          may suspend or discontinue the service entirely. CleanShot may be interrupted or unavailable at times, including because of our infrastructure or third-party
          services. We’ll try to keep it running well, but we don’t promise any particular level of availability.
        </p>
      </Section>

      <Section id="warranties" title="7. Disclaimer of warranties">
        <p>
          CleanShot is provided <Strong>“as is” and “as available”</Strong>. To the fullest extent permitted by law, we make no warranties of any kind, express or
          implied, including warranties of merchantability, fitness for a particular purpose, accuracy and non-infringement. We don’t guarantee that CleanShot will be
          error-free, secure or uninterrupted, or that its results will be accurate or meet your needs.
        </p>
        <p>Some places don’t allow certain warranties to be excluded, so some of these exclusions may not apply to you.</p>
      </Section>

      <Section id="liability" title="8. Limitation of liability">
        <p>
          To the fullest extent permitted by applicable law, CleanShot and its operator will not be liable for any indirect, incidental, special, consequential or punitive damages,
          or for any loss of data, files, profits, revenue or goodwill, arising from or related to your use of, or inability to use, CleanShot, even if advised of the
          possibility of such damages.
        </p>
        <p>
          Because CleanShot is provided free of charge, to the fullest extent permitted by law our total liability for any claim relating to CleanShot is limited to
          the amount you paid us to use it, which is zero.
        </p>
        <p>
          Nothing in these terms limits liability that cannot be limited by law, such as liability for fraud, or for death or personal injury caused by negligence
          where that applies, and nothing affects rights you have as a consumer that cannot be waived.
        </p>
      </Section>

      <Section id="termination" title="9. Suspension and termination">
        <p>
          You can stop using CleanShot at any time. Where legally permitted, we may restrict, suspend or end your access, without notice, if we reasonably believe you
          have broken these terms or the <DocLink doc="acceptable-use">Acceptable Use Policy</DocLink>, or if needed to protect the service, other users or the
          public. Sections that by their nature should continue after access ends, including ownership, disclaimers and limitation of liability, will continue.
        </p>
      </Section>

      <Section id="changes" title="10. Changes to these terms">
        <p>
          We may update these terms from time to time. When we do, we’ll update this page and the “Last updated” date, and for significant changes we’ll also post a
          notice on the site before they take effect. If you keep using CleanShot after changes take effect, you accept the updated terms.
        </p>
      </Section>

      <Section id="law" title="11. Governing law">
        <p>
          These terms are governed by the laws of <GoverningLaw />, without regard to conflict-of-law rules. Any dispute will be handled by the courts of that
          jurisdiction, unless the law where you live gives you the right to bring a claim in your local courts or under your local law.
        </p>
      </Section>

      <Section id="general" title="12. General">
        <p>
          If any part of these terms is found unenforceable, the rest stays in effect. If we don’t enforce a provision, that doesn’t mean we waive it. These terms,
          together with the Acceptable Use Policy and Privacy Policy, are the whole agreement between you and us about CleanShot.
        </p>
      </Section>

      <Section id="contact" title="13. Contact">
        <p>Questions about these terms can be sent to:</p>
        <ContactBlock />
      </Section>
    </>
  );
}
