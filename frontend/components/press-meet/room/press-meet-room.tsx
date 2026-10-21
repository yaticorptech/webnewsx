"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarX2,
  Check,
  Circle,
  Hand,
  Loader2,
  LogOut,
  MessageSquare,
  Mic,
  NotebookPen,
  MicOff,
  Radio,
  RefreshCcw,
  ShieldAlert,
  Square,
  Video,
  VideoOff,
  Volume2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { useRealtimeEvent } from "@/components/providers/realtime-provider";
import { useViewer } from "@/components/providers/viewer-provider";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { api, errorMessage, isApiError } from "@/lib/api";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { setScreenGuard } from "@/lib/native-app";
import { qk } from "@/lib/query-keys";
import { PRESS_MEET, type PressMeetDetail, type PressMeetPeer, type PressMeetRoom as RoomData } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { meetRange } from "../format";
import { JoinConsentDialog, RecordingConsentDialog } from "../detail/shared";
import { Notepad } from "../notepad";
import { usePressMeetLive } from "../use-press-meet-live";
import { resumeLevels, useSpeaking } from "./audio-level";
import { Compositor } from "./compositor";
import { RoomEngine, type RemotePeer } from "./engine";
import { RoomRecorder, recordingSupported } from "./recorder";
import { RoomChat, useRoomChat } from "./room-chat";

/*
 * /press-meet/[id]/live (owner 2026-10-01) — the WebNEWS Live room, full screen and dark like a broadcast gallery.
 * The organizer is on camera (with the WebNEWS mark burnt into the picture) and mic; reporters agree that the session is
 * recorded before they join (their recording starts as they join), ask to speak and talk once the organizer accepts
 * (owner 2026-10-05), and their recording is replayed only inside WebNEWS. Works on phones (portrait stage, people strip,
 * big touch controls) and in the Android app.
 */

const AUDIO: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
/** Reporters' cameras stay small: everyone sends to everyone (owner 2026-10-05: every face on screen). */
const REPORTER_VIDEO: MediaTrackConstraints = { facingMode: "user", width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 15, max: 20 } };

type Media = { mic: MediaStream | null; camera: MediaStream | null; compositor: Compositor | null };

function newPeerId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 20);
}

function stopMedia(media: Media | null): void {
  media?.compositor?.stop();
  media?.mic?.getTracks().forEach((t) => t.stop());
  media?.camera?.getTracks().forEach((t) => t.stop());
}

/** Why the browser refused (or can't do) camera / mic, in plain words. */
function mediaProblem(error: unknown): string {
  if (typeof window !== "undefined" && (!window.isSecureContext || !navigator.mediaDevices)) {
    return "Your browser allows the microphone and camera only on a secure (https) page. Open this page over https.";
  }
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Access was blocked. Allow the camera and microphone for WebNEWS in your browser or phone settings, then try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera or microphone was found on this device.";
  if (name === "NotReadableError") return "Your camera or microphone is being used by another app. Close it and try again.";
  return "Couldn't start your camera or microphone.";
}

/**
 * This page over https when it was opened over plain http (the browser then blocks mic and camera). The Mac's phone
 * relay (mobile/scripts/phone.mjs) serves https on :3443 next to http on :3100. Null when already secure.
 */
function secureUrl(): string | null {
  if (typeof window === "undefined" || window.isSecureContext) return null;
  const { hostname, port, pathname, search } = window.location;
  return `https://${hostname}${port === "3100" ? ":3443" : ""}${pathname}${search}`;
}

const roomKey = (id: string) => ["press-meets", "room", id] as const;

export function PressMeetRoom({ meetId }: { meetId: string }) {
  usePressMeetLive();
  const router = useRouter();
  const room = useQuery({
    queryKey: roomKey(meetId),
    queryFn: ({ signal }) => api.pressMeets.room(meetId, signal),
    refetchOnWindowFocus: false,
  });
  const [session, setSession] = useState<{ media: Media; micOn: boolean; cameraOn: boolean } | null>(null);
  const [ended, setEnded] = useState(false);
  // This person joined the room from another tab / device: this one steps out.
  const [replaced, setReplaced] = useState(false);
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  // Camera and mic go off whenever the room closes — ended elsewhere, or this page left.
  useEffect(() => () => stopMedia(sessionRef.current?.media ?? null), []);

  const meet = room.data?.meet;
  const over = ended || meet?.status === "ended" || meet?.status === "cancelled";
  useEffect(() => {
    if (!(over || replaced) || !sessionRef.current) return;
    stopMedia(sessionRef.current.media);
    setSession(null);
  }, [over, replaced]);
  useEffect(() => {
    if (meet?.platform === "google_meet") router.replace(`/press-meet/${meet.id}`);
  }, [meet, router]);

  // Reporters: no screenshots / screen recording in the app while in the room (recordings stay inside WebNEWS).
  const reporter = meet?.role === "reporter";
  useEffect(() => {
    if (!reporter) return;
    setScreenGuard(true);
    return () => setScreenGuard(false);
  }, [reporter]);

  // Keep the phone awake.
  useEffect(() => {
    if (!session) return;
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } };
    void nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {});
    return () => void lock?.release().catch(() => {});
  }, [session]);

  let body: ReactNode;
  if (room.isPending) {
    body = <Centered><Loader2 aria-label="Loading" className="size-8 animate-spin text-white/60" /></Centered>;
  } else if (room.isError || !meet) {
    const missing = isApiError(room.error) && room.error.status === 404;
    body = (
      <Message icon={<CalendarX2 aria-hidden />} title={missing ? "Press meet not found" : "Couldn't open the room"} text={missing ? "It isn't one you organize or were invited to." : errorMessage(room.error)}>
        <Button href="/press-meet">Your press meets</Button>
      </Message>
    );
  } else if (over) {
    body = (
      <Message icon={<Radio aria-hidden />} title={meet.status === "cancelled" ? "This press meet was cancelled" : "The press meet has ended"} text={meet.role === "reporter" ? "Thank you for covering it. Publish your story, then send it to the organizer from the press meet page." : "Thank you. Reporters will now send you their stories to verify."}>
        <Button href={`/press-meet/${meet.id}`} replace>
          Go to the press meet page
        </Button>
      </Message>
    );
  } else if (replaced) {
    body = (
      <Message
        icon={<Radio aria-hidden />}
        title="You joined from another tab or device"
        text="You're in this press meet somewhere else now, so this window stepped out. You can switch back here at any time."
      >
        <Button onClick={() => window.location.reload()}>Use here instead</Button>
        <Button href={`/press-meet/${meet.id}`} variant="secondary" replace>
          Go to the press meet page
        </Button>
      </Message>
    );
  } else if (meet.platform === "google_meet") {
    body = <Centered><Loader2 aria-label="Opening" className="size-8 animate-spin text-white/60" /></Centered>;
  } else if (meet.role === "reporter" && meet.myInvite?.status !== "accepted") {
    body = <AcceptGate meet={meet} />;
  } else if (meet.status === "scheduled") {
    body = <Waiting meet={meet} />;
  } else if (!session) {
    body = <Lobby meet={meet} onJoin={(media, micOn, cameraOn) => setSession({ media, micOn, cameraOn })} />;
  } else {
    body = (
      <InRoom
        room={room.data}
        media={session.media}
        initialMic={session.micOn}
        initialCamera={session.cameraOn}
        onEnded={() => setEnded(true)}
        onReplaced={() => setReplaced(true)}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0b0d11] text-white [color-scheme:dark]" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      {body}
    </div>
  );
}

/* ─────────────── Screens before the room ─────────────── */

function Centered({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 items-center justify-center p-6">{children}</div>;
}

function Message({ icon, title, text, children }: { icon: ReactNode; title: string; text: ReactNode; children?: ReactNode }) {
  return (
    <Centered>
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-white/8 text-brand ring-1 ring-white/10 [&_svg]:size-7">{icon}</span>
        <h1 className="font-wide text-2xl font-black tracking-tight">{title}</h1>
        <p className="text-[0.9375rem] leading-relaxed text-white/65">{text}</p>
        {children && <div className="mt-2 flex flex-wrap justify-center gap-2">{children}</div>}
      </div>
    </Centered>
  );
}

function RoomHeader({ meet, right }: { meet: PressMeetDetail; right?: ReactNode }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/8 px-3 sm:px-4">
      {/* Replace, not push (owner 2026-10-02): Back from the press meet page must not land in the (ended) room. */}
      <Link
        href={`/press-meet/${meet.id}`}
        replace
        aria-label="Back to the press meet page"
        data-back-button=""
        className="flex size-10 shrink-0 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white"
      >
        <ArrowLeft aria-hidden className="size-5" />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">{meet.title}</p>
        <p className="truncate text-xs text-white/55">
          {meet.organizer.name} · {meetRange(meet.startsAt, meet.endsAt)} IST
        </p>
      </div>
      {right}
      {/* Always the dark-background wordmark here (white "Web"). */}
      <Logo height={13} alt="WebNEWS" className="hidden opacity-90 sm:inline-flex [&>img:first-child]:hidden [&>img:last-child]:block" />
    </header>
  );
}

function AcceptGate({ meet }: { meet: PressMeetDetail }) {
  const queryClient = useQueryClient();
  const accept = useMutation({
    mutationFn: () => api.pressMeets.respond(meet.id, true),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.pressMeetsAll }),
    onError: (error) => toast.error("Couldn't accept", { description: errorMessage(error) }),
  });
  return (
    <>
      <RoomHeader meet={meet} />
      <Message icon={<ShieldAlert aria-hidden />} title="Accept the invitation to join" text={`${meet.organizer.name} invited you to cover this press meet.`}>
        <Button onClick={() => accept.mutate()} loading={accept.isPending}>
          Accept invitation
        </Button>
      </Message>
    </>
  );
}

function Waiting({ meet }: { meet: PressMeetDetail }) {
  const queryClient = useQueryClient();
  const organizer = meet.role === "organizer";
  // The recording consent comes first (owner 2026-10-05), as on the press meet page.
  const [consentOpen, setConsentOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const start = useMutation({
    mutationFn: () => api.pressMeets.start(meet.id),
    onSuccess: () => {
      setConsentOpen(false);
      void queryClient.invalidateQueries({ queryKey: qk.pressMeetsAll });
    },
    onError: (error) => toast.error("Couldn't start", { description: errorMessage(error) }),
  });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  const opens = Date.parse(meet.startOpensAt);
  const minutes = Math.max(0, Math.round((Date.parse(meet.startsAt) - now) / 60_000));
  return (
    <>
      <RoomHeader meet={meet} />
      <Message
        icon={<Radio aria-hidden />}
        title={organizer ? "Ready when you are" : `Waiting for ${meet.organizer.name}`}
        text={
          organizer
            ? now >= opens
              ? "Start the press meet to open the room. Reporters who accepted are told to join."
              : `You can start ${PRESS_MEET.startEarlyMinutes} minutes before the scheduled time${minutes > 0 ? ` — starts in ${minutes} min` : ""}.`
            : `The room opens when the organizer starts the press meet${minutes > 0 ? ` (scheduled in ${minutes} min)` : ""}. This page updates by itself.`
        }
      >
        {organizer && (
          <>
            <Button
              size="lg"
              onClick={() => {
                setConsent(false);
                setConsentOpen(true);
              }}
              disabled={now < opens}
            >
              Start press meet
            </Button>
            <RecordingConsentDialog
              open={consentOpen}
              onOpenChange={setConsentOpen}
              consent={consent}
              onConsent={setConsent}
              starting={start.isPending}
              onStart={() => start.mutate()}
            />
          </>
        )}
      </Message>
    </>
  );
}

/* ─────────────── Lobby: camera / mic check ─────────────── */

function Lobby({ meet, onJoin }: { meet: PressMeetDetail; onJoin: (media: Media, micOn: boolean, cameraOn: boolean) => void }) {
  const viewer = useViewer();
  const organizer = meet.role === "organizer";
  const [media, setMedia] = useState<Media | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(organizer);
  const [cameraOn, setCameraOn] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [secureHref, setSecureHref] = useState<string | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const handedOver = useRef(false);
  const previewRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let cancelled = false;
    let acquired: Media | null = null;
    (async () => {
      setProblem(null);
      setSecureHref(secureUrl());
      if (!navigator.mediaDevices?.getUserMedia) {
        setProblem(mediaProblem(null));
        setMedia({ mic: null, camera: null, compositor: null });
        return;
      }
      try {
        if (organizer) {
          let stream: MediaStream;
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: AUDIO,
              video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } },
            });
          } catch (error) {
            setProblem(`${mediaProblem(error)} You can still go live with your photo instead of video.`);
            stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO }).catch(() => new MediaStream());
          }
          const camera = stream.getVideoTracks().length ? new MediaStream(stream.getVideoTracks()) : null;
          const mic = stream.getAudioTracks().length ? new MediaStream(stream.getAudioTracks()) : null;
          acquired = { mic, camera, compositor: new Compositor(camera, { name: viewer?.name ?? meet.organizer.name, image: viewer?.image ?? null }) };
          if (!camera) setCameraOn(false);
        } else {
          // Camera + mic. The camera is compulsory (owner 2026-10-05); without a mic they can still join (it's asked
          // for again when the organizer lets them speak).
          let stream: MediaStream | null;
          try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO, video: REPORTER_VIDEO });
          } catch {
            stream = await navigator.mediaDevices.getUserMedia({ video: REPORTER_VIDEO }).catch((error: unknown) => {
              setProblem(`${mediaProblem(error)} Your camera must be on to join the press meet.`);
              return null;
            });
          }
          const camera = stream?.getVideoTracks().length ? new MediaStream(stream.getVideoTracks()) : null;
          const mic = stream?.getAudioTracks().length ? new MediaStream(stream.getAudioTracks()) : null;
          acquired = { mic, camera, compositor: null };
          if (!camera) setCameraOn(false);
        }
        if (cancelled) stopMedia(acquired);
        else setMedia(acquired);
      } catch (error) {
        if (!cancelled) setProblem(mediaProblem(error));
      }
    })();
    return () => {
      cancelled = true;
      if (!handedOver.current) stopMedia(acquired);
    };
  }, [organizer, attempt, viewer?.name, viewer?.image, meet.organizer.name]);

  useEffect(() => {
    media?.mic?.getAudioTracks().forEach((t) => (t.enabled = micOn));
  }, [media, micOn]);
  useEffect(() => {
    media?.compositor?.setCameraOn(cameraOn);
    media?.camera?.getVideoTracks().forEach((t) => (t.enabled = cameraOn));
  }, [media, cameraOn]);
  useEffect(() => {
    const video = previewRef.current;
    const source = media?.compositor ? new MediaStream([media.compositor.track]) : (media?.camera ?? null);
    if (!video || !source) return;
    video.srcObject = source;
    void video.play().catch(() => {});
  }, [media]);

  const speaking = useSpeaking(media?.mic ?? null, micOn);

  const join = () => {
    if (!media) return;
    resumeLevels();
    handedOver.current = true;
    onJoin(media, micOn, cameraOn && media.camera !== null);
  };

  return (
    <>
      <RoomHeader meet={meet} />
      <div className="flex flex-1 items-center justify-center overflow-y-auto p-4 sm:p-6">
        <div className="flex w-full max-w-3xl flex-col items-center gap-6 lg:flex-row lg:items-center lg:gap-10">
          <div className="w-full lg:flex-1">
            <div className="relative mx-auto aspect-video w-full max-w-xl overflow-hidden rounded-2xl bg-black ring-1 ring-white/10">
              {/* A reporter sees their own camera mirrored (the organizer's picture carries the WebNEWS mark). */}
              <video
                ref={previewRef}
                muted
                playsInline
                autoPlay
                className={cn("size-full", organizer ? "object-contain" : "-scale-x-100 object-cover", !organizer && !cameraOn && "invisible")}
              />
              {!organizer && media && !cameraOn && (
                <span className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <span className={cn("rounded-full p-1 transition-shadow", speaking && "shadow-[0_0_0_3px_var(--brand)]")}>
                    <Avatar src={viewer?.image} name={viewer?.name ?? "You"} size={88} decorative />
                  </span>
                  <span className="text-sm text-white/60">{media.camera ? "Camera is off" : "Allow your camera to join"}</span>
                </span>
              )}
              {!media && <Loader2 aria-label="Starting camera" className="absolute inset-0 m-auto size-8 animate-spin text-white/50" />}
              <span className="absolute bottom-3 left-3 rounded-full bg-black/55 px-2.5 py-1 text-[0.6875rem] font-bold uppercase tracking-wider">Preview</span>
            </div>
          </div>
          <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center lg:items-start lg:text-left">
            <p className="kicker text-brand">WebNEWS Live</p>
            <h1 className="font-wide text-2xl font-black tracking-tight">{organizer ? "Ready to go live?" : "Ready to join?"}</h1>
            <p className="text-sm leading-relaxed text-white/60">
              {organizer
                ? "Reporters see your camera with the WebNEWS mark and hear your mic; you see theirs. You can mute reporters and see raised hands. The press meet is recorded on this device from the moment you go live."
                : "Your camera stays on for the whole press meet — everyone in the room sees you. Your microphone stays off: tap Ask to speak, and it turns on once the organizer accepts."}
            </p>
            {!organizer && (
              <p className="flex items-center gap-2 text-xs text-white/55">
                <Circle aria-hidden className="size-2.5 fill-brand text-brand" />
                This session is recorded. Recording starts when you join.
              </p>
            )}
            {problem && <p className="rounded-xl bg-brand/15 px-3.5 py-2.5 text-sm text-white ring-1 ring-inset ring-brand/40">{problem}</p>}
            {secureHref && (
              <Button href={secureHref} variant="secondary" size="sm">
                Open secure page
              </Button>
            )}
            <div className="flex gap-3">
              {/* A reporter's mic opens in the room, once the organizer accepts their request to speak. */}
              <RoundToggle on={micOn} onClick={() => setMicOn((v) => !v)} disabled={!media?.mic || !organizer} onIcon={<Mic />} offIcon={<MicOff />} label={micOn ? "Mute" : "Unmute"} />
              {/* Reporters can't switch their camera off (owner 2026-10-05). */}
              {organizer && (
                <RoundToggle on={cameraOn} onClick={() => setCameraOn((v) => !v)} disabled={!media?.camera} onIcon={<Video />} offIcon={<VideoOff />} label={cameraOn ? "Camera off" : "Camera on"} />
              )}
              {problem && (
                <RoundButton onClick={() => setAttempt((n) => n + 1)} label="Try again">
                  <RefreshCcw />
                </RoundButton>
              )}
            </div>
            <Button size="lg" onClick={organizer ? join : () => setConsentOpen(true)} disabled={!media || (!organizer && !media.camera)} className="w-full sm:w-auto">
              {organizer ? "Go live" : "Join press meet"}
            </Button>
            {!organizer && (
              <JoinConsentDialog
                open={consentOpen}
                onOpenChange={setConsentOpen}
                organizerName={meet.organizer.name}
                onJoin={() => {
                  setConsentOpen(false);
                  join();
                }}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* ─────────────── The room ─────────────── */

function useElapsed(since: string | null): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (!since) return "0:00";
  const total = Math.max(0, Math.floor((now - Date.parse(since)) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

function InRoom({
  room,
  media,
  initialMic,
  initialCamera,
  onEnded,
  onReplaced,
}: {
  room: RoomData;
  media: Media;
  initialMic: boolean;
  initialCamera: boolean;
  onEnded: () => void;
  onReplaced: () => void;
}) {
  const { meet, iceServers } = room;
  const viewer = useViewer();
  const router = useRouter();
  const organizer = meet.role === "organizer";
  const engineRef = useRef<RoomEngine | null>(null);
  const peerIdRef = useRef("");
  const [peers, setPeers] = useState<RemotePeer[]>([]);
  const [joining, setJoining] = useState(true);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(initialMic);
  const [cameraOn, setCameraOn] = useState(initialCamera);
  // A raised hand = a request to speak; a reporter's mic works only once the organizer accepts (owner 2026-10-05).
  const [hand, setHand] = useState(false);
  const [canSpeak, setCanSpeak] = useState(organizer);
  const [recording, setRecording] = useState(false);
  const [recordBusy, setRecordBusy] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const recorderRef = useRef<RoomRecorder | null>(null);
  const recorderInputs = useRef(new Map<string, MediaStream | null>());
  const organizerVideoRef = useRef<HTMLVideoElement | null>(null);
  const endedRef = useRef(onEnded);
  const replacedRef = useRef(onReplaced);
  const steppedOut = useRef(false);
  useEffect(() => {
    endedRef.current = onEnded;
    replacedRef.current = onReplaced;
  }, [onEnded, onReplaced]);
  const [recordingSince, setRecordingSince] = useState<string | null>(null);
  const soundWasBlocked = useCallback(() => setSoundBlocked(true), []);

  // The mic: from the lobby, or asked for on the first Unmute (if the lobby didn't get one).
  const [mic, setMic] = useState<MediaStream | null>(media.mic);
  const [micBusy, setMicBusy] = useState(false);
  const lateMic = useRef<MediaStream | null>(null);
  useEffect(() => () => lateMic.current?.getTracks().forEach((t) => t.stop()), []);
  // The camera likewise: from the lobby, or asked for on the first Start video.
  const [camera, setCamera] = useState<MediaStream | null>(media.camera);
  const [cameraBusy, setCameraBusy] = useState(false);
  const lateCamera = useRef<MediaStream | null>(null);
  useEffect(() => () => lateCamera.current?.getTracks().forEach((t) => t.stop()), []);
  // Phones: the side panel opens from Chat / Notes (null = just the grid); wide screens always show it (People first).
  const [panel, setPanel] = useState<"people" | "chat" | "notes" | null>(null);
  const shownPanel = panel ?? "people";
  // The room's chat (owner 2026-10-02): unread = others' messages after the last one seen with the chat open.
  const chat = useRoomChat(meet.id);
  const [seenId, setSeenId] = useState<string | null>(null);
  const onChatSeen = useCallback((id: string | null) => setSeenId(id), []);
  const chatMessages = chat.data?.messages ?? [];
  const seenIndex = seenId ? chatMessages.findIndex((m) => m.id === seenId) : -1;
  const unread = shownPanel === "chat" ? 0 : chatMessages.slice(seenIndex + 1).filter((m) => m.author.id !== viewer?.id).length;
  const localAudio = media.mic?.getAudioTracks()[0] ?? null;

  /* Join, keep alive, leave. A fresh tab id per mount (React dev mode mounts twice). */
  const join = useCallback(async (engine: RoomEngine) => {
    // A reporter got here through the lobby's recording consent.
    const result = await api.pressMeets.join(meet.id, {
      peerId: engine.peerId,
      micOn: initialMic,
      cameraOn: initialCamera,
      ...(organizer ? {} : { recordingConsent: true as const }),
    });
    engine.connectAll(result.peers);
  }, [meet.id, initialMic, initialCamera, organizer]);

  useEffect(() => {
    const peerId = newPeerId();
    peerIdRef.current = peerId;
    // The organizer sends the composited picture (with the WebNEWS mark), a reporter their own camera.
    const localVideo = media.compositor?.track ?? media.camera?.getVideoTracks()[0] ?? null;
    const engine: RoomEngine = new RoomEngine(meet.id, peerId, meet.role, iceServers, { audio: localAudio, video: localVideo }, () =>
      setPeers([...engine.peers.values()]),
    );
    engineRef.current = engine;
    let cancelled = false;
    // Joined on the next tick: React's dev double-mount cancels the first mount before it joins (no ghost tab).
    const joinTimer = setTimeout(() => {
      join(engine)
        .then(() => !cancelled && setJoining(false))
        .catch((error: unknown) => {
          if (cancelled) return;
          if (isApiError(error) && error.code === "press_meet_state") endedRef.current();
          else setJoinError(errorMessage(error));
        });
    }, 0);
    const leave = () => {
      if (!steppedOut.current) void api.pressMeets.leave(meet.id, peerId).catch(() => {});
    };
    const beat = setInterval(() => {
      if (steppedOut.current) return;
      void api.pressMeets
        .beat(meet.id, peerId)
        .then((result) => {
          if (cancelled || steppedOut.current) return;
          if (result.status !== "live") endedRef.current();
          else if (!result.present) {
            // Swept and back in: a reporter asks to speak again.
            if (!organizer) {
              setCanSpeak(false);
              setHand(false);
              setMicOn(false);
            }
            void join(engine).catch(() => {});
          }
        })
        .catch(() => {});
    }, 10_000);
    window.addEventListener("pagehide", leave);
    return () => {
      cancelled = true;
      clearTimeout(joinTimer);
      clearInterval(beat);
      window.removeEventListener("pagehide", leave);
      leave();
      engine.close();
      if (engineRef.current === engine) engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one room session per mount
  }, []);

  /* Requests to speak: the organizer accepts / declines; a reporter asks, cancels, or ends their turn. */
  const answerSpeak = (peerId: string, allow: boolean) =>
    void api.pressMeets.speak(meet.id, peerId, allow).catch((error: unknown) => toast.error("Couldn't answer the request", { description: errorMessage(error) }));
  const askToSpeak = () => {
    if (hand) {
      toast("Waiting for the organizer", { description: "Your microphone turns on when they accept your request." });
      return;
    }
    setHand(true);
    toast("Request to speak sent", { description: "You can talk as soon as the organizer accepts." });
  };
  const doneSpeaking = () => {
    setCanSpeak(false);
    setMicOn(false);
    void api.pressMeets.speak(meet.id, peerIdRef.current, false).catch(() => {});
  };

  /* Room events (only ever this viewer's own). */
  useRealtimeEvent("meet.signal", (signal) => {
    if (signal.meetId !== meet.id) return;
    const engine = engineRef.current;
    if (signal.kind === "ended") {
      endedRef.current();
      return;
    }
    if (signal.kind === "replaced") {
      if (signal.to === peerIdRef.current) {
        steppedOut.current = true;
        recorderRef.current?.abandon();
        recorderRef.current = null;
        engine?.close();
        replacedRef.current();
      }
      return;
    }
    if (signal.kind === "mute") {
      if (signal.to === peerIdRef.current) {
        setMicOn(false);
        setHand(false);
        setCanSpeak(organizer);
        toast("The organizer muted you", { description: organizer ? undefined : "Ask to speak again for another question." });
      }
      return;
    }
    if (signal.kind === "speak") {
      if (signal.to !== peerIdRef.current) return;
      setHand(false);
      if (signal.data.allowed) {
        setCanSpeak(true);
        setMicOn(true);
        toast.success("You can speak now", {
          description: mic ? "The organizer accepted your request. Your microphone is on." : "The organizer accepted your request. Tap Unmute to talk.",
        });
      } else {
        setCanSpeak(false);
        setMicOn(false);
        toast("The organizer declined your request to speak");
      }
      return;
    }
    if (organizer && signal.kind === "state" && signal.data.hand && !signal.data.canSpeak && !engine?.peers.get(signal.from)?.info.hand) {
      const { peerId, user } = signal.data;
      toast(`${user.name} asks to speak`, { duration: 10_000, action: { label: "Accept", onClick: () => answerSpeak(peerId, true) } });
    }
    void engine?.handle(signal);
  });

  /* Local switches → tracks + everyone else's tiles. */
  useEffect(() => {
    mic?.getAudioTracks().forEach((t) => (t.enabled = micOn && canSpeak));
  }, [mic, micOn, canSpeak]);
  useEffect(() => {
    media.compositor?.setCameraOn(cameraOn);
    camera?.getVideoTracks().forEach((t) => (t.enabled = cameraOn));
  }, [media, camera, cameraOn]);
  useEffect(() => {
    if (joining || !peerIdRef.current) return;
    void api.pressMeets.state(meet.id, { peerId: peerIdRef.current, micOn, cameraOn, hand, recording }).catch(() => {});
  }, [joining, meet.id, micOn, cameraOn, hand, recording]);

  // After the organizer reloads, their old tab lingers until it's swept: prefer the connected one, else the newest.
  const organizerPeers = organizer ? [] : peers.filter((p) => p.info.role === "organizer");
  const organizerPeer = organizerPeers.find((p) => p.state === "connected") ?? organizerPeers.at(-1) ?? null;
  // One tile per person (a reload's old tab lingers until it's swept): the connected one, else the newest. Never
  // yourself from another tab.
  const byPerson = new Map<string, RemotePeer>();
  for (const peer of peers) {
    if (peer.info.role !== "reporter" || peer.info.user.id === viewer?.id) continue;
    const current = byPerson.get(peer.info.user.id);
    if (!current || peer.state === "connected" || current.state !== "connected") byPerson.set(peer.info.user.id, peer);
  }
  const reporters = [...byPerson.values()].sort(
    (a, b) => Number(b.info.hand) - Number(a.info.hand) || a.info.user.name.localeCompare(b.info.user.name),
  );

  /* Recording (reporters): keep everyone's audio in the mix as people come and go. */
  useEffect(() => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    const wanted = new Map<string, MediaStream | null>(peers.map((p) => [p.info.peerId, p.stream]));
    wanted.set("me", mic);
    for (const [key, stream] of wanted) {
      if (recorderInputs.current.get(key) !== stream) {
        recorder.setAudio(key, stream);
        recorderInputs.current.set(key, stream);
      }
    }
    for (const key of [...recorderInputs.current.keys()]) {
      if (!wanted.has(key)) {
        recorder.setAudio(key, null);
        recorderInputs.current.delete(key);
      }
    }
  });
  // Leaving the room (the press meet ended, or this page closed in the app): the recording is finished and kept.
  useEffect(() => () => void recorderRef.current?.stop().catch(() => {}), []);

  const toggleRecording = async () => {
    if (recordBusy) return;
    setRecordBusy(true);
    try {
      if (recorderRef.current) {
        const recorder = recorderRef.current;
        recorderRef.current = null;
        recorderInputs.current.clear();
        setRecording(false);
        await recorder.stop();
        toast.success("Recording saved on this device", { description: "Play, download or share it from the press meet page." });
      } else {
        const recorder = new RoomRecorder(
          meet.id,
          viewer?.id ?? "",
          { organizerVideo: () => organizerVideoRef.current, organizer: meet.organizer, title: meet.title },
          (message) => toast.error("Recording problem", { description: message }),
        );
        recorderRef.current = recorder;
        recorderInputs.current.clear();
        await recorder.start();
        setRecording(true);
        setRecordingSince(new Date(recorder.startedAt).toISOString());
      }
    } catch (error) {
      recorderRef.current?.dispose();
      recorderRef.current = null;
      setRecording(false);
      toast.error("Couldn't record", { description: errorMessage(error) });
    } finally {
      setRecordBusy(false);
    }
  };

  // "Recording starts when you join" (owner 2026-10-05): everyone's recording starts by itself once they're in — the
  // organizer's too, so the press meet's recording is on both sides afterwards (saved on each one's own device).
  const autoRecorded = useRef(false);
  useEffect(() => {
    if (joining || autoRecorded.current || !recordingSupported()) return;
    autoRecorded.current = true;
    void toggleRecording();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the join goes through
  }, [joining]);

  const end = useMutation({
    mutationFn: () => api.pressMeets.end(meet.id),
    onSuccess: () => endedRef.current(),
    onError: (error) => toast.error("Couldn't end the press meet", { description: errorMessage(error) }),
  });

  const elapsed = useElapsed(meet.startedAt);
  const recElapsed = useElapsed(recordingSince);
  const selfSpeaking = useSpeaking(mic, micOn);

  const toggleMic = async () => {
    if (mic) {
      setMicOn((v) => !v);
      return;
    }
    if (micBusy) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      const href = secureUrl();
      toast.error("Your microphone needs a secure (https) page", {
        description: "Browsers block the mic on plain http pages.",
        action: href ? { label: "Open secure page", href } : undefined,
      });
      return;
    }
    setMicBusy(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO });
      lateMic.current?.getTracks().forEach((t) => t.stop());
      lateMic.current = stream;
      const track = stream.getAudioTracks()[0];
      if (track) engineRef.current?.setAudioTrack(track);
      setMic(stream);
      setMicOn(true);
    } catch (error) {
      toast.error("Couldn't turn on your microphone", { description: mediaProblem(error) });
    } finally {
      setMicBusy(false);
    }
  };
  // A reporter's camera can't be switched off (owner 2026-10-05): it's only started again if it stopped by itself.
  const toggleCamera = async () => {
    if (camera) {
      if (organizer) setCameraOn((v) => !v);
      return;
    }
    if (cameraBusy) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      const href = secureUrl();
      toast.error("Your camera needs a secure (https) page", {
        description: "Browsers block the camera on plain http pages.",
        action: href ? { label: "Open secure page", href } : undefined,
      });
      return;
    }
    setCameraBusy(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: organizer ? { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } } : REPORTER_VIDEO,
      });
      lateCamera.current?.getTracks().forEach((t) => t.stop());
      lateCamera.current = stream;
      const track = stream.getVideoTracks()[0];
      // The organizer's picture is the compositor's (already sent); a reporter's camera goes out as it is.
      if (media.compositor) media.compositor.setCamera(stream);
      else if (track) engineRef.current?.setVideoTrack(track);
      setCamera(stream);
      setCameraOn(true);
    } catch (error) {
      toast.error("Couldn't turn on your camera", { description: mediaProblem(error) });
    } finally {
      setCameraBusy(false);
    }
  };
  // A reporter's camera that stops by itself (another app took it, the permission was withdrawn): ask to start it again.
  useEffect(() => {
    if (organizer || !camera) return;
    const tracks = camera.getVideoTracks();
    const lost = () => setCamera(null);
    tracks.forEach((t) => t.addEventListener("ended", lost));
    return () => tracks.forEach((t) => t.removeEventListener("ended", lost));
  }, [organizer, camera]);
  // Your own tile: the organizer's composited picture, a reporter's camera (mirrored there, like a mirror).
  const selfPreview = useMemo(
    () => (media.compositor ? new MediaStream([media.compositor.track]) : camera),
    [media.compositor, camera],
  );
  const unlockSound = () => {
    document.querySelectorAll<HTMLMediaElement>("[data-pm-media]").forEach((el) => void el.play().catch(() => {}));
    resumeLevels();
    setSoundBlocked(false);
  };

  const me: PressMeetPeer | null = viewer
    ? { peerId: "me", user: { id: viewer.id, username: viewer.username ?? "", name: viewer.name, image: viewer.image }, role: meet.role, micOn: micOn && canSpeak, cameraOn, hand, canSpeak, recording }
    : null;

  // The grid: the organizer (you, or their tab — a placeholder until it connects), then you, then the reporters.
  const tiles: TileData[] = [];
  if (organizer) {
    if (me) tiles.push({ key: "me", info: me, stream: selfPreview, self: true, host: true });
  } else {
    tiles.push(
      organizerPeer
        ? { key: organizerPeer.info.peerId, info: organizerPeer.info, stream: organizerPeer.stream, remote: organizerPeer, host: true }
        : {
            key: "organizer",
            info: { peerId: "organizer", user: meet.organizer, role: "organizer", micOn: false, cameraOn: false, hand: false, canSpeak: true, recording: false },
            stream: null,
            host: true,
            waiting: true,
          },
    );
    if (me) tiles.push({ key: "me", info: { ...me, cameraOn: cameraOn && camera !== null }, stream: selfPreview, self: true });
  }
  for (const peer of reporters) tiles.push({ key: peer.info.peerId, info: peer.info, stream: peer.stream, remote: peer });
  const audible = organizer ? reporters : [...(organizerPeer ? [organizerPeer] : []), ...reporters];
  // Waiting requests to speak, oldest first (the organizer answers them from the top of the grid).
  const requests = organizer ? peers.filter((p) => p.info.role === "reporter" && p.info.hand && !p.info.canSpeak && byPerson.get(p.info.user.id) === p) : [];

  return (
    <>
      <RoomHeader
        meet={meet}
        right={
          <div className="flex shrink-0 items-center gap-2">
            {recording && (
              <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-white/10 px-2.5 text-xs font-bold tabular-nums">
                <span className="size-2 animate-pulse rounded-full bg-brand" />
                REC {recElapsed}
              </span>
            )}
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-brand px-2.5 text-xs font-bold uppercase tracking-wider">
              <span className="relative flex size-1.5">
                <span className="absolute inset-0 animate-heartbeat-ring rounded-full bg-white" />
                <span className="relative size-1.5 rounded-full bg-white" />
              </span>
              Live <span className="tabular-nums normal-case tracking-normal">{elapsed}</span>
            </span>
          </div>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 lg:flex-row lg:p-4">
        {/* Everyone's picture in one grid (owner 2026-10-05, like Google Meet): the organizer first, then you, then
            the reporters (raised hands first). */}
        <div className="relative min-h-0 flex-1">
          <TileGrid count={tiles.length}>
            {tiles.map((tile) => (
              <VideoTile
                key={tile.key}
                info={tile.info}
                stream={tile.stream}
                remote={tile.remote}
                self={tile.self}
                host={tile.host}
                waiting={tile.waiting}
                speaking={tile.self ? selfSpeaking : undefined}
                videoRef={tile.host ? organizerVideoRef : undefined}
                canMute={organizer && !tile.self && !tile.host}
                onMute={() => void api.pressMeets.mute(meet.id, tile.info.peerId).catch(() => {})}
                onAccept={() => answerSpeak(tile.info.peerId, true)}
              />
            ))}
          </TileGrid>
          {joining && !joinError ? (
            <span className="absolute inset-x-0 top-3 mx-auto w-fit rounded-full bg-black/70 px-3 py-1 text-xs font-semibold">Connecting to the room…</span>
          ) : (
            !organizer &&
            (hand || canSpeak) && (
              <span
                role="status"
                className={cn(
                  "absolute inset-x-0 top-3 mx-auto flex w-fit max-w-[90%] items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold shadow-pop",
                  canSpeak ? "bg-success-strong" : "bg-black/75",
                )}
              >
                {canSpeak ? <Mic aria-hidden className="size-3.5 shrink-0" /> : <Loader2 aria-hidden className="size-3.5 shrink-0 animate-spin" />}
                <span className="truncate">{canSpeak ? "You can speak now" : `Waiting for ${meet.organizer.name} to accept your request to speak`}</span>
              </span>
            )
          )}
          {!organizer && !joining && camera === null && (
            <div role="alert" className="absolute inset-x-3 bottom-3 z-10 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-brand px-3.5 py-2.5 shadow-pop">
              <VideoOff aria-hidden className="size-5 shrink-0" />
              <p className="min-w-0 flex-1 text-sm font-semibold">Your camera stopped. Reporters stay on camera during the press meet.</p>
              <button
                type="button"
                onClick={() => void toggleCamera()}
                disabled={cameraBusy}
                className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-brand disabled:opacity-60"
              >
                {cameraBusy ? "Starting…" : "Turn on"}
              </button>
            </div>
          )}
          {requests.length > 0 && (
            <SpeakRequests requests={requests} onAnswer={(peerId, allow) => answerSpeak(peerId, allow)} />
          )}
          {joinError && (
            <div className="absolute inset-x-3 top-3 rounded-xl bg-brand/90 px-3 py-2 text-sm font-semibold">
              {joinError}{" "}
              <button type="button" className="underline" onClick={() => router.refresh()}>
                Retry
              </button>
            </div>
          )}
          {soundBlocked && (
            <button
              type="button"
              onClick={unlockSound}
              className="absolute inset-0 m-auto flex h-12 w-fit items-center gap-2 rounded-full bg-brand px-5 text-sm font-bold shadow-pop"
            >
              <Volume2 aria-hidden className="size-5" />
              Tap to turn on sound
            </button>
          )}
        </div>

        {/* People, chat or notes: a column on wide screens; on phones a panel under the grid, opened from Chat / Notes. */}
        <aside
          aria-label="People, chat and notes"
          className={cn("flex shrink-0 flex-col gap-2 lg:w-80 xl:w-96", panel === null ? "max-lg:hidden" : "max-lg:h-[45dvh]")}
        >
          <div className="flex shrink-0 items-center gap-1">
            <div role="tablist" aria-label="Side panel" className="flex flex-1 gap-1 rounded-full bg-white/5 p-1 text-xs font-bold">
              {(
                [
                  ["people", `${organizer ? "Reporters" : "People"} · ${reporters.length + (organizer ? 0 : 1)}`],
                  ["chat", unread > 0 ? `Chat · ${unread}` : "Chat"],
                  ["notes", "My notes"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={shownPanel === key}
                  onClick={() => setPanel(key)}
                  className={cn("h-8 flex-1 rounded-full px-3 transition-colors", shownPanel === key ? "bg-white text-[#0b0d11]" : "text-white/60 hover:text-white")}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setPanel(null)}
              aria-label="Close panel"
              className="flex size-10 shrink-0 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white lg:hidden"
            >
              <X aria-hidden className="size-5" />
            </button>
          </div>
          {shownPanel === "chat" && <RoomChat meetId={meet.id} organizer={organizer} chat={chat} onSeen={onChatSeen} className="min-h-0 flex-1" />}
          {shownPanel === "notes" && <Notepad meetId={meet.id} tone="dark" className="min-h-0 flex-1" />}
          {shownPanel === "people" && (
            <ul className="no-scrollbar flex min-h-0 flex-col gap-2 overflow-y-auto">
              {!organizer && me && <PersonTile peer={me} self speakingOverride={selfSpeaking} />}
              {reporters.map((peer) => (
                <PersonTile
                  key={peer.info.peerId}
                  peer={peer.info}
                  remote={peer}
                  canMute={organizer}
                  onMute={() => void api.pressMeets.mute(meet.id, peer.info.peerId).catch(() => {})}
                  onAnswer={(allow) => answerSpeak(peer.info.peerId, allow)}
                />
              ))}
              {reporters.length === 0 && organizer && (
                <li className="rounded-xl bg-white/4 px-3 py-3 text-sm text-white/55 lg:py-4">
                  Reporters appear here as they join. Requests to speak come first.
                </li>
              )}
            </ul>
          )}
        </aside>
      </div>

      {/* Everyone's sound: one player per person, whatever the grid and panels show (the tiles' videos are muted). */}
      <div hidden>
        {audible.map((peer) => (
          <AudioSink key={peer.info.peerId} stream={peer.stream} muted={peer.info.role === "reporter" && !peer.info.micOn} onBlocked={soundWasBlocked} />
        ))}
      </div>

      {/* Controls */}
      <nav aria-label="Room controls" className="shrink-0 border-t border-white/8 px-3 pt-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        <div className="mx-auto flex max-w-xl items-start justify-center gap-2 min-[380px]:gap-3 sm:gap-5">
          {canSpeak ? (
            <RoundToggle
              on={micOn && mic !== null}
              onClick={() => void toggleMic()}
              busy={micBusy}
              onIcon={<Mic />}
              offIcon={<MicOff />}
              label={micOn && mic ? "Mute" : "Unmute"}
              withLabel
            />
          ) : (
            <RoundButton onClick={askToSpeak} label={hand ? "Waiting for the organizer to accept" : "Ask to speak to turn on your mic"} caption="Mic" off withLabel>
              <MicOff />
            </RoundButton>
          )}
          {/* Reporters stay on camera (owner 2026-10-05): only the organizer has Video. */}
          {organizer && (
            <RoundToggle
              on={cameraOn && camera !== null}
              onClick={() => void toggleCamera()}
              busy={cameraBusy}
              onIcon={<Video />}
              offIcon={<VideoOff />}
              label={cameraOn && camera ? "Stop video" : "Start video"}
              caption="Video"
              withLabel
            />
          )}
          {!organizer && (
            <>
              {/* No Record / Stop (owner 2026-10-05): a reporter's recording runs from joining until they leave or it ends. */}
              <RoundButton
                onClick={canSpeak ? doneSpeaking : hand ? () => setHand(false) : askToSpeak}
                label={canSpeak ? "Done speaking" : hand ? "Cancel request to speak" : "Ask to speak"}
                caption={canSpeak ? "Done" : hand ? "Asked" : "Ask"}
                active={hand || canSpeak}
                withLabel
              >
                {canSpeak ? <Check /> : <Hand />}
              </RoundButton>
            </>
          )}
          <RoundButton
            onClick={() => setPanel((p) => (p === "chat" ? null : "chat"))}
            label={panel === "chat" ? "Hide chat" : unread > 0 ? `Chat, ${unread} new` : "Chat"}
            caption="Chat"
            active={panel === "chat"}
            badge={unread}
            withLabel
          >
            <MessageSquare />
          </RoundButton>
          {/* Phones reach the notes from the panel's tabs: the bar keeps room for Video. */}
          <RoundButton
            onClick={() => setPanel((p) => (p === "notes" ? null : "notes"))}
            label={panel === "notes" ? "Hide notes" : "Notes"}
            caption="Notes"
            active={panel === "notes"}
            withLabel
            className="max-sm:hidden"
          >
            <NotebookPen />
          </RoundButton>
          {organizer ? (
            <RoundButton onClick={() => setConfirmEnd(true)} label="End" danger withLabel>
              <Square className="fill-current" />
            </RoundButton>
          ) : (
            <RoundButton
              onClick={async () => {
                if (recorderRef.current) await toggleRecording();
                router.replace(`/press-meet/${meet.id}`);
              }}
              label="Leave"
              danger
              withLabel
            >
              <LogOut />
            </RoundButton>
          )}
        </div>
      </nav>

      <Modal
        open={confirmEnd}
        onOpenChange={setConfirmEnd}
        title="End the press meet for everyone?"
        description="Reporters leave the room and can start sending you their stories. To step out without ending it, use the back arrow."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmEnd(false)}>
              Keep it going
            </Button>
            <Button onClick={() => end.mutate()} loading={end.isPending}>
              End press meet
            </Button>
          </>
        }
      />
    </>
  );
}

/* ─────────────── Pieces ─────────────── */

/** The browser wants a tap before playing sound (not just a play() interrupted by a new stream). */
function isAutoplayBlock(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotAllowedError";
}

/** Plays a stream (video + its audio, or audio only). Reports when the browser blocks sound until a tap. */
function MediaView({
  stream,
  muted = false,
  className,
  videoRef,
  onBlocked,
}: {
  stream: MediaStream | null;
  muted?: boolean;
  className?: string;
  videoRef?: { current: HTMLVideoElement | null };
  onBlocked?: () => void;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  // `onBlocked` is a stable callback (useCallback in the room).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    if (stream) void el.play().catch((error: unknown) => isAutoplayBlock(error) && onBlocked?.());
  }, [stream, onBlocked]);
  return (
    <video
      ref={(el) => {
        ref.current = el;
        if (videoRef) videoRef.current = el;
      }}
      data-pm-media=""
      autoPlay
      playsInline
      muted={muted}
      className={className}
    />
  );
}

/** `muted`: a reporter whose mic the room hasn't allowed (owner 2026-10-05: they speak only once the organizer accepts). */
function AudioSink({ stream, muted = false, onBlocked }: { stream: MediaStream; muted?: boolean; onBlocked?: () => void }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    void el.play().catch((error: unknown) => isAutoplayBlock(error) && onBlocked?.());
  }, [stream, onBlocked]);
  return <audio ref={ref} data-pm-media="" autoPlay muted={muted} className="hidden" />;
}

type TileData = {
  key: string;
  info: PressMeetPeer;
  stream: MediaStream | null;
  remote?: RemotePeer;
  self?: boolean;
  /** The organizer's tile. */
  host?: boolean;
  /** The organizer hasn't connected yet. */
  waiting?: boolean;
};

/**
 * Tiles in rows and columns that fill the space (owner 2026-10-05, like Google Meet): up to 2 columns on phones, up to 4
 * on wide screens; past a few rows the grid scrolls instead of shrinking the faces.
 */
function TileGrid({ count, children }: { count: number; children: ReactNode }) {
  const wide = useMediaQuery("(min-width: 640px)");
  const cols = wide ? (count <= 1 ? 1 : count <= 4 ? 2 : count <= 9 ? 3 : 4) : count <= 2 ? 1 : 2;
  const rows = Math.max(1, Math.ceil(count / cols));
  return (
    <div
      className="no-scrollbar grid size-full gap-2 overflow-y-auto"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(${wide ? 150 : 120}px, 1fr))` }}
    >
      {children}
    </div>
  );
}

/**
 * One person's tile: their video while their camera's on (the organizer's picture always — it shows their photo card
 * with the WebNEWS mark when their camera's off), else their photo; name, muted mic, raised hand, REC, and a red ring
 * while they speak. Muted: the sound plays from the room's own players.
 */
function VideoTile({
  info,
  stream,
  remote,
  self = false,
  host = false,
  waiting = false,
  speaking: speakingOverride,
  videoRef,
  canMute = false,
  onMute,
  onAccept,
}: {
  info: PressMeetPeer;
  stream: MediaStream | null;
  remote?: RemotePeer;
  self?: boolean;
  host?: boolean;
  waiting?: boolean;
  speaking?: boolean;
  videoRef?: { current: HTMLVideoElement | null };
  /** The organizer's view of a reporter: Accept their request to speak, Mute them while they may speak. */
  canMute?: boolean;
  onMute?: () => void;
  onAccept?: () => void;
}) {
  const remoteSpeaking = useSpeaking(remote?.stream ?? null, !self && info.micOn);
  const speaking = (speakingOverride ?? remoteSpeaking) && info.micOn;
  const connected = self || remote?.state === "connected";
  const hasVideo = stream !== null && stream.getVideoTracks().length > 0;
  const showVideo = hasVideo && connected && (host || info.cameraOn);
  return (
    <div
      className={cn(
        "relative flex min-h-0 items-center justify-center overflow-hidden rounded-2xl bg-[#1a1d23] ring-1 ring-white/8 transition-shadow",
        speaking && "ring-2 ring-brand shadow-[0_0_18px_rgb(227_6_19/0.45)]",
        !speaking && info.hand && "ring-2 ring-brand/60",
      )}
    >
      {showVideo ? (
        <MediaView
          stream={stream}
          muted
          videoRef={videoRef}
          className={cn("size-full", host ? "object-contain" : "object-cover", self && !host && "-scale-x-100")}
        />
      ) : (
        <div className="flex flex-col items-center gap-2 p-3 text-center">
          <Avatar src={info.user.image} name={info.user.name} size={72} decorative />
          {waiting ? (
            <p className="flex items-center gap-2 text-xs text-white/60">
              <Loader2 aria-hidden className="size-3.5 animate-spin" />
              Waiting for the organizer to connect…
            </p>
          ) : (
            !connected && (
              <p className="flex items-center gap-2 text-xs text-white/60">
                <Loader2 aria-hidden className="size-3.5 animate-spin" />
                Connecting…
              </p>
            )
          )}
        </div>
      )}
      {info.hand && (
        <span className="absolute left-2 top-2 flex size-7 items-center justify-center rounded-full bg-brand shadow-pop">
          <Hand aria-label="Hand raised" className="size-4" />
        </span>
      )}
      {info.recording && (
        <span className="absolute right-2 top-2 rounded bg-brand px-1.5 py-0.5 text-[0.625rem] font-black tracking-wider">REC</span>
      )}
      <span className="absolute bottom-2 left-2 flex max-w-[80%] items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs font-bold backdrop-blur">
        {!info.micOn && <MicOff aria-label="Muted" className="size-3.5 shrink-0 text-brand" />}
        <span className="truncate">{self ? "You" : info.user.name}</span>
        {host && <span className="shrink-0 rounded bg-brand px-1 py-px text-[0.5625rem] font-black uppercase tracking-wider">Organizer</span>}
      </span>
      {canMute && info.hand && !info.canSpeak ? (
        <button
          type="button"
          onClick={onAccept}
          aria-label={`Let ${info.user.name} speak`}
          className="absolute bottom-2 right-2 rounded-full bg-brand px-2.5 py-1 text-[0.6875rem] font-bold hover:bg-brand-hover"
        >
          Let speak
        </button>
      ) : (
        canMute &&
        info.canSpeak && (
          <button
            type="button"
            onClick={onMute}
            aria-label={`Mute ${info.user.name}`}
            className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2.5 py-1 text-[0.6875rem] font-bold backdrop-blur hover:bg-black/80"
          >
            Mute
          </button>
        )
      )}
    </div>
  );
}

/** A row of the People panel (their sound plays from the room's own players, not here). */
function PersonTile({
  peer,
  remote,
  self = false,
  speakingOverride,
  canMute = false,
  onMute,
  onAnswer,
}: {
  peer: PressMeetPeer;
  remote?: RemotePeer;
  self?: boolean;
  speakingOverride?: boolean;
  canMute?: boolean;
  onMute?: () => void;
  onAnswer?: (allow: boolean) => void;
}) {
  const remoteSpeaking = useSpeaking(remote?.stream ?? null, !self && peer.micOn);
  const speaking = speakingOverride ?? remoteSpeaking;
  const connecting = remote && remote.state !== "connected";
  return (
    <li
      className={cn(
        "relative flex shrink-0 items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5 ring-1 ring-white/8",
        peer.hand && "bg-brand/15 ring-brand/50",
      )}
    >
      <span className={cn("relative rounded-full p-0.5 transition-shadow", speaking && peer.micOn && "shadow-[0_0_0_2px_#e30613,0_0_14px_rgb(227_6_19/0.6)]")}>
        <Avatar src={peer.user.image} name={peer.user.name} size={44} decorative />
        {peer.hand && (
          <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-brand ring-2 ring-[#0b0d11]">
            <Hand aria-label="Hand raised" className="size-3" />
          </span>
        )}
      </span>
      <span className="flex min-w-0 max-w-full flex-1 flex-col items-start">
        <span className="max-w-full truncate text-sm font-bold">{self ? "You" : peer.user.name}</span>
        <span className="flex items-center gap-1.5 text-[0.6875rem] text-white/55">
          {peer.micOn ? <Mic aria-label="Mic on" className="size-3 text-white" /> : <MicOff aria-label="Muted" className="size-3" />}
          {peer.hand && !peer.canSpeak && <span className="font-semibold text-white">asks to speak</span>}
          {peer.role === "reporter" && peer.canSpeak && <span className="font-semibold text-success">may speak</span>}
          {peer.recording && <span className="rounded bg-brand px-1 text-[0.5625rem] font-black tracking-wider text-white">REC</span>}
          {connecting && <span>connecting…</span>}
        </span>
      </span>
      {canMute && peer.hand && !peer.canSpeak ? (
        <AnswerButtons name={peer.user.name} onAnswer={(allow) => onAnswer?.(allow)} />
      ) : (
        canMute &&
        peer.canSpeak && (
          <button
            type="button"
            onClick={onMute}
            className="rounded-full bg-white/10 px-2.5 py-1 text-[0.6875rem] font-bold hover:bg-white/20"
            aria-label={`Mute ${peer.user.name}`}
          >
            Mute
          </button>
        )
      )}
    </li>
  );
}

/** Accept / Decline for one request to speak. */
function AnswerButtons({ name, onAnswer }: { name: string; onAnswer: (allow: boolean) => void }) {
  return (
    <span className="flex shrink-0 gap-1.5">
      <button
        type="button"
        onClick={() => onAnswer(false)}
        aria-label={`Decline ${name}'s request to speak`}
        className="flex size-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
      >
        <X aria-hidden className="size-4" />
      </button>
      <button
        type="button"
        onClick={() => onAnswer(true)}
        aria-label={`Let ${name} speak`}
        className="flex h-8 items-center gap-1 rounded-full bg-brand px-3 text-xs font-bold hover:bg-brand-hover"
      >
        <Check aria-hidden className="size-3.5" />
        Accept
      </button>
    </span>
  );
}

/** The organizer's waiting requests to speak, over the top of the grid (the first few; the People panel lists all). */
function SpeakRequests({ requests, onAnswer }: { requests: RemotePeer[]; onAnswer: (peerId: string, allow: boolean) => void }) {
  const shown = requests.slice(0, 3);
  return (
    <div role="region" aria-label="Requests to speak" className="absolute inset-x-2 top-2 z-10 mx-auto flex max-w-md flex-col gap-1.5">
      {shown.map((peer) => (
        <div key={peer.info.peerId} className="flex items-center gap-2.5 rounded-2xl bg-black/80 py-1.5 pl-1.5 pr-1.5 shadow-pop ring-1 ring-white/10 backdrop-blur">
          <Avatar src={peer.info.user.image} name={peer.info.user.name} size={32} decorative />
          <span className="min-w-0 flex-1 text-sm">
            <span className="block truncate font-bold">{peer.info.user.name}</span>
            <span className="flex items-center gap-1 text-[0.6875rem] text-white/60">
              <Hand aria-hidden className="size-3 text-brand" />
              asks to speak
            </span>
          </span>
          <AnswerButtons name={peer.info.user.name} onAnswer={(allow) => onAnswer(peer.info.peerId, allow)} />
        </div>
      ))}
      {requests.length > shown.length && (
        <span className="mx-auto rounded-full bg-black/70 px-2.5 py-0.5 text-[0.6875rem] font-semibold">
          +{requests.length - shown.length} more in People
        </span>
      )}
    </div>
  );
}

function RoundToggle({
  on,
  onClick,
  disabled,
  onIcon,
  offIcon,
  label,
  caption,
  busy,
  withLabel,
}: {
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
  onIcon: ReactNode;
  offIcon: ReactNode;
  label: string;
  caption?: string;
  busy?: boolean;
  withLabel?: boolean;
}) {
  return (
    <RoundButton onClick={onClick} disabled={disabled} label={label} caption={caption} busy={busy} off={!on} withLabel={withLabel}>
      {on ? onIcon : offIcon}
    </RoundButton>
  );
}

function RoundButton({
  onClick,
  label,
  children,
  disabled,
  off,
  active,
  danger,
  busy,
  caption,
  withLabel,
  badge = 0,
  className,
}: {
  onClick: () => void;
  label: string;
  className?: string;
  /** Shorter text under the button (defaults to the label). */
  caption?: string;
  /** A red count on the corner (unread chat messages). */
  badge?: number;
  children: ReactNode;
  disabled?: boolean;
  /** A switched-off mic / camera: red. */
  off?: boolean;
  /** A raised hand / running recording: white. */
  active?: boolean;
  danger?: boolean;
  busy?: boolean;
  withLabel?: boolean;
}) {
  return (
    <span className={cn("relative flex flex-col items-center gap-1.5", className)}>
      {badge > 0 && (
        <span
          aria-hidden
          className="pointer-events-none absolute -top-1 -right-1 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[0.6875rem] font-bold text-white ring-2 ring-[#0b0d11]"
        >
          {badge > 9 ? "9+" : badge}
        </span>
      )}
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || busy}
        aria-label={label}
        aria-pressed={active ?? (off === undefined ? undefined : !off)}
        className={cn(
          // Narrow phones fit six buttons (with Chat) on one line.
          "flex size-13 items-center justify-center rounded-full transition-[background-color,transform] active:scale-95 disabled:opacity-40 max-[379px]:size-11 sm:size-14 [&_svg]:size-5.5",
          danger
            ? "bg-brand text-white hover:bg-brand-hover"
            : off
              ? "bg-brand/90 text-white hover:bg-brand"
              : active
                ? "bg-white text-[#0b0d11]"
                : "bg-white/10 text-white hover:bg-white/18",
        )}
      >
        {busy ? <Loader2 className="animate-spin" /> : children}
      </button>
      {withLabel && <span className="whitespace-nowrap text-[0.6875rem] font-semibold text-white/65">{caption ?? label}</span>}
    </span>
  );
}
