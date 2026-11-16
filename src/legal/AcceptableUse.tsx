import { ContactBlock, DocLink, List, Section } from './blocks';

export function AcceptableUse() {
  return (
    <>
      <Section id="purpose" title="Why this policy exists">
        <p>
          CleanShot is a free set of image and PDF tools. This policy explains what you may not use it for. It is part of the{' '}
          <DocLink doc="terms">Terms of Service</DocLink>, so by using CleanShot you agree to it.
        </p>
        <p>
          CleanShot processes files on your device, so we don’t see what you create. You are responsible for making sure your use, and anything you make, follows this
          policy and the law.
        </p>
      </Section>

      <Section id="prohibited-content" title="Prohibited uses and content">
        <p>Don’t use CleanShot to create, edit, alter or distribute content, or to take part in activity, that:</p>
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
      </Section>

      <Section id="service-abuse" title="Misuse of the service">
        <p>Don’t:</p>
        <List>
          <li>try to exploit, disrupt, overload or damage CleanShot or the infrastructure that delivers it</li>
          <li>probe, scan or test for vulnerabilities without our permission, or bypass any security or access measure</li>
          <li>reverse engineer, decompile or extract parts of the service, except where the law allows this despite this restriction, or where a license for that part allows it</li>
          <li>use bots, scrapers or other automated means to access the site in a way that harms its availability or performance</li>
          <li>make excessive requests, for example repeatedly downloading the site’s files or models through it, in a way that degrades the service for others</li>
          <li>use CleanShot to spread malware or other harmful code</li>
        </List>
        <p>
          Found a security issue? Please tell us using the contact details below instead of testing it in a way that could affect others.
        </p>
      </Section>

      <Section id="third-party" title="Third-party models and licenses">
        <p>
          Some tools use models published by third parties under their own licenses. Your use of those tools must follow those licenses. For example, the Background
          Remover model is licensed for non-commercial use only. See the AI models section of the <DocLink doc="privacy-policy">Privacy Policy</DocLink> for each model’s license.
        </p>
      </Section>

      <Section id="enforcement" title="Enforcement">
        <p>
          If we reasonably believe you have broken this policy, we may, where legally permitted and without notice, restrict, suspend or block your access to
          CleanShot, for example by blocking network traffic. We may also report illegal activity to the appropriate authorities and cooperate with lawful requests.
        </p>
      </Section>

      <Section id="reporting" title="Reporting misuse">
        <p>To report a violation of this policy, contact:</p>
        <ContactBlock />
        <p>
          See also the <DocLink doc="terms">Terms of Service</DocLink> and <DocLink doc="privacy-policy">Privacy Policy</DocLink>.
        </p>
      </Section>
    </>
  );
}
