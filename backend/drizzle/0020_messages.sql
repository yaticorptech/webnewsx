CREATE TABLE "community_invite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"inviter_id" text,
	"invitee_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "community_invite_status_valid" CHECK ("community_invite"."status" in ('pending', 'accepted', 'declined'))
);
--> statement-breakpoint
CREATE TABLE "conversation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"name" text,
	"description" text,
	"image" text,
	"visibility" text,
	"created_by" text,
	"direct_key" text,
	"last_message_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_direct_key_unique" UNIQUE("direct_key"),
	CONSTRAINT "conversation_kind_valid" CHECK ("conversation"."kind" in ('direct', 'group', 'community')),
	CONSTRAINT "conversation_visibility_valid" CHECK (("conversation"."kind" = 'community') = ("conversation"."visibility" is not null)),
	CONSTRAINT "conversation_direct_key" CHECK (("conversation"."kind" = 'direct') = ("conversation"."direct_key" is not null)),
	CONSTRAINT "conversation_community_name" CHECK ("conversation"."kind" <> 'community' or "conversation"."name" is not null),
	CONSTRAINT "conversation_name_length" CHECK (char_length("conversation"."name") <= 60),
	CONSTRAINT "conversation_description_length" CHECK (char_length("conversation"."description") <= 300)
);
--> statement-breakpoint
CREATE TABLE "conversation_member" (
	"conversation_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_read_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"cleared_at" timestamp (3) with time zone,
	"joined_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_member_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id"),
	CONSTRAINT "conversation_member_role_valid" CHECK ("conversation_member"."role" in ('owner', 'admin', 'member')),
	CONSTRAINT "conversation_member_status_valid" CHECK ("conversation_member"."status" in ('active', 'request'))
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_id" text,
	"kind" text NOT NULL,
	"body" text,
	"article_id" uuid,
	"profile_id" text,
	"event" text,
	"target_id" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_kind_valid" CHECK ("message"."kind" in ('text', 'article', 'profile', 'system')),
	CONSTRAINT "message_body_length" CHECK (char_length("message"."body") <= 2000),
	CONSTRAINT "message_system_event" CHECK (("message"."kind" = 'system') = ("message"."event" is not null))
);
--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "conversation_id" uuid;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "invite_id" uuid;--> statement-breakpoint
ALTER TABLE "community_invite" ADD CONSTRAINT "community_invite_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_invite" ADD CONSTRAINT "community_invite_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_invite" ADD CONSTRAINT "community_invite_invitee_id_user_id_fk" FOREIGN KEY ("invitee_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_member" ADD CONSTRAINT "conversation_member_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_member" ADD CONSTRAINT "conversation_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_sender_id_user_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_article_id_article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."article"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_profile_id_user_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_target_id_user_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "community_invite_pending_unique" ON "community_invite" USING btree ("conversation_id","invitee_id") WHERE "community_invite"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "community_invite_invitee_idx" ON "community_invite" USING btree ("invitee_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "conversation_community_idx" ON "conversation" USING btree ("visibility","last_message_at" DESC NULLS LAST) WHERE "conversation"."kind" = 'community';--> statement-breakpoint
CREATE INDEX "conversation_member_user_idx" ON "conversation_member" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "message_conversation_created_idx" ON "message" USING btree ("conversation_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_invite_id_community_invite_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."community_invite"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_message_unique" ON "notification" USING btree ("user_id","conversation_id") WHERE "notification"."read_at" is null and "notification"."type" = 'message';