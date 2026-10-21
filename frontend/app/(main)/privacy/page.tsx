import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument, type LegalSection } from "@/components/auth/legal/legal-document";
import { COMPANY } from "@/lib/company";
import { TERMS_VERSION } from "@/lib/shared/contracts";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${COMPANY.brand} collects, uses, stores and protects your personal data, and the rights you have under India's DPDP Act, 2023.`,
  alternates: { canonical: "/privacy" },
};

const UPDATED = "16 October 2026";
const Email = () => <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>;

const SECTIONS: LegalSection[] = [
  {
    id: "who",
    title: "Who we are",
    body: (
      <>
        <p>
          {COMPANY.brand} is operated by <strong>{COMPANY.legalName}</strong>. For the
          purposes of India&rsquo;s <strong>Digital Personal Data Protection Act, 2023</strong> (&ldquo;DPDP Act&rdquo;), we
          are the Data Fiduciary for the personal data described in this policy.
        </p>
        <p>
          This policy explains what we collect when you use {COMPANY.brand}, why, who we share it with, how long we keep it
          and the choices you have. It forms part of our <Link href="/terms">Terms &amp; Conditions</Link>.
        </p>
      </>
    ),
  },
  {
    id: "collect",
    title: "What we collect",
    body: (
      <>
        <h3>Information you give us</h3>
        <ul>
          <li>
            <strong>Account details:</strong> your email address and password. Passwords are stored only as a salted hash —
            we never see or store the password itself.
          </li>
          <li>
            <strong>Profile:</strong> username, display name, bio and profile photo, plus the date and version of the Terms you
            accepted.
          </li>
          <li>
            <strong>Content:</strong> the stories you publish or save as drafts (title, text, cover image and source link).
          </li>
          <li>
            <strong>Messages:</strong> anything you send us by email, such as reports, takedown requests or support questions.
          </li>
        </ul>
        <h3>Information created when you use the Service</h3>
        <ul>
          <li>
            <strong>Activity:</strong> who you follow, the stories you like and share, and which stories were viewed (so each
            reader counts once per story).
          </li>
          <li>
            <strong>How you use the Service:</strong> the buttons and links you tap, the features you use, what you search for
            and how long you spend reading each story — see <a href="#usage">How we record your use of {COMPANY.brand}</a>.
          </li>
          <li>
            <strong>Session and security data:</strong> the IP address and browser (user agent) recorded with your login
            session, and technical logs used to keep the Service secure and to limit abuse.
          </li>
          <li>
            <strong>Anonymous viewer ID:</strong> if you read without an account, a random identifier in a cookie lets us count
            unique views without knowing who you are.
          </li>
        </ul>
        <p>
          We remove hidden metadata such as camera details and GPS location from images you upload before storing them.
        </p>
      </>
    ),
  },
  {
    id: "usage",
    title: `How we record your use of ${COMPANY.brand}`,
    body: (
      <>
        <p>
          To understand how {COMPANY.brand} is used, to show reporters how their stories perform, and to improve and
          personalise the Service, we keep a record of how you use it. Each time you use {COMPANY.brand} — on the website or
          in the app — we record:
        </p>
        <ul>
          <li>
            <strong>What you tap:</strong> the name of the button or link (for example &ldquo;Like&rdquo;, &ldquo;Share&rdquo;,
            &ldquo;Follow&rdquo; or &ldquo;Open story&rdquo;) and the story or profile it relates to;
          </li>
          <li>
            <strong>Features you use:</strong> for example turning auto-scroll on or off, switching between grid and reels,
            starting News radio, and double-tapping to like;
          </li>
          <li>
            <strong>What you search for</strong> on {COMPANY.brand}, and <strong>how long you read</strong> each story you open;
          </li>
          <li>the page you were on, the time, and whether you used the website or the app.</li>
        </ul>
        <p>
          If you are logged in, this record is linked to your account. If you are not, it is linked only to the anonymous
          viewer ID described under <a href="#cookies">Cookies</a>, and not to your name or email. We do not record what you
          type into stories, comments or messages through this feature, and we do not record anything outside {COMPANY.brand}.
        </p>
        <h3>How it is used</h3>
        <ul>
          <li>
            <strong>Reporters</strong> see totals for their own stories only — for example how many readers opened a story or
            pressed &ldquo;Share&rdquo; — never who did it.
          </li>
          <li>
            <strong>{COMPANY.brand}&rsquo;s administrators</strong> can see the activity of individual accounts, to run and
            secure the Service, investigate abuse and understand how features are used.
          </li>
          <li>
            We may use it to <strong>personalise your experience</strong> — for example to choose which stories appear in your
            feed and in what order, based on what you read and engage with.
          </li>
        </ul>
        <p>
          We do <strong>not</strong> sell this information or share it with advertisers. Activity records are kept for up to
          24 months and then deleted, and they are deleted with your account if you close it.
        </p>
      </>
    ),
  },
  {
    id: "google",
    title: "Signing in with Google",
    body: (
      <>
        <p>
          If you choose &ldquo;Continue with Google&rdquo;, Google shares your <strong>name, email address, profile photo and
          Google account ID</strong> with us (the <code>openid</code>, <code>email</code> and <code>profile</code> scopes). We
          never receive your Google password, and we do not access your Gmail, contacts, Drive or any other Google data.
        </p>
        <p>
          We use your Google photo to pre-fill your profile picture; when you finish setting up your profile we store our own
          copy of it. You can change it at any time in{" "}
          <Link href="/settings">Settings</Link>, and you can remove {COMPANY.brand}&rsquo;s access from your Google
          account&rsquo;s security settings.
        </p>
      </>
    ),
  },
  {
    id: "use",
    title: "How we use your information",
    body: (
      <>
        <ul>
          <li>to create and secure your account and keep you logged in;</li>
          <li>to show your profile and byline, publish your stories and deliver them to readers in real time;</li>
          <li>to run feeds, follower lists and like, share and view counts;</li>
          <li>
            to show reporters how their stories perform, and to understand and improve how {COMPANY.brand} is used, including
            personalising the stories you see;
          </li>
          <li>to prevent spam, abuse, fraud and security incidents, including rate limiting;</li>
          <li>to review reports, moderate content and enforce our Terms;</li>
          <li>to answer your messages and tell you about important changes to the Service; and</li>
          <li>to comply with the law and respond to lawful requests from authorities.</li>
        </ul>
        <p>
          We process your data on the basis of the consent you give when you create your account and accept our Terms, and for
          the legitimate uses permitted by the DPDP Act (for example, complying with the law). We do <strong>not</strong> sell
          your personal data and we do not use it for third-party advertising.
        </p>
      </>
    ),
  },
  {
    id: "public",
    title: "What is public",
    body: (
      <>
        <p>
          {COMPANY.brand} is a public platform. Your <strong>username, display name, profile photo, bio, join date, published
          stories, follower and following lists</strong> and the like, share and view counts of your stories can be seen by
          anyone, including people who are not logged in, and may be indexed by search engines or shared on other sites.
        </p>
        <p>
          Your <strong>email address, drafts and password are private</strong>. Other users cannot see who liked a story or
          who viewed it — only the totals.
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "Cookies and local storage",
    body: (
      <>
        <p>We use only cookies and browser storage that are needed to run the Service. There are no advertising or cross-site tracking cookies.</p>
        <ul>
          <li>
            <strong>Session cookies</strong> (named <code>better-auth.*</code>) keep you logged in. They are HttpOnly, and a
            session lasts up to 7 days unless it is renewed by using the Service. Short-lived cookies also protect the Google
            sign-in flow against forgery.
          </li>
          <li>
            <strong><code>wn_vid</code></strong> — a random anonymous ID (kept for up to 1 year) so that a story&rsquo;s view
            count counts each reader once, and so that activity by readers who are not logged in can be grouped without knowing
            who they are.
          </li>
          <li>
            <strong>Local storage</strong> on your device keeps an unsent draft of the story you are writing so a refresh
            doesn&rsquo;t lose it. It never leaves your browser.
          </li>
        </ul>
        <p>You can clear cookies and site data in your browser at any time; you will then be logged out.</p>
      </>
    ),
  },
  {
    id: "storage",
    title: "Where your data is stored",
    body: (
      <>
        <p>
          Account, profile and story data are stored in our database with our hosting providers. Images you upload — profile
          photos and story covers — are stored and delivered through <strong>Cloudflare R2</strong>, the object storage
          service of Cloudflare, Inc., which serves them from its global network.
        </p>
        <p>
          Our providers may process data in India or other countries. Where data is transferred outside India, we do so only as
          permitted under the DPDP Act and require providers to protect it with appropriate safeguards.
        </p>
      </>
    ),
  },
  {
    id: "sharing",
    title: "Who we share it with",
    body: (
      <ul>
        <li>
          <strong>Service providers</strong> who help us run {COMPANY.brand} — hosting, database, image storage and delivery
          (Cloudflare) and sign-in (Google) — under contracts that limit their use of your data to providing services to us.
        </li>
        <li>
          <strong>Authorities</strong>, when required by law, court order or a lawful request, or when needed to protect the
          rights, property or safety of our users, the public or {COMPANY.legalName}.
        </li>
        <li>
          <strong>A successor</strong>, if {COMPANY.legalName} is involved in a merger, acquisition or sale of assets, subject
          to this policy.
        </li>
      </ul>
    ),
  },
  {
    id: "retention",
    title: "How long we keep it",
    body: (
      <ul>
        <li>Account and profile data: while your account is active.</li>
        <li>
          Stories and images: until you delete them or your account. Deleted stories disappear from the Service immediately
          and their images are removed from storage.
        </li>
        <li>
          When you ask us to delete your account, we delete your profile, stories, drafts, likes, follows, activity records and sessions within
          30 days, apart from limited records we must keep to meet legal obligations or resolve disputes.
        </li>
        <li>Login sessions expire after 7 days of inactivity; security logs are kept for up to 90 days.</li>
        <li>Records of how you use the Service (buttons tapped, features used, searches, reading time): up to 24 months.</li>
      </ul>
    ),
  },
  {
    id: "rights",
    title: "Your rights",
    body: (
      <>
        <p>Under the DPDP Act you have the right to:</p>
        <ul>
          <li>obtain a summary of the personal data we process about you and how we process it;</li>
          <li>
            correct, complete or update your data — most of it you can edit yourself in{" "}
            <Link href="/settings">Settings</Link>;
          </li>
          <li>have your data erased, and withdraw your consent (which means closing your account);</li>
          <li>have your grievances addressed by our Grievance Officer; and</li>
          <li>nominate another person to exercise these rights on your behalf in the event of death or incapacity.</li>
        </ul>
        <p>
          To exercise any of these rights, email <Email /> from the address linked to your account. We will verify your request
          and aim to respond within 30 days. If you are not satisfied with our response, you may complain to the Data Protection
          Board of India.
        </p>
      </>
    ),
  },
  {
    // Meta's "data deletion instructions" URL for the auto-post app: /privacy#connected-accounts (owner 2026-09-30).
    id: "connected-accounts",
    title: "Connected Instagram and Facebook accounts",
    body: (
      <>
        <p>
          Verified reporters can connect an Instagram Professional account and a Facebook Page in{" "}
          <Link href="/settings">Settings</Link>, so the stories they publish on {COMPANY.brand} are posted there
          automatically. Connecting goes through Meta&rsquo;s own login; we never see your Instagram or Facebook password.
        </p>
        <p>
          When you connect, we keep the account&rsquo;s ID and name (your @username, or your Page&rsquo;s name and the other
          Pages you manage) and the access key Meta gives us, stored encrypted. We use them only to post the stories you
          publish while &ldquo;Auto-post&rdquo; is on, and to show you whether each post went out. We don&rsquo;t read your
          messages, followers or other posts.
        </p>
        <p>
          <strong>To delete this data:</strong> tap <strong>Disconnect</strong> in Edit profile → Connected accounts — the
          access key and account details are deleted at once and nothing more is posted. You can also remove {COMPANY.brand} in
          Instagram (Settings → Apps and websites) or Facebook (Settings → Business integrations), or email <Email /> from the
          address linked to your account and we will delete it within 30 days. Posts already published on Instagram or
          Facebook stay there until you delete them yourself.
        </p>
      </>
    ),
  },
  {
    id: "children",
    title: "Children",
    body: (
      <p>
        {COMPANY.brand} is intended for people aged 18 and over, and we do not knowingly collect personal data from children.
        If you believe a child has created an account, contact <Email /> and we will delete it.
      </p>
    ),
  },
  {
    id: "security",
    title: "Security",
    body: (
      <p>
        We protect your data with encrypted connections (HTTPS) in production, hashed passwords, HttpOnly session cookies,
        strict access controls and rate limits on sensitive actions. No online service can be perfectly secure, so please use a
        strong, unique password. If we become aware of a personal data breach that affects you, we will notify you and the Data
        Protection Board of India as the law requires.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <p>
        We may update this policy as {COMPANY.brand} evolves. The date and version at the top show when it last changed. If a
        change materially affects how we use your data, we will let you know on the Service before it takes effect.
      </p>
    ),
  },
  {
    id: "grievance",
    title: "Grievance Officer and contact",
    body: (
      <>
        <p>For privacy questions, requests or complaints, contact our Grievance Officer:</p>
        <p>
          <strong>Grievance Officer, {COMPANY.legalName}</strong>
          <br />
          Email: <Email />
        </p>
      </>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalDocument
      current="privacy"
      title="Privacy Policy"
      lede={`What ${COMPANY.brand} knows about you, why we need it, where it lives, and how you stay in control.`}
      version={TERMS_VERSION}
      updated={UPDATED}
      summary={[
        <>We collect what we need to run your account and publish your stories — nothing is sold or used for ads.</>,
        <>
          Your <strong>profile and published stories are public</strong>; your email, drafts and password are private.
        </>,
        <>Only essential cookies: your login session and an anonymous ID for counting views.</>,
        <>
          We record how you use {COMPANY.brand} — the buttons you tap, features you use and reading time — to show reporters
          totals, improve the Service and personalise your feed. Kept up to 24 months, never sold.
        </>,
        <>Images are stored on Cloudflare R2; Google sign-in shares only your name, email and photo.</>,
        <>
          You can access, correct or delete your data under India&rsquo;s DPDP Act — email{" "}
          <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>.
        </>,
      ]}
      sections={SECTIONS}
    />
  );
}
