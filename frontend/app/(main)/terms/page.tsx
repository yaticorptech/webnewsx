import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument, type LegalSection } from "@/components/auth/legal/legal-document";
import { COMPANY } from "@/lib/company";
import { TERMS_VERSION } from "@/lib/shared/contracts";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description: `The rules for using ${COMPANY.brand}: accounts, your content and licence, prohibited content, moderation, takedowns and your rights.`,
  alternates: { canonical: "/terms" },
};

const UPDATED = "10 October 2026";
const Email = () => <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>;

const SECTIONS: LegalSection[] = [
  {
    id: "about",
    title: "About these Terms",
    body: (
      <>
        <p>
          {COMPANY.brand} (&ldquo;{COMPANY.brand}&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) is an online platform where
          members of the public publish, read and share news stories. It is operated by <strong>{COMPANY.legalName}</strong>,
          a company incorporated in India.
        </p>
        <p>
          These Terms &amp; Conditions (&ldquo;Terms&rdquo;) are a binding agreement between you and {COMPANY.legalName}. By
          creating an account, publishing, or otherwise using the website and services (the &ldquo;Service&rdquo;), you agree
          to these Terms and to our <Link href="/privacy">Privacy Policy</Link>. If you do not agree, please do not use the
          Service.
        </p>
      </>
    ),
  },
  {
    id: "eligibility",
    title: `Who can use ${COMPANY.brand}`,
    body: (
      <>
        <p>
          You must be at least <strong>18 years old</strong> and able to form a binding contract under Indian law to create an
          account. By using the Service you confirm that you meet these requirements and that you are not barred from using it
          under any applicable law.
        </p>
        <p>
          If you use the Service on behalf of a newsroom, company or other organisation, you confirm that you are authorised to
          accept these Terms for it, and &ldquo;you&rdquo; includes that organisation.
        </p>
      </>
    ),
  },
  {
    id: "account",
    title: "Your account and username",
    body: (
      <>
        <ul>
          <li>
            You can sign up with an email address and password, or with Google. Before your account can be used you must
            complete your profile: a username, display name, profile photo and bio, and accept these Terms.
          </li>
          <li>
            Give accurate information and keep it up to date. Do not impersonate any person, newsroom or organisation, or
            suggest an affiliation that does not exist.
          </li>
          <li>
            Usernames use lowercase letters and dots only. Some names are reserved, and we may reclaim or change a username that
            impersonates others, infringes a trademark, or is misleading or offensive.
          </li>
          <li>
            You are responsible for everything that happens under your account. Keep your password secret, and tell us at{" "}
            <Email /> straight away if you think your account has been compromised.
          </li>
          <li>One person may not run accounts to evade a suspension or to manipulate engagement.</li>
        </ul>
      </>
    ),
  },
  {
    id: "press-pass",
    title: "Verified reporters and the Press Pass",
    body: (
      <>
        <p>
          A Press Pass lets you publish stories. To get one you may need to verify your identity (for example with a
          government ID). A Verified badge means we have checked who you are — it does not mean you work for{" "}
          {COMPANY.brand}, or that we confirm every story you publish.
        </p>
        <ul>
          <li>Trainee reporters&rsquo; stories may be reviewed by our editors before they go live.</li>
          <li>
            Do not use your Press Pass, badge or the {COMPANY.brand} name to claim press privileges, access or payment from
            anyone, or to suggest you speak for us.
          </li>
          <li>
            We may downgrade, suspend or revoke a Press Pass or badge if your details turn out to be false, if you break
            these Terms, or if your stories repeatedly fail our publishing standards.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "content",
    title: "Your content and the licence you give us",
    body: (
      <>
        <p>
          <strong>You own what you publish.</strong> Stories, images, bios and other material you submit
          (&ldquo;Your Content&rdquo;) remain yours, together with any rights you hold in them.
        </p>
        <p>
          To run the Service, you grant {COMPANY.legalName} a <strong>worldwide, non-exclusive, royalty-free, transferable and
          sub-licensable licence</strong> to host, store, reproduce, format, adapt (for example resizing images, creating
          excerpts and previews), display, distribute and promote Your Content on and in connection with the Service,
          including in feeds, share previews and our official social media channels.
        </p>
        <p>
          This licence ends when you delete Your Content or your account, except for copies that others have already shared
          (for example through share links), copies in backups for a limited time, and copies we must keep to comply with law
          or resolve disputes.
        </p>
        <p>
          You confirm that you have all rights needed to publish Your Content and grant this licence, that it is accurate to
          the best of your knowledge, and that publishing it does not break any law or anyone&rsquo;s rights. When you rely on
          another source, add the source link so readers can check it.
        </p>
      </>
    ),
  },
  {
    id: "standards",
    title: "Publishing standards",
    body: (
      <>
        <p>
          {COMPANY.brand} is built on trust between publishers and readers. When you publish a story you agree to:
        </p>
        <ul>
          <li>report what you know to be true, and make clear what is opinion, analysis or unconfirmed;</li>
          <li>credit and link your sources, and never present someone else&rsquo;s work as your own;</li>
          <li>use headlines and images that fairly represent the story;</li>
          <li>correct material errors promptly once you become aware of them; and</li>
          <li>respect the privacy and dignity of the people you write about, especially victims and minors.</li>
        </ul>
      </>
    ),
  },
  {
    id: "prohibited",
    title: "Prohibited content and conduct",
    body: (
      <>
        <p>You must not publish, share or do anything on the Service that:</p>
        <ul>
          <li>
            <strong>is misinformation</strong> — content you know or have reason to believe is false or misleading presented as
            fact, fabricated quotes or documents, or manipulated or synthetic media designed to deceive;
          </li>
          <li>
            <strong>is hateful or harassing</strong> — attacks people based on religion, caste, race, ethnicity, national
            origin, sex, gender identity, sexual orientation, disability or similar characteristics, or bullies, threatens or
            targets individuals;
          </li>
          <li>incites or glorifies violence, terrorism or self-harm, or promotes dangerous organisations;</li>
          <li>
            is sexually explicit, or sexualises minors in any way (we report child sexual abuse material to the authorities);
          </li>
          <li>
            is <strong>illegal</strong> — including content that is defamatory, obscene, violates court orders, threatens the
            sovereignty, integrity, security or public order of India, or is otherwise unlawful under the Information
            Technology Act, 2000 and the rules made under it;
          </li>
          <li>infringes copyright, trademarks or other intellectual property, or reveals trade secrets;</li>
          <li>
            invades privacy — for example publishing someone&rsquo;s private contact details, identity documents, health data or
            intimate images without consent;
          </li>
          <li>impersonates a person, newsroom, public authority or {COMPANY.brand} itself;</li>
          <li>
            is spam or manipulation — fake engagement, coordinated inauthentic behaviour, automated posting, or buying and
            selling likes, follows or accounts;
          </li>
          <li>
            contains malware or phishing, or attempts to probe, scrape at scale, overload, reverse-engineer or bypass the
            security or rate limits of the Service.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "sensitive",
    title: "Sensitive news, safety and the people in your stories",
    body: (
      <>
        <p>News sometimes has to show hard things. When it does:</p>
        <ul>
          <li>
            Do not show graphic violence, injuries or dead bodies for shock value. Where an image is essential to the story,
            choose the least graphic one and say so in the story. We may blur, label or limit such content.
          </li>
          <li>
            Never reveal the identity of a victim of a sexual offence, or of a child who is a victim, witness or accused in a
            case — no names, photos, addresses, schools or other details that could identify them (as required by the
            Bharatiya Nyaya Sanhita, 2023, the POCSO Act, 2012 and the Juvenile Justice Act, 2015).
          </li>
          <li>
            Report on suicide and self-harm responsibly: no methods or locations, and add helpline information where you
            can.
          </li>
          <li>
            Do not publish someone&rsquo;s photo, video or voice taken in a private place, or of a private person in
            distress, without a clear public interest.
          </li>
          <li>
            Report crimes and accusations fairly: say what is alleged and by whom, and do not present a suspect as guilty
            before a court decides.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "synthetic",
    title: "AI-generated and edited content",
    body: (
      <>
        <p>
          You may use editing tools and AI to help you write, translate or design a poster, but you are responsible for
          the result, as if you had made it yourself.
        </p>
        <ul>
          <li>
            Clearly label any image, video or audio that is AI-generated or altered in a way that could make it look like
            something real happened.
          </li>
          <li>
            Never use AI or editing to create fake quotes, fake documents, or realistic images, video or voices of real
            people saying or doing things they did not do.
          </li>
          <li>
            We may add a label to content that we believe is synthetic or manipulated, or remove it if it could mislead
            people or cause harm.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "civic",
    title: "Elections and public events",
    body: (
      <p>
        Do not publish false information about how, when or where to vote, false claims about election results, or content
        that intimidates voters or election officials. During elections, follow the Election Commission of India&rsquo;s
        rules on campaigning, exit polls and the silence period. Paid political content must be clearly marked as paid
        and say who paid for it.
      </p>
    ),
  },
  {
    id: "moderation",
    title: "Moderation and enforcement",
    body: (
      <>
        <p>
          We do not check every story before it is published, and publication does not mean we endorse it. We may review
          content that is reported to us or that our systems flag, and we may, at our discretion and in line with applicable
          law:
        </p>
        <ul>
          <li>remove content or restrict who can see it;</li>
          <li>add labels or context to a story;</li>
          <li>limit features such as publishing, liking or following; or</li>
          <li>suspend or permanently close accounts, especially for serious or repeated violations.</li>
        </ul>
        <p>
          Where practical and lawful, we will tell you what action we took and why. If you think we got it wrong, write to{" "}
          <Email /> with the link to the content and your reasons, and we will review the decision.
        </p>
      </>
    ),
  },
  {
    id: "reporting",
    title: "Reporting content and takedown requests",
    body: (
      <>
        <p>
          Anyone can report a story, profile or image that they believe breaks these Terms or the law, including copyright
          owners and people whose privacy has been violated. Email <Email /> with:
        </p>
        <ul>
          <li>the link(s) to the content;</li>
          <li>what the problem is, and for copyright, the work you own;</li>
          <li>your name and contact details; and</li>
          <li>a statement that the information in your report is accurate to the best of your knowledge.</li>
        </ul>
        <p>
          We act on valid orders from courts and authorised government agencies as required by law. We may share a report
          (without your personal contact details, unless the law requires otherwise) with the person who published the
          content so they can respond.
        </p>
      </>
    ),
  },
  {
    id: "copyright",
    title: "Copyright and repeat infringement",
    body: (
      <>
        <p>
          Use only photos, videos, music and text that you created, that you have permission to use, or that the law
          allows you to use (for example a short quote with credit for news reporting). A credit alone is not permission.
        </p>
        <p>
          When we receive a valid copyright complaint we may remove the content and tell the publisher. If you believe it
          was removed by mistake, write to <Email /> with your explanation. Accounts that infringe repeatedly will be
          closed.
        </p>
      </>
    ),
  },
  {
    id: "grievance",
    title: "Grievance Officer",
    body: (
      <>
        <p>
          In accordance with the Information Technology Act, 2000 and the rules made under it, and the Digital Personal Data
          Protection Act, 2023, complaints about content on the Service or about the processing of your personal data can be
          sent to our Grievance Officer:
        </p>
        <p>
          <strong>Grievance Officer, {COMPANY.legalName}</strong>
          <br />
          Email: <Email />
        </p>
        <p>We aim to acknowledge complaints within 24 hours and to resolve them within 15 days of receipt.</p>
      </>
    ),
  },
  {
    id: "features",
    title: "Messages, communities and live press meets",
    body: (
      <>
        <ul>
          <li>
            These Terms apply to everything you send in direct messages, group chats and communities, and everything you
            say or show in a live press meet.
          </li>
          <li>
            Community owners and press meet organisers are responsible for the spaces they run: they must keep them within
            these Terms and remove content that breaks them. We may step in, remove a community or end a press meet.
          </li>
          <li>
            Do not record, screenshot or share a private chat or a press meet in a way the people in it did not agree to,
            unless the law allows it. Press meets may be recorded by the organiser where the press meet says so.
          </li>
          <li>Do not use messages to spam, harass, sell, or ask people for money or personal details.</li>
        </ul>
      </>
    ),
  },
  {
    id: "paid",
    title: "Paid features, sponsored stories and payments",
    body: (
      <>
        <ul>
          <li>
            Some features cost money — for example Spotlight placement, advertorials and paid press meets. The price and
            what you get are shown before you pay. Payments are handled by our payment partners under their own terms.
          </li>
          <li>
            Unless the offer says otherwise or the law requires it, payments are not refundable once the feature has been
            delivered. If we cannot deliver a paid feature, or remove it because of something that was not your fault, we
            will refund you.
          </li>
          <li>
            If anyone pays you, or gives you anything of value, to publish or promote something, you must clearly mark the
            story as sponsored or paid and name who paid. Hidden paid promotion is not allowed.
          </li>
          <li>
            Paid placement never changes our rules: sponsored stories must meet the same standards as every other story,
            and we may still remove them.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "app",
    title: "The app, notifications and translations",
    body: (
      <>
        <ul>
          <li>
            Our Android app and website are the same Service under these Terms. Keep the app updated — older versions may
            stop working.
          </li>
          <li>
            We send notifications about activity on your account (for example new followers, replies and press meet
            reminders). You can turn push notifications off in Settings.
          </li>
          <li>
            Translations of stories are made automatically and may not be exact. The story in its original language is the
            version that counts.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "ours",
    title: "Our Service and brand",
    body: (
      <>
        <p>
          The Service, including its software, design, the {COMPANY.brand} name and wordmark, the speed-lines mark and the
          tagline &ldquo;Pulse of the Public&rdquo;, belongs to {COMPANY.legalName} or its licensors. These Terms do not give
          you any right to use our brand without written permission.
        </p>
        <p>
          We may change, add or remove features, and we may suspend the Service for maintenance or security reasons. We will
          try to give notice of significant changes where reasonably possible.
        </p>
      </>
    ),
  },
  {
    id: "third-party",
    title: "Links, sources and Google sign-in",
    body: (
      <>
        <p>
          Stories may link to third-party websites (for example source links). We do not control those sites and are not
          responsible for their content or practices.
        </p>
        <p>
          If you sign in with Google, your use of your Google account is also governed by Google&rsquo;s own terms and
          privacy policy. We receive only the information described in our <Link href="/privacy#google">Privacy Policy</Link>.
        </p>
      </>
    ),
  },
  {
    id: "disclaimers",
    title: "Disclaimers",
    body: (
      <>
        <p>
          Stories on {COMPANY.brand} are written by members of the public. Their views are their own and are not those of{" "}
          {COMPANY.legalName}. Nothing on the Service is professional (for example legal, medical or financial) advice. Check
          important information with the original sources before relying on it.
        </p>
        <p>
          The Service is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis. To the extent permitted by
          law, we disclaim all warranties, express or implied, including that the Service will be uninterrupted, error-free or
          that any content is accurate or complete.
        </p>
      </>
    ),
  },
  {
    id: "liability",
    title: "Limitation of liability",
    body: (
      <>
        <p>
          To the extent permitted by law, {COMPANY.legalName} and its directors, employees and partners will not be liable for
          any indirect, incidental, special, consequential or punitive damages, or for any loss of profits, data, goodwill or
          reputation, arising out of or in connection with the Service or any content on it.
        </p>
        <p>
          Our total liability for any claim relating to the Service is limited to the amount, if any, that you paid us for
          the Service in the twelve months before the claim. Nothing in these Terms limits liability that cannot be limited
          under applicable law.
        </p>
      </>
    ),
  },
  {
    id: "indemnity",
    title: "Indemnity",
    body: (
      <p>
        You agree to indemnify and hold harmless {COMPANY.legalName} and its directors, employees and partners from claims,
        losses and expenses (including reasonable legal fees) arising from Your Content, your use of the Service, or your
        breach of these Terms or of anyone&rsquo;s rights.
      </p>
    ),
  },
  {
    id: "ending",
    title: "Suspension and termination",
    body: (
      <>
        <p>
          You may stop using the Service at any time. To close your account and delete your profile and stories, email{" "}
          <Email /> from the address linked to your account.
        </p>
        <p>
          We may suspend or terminate your access if you breach these Terms, if required by law, or if your use creates risk
          or legal exposure for us or other users. Sections that by their nature should survive termination (such as the
          licence for content already shared, disclaimers, limitation of liability, indemnity and governing law) will survive.
        </p>
      </>
    ),
  },
  {
    id: "changes",
    title: "Changes to these Terms",
    body: (
      <p>
        We may update these Terms from time to time. The version and date at the top of this page show when they last changed.
        If a change is material, we will give notice on the Service and may ask you to accept the new Terms before you continue
        publishing. Continuing to use the Service after changes take effect means you accept them.
      </p>
    ),
  },
  {
    id: "law",
    title: "Governing law and disputes",
    body: (
      <p>
        These Terms are governed by the laws of India. Subject to any rights you have that cannot be waived, the courts at{" "}
        <strong>Mumbai, Maharashtra</strong> have exclusive jurisdiction over any dispute arising out of or relating to these
        Terms or the Service. Before going to court, please contact us so we can try to resolve the issue informally.
      </p>
    ),
  },
  {
    id: "general",
    title: "General",
    body: (
      <ul>
        <li>
          These Terms, together with our <Link href="/privacy">Privacy Policy</Link> and any rules shown for a specific
          feature, are the whole agreement between you and us about the Service.
        </li>
        <li>If any part of these Terms cannot be enforced, the rest still applies.</li>
        <li>If we do not enforce a part of these Terms straight away, we can still enforce it later.</li>
        <li>
          You may not transfer your account or your rights under these Terms to anyone else. We may transfer ours, for
          example if {COMPANY.legalName} is reorganised or acquired.
        </li>
        <li>
          We are not responsible for delays or failures caused by events outside our reasonable control, such as network
          outages, natural disasters or government action.
        </li>
      </ul>
    ),
  },
  {
    id: "contact",
    title: "Contact us",
    body: (
      <p>
        Questions about these Terms? Write to <Email />.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalDocument
      current="terms"
      title="Terms & Conditions"
      lede={`The ground rules for publishing and reading on ${COMPANY.brand}: what you own, what we need from you, and how we keep the wire trustworthy.`}
      version={TERMS_VERSION}
      updated={UPDATED}
      summary={[
        <>You must be 18 or older, give accurate details, and keep your account secure.</>,
        <>
          <strong>You own your stories.</strong> You give us a licence to host, show and share them on {COMPANY.brand}.
        </>,
        <>No misinformation, hate, harassment, illegal content, impersonation or spam — we may remove it and suspend accounts.</>,
        <>Never identify victims of sexual offences or children in criminal cases, and label AI-generated or altered media.</>,
        <>Mark sponsored or paid stories clearly. Payments for paid features are shown before you pay.</>,
        <>
          Report problems or send takedown requests to <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>.
        </>,
        <>Indian law applies; courts at Mumbai have jurisdiction.</>,
      ]}
      sections={SECTIONS}
    />
  );
}
