import { ContactBlock, DocLink, GoverningLaw, List, MinimumAge, Section, Strong } from './blocks';

export function TermsOfService() {
  return (
    <>
      <Section id="acceptance" title="1. Accepting these terms">
        <p>
          These Terms of Service are an agreement between you and the operator of Studiolo (studiolo.page), referred to as “Studiolo”, “we” or “us”. By using Studiolo you agree to these
          terms (including the acceptable use rules in section 4) and the <DocLink doc="privacy-policy">Privacy Policy</DocLink>. If you don’t agree,
          please don’t use Studiolo.
        </p>
        <p>
          You must be at least <MinimumAge /> years old to use Studiolo. If you use it on behalf of an organization, you confirm that you are allowed to accept these
          terms for that organization.
        </p>
      </Section>

      <Section id="service" title="2. What Studiolo is">
        <p>Studiolo is a free, browser-based set of tools for working with images and PDFs. It currently includes:</p>
        <List>
          <li>
            <Strong>Edit</Strong>: annotate, redact, crop and frame images and screenshots.
          </li>
          <li>
            <Strong>Canvas</Strong>: design graphics from scratch or from templates.
          </li>
          <li>
            <Strong>Image Tools</Strong>: for example background removal, upscaling, resizing, cropping, compression, format conversion, watermarks and metadata
            removal.
          </li>
          <li>
            <Strong>PDF Tools</Strong>: for example merging, splitting, organizing, signing, filling forms, compressing and converting PDFs.
          </li>
        </List>
        <p>
          The tools are designed to process files on your device, in your browser. The Background Remover and Image Upscaler use machine-learning models that are
          downloaded to your browser when you first use them. Studiolo doesn’t require an account.
        </p>
      </Section>

      <Section id="your-content" title="3. Your content and your responsibility">
        <p>
          You are responsible for the files you open, import, edit, create and download with Studiolo (“your content”), and for how you use and share them. Make sure
          you have the rights and any permissions needed for your content, and that your use follows the law and section 4.
        </p>
        <p>
          Check your results before relying on them. Automated tools can make mistakes: the Background Remover can miss or cut parts of a subject, the Image Upscaler
          estimates detail that wasn’t in the original, and compression can reduce quality. Check that redactions cover everything you meant to hide, and keep your own
          copies of important files, since Studiolo is not a backup service and data stored in your browser can be lost.
        </p>
      </Section>

      <Section id="acceptable-use" title="4. Acceptable use">
        <p>
          Studiolo processes files on your device, so we don’t see what you create. You are responsible for making sure your use, and anything you make, follows these
          rules and the law. They also apply to anyone using Studiolo on your behalf.
        </p>
        <p className="font-medium text-fg">Prohibited content.</p>
        <p>Don’t use Studiolo to create, edit, alter or distribute content, or to take part in activity, that:</p>
        <List>
          <li>
            <span className="font-medium text-fg">Is illegal.</span> This includes unlawful content and any activity that breaks applicable laws or regulations.
          </li>
          <li>
            <span className="font-medium text-fg">Infringes other people’s rights.</span> This includes copyright, trademark, privacy, publicity and other intellectual
            property rights, for example removing watermarks or credits from work you don’t have the right to change, or passing off someone else’s work as your own.
          </li>
          <li>
            <span className="font-medium text-fg">Is non-consensual intimate imagery.</span> Never create, alter or share sexual or intimate images of a real person
            without their consent, including edited or manipulated images.
          </li>
          <li>
            <span className="font-medium text-fg">Sexually exploits or endangers minors.</span> Child sexual abuse material and any content that sexualizes, exploits or
            endangers minors are strictly prohibited. Where required or appropriate, we will report it to the relevant authorities.
          </li>
          <li>
            <span className="font-medium text-fg">Harasses, threatens or impersonates.</span> This includes bullying, threats, doxxing (for example un-redacting or
            exposing private information), and pretending to be another person or organization.
          </li>
          <li>
            <span className="font-medium text-fg">Is fraudulent or deceptive.</span> This includes forged or altered documents, signatures, receipts, IDs or evidence,
            and manipulated images used to mislead, scam or defraud people.
          </li>
        </List>
        <p className="font-medium text-fg">Misuse of the service.</p>
        <p>Don’t:</p>
        <List>
          <li>try to exploit, disrupt, overload or damage Studiolo or the infrastructure that delivers it</li>
          <li>probe, scan or test for vulnerabilities without our permission, or bypass any security or access measure</li>
          <li>reverse engineer, decompile or extract parts of the service, except where the law allows this despite this restriction, or where a license for that part allows it</li>
          <li>use bots, scrapers or other automated means to access the site in a way that harms its availability or performance</li>
          <li>make excessive requests, for example repeatedly downloading the site’s files or models through it, in a way that degrades the service for others</li>
          <li>use Studiolo to spread malware or other harmful code</li>
        </List>
        <p>
          Found a security issue? Please tell us (see section 14) instead of testing it in a way that could affect others.
        </p>
        <p>
          If we reasonably believe these rules have been broken, we may act as described in section 10, and we may report illegal activity to the appropriate
          authorities and cooperate with lawful requests. To report misuse, contact us using the details in section 14.
        </p>
      </Section>

      <Section id="ownership" title="5. Ownership">
        <p>
          <Strong>You keep ownership of your content.</Strong> We don’t claim any rights to the files you work on or the results you create.
        </p>
        <p>
          Because Studiolo processes files on your device, it doesn’t normally need any rights to your content. To the extent the service has to technically handle
          your content to work, for example holding it in browser memory or saving a recent session in your browser’s storage, you allow it to do so only for the
          purpose of providing the features you use. This permission ends when you delete the content or stop using Studiolo.
        </p>
        <p>
          Studiolo itself, including its software, design, name and logo, belongs to its operator or its licensors. These terms don’t give you any rights to them
          beyond using the service as intended. Open-source components and third-party models remain under their own licenses.
        </p>
      </Section>

      <Section id="third-party" title="6. Third-party services and models">
        <p>Studiolo relies on third parties, including:</p>
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
          Studiolo.
        </p>
      </Section>

      <Section id="availability" title="7. Availability and changes">
        <p>
          Studiolo is provided free of charge. We may update, change, add or remove features, change system requirements, or perform maintenance at any time, and we
          may suspend or discontinue the service entirely. Studiolo may be interrupted or unavailable at times, including because of our infrastructure or third-party
          services. We’ll try to keep it running well, but we don’t promise any particular level of availability.
        </p>
      </Section>

      <Section id="warranties" title="8. Disclaimer of warranties">
        <p>
          Studiolo is provided <Strong>“as is” and “as available”</Strong>. To the fullest extent permitted by law, we make no warranties of any kind, express or
          implied, including warranties of merchantability, fitness for a particular purpose, accuracy and non-infringement. We don’t guarantee that Studiolo will be
          error-free, secure or uninterrupted, or that its results will be accurate or meet your needs.
        </p>
        <p>Some places don’t allow certain warranties to be excluded, so some of these exclusions may not apply to you.</p>
      </Section>

      <Section id="liability" title="9. Limitation of liability">
        <p>
          To the fullest extent permitted by applicable law, Studiolo and its operator will not be liable for any indirect, incidental, special, consequential or punitive damages,
          or for any loss of data, files, profits, revenue or goodwill, arising from or related to your use of, or inability to use, Studiolo, even if advised of the
          possibility of such damages.
        </p>
        <p>
          Because Studiolo is provided free of charge, to the fullest extent permitted by law our total liability for any claim relating to Studiolo is limited to
          the amount you paid us to use it, which is zero.
        </p>
        <p>
          Nothing in these terms limits liability that cannot be limited by law, such as liability for fraud, or for death or personal injury caused by negligence
          where that applies, and nothing affects rights you have as a consumer that cannot be waived.
        </p>
      </Section>

      <Section id="termination" title="10. Suspension and termination">
        <p>
          You can stop using Studiolo at any time. Where legally permitted, we may restrict, suspend or end your access, without notice, if we reasonably believe you
          have broken these terms, including section 4, or if needed to protect the service, other users or the
          public. Sections that by their nature should continue after access ends, including ownership, disclaimers and limitation of liability, will continue.
        </p>
      </Section>

      <Section id="changes" title="11. Changes to these terms">
        <p>
          We may update these terms from time to time. When we do, we’ll update this page and the “Last updated” date, and for significant changes we’ll also post a
          notice on the site before they take effect. If you keep using Studiolo after changes take effect, you accept the updated terms.
        </p>
      </Section>

      <Section id="law" title="12. Governing law">
        <p>
          These terms are governed by the laws of <GoverningLaw />, without regard to conflict-of-law rules. Any dispute will be handled by the courts of that
          jurisdiction, unless the law where you live gives you the right to bring a claim in your local courts or under your local law.
        </p>
      </Section>

      <Section id="general" title="13. General">
        <p>
          If any part of these terms is found unenforceable, the rest stays in effect. If we don’t enforce a provision, that doesn’t mean we waive it. These terms,
          together with the Privacy Policy, are the whole agreement between you and us about Studiolo.
        </p>
      </Section>

      <Section id="contact" title="14. Contact">
        <p>Questions about these terms can be sent to:</p>
        <ContactBlock />
      </Section>
    </>
  );
}
