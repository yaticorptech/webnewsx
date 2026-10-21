"use client";

import { ArrowRight, AtSign, Bookmark, Check, Eye, Heart, PenLine, Share2, X } from "lucide-react";
import { useState } from "react";
import { SpeedBarsSvg } from "@/components/brand/speed-lines";
import { FollowButton } from "@/components/follow/follow-button";
import { Avatar } from "@/components/ui/avatar";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { GoogleButton } from "@/components/ui/google-button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { TabPanel, Tabs } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { LIMITS, sanitizeUsernameInput } from "@/lib/shared/contracts";
import { BROKEN_IMAGE } from "./demo-data";
import { Demo, Section } from "./section";

const VARIANTS: ButtonVariant[] = ["primary", "secondary", "outline", "ghost", "danger"];

export function ControlsSection() {
  const [loading, setLoading] = useState(false);
  const [liked, setLiked] = useState(true);
  const [saved, setSaved] = useState(false);
  const [username, setUsername] = useState("maya.reports");
  const [bio, setBio] = useState("City hall, transit and the people who keep the lights on.");
  const [agree, setAgree] = useState(false);
  const [tab, setTab] = useState("published");

  return (
    <Section id="controls" title="Controls" lead="Rounded pills like the old platform: crimson primary, pink secondary, outlined neutral. Everything is keyboard-operable with a crimson focus ring.">
      <Demo label="Buttons · variants" className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-3">
          {VARIANTS.map((variant) => (
            <Button key={variant} variant={variant} className="capitalize">
              {variant}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button rightIcon={<ArrowRight aria-hidden />}>Open</Button>
          <Button variant="secondary" size="sm">
            Following
          </Button>
          <Button variant="outline" size="sm" disabled>
            Disabled
          </Button>
        </div>
      </Demo>

      <div className="grid gap-6 lg:grid-cols-2">
        <Demo label="Sizes · icons · states" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button leftIcon={<PenLine aria-hidden />}>Publish</Button>
            <Button
              loading={loading}
              onClick={() => {
                setLoading(true);
                setTimeout(() => setLoading(false), 1600);
              }}
            >
              {loading ? "Publishing…" : "Click to load"}
            </Button>
            <Button variant="outline" disabled>
              Disabled
            </Button>
            <Button href="/" variant="ghost">
              As link
            </Button>
          </div>
        </Demo>
        <Demo label="Icon buttons · aria-pressed" className="flex flex-wrap items-center gap-3">
          <IconButton label={liked ? "Unlike" : "Like"} pressed={liked} onClick={() => setLiked((v) => !v)}>
            <Heart aria-hidden className={liked ? "fill-brand text-brand" : undefined} />
          </IconButton>
          <IconButton label="Share">
            <Share2 aria-hidden />
          </IconButton>
          <IconButton label="Views" variant="outline">
            <Eye aria-hidden />
          </IconButton>
          <IconButton label={saved ? "Unsave" : "Save"} variant="solid" pressed={saved} onClick={() => setSaved((v) => !v)}>
            <Bookmark aria-hidden className={saved ? "fill-current" : undefined} />
          </IconButton>
          <IconButton label="Publish" variant="brand" shape="square">
            <PenLine aria-hidden />
          </IconButton>
          <IconButton label="Close" size="sm">
            <X aria-hidden />
          </IconButton>
        </Demo>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Demo label="Follow" className="flex flex-wrap items-center gap-3">
          <FollowButton username="demo.one" initialFollowing={false} />
          <FollowButton username="demo.two" initialFollowing />
          <FollowButton username="demo.three" initialFollowing={false} size="sm" />
          <p className="w-full text-xs text-muted">Logged out → opens the auth prompt. Logged in → optimistic toggle (demo users don’t exist, so it rolls back with a toast).</p>
        </Demo>
        <Demo label="Avatars · ring · fallback" className="flex flex-wrap items-end gap-4">
          <Avatar name="Maya Okafor" size="xs" />
          <Avatar name="Maya Okafor" size="sm" ring />
          <Avatar name="Grid Watch" size="md" />
          <Avatar name="Ada Lindqvist" size="lg" src={BROKEN_IMAGE} />
          <Avatar name="WebNEWS" size="xl" src="/icons/maskable-512.png" />
        </Demo>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Demo label="Fields" className="flex flex-col gap-5">
          <Field
            label="Username"
            required
            hint="Lowercase letters and dots only."
            labelAside={<span className="tabular-nums">{username.length}/30</span>}
          >
            <Input
              prefix={<SpeedBarsSvg className="h-3.5 w-auto text-brand" />}
              value={username}
              onChange={(event) => setUsername(sanitizeUsernameInput(event.target.value))}
              suffix={<Check aria-hidden className="size-4 text-success" />}
              autoComplete="off"
            />
          </Field>
          <Field label="Email" error="Enter a valid email address.">
            <Input type="email" defaultValue="maya@" suffix={<AtSign aria-hidden className="size-4 text-muted" />} />
          </Field>
          <Field label="Bio" required>
            <Textarea value={bio} onChange={(event) => setBio(event.target.value)} maxLength={LIMITS.bioMax} autoGrow />
          </Field>
          <Checkbox
            checked={agree}
            onCheckedChange={setAgree}
            label={
              <>
                I agree to the <a href="#controls" className="font-semibold text-brand-strong underline underline-offset-2">Terms &amp; Conditions</a> and Privacy Policy
              </>
            }
          />
        </Demo>
        <Demo label="Tabs · button mode + link mode" className="flex flex-col gap-6">
          <div>
            <Tabs
              id="sg-tabs"
              ariaLabel="Profile sections"
              value={tab}
              onValueChange={setTab}
              items={[
                { value: "published", label: "Published", count: 24 },
                { value: "drafts", label: "Drafts", count: 3 },
              ]}
            />
            <TabPanel tabsId="sg-tabs" value="published" active={tab === "published"} className="pt-4 text-sm text-muted">
              Published stories grid.
            </TabPanel>
            <TabPanel tabsId="sg-tabs" value="drafts" active={tab === "drafts"} className="pt-4 text-sm text-muted">
              Drafts (owner only).
            </TabPanel>
          </div>
          <Tabs
            ariaLabel="Feed"
            value="latest"
            fullWidth
            size="lg"
            items={[
              { value: "latest", label: "Latest", href: "/dev/ui#controls" },
              { value: "following", label: "Following", href: "/dev/ui?tab=following#controls" },
            ]}
          />
          <div className="flex flex-col gap-2">
            <GoogleButton />
            <p className="text-xs text-muted">Google button renders only when NEXT_PUBLIC_GOOGLE_ENABLED=1.</p>
          </div>
        </Demo>
      </div>
    </Section>
  );
}
