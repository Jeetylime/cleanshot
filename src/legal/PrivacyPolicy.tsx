import { ModelsTable, StorageControls } from './ModelsAndStorage';
import { ContactBlock, DocLink, List, MinimumAge, Section, Strong } from './blocks';

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
            Studiolo is built to process your images and PDFs <Strong>on your device, in your browser</Strong>. No Studiolo feature uploads your files to
            Studiolo or anyone else.
          </li>
          <li>Some data is stored in your browser so Studiolo can work, for example recent editor sessions and downloaded models. You can delete it at any time.</li>
          <li>
            Like any website, the infrastructure that delivers Studiolo (Cloudflare) receives technical information such as your IP address and browser details when
            your browser requests the site.
          </li>
          <li>Studiolo doesn’t use advertising, doesn’t sell personal information, and doesn’t set its own cookies.</li>
        </List>
      </Section>

      <Section id="who" title="Who this policy covers">
        <p>
          This policy describes how Studiolo (studiolo.page) handles information. In this policy “we” means the operator of Studiolo and
          “you” means anyone using the website.
        </p>
      </Section>

      <Section id="files" title="Your images and PDFs">
        <p>
          When you open, paste, drop or import a file, Studiolo reads it inside your browser tab. Editing, redaction, resizing, compression, conversion, metadata
          viewing, color picking, PDF tools, background removal and upscaling all run on your device using browser technologies such as Canvas and WebAssembly.
        </p>
        <p>
          Studiolo has no upload feature and no server-side processing, so we don’t receive, see or store the files you work on. If we ever add a feature that needs
          to send a file somewhere, that feature will say so clearly before anything is sent, and we will update this policy first.
        </p>
        <p>
          Files you export are saved where your browser puts downloads, or copied to your clipboard if you choose <Strong>Copy</Strong>. What happens to them after
          that is up to you.
        </p>
      </Section>

      <Section id="browser-storage" title="What Studiolo stores in your browser">
        <p>To work properly, Studiolo keeps some data on your device. It stays in your browser and isn’t sent to us.</p>
        <List>
          <li>
            <Strong>Canvas designs</Strong> (IndexedDB): designs you make on Canvas, including the images you add to them and a thumbnail, so you can reopen them
            later. They stay until you delete them from “Your designs” or clear this site’s data.
          </li>
          <li>
            <Strong>Recent Edit sessions</Strong> (IndexedDB): up to 10 recent sessions from Edit, including the image, your edits and a thumbnail, so you can
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
          You can clear recent sessions and downloaded models with the buttons below, delete designs from “Your designs” in Canvas, or remove everything by
          clearing this site’s data in your browser settings. Anyone with access to your browser profile may be able to see recent sessions and designs, so clear them
          on shared computers. If you download a design as a project file, that file contains the design and its images; keep it somewhere safe.
        </p>
        <StorageControls />
      </Section>

      <Section id="cookies" title="Cookies">
        <p>
          Studiolo doesn’t set its own cookies and doesn’t use cookies for advertising or tracking. Cloudflare, which delivers the site, may set strictly necessary
          security cookies in some situations, for example to tell people from automated traffic during an attack. See Cloudflare’s documentation for details on those
          cookies.
        </p>
      </Section>

      <Section id="infrastructure" title="Information handled by our infrastructure">
        <p>
          Studiolo is delivered by <Strong>Cloudflare</Strong>. When your browser requests the site, Cloudflare processes technical information needed to deliver it
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
          only to run, secure and troubleshoot Studiolo.
        </p>
      </Section>

      <Section id="analytics" title="Analytics">
        <p>
          Studiolo doesn’t include a third-party analytics script, advertising pixel or tracking library. We may view aggregate traffic statistics that Cloudflare
          provides from the requests it handles, such as numbers of visitors and requests, the pages requested, referring sites and approximate country. We use these to
          understand how Studiolo is used and to keep it running well. We don’t use them to identify individuals.
        </p>
      </Section>

      <Section id="models" title="AI tools and model downloads">
        <p>
          Two tools use small, task-specific neural networks. Nothing in Studiolo generates images from a prompt or generates text; every other tool uses standard image
          processing.
        </p>
        <List>
          <li>
            <Strong>Background Remover</Strong> uses a segmentation model. It only decides, pixel by pixel, what belongs to the subject and what belongs to the
            background. It never adds or changes pixels; it only makes the background transparent.
          </li>
          <li>
            <Strong>Image Upscaler</Strong> uses a super-resolution model. It rebuilds edges and fine texture from the pixels already in your image, so its added detail
            is an estimate based on your image, not new content.
          </li>
        </List>
        <p>
          Both models run on your device. Nothing downloads until you open one of these tools and confirm. Your browser then fetches the model from{' '}
          <Strong>Hugging Face</Strong> (huggingface.co) and its content delivery providers, and keeps it cached so the tool works offline afterwards. Like any website,
          Hugging Face receives your IP address and standard request details when it serves the files, and handles them under its own privacy policy. These requests
          download files only; they don’t contain your images. The engine that runs the models (ONNX Runtime, about 21 MB) is served by Studiolo itself.
        </p>
        <ModelsTable />
        <p>
          <Strong>Limitations.</Strong> The Background Remover predicts its cut-out at 1024 px and scales it up, so edges can look soft on very large photos, and it can
          struggle with glass, thin structures and hair against a similar background. The Image Upscaler can invent texture, sharpen noise, or reshape small text and
          faces, so don’t rely on an upscaled image as evidence or for identification. To keep processing reasonable, 2× works on images up to 1280 px and 4× up to
          640 px; larger images are reduced first. Both run on your processor, so a large image can take a minute.
        </p>
      </Section>

      <Section id="use-and-sharing" title="How information is used and shared">
        <p>
          We use the limited technical information described above only to deliver, secure, maintain and improve Studiolo, and to respond to you if you contact us. We
          don’t sell or rent personal information and don’t share it for advertising.
        </p>
        <p>Information may be shared or disclosed only:</p>
        <List>
          <li>with the service providers described above (Cloudflare and, for model downloads, Hugging Face), to provide the service</li>
          <li>if required by law, or to protect the rights, safety or security of users, the public or Studiolo</li>
          <li>as part of a transfer of Studiolo to a new operator, who would remain bound by this policy for information already collected</li>
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
          Because Studiolo processes files on your device and has no accounts, we usually hold little or no information that identifies you. You control the data in
          your browser directly and can delete it at any time. For anything else, contact us using the details below and we’ll respond within the time required by
          applicable law. We may need to verify your request.
        </p>
      </Section>

      <Section id="children" title="Children">
        <p>
          Studiolo isn’t directed at children under <MinimumAge />, and we don’t knowingly collect personal information from them. If you believe a child has sent us
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
          If we change how Studiolo handles information, we’ll update this page and the “Last updated” date. For significant changes, we’ll also post a notice on the
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
