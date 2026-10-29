CREATE TABLE "user_accounts" (
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	CONSTRAINT "user_accounts_user_id_account_id_pk" PRIMARY KEY("user_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text NOT NULL,
	"is_owner" boolean DEFAULT false NOT NULL,
	"all_accounts" boolean DEFAULT false NOT NULL,
	"session_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_role_check" CHECK ("users"."role" in ('admin', 'write', 'read'))
);
--> statement-breakpoint
ALTER TABLE "user_accounts" ADD CONSTRAINT "user_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_accounts" ADD CONSTRAINT "user_accounts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_accounts_account_idx" ON "user_accounts" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_key" ON "users" USING btree ("username");