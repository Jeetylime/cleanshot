import { ContactBlock, DocLink, List, MinimumAge, Operator, Section, Strong } from './blocks';

/*
 * Every statement here was checked against the code and the live site's
 * response headers when it was written. If you add a feature that sends data
 * anywhere (analytics, uploads, error reporting, accounts, payments), update
 * this policy before shipping it.
 */
export function PrivacyPolicy() {
  return (
    <>
      <Section id="summary" title="The short version">
        <List>
          <li>
            CleanShot is built to process your images and PDFs <Strong>on your device, in your browser</Strong>. No CleanShot feature uploads your files to
            CleanShot or anyone else.
          </li>
          <li>Some data is stored in your browser so CleanShot can work, for example recent editor sessions and downloaded models. You can delete it at any time.</li>
          <li>
            Like any website, the infrastructure that delivers CleanShot (Cloudflare) receives technical information such as your IP address and browser details when
            your browser requests the site.
          </li>
          <li>CleanShot doesn’t use advertising, doesn’t sell personal information, and doesn’t set its own cookies.</li>
        </List>
      </Section>

      <Section id="who" title="Who this policy covers">
        <p>
          This policy describes how CleanShot (cleanshot.space), operated by <Operator />, handles information. In this policy “we” means the operator of CleanShot and
          “you” means anyone using the website.
        </p>
      </Section>

      <Section id="files" title="Your images and PDFs">
        <p>
          When you open, paste, drop or import a file, CleanShot reads it inside your browser tab. Editing, redaction, resizing, compression, conversion, metadata
          viewing, color picking, PDF tools, background removal and upscaling all run on your device using browser technologies such as Canvas and WebAssembly.
        </p>
        <p>
          CleanShot has no upload feature and no server-side processing, so we don’t receive, see or store the files you work on. If we ever add a feature that needs
          to send a file somewhere, that feature will say so clearly before anything is sent, and we will update this policy first.
        </p>
        <p>
          Files you export are saved where your browser puts downloads, or copied to your clipboard if you choose <Strong>Copy</Strong>. What happens to them after
          that is up to you.
        </p>
      </Section>

      <Section id="browser-storage" title="What CleanShot stores in your browser">
        <p>To work properly, CleanShot keeps some data on your device. It stays in your browser and isn’t sent to us.</p>
        <List>
          <li>
            <Strong>Recent editor sessions</Strong> (IndexedDB): up to 10 recent Screenshot Editor sessions, including the image, your edits and a thumbnail, so you can
            pick up where you left off. Older sessions are removed automatically.
          </li>
          <li>
            <Strong>Preferences</Strong> (local storage): settings such as theme, canvas backdrop, tool styles and export format.
          </li>
          <li>
            <Strong>Downloaded models</Strong> (Cache Storage): the Background Remover and Image Upscaler models, after you choose to download them, so they work offline
            later.
          </li>
          <li>
            <Strong>Normal browser caching</Strong>: your browser caches the site’s own files to load faster.
          </li>
          <li>
            <Strong>Temporary data</Strong>: while you work, files are held in your browser’s memory. Closing the tab releases it, though your browser or operating system
            may keep temporary files according to its own behavior.
          </li>
        </List>
        <p>
          You can clear recent sessions and downloaded models on the <DocLink doc="privacy">Privacy &amp; Models</DocLink> page, or remove everything by clearing this
          site’s data in your browser settings. Anyone with access to your browser profile may be able to see recent sessions, so clear them on shared computers.
        </p>
      </Section>

      <Section id="cookies" title="Cookies">
        <p>
          CleanShot doesn’t set its own cookies and doesn’t use cookies for advertising or tracking. Cloudflare, which delivers the site, may set strictly necessary
          security cookies in some situations, for example to tell people from automated traffic during an attack. See Cloudflare’s documentation for details on those
          cookies.
        </p>
      </Section>

      <Section id="infrastructure" title="Information handled by our infrastructure">
        <p>
          CleanShot is delivered by <Strong>Cloudflare</Strong>. When your browser requests the site, Cloudflare processes technical information needed to deliver it
          and keep it secure, which can include:
        </p>
        <List>
          <li>your IP address and approximate location derived from it</li>
          <li>browser and device details, such as the user agent</li>
          <li>request details, such as the page or file requested, the time, the referring page and the response</li>
          <li>security information, such as signals used to detect abuse or attacks</li>
        </List>
        <p>
          Your browser may also send Cloudflare network error reports (NEL), which describe failed connections to the site. These reports contain technical details
          about the request, not your files.
        </p>
        <p>
          Cloudflare handles this information under its own privacy policy and retains it according to its own practices and the settings of our account. We use it
          only to run, secure and troubleshoot CleanShot.
        </p>
      </Section>

      <Section id="analytics" title="Analytics">
        <p>
          CleanShot doesn’t include a third-party analytics script, advertising pixel or tracking library. We may view aggregate traffic statistics that Cloudflare
          provides from the requests it handles, such as numbers of visitors and requests, the pages requested, referring sites and approximate country. We use these to
          understand how CleanShot is used and to keep it running well. We don’t use them to identify individuals.
        </p>
      </Section>

      <Section id="models" title="Model downloads from Hugging Face">
        <p>
          The Background Remover and Image Upscaler need model files. When you confirm the download, your browser fetches them from <Strong>Hugging Face</Strong>{' '}
          (huggingface.co) and its content delivery providers. Like any website, Hugging Face receives your IP address and standard request details when it serves the
          files, and handles them under its own privacy policy. These requests download files only; they don’t contain your images.
        </p>
      </Section>

      <Section id="use-and-sharing" title="How information is used and shared">
        <p>
          We use the limited technical information described above only to deliver, secure, maintain and improve CleanShot, and to respond to you if you contact us. We
          don’t sell or rent personal information and don’t share it for advertising.
        </p>
        <p>Information may be shared or disclosed only:</p>
        <List>
          <li>with the service providers described above (Cloudflare and, for model downloads, Hugging Face), to provide the service</li>
          <li>if required by law, or to protect the rights, safety or security of users, the public or CleanShot</li>
          <li>as part of a transfer of CleanShot to a new operator, who would remain bound by this policy for information already collected</li>
        </List>
      </Section>

      <Section id="contact-data" title="If you contact us">
        <p>
          If you email us, we receive your email address and whatever you include in the message. We use it to reply and keep it only as long as needed to handle your
          request and any follow-up.
        </p>
      </Section>

      <Section id="retention" title="How long information is kept">
        <List>
          <li>Data stored in your browser stays until you delete it, your browser removes it, or (for editor sessions) newer sessions replace it.</li>
          <li>Technical information handled by Cloudflare and Hugging Face is kept according to their own policies and settings.</li>
          <li>Emails you send us are kept as long as needed to deal with your request.</li>
        </List>
      </Section>

      <Section id="rights" title="Your privacy rights">
        <p>
          Depending on where you live, you may have rights over your personal information, such as the right to access it, correct it, delete it, object to or restrict
          how it’s used, or receive a copy. Residents of some places, including the EU, UK and certain US states, have these rights by law. You may also have the
          right to complain to your local data protection authority.
        </p>
        <p>
          Because CleanShot processes files on your device and has no accounts, we usually hold little or no information that identifies you. You control the data in
          your browser directly and can delete it at any time. For anything else, contact us using the details below and we’ll respond within the time required by
          applicable law. We may need to verify your request.
        </p>
      </Section>

      <Section id="children" title="Children">
        <p>
          CleanShot isn’t directed at children under <MinimumAge />, and we don’t knowingly collect personal information from them. If you believe a child has sent us
          personal information, contact us and we’ll delete it.
        </p>
      </Section>

      <Section id="international" title="International visitors">
        <p>
          Cloudflare and Hugging Face operate globally, so technical information they process may be handled in countries other than yours, under their own safeguards.
        </p>
      </Section>

      <Section id="changes" title="Changes to this policy">
        <p>
          If we change how CleanShot handles information, we’ll update this page and the “Last updated” date. For significant changes, we’ll also post a notice on the
          site before they take effect.
        </p>
      </Section>

      <Section id="contact" title="Contact">
        <p>For privacy questions or requests, contact:</p>
        <ContactBlock />
        <p>
          See also the <DocLink doc="terms">Terms of Service</DocLink> and <DocLink doc="acceptable-use">Acceptable Use Policy</DocLink>.
        </p>
      </Section>
    </>
  );
}
