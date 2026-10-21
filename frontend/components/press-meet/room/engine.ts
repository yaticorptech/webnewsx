import { api } from "@/lib/api";
import type { PressMeetPeer, PressMeetRoom, PressMeetSignal } from "@/lib/shared/contracts";

export type RemotePeer = {
  info: PressMeetPeer;
  /** Their incoming audio + video. A new stream object after each reconnect. */
  stream: MediaStream;
  state: RTCPeerConnectionState | "new";
};

export type LocalMedia = {
  /** Mic (null when the person has no mic or refused it — they can still listen). */
  audio: MediaStreamTrack | null;
  /** Outgoing video: the organizer's composited camera (with the WebNEWS mark) or a reporter's own camera; null = none yet. */
  video: MediaStreamTrack | null;
};

/**
 * Video per connection: everyone sends to everyone (no server in between), so the more people, the less each copy
 * gets. The organizer's picture is the main one; reporters' cameras stay small.
 */
function videoBitrate(role: "organizer" | "reporter", peers: number): number {
  if (role === "organizer") return peers <= 3 ? 900_000 : peers <= 6 ? 650_000 : 450_000;
  return peers <= 3 ? 350_000 : peers <= 6 ? 250_000 : 180_000;
}

/**
 * The press meet room's WebRTC (owner 2026-10-01): every participant connects to every other one. Whoever joins
 * sends offers to everyone already there (so two people never offer to each other at once, except when they join at
 * the same moment — then the lower tab id wins). Audio and video go both ways for everyone (owner 2026-10-05: every
 * face on screen, like Google Meet). Mic and camera switches just enable / disable tracks, and a mic or camera turned on
 * later replaces an empty sender, so connections never need renegotiating. Signals travel through the API
 * (`POST …/room/signal`) and come back on the live stream (`meet.signal`).
 */
export class RoomEngine {
  readonly peers = new Map<string, RemotePeer>();
  private readonly connections = new Map<string, RTCPeerConnection>();
  private readonly pendingCandidates = new Map<string, RTCIceCandidateInit[]>();
  private readonly stream: MediaStream;
  private closed = false;

  constructor(
    private readonly meetId: string,
    readonly peerId: string,
    private readonly role: "organizer" | "reporter",
    private readonly iceServers: PressMeetRoom["iceServers"],
    private local: LocalMedia,
    private readonly onChange: () => void,
  ) {
    this.stream = new MediaStream([local.audio, local.video].filter((t): t is MediaStreamTrack => t !== null));
  }

  /** The people already in the room when we joined: we call each of them. */
  connectAll(peers: PressMeetPeer[]): void {
    for (const info of peers) {
      if (info.peerId === this.peerId) continue;
      this.upsert(info);
      void this.call(info.peerId);
    }
    this.onChange();
  }

  /** One room event from the live stream. */
  async handle(signal: PressMeetSignal): Promise<void> {
    if (this.closed || signal.from === this.peerId) return;
    if (signal.to !== null && signal.to !== this.peerId) return;
    try {
      switch (signal.kind) {
        case "peer-joined":
        case "state":
          this.upsert(signal.data);
          this.onChange();
          return;
        case "peer-left":
          this.drop(signal.from);
          return;
        case "offer":
          await this.answer(signal.from, signal.data as unknown as RTCSessionDescriptionInit);
          return;
        case "answer": {
          const pc = this.connections.get(signal.from);
          if (pc && pc.signalingState === "have-local-offer") {
            await pc.setRemoteDescription(signal.data as unknown as RTCSessionDescriptionInit);
            await this.flushCandidates(signal.from, pc);
          }
          return;
        }
        case "candidate": {
          const pc = this.connections.get(signal.from);
          const candidate = signal.data as RTCIceCandidateInit;
          if (pc?.remoteDescription) await pc.addIceCandidate(candidate).catch(() => {});
          else this.pendingCandidates.set(signal.from, [...(this.pendingCandidates.get(signal.from) ?? []), candidate]);
          return;
        }
        default:
          return;
      }
    } catch (error) {
      console.warn("[press-meet] signal failed:", signal.kind, error);
    }
  }

  private upsert(info: PressMeetPeer): void {
    const current = this.peers.get(info.peerId);
    this.peers.set(info.peerId, current ? { ...current, info } : { info, stream: new MediaStream(), state: "new" });
  }

  private drop(peerId: string): void {
    this.connections.get(peerId)?.close();
    this.connections.delete(peerId);
    this.pendingCandidates.delete(peerId);
    this.peers.delete(peerId);
    this.onChange();
  }

  private send(to: string, kind: "offer" | "answer" | "candidate", data: object): void {
    void api.pressMeets.signal(this.meetId, { from: this.peerId, to, kind, data: data as Record<string, unknown> }).catch(() => {});
  }

  private createConnection(peerId: string): RTCPeerConnection {
    this.connections.get(peerId)?.close();
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.connections.set(peerId, pc);
    const peer = this.peers.get(peerId);
    if (peer) this.peers.set(peerId, { ...peer, stream: new MediaStream(), state: "new" });

    pc.onicecandidate = (event) => {
      if (event.candidate) this.send(peerId, "candidate", event.candidate.toJSON());
    };
    pc.ontrack = (event) => {
      const current = this.peers.get(peerId);
      if (!current || this.connections.get(peerId) !== pc) return;
      const stream = new MediaStream([...current.stream.getTracks().filter((t) => t.kind !== event.track.kind), event.track]);
      this.peers.set(peerId, { ...current, stream });
      this.onChange();
    };
    pc.onconnectionstatechange = () => {
      if (this.connections.get(peerId) !== pc) return;
      const current = this.peers.get(peerId);
      if (current) this.peers.set(peerId, { ...current, state: pc.connectionState });
      if (pc.connectionState === "connected") this.limitVideo();
      // A dropped connection is called again by the lower tab id (the other side answers).
      if (pc.connectionState === "failed" && this.peerId < peerId) void this.call(peerId);
      this.onChange();
    };
    return pc;
  }

  private attachLocal(pc: RTCPeerConnection): void {
    // Audio and video always both ways, even without a mic / camera yet: one can be attached later (setAudioTrack /
    // setVideoTrack) without renegotiating.
    pc.addTransceiver(this.local.audio ?? "audio", { direction: "sendrecv", streams: [this.stream] });
    pc.addTransceiver(this.local.video ?? "video", { direction: "sendrecv", streams: [this.stream] });
  }

  /** We offer (we joined after them, or we're re-calling a dropped connection). */
  private async call(peerId: string): Promise<void> {
    const info = this.peers.get(peerId)?.info;
    if (!info || this.closed) return;
    const pc = this.createConnection(peerId);
    this.attachLocal(pc);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.send(peerId, "offer", pc.localDescription!.toJSON());
  }

  /** They offer: answer with our mic and camera on the matching lines. */
  private async answer(peerId: string, offer: RTCSessionDescriptionInit): Promise<void> {
    const existing = this.connections.get(peerId);
    // Both offered at once: the lower tab id keeps its own offer; the other side answers it.
    if (existing?.signalingState === "have-local-offer" && this.peerId < peerId) return;
    if (!this.peers.has(peerId)) return; // not (yet) known as in the room — they'll be announced first
    const pc = this.createConnection(peerId);
    await pc.setRemoteDescription(offer);
    for (const transceiver of pc.getTransceivers()) {
      const kind = transceiver.receiver.track.kind;
      const track = kind === "audio" ? this.local.audio : this.local.video;
      // Lines stay two-way without a mic / camera too, so one can be attached later.
      if (track) await transceiver.sender.replaceTrack(track);
      transceiver.sender.setStreams?.(this.stream);
      transceiver.direction = "sendrecv";
    }
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    this.send(peerId, "answer", pc.localDescription!.toJSON());
    await this.flushCandidates(peerId, pc);
  }

  private async flushCandidates(peerId: string, pc: RTCPeerConnection): Promise<void> {
    const queued = this.pendingCandidates.get(peerId) ?? [];
    this.pendingCandidates.delete(peerId);
    for (const candidate of queued) await pc.addIceCandidate(candidate).catch(() => {});
  }

  /** Caps our video per connection so the upload holds up with many people in the room. */
  private limitVideo(): void {
    const bitrate = videoBitrate(this.role, this.connections.size);
    for (const connection of this.connections.values()) {
      const sender = connection.getSenders().find((s) => s.track?.kind === "video");
      if (!sender) continue;
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) continue;
      params.encodings[0]!.maxBitrate = bitrate;
      void sender.setParameters(params).catch(() => {});
    }
  }

  /** A mic turned on after joining (the first Unmute asks for it): sent on every connection, no renegotiation. */
  setAudioTrack(track: MediaStreamTrack): void {
    const previous = this.local.audio;
    if (previous) this.stream.removeTrack(previous);
    this.stream.addTrack(track);
    this.local = { ...this.local, audio: track };
    for (const pc of this.connections.values()) {
      for (const transceiver of pc.getTransceivers()) {
        if (transceiver.receiver.track.kind === "audio") void transceiver.sender.replaceTrack(track).catch(() => {});
      }
    }
  }

  /** A camera turned on after joining (no camera in the lobby): sent on every connection, no renegotiation. */
  setVideoTrack(track: MediaStreamTrack): void {
    const previous = this.local.video;
    if (previous) this.stream.removeTrack(previous);
    this.stream.addTrack(track);
    this.local = { ...this.local, video: track };
    for (const pc of this.connections.values()) {
      for (const transceiver of pc.getTransceivers()) {
        if (transceiver.receiver.track.kind === "video") void transceiver.sender.replaceTrack(track).catch(() => {});
      }
    }
    this.limitVideo();
  }

  close(): void {
    this.closed = true;
    for (const pc of this.connections.values()) pc.close();
    this.connections.clear();
    this.peers.clear();
    this.pendingCandidates.clear();
  }
}
