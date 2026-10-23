"use client";

import { isFeedPath } from "@/components/feed/feed-views";
import { setAutoScroll } from "@/components/feed/reel-autoscroll";
import { canPublish, publishesToReview, type ViewerUser } from "@/lib/shared/contracts";
import type { GuideId } from "./tour-storage";
import { activeFeedItem, composerStepIs, findByText, firstOnScreen, openDialog, openMenu, withExactText } from "./tour-dom";

/*
 * The guided tour's steps (owner 2026-10-22: "every feature the user should click and check — not a video"). Each step
 * points at one real control, says what to do, and is done only when the page shows the action really happened
 * (`done`); the tour then leaves the person with the feature for `dwellMs` before moving on. Lookups go through the
 * DOM (`data-tour` hooks, aria labels, the path) so the tour needs nothing from the feed's own state.
 */

export type StepContext = {
  pathname: string;
  viewer: ViewerUser | null;
  /** < 768px: the bottom tab bar is the navigation (Home · Reels · + · Explore · Profile). */
  phone: boolean;
  /** Scratch for the step (empty when it starts, kept across page changes within it). */
  memo: Record<string, unknown>;
};

export type StepRoute = {
  match: (pathname: string) => boolean;
  /** Where to send someone who wandered off. */
  href: string;
  label: string;
};

export type TourStep = {
  id: string;
  title: string;
  instruction: string | ((ctx: StepContext) => string);
  /** Shown once the action is detected, while they feel the feature. */
  praise: string;
  route: StepRoute;
  /** The control to spotlight (null: not on this screen right now). */
  target: (ctx: StepContext) => Element | null;
  /** The action really happened. */
  done: (ctx: StepContext) => boolean;
  /** Time left with the feature after it's done, before the next step (ms). */
  dwellMs: number;
  /** Tidy up on leaving the step (auto-scroll off, radio stopped). */
  leave?: (ctx: StepContext) => void;
  /** What the animated finger shows on the control (default: a tap). */
  gesture?: "tap" | "swipe-up";
};

const HOME: StepRoute = { match: isFeedPath, href: "/", label: "Home" };
const ANY: StepRoute = { match: () => true, href: "/", label: "Home" };
const EXPLORE: StepRoute = { match: (p) => p === "/explore", href: "/explore", label: "Explore" };
const PRESS_PASS: StepRoute = { match: (p) => p === "/press-pass", href: "/press-pass", label: "the Press Pass page" };
const PUBLISH: StepRoute = { match: (p) => p.startsWith("/publish"), href: "/publish", label: "the composer" };

const hook = (key: string) => `[data-tour="${key}"]`;

/** A navigation control: the tab bar's on phones, else the first of `wide` (side menu, masthead) that's on screen. */
const nav =
  (phoneKey: string, wide: string[]) =>
  (ctx: StepContext): Element | null => {
    const keys = ctx.phone ? [phoneKey, ...wide] : [...wide, phoneKey];
    for (const key of keys) {
      const el = firstOnScreen(hook(key));
      if (el) return el;
    }
    return null;
  };

/**
 * Done when one of the controls flips from off to on while the step runs (a like, a save): what was already on when
 * the step began doesn't count, and a control switched off and on again does.
 */
const flipped =
  (selector: string) =>
  (ctx: StepContext): boolean => {
    const seen = (ctx.memo.seen ??= new WeakMap<Element, boolean>()) as WeakMap<Element, boolean>;
    for (const el of document.querySelectorAll(selector)) {
      const on = el.getAttribute("aria-pressed") === "true";
      const before = seen.get(el);
      if (before === false && on) return true;
      if (before === undefined || !on) seen.set(el, on);
    }
    return false;
  };

const STOP_RADIO = '[aria-label="Stop News radio"]';
const FOLLOW_BADGE = 'button[aria-label^="Follow "]';
const FOLLOWING = 'button[aria-label^="Following "]';

/** Follow controls showing "Following" (the poster badges and the pills), across the page. */
const followingCount = () => document.querySelectorAll(FOLLOWING).length + withExactText("button", "Following").length;

const VISITOR_STEPS: TourStep[] = [
  {
    id: "reels",
    title: "Watch the news as Reels",
    instruction: (ctx) =>
      ctx.phone
        ? "Tap Reels in the bar below — every story becomes a full-screen poster."
        : "Tap the switch to show the feed as Reels — full-screen posters, one per scroll.",
    praise: "This is Reels: each story is a poster you swipe through.",
    route: HOME,
    target: nav("tab-reels", ["layout-switch"]),
    done: () => document.querySelector("[data-reel-feed]") !== null,
    dwellMs: 2200,
  },
  {
    id: "swipe",
    title: "Move to the next story",
    instruction: (ctx) => (ctx.phone ? "Swipe up to bring in the next story." : "Scroll down (or press ↓) for the next story."),
    praise: "One swipe, one story. Tap a poster any time to read the full article.",
    route: HOME,
    target: () => activeFeedItem()?.querySelector(".reel-poster") ?? null,
    gesture: "swipe-up",
    done: (ctx) => {
      const id = activeFeedItem()?.dataset.feedItem ?? null;
      if (!id) return false;
      if (ctx.memo.start === undefined) {
        ctx.memo.start = id;
        return false;
      }
      return id !== ctx.memo.start;
    },
    dwellMs: 1600,
  },
  {
    id: "autoscroll",
    title: "Let the news scroll itself",
    instruction: "Tap the ▶ Auto-scroll button on the right — stories then move on by themselves every 5 seconds.",
    praise: "Auto-scroll is on. Watch the red bar fill: the next story comes in by itself.",
    route: HOME,
    target: () => activeFeedItem()?.querySelector(hook("autoscroll")) ?? firstOnScreen(hook("autoscroll")),
    done: () => document.querySelector(`${hook("autoscroll")}[aria-pressed="true"]`) !== null,
    dwellMs: 7500,
    // Their preference stays as it was before the tour.
    leave: () => setAutoScroll(false),
  },
  {
    id: "radio",
    title: "Listen to the headlines",
    instruction: () =>
      openMenu()
        ? "Tap “News radio” — the headlines are read aloud, story after story."
        : "Open the story menu — the three red bars on the right.",
    praise: "News radio is on air: it reads each headline, then glides to the next story.",
    route: HOME,
    target: () => {
      const menu = openMenu();
      if (menu) return findByText('[role="menuitem"]', "News radio", menu);
      return (
        activeFeedItem()?.querySelector('[data-reel-rail] button[aria-label="More story actions"]') ??
        firstOnScreen('button[aria-label="More story actions"]')
      );
    },
    done: () => document.querySelector(STOP_RADIO) !== null,
    dwellMs: 7000,
    leave: () => document.querySelector<HTMLElement>(STOP_RADIO)?.click(),
  },
  {
    id: "explore",
    title: "Search and explore",
    instruction: (ctx) => (ctx.phone ? "Tap Explore (the magnifier) in the bar below." : "Open Explore from the menu on the left."),
    praise: "Explore shows every story as a poster, with search on top.",
    route: ANY,
    target: nav("tab-explore", ["nav-explore"]),
    done: (ctx) => ctx.pathname === "/explore",
    dwellMs: 1500,
  },
  {
    id: "search",
    title: "Find people and stories",
    instruction: "Tap the search field and type a word — a name, a place, a topic.",
    praise: "Results appear as you type: people first, then stories.",
    route: EXPLORE,
    target: () => firstOnScreen('input[role="combobox"]'),
    done: () => (document.querySelector<HTMLInputElement>('input[role="combobox"]')?.value.trim().length ?? 0) >= 2,
    dwellMs: 3000,
  },
  {
    id: "languages",
    title: "Read in your languages",
    instruction: "Tap the language button at the top and pick the languages you read — those stories come first.",
    praise: "Pick as many as you like; your feeds follow.",
    route: ANY,
    target: () => firstOnScreen('button[aria-label^="Languages"]'),
    done: (ctx) => {
      if (document.querySelector('button[aria-label^="Languages"][aria-expanded="true"]')) ctx.memo.opened = true;
      return ctx.memo.opened === true;
    },
    dwellMs: 3000,
  },
  {
    id: "home",
    title: "Back to Home",
    instruction: (ctx) => (ctx.phone ? "Tap Home in the bar below to return to the top stories." : "Tap Home in the menu to return to the top stories."),
    praise: "Home is the mix of every section, newest first.",
    route: ANY,
    target: nav("tab-home", ["nav-home"]),
    done: (ctx) => ctx.pathname === "/",
    dwellMs: 1500,
  },
];

const MEMBER_STEPS: TourStep[] = [
  {
    id: "like",
    title: "Like a story",
    instruction: "Tap the heart under a story you like (double-tapping a poster works too).",
    praise: "Liked. Reporters see what readers love.",
    route: HOME,
    target: () => firstOnScreen('button[aria-label^="Like"]'),
    done: flipped('button[aria-label^="Like"]'),
    dwellMs: 1800,
  },
  {
    id: "save",
    title: "Save for later",
    instruction: "Tap the bookmark to keep a story — it waits for you under Saved.",
    praise: "Saved. Find it any time from your profile.",
    route: HOME,
    target: () => firstOnScreen('button[aria-label="Save story"]'),
    done: flipped('button[aria-label="Save story"]'),
    dwellMs: 1800,
  },
  {
    id: "follow",
    title: "Follow a reporter",
    instruction: "Tap Follow on a reporter — the + on their photo, or the Follow button.",
    praise: "Following. Their new stories now land in your Following feed.",
    route: HOME,
    target: () => firstOnScreen(FOLLOW_BADGE) ?? withExactText("button", "Follow").find((el) => el.getClientRects().length > 0) ?? null,
    done: (ctx) => {
      const count = followingCount();
      if (ctx.memo.start === undefined) {
        ctx.memo.start = count;
        return false;
      }
      return count > (ctx.memo.start as number);
    },
    dwellMs: 1800,
  },
  {
    id: "comments",
    title: "Join the conversation",
    instruction: (ctx) => (ctx.memo.opened ? "Have a look — then close the sheet to carry on." : "Tap the comment bubble under a story."),
    praise: "Comments open as a sheet: reply, like a comment, or mention someone with @.",
    route: HOME,
    target: () => firstOnScreen('button[aria-label^="Comments"]'),
    done: (ctx) => {
      if (openDialog("Comments")) ctx.memo.opened = true;
      return ctx.memo.opened === true && !openDialog("Comments");
    },
    dwellMs: 1500,
  },
  {
    id: "notifications",
    title: "Your notifications",
    instruction: "Tap the bell at the top — new stories from reporters you follow and replies to you land here.",
    praise: "Everything that needs you, in one place.",
    route: ANY,
    target: () => firstOnScreen('button[aria-label^="Notifications"]'),
    done: (ctx) => {
      if (ctx.pathname === "/notifications" || document.querySelector('button[aria-label^="Notifications"][aria-expanded="true"]'))
        ctx.memo.opened = true;
      return ctx.memo.opened === true;
    },
    dwellMs: 2500,
  },
  {
    id: "profile",
    title: "Your profile",
    instruction: (ctx) => (ctx.phone ? "Tap your photo in the bar below." : "Tap your photo at the top right."),
    praise: "Your stories, saved items, followers and settings all live here.",
    route: ANY,
    target: nav("tab-profile", ["profile"]),
    done: (ctx) => Boolean(ctx.viewer?.username) && ctx.pathname === `/${ctx.viewer?.username}`,
    dwellMs: 2500,
  },
];

/** A Reader on the Press Pass page: the application, which makes them a Trainee reporter. */
const PRESS_PASS_STEPS: TourStep[] = [
  {
    id: "press-pass-details",
    title: "Your details",
    instruction: "Fill in your details — name as on your ID, date of birth, address, one government ID, where you report from — then tap Next.",
    praise: "Details in. One more screen: the Reporter Pledge.",
    route: PRESS_PASS,
    target: () => document.querySelector(hook("press-pass-next")),
    done: (ctx) => document.querySelector(hook("press-pass-issue")) !== null || canPublish(ctx.viewer),
    dwellMs: 1200,
  },
  {
    id: "press-pass-issue",
    title: "Sign the pledge",
    instruction: "Read the five promises, sign with your name and tap “Issue my Press Pass”.",
    praise: "Your Press Pass is issued — you're a Trainee reporter.",
    route: PRESS_PASS,
    target: () => document.querySelector(hook("press-pass-issue")),
    done: (ctx) => canPublish(ctx.viewer) || document.querySelector(hook("press-pass-holder")) !== null,
    dwellMs: 4000,
  },
];

/** A reporter in the composer for a new story. */
const PUBLISH_STEPS: TourStep[] = [
  {
    id: "publish-images",
    title: "Step 1 · Images",
    // One box at a time (owner 2026-10-22: it pointed at Next before any image was in): the cover, the article image,
    // then Next once both are there.
    instruction: () => {
      const slot = imageSlotToFill();
      if (slot === "cover") return "Add the cover photo — the poster readers see in the feed. Drag it in, browse, or take one.";
      if (slot === "article") return "Now the article image — it shows at the top of the full story. Or tap “Use the same image as the cover”.";
      return "Both images are in — tap Next.";
    },
    praise: "Images in.",
    route: PUBLISH,
    target: () => {
      const slot = imageSlotToFill();
      if (slot) return document.querySelector(`section[aria-label="${slot === "cover" ? "Cover image" : "Article image"}"]`);
      return document.querySelector(hook("composer-next"));
    },
    done: () => composerStepIs("02") || composerStepIs("03"),
    dwellMs: 900,
  },
  {
    id: "publish-details",
    title: "Step 2 · Story",
    // The guide moves down the form with the writer (owner 2026-10-22: it got stuck pointing at the step header above
    // the fields): the next empty field, then Preview once everything's in.
    instruction: () => (document.querySelector(hook("composer-preview")) ? "Everything's in — tap Preview to see the story as readers will." : (nextToFill()?.hint ?? "Fill in the fields marked * — Preview appears once they're all in.")),
    praise: "That's your poster and story, exactly as readers will see them.",
    route: PUBLISH,
    target: () => document.querySelector(hook("composer-preview")) ?? nextToFill()?.el ?? null,
    done: () => composerStepIs("03"),
    dwellMs: 1500,
  },
  {
    id: "publish-go",
    title: "Step 3 · Publish",
    instruction: (ctx) =>
      publishesToReview(ctx.viewer)
        ? "Happy with it? Tap Submit — as a Trainee, your story goes to the Review Desk first and goes live once approved."
        : "Happy with it? Tap Publish — your story is live the moment it's filed.",
    praise: "Filed! Happy reporting.",
    route: PUBLISH,
    target: () => document.querySelector(hook("composer-publish")),
    done: (ctx) => {
      if (document.querySelector(hook("publish-success"))) ctx.memo.filed = true;
      return ctx.memo.filed === true;
    },
    dwellMs: 2500,
  },
];

/** Step 1 of the composer: which image box is still empty (media-upload.tsx marks a filled one `data-done`), or null. */
function imageSlotToFill(): "cover" | "article" | null {
  const cover = document.querySelector('section[aria-label="Cover image"]');
  if (cover && !cover.hasAttribute("data-done")) return "cover";
  const article = document.querySelector('section[aria-label="Article image"]');
  if (article && !article.hasAttribute("data-done")) return "article";
  return null;
}

/** Step 2 of the composer: the first field still empty, in the order they're filled, with what to do there. */
function nextToFill(): { el: Element; hint: string } | null {
  const category = document.querySelector<HTMLSelectElement>("#composer-category");
  if (category && !category.value) return { el: category, hint: "Pick the category the story belongs to." };
  const title = document.querySelector<HTMLTextAreaElement | HTMLInputElement>("#composer-title");
  if (title && !title.value.trim()) return { el: title, hint: "Write the headline." };
  const blurb = document.querySelector<HTMLTextAreaElement>("#composer-blurb");
  if (blurb && !blurb.value.trim()) return { el: blurb, hint: "Write a two-line blurb — it shows under the headline and on the cards." };
  const story = document.querySelector("#composer-story-section");
  const editor = story?.querySelector<HTMLElement>('[contenteditable="true"]');
  const link = story?.querySelector<HTMLInputElement>("#composer-link");
  const written = (editor?.textContent ?? "").trim().length > 0 || (link?.value ?? "").trim().length > 0;
  if (story && !written) return { el: editor ?? link ?? story, hint: "Write the story here — or paste a link, or let AI draft it." };
  return null;
}

/* ─────────────── Page guides (owner 2026-10-22: "when every page opens, show that page's guide") ─────────────── */

/**
 * Done once a tap lands inside `selector` (a capture listener on the page, installed when the step first checks and
 * removed when it ends — `leave: stopListening`).
 */
const tappedIn =
  (selector: string) =>
  (ctx: StepContext): boolean => {
    if (!ctx.memo.off) {
      const onTap = (event: Event) => {
        if (event.target instanceof Element && event.target.closest(selector)) ctx.memo.tapped = true;
      };
      document.addEventListener("click", onTap, true);
      ctx.memo.off = () => document.removeEventListener("click", onTap, true);
    }
    return ctx.memo.tapped === true;
  };
const stopListening = (ctx: StepContext) => (ctx.memo.off as (() => void) | undefined)?.();

/** Done once something that was on screen when the step began is different (the open tab, the URL's query…). */
const changed =
  (read: () => string | null) =>
  (ctx: StepContext): boolean => {
    const now = read();
    if (ctx.memo.start === undefined) {
      ctx.memo.start = now;
      return false;
    }
    return now !== null && now !== ctx.memo.start;
  };

/** Done once a sheet / popup has been opened and closed again (a look, then back to the page). */
const openedAndClosed =
  (isOpen: () => boolean) =>
  (ctx: StepContext): boolean => {
    if (isOpen()) ctx.memo.opened = true;
    return ctx.memo.opened === true && !isOpen();
  };

/** Done once the field has had the cursor in it and been left (looked at, maybe edited). */
const visitedField =
  (find: () => HTMLElement | null) =>
  (ctx: StepContext): boolean => {
    const field = find();
    if (field && document.activeElement === field) ctx.memo.focused = true;
    return ctx.memo.focused === true && document.activeElement !== field;
  };

/** The form control a visible label names ("Display name" → its input). */
function fieldByLabel(text: string): HTMLElement | null {
  for (const label of document.querySelectorAll<HTMLLabelElement>("label")) {
    if ((label.textContent ?? "").trim().startsWith(text) && label.htmlFor) return document.getElementById(label.htmlFor);
  }
  return null;
}

const route = (match: (pathname: string) => boolean, href: string, label: string): StepRoute => ({ match, href, label });
/** A profile page (`/<username>`; the guide is only offered on your own — tour-storage.ts). */
const PROFILE = route((p) => /^\/[^/]+$/.test(p) && !["/explore", "/market", "/trending", "/messages", "/notifications", "/settings", "/communities", "/newsroom", "/press-pass", "/press-meet", "/publish"].includes(p), "/", "your profile");
const EDIT_PROFILE = route((p) => p === "/settings/profile", "/settings/profile", "Edit profile");
const SETTINGS = route((p) => p === "/settings", "/settings", "Settings");
const NOTIFICATIONS = route((p) => p === "/notifications", "/notifications", "Notifications");
const MESSAGES = route((p) => p.startsWith("/messages"), "/messages", "Messages");
const PRESS_MEET = route((p) => p.startsWith("/press-meet"), "/press-meet", "Press meets");
const COMMUNITIES = route((p) => p === "/communities", "/communities", "Communities");
const NEWSROOM = route((p) => p.startsWith("/newsroom"), "/newsroom", "the Newsroom");
const MARKET = route((p) => p === "/market", "/market", "Market");

/** A tab of a tab row, or null (the open one when `selected`). */
const tabIn = (row: string, selected: boolean) => firstOnScreen(`${row} [role="tab"][aria-selected="${selected}"]`);


/** Your own profile. The route needs the viewer, so these steps take it from the context. */
const PROFILE_STEPS: TourStep[] = [
  {
    id: "profile-stats",
    title: "Your followers",
    instruction: (ctx) => (ctx.memo.opened ? "That's who follows you. Close it to carry on." : "Tap Followers to see who follows you."),
    praise: "Followers and Following open the same way — tap any name to visit them.",
    route: PROFILE,
    target: () => firstOnScreen('[data-testid="stat-followers"]'),
    done: openedAndClosed(() => openDialog() !== null),
    dwellMs: 1500,
  },
  {
    id: "profile-tabs",
    title: "Your stories, saved and more",
    instruction: "Tap another tab — your published stories, what you saved, your press meets.",
    praise: "Each tab is a list of its own; Saved is only visible to you.",
    route: PROFILE,
    target: () => tabIn("#profile-tabs", false),
    done: changed(() => document.querySelector('#profile-tabs [role="tab"][aria-selected="true"]')?.textContent ?? null),
    dwellMs: 1800,
  },
  {
    id: "profile-share",
    title: "Share your profile",
    instruction: "Tap the share button — send your profile or its QR card on WhatsApp, Instagram and more.",
    praise: "Your QR card works anywhere: print it, post it, put it on your visiting card.",
    route: PROFILE,
    target: () => firstOnScreen('button[title="Share profile"]'),
    done: (ctx) => tappedIn('button[title="Share profile"]')(ctx) && openDialog() === null,
    leave: stopListening,
    dwellMs: 1500,
  },
  {
    id: "profile-edit",
    title: "Edit your profile",
    instruction: "Tap Edit profile to change your photo, name, bio and languages.",
    praise: "This is Edit profile — it has its own short guide.",
    route: PROFILE,
    target: () => firstOnScreen('a[href="/settings/profile"]'),
    done: (ctx) => ctx.pathname === "/settings/profile",
    dwellMs: 1200,
  },
];

const EDIT_PROFILE_STEPS: TourStep[] = [
  {
    id: "edit-photo",
    title: "Your photo",
    instruction: "Tap your photo to change it — upload one or take a new one.",
    praise: "Your photo shows on your profile and beside every story you publish.",
    route: EDIT_PROFILE,
    target: () => firstOnScreen('section[aria-labelledby="settings-photo"]'),
    done: tappedIn('section[aria-labelledby="settings-photo"]'),
    leave: stopListening,
    dwellMs: 1500,
  },
  {
    id: "edit-name",
    title: "Your name",
    instruction: "Tap the display name — change it if you like, then tap outside.",
    praise: "Your display name is what readers see on your stories.",
    route: EDIT_PROFILE,
    target: () => fieldByLabel("Display name"),
    done: visitedField(() => fieldByLabel("Display name")),
    dwellMs: 1200,
  },
  {
    id: "edit-bio",
    title: "Your bio",
    instruction: "Tap the bio — a line or two on who you are and what you cover.",
    praise: "A good bio gets you more followers.",
    route: EDIT_PROFILE,
    target: () => fieldByLabel("Bio"),
    done: visitedField(() => fieldByLabel("Bio")),
    dwellMs: 1200,
  },
  {
    id: "edit-languages",
    title: "The languages you read",
    instruction: "Tap the languages you read — your feeds show those stories first.",
    praise: "Only you see this. Change it any time.",
    route: EDIT_PROFILE,
    target: () => firstOnScreen('section[aria-labelledby="settings-languages"]'),
    done: tappedIn('section[aria-labelledby="settings-languages"]'),
    leave: stopListening,
    dwellMs: 1500,
  },
  {
    id: "edit-save",
    title: "Save",
    instruction: () =>
      document.querySelector<HTMLButtonElement>('form[aria-label="Edit profile"] button[type="submit"]')?.disabled
        ? "Nothing changed yet — change something to save it, or skip this step."
        : "Tap Save changes.",
    praise: "Saved. Your profile is up to date.",
    route: EDIT_PROFILE,
    target: () => document.querySelector('form[aria-label="Edit profile"] button[type="submit"]'),
    // Saved: the button was ready, then went back to "nothing to save".
    done: (ctx) => {
      const button = document.querySelector<HTMLButtonElement>('form[aria-label="Edit profile"] button[type="submit"]');
      if (button && !button.disabled) ctx.memo.ready = true;
      return ctx.memo.ready === true && Boolean(button?.disabled) && button?.getAttribute("aria-busy") !== "true";
    },
    dwellMs: 1500,
  },
];

const SETTINGS_STEPS: TourStep[] = [
  {
    id: "settings-section",
    title: "Your settings",
    instruction: "Tap any option — drafts, notifications, connected accounts…",
    praise: "Each option opens beside the list (on a phone, on its own screen — Back returns here).",
    route: SETTINGS,
    target: () => firstOnScreen('nav[aria-label="Settings"] button:not([aria-current="page"])'),
    done: changed(() => window.location.search),
    dwellMs: 1800,
  },
  {
    id: "settings-help",
    title: "Help center",
    instruction: "Open Help center — answers to common questions, and “Take the tour again”.",
    praise: "Any guide can be replayed from here.",
    route: SETTINGS,
    target: () => findByText('nav[aria-label="Settings"] button', "Help center"),
    done: () => window.location.search.includes("section=help"),
    dwellMs: 2000,
  },
];

const NOTIFICATIONS_STEPS: TourStep[] = [
  {
    id: "notifications-unread",
    title: "What's new",
    instruction: "Tap Unread to see only what you haven't seen yet.",
    praise: "All shows everything; Unread just the new ones.",
    route: NOTIFICATIONS,
    target: () => findByText("button[aria-pressed]", "Unread"),
    done: () => findByText('button[aria-pressed="true"]', "Unread") !== null,
    dwellMs: 1500,
  },
  {
    id: "notifications-read",
    title: "Mark all as read",
    instruction: () =>
      findByText<HTMLButtonElement>("button", "Mark all as read")?.disabled ? "Nothing unread right now — you're all caught up." : "Tap Mark all as read to clear the red dots.",
    praise: "Caught up. New ones appear here, and on your phone with the app.",
    route: NOTIFICATIONS,
    target: () => findByText("button", "Mark all as read"),
    // Done when nothing is unread any more (tapped, or there was nothing to begin with).
    done: () => Boolean(findByText<HTMLButtonElement>("button", "Mark all as read")?.disabled),
    dwellMs: 1800,
  },
];

/*
 * Messages (owner 2026-10-23: "community create and all not there in the guide"): a chat, a group chat, Requests, and
 * the way to Communities — whose own page guide then shows creating one.
 */
const NEW_MESSAGE = "New message";
const peopleSearch = () => document.querySelector<HTMLInputElement>('[role="dialog"] input[placeholder="Search people"]');

const MESSAGES_STEPS: TourStep[] = [
  {
    id: "messages-new",
    title: "Start a chat",
    instruction: "Tap New message.",
    praise: "Pick one person for a chat, or several for a group.",
    route: MESSAGES,
    target: () => findByText("main button", "New"),
    done: () => openDialog(NEW_MESSAGE) !== null,
    dwellMs: 1000,
  },
  {
    id: "messages-search",
    title: "Find someone",
    instruction: "Type a name in the search box.",
    praise: "Tap one name for a chat with them.",
    route: MESSAGES,
    target: () => peopleSearch() ?? openDialog(NEW_MESSAGE),
    // Typed something — or closed the box (they'll come back to it).
    done: () => (peopleSearch()?.value.trim().length ?? 0) >= 1 || openDialog(NEW_MESSAGE) === null,
    dwellMs: 1200,
  },
  {
    id: "messages-group",
    title: "Make a group chat",
    instruction: (ctx) =>
      ctx.memo.grouped
        ? "Name the group (or leave it), then Create group — or close this for now."
        : "Tap two or more people to start a group chat.",
    praise: "Groups get a name; you can add people and admins later from the chat's details.",
    route: MESSAGES,
    target: () => document.querySelector('[role="dialog"] input[aria-label="Group name"]') ?? openDialog(NEW_MESSAGE),
    done: (ctx) => {
      if (document.querySelector('[role="dialog"] input[aria-label="Group name"]')) ctx.memo.grouped = true;
      // Done once the box is closed (the group made, or left for later).
      return openDialog(NEW_MESSAGE) === null;
    },
    dwellMs: 1500,
  },
  {
    id: "messages-requests",
    title: "Message requests",
    instruction: "Tap Requests.",
    praise: "Messages from people you don't follow wait here until you accept them.",
    route: MESSAGES,
    target: () => firstOnScreen('main [role="tab"][aria-selected="false"]'),
    done: changed(() => document.querySelector('main [role="tab"][aria-selected="true"]')?.textContent ?? null),
    dwellMs: 1800,
  },
  {
    id: "messages-communities",
    title: "Communities",
    instruction: "Tap Communities — bigger groups for your town, your beat or a topic, each with its own chat.",
    praise: "Here you can join one, or create your own.",
    route: MESSAGES,
    target: () => firstOnScreen('main a[href="/communities"]'),
    done: (ctx) => ctx.pathname === "/communities",
    dwellMs: 1500,
  },
];

const PRESS_MEET_STEPS: TourStep[] = [
  {
    id: "press-meet-browse",
    title: "Press meets",
    instruction: "Scroll down to see the press meets coming up.",
    praise: "Reporters ask to join; the organizer picks who covers it.",
    route: PRESS_MEET,
    target: () => document.querySelector('section[aria-labelledby="pm-public"]'),
    gesture: "swipe-up",
    done: () => {
      const section = document.querySelector('section[aria-labelledby="pm-public"]');
      return section !== null && section.getBoundingClientRect().top < window.innerHeight * 0.6;
    },
    dwellMs: 1500,
  },
  {
    id: "press-meet-new",
    title: "Hold your own",
    instruction: "Tap New press meet to book one — reporters cover it live, then file their stories.",
    praise: "This is where you set the date, the place and who's invited.",
    route: PRESS_MEET,
    target: () => firstOnScreen('a[href="/press-meet/new"]'),
    done: (ctx) => ctx.pathname === "/press-meet/new",
    dwellMs: 1500,
  },
];

const COMMUNITIES_STEPS: TourStep[] = [
  {
    id: "communities-search",
    title: "Find a community",
    instruction: "Search for a community — your town, your beat, a topic.",
    praise: "Join one to see its members' stories and chat with them.",
    route: COMMUNITIES,
    target: () => firstOnScreen('input[aria-label="Search communities"]'),
    done: () => (document.querySelector<HTMLInputElement>('input[aria-label="Search communities"]')?.value.trim().length ?? 0) >= 2,
    dwellMs: 1800,
  },
  {
    id: "communities-tabs",
    title: "Yours, Discover, Invitations",
    instruction: "Tap another tab.",
    praise: "Invitations shows the communities that asked you to join.",
    route: COMMUNITIES,
    target: () => firstOnScreen('[role="tab"][aria-selected="false"]'),
    done: changed(() => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent ?? null),
    dwellMs: 1500,
  },
  {
    id: "communities-create",
    title: "Start your own",
    instruction: (ctx) => (ctx.memo.opened ? "Name it and create it — or close this for now." : "Tap Create to start a community of your own."),
    praise: "You'll be its owner: invite members, make admins.",
    route: COMMUNITIES,
    target: () => findByText("button", "Create"),
    done: openedAndClosed(() => openDialog() !== null),
    dwellMs: 1500,
  },
];

const NEWSROOM_STEPS: TourStep[] = [
  {
    id: "newsroom-range",
    title: "Your numbers",
    instruction: "Switch the time range — 7, 30 or 90 days.",
    praise: "Views, reads, likes and followers, compared with the period before.",
    route: NEWSROOM,
    target: () => firstOnScreen('[role="group"][aria-label="Time range"] button[aria-pressed="false"]'),
    done: changed(() => document.querySelector('[role="group"][aria-label="Time range"] button[aria-pressed="true"]')?.textContent ?? null),
    dwellMs: 2000,
  },
  {
    id: "newsroom-stories",
    title: "Every story",
    instruction: "Scroll down to your stories — each one's views, likes and shares.",
    praise: "Tap a story's row for its own numbers, or Spotlight it to reach more readers.",
    route: NEWSROOM,
    target: () => document.querySelector("table") ?? null,
    gesture: "swipe-up",
    done: () => {
      const table = document.querySelector("table");
      return table !== null && table.getBoundingClientRect().top < window.innerHeight * 0.7;
    },
    dwellMs: 2000,
  },
];

const MARKET_STEPS: TourStep[] = [
  {
    id: "market-card",
    title: "Live prices",
    instruction: (ctx) => (ctx.phone ? "Tap a card for its chart and details." : "Rest the pointer on a card (or click it) for its chart and details."),
    praise: "Open, high, low, the 52-week range — and the chart.",
    route: MARKET,
    target: () => firstOnScreen('button[aria-haspopup="dialog"]'),
    done: () => openDialog() !== null,
    dwellMs: 1200,
  },
  {
    id: "market-range",
    title: "The week, the month",
    instruction: (ctx) => (openDialog() ? "Tap 1W or 1M to see further back." : ctx.phone ? "Tap a card again, then 1W or 1M." : "Open a card again, then tap 1W or 1M."),
    praise: "Drag across the chart for the price at any moment.",
    route: MARKET,
    target: () => firstOnScreen('[role="dialog"] [role="group"][aria-label="Range"] button[aria-pressed="false"]') ?? firstOnScreen('button[aria-haspopup="dialog"]'),
    done: () => {
      const on = document.querySelector('[role="dialog"] [role="group"][aria-label="Range"] button[aria-pressed="true"]')?.textContent?.trim();
      return on === "1W" || on === "1M";
    },
    dwellMs: 2000,
  },
];

/** The steps of one guide (tour-storage.ts says which guide is offered where). */
export function buildSteps(guide: GuideId): TourStep[] {
  switch (guide) {
    case "basics":
      return VISITOR_STEPS;
    case "engage":
      return MEMBER_STEPS;
    case "press-pass":
      return PRESS_PASS_STEPS;
    case "publish":
      return PUBLISH_STEPS;
    case "profile":
      return PROFILE_STEPS;
    case "edit-profile":
      return EDIT_PROFILE_STEPS;
    case "settings":
      return SETTINGS_STEPS;
    case "notifications":
      return NOTIFICATIONS_STEPS;
    case "messages":
      return MESSAGES_STEPS;
    case "press-meet":
      return PRESS_MEET_STEPS;
    case "communities":
      return COMMUNITIES_STEPS;
    case "newsroom":
      return NEWSROOM_STEPS;
    case "market":
      return MARKET_STEPS;
  }
}

export const stepText = (text: TourStep["instruction"], ctx: StepContext): string => (typeof text === "function" ? text(ctx) : text);
